import { fmt, type MethodId, type Step } from './methods';

export type Family = 'bracket' | 'hybrid' | 'open' | 'fixed';
export type Values = Record<string, string>;

export interface Field {
  key: string;
  label: string;
}

export interface MethodMeta {
  id: MethodId;
  name: string;
  family: Family;
  tagline: string;
  tex: string;
  order: string;
  needs: string;
  pros: string[];
  cons: string[];
  /** 'f' → find f(x) = 0, 'g' → find x = g(x) */
  kind: 'f' | 'g';
  fields: Field[];
  presets: Values[];
  cols: [string, (s: Step) => string | number][];
}

export const FAMILY_LABEL: Record<Family, string> = {
  bracket: 'Bracketing',
  hybrid: 'Hybrid',
  open: 'Open',
  fixed: 'Fixed-point',
};

const BRACKET: Field[] = [
  { key: 'a', label: 'Lower bound a' },
  { key: 'b', label: 'Upper bound b' },
];
const X0: Field[] = [{ key: 'x0', label: 'Initial guess x₀' }];

/** Methods that start from (and keep) a sign-changing bracket [a, b]. */
export const isBracketed = (m: MethodMeta) => m.family === 'bracket' || m.family === 'hybrid';

const bracketCols = (third: string, err: string): MethodMeta['cols'] => [
  ['n', (s) => s.i],
  ['a', (s) => fmt(s.a!, 9)],
  ['b', (s) => fmt(s.b!, 9)],
  [third, (s) => fmt(s.x, 10)],
  [`f(${third})`, (s) => fmt(s.fx, 4)],
  [err, (s) => fmt(s.err, 3)],
];

