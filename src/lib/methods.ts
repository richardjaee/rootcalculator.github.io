/* Root-finding algorithms. Every solver returns the full iteration history so
   the UI can replay it step by step. */

export type MethodId =
  | 'bisection'
  | 'falsi'
  | 'illinois'
  | 'ridders'
  | 'itp'
  | 'brent'
  | 'newton'
  | 'secant'
  | 'halley'
  | 'muller'
  | 'fixed'
  | 'steffensen';
export type Status = 'converged' | 'maxiter' | 'failed';
export type Fn = (x: number) => number;

export interface Fns {
  f: Fn;
  df: Fn;
  d2f: Fn;
}

export interface Step {
  i: number;
  /** the new estimate produced by this step */
  x: number;
  /** residual shown in the table: f(x), or g(x) − x for fixed-point methods */
  fx: number;
  err: number;
  // bracketing
  a?: number;
  b?: number;
  fa?: number;
  fb?: number;
  // open methods: where the step started
  from?: number;
  ffrom?: number;
  slope?: number;
  curv?: number;
  // secant
  p0?: number;
  q0?: number;
  p1?: number;
  q1?: number;
  // steffensen
  g1?: number;
  g2?: number;
  // ridders: the midpoint it evaluates first
  mid?: number;
  fmid?: number;
  // müller: third point and parabola y = q2 + qb·(x − p2) + qa·(x − p2)²
  p2?: number;
  q2?: number;
  qa?: number;
  qb?: number;
  // brent: which kind of step was taken
  kind?: 'bisection' | 'secant' | 'IQI';
}

export interface Result {
  steps: Step[];
  root: number;
  status: Status;
  message?: string;
}

export type Params = Record<string, number>;
export type Solver = (fns: Fns, params: Params, tol: number, maxIter: number) => Result;

const ok = Number.isFinite;
const HUGE = 1e15;

/**
 * Open methods stop when the step gets tiny, but a tiny step on a flat stretch of f
 * is a stall, not a root. Only call it converged if f is small compared to where we started.
 */
function settle(steps: Step[], x: number, fx: number, f0: number): Result {
  if (fx === 0 || Math.abs(fx) <= 1e-6 * Math.max(1, Math.abs(f0))) return { steps, root: x, status: 'converged' };
  return {
    steps,
    root: x,
    status: 'failed',
    message: `The steps stalled at x ≈ ${fmt(x)}, but f(x) ≈ ${fmt(fx, 3)} is not close to zero. The method got stuck on a flat part of the curve.`,
  };
}

function fail(steps: Step[], message: string): Result {
  return { steps, root: steps.length ? steps[steps.length - 1].x : NaN, status: 'failed', message };
}

function checkBracket(fa: number, fb: number, a: number, b: number, steps: Step[]): Result | null {
  if (!ok(fa) || !ok(fb)) return fail(steps, 'f(x) is undefined at one of the bounds.');
  if (fa === 0) return { steps, root: a, status: 'converged', message: 'The lower bound is already a root.' };
  if (fb === 0) return { steps, root: b, status: 'converged', message: 'The upper bound is already a root.' };
  if (Math.sign(fa) === Math.sign(fb)) {
    return fail(steps, 'f(a) and f(b) have the same sign, so the interval isn’t guaranteed to contain a root. Try a wider bracket.');
  }
  return null;
}

export const bisection: Solver = ({ f }, { a, b }, tol, maxIter) => {
  const steps: Step[] = [];
  if (a > b) [a, b] = [b, a];
  let fa = f(a);
  const early = checkBracket(fa, f(b), a, b, steps);
  if (early) return early;
  for (let i = 1; i <= maxIter; i++) {
    const p = a + (b - a) / 2;
    const fp = f(p);
    if (!ok(fp)) return fail(steps, `f(x) is undefined at x = ${fmt(p)}.`);
    const err = (b - a) / 2;
    steps.push({ i, a, b, x: p, fx: fp, err });
    if (fp === 0 || err < tol) return { steps, root: p, status: 'converged' };
    if (Math.sign(fa) === Math.sign(fp)) {
      a = p;
      fa = fp;
    } else {
      b = p;
    }
  }
  return { steps, root: steps[steps.length - 1].x, status: 'maxiter' };
};

