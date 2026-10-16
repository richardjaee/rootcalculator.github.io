/* Canvas plotter with an animated camera, pan/zoom, hover readout and
   per-method iteration overlays. */
(function () {
  'use strict';

  const ok = Number.isFinite;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOut = (t) => (t = clamp(t, 0, 1), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = (n) => String(n).split('').map((d) => SUB[d]).join('');

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function tickLabel(v, step) {
    if (Math.abs(v) < step * 1e-6) return '0';
    const a = Math.abs(v);
    if (a >= 1e6 || step < 1e-4) return v.toExponential(2).replace(/\.?0+e/, 'e');
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return v.toFixed(dec);
  }

  class Plot {
    constructor(canvas, tip) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.tip = tip;
      this.w = 1; this.h = 1;
      this.view = { x0: -5, x1: 5, y0: -4, y1: 4 };
      this.target = { ...this.view };
      this.f = null;
      this.kind = 'f';
      this.curveT = 1;
      this.scene = null;
      this.ph = 0;
      this.hover = null;
      this.clock = 0;
      this.doneAt = null;
      this.onFrame = null;
      this.onUserMove = null;
      this.onReset = null;
      this.refreshColors();

      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      this.resize();
      this.bindPointer();

      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this.clock += dt;
        this.tick(dt);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    refreshColors() {
      const s = getComputedStyle(document.documentElement);
      const g = (n) => s.getPropertyValue(n).trim();
      this.col = {
        grid: g('--c-grid'), gridStrong: g('--c-grid-strong'), axis: g('--c-axis'), label: g('--c-label'),
        curve: g('--c-curve'), curve2: g('--c-curve-2'), step: g('--c-step'), band: g('--c-band'),
        root: g('--c-root'), bg: g('--bg-2'), text: g('--text'),
      };
    }

    resize() {
      const r = this.c.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const oldW = this.w, oldH = this.h;
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // keep the y-scale proportional when the box changes shape
      if (oldW > 1 && oldH > 1) {
        for (const v of [this.view, this.target]) {
          const cy = (v.y0 + v.y1) / 2, hy = (v.y1 - v.y0) / 2 * (this.h / oldH) * (oldW / this.w);
          v.y0 = cy - hy; v.y1 = cy + hy;
        }
      }
    }

    // world <-> screen
    sx(x) { const v = this.view; return (x - v.x0) / (v.x1 - v.x0) * this.w; }
    sy(y) { const v = this.view; return this.h - (y - v.y0) / (v.y1 - v.y0) * this.h; }
    wx(px) { const v = this.view; return v.x0 + px / this.w * (v.x1 - v.x0); }
    wy(py) { const v = this.view; return v.y0 + (this.h - py) / this.h * (v.y1 - v.y0); }

    setFunction(f, kind) {
      this.f = f;
      this.kind = kind;
      this.curveT = 0;
    }

    setScene(scene) {
      this.scene = scene;
      this.ph = 0;
      this.doneAt = null;
    }

    // ───── camera ─────
    fit(xa, xb, extraYs = [], { instant = false, pad = 1.35, minHalf = 1e-9 } = {}) {
      if (!ok(xa) || !ok(xb)) return;
      if (xa > xb) [xa, xb] = [xb, xa];
      const cx = (xa + xb) / 2;
      const half = Math.max((xb - xa) / 2 * pad, minHalf, Math.abs(cx) * 1e-12);
      const x0 = cx - half, x1 = cx + half;
      let y0, y1;
      if (this.kind === 'g') {
        const hy = half * (this.h / this.w);
        y0 = cx - hy; y1 = cx + hy;
      } else {
        const ys = [0, ...extraYs.filter(ok)];
        const samp = [];
        if (this.f) for (let i = 0; i <= 160; i++) { const y = this.f(lerp(x0, x1, i / 160)); if (ok(y)) samp.push(y); }
        samp.sort((a, b) => a - b);
        if (samp.length) ys.push(samp[Math.floor(samp.length * 0.04)], samp[Math.floor(samp.length * 0.96) - (samp.length > 1 ? 1 : 0)]);
        y0 = Math.min(...ys); y1 = Math.max(...ys);
        const span = Math.max(y1 - y0, (x1 - x0) * 0.05, 1e-12);
        const mid = (y0 + y1) / 2;
        y0 = mid - span / 2 * 1.3; y1 = mid + span / 2 * 1.3;
      }
      this.target = { x0, x1, y0, y1 };
      if (instant) this.view = { ...this.target };
    }

    // ───── frame ─────
    tick(dt) {
      if (this.onFrame) this.onFrame(dt);
      const k = 1 - Math.exp(-dt * 5.5);
      // interpolate in center/half-width space so zooms feel natural
      for (const [a, b] of [['x0', 'x1'], ['y0', 'y1']]) {
        const c0 = (this.view[a] + this.view[b]) / 2, h0 = (this.view[b] - this.view[a]) / 2;
        const c1 = (this.target[a] + this.target[b]) / 2, h1 = (this.target[b] - this.target[a]) / 2;
        const c = lerp(c0, c1, k), h = Math.exp(lerp(Math.log(h0), Math.log(h1), k));
        this.view[a] = c - h; this.view[b] = c + h;
      }
      this.curveT = Math.min(1, this.curveT + dt / 1.1);
      this.draw();
    }

    draw() {
      const { ctx, w, h, col } = this;
      ctx.clearRect(0, 0, w, h);
      this.drawGrid();
      if (this.kind === 'g') this.drawIdentity();
      if (this.f) this.drawCurve(this.f, col.curve, easeInOut(this.curveT));
      if (this.scene) this.drawScene();
      this.drawHover();
    }

    drawGrid() {
      const { ctx, w, h, col, view: v } = this;
      const stepX = niceStep((v.x1 - v.x0) / Math.max(3, w / 110));
      const stepY = niceStep((v.y1 - v.y0) / Math.max(3, h / 80));
      ctx.lineWidth = 1;
      // minor
      ctx.strokeStyle = col.grid;
      ctx.beginPath();
      for (let x = Math.ceil(v.x0 / (stepX / 5)) * (stepX / 5); x <= v.x1; x += stepX / 5) { const p = Math.round(this.sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, h); }
      for (let y = Math.ceil(v.y0 / (stepY / 5)) * (stepY / 5); y <= v.y1; y += stepY / 5) { const p = Math.round(this.sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(w, p); }
      ctx.stroke();
      // major
      ctx.strokeStyle = col.gridStrong;
      ctx.beginPath();
      for (let x = Math.ceil(v.x0 / stepX) * stepX; x <= v.x1; x += stepX) { const p = Math.round(this.sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, h); }
      for (let y = Math.ceil(v.y0 / stepY) * stepY; y <= v.y1; y += stepY) { const p = Math.round(this.sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(w, p); }
      ctx.stroke();
      // axes
      const ax = this.sy(0), ay = this.sx(0);
      ctx.strokeStyle = col.axis; ctx.lineWidth = 1.25;
      ctx.beginPath();
      if (ax >= 0 && ax <= h) { ctx.moveTo(0, ax); ctx.lineTo(w, ax); }
      if (ay >= 0 && ay <= w) { ctx.moveTo(ay, 0); ctx.lineTo(ay, h); }
      ctx.stroke();
      // labels
      ctx.fillStyle = col.label;
      ctx.font = '500 11px "JetBrains Mono", monospace';
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

    drawIdentity() {
      const { ctx, col, view: v } = this;
      const a = Math.min(v.x0, v.y0), b = Math.max(v.x1, v.y1);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = col.curve2; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(this.sx(a), this.sy(a)); ctx.lineTo(this.sx(b), this.sy(b)); ctx.stroke();
      ctx.restore();
    }

    drawCurve(fn, color, progress) {
      const { ctx, w, h } = this;
      const maxPx = w * progress;
      ctx.beginPath();
      let pen = false, prev = 0, hx = 0, hy = 0;
      for (let px = 0; px <= maxPx; px += 1) {
        const y = fn(this.wx(px));
        if (!ok(y)) { pen = false; continue; }
        let py = this.sy(y);
        if (pen && Math.abs(py - prev) > h * 1.5) pen = false;
        prev = py;
        py = clamp(py, -h * 2, h * 3);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
        hx = px; hy = py;
      }
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.18; ctx.lineWidth = 9; ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.restore();
      if (progress < 1 && pen) this.dotPx(hx, hy, 5, color, true);
    }

    // ───── primitives (world coords) ─────
    line(x1, y1, x2, y2, { color, width = 2, dash = null, alpha = 1, t = 1 } = {}) {
      if (t <= 0) return;
      const { ctx } = this;
      const a = [this.sx(x1), this.sy(y1)], b = [this.sx(x2), this.sy(y2)];
      ctx.save();
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(...a.map((v) => clamp(v, -1e5, 1e5)));
      ctx.lineTo(clamp(lerp(a[0], b[0], t), -1e5, 1e5), clamp(lerp(a[1], b[1], t), -1e5, 1e5));
      ctx.stroke(); ctx.restore();
    }
    dot(x, y, r, color, opts) { this.dotPx(this.sx(x), this.sy(y), r, color, opts); }
    dotPx(px, py, r, color, glow = false, alpha = 1) {
      if (r <= 0) return;
      const { ctx } = this;
      ctx.save(); ctx.globalAlpha = alpha;
      if (glow) { ctx.fillStyle = color; ctx.globalAlpha = 0.22 * alpha; ctx.beginPath(); ctx.arc(px, py, r * 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = alpha; }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
      ctx.fillStyle = this.col.bg; ctx.beginPath(); ctx.arc(px, py, r * 0.42, 0, 7); ctx.fill();
      ctx.restore();
    }
    label(text, x, y, color, { dy = -14, alpha = 1 } = {}) {
      const { ctx } = this;
      const px = this.sx(x), py = this.sy(y) + dy;
      if (px < -50 || px > this.w + 50 || py < -20 || py > this.h + 20) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '600 11.5px "JetBrains Mono", monospace';
      const tw = ctx.measureText(text).width + 12;
      const bx = clamp(px - tw / 2, 4, this.w - tw - 4), by = clamp(py - 10, 4, this.h - 24);
      ctx.fillStyle = this.col.bg; ctx.globalAlpha = 0.85 * alpha;
      ctx.beginPath(); ctx.roundRect(bx, by, tw, 20, 6); ctx.fill();
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = color; ctx.textAlign = 'center';
      ctx.fillText(text, bx + tw / 2, by + 14);
      ctx.restore();
    }
    vband(a, b, color, alpha = 1) {
      const { ctx } = this;
      const pa = this.sx(a), pb = this.sx(b);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = color; ctx.fillRect(pa, 0, pb - pa, this.h);
      ctx.restore();
    }
    vline(x, color, alpha = 1) {
      const { ctx } = this;
      const p = this.sx(x);
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, this.h); ctx.stroke(); ctx.restore();
    }

    // ───── method overlays ─────
    drawScene() {
      const s = this.scene;
      const n = s.steps.length;
      const ph = clamp(this.ph, 0, n);
      const k = Math.min(Math.floor(ph), n - 1);
      const t = ph >= n ? 1 : ph - Math.floor(ph);
      if (s.method === 'bisection' && s.bracket) this.drawBisection(s, k, t, ph);
      if (n > 0) {
        if (s.method === 'newton') this.drawNewton(s, k, t);
        if (s.method === 'secant') this.drawSecant(s, k, t);
        if (s.method === 'fixed') this.drawFixed(s, k, t);
      }
      if (ph >= n && s.status !== 'failed' && ok(s.root)) {
        if (this.doneAt == null) this.doneAt = this.clock;
        const age = this.clock - this.doneAt;
        const ry = s.method === 'fixed' ? s.root : 0;
        const { ctx, col } = this;
        const px = this.sx(s.root), py = this.sy(ry);
        for (let i = 0; i < 2; i++) {
          const p = ((age * 0.7 + i * 0.5) % 1);
          ctx.save(); ctx.strokeStyle = col.root; ctx.globalAlpha = (1 - p) * 0.8; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px, py, 6 + p * 26, 0, 7); ctx.stroke(); ctx.restore();
        }
        const pop = easeOut(age * 3);
        this.dotPx(px, py, 6.5 * pop, col.root, true);
        this.label(`root ≈ ${RootMethods.fmt(s.root, 10)}`, s.root, ry, col.root, { dy: -22, alpha: pop });
      } else {
        this.doneAt = null;
      }
    }

    drawBisection(s, k, t, ph) {
      const { col } = this;
      const steps = s.steps;
      const cur = steps[k];
      const prev = k > 0 ? steps[k - 1] : null;
      const e = easeOut(seg(t, 0, 0.45));
      // bracket shrinks from the previous interval to the current one
      let a, b;
      if (!cur) { a = s.bracket.a; b = s.bracket.b; }
      else if (prev) { a = lerp(prev.a, cur.a, e); b = lerp(prev.b, cur.b, e); }
      else { a = cur.a; b = cur.b; }
      this.vband(a, b, col.band, s.status === 'failed' && !cur ? 0.5 : 1);
      this.vline(a, col.curve2, 0.8);
      this.vline(b, col.curve2, 0.8);
      this.label('a', a, this.wy(14), col.curve2, { dy: 0 });
      this.label('b', b, this.wy(14), col.curve2, { dy: 0 });
      if (this.f) {
        this.dot(a, this.f(a), 4, col.curve2);
        this.dot(b, this.f(b), 4, col.curve2);
      }
      if (!cur) return;
      // past midpoints
      for (let j = 0; j < k; j++) this.dot(steps[j].x, 0, 3, col.step, false, 0.25 + 0.5 * (j / Math.max(1, k)));
      // current midpoint
      const m = seg(t, 0.35, 0.85);
      if (m > 0) {
        this.dot(cur.x, 0, 4.5 * easeOut(m * 2), col.step, true);
        this.line(cur.x, 0, cur.x, cur.fx, { color: col.step, width: 2, t: easeOut(m), dash: [4, 4] });
        if (m >= 1) this.dot(cur.x, cur.fx, 5, col.step, true);
        this.label(`p${sub(cur.i)}`, cur.x, 0, col.step, { dy: cur.fx > 0 ? 22 : -18, alpha: m });
      }
    }

    drawNewton(s, k, t) {
      const { col } = this;
      for (let j = Math.max(0, k - 4); j < k; j++) {
        const st = s.steps[j], fade = 0.12 + 0.25 * ((j - k + 5) / 5);
        this.line(st.from, 0, st.from, st.ffrom, { color: col.curve2, width: 1.5, dash: [4, 4], alpha: fade });
        this.line(st.from, st.ffrom, st.x, 0, { color: col.step, width: 1.6, alpha: fade });
        this.dot(st.x, 0, 3, col.step, false, fade + 0.2);
      }
      const st = s.steps[k];
      const a = seg(t, 0, 0.3), b = seg(t, 0.25, 0.85), c = seg(t, 0.8, 1);
      this.line(st.from, 0, st.from, st.ffrom, { color: col.curve2, width: 1.8, dash: [4, 4], t: easeOut(a) });
      if (a > 0.6) this.dot(st.from, st.ffrom, 5, col.curve2, true);
      // faint full tangent line
      const span = this.view.x1 - this.view.x0;
      const tl = (x) => st.ffrom + st.slope * (x - st.from);
      this.line(st.from - span, tl(st.from - span), st.from + span, tl(st.from + span), { color: col.step, width: 1, alpha: 0.18 * b });
      this.line(st.from, st.ffrom, st.x, 0, { color: col.step, width: 2.4, t: easeInOut(b) });
      if (c > 0) {
        this.dot(st.x, 0, 5 * easeOut(c * 1.5), col.step, true);
        this.label(`x${sub(st.i)}`, st.x, 0, col.step, { dy: st.ffrom > 0 ? 22 : -18, alpha: c });
      }
      if (k === 0) this.label(`x${sub(0)}`, st.from, 0, col.curve2, { dy: st.ffrom > 0 ? 22 : -18, alpha: a });
    }

    drawSecant(s, k, t) {
      const { col } = this;
      for (let j = Math.max(0, k - 4); j < k; j++) {
        const st = s.steps[j], fade = 0.12 + 0.25 * ((j - k + 5) / 5);
        this.line(st.p0, st.q0, st.x, 0, { color: col.step, width: 1.5, alpha: fade });
        this.dot(st.x, 0, 3, col.step, false, fade + 0.2);
      }
      const st = s.steps[k];
      const a = seg(t, 0, 0.3), b = seg(t, 0.25, 0.85), c = seg(t, 0.8, 1);
      for (const [x, y] of [[st.p0, st.q0], [st.p1, st.q1]]) {
        this.line(x, 0, x, y, { color: col.curve2, width: 1.6, dash: [4, 4], t: easeOut(a), alpha: 0.8 });
        if (a > 0.5) this.dot(x, y, 4.5, col.curve2, true);
      }
      const span = this.view.x1 - this.view.x0;
      const m = (st.q1 - st.q0) / (st.p1 - st.p0);
      const sl = (x) => st.q1 + m * (x - st.p1);
      this.line(st.p1 - span, sl(st.p1 - span), st.p1 + span, sl(st.p1 + span), { color: col.step, width: 1, alpha: 0.18 * b });
      // draw from the farther anchor through to the new estimate
      const startX = Math.abs(st.p0 - st.x) > Math.abs(st.p1 - st.x) ? st.p0 : st.p1;
      this.line(startX, sl(startX), st.x, 0, { color: col.step, width: 2.4, t: easeInOut(b) });
      if (c > 0) {
        this.dot(st.x, 0, 5 * easeOut(c * 1.5), col.step, true);
        this.label(`x${sub(st.i + 1)}`, st.x, 0, col.step, { dy: st.q1 > 0 ? 22 : -18, alpha: c });
      }
    }

    drawFixed(s, k, t) {
      const { col } = this;
      const leg = (st, j, p) => {
        const y0 = j === 0 ? 0 : st.from;
        const v = seg(p, 0, 0.5), hz = seg(p, 0.5, 1);
        this.line(st.from, y0, st.from, st.x, { color: col.step, width: 2, t: easeInOut(v) });
        if (hz > 0) this.line(st.from, st.x, st.x, st.x, { color: col.step, width: 2, t: easeInOut(hz) });
      };
      for (let j = 0; j < k; j++) leg(s.steps[j], j, 1);
      leg(s.steps[k], k, t);
      const st = s.steps[k];
      if (k === 0) this.dot(st.from, 0, 4.5, col.curve2, true);
      if (t > 0.5) this.dot(st.from, st.x, 4, col.curve, false);
      if (t >= 0.98) this.dot(st.x, st.x, 4.5, col.step, true);
    }

    drawHover() {
      const hv = this.hover;
      if (!hv || !this.f || this.dragging) { this.tip.classList.remove('on'); return; }
      const x = this.wx(hv.px), y = this.f(x);
      if (!ok(y)) { this.tip.classList.remove('on'); return; }
      const { ctx, col } = this;
      const px = hv.px, py = this.sy(y);
      ctx.save();
      ctx.strokeStyle = col.axis; ctx.globalAlpha = 0.35; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this.h); ctx.stroke();
      ctx.restore();
      if (py > -10 && py < this.h + 10) this.dotPx(px, py, 4.5, col.curve, true);
      const name = this.kind === 'g' ? 'g' : 'f';
      this.tip.textContent = `x = ${RootMethods.fmt(x, 6)}   ${name}(x) = ${RootMethods.fmt(y, 6)}`;
      const tw = this.tip.offsetWidth;
      const tx = px + 14 + tw > this.w ? px - tw - 14 : px + 14;
      const ty = clamp(py - 40, 8, this.h - 40);
      this.tip.style.left = tx + 'px'; this.tip.style.top = ty + 'px';
      this.tip.classList.add('on');
    }

    // ───── interaction ─────
    bindPointer() {
      const el = this.c.parentElement;
      const pts = new Map();
      let lastPinch = null;
      const local = (e) => { const r = el.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
      const userMoved = () => { if (this.onUserMove) this.onUserMove(); };

      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        el.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, local(e));
        this.dragging = true;
        el.classList.add('dragging');
      });
      el.addEventListener('pointermove', (e) => {
        const p = local(e);
        this.hover = e.pointerType === 'mouse' ? p : null;
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId);
        pts.set(e.pointerId, p);
        if (pts.size === 1) {
          const dx = (p.px - prev.px) / this.w * (this.view.x1 - this.view.x0);
          const dy = (p.py - prev.py) / this.h * (this.view.y1 - this.view.y0);
          for (const v of [this.view, this.target]) { v.x0 -= dx; v.x1 -= dx; v.y0 += dy; v.y1 += dy; }
          userMoved();
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.px - b.px, a.py - b.py);
          if (lastPinch) this.zoomAt((a.px + b.px) / 2, (a.py + b.py) / 2, lastPinch / d, true);
          lastPinch = d;
          userMoved();
        }
      });
      const up = (e) => {
        pts.delete(e.pointerId);
        lastPinch = null;
        if (!pts.size) { this.dragging = false; el.classList.remove('dragging'); }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', () => { this.hover = null; });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const p = local(e);
        this.zoomAt(p.px, p.py, Math.exp(e.deltaY * 0.0016));
        userMoved();
      }, { passive: false });
      el.addEventListener('dblclick', () => { if (this.onReset) this.onReset(); });
    }

    zoomAt(px, py, factor, instant = false) {
      const x = this.wx(px), y = this.wy(py);
      const v = this.target;
      v.x0 = x + (v.x0 - x) * factor; v.x1 = x + (v.x1 - x) * factor;
      v.y0 = y + (v.y0 - y) * factor; v.y1 = y + (v.y1 - y) * factor;
      if (instant) this.view = { ...v };
    }
  }

  window.Plot = Plot;
})();
