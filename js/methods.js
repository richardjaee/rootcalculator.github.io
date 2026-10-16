/* Root-finding algorithms. Each returns { steps, root, status, message }.
   status: 'converged' | 'maxiter' | 'failed' */
(function () {
  'use strict';

  const ok = Number.isFinite;

  function bisection(f, { a, b }, tol, maxIter) {
    const steps = [];
    if (a > b) [a, b] = [b, a];
    let fa = f(a);
    const fb = f(b);
    if (!ok(fa) || !ok(fb)) return fail(steps, 'f(x) is undefined at one of the bounds.');
    if (fa === 0) return { steps, root: a, status: 'converged', message: 'The lower bound is already a root.' };
    if (fb === 0) return { steps, root: b, status: 'converged', message: 'The upper bound is already a root.' };
    if (Math.sign(fa) === Math.sign(fb)) {
      return fail(steps, 'f(a) and f(b) have the same sign, so the interval isn’t guaranteed to contain a root. Try a wider bracket.');
    }
    for (let i = 1; i <= maxIter; i++) {
      const p = a + (b - a) / 2;
      const fp = f(p);
      if (!ok(fp)) return fail(steps, `f(x) is undefined at x = ${p}.`);
      const err = (b - a) / 2;
      steps.push({ i, a, b, x: p, fx: fp, err });
      if (fp === 0 || err < tol) return { steps, root: p, status: 'converged' };
      if (Math.sign(fa) === Math.sign(fp)) { a = p; fa = fp; } else { b = p; }
    }
    return { steps, root: steps[steps.length - 1].x, status: 'maxiter' };
  }

  function newton(f, { x0 }, tol, maxIter, df) {
    const steps = [];
    let x = x0;
    for (let i = 1; i <= maxIter; i++) {
      const fx = f(x);
      const d = df(x);
      if (!ok(fx) || !ok(d)) return fail(steps, `f or f′ is undefined at x = ${fmt(x)}.`);
      if (d === 0) return fail(steps, `f′(x) = 0 at x = ${fmt(x)}: the tangent is flat and never meets the x-axis.`);
      const xn = x - fx / d;
      const fxn = f(xn);
      if (!ok(xn) || Math.abs(xn) > 1e15) return fail(steps, 'The iterates diverged.');
      const err = Math.abs(xn - x);
      steps.push({ i, from: x, ffrom: fx, slope: d, x: xn, fx: fxn, err });
      if (err < tol || fxn === 0) return { steps, root: xn, status: 'converged' };
      x = xn;
    }
    return { steps, root: x, status: 'maxiter' };
  }

  function secant(f, { x0, x1 }, tol, maxIter) {
    const steps = [];
    let p0 = x0, p1 = x1, q0 = f(p0), q1 = f(p1);
    if (!ok(q0) || !ok(q1)) return fail(steps, 'f(x) is undefined at a starting point.');
    for (let i = 1; i <= maxIter; i++) {
      if (q1 === q0) return fail(steps, 'f(xₙ) = f(xₙ₋₁): the secant line is flat.');
      const p = p1 - (q1 * (p1 - p0)) / (q1 - q0);
      const fp = f(p);
      if (!ok(p) || !ok(fp) || Math.abs(p) > 1e15) return fail(steps, 'The iterates diverged.');
      const err = Math.abs(p - p1);
      steps.push({ i, p0, q0, p1, q1, x: p, fx: fp, err });
      if (err < tol || fp === 0) return { steps, root: p, status: 'converged' };
      p0 = p1; q0 = q1; p1 = p; q1 = fp;
    }
    return { steps, root: p1, status: 'maxiter' };
  }

  function fixedPoint(g, { x0 }, tol, maxIter) {
    const steps = [];
    let p0 = x0;
    for (let i = 1; i <= maxIter; i++) {
      const p = g(p0);
      if (!ok(p) || Math.abs(p) > 1e15) return fail(steps, 'The iterates diverged. |g′(x)| is probably ≥ 1 near the fixed point.');
      const err = Math.abs(p - p0);
      steps.push({ i, from: p0, x: p, fx: p - p0, err });
      if (err < tol) return { steps, root: p, status: 'converged' };
      p0 = p;
    }
    return { steps, root: p0, status: 'maxiter' };
  }

  function fail(steps, message) {
    return { steps, root: steps.length ? steps[steps.length - 1].x : NaN, status: 'failed', message };
  }

  function fmt(v, digits = 8) {
    if (!ok(v)) return String(v);
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a < 1e-4 || a >= 1e7) return v.toExponential(Math.max(1, digits - 4)).replace(/\.?0+e/, 'e');
    return parseFloat(v.toPrecision(digits)).toString();
  }

  window.RootMethods = { bisection, newton, secant, fixed: fixedPoint, fmt };
})();
