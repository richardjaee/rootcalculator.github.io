import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { METHOD_ORDER, METHODS } from './meta';
import { SOLVERS } from './methods';
import { compileFn, parseNum } from './parse';
import { buildRun, findBracket, race, scanRoots } from './solve';

const ROOT = 1.5213797068045676; // x^3 - x - 2
const cubic = compileFn('x^3 - x - 2');

describe('solvers', () => {
  it.each([
    ['bisection', { a: 1, b: 2 }],
    ['falsi', { a: 1, b: 2 }],
    ['newton', { x0: 1.5 }],
    ['secant', { x0: 1, x1: 2 }],
    ['halley', { x0: 1.5 }],
    ['illinois', { a: 1, b: 2 }],
    ['ridders', { a: 1, b: 2 }],
    ['itp', { a: 1, b: 2 }],
    ['brent', { a: 1, b: 2 }],
    ['brent', { a: 2, b: 1 }],
    ['muller', { x0: 1, x1: 1.5, x2: 2 }],
  ] as const)('%s finds the cubic root', (m, params) => {
    const r = SOLVERS[m](cubic, { ...params }, 1e-10, 200);
    expect(r.status).toBe('converged');
    expect(r.root).toBeCloseTo(ROOT, 8);
  });

  it.each(['fixed', 'steffensen'] as const)('%s finds the Dottie number', (m) => {
    const r = SOLVERS[m](compileFn('cos(x)'), { x0: 1 }, 1e-10, 200);
    expect(r.status).toBe('converged');
    expect(r.root).toBeCloseTo(0.7390851332151607, 8);
  });

  it('converges in the expected order of speed', () => {
    const steps = (m: (typeof METHOD_ORDER)[number], p: Record<string, number>) =>
      SOLVERS[m](cubic, p, 1e-12, 200).steps.length;
    expect(steps('halley', { x0: 2 })).toBeLessThanOrEqual(steps('newton', { x0: 2 }));
    expect(steps('newton', { x0: 2 })).toBeLessThan(steps('bisection', { a: 1, b: 2 }));
  });

  it('bisection rejects a bracket without a sign change', () => {
    const r = SOLVERS.bisection(compileFn('x^2 + 1'), { a: 0, b: 2 }, 1e-6, 50);
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/same sign/);
  });

  it('newton reports a flat tangent', () => {
    const r = SOLVERS.newton(compileFn('x^2 + 1'), { x0: 0 }, 1e-6, 50);
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/f′\(x\) = 0/);
  });

  it('ITP never needs more than bisection + 1 steps', () => {
    for (const fx of ['x^10 - 1', 'tanh(5(x - 0.3))', 'x^3 - x - 2', '(x - 1)^3', 'exp(10x) - 1000']) {
      const c = compileFn(fx);
      const [a, b] = fx === 'tanh(5(x - 0.3))' ? [-1, 2] : fx.startsWith('exp') ? [0, 1] : [0, 1.7];
      const bis = SOLVERS.bisection(c, { a, b }, 1e-8, 200).steps.length;
      const it = SOLVERS.itp(c, { a, b }, 1e-8, 200);
      expect(it.status).toBe('converged');
      expect(it.steps.length).toBeLessThanOrEqual(bis + 1);
    }
  });

  it('brent and ITP keep a valid bracket', () => {
    for (const m of ['brent', 'itp', 'illinois', 'ridders'] as const) {
      const r = SOLVERS[m](compileFn('x^10 - 1'), { a: 0, b: 1.3 }, 1e-10, 200);
      for (const st of r.steps) {
        expect(st.a!).toBeLessThanOrEqual(1 + 1e-9);
        expect(st.b!).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
  });

  it('brent labels every step', () => {
    const r = SOLVERS.brent(compileFn('x^10 - 1'), { a: 0, b: 1.3 }, 1e-6, 50);
    expect(new Set(r.steps.map((s) => s.kind))).toEqual(new Set(['secant', 'bisection', 'IQI']));
  });

  it('open methods do not claim a root on a flat stretch', () => {
    const r = SOLVERS.secant(compileFn('x^10 - 1'), { x0: 0, x1: 1.3 }, 1e-6, 50);
    expect(r.status).not.toBe('converged');
    // whatever it reports as converged must actually be a root
    for (const m of ['newton', 'secant', 'halley', 'muller'] as const) {
      for (const fx of ['x^10 - 1', 'atan(x)', 'x^3 - 2x + 2', 'cos(x) - x']) {
        const p: Record<string, number> = m === 'muller' ? { x0: 0, x1: 0.65, x2: 1.3 } : m === 'secant' ? { x0: 0, x1: 1.3 } : { x0: 0.65 };
        const c = compileFn(fx);
        const res = SOLVERS[m](c, p, 1e-6, 100);
        if (res.status === 'converged') expect(Math.abs(c.f(res.root))).toBeLessThan(1e-5);
      }
    }
  });

  it('müller reports complex territory', () => {
    const r = SOLVERS.muller(compileFn('x^2 + 1'), { x0: -1, x1: 0, x2: 1 }, 1e-6, 50);
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/complex/);
  });

  it('bisection error bound halves every step', () => {
    const r = SOLVERS.bisection(cubic, { a: 1, b: 2 }, 1e-6, 50);
    for (let i = 1; i < r.steps.length; i++) expect(r.steps[i].err).toBeCloseTo(r.steps[i - 1].err / 2, 12);
  });
});

