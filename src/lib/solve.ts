import { SOLVERS, type Fn, type Fns, type MethodId, type Params, type Result } from './methods';
import { METHODS, METHOD_ORDER, isBracketed, type Values } from './meta';
import { compileFn, parseNum } from './parse';

export interface Run extends Result {
  id: number;
  /** the expression as typed */
  src: string;
  method: MethodId;
  kind: 'f' | 'g';
  fns: Fns;
  params: Params;
  tol: number;
  maxIter: number;
  bracket?: { a: number; b: number };
  overview: { xa: number; xb: number; ys: number[] };
  minHalf: number;
}

export interface Settings {
  tol: string;
  maxIter: string;
}

export type FieldErrors = Record<string, string>;

let runId = 0;

/** Validate inputs and run a solver. Returns either a Run or per-field errors. */
export function buildRun(method: MethodId, values: Values, settings: Settings): { run?: Run; errors?: FieldErrors } {
  const meta = METHODS[method];
  const errors: FieldErrors = {};
  let compiled;
  try {
    compiled = compileFn(values.fx ?? '');
  } catch (e) {
    errors.fx = (e as Error).message;
  }
  const params: Params = {};
  for (const fd of meta.fields) {
    try {
      params[fd.key] = parseNum(values[fd.key], fd.label);
    } catch (e) {
      errors[fd.key] = (e as Error).message;
    }
  }
  let tol = 1e-6;
  let maxIter = 50;
  try {
    if (settings.tol.trim()) tol = parseNum(settings.tol, 'Tolerance');
    if (tol <= 0) throw new Error('Tolerance must be positive.');
  } catch (e) {
    errors.tol = (e as Error).message;
  }
  try {
    if (settings.maxIter.trim()) maxIter = Math.round(parseNum(settings.maxIter, 'Max iterations'));
    if (maxIter < 1 || maxIter > 1000) throw new Error('Use a value from 1 to 1000.');
  } catch (e) {
    errors.maxIter = (e as Error).message;
  }
  if (!compiled || Object.keys(errors).length) return { errors };

  const res = SOLVERS[method](compiled, { ...params }, tol, maxIter);

  const xs: number[] = Object.values(params);
  for (const s of res.steps) xs.push(s.x, s.from ?? NaN, s.a ?? NaN, s.b ?? NaN, s.p0 ?? NaN, s.p1 ?? NaN, s.g1 ?? NaN, s.g2 ?? NaN);
  const good = xs.filter((v) => Number.isFinite(v) && Math.abs(v) < 1e8);
  let xa = Math.min(...good);
  let xb = Math.max(...good);
  if (!(xb - xa > 1e-9)) {
    const c = Number.isFinite(xa) ? xa : 0;
    xa = c - 1;
    xb = c + 1;
  }
  const ys = res.steps
    .slice(0, 2)
    .map((s) => s.ffrom ?? s.q0 ?? NaN)
    .filter(Number.isFinite);

  const run: Run = {
    ...res,
    id: ++runId,
    src: values.fx,
    method,
    kind: meta.kind,
    fns: compiled,
    params,
    tol,
    maxIter,
    overview: { xa, xb, ys },
    minHalf: (xb - xa) / 4000,
  };
  if (isBracketed(meta)) run.bracket = { a: Math.min(params.a, params.b), b: Math.max(params.a, params.b) };
  return { run };
}

// ───────────────────────── Race ─────────────────────────

export interface RaceEntry {
  method: MethodId;
  result: Result;
  note?: string;
  /** inputs that reproduce this entry when loaded into the main view */
  values: Record<string, string>;
}

/** Search outward from x0 for an interval where h changes sign. */
export function findBracket(h: Fn, x0: number): [number, number] | null {
  for (let d = 0.25 * Math.max(1, Math.abs(x0)); d < 1e4; d *= 2) {
    const n = 48;
    let px = x0 - d;
    let py = h(px);
    for (let i = 1; i <= n; i++) {
      const x = x0 - d + (2 * d * i) / n;
      const y = h(x);
      if (Number.isFinite(py) && Number.isFinite(y) && Math.sign(py) !== Math.sign(y)) return [px, x];
      px = x;
      py = y;
    }
  }
  return null;
}

