/* Canvas plotter: animated camera, pan/zoom/pinch, hover readout,
   all-roots markers, and a per-method overlay for each iteration. */
import { fmt, type Fn, type Step } from '../lib/methods';
import { scanRoots, type Run } from '../lib/solve';

const ok = Number.isFinite;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t: number) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number) => String(n).split('').map((d) => SUB[+d]).join('');

interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
interface LineOpts {
  color: string;
  width?: number;
  dash?: number[] | null;
  alpha?: number;
  t?: number;
}
type Colors = Record<'grid' | 'gridStrong' | 'axis' | 'label' | 'curve' | 'curve2' | 'step' | 'band' | 'root' | 'bg' | 'text', string>;

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
function tickLabel(v: number, step: number) {
  if (Math.abs(v) < step * 1e-6) return '0';
  if (Math.abs(v) >= 1e6 || step < 1e-4) return v.toExponential(2).replace(/\.?0+e/, 'e');
  return v.toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
}

export class Plot {
  private c: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tip: HTMLElement;
  private w = 1;
  private h = 1;
  private view: View = { x0: -5, x1: 5, y0: -4, y1: 4 };
  private target: View = { ...this.view };
  private f: Fn | null = null;
  private kind: 'f' | 'g' = 'f';
  private curveT = 1;
  private scene: Run | null = null;
  private hover: { px: number; py: number } | null = null;
  private clock = 0;
  private doneAt: number | null = null;
  private dragging = false;
  private col!: Colors;
  private raf = 0;
  private ro: ResizeObserver;
  private roots: number[] = [];
  private rootsKey = '';
  everFit = false;
  ph = 0;
  showAll = false;
  onFrame: ((dt: number) => void) | null = null;
  onUserMove: (() => void) | null = null;
  onReset: (() => void) | null = null;
  onPickRoot: ((x: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, tip: HTMLElement) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.tip = tip;
    this.refreshColors();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement!);
    this.resize();
    const cleanup = this.bindPointer();
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.clock += dt;
      this.tick(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.destroy = () => {
      cancelAnimationFrame(this.raf);
      this.ro.disconnect();
      cleanup();
    };
  }

  destroy: () => void;

  refreshColors() {
    const s = getComputedStyle(document.documentElement);
    const g = (n: string) => s.getPropertyValue(n).trim();
    this.col = {
      grid: g('--c-grid'),
      gridStrong: g('--c-grid-strong'),
      axis: g('--c-axis'),
      label: g('--c-label'),
      curve: g('--c-curve'),
      curve2: g('--c-curve-2'),
      step: g('--c-step'),
      band: g('--c-band'),
      root: g('--c-root'),
      bg: g('--bg-2'),
      text: g('--text'),
    };
  }