describe('parsing', () => {
  it('accepts common notations', () => {
    expect(compileFn('f(x) = 2x^2').f(3)).toBe(18);
    expect(compileFn('y = x**2').f(3)).toBe(9);
    expect(compileFn('√(x) + π').f(4)).toBeCloseTo(2 + Math.PI);
  });
  it('computes derivatives symbolically', () => {
    const c = compileFn('x^3');
    expect(c.df(2)).toBe(12);
    expect(c.d2f(2)).toBe(12);
  });
  it('rejects unknown variables', () => {
    expect(() => compileFn('y + 1')).toThrow(/Unknown variable y/);
  });
  it('evaluates numeric expressions', () => {
    expect(parseNum('pi/2', 'x')).toBeCloseTo(Math.PI / 2);
    expect(() => parseNum('abc', 'x₀')).toThrow(/must be a number/);
  });
  it('treats complex results as undefined', () => {
    expect(compileFn('sqrt(x)').f(-1)).toBeNaN();
  });
});

describe('examples', () => {
  const expected: Record<string, string> = {
    'newton-cycle': 'maxiter',
    'logistic-cycle': 'maxiter',
    'cbrt-diverge': 'failed',
    'atan-diverge': 'failed',
    'no-roots': 'maxiter',
    'falsi-stall': 'maxiter',
  };
  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s behaves as described', (id, ex) => {
    const { run, errors } = buildRun(ex.method, ex.values, { tol: '', maxIter: '' });
    expect(errors).toBeUndefined();
    const want = expected[id] ?? 'converged';
    if (want === 'failed') expect(['failed', 'maxiter']).toContain(run!.status);
    else expect(run!.status).toBe(want);
    for (const fd of METHODS[ex.method].fields) expect(ex.values[fd.key]).toBeDefined();
  });

  it('key example answers are right', () => {
    const root = (id: string) => {
      const ex = EXAMPLES.find((e) => e.id === id)!;
      return buildRun(ex.method, ex.values, { tol: '1e-10', maxIter: '200' }).run!;
    };
    expect(root('phi').root).toBeCloseTo((1 + Math.sqrt(5)) / 2, 9);
    expect(root('omega').root).toBeCloseTo(0.5671432904, 9);
    expect(root('pi-sin').root).toBeCloseTo(Math.PI, 9);
    expect(root('euler-e').root).toBeCloseTo(Math.E, 9);
    expect(root('wien').root).toBeCloseTo(4.965114, 5);
    expect(root('irr').root).toBeCloseTo(0.089, 3);
    expect(root('catenary').root).toBeCloseTo(126.6, 0);
    expect(root('colebrook').root).toBeCloseTo(0.0185, 3);
    expect(root('kepler').root).toBeCloseTo(1.4987, 3);
    expect(root('logistic-steff').root).toBeCloseTo(23 / 33, 9);
    expect(root('tan-pole').root).toBeCloseTo(Math.PI / 2, 6);
    // step counts quoted in the blurbs use the default tolerance
    const steps = (id: string) => {
      const ex = EXAMPLES.find((e) => e.id === id)!;
      return buildRun(ex.method, ex.values, { tol: '', maxIter: '' }).run!.steps.length;
    };
    expect(steps('wallis')).toBe(4);
    expect(steps('cbrt7')).toBe(4);
    expect(steps('omega')).toBe(4);
    expect(steps('falsi-stall')).toBe(50);
    expect(steps('quintic')).toBe(5);
    expect(steps('ridders-cliff')).toBe(5);
    expect(steps('lambert-w10')).toBe(6);
    expect(steps('illinois-rescue')).toBe(14);
    expect(steps('itp-guarantee')).toBe(17);
    expect(steps('brent-gears')).toBe(7);
    const secantQuintic = buildRun('secant', { fx: 'x^5 - x - 1', x0: '1', x1: '1.5' }, { tol: '', maxIter: '' }).run!;
    expect(secantQuintic.steps.length).toBe(7);
    const bisW = buildRun('bisection', { fx: 'x e^x - 10', a: '0', b: '3' }, { tol: '', maxIter: '' }).run!;
    expect(bisW.steps.length).toBe(22);
    const bisCliff = buildRun('bisection', { fx: 'exp(10x) - 1000', a: '0', b: '1' }, { tol: '', maxIter: '' }).run!;
    expect(bisCliff.steps.length).toBe(20);
    expect(buildRun('falsi', { fx: 'exp(10x) - 1000', a: '0', b: '1' }, { tol: '', maxIter: '' }).run!.status).toBe('maxiter');
    expect(root('lambert-w10').root).toBeCloseTo(1.7455280027, 9);
    expect(root('quintic').root).toBeCloseTo(1.1673039783, 9);
    expect(root('ridders-cliff').root).toBeCloseTo(Math.log(1000) / 10, 9);
    const bis = buildRun('bisection', { fx: 'x^10 - 1', a: '0', b: '1.3' }, { tol: '', maxIter: '' }).run!;
    expect(bis.steps.length).toBe(21);
  });
});

describe('race & scan', () => {
  it('runs every method', () => {
    const { run } = buildRun('newton', { fx: 'x^3 - x - 2', x0: '1.5' }, { tol: '', maxIter: '' });
    const r = race(run!);
    expect(r.map((e) => e.method)).toEqual(METHOD_ORDER);
    for (const e of r.filter((e) => METHODS[e.method].kind === 'f')) {
      expect(e.result.status).toBe('converged');
      expect(e.result.root).toBeCloseTo(ROOT, 5);
    }
  });
  it('finds a bracket around a guess', () => {
    const br = findBracket(cubic.f, 0);
    expect(br).not.toBeNull();
    expect(Math.sign(cubic.f(br![0]))).not.toBe(Math.sign(cubic.f(br![1])));
  });
  it('finds all roots and skips poles', () => {
    const roots = scanRoots(compileFn('sin(x)').f, -1, 7);
    expect(roots.map((r) => +r.toFixed(6) + 0)).toEqual([0, +Math.PI.toFixed(6), +(2 * Math.PI).toFixed(6)]);
    expect(scanRoots(compileFn('tan(x)').f, 1, 2)).toEqual([]);
  });
});