export const falsi: Solver = ({ f }, { a, b }, tol, maxIter) => {
  const steps: Step[] = [];
  if (a > b) [a, b] = [b, a];
  let fa = f(a);
  let fb = f(b);
  const early = checkBracket(fa, fb, a, b, steps);
  if (early) return early;
  let prev = NaN;
  for (let i = 1; i <= maxIter; i++) {
    const p = (a * fb - b * fa) / (fb - fa);
    const fp = f(p);
    if (!ok(fp)) return fail(steps, `f(x) is undefined at x = ${fmt(p)}.`);
    const err = ok(prev) ? Math.abs(p - prev) : Math.abs(b - a);
    steps.push({ i, a, b, fa, fb, x: p, fx: fp, err });
    if (fp === 0 || err < tol) return { steps, root: p, status: 'converged' };
    if (Math.sign(fa) === Math.sign(fp)) {
      a = p;
      fa = fp;
    } else {
      b = p;
      fb = fp;
    }
    prev = p;
  }
  return { steps, root: steps[steps.length - 1].x, status: 'maxiter' };
};

export const newton: Solver = ({ f, df }, { x0 }, tol, maxIter) => {
  const steps: Step[] = [];
  let x = x0;
  for (let i = 1; i <= maxIter; i++) {
    const fx = f(x);
    const d = df(x);
    if (!ok(fx) || !ok(d)) return fail(steps, `f or f′ is undefined at x = ${fmt(x)}.`);
    if (d === 0) return fail(steps, `f′(x) = 0 at x = ${fmt(x)}: the tangent is flat and never meets the x-axis.`);
    const xn = x - fx / d;
    const fxn = f(xn);
    if (!ok(xn) || Math.abs(xn) > HUGE) return fail(steps, 'The iterates diverged.');
    const err = Math.abs(xn - x);
    steps.push({ i, from: x, ffrom: fx, slope: d, x: xn, fx: fxn, err });
    if (err < tol || fxn === 0) return settle(steps, xn, fxn, steps[0].ffrom!);
    x = xn;
  }
  return { steps, root: x, status: 'maxiter' };
};

export const halley: Solver = ({ f, df, d2f }, { x0 }, tol, maxIter) => {
  const steps: Step[] = [];
  let x = x0;
  for (let i = 1; i <= maxIter; i++) {
    const fx = f(x);
    const d = df(x);
    const d2 = d2f(x);
    if (!ok(fx) || !ok(d) || !ok(d2)) return fail(steps, `f, f′ or f″ is undefined at x = ${fmt(x)}.`);
    const denom = 2 * d * d - fx * d2;
    if (denom === 0) return fail(steps, `The Halley denominator 2f′² − f·f″ vanished at x = ${fmt(x)}.`);
    const xn = x - (2 * fx * d) / denom;
    const fxn = f(xn);
    if (!ok(xn) || Math.abs(xn) > HUGE) return fail(steps, 'The iterates diverged.');
    const err = Math.abs(xn - x);
    // curv = f″/(2f′): the osculating hyperbola is f + f′·d / (1 − curv·d)
    steps.push({ i, from: x, ffrom: fx, slope: d, curv: d === 0 ? NaN : d2 / (2 * d), x: xn, fx: fxn, err });
    if (err < tol || fxn === 0) return settle(steps, xn, fxn, steps[0].ffrom!);
    x = xn;
  }
  return { steps, root: x, status: 'maxiter' };
};

