import { derivative, evaluate, parse, simplify, type MathNode } from 'mathjs';
import type { Fn, Fns } from './methods';

export interface Compiled extends Fns {
  node: MathNode;
  dnode: MathNode | null;
  tex: string;
  dtex: string | null;
}

export function cleanExpr(s: string): string {
  return s
    .trim()
    .replace(/^\s*(?:[fgy]\s*\(\s*x\s*\)|y)\s*=\s*/i, '')
    .replace(/\*\*/g, '^')
    .replace(/π/g, 'pi')
    .replace(/φ/g, 'phi')
    .replace(/√/g, 'sqrt')
    // x is never a function, so "x (1 - x)" means multiplication
    .replace(/(?<![A-Za-z_])x\s*\(/g, 'x * (');
}

function toNum(r: unknown): number {
  if (typeof r === 'number') return r;
  if (r && typeof r === 'object' && 'toNumber' in r && !('isComplex' in r && (r as { isComplex: boolean }).isComplex)) {
    return (r as { toNumber: () => number }).toNumber();
  }
  return NaN;
}

function wrap(node: MathNode): Fn {
  const code = node.compile();
  return (x) => {
    try {
      return toNum(code.evaluate({ x }));
    } catch {
      return NaN;
    }
  };
}

function numericDerivative(f: Fn): Fn {
  return (x) => {
    const h = 1e-5 * Math.max(1, Math.abs(x));
    return (f(x + h) - f(x - h)) / (2 * h);
  };
}

function toTex(node: MathNode): string {
  try {
    return node.toTex({ parenthesis: 'auto', implicit: 'hide' });
  } catch {
    return node.toString();
  }
}

const cache = new Map<string, Compiled>();

/** Parse a user expression in x. Throws a friendly Error on bad input. */
export function compileFn(src: string): Compiled {
  const expr = cleanExpr(src);
  const hit = cache.get(expr);
  if (hit) return hit;
  if (!expr) throw new Error('Enter a function of x.');
  let node: MathNode;
  try {
    node = parse(expr);
  } catch (e) {
    throw new Error((e as Error).message.replace(/\s*\(char \d+\)/, ''));
  }
  try {
    node.compile().evaluate({ x: 0.5 });
  } catch (e) {
    const m = (e as Error).message;
    if (/Undefined (symbol|function)/.test(m)) {
      throw new Error(m.replace('Undefined symbol', 'Unknown variable').replace('Undefined function', 'Unknown function') + ' (use x as the variable).');
    }
  }
  const f = wrap(node);
  // derivatives are only needed by some methods and symbolic simplify is slow,
  // so build them on first use
  let derived: { dnode: MathNode | null; df: Fn; d2f: Fn } | null = null;
  const derive = () => {
    if (derived) return derived;
    try {
      const dnode = simplify(derivative(node, 'x'));
      const df = wrap(dnode);
      let d2f: Fn;
      try {
        d2f = wrap(derivative(dnode, 'x'));
      } catch {
        d2f = numericDerivative(df);
      }
      derived = { dnode, df, d2f };
    } catch {
      const df = numericDerivative(f);
      derived = { dnode: null, df, d2f: numericDerivative(df) };
    }
    return derived;
  };
  let dfFast: Fn | null = null;
  let d2fFast: Fn | null = null;
  const out: Compiled = {
    f,
    node,
    tex: toTex(node),
    df: (x) => (dfFast ??= derive().df)(x),
    d2f: (x) => (d2fFast ??= derive().d2f)(x),
    get dnode() {
      return derive().dnode;
    },
    get dtex() {
      const d = derive().dnode;
      return d ? toTex(d) : null;
    },
  };
  if (cache.size > 200) cache.clear();
  cache.set(expr, out);
  return out;
}

/** Parse a numeric input that may itself be an expression like "pi/2". */
export function parseNum(src: string, label: string): number {
  const s = String(src ?? '').trim();
  if (!s) throw new Error(`${label} is required.`);
  let v: number;
  try {
    v = toNum(evaluate(cleanExpr(s)));
  } catch {
    v = NaN;
  }
  if (!Number.isFinite(v)) throw new Error(`${label} must be a number.`);
  return v;
}