export const METHODS: Record<MethodId, MethodMeta> = {
  bisection: {
    id: 'bisection',
    name: 'Bisection',
    family: 'bracket',
    tagline: 'Keep halving an interval where f(x) changes sign. Slow and steady, but it always gets there.',
    tex: 'p_n = \\dfrac{a_n + b_n}{2}',
    order: 'Linear: about 3.3 steps per digit',
    needs: 'A bracket [a, b] where f changes sign',
    pros: ['Always converges', 'Error bound is known in advance'],
    cons: ['Slow', 'Ignores the shape of f'],
    kind: 'f',
    fields: BRACKET,
    presets: [
      { fx: 'x^3 - x - 2', a: '1', b: '2' },
      { fx: 'cos(x) - x', a: '0', b: '1' },
      { fx: 'x^2 - 2', a: '0', b: '2' },
      { fx: 'e^x - 3x', a: '0', b: '1' },
    ],
    cols: [
      ['n', (s) => s.i],
      ['a', (s) => fmt(s.a!, 9)],
      ['b', (s) => fmt(s.b!, 9)],
      ['pₙ', (s) => fmt(s.x, 10)],
      ['f(pₙ)', (s) => fmt(s.fx, 4)],
      ['(b−a)/2', (s) => fmt(s.err, 3)],
    ],
  },
  falsi: {
    id: 'falsi',
    name: 'False Position',
    family: 'bracket',
    tagline: 'Like bisection, but cut where the chord between f(a) and f(b) crosses zero instead of at the midpoint.',
    tex: 'x_n = \\dfrac{a_n f(b_n) - b_n f(a_n)}{f(b_n) - f(a_n)}',
    order: 'Linear, often faster than bisection',
    needs: 'A bracket [a, b] where f changes sign',
    pros: ['Never loses the bracket', 'Uses the size of f, not just its sign'],
    cons: ['One endpoint can get stuck, so it crawls'],
    kind: 'f',
    fields: BRACKET,
    presets: [
      { fx: 'x^3 - x - 2', a: '1', b: '2' },
      { fx: 'cos(x) - x', a: '0', b: '1' },
      { fx: 'x^2 - 5', a: '2', b: '3' },
      { fx: 'x^10 - 1', a: '0', b: '1.3' },
    ],
    cols: [
      ['n', (s) => s.i],
      ['a', (s) => fmt(s.a!, 9)],
      ['b', (s) => fmt(s.b!, 9)],
      ['xₙ', (s) => fmt(s.x, 10)],
      ['f(xₙ)', (s) => fmt(s.fx, 4)],
      ['|Δx|', (s) => fmt(s.err, 3)],
    ],
  },
  illinois: {
    id: 'illinois',
    name: 'Illinois',
    family: 'bracket',
    tagline: 'False Position with one fix: when the same endpoint survives twice in a row, halve its f value so the chord swings past the stall.',
    tex: 'x_n = \\dfrac{a f_b - b f_a}{f_b - f_a},\\qquad f_{\\text{stale}} \\leftarrow \\tfrac{1}{2} f_{\\text{stale}}',
    order: 'Superlinear (order ≈ 1.44)',
    needs: 'A bracket [a, b] where f changes sign',
    pros: ['Keeps a guaranteed bracket', 'Fixes the False Position stall'],
    cons: ['Usually slower than Brent'],
    kind: 'f',
    fields: BRACKET,
    presets: [
      { fx: 'x^10 - 1', a: '0', b: '1.3' },
      { fx: 'x^3 - x - 2', a: '1', b: '2' },
      { fx: 'cos(x) - x', a: '0', b: '1' },
      { fx: 'e^x - 3x', a: '0', b: '1' },
    ],
    cols: bracketCols('xₙ', '|Δx|'),
  },
  ridders: {
    id: 'ridders',
    name: 'Ridders',
    family: 'bracket',
    tagline: 'Evaluate the midpoint, then factor out an exponential so f looks straight, and take a false-position step on that.',
    tex: 'x = m + (m - a)\\,\\dfrac{\\operatorname{sign}(f_a - f_b)\\, f_m}{\\sqrt{f_m^2 - f_a f_b}}',
    order: 'Quadratic per step (√2 per evaluation)',
    needs: 'A bracket [a, b] where f changes sign',
    pros: ['Never leaves the bracket', 'Fast without derivatives', 'Exact on pure exponentials'],
    cons: ['Two f evaluations per step'],
    kind: 'f',
    fields: BRACKET,
    presets: [
      { fx: 'exp(10x) - 1000', a: '0', b: '1' },
      { fx: 'x^3 - x - 2', a: '1', b: '2' },
      { fx: 'cos(x) - x', a: '0', b: '1' },
      { fx: 'x^10 - 1', a: '0', b: '1.3' },
    ],
    cols: [
      ['n', (s) => s.i],
      ['a', (s) => fmt(s.a!, 9)],
      ['b', (s) => fmt(s.b!, 9)],
      ['m', (s) => fmt(s.mid!, 9)],
      ['xₙ', (s) => fmt(s.x, 10)],
      ['f(xₙ)', (s) => fmt(s.fx, 4)],
      ['|Δx|', (s) => fmt(s.err, 3)],
    ],
  },
  itp: {
    id: 'itp',
    name: 'ITP',
    family: 'hybrid',
    tagline: 'Interpolate, Truncate, Project (2020): take a false-position guess, nudge it toward the midpoint, and keep it close enough that it never needs more steps than bisection.',
    tex: 'x_{\\text{ITP}} = \\operatorname{proj}_{\\,[x_{1/2} \\pm r_j]}\\!\\big(x_f + \\sigma\\,\\delta\\big)',
    order: 'Superlinear, never slower than bisection',
    needs: 'A bracket [a, b] where f changes sign',
    pros: ['Bisection’s worst-case guarantee', 'Superlinear on smooth f'],
    cons: ['Has tuning constants (κ₁, κ₂, n₀)'],
    kind: 'f',
    fields: BRACKET,
    presets: [
      { fx: 'x^3 - x - 2', a: '1', b: '2' },
      { fx: 'x^10 - 1', a: '0', b: '1.3' },
      { fx: 'tanh(5(x - 0.3))', a: '-1', b: '2' },
      { fx: 'cos(x) - x', a: '0', b: '1' },
    ],
    cols: bracketCols('xₙ', '(b−a)/2'),
  },
  brent: {
    id: 'brent',
    name: 'Brent',
    family: 'hybrid',
    tagline: 'Use inverse quadratic interpolation and secant steps for speed, and fall back to bisection whenever they misbehave. This is the method behind scipy’s brentq and most root-finding libraries.',
    tex: 'x = \\sum_{i \\in \\{a,b,c\\}} x_i \\prod_{j \\ne i} \\frac{f_j}{f_i - f_j}',
    order: 'Superlinear, with guaranteed convergence',
    needs: 'A bracket [a, b] where f changes sign',
    pros: ['Guaranteed to converge', 'Usually as fast as secant', 'Industry standard'],
    cons: ['Tricky to implement by hand'],
    kind: 'f',
    fields: BRACKET,
    presets: [
      { fx: 'x^3 - x - 2', a: '1', b: '2' },
      { fx: 'x^10 - 1', a: '0', b: '1.3' },
      { fx: 'x e^x - 10', a: '0', b: '3' },
      { fx: 'cos(x) - x', a: '0', b: '1' },
    ],
    cols: [
      ['n', (s) => s.i],
      ['step', (s) => s.kind ?? ''],
      ['xₙ', (s) => fmt(s.x, 12)],
      ['f(xₙ)', (s) => fmt(s.fx, 4)],
      ['bracket/2', (s) => fmt(s.err, 3)],
    ],
  },
  newton: {
    id: 'newton',
    name: 'Newton',
    family: 'open',
    tagline: 'Follow the tangent line down to the x-axis. Close to a simple root, the number of correct digits doubles every step.',
    tex: "x_{n+1} = x_n - \\dfrac{f(x_n)}{f'(x_n)}",
    order: 'Quadratic (order 2)',
    needs: 'A starting guess x₀ and the derivative f′',
    pros: ['Very fast near the root', 'Only one starting point'],
    cons: ['Can diverge or cycle', 'Fails where f′ = 0'],
    kind: 'f',
    fields: X0,
    presets: [
      { fx: 'x^3 - 2x - 5', x0: '2' },
      { fx: 'cos(x) - x', x0: '1' },
      { fx: 'x^2 - 2', x0: '3' },
      { fx: 'sin(x) - x/2', x0: '2.5' },
    ],
    cols: [
      ['n', (s) => s.i],
      ['xₙ', (s) => fmt(s.x, 12)],
      ['f(xₙ)', (s) => fmt(s.fx, 4)],
      ['f′(xₙ₋₁)', (s) => fmt(s.slope!, 5)],
      ['|Δx|', (s) => fmt(s.err, 3)],
    ],
  },
  secant: {
    id: 'secant',
    name: 'Secant',
    family: 'open',
    tagline: 'Newton without derivatives: draw a line through the last two points and see where it hits zero.',
    tex: 'x_{n+1} = x_n - f(x_n)\\,\\dfrac{x_n - x_{n-1}}{f(x_n) - f(x_{n-1})}',
    order: 'Superlinear (order φ ≈ 1.618)',
    needs: 'Two starting guesses x₀, x₁',
    pros: ['No derivative needed', 'One new f evaluation per step'],
    cons: ['Can diverge like Newton'],
    kind: 'f',
    fields: [
      { key: 'x0', label: 'First guess x₀' },
      { key: 'x1', label: 'Second guess x₁' },
    ],
    presets: [
      { fx: 'x^3 - x - 2', x0: '1', x1: '2' },
      { fx: 'cos(x) - x', x0: '0', x1: '1' },
      { fx: 'e^(-x) - x', x0: '0', x1: '1' },
      { fx: 'log(x) + x - 2', x0: '0.5', x1: '3' },
    ],
    cols: [
      ['n', (s) => s.i + 1],
      ['xₙ', (s) => fmt(s.x, 12)],
      ['f(xₙ)', (s) => fmt(s.fx, 4)],
      ['|Δx|', (s) => fmt(s.err, 3)],
    ],
  },
  halley: {
    id: 'halley',
    name: 'Halley',
    family: 'open',
    tagline: 'Fit a hyperbola that matches f, f′ and f″, then jump to where it hits zero. Correct digits triple each step.',
    tex: "x_{n+1} = x_n - \\dfrac{2 f(x_n) f'(x_n)}{2 f'(x_n)^2 - f(x_n) f''(x_n)}",
    order: 'Cubic (order 3)',
    needs: 'A starting guess x₀, plus f′ and f″',
    pros: ['Fewer steps than Newton', 'More forgiving start'],
    cons: ['Needs the second derivative', 'More work per step'],
    kind: 'f',
    fields: X0,
    presets: [
      { fx: 'x^3 - 7', x0: '3' },
      { fx: 'x*e^x - 1', x0: '1' },
      { fx: 'cos(x) - x', x0: '1' },
      { fx: 'x^2 - 2', x0: '3' },
    ],
    cols: [
      ['n', (s) => s.i],
      ['xₙ', (s) => fmt(s.x, 12)],
      ['f(xₙ)', (s) => fmt(s.fx, 4)],
      ['|Δx|', (s) => fmt(s.err, 3)],
    ],
  },
  muller: {
    id: 'muller',
    name: 'Müller',
    family: 'open',
    tagline: 'Fit a parabola through the last three points and jump to where it crosses zero. It is the secant method with curvature added.',
    tex: 'x_{n+1} = x_n - \\dfrac{2c}{b + \\operatorname{sign}(b)\\sqrt{b^2 - 4ac}}',
    order: 'Superlinear (order ≈ 1.84)',
    needs: 'Three starting guesses x₀, x₁, x₂',
    pros: ['No derivatives', 'Faster than secant'],
    cons: ['Can want complex roots (real-only here)'],
    kind: 'f',
    fields: [
      { key: 'x0', label: 'Guess x₀' },
      { key: 'x1', label: 'Guess x₁' },
      { key: 'x2', label: 'Guess x₂' },
    ],
    presets: [
      { fx: 'x^5 - x - 1', x0: '0.5', x1: '1', x2: '1.5' },
      { fx: 'x^3 - x - 2', x0: '1', x1: '1.5', x2: '2' },
      { fx: 'cos(x) - x', x0: '0', x1: '0.5', x2: '1' },
      { fx: 'e^x - 3x', x0: '1', x1: '1.3', x2: '2' },
    ],
    cols: [
      ['n', (s) => s.i + 2],
      ['xₙ', (s) => fmt(s.x, 12)],
      ['f(xₙ)', (s) => fmt(s.fx, 4)],
      ['|Δx|', (s) => fmt(s.err, 3)],
    ],
  },
  fixed: {
    id: 'fixed',
    name: 'Fixed Point',
    family: 'fixed',
    tagline: 'Rewrite f(x) = 0 as x = g(x), then keep feeding the output back in. The cobweb shows it spiraling in, or flying apart.',
    tex: 'x_{n+1} = g(x_n)',
    order: 'Linear when |g′(x*)| < 1',
    needs: 'A rearrangement x = g(x) and a guess x₀',
    pros: ['Very simple', 'Easy to visualize'],
    cons: ['Diverges when |g′(x*)| > 1'],
    kind: 'g',
    fields: X0,
    presets: [
      { fx: 'cos(x)', x0: '1' },
      { fx: 'sqrt(10 / (4 + x))', x0: '1.5' },
      { fx: '2.8 x (1 - x)', x0: '0.15' },
      { fx: '(x + 2/x) / 2', x0: '3' },
    ],
    cols: [
      ['n', (s) => s.i],
      ['xₙ', (s) => fmt(s.x, 12)],
      ['|Δx|', (s) => fmt(s.err, 3)],
    ],
  },
  steffensen: {
    id: 'steffensen',
    name: 'Steffensen',
    family: 'fixed',
    tagline: 'Take two fixed-point steps, then use Aitken’s Δ² trick to jump straight to where they are heading.',
    tex: 'x_{n+1} = x_n - \\dfrac{\\left(g(x_n) - x_n\\right)^2}{g(g(x_n)) - 2g(x_n) + x_n}',
    order: 'Quadratic (order 2)',
    needs: 'A rearrangement x = g(x) and a guess x₀',
    pros: ['Quadratic without any derivatives', 'Can converge even when plain iteration diverges'],
    cons: ['Two g evaluations per step'],
    kind: 'g',
    fields: X0,
    presets: [
      { fx: 'cos(x)', x0: '1' },
      { fx: '3.3 x (1 - x)', x0: '0.5' },
      { fx: 'e^(-x)', x0: '0.2' },
      { fx: '(x + 2/x) / 2', x0: '3' },
    ],
    cols: [
      ['n', (s) => s.i],
      ['xₙ', (s) => fmt(s.x, 12)],
      ['g(xₙ)−xₙ', (s) => fmt(s.fx, 4)],
      ['|Δx|', (s) => fmt(s.err, 3)],
    ],
  },
};