/**
 * Run every method on the same problem. Root-finders work on f(x) (or g(x) − x
 * when the user typed a g), fixed-point methods on g(x) (or x − f(x)).
 */
export function race(run: Run): RaceEntry[] {
  const { fns, kind, params, tol, maxIter } = run;
  const base: Fns =
    kind === 'f'
      ? fns
      : { f: (x) => fns.f(x) - x, df: (x) => fns.df(x) - 1, d2f: fns.d2f };
  const gfns: Fns =
    kind === 'g'
      ? fns
      : { f: (x) => x - fns.f(x), df: (x) => 1 - fns.df(x), d2f: (x) => -fns.d2f(x) };

  let a: number;
  let b: number;
  let x0: number;
  let x1: number;
  if (run.bracket) {
    ({ a, b } = run.bracket);
    x0 = (a + b) / 2;
    x1 = b;
  } else {
    x0 = params.x0;
    x1 = params.x1 ?? x0 + 0.1 * Math.max(1, Math.abs(x0));
    const br = findBracket(base.f, x0);
    [a, b] = br ?? [NaN, NaN];
  }
  const cap = Math.max(maxIter, 60);
  const fSrc = kind === 'f' ? run.src : `(${run.src}) - x`;
  const gSrc = kind === 'g' ? run.src : `x - (${run.src})`;
  const out: RaceEntry[] = [];
  for (const m of METHOD_ORDER) {
    const meta = METHODS[m];
    let params: Params;
    let result: Result;
    let note: string;
    if (isBracketed(meta)) {
      params = { a, b };
      result = Number.isFinite(a)
        ? SOLVERS[m](base, { ...params }, tol, cap)
        : { steps: [], root: NaN, status: 'failed', message: 'No sign change found near x₀.' };
      note = `[${fmtShort(a)}, ${fmtShort(b)}]`;
    } else if (meta.family === 'open') {
      if (m === 'secant') params = { x0: run.bracket ? a : x0, x1 };
      else if (m === 'muller') params = run.bracket ? { x0: a, x1: x0, x2: b } : { x0, x1, x2: 2 * x1 - x0 };
      else params = { x0 };
      result = SOLVERS[m](base, { ...params }, tol, cap);
      note = Object.entries(params)
        .map(([k, v]) => `x${'₀₁₂'[+k[1]]} = ${fmtShort(v)}`)
        .join(', ');
    } else {
      params = { x0 };
      result = SOLVERS[m](gfns, { ...params }, tol, cap);
      note = kind === 'f' ? `g(x) = x − f(x), x₀ = ${fmtShort(x0)}` : `x₀ = ${fmtShort(x0)}`;
    }
    const values: Record<string, string> = { fx: meta.kind === 'f' ? fSrc : gSrc };
    for (const [k, v] of Object.entries(params)) values[k] = Number.isFinite(v) ? String(parseFloat(v.toPrecision(10))) : '';
    out.push({ method: m, result, note, values });
  }
  return out;
}

function fmtShort(v: number) {
  return Number.isFinite(v) ? parseFloat(v.toPrecision(4)).toString() : '—';
}

// ───────────────────────── Scan ─────────────────────────

/** Every sign change of h in [x0, x1], refined by bisection. Poles are filtered out. */
export function scanRoots(h: Fn, x0: number, x1: number, samples = 500): number[] {
  const roots: number[] = [];
  let px = x0;
  let py = h(px);
  for (let i = 1; i <= samples; i++) {
    const x = x0 + ((x1 - x0) * i) / samples;
    const y = h(x);
    if (y === 0) {
      roots.push(x);
    } else if (Number.isFinite(py) && Number.isFinite(y) && py !== 0 && Math.sign(py) !== Math.sign(y)) {
      let a = px;
      let b = x;
      let fa = py;
      for (let k = 0; k < 60; k++) {
        const m = (a + b) / 2;
        const fm = h(m);
        if (!Number.isFinite(fm)) break;
        if (Math.sign(fm) === Math.sign(fa)) {
          a = m;
          fa = fm;
        } else b = m;
      }
      const r = (a + b) / 2;
      // a real root has a small residual; a pole’s residual grows as we refine
      if (Math.abs(h(r)) <= Math.max(1e-6, 1e-3 * Math.min(Math.abs(py), Math.abs(y)))) roots.push(r);
    }
    px = x;
    py = y;
  }
  return roots;
}
