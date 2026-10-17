import { useCallback, useEffect, useRef, useState } from 'react';
import { Footer, Intro, Toast, TopBar } from './components/Chrome';
import { Controls } from './components/Controls';
import { Examples } from './components/Examples';
import { Guide } from './components/Guide';
import { Race } from './components/Race';
import { Graph, IterTable, RootCard } from './components/Stage';
import { engine } from './lib/engine';
import { METHODS, METHOD_ALIASES, defaultValues, isBracketed, type Values } from './lib/meta';
import type { MethodId } from './lib/methods';
import { buildRun, type FieldErrors, type Settings } from './lib/solve';

type Theme = 'light' | 'dark';

function readUrl() {
  const q = new URLSearchParams(location.search);
  const method = METHOD_ALIASES[(q.get('method') || location.hash.slice(1) || '').toLowerCase()] ?? 'bisection';
  const values = defaultValues();
  if (q.get('f')) {
    const v: Values = { fx: q.get('f')! };
    for (const fd of METHODS[method].fields) v[fd.key] = q.get(fd.key) ?? '';
    values[method] = v;
  }
  return { method, values, settings: { tol: q.get('tol') ?? '', maxIter: q.get('n') ?? '' } };
}

function writeUrl(method: MethodId, v: Values, st: Settings) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('method', method);
  url.searchParams.set('f', v.fx);
  for (const fd of METHODS[method].fields) url.searchParams.set(fd.key, v[fd.key] ?? '');
  if (st.tol.trim()) url.searchParams.set('tol', st.tol.trim());
  if (st.maxIter.trim()) url.searchParams.set('n', st.maxIter.trim());
  history.replaceState(null, '', url);
}

function useTheme(): [Theme, () => void] {
  const sys = () => (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || sys());
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => {
      if (!document.documentElement.dataset.theme) setTheme(sys());
    };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage unavailable */
    }
    setTheme(next);
  };
  return [theme, toggle];
}

/** Round a picked location to something that reads nicely in an input. */
const nice = (v: number) => String(parseFloat(v.toPrecision(4)));

export default function App() {
  const [init] = useState(readUrl);
  const [method, setMethod] = useState<MethodId>(init.method);
  const [values, setValues] = useState(init.values);
  const [settings, setSettings] = useState<Settings>(init.settings);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [activeExample, setActiveExample] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1800);
  }, []);

  const solve = useCallback((m: MethodId, v: Values, st: Settings = settingsRef.current) => {
    const { run, errors } = buildRun(m, v, st);
    setErrors(errors ?? {});
    if (run) {
      engine.load(run);
      writeUrl(m, v, st);
    }
    return !!run;
  }, []);

  // first solve once the canvas has mounted
  useEffect(() => {
    const t = setTimeout(() => solve(init.method, init.values[init.method]), 300);
    return () => clearTimeout(t);
  }, [solve, init]);

  const scrollToWorkspace = () => document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // on phones the graph sits below the controls, so bring it into view after solving
  const narrow = () => matchMedia('(max-width: 1100px)').matches;
  const revealGraph = () => {
    // wait for React to re-render the controls (their height can change) before measuring
    if (narrow()) setTimeout(() => document.getElementById('graph')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const load = (m: MethodId, v: Values, scroll = true) => {
    setMethod(m);
    setValues((prev) => ({ ...prev, [m]: { ...v } }));
    solve(m, v);
    if (scroll) {
      if (narrow()) revealGraph();
      else scrollToWorkspace();
    }
  };

  const selectMethod = (m: MethodId) => {
    setMethod(m);
    setActiveExample(null);
    solve(m, values[m]);
  };

  const onPickRoot = useCallback(
    (x: number) => {
      const span = engine.span;
      const v: Values = { ...values[method] };
      if (isBracketed(METHODS[method])) {
        v.a = nice(x - span * 0.06);
        v.b = nice(x + span * 0.06);
      } else if (method === 'secant') {
        v.x0 = nice(x - span * 0.08);
        v.x1 = nice(x + span * 0.08);
      } else if (method === 'muller') {
        v.x0 = nice(x - span * 0.1);
        v.x1 = nice(x + span * 0.04);
        v.x2 = nice(x + span * 0.12);
      } else {
        v.x0 = nice(x + span * 0.08);
      }
      setActiveExample(null);
      load(method, v, false);
      toast('Solving near that root');
    },
    [method, values],
  );

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], button, a')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        engine.toggle();
      } else if (e.key === 'ArrowRight') engine.next();
      else if (e.key === 'ArrowLeft') engine.prev();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <TopBar theme={theme} onToggleTheme={toggleTheme} />

      <main className="shell">
        <Intro
          onLoad={(ex) => {
            setActiveExample(ex.id);
            load(ex.method, ex.values);
          }}
        />

        <div className="layout" id="workspace">
          <Controls
            method={method}
            onMethod={selectMethod}
            values={values[method]}
            onValue={(k, val) => {
              setActiveExample(null);
              setValues((prev) => ({ ...prev, [method]: { ...prev[method], [k]: val } }));
              if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest);
            }}
            settings={settings}
            onSettings={(k, val) => {
              setSettings((s) => ({ ...s, [k]: val }));
              if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest);
            }}
            errors={errors}
            onSolve={() => {
              if (solve(method, values[method])) revealGraph();
            }}
            onShare={() => {
              if (!solve(method, values[method])) return;
              navigator.clipboard.writeText(location.href).then(
                () => toast('Link copied'),
                () => toast('Couldn’t access the clipboard'),
              );
            }}
            onPreset={(v) => {
              setActiveExample(null);
              load(method, v, false);
              revealGraph();
            }}
          />
          <section className="stage">
            <Graph theme={theme} onPickRoot={onPickRoot} />
            <div className="results">
              <RootCard theme={theme} toast={toast} />
              <IterTable />
            </div>
          </section>
        </div>

        <Race
          onLoad={(m, v) => {
            setActiveExample(null);
            load(m, v);
          }}
        />
        <Examples
          activeId={activeExample}
          onLoad={(ex) => {
            setActiveExample(ex.id);
            load(ex.method, ex.values);
          }}
        />
        <Guide
          onPick={(m) => {
            selectMethod(m);
            scrollToWorkspace();
          }}
        />
      </main>

      <Footer />
      <Toast message={toastMsg} />
    </>
  );
}