export const METHOD_ORDER: MethodId[] = [
  'bisection',
  'falsi',
  'illinois',
  'ridders',
  'itp',
  'brent',
  'newton',
  'secant',
  'halley',
  'muller',
  'fixed',
  'steffensen',
];

export const METHOD_COLOR: Record<MethodId, string> = {
  bisection: '#a78bfa',
  falsi: '#818cf8',
  illinois: '#c084fc',
  ridders: '#e879f9',
  itp: '#2dd4bf',
  brent: '#60a5fa',
  newton: '#22d3ee',
  secant: '#34d399',
  halley: '#fbbf24',
  muller: '#a3e635',
  fixed: '#f472b6',
  steffensen: '#fb923c',
};

export function defaultValues(): Record<MethodId, Values> {
  const out = {} as Record<MethodId, Values>;
  for (const id of METHOD_ORDER) out[id] = { ...METHODS[id].presets[0] };
  return out;
}

export const METHOD_ALIASES: Record<string, MethodId> = {
  bisection: 'bisection',
  falsi: 'falsi',
  'false-position': 'falsi',
  regula: 'falsi',
  illinois: 'illinois',
  ridders: 'ridders',
  itp: 'itp',
  brent: 'brent',
  brentq: 'brent',
  muller: 'muller',
  'müller': 'muller',
  newton: 'newton',
  newtons: 'newton',
  secant: 'secant',
  halley: 'halley',
  fixed: 'fixed',
  'fixed-point': 'fixed',
  steffensen: 'steffensen',
};
