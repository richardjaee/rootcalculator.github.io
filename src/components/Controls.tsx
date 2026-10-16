import { AnimatePresence, motion } from 'framer-motion';
import { useDeferredValue, useMemo, useRef, type FormEvent } from 'react';
import { FAMILY_LABEL, METHODS, METHOD_ORDER, type Family, type Values } from '../lib/meta';
import type { MethodId } from '../lib/methods';
import { compileFn, cleanExpr } from '../lib/parse';
import type { FieldErrors, Settings } from '../lib/solve';
import { Arrow, Chevron, Link } from './icons';
import { Tex } from './Tex';

interface Props {
  method: MethodId;
  onMethod: (m: MethodId) => void;
  values: Values;
  onValue: (key: string, value: string) => void;
  settings: Settings;
  onSettings: (key: keyof Settings, value: string) => void;
  errors: FieldErrors;
  onSolve: () => void;
  onShare: () => void;
  onPreset: (v: Values) => void;
}

const FAMILIES: Family[] = ['bracket', 'hybrid', 'open', 'fixed'];

export function Controls(p: Props) {
  const meta = METHODS[p.method];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    p.onSolve();
  };
  return (
    <aside className="panel controls reveal" style={{ ['--d' as string]: '80ms' }}>
      <MethodPicker method={p.method} onMethod={p.onMethod} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={p.method}
          className="method-info"
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
          transition={{ duration: 0.25 }}
        >
          <p className="method-tagline">{meta.tagline}</p>
          <div className="method-formula">
            <Tex tex={meta.tex} display />
          </div>
        </motion.div>
      </AnimatePresence>

      <form onSubmit={submit} autoComplete="off" noValidate>
        <FunctionInput
          label={meta.kind === 'g' ? 'g(x)' : 'f(x)'}
          value={p.values.fx ?? ''}
          onChange={(v) => p.onValue('fx', v)}
          error={p.errors.fx}
          showDerivative={p.method === 'newton' || p.method === 'halley'}
          kind={meta.kind}
        />

        <div className="presets">
          {meta.presets.map((pr, i) => (
            <motion.button
              type="button"
              className="preset"
              key={p.method + pr.fx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => p.onPreset(pr)}
            >
              {pr.fx}
            </motion.button>
          ))}
        </div>

        <div className="field-row" key={p.method}>
          {meta.fields.map((fd) => (
            <Field key={fd.key} id={`p-${fd.key}`} label={fd.label} value={p.values[fd.key] ?? ''} error={p.errors[fd.key]} onChange={(v) => p.onValue(fd.key, v)} />
          ))}
        </div>

        <details className="advanced" open={!!(p.errors.tol || p.errors.maxIter) || undefined}>
          <summary>
            <span>Advanced</span>
            <Chevron size={14} />
          </summary>
          <div className="field-row">
            <Field id="tol" label="Tolerance" placeholder="1e-6" value={p.settings.tol} error={p.errors.tol} onChange={(v) => p.onSettings('tol', v)} />
            <Field id="maxIter" label="Max iterations" placeholder="50" value={p.settings.maxIter} error={p.errors.maxIter} onChange={(v) => p.onSettings('maxIter', v)} />
          </div>
        </details>

        <div className="form-actions">
          <button type="submit" className="btn primary">
            <span>Find root</span>
            <Arrow />
          </button>
          <button type="button" className="btn ghost" onClick={p.onShare} title="Copy a link to this problem">
            <Link />
            <span>Share</span>
          </button>
        </div>
      </form>
    </aside>
  );
}

function MethodPicker({ method, onMethod }: { method: MethodId; onMethod: (m: MethodId) => void }) {
  return (
    <div className="picker" role="tablist" aria-label="Method">
      {FAMILIES.map((fam) => (
        <div className="picker-row" key={fam}>
          <span className="picker-label">{FAMILY_LABEL[fam]}</span>
          <div className="picker-chips">
            {METHOD_ORDER.filter((m) => METHODS[m].family === fam).map((m) => (
              <button key={m} role="tab" aria-selected={m === method} className={m === method ? 'on' : ''} onClick={() => m !== method && onMethod(m)}>
                {m === method && <motion.span layoutId="picker-pill" className="picker-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <span className="picker-text">{METHODS[m].name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field(props: { id: string; label: string; value: string; error?: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <div className={'field' + (props.error ? ' invalid' : '')}>
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="text"
        inputMode="decimal"
        spellCheck={false}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <div className="field-error">{props.error}</div>
    </div>
  );
}

const KEYS: [string, string][] = [
  ['x', 'x'],
  ['^', '^'],
  ['( )', '()'],
  ['sin', 'sin()'],
  ['cos', 'cos()'],
  ['tan', 'tan()'],
  ['eˣ', 'e^()'],
  ['ln', 'log()'],
  ['√', 'sqrt()'],
  ['∛', 'cbrt()'],
  ['|x|', 'abs()'],
  ['π', 'pi'],
  ['e', 'e'],
];

function FunctionInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  showDerivative: boolean;
  kind: 'f' | 'g';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(props.value);
  const preview = useMemo(() => {
    if (!cleanExpr(deferred)) return { tex: '', err: '' };
    try {
      const c = compileFn(deferred);
      let tex = `${props.kind}(x) = ${c.tex}`;
      if (props.showDerivative && c.dtex) tex += `\\qquad ${props.kind}'(x) = ${c.dtex}`;
      return { tex, err: '' };
    } catch (e) {
      return { tex: '', err: (e as Error).message };
    }
  }, [deferred, props.showDerivative, props.kind]);

  const insert = (snippet: string) => {
    const el = ref.current!;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const selected = el.value.slice(start, end);
    // wrap the selection in function calls, otherwise drop the caret inside the parens
    const paren = snippet.indexOf('()');
    const text = paren >= 0 ? snippet.slice(0, paren + 1) + selected + snippet.slice(paren + 1) : snippet;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    const caret = paren >= 0 ? start + paren + 1 + selected.length + (selected ? 1 : 0) : start + text.length;
    props.onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const err = props.error || preview.err;
  return (
    <div className={'field fn-field' + (props.error ? ' invalid' : '')}>
      <label htmlFor="fx">{props.label}</label>
      <input ref={ref} id="fx" type="text" spellCheck={false} placeholder="x^3 - x - 2" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      <div className="keypad" aria-label="Insert into function">
        {KEYS.map(([label, snippet]) => (
          <button type="button" key={label} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(snippet)}>
            {label}
          </button>
        ))}
      </div>
      <div className={'fn-preview' + (preview.err ? ' dim' : '')} aria-live="polite">
        {preview.tex && <Tex tex={preview.tex} />}
      </div>
      <div className="field-error">{err}</div>
    </div>
  );
}