export const secant: Solver = ({ f }, { x0, x1 }, tol, maxIter) => {
  const steps: Step[] = [];
  let p0 = x0;
  let p1 = x1;
  let q0 = f(p0);
  let q1 = f(p1);
  if (!ok(q0) || !ok(q1)) return fail(steps, 'f(x) is undefined at a starting point.');
  for (let i = 1; i <= maxIter; i++) {
    if (q1 === q0) return fail(steps, 'f(xₙ) = f(xₙ₋₁): the secant line is flat.');
    const p = p1 - (q1 * (p1 - p0)) / (q1 - q0);
    const fp = f(p);
    if (!ok(p) || !ok(fp) || Math.abs(p) > HUGE) return fail(steps, 'The iterates diverged.');
    const err = Math.abs(p - p1);
    steps.push({ i, p0, q0, p1, q1, x: p, fx: fp, err });
    if (err < tol || fp === 0) return settle(steps, p, fp, Math.max(Math.abs(steps[0].q0!), Math.abs(steps[0].q1!)));
    p0 = p1;
    q0 = q1;
    p1 = p;
    q1 = fp;
  }
  return { steps, root: p1, status: 'maxiter' };
};

/** For fixed-point methods `fns.f` is g(x). */
export const fixed: Solver = ({ f: g }, { x0 }, tol, maxIter) => {
  const steps: Step[] = [];
  let p0 = x0;
  for (let i = 1; i <= maxIter; i++) {
    const p = g(p0);
    if (!ok(p) || Math.abs(p) > HUGE) return fail(steps, 'The iterates diverged. |g′(x)| is probably ≥ 1 near the fixed point.');
    const err = Math.abs(p - p0);
    steps.push({ i, from: p0, x: p, fx: g(p) - p, err });
    if (err < tol) return { steps, root: p, status: 'converged' };
    p0 = p;
  }
  return { steps, root: p0, status: 'maxiter' };
};

export const steffensen: Solver = ({ f: g }, { x0 }, tol, maxIter) => {
  const steps: Step[] = [];
  let p0 = x0;
  for (let i = 1; i <= maxIter; i++) {
    const p1 = g(p0);
    const p2 = g(p1);
    if (!ok(p1) || !ok(p2)) return fail(steps, `g(x) is undefined near x = ${fmt(p0)}.`);
    const denom = p2 - 2 * p1 + p0;
    if (denom === 0) {
      if (Math.abs(p1 - p0) < tol) return { steps, root: p1, status: 'converged' };
      return fail(steps, 'Aitken’s denominator g(g(x)) − 2g(x) + x vanished.');
    }
    const p = p0 - ((p1 - p0) * (p1 - p0)) / denom;
    if (!ok(p) || Math.abs(p) > HUGE) return fail(steps, 'The iterates diverged.');
    const err = Math.abs(p - p0);
    steps.push({ i, from: p0, g1: p1, g2: p2, x: p, fx: g(p) - p, err });
    if (err < tol) return { steps, root: p, status: 'converged' };
    p0 = p;
  }
  return { steps, root: p0, status: 'maxiter' };
};

/** Regula falsi with the Illinois fix: halve the stale endpoint's value when it survives twice. */
export const illinois: Solver = ({ f }, { a, b }, tol, maxIter) => {
  const steps: Step[] = [];
  if (a > b) [a, b] = [b, a];
  let fa = f(a);
  let fb = f(b);
  const early = checkBracket(fa, fb, a, b, steps);
  if (early) return early;
  let prev = NaN;
  let side = 0; // -1: a was kept last time, +1: b was kept
  for (let i = 1; i <= maxIter; i++) {
    const p = (a * fb - b * fa) / (fb - fa);
    const fp = f(p);
    if (!ok(fp)) return fail(steps, `f(x) is undefined at x = ${fmt(p)}.`);
    const err = ok(prev) ? Math.abs(p - prev) : Math.abs(b - a);
    steps.push({ i, a, b, fa, fb, x: p, fx: fp, err });
    if (fp === 0 || err < tol) return { steps, root: p, status: 'converged' };
    if (Math.sign(fa) === Math.sign(fp)) {
      a = p;
      fa = fp;
      if (side === 1) fb /= 2;
      side = 1;
    } else {
      b = p;
      fb = fp;
      if (side === -1) fa /= 2;
      side = -1;
    }
    prev = p;
  }
  return { steps, root: steps[steps.length - 1].x, status: 'maxiter' };
};

