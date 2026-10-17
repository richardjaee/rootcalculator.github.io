import { useMemo, useState } from 'react';
import { CATEGORIES, EXAMPLES, type Category, type Example } from '../lib/examples';
import { METHODS } from '../lib/meta';
import { compileFn } from '../lib/parse';
import { Section } from './Section';
import { Tex } from './Tex';

export function Examples({ onLoad, activeId }: { onLoad: (ex: Example) => void; activeId: string | null }) {
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return EXAMPLES.filter(
      (e) =>
        (cat === 'all' || e.category === cat) &&
        (!needle || [e.title, e.blurb, e.values.fx, METHODS[e.method].name].some((s) => s.toLowerCase().includes(needle))),
    );
  }, [cat, q]);

  return (
    <Section
      id="examples"
      title="Problems"
      lede="Famous equations, physical laws, and a few functions that break particular methods. Click one to load it."
    >
      <div className="ex-toolbar">
        <div className="ex-cats" role="tablist">
          {CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="ex-search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search problems" />
        </label>
      </div>

      <ol className="ex-list">
        {list.map((ex) => (
          <ExampleRow key={ex.id} ex={ex} num={EXAMPLES.indexOf(ex) + 1} active={ex.id === activeId} onLoad={onLoad} />
        ))}
      </ol>
      {list.length === 0 && <p className="ex-empty">Nothing matches “{q}”.</p>}
    </Section>
  );
}

function ExampleRow({ ex, num, active, onLoad }: { ex: Example; num: number; active: boolean; onLoad: (ex: Example) => void }) {
  const tex = useMemo(() => {
    const kind = METHODS[ex.method].kind;
    try {
      return `${kind}(x) = ${compileFn(ex.values.fx).tex}`;
    } catch {
      return ex.values.fx;
    }
  }, [ex]);
  return (
    <li className={'ex-item' + (active ? ' active' : '')}>
      <button className="ex-row" onClick={() => onLoad(ex)}>
        <span className="ex-num">{num}.</span>
        <span className="ex-body">
          <span className="ex-head">
            <span className="ex-title">{ex.title}</span>
            <span className="ex-method">{METHODS[ex.method].name}</span>
          </span>
          <span className="ex-formula">
            <Tex tex={tex} />
            {ex.answer && <span className="ex-answer"> {ex.answer}</span>}
          </span>
          <span className="ex-blurb">{ex.blurb}</span>
        </span>
      </button>
    </li>
  );
}