  private resize() {
    const r = this.c.parentElement!.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const oldW = this.w;
    const oldH = this.h;
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === oldW && h === oldH && this.c.width === Math.round(w * dpr)) return;
    this.w = w;
    this.h = h;
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // keep the y-scale proportional when the box changes shape
    if (oldW > 1 && oldH > 1) {
      for (const v of [this.view, this.target]) {
        const cy = (v.y0 + v.y1) / 2;
        const hy = ((v.y1 - v.y0) / 2) * (this.h / oldH) * (oldW / this.w);
        v.y0 = cy - hy;
        v.y1 = cy + hy;
      }
    }
  }

  // world <-> screen
  private sx(x: number) {
    const v = this.view;
    return ((x - v.x0) / (v.x1 - v.x0)) * this.w;
  }
  private sy(y: number) {
    const v = this.view;
    return this.h - ((y - v.y0) / (v.y1 - v.y0)) * this.h;
  }
  private wx(px: number) {
    const v = this.view;
    return v.x0 + (px / this.w) * (v.x1 - v.x0);
  }
  private wy(py: number) {
    const v = this.view;
    return v.y0 + ((this.h - py) / this.h) * (v.y1 - v.y0);
  }

  setFunction(f: Fn, kind: 'f' | 'g') {
    this.f = f;
    this.kind = kind;
    this.curveT = 0;
    this.rootsKey = '';
  }

  setScene(scene: Run | null) {
    this.scene = scene;
    this.doneAt = null;
  }

  /** Visible x-range, used to place picked roots sensibly. */
  get span() {
    return this.view.x1 - this.view.x0;
  }

  // ───── camera ─────
  fit(xa: number, xb: number, extraYs: number[] = [], { instant = false, pad = 1.35, minHalf = 1e-9 } = {}) {
    if (!ok(xa) || !ok(xb)) return;
    if (xa > xb) [xa, xb] = [xb, xa];
    const cx = (xa + xb) / 2;
    const half = Math.max(((xb - xa) / 2) * pad, minHalf, Math.abs(cx) * 1e-12);
    const x0 = cx - half;
    const x1 = cx + half;
    let y0: number;
    let y1: number;
    if (this.kind === 'g') {
      const hy = half * (this.h / this.w);
      y0 = cx - hy;
      y1 = cx + hy;
    } else {
      const ys = [0, ...extraYs.filter(ok)];
      const samp: number[] = [];
      if (this.f) {
        for (let i = 0; i <= 160; i++) {
          const y = this.f(lerp(x0, x1, i / 160));
          if (ok(y)) samp.push(y);
        }
      }
      samp.sort((a, b) => a - b);
      if (samp.length) ys.push(samp[Math.floor(samp.length * 0.04)], samp[Math.max(0, Math.ceil(samp.length * 0.96) - 1)]);
      y0 = Math.min(...ys);
      y1 = Math.max(...ys);
      const span = Math.max(y1 - y0, (x1 - x0) * 0.05, 1e-12);
      const mid = (y0 + y1) / 2;
      y0 = mid - (span / 2) * 1.3;
      y1 = mid + (span / 2) * 1.3;
    }
    this.target = { x0, x1, y0, y1 };
    if (instant) this.view = { ...this.target };
  }

  // ───── frame ─────
  private tick(dt: number) {
    this.onFrame?.(dt);
    const k = 1 - Math.exp(-dt * 5.5);
    // interpolate centre linearly and half-width logarithmically so zooms feel natural
    for (const [a, b] of [
      ['x0', 'x1'],
      ['y0', 'y1'],
    ] as const) {
      const c0 = (this.view[a] + this.view[b]) / 2;
      const h0 = (this.view[b] - this.view[a]) / 2;
      const c1 = (this.target[a] + this.target[b]) / 2;
      const h1 = (this.target[b] - this.target[a]) / 2;
      const c = lerp(c0, c1, k);
      const h = Math.exp(lerp(Math.log(h0), Math.log(h1), k));
      this.view[a] = c - h;
      this.view[b] = c + h;
    }
    this.curveT = Math.min(1, this.curveT + dt / 1.1);
    this.draw();
  }

  private draw() {
    const { ctx, w, h, col } = this;
    ctx.clearRect(0, 0, w, h);
    this.drawGrid();
    if (this.kind === 'g') this.drawIdentity();
    if (this.f) this.drawCurve(this.f, col.curve, easeInOut(this.curveT));
    if (this.showAll && this.curveT >= 1) this.drawAllRoots();
    if (this.scene) this.drawScene();
    this.drawHover();
  }

  private drawGrid() {
    const { ctx, w, h, col, view: v } = this;
    const stepX = niceStep((v.x1 - v.x0) / Math.max(3, w / 110));
    const stepY = niceStep((v.y1 - v.y0) / Math.max(3, h / 80));
    const lines = (style: string, sxs: number, sys: number) => {
      ctx.strokeStyle = style;
      ctx.beginPath();
      for (let x = Math.ceil(v.x0 / sxs) * sxs; x <= v.x1; x += sxs) {
        const p = Math.round(this.sx(x)) + 0.5;
        ctx.moveTo(p, 0);
        ctx.lineTo(p, h);
      }
      for (let y = Math.ceil(v.y0 / sys) * sys; y <= v.y1; y += sys) {
        const p = Math.round(this.sy(y)) + 0.5;
        ctx.moveTo(0, p);
        ctx.lineTo(w, p);
      }
      ctx.stroke();
    };
    ctx.lineWidth = 1;
    lines(col.grid, stepX / 5, stepY / 5);
    lines(col.gridStrong, stepX, stepY);
    const ax = this.sy(0);
    const ay = this.sx(0);
    ctx.strokeStyle = col.axis;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (ax >= 0 && ax <= h) {
      ctx.moveTo(0, ax);
      ctx.lineTo(w, ax);
    }
    if (ay >= 0 && ay <= w) {
      ctx.moveTo(ay, 0);
      ctx.lineTo(ay, h);
    }
    ctx.stroke();
    ctx.fillStyle = col.label;
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    const ly = clamp(ax + 15, 15, h - 6);
    ctx.textAlign = 'center';
    for (let x = Math.ceil(v.x0 / stepX) * stepX; x <= v.x1; x += stepX) {
      const p = this.sx(x);
      if (Math.abs(x) < stepX * 1e-6 || p < 20 || p > w - 20) continue;
      ctx.fillText(tickLabel(x, stepX), p, ly);
    }
    const lx = clamp(ay - 6, 40, w - 6);
    ctx.textAlign = 'right';
    for (let y = Math.ceil(v.y0 / stepY) * stepY; y <= v.y1; y += stepY) {
      const p = this.sy(y);
      if (Math.abs(y) < stepY * 1e-6 || p < 12 || p > h - 10) continue;
      ctx.fillText(tickLabel(y, stepY), lx, p + 4);
    }
  }

  private drawIdentity() {
    const { ctx, col, view: v } = this;
    const a = Math.min(v.x0, v.y0);
    const b = Math.max(v.x1, v.y1);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = col.curve2;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(this.sx(a), this.sy(a));
    ctx.lineTo(this.sx(b), this.sy(b));
    ctx.stroke();
    ctx.restore();
  }

  private tracePath(fn: Fn, fromPx: number, toPx: number) {
    const { ctx, h } = this;
    ctx.beginPath();
    let pen = false;
    let prev = 0;
    let hx = 0;
    let hy = 0;
    for (let px = fromPx; px <= toPx; px += 1) {
      const y = fn(this.wx(px));
      if (!ok(y)) {
        pen = false;
        continue;
      }
      let py = this.sy(y);
      if (pen && Math.abs(py - prev) > h * 1.5) pen = false;
      prev = py;
      py = clamp(py, -h * 2, h * 3);
      if (!pen) {
        ctx.moveTo(px, py);
        pen = true;
      } else ctx.lineTo(px, py);
      hx = px;
      hy = py;
    }
    return { pen, hx, hy };
  }

  private drawCurve(fn: Fn, color: string, progress: number) {
    const { ctx } = this;
    const { pen, hx, hy } = this.tracePath(fn, 0, this.w * progress);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    if (progress < 1 && pen) this.dotPx(hx, hy, 5, color, true);
  }

  private residual(): Fn | null {
    const f = this.f;
    if (!f) return null;
    return this.kind === 'g' ? (x) => f(x) - x : f;
  }

  private drawAllRoots() {
    const h = this.residual();
    if (!h) return;
    const v = this.view;
    const key = [v.x0, v.x1].map((n) => n.toPrecision(5)).join();
    if (key !== this.rootsKey) {
      this.rootsKey = key;
      this.roots = scanRoots(h, v.x0, v.x1, Math.min(800, Math.round(this.w)));
    }
    const { ctx, col } = this;
    for (const r of this.roots) {
      const px = this.sx(r);
      const py = this.sy(this.kind === 'g' ? r : 0);
      ctx.save();
      ctx.strokeStyle = col.root;
      ctx.fillStyle = col.bg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ───── primitives (world coords) ─────
  private line(x1: number, y1: number, x2: number, y2: number, { color, width = 2, dash = null, alpha = 1, t = 1 }: LineOpts) {
    if (t <= 0) return;
    const { ctx } = this;
    const a = [this.sx(x1), this.sy(y1)];
    const b = [this.sx(x2), this.sy(y2)];
    const C = (n: number) => clamp(n, -1e5, 1e5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(C(a[0]), C(a[1]));
    ctx.lineTo(C(lerp(a[0], b[0], t)), C(lerp(a[1], b[1], t)));
    ctx.stroke();
    ctx.restore();
  }
  private dot(x: number, y: number, r: number, color: string, glow = false, alpha = 1) {
    this.dotPx(this.sx(x), this.sy(y), r, color, glow, alpha);
  }
  private dotPx(px: number, py: number, r: number, color: string, glow = false, alpha = 1) {
    if (r <= 0 || !ok(px) || !ok(py)) return;
    const { ctx } = this;
    ctx.save();
    if (glow) r *= 0.85;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, 7);
    ctx.fill();
    ctx.fillStyle = this.col.bg;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.42, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  private label(text: string, x: number, y: number, color: string, { dy = -14, alpha = 1 } = {}) {
    const { ctx } = this;
    const px = this.sx(x);
    const py = this.sy(y) + dy;
    if (!ok(px) || !ok(py) || px < -50 || px > this.w + 50 || py < -20 || py > this.h + 20) return;
    ctx.save();
    ctx.font = '500 11.5px "IBM Plex Mono", monospace';
    const tw = ctx.measureText(text).width + 12;
    const bx = clamp(px - tw / 2, 4, this.w - tw - 4);
    const by = clamp(py - 10, 4, this.h - 24);
    ctx.fillStyle = this.col.bg;
    ctx.globalAlpha = 0.85 * alpha;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, 20, 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, bx + tw / 2, by + 14);
    ctx.restore();
  }
  private vband(a: number, b: number, color: string, alpha = 1) {
    const { ctx } = this;
    const pa = this.sx(a);
    const pb = this.sx(b);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(pa, 0, pb - pa, this.h);
    ctx.restore();
  }
  private vline(x: number, color: string, alpha = 1) {
    const { ctx } = this;
    const p = this.sx(x);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, this.h);
    ctx.stroke();
    ctx.restore();
  }

  // ───── method overlays ─────
  private drawScene() {
    const s = this.scene!;
    const n = s.steps.length;
    const ph = clamp(this.ph, 0, n);
    // on an exact step boundary show the step that just finished, fully drawn
    const k = ph <= 0 ? 0 : Math.min(Math.ceil(ph) - 1, n - 1);
    const t = ph <= 0 ? 0 : clamp(ph - k, 0, 1);
    if (s.bracket) this.drawBracket(s, k, t);
    if (n > 0) {
      switch (s.method) {
        case 'newton':
          this.drawTangent(s, k, t, false);
          break;
        case 'halley':
          this.drawTangent(s, k, t, true);
          break;
        case 'secant':
          this.drawSecant(s, k, t);
          break;
        case 'muller':
          this.drawMuller(s, k, t);
          break;
        case 'fixed':
          this.drawCobweb(s, k, t);
          break;
        case 'steffensen':
          this.drawSteffensen(s, k, t);
          break;
      }
    }
    if (ph >= n && s.status !== 'failed' && ok(s.root)) {
      if (this.doneAt == null) this.doneAt = this.clock;
      const age = this.clock - this.doneAt;
      const ry = s.kind === 'g' ? s.root : 0;
      const { ctx, col } = this;
      const px = this.sx(s.root);
      const py = this.sy(ry);
      // circle the answer in red pen, slightly off-round like it was drawn by hand
      const draw = easeOut(age * 1.6);
      if (ok(px) && ok(py)) {
        ctx.save();
        ctx.strokeStyle = col.root;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const start = -2.2;
        const sweep = Math.PI * 2.15 * draw;
        for (let a = 0; a <= sweep; a += 0.08) {
          const r = 15 + 1.6 * Math.sin(a * 1.5 + 0.6);
          const x = px + r * 1.12 * Math.cos(start + a);
          const y = py + r * Math.sin(start + a);
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }
      const pop = easeOut(age * 3);
      this.dotPx(px, py, 6.5 * pop, col.root, true);
      this.label(`root ≈ ${fmt(s.root, 10)}`, s.root, ry, col.root, { dy: -22, alpha: pop });
    } else {
      this.doneAt = null;
    }
  }

  private drawBracket(s: Run, k: number, t: number) {
    const { col } = this;
    const steps = s.steps;
    const cur = steps[k];
    const prev = k > 0 ? steps[k - 1] : null;
    const e = easeOut(seg(t, 0, 0.45));
    let a = s.bracket!.a;
    let b = s.bracket!.b;
    if (cur && prev) {
      a = lerp(prev.a!, cur.a!, e);
      b = lerp(prev.b!, cur.b!, e);
    } else if (cur) {
      a = cur.a!;
      b = cur.b!;
    }
    this.vband(a, b, col.band);
    this.vline(a, col.curve2, 0.8);
    this.vline(b, col.curve2, 0.8);
    this.label('a', a, this.wy(14), col.curve2, { dy: 0 });
    this.label('b', b, this.wy(14), col.curve2, { dy: 0 });
    const fa = this.f ? this.f(a) : NaN;
    const fb = this.f ? this.f(b) : NaN;
    this.dot(a, fa, 4, col.curve2);
    this.dot(b, fb, 4, col.curve2);
    if (!cur) return;
    for (let j = 0; j < k; j++) this.dot(steps[j].x, 0, 3, col.step, false, 0.25 + 0.5 * (j / Math.max(1, k)));
    const m = seg(t, 0.35, 0.85);
    if (s.method === 'falsi' || s.method === 'illinois') {
      // the chord from (a, f(a)) to (b, f(b)) crosses zero at the new estimate.
      // For Illinois, a halved endpoint value shows up as a chord end off the curve.
      this.line(cur.a!, cur.fa!, cur.b!, cur.fb!, { color: col.step, width: 1.2, alpha: 0.35 * m });
      this.line(cur.a!, cur.fa!, cur.x, 0, { color: col.step, width: 2.2, t: easeInOut(m) });
      if (s.method === 'illinois' && this.f) {
        for (const [x, y] of [
          [cur.a!, cur.fa!],
          [cur.b!, cur.fb!],
        ]) {
          if (Math.abs(this.f(x) - y) > 1e-12 * (1 + Math.abs(y))) {
            this.line(x, this.f(x), x, y, { color: col.step, width: 1.5, dash: [3, 3], alpha: m });
            this.dot(x, y, 4, col.step, false, m);
            this.label('½f', x, y, col.step, { dy: y > 0 ? -16 : 22, alpha: m });
          }
        }
      }
    } else if (s.method === 'itp') {
      this.line(cur.a!, cur.fa!, cur.b!, cur.fb!, { color: col.step, width: 1.2, alpha: 0.3 * m, dash: [4, 4] });
    } else if (s.method === 'ridders') {
      const mm = seg(t, 0.15, 0.45);
      this.line(cur.mid!, 0, cur.mid!, cur.fmid!, { color: col.curve2, width: 1.6, dash: [4, 4], t: easeOut(mm) });
      if (mm > 0.5) this.dot(cur.mid!, cur.fmid!, 4, col.curve2, true);
      this.label('m', cur.mid!, 0, col.curve2, { dy: cur.fmid! > 0 ? 22 : -18, alpha: mm });
    }
    if (m > 0) {
      this.dot(cur.x, 0, 4.5 * easeOut(m * 2), col.step, true);
      this.line(cur.x, 0, cur.x, cur.fx, { color: col.step, width: 2, t: easeOut(m), dash: [4, 4] });
      if (m >= 1) this.dot(cur.x, cur.fx, 5, col.step, true);
      const name = s.method === 'bisection' ? 'p' : 'x';
      const tag = cur.kind ? ` · ${cur.kind}` : '';
      this.label(`${name}${sub(cur.i)}${tag}`, cur.x, 0, col.step, { dy: cur.fx > 0 ? 22 : -18, alpha: m });
    }
  }

  private drawTangent(s: Run, k: number, t: number, halley: boolean) {
    const { col } = this;
    for (let j = Math.max(0, k - 4); j < k; j++) {
      const st = s.steps[j];
      const fade = 0.12 + 0.25 * ((j - k + 5) / 5);
      this.line(st.from!, 0, st.from!, st.ffrom!, { color: col.curve2, width: 1.5, dash: [4, 4], alpha: fade });
      if (halley) this.drawHyperbola(st, 1, fade, 1.4);
      else this.line(st.from!, st.ffrom!, st.x, 0, { color: col.step, width: 1.6, alpha: fade });
      this.dot(st.x, 0, 3, col.step, false, fade + 0.2);
    }
    const st = s.steps[k];
    const a = seg(t, 0, 0.3);
    const b = seg(t, 0.25, 0.85);
    const c = seg(t, 0.8, 1);
    this.line(st.from!, 0, st.from!, st.ffrom!, { color: col.curve2, width: 1.8, dash: [4, 4], t: easeOut(a) });
    if (a > 0.6) this.dot(st.from!, st.ffrom!, 5, col.curve2, true);
    if (halley) {
      this.drawHyperbola(st, easeInOut(b), 1, 2.4);
    } else {
      const span = this.span;
      const tl = (x: number) => st.ffrom! + st.slope! * (x - st.from!);
      this.line(st.from! - span, tl(st.from! - span), st.from! + span, tl(st.from! + span), { color: col.step, width: 1, alpha: 0.18 * b });
      this.line(st.from!, st.ffrom!, st.x, 0, { color: col.step, width: 2.4, t: easeInOut(b) });
    }
    if (c > 0) {
      this.dot(st.x, 0, 5 * easeOut(c * 1.5), col.step, true);
      this.label(`x${sub(st.i)}`, st.x, 0, col.step, { dy: st.ffrom! > 0 ? 22 : -18, alpha: c });
    }
    if (k === 0) this.label(`x${sub(0)}`, st.from!, 0, col.curve2, { dy: st.ffrom! > 0 ? 22 : -18, alpha: a });
  }

  /** Halley’s osculating hyperbola, drawn from the current point to where it meets zero. */
  private drawHyperbola(st: Step, progress: number, alpha: number, width: number) {
    if (progress <= 0) return;
    const { ctx, col } = this;
    const k = ok(st.curv!) ? st.curv! : 0;
    const hyp = (x: number) => {
      const d = x - st.from!;
      const den = 1 - k * d;
      return den > 0.02 ? st.ffrom! + (st.slope! * d) / den : NaN;
    };
    // faint full hyperbola for context
    if (alpha >= 1) {
      this.tracePath(hyp, 0, this.w);
      ctx.save();
      ctx.strokeStyle = col.step;
      ctx.globalAlpha = 0.18 * progress;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    const N = 60;
    for (let i = 0; i <= N * progress; i++) {
      const x = lerp(st.from!, st.x, i / N);
      const y = hyp(x);
      const px = this.sx(x);
      const py = clamp(this.sy(ok(y) ? y : 0), -this.h * 2, this.h * 3);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = col.step;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  private drawSecant(s: Run, k: number, t: number) {
    const { col } = this;
    for (let j = Math.max(0, k - 4); j < k; j++) {
      const st = s.steps[j];
      const fade = 0.12 + 0.25 * ((j - k + 5) / 5);
      this.line(st.p0!, st.q0!, st.x, 0, { color: col.step, width: 1.5, alpha: fade });
      this.dot(st.x, 0, 3, col.step, false, fade + 0.2);
    }
    const st = s.steps[k];
    const a = seg(t, 0, 0.3);
    const b = seg(t, 0.25, 0.85);
    const c = seg(t, 0.8, 1);
    for (const [x, y] of [
      [st.p0!, st.q0!],
      [st.p1!, st.q1!],
    ]) {
      this.line(x, 0, x, y, { color: col.curve2, width: 1.6, dash: [4, 4], t: easeOut(a), alpha: 0.8 });
      if (a > 0.5) this.dot(x, y, 4.5, col.curve2, true);
    }
    const span = this.span;
    const m = (st.q1! - st.q0!) / (st.p1! - st.p0!);
    const sl = (x: number) => st.q1! + m * (x - st.p1!);
    this.line(st.p1! - span, sl(st.p1! - span), st.p1! + span, sl(st.p1! + span), { color: col.step, width: 1, alpha: 0.18 * b });
    const startX = Math.abs(st.p0! - st.x) > Math.abs(st.p1! - st.x) ? st.p0! : st.p1!;
    this.line(startX, sl(startX), st.x, 0, { color: col.step, width: 2.4, t: easeInOut(b) });
    if (c > 0) {
      this.dot(st.x, 0, 5 * easeOut(c * 1.5), col.step, true);
      this.label(`x${sub(st.i + 1)}`, st.x, 0, col.step, { dy: st.q1! > 0 ? 22 : -18, alpha: c });
    }
  }

  private drawMuller(s: Run, k: number, t: number) {
    const { ctx, col } = this;
    for (let j = Math.max(0, k - 3); j < k; j++) {
      const st = s.steps[j];
      this.dot(st.x, 0, 3, col.step, false, 0.3 + 0.15 * (j - k + 4));
    }
    const st = s.steps[k];
    const a = seg(t, 0, 0.3);
    const b = seg(t, 0.25, 0.85);
    const c = seg(t, 0.8, 1);
    for (const [x, y] of [
      [st.p0!, st.q0!],
      [st.p1!, st.q1!],
      [st.p2!, st.q2!],
    ]) {
      this.line(x, 0, x, y, { color: col.curve2, width: 1.5, dash: [4, 4], t: easeOut(a), alpha: 0.8 });
      if (a > 0.5) this.dot(x, y, 4.5, col.curve2, true);
    }
    // the interpolating parabola, revealed left to right, then the jump to its zero
    const par = (x: number) => st.q2! + st.qb! * (x - st.p2!) + st.qa! * (x - st.p2!) * (x - st.p2!);
    const lo = Math.min(st.p0!, st.p1!, st.p2!, st.x);
    const hi = Math.max(st.p0!, st.p1!, st.p2!, st.x);
    const pad = (hi - lo) * 0.6 + 1e-12;
    const from = this.sx(lo - pad);
    const to = this.sx(hi + pad);
    this.tracePath(par, Math.max(0, from), Math.min(this.w, from + (to - from) * easeInOut(b)));
    ctx.save();
    ctx.strokeStyle = col.step;
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.restore();
    if (c > 0) {
      this.dot(st.x, 0, 5 * easeOut(c * 1.5), col.step, true);
      this.label(`x${sub(st.i + 2)}`, st.x, 0, col.step, { dy: st.q2! > 0 ? 22 : -18, alpha: c });
    }
  }

  /** One cobweb leg: up/down to g(x), then across to the line y = x. */
  private leg(from: number, to: number, startY: number, p: number, alpha = 1, width = 2) {
    const v = seg(p, 0, 0.5);
    const hz = seg(p, 0.5, 1);
    this.line(from, startY, from, to, { color: this.col.step, width, t: easeInOut(v), alpha });
    if (hz > 0) this.line(from, to, to, to, { color: this.col.step, width, t: easeInOut(hz), alpha });
  }

  private drawCobweb(s: Run, k: number, t: number) {
    const { col } = this;
    for (let j = 0; j < k; j++) this.leg(s.steps[j].from!, s.steps[j].x, j === 0 ? 0 : s.steps[j].from!, 1);
    const st = s.steps[k];
    this.leg(st.from!, st.x, k === 0 ? 0 : st.from!, t);
    if (k === 0) this.dot(st.from!, 0, 4.5, col.curve2, true);
    if (t > 0.5) this.dot(st.from!, st.x, 4, col.curve, false);
    if (t >= 0.98) this.dot(st.x, st.x, 4.5, col.step, true);
  }

  private drawSteffensen(s: Run, k: number, t: number) {
    const { col } = this;
    for (let j = 0; j < k; j++) {
      const st = s.steps[j];
      this.dot(st.x, st.x, 3, col.step, false, 0.35 + 0.4 * (j / Math.max(1, k)));
      if (j < k) this.line(st.from!, st.from!, st.x, st.x, { color: col.step, width: 1.4, alpha: 0.25 });
    }
    const st = s.steps[k];
    // two ordinary cobweb legs (faint), then Aitken’s leap along y = x
    this.leg(st.from!, st.g1!, k === 0 ? 0 : st.from!, seg(t, 0, 0.3), 0.55, 1.6);
    this.leg(st.g1!, st.g2!, st.g1!, seg(t, 0.3, 0.6), 0.55, 1.6);
    const j = seg(t, 0.6, 0.95);
    if (j > 0) {
      this.line(st.from!, st.from!, st.x, st.x, { color: col.step, width: 2.6, t: easeInOut(j) });
      if (j >= 1) {
        this.dot(st.x, st.x, 5, col.step, true);
        this.label(`x${sub(st.i)}`, st.x, st.x, col.step, { dy: -18 });
      }
    }
    if (k === 0) this.dot(st.from!, st.from!, 4.5, col.curve2, true);
  }

  private drawHover() {
    const hv = this.hover;
    if (!hv || !this.f || this.dragging) {
      this.tip.classList.remove('on');
      return;
    }
    const x = this.wx(hv.px);
    const y = this.f(x);
    if (!ok(y)) {
      this.tip.classList.remove('on');
      return;
    }
    const { ctx, col } = this;
    const px = hv.px;
    const py = this.sy(y);
    ctx.save();
    ctx.strokeStyle = col.axis;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, this.h);
    ctx.stroke();
    ctx.restore();
    if (py > -10 && py < this.h + 10) this.dotPx(px, py, 4.5, col.curve, true);
    const near = this.nearRoot(hv.px, hv.py);
    const name = this.kind === 'g' ? 'g' : 'f';
    this.tip.textContent =
      near != null ? `root ≈ ${fmt(near, 10)}   click to solve here` : `x = ${fmt(x, 6)}   ${name}(x) = ${fmt(y, 6)}`;
    const tw = this.tip.offsetWidth;
    const tx = px + 14 + tw > this.w ? px - tw - 14 : px + 14;
    const ty = clamp(py - 40, 8, this.h - 40);
    this.tip.style.left = tx + 'px';
    this.tip.style.top = ty + 'px';
    this.tip.classList.add('on');
  }

  private nearRoot(px: number, py: number): number | null {
    if (!this.showAll) return null;
    for (const r of this.roots) {
      const rx = this.sx(r);
      const ry = this.sy(this.kind === 'g' ? r : 0);
      // generous radius so markers are easy to hit with a finger
      if (Math.hypot(rx - px, ry - py) < 18) return r;
    }
    return null;
  }

  // ───── interaction ─────
  private bindPointer() {
    const el = this.c.parentElement!;
    const pts = new Map<number, { px: number; py: number }>();
    let lastPinch: number | null = null;
    let downAt: { px: number; py: number } | null = null;
    let tapTimer: ReturnType<typeof setTimeout> | undefined;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { px: e.clientX - r.left, py: e.clientY - r.top };
    };
    const userMoved = () => this.onUserMove?.();

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      el.setPointerCapture(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      downAt = p;
      this.dragging = true;
      el.classList.add('dragging');
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      this.hover = e.pointerType === 'mouse' ? p : null;
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        if (downAt && Math.hypot(p.px - downAt.px, p.py - downAt.py) < 4) return;
        const dx = ((p.px - prev.px) / this.w) * (this.view.x1 - this.view.x0);
        const dy = ((p.py - prev.py) / this.h) * (this.view.y1 - this.view.y0);
        for (const v of [this.view, this.target]) {
          v.x0 -= dx;
          v.x1 -= dx;
          v.y0 += dy;
          v.y1 += dy;
        }
        userMoved();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.px - b.px, a.py - b.py);
        if (lastPinch) this.zoomAt((a.px + b.px) / 2, (a.py + b.py) / 2, lastPinch / d, true);
        lastPinch = d;
        userMoved();
      }
    };
    const release = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      lastPinch = null;
      downAt = null;
      if (!pts.size) {
        this.dragging = false;
        el.classList.remove('dragging');
      }
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      // a tap (no drag): pick a marked root, or on touch screens show the readout there
      if (downAt && pts.size === 1 && Math.hypot(p.px - downAt.px, p.py - downAt.py) < 8) {
        const r = this.nearRoot(p.px, p.py);
        if (r != null) this.onPickRoot?.(r);
        else if (e.pointerType !== 'mouse') {
          this.hover = p;
          clearTimeout(tapTimer);
          tapTimer = setTimeout(() => (this.hover = null), 2500);
        }
      }
      release(e);
    };
    const leave = (e: PointerEvent) => {
      // touch pointers "leave" right after every tap; keep the tap readout visible
      if (e.pointerType === 'mouse') this.hover = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      this.zoomAt(p.px, p.py, Math.exp(e.deltaY * 0.0016));
      userMoved();
    };
    const dbl = () => this.onReset?.();

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    // fires when the browser takes over a vertical swipe to scroll the page
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', release);
      clearTimeout(tapTimer);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
    };
  }

  zoomAt(px: number, py: number, factor: number, instant = false) {
    const x = this.wx(px);
    const y = this.wy(py);
    const v = this.target;
    v.x0 = x + (v.x0 - x) * factor;
    v.x1 = x + (v.x1 - x) * factor;
    v.y0 = y + (v.y0 - y) * factor;
    v.y1 = y + (v.y1 - y) * factor;
    if (instant) this.view = { ...v };
  }

  zoomCenter(factor: number) {
    this.zoomAt(this.w / 2, this.h / 2, factor);
  }
}