export const ridders: Solver = ({ f }, { a, b }, tol, maxIter) => {
  const steps: Step[] = [];
  if (a > b) [a, b] = [b, a];
  let fa = f(a);
  let fb = f(b);
  const early = checkBracket(fa, fb, a, b, steps);
  if (early) return early;
  let prev = NaN;
  for (let i = 1; i <= maxIter; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    const s = Math.sqrt(fm * fm - fa * fb);
    if (!ok(fm) || !ok(s)) return fail(steps, `f(x) is undefined near x = ${fmt(m)}.`);
    if (s === 0) return { steps, root: m, status: 'converged' };
    const x = m + ((m - a) * Math.sign(fa - fb) * fm) / s;
    const fx = f(x);
    if (!ok(fx)) return fail(steps, `f(x) is undefined at x = ${fmt(x)}.`);
    const err = ok(prev) ? Math.abs(x - prev) : Math.abs(b - a) / 2;
    steps.push({ i, a, b, fa, fb, mid: m, fmid: fm, x, fx, err });
    if (fx === 0 || err < tol) return { steps, root: x, status: 'converged' };
    // keep the tightest sign-changing pair among a, m, x, b
    if (Math.sign(fm) !== Math.sign(fx)) {
      [a, fa, b, fb] = m < x ? [m, fm, x, fx] : [x, fx, m, fm];
    } else if (Math.sign(fa) !== Math.sign(fx)) {
      b = x;
      fb = fx;
    } else {
      a = x;
      fa = fx;
    }
    prev = x;
  }
  return { steps, root: steps[steps.length - 1].x, status: 'maxiter' };
};

/** ITP: Interpolate–Truncate–Project (Oliveira & Takahashi, 2020). */
export const itp: Solver = ({ f }, { a, b }, tol, maxIter) => {
  const steps: Step[] = [];
  if (a > b) [a, b] = [b, a];
  let fa = f(a);
  let fb = f(b);
  const early = checkBracket(fa, fb, a, b, steps);
  if (early) return early;
  const k1 = 0.2 / (b - a);
  const k2 = 2;
  const nHalf = Math.max(0, Math.ceil(Math.log2((b - a) / (2 * tol))));
  const nMax = nHalf + 1;
  for (let j = 0; j < maxIter; j++) {
    const half = (a + b) / 2;
    const r = tol * Math.pow(2, nMax - j) - (b - a) / 2;
    const delta = k1 * Math.pow(b - a, k2);
    const xf = (b * fa - a * fb) / (fa - fb);
    const sigma = Math.sign(half - xf);
    const xt = delta <= Math.abs(half - xf) ? xf + sigma * delta : half;
    const x = Math.abs(xt - half) <= r ? xt : half - sigma * r;
    const fx = f(x);
    if (!ok(fx)) return fail(steps, `f(x) is undefined at x = ${fmt(x)}.`);
    steps.push({ i: j + 1, a, b, fa, fb, x, fx, err: (b - a) / 2 });
    if (fx === 0) return { steps, root: x, status: 'converged' };
    if (Math.sign(fx) === Math.sign(fa)) {
      a = x;
      fa = fx;
    } else {
      b = x;
      fb = fx;
    }
    if ((b - a) / 2 < tol) {
      steps[steps.length - 1].err = (b - a) / 2;
      return { steps, root: x, status: 'converged' };
    }
  }
  return { steps, root: steps[steps.length - 1].x, status: 'maxiter' };
};

/** Brent's method (after Numerical Recipes' zbrent). */
export const brent: Solver = ({ f }, { a, b }, tol, maxIter) => {
  const steps: Step[] = [];
  let fa = f(a);
  let fb = f(b);
  const early = checkBracket(fa, fb, Math.min(a, b), Math.max(a, b), steps);
  if (early) return early;
  const EPS = 2.220446049250313e-16;
  let c = b;
  let fc = fb;
  let d = b - a;
  let e = d;
  for (let i = 1; i <= maxIter + 1; i++) {
    if (Math.sign(fb) === Math.sign(fc)) {
      c = a;
      fc = fa;
      e = d = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * EPS * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return { steps, root: b, status: 'converged' };
    if (i > maxIter) break;
    let kind: Step['kind'] = 'bisection';
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
        kind = 'secant';
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
        kind = 'IQI';
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
        kind = 'bisection';
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : Math.sign(xm) * tol1;
    fb = f(b);
    if (!ok(fb)) return fail(steps, `f(x) is undefined at x = ${fmt(b)}.`);
    // the bracket after this step is [b, c] or [b, previous b]
    const other = Math.sign(fb) === Math.sign(fc) ? a : c;
    steps.push({ i, a: Math.min(b, other), b: Math.max(b, other), x: b, fx: fb, err: Math.abs(other - b) / 2, kind });
  }
  return { steps, root: b, status: 'maxiter' };
};

/** Müller's method, restricted to real arithmetic. */
export const muller: Solver = ({ f }, { x0, x1, x2 }, tol, maxIter) => {
  const steps: Step[] = [];
  let p0 = x0;
  let p1 = x1;
  let p2 = x2;
  let q0 = f(p0);
  let q1 = f(p1);
  let q2 = f(p2);
  if (!ok(q0) || !ok(q1) || !ok(q2)) return fail(steps, 'f(x) is undefined at a starting point.');
  for (let i = 1; i <= maxIter; i++) {
    const h1 = p1 - p0;
    const h2 = p2 - p1;
    if (h1 === 0 || h2 === 0 || h1 + h2 === 0) return fail(steps, 'Two of the three points coincide.');
    const d1 = (q1 - q0) / h1;
    const d2 = (q2 - q1) / h2;
    const qa = (d2 - d1) / (h2 + h1);
    const qb = qa * h2 + d2;
    const disc = qb * qb - 4 * qa * q2;
    if (disc < 0) return fail(steps, 'The parabola misses the x-axis: Müller wants a complex root here. Try other starting points.');
    const den = qb + (qb >= 0 ? 1 : -1) * Math.sqrt(disc);
    if (den === 0) return fail(steps, 'The parabola is flat.');
    const dx = (-2 * q2) / den;
    const x = p2 + dx;
    const fx = f(x);
    if (!ok(x) || !ok(fx) || Math.abs(x) > HUGE) return fail(steps, 'The iterates diverged.');
    const err = Math.abs(dx);
    steps.push({ i, p0, q0, p1, q1, p2, q2, qa, qb, x, fx, err });
    if (err < tol || fx === 0) return settle(steps, x, fx, Math.max(Math.abs(steps[0].q0!), Math.abs(steps[0].q1!), Math.abs(steps[0].q2!)));
    p0 = p1;
    q0 = q1;
    p1 = p2;
    q1 = q2;
    p2 = x;
    q2 = fx;
  }
  return { steps, root: p2, status: 'maxiter' };
};

export const SOLVERS: Record<MethodId, Solver> = {
  bisection,
  falsi,
  illinois,
  ridders,
  itp,
  brent,
  newton,
  secant,
  halley,
  muller,
  fixed,
  steffensen,
};

export function fmt(v: number, digits = 8): string {
  if (!ok(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a < 1e-4 || a >= 1e7) return v.toExponential(Math.max(1, digits - 4)).replace(/\.?0+e/, 'e');
  return parseFloat(v.toPrecision(digits)).toString();
}
