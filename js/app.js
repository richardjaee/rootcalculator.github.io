(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const ok = Number.isFinite;
  const { fmt } = RootMethods;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ───────────── Method definitions ─────────────
  const METHODS = {
    bisection: {
      tagline: 'Keep halving an interval where f(x) changes sign. Slow, steady, and guaranteed.',
      tex: 'p_n = \\dfrac{a_n + b_n}{2}',
      fn: 'f(x)',
      fields: [{ key: 'a', label: 'Lower bound a' }, { key: 'b', label: 'Upper bound b' }],
      presets: [
        { fx: 'x^3 - x - 2', a: '1', b: '2' },
        { fx: 'cos(x) - x', a: '0', b: '1' },
        { fx: 'x^2 - 2', a: '0', b: '2' },
        { fx: 'e^x - 3x', a: '0', b: '1' },
      ],
      cols: [
        ['n', (s) => s.i],
        ['a', (s) => fmt(s.a, 9)],
        ['b', (s) => fmt(s.b, 9)],
        ['pₙ', (s) => fmt(s.x, 10)],
        ['f(pₙ)', (s) => fmt(s.fx, 5)],
        ['(b−a)/2', (s) => fmt(s.err, 3)],
      ],
    },
    newton: {
      tagline: 'Ride the tangent line down to the x-axis. Converges quadratically when it works.',
      tex: "x_{n+1} = x_n - \\dfrac{f(x_n)}{f'(x_n)}",
      fn: 'f(x)',
      fields: [{ key: 'x0', label: 'Initial guess x₀' }],
      presets: [
        { fx: 'x^3 - 2x - 5', x0: '2' },
        { fx: 'cos(x) - x', x0: '1' },
        { fx: 'x^2 - 2', x0: '3' },
        { fx: 'sin(x) - x/2', x0: '2.5' },
      ],
      cols: [
        ['n', (s) => s.i],
        ['xₙ', (s) => fmt(s.x, 12)],
        ['f(xₙ)', (s) => fmt(s.fx, 5)],
        ["f′(xₙ₋₁)", (s) => fmt(s.slope, 5)],
        ['|Δx|', (s) => fmt(s.err, 3)],
      ],
    },
    secant: {
      tagline: 'Newton without derivatives: draw a line through the last two points instead.',
      tex: 'x_{n+1} = x_n - f(x_n)\\,\\dfrac{x_n - x_{n-1}}{f(x_n) - f(x_{n-1})}',
      fn: 'f(x)',
      fields: [{ key: 'x0', label: 'First guess x₀' }, { key: 'x1', label: 'Second guess x₁' }],
      presets: [
        { fx: 'x^3 - x - 2', x0: '1', x1: '2' },
        { fx: 'cos(x) - x', x0: '0', x1: '1' },
        { fx: 'e^(-x) - x', x0: '0', x1: '1' },
        { fx: 'log(x) + x - 2', x0: '0.5', x1: '3' },
      ],
      cols: [
        ['n', (s) => s.i + 1],
        ['xₙ', (s) => fmt(s.x, 12)],
        ['f(xₙ)', (s) => fmt(s.fx, 5)],
        ['|Δx|', (s) => fmt(s.err, 3)],
      ],
    },
    fixed: {
      tagline: 'Rewrite f(x) = 0 as x = g(x), then feed the output back in. Watch the cobweb spiral in.',
      tex: 'x_{n+1} = g(x_n)',
      fn: 'g(x)',
      fields: [{ key: 'x0', label: 'Initial guess x₀' }],
      presets: [
        { fx: 'cos(x)', x0: '1' },
        { fx: 'sqrt(10 / (4 + x))', x0: '1.5' },
        { fx: 'e^(-x)', x0: '0.2' },
        { fx: '(x + 2/x) / 2', x0: '3' },
      ],
      cols: [
        ['n', (s) => s.i],
        ['xₙ', (s) => fmt(s.x, 12)],
        ['|Δx|', (s) => fmt(s.err, 3)],
      ],
    },
  };
  const LEGEND = {
    bisection: [['f(x)', '--c-curve'], ['bracket', '--c-curve-2'], ['midpoint', '--c-step']],
    newton: [['f(x)', '--c-curve'], ['tangent', '--c-step']],
    secant: [['f(x)', '--c-curve'], ['secant', '--c-step']],
    fixed: [['g(x)', '--c-curve'], ['y = x', '--c-curve-2'], ['cobweb', '--c-step']],
  };

  // ───────────── State ─────────────
  const state = {
    method: 'bisection',
    values: {},
    tol: '',
    maxIter: '',
    run: null, // { method, steps, root, status, message, f, overview }
    ph: 0,
    playing: false,
    speed: 1,
    follow: true,
    lastK: -1,
    rows: 0,
  };
  for (const m in METHODS) state.values[m] = { ...METHODS[m].presets[0] };

  const plot = new Plot($('#graph'), $('#graphTip'));

  // ───────────── Function parsing ─────────────
  function cleanExpr(s) {
    return s.trim().replace(/^\s*(?:[fgy]\s*\(\s*x\s*\)|y)\s*=\s*/i, '').replace(/\*\*/g, '^');
  }
  function toNum(r) {
    if (typeof r === 'number') return r;
    if (r && typeof r.toNumber === 'function' && !r.isComplex) return r.toNumber();
    return NaN;
  }
  function compileFn(src) {
    const expr = cleanExpr(src);
    if (!expr) throw new Error('Enter a function of x.');
    const node = math.parse(expr);
    const code = node.compile();
    try { code.evaluate({ x: 0.5 }); } catch (e) {
      if (/Undefined (symbol|function)/.test(e.message)) {
        throw new Error(e.message.replace('Undefined symbol', 'Unknown variable').replace('Undefined function', 'Unknown function') + ' — use x as the variable.');
      }
    }
    const f = (x) => { try { return toNum(code.evaluate({ x })); } catch (e) { return NaN; } };
    let df, dnode = null;
    try {
      dnode = math.simplify(math.derivative(node, 'x'));
      const dcode = dnode.compile();
      df = (x) => { try { return toNum(dcode.evaluate({ x })); } catch (e) { return NaN; } };
    } catch (e) {
      df = (x) => { const h = 1e-6 * Math.max(1, Math.abs(x)); return (f(x + h) - f(x - h)) / (2 * h); };
    }
    return { f, df, node, dnode };
  }
  function parseNum(src, label) {
    const s = String(src).trim();
    if (!s) throw new Error(`${label} is required.`);
    let v;
    try { v = toNum(math.evaluate(s)); } catch (e) { v = NaN; }
    if (!ok(v)) throw new Error(`${label} must be a number.`);
    return v;
  }
  function tex(node) {
    try { return node.toTex({ parenthesis: 'auto', implicit: 'hide' }); } catch (e) { return null; }
  }
  function katexInto(el, src, display = false) {
    try { katex.render(src, el, { throwOnError: false, displayMode: display }); } catch (e) { el.textContent = src; }
  }

  // ───────────── UI: tabs / fields ─────────────
  const tabs = [...document.querySelectorAll('#tabs button')];
  const pill = $('.tab-pill');

  function movePill() {
    const b = tabs.find((t) => t.dataset.method === state.method);
    pill.style.width = b.offsetWidth + 'px';
    pill.style.transform = `translateX(${b.offsetLeft}px)`;
  }

  function setMethod(m, { solve = true } = {}) {
    if (state.ready) saveFields();
    state.ready = true;
    state.method = m;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.method === m)));
    movePill();
    const def = METHODS[m];
    const info = $('#methodInfo');
    info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap');
    $('#methodTagline').textContent = def.tagline;
    katexInto($('#methodFormula'), def.tex, true);
    $('#fxLabel').textContent = def.fn;
    $('#fx').value = state.values[m].fx;
    renderFields();
    renderPresets();
    renderLegend();
    renderHead();
    updatePreview();
    if (solve) runSolve();
  }

  function renderFields() {
    const wrap = $('#paramFields');
    wrap.innerHTML = '';
    for (const fd of METHODS[state.method].fields) {
      const div = document.createElement('div');
      div.className = 'field';
      div.innerHTML = `<label for="p-${fd.key}"></label><input id="p-${fd.key}" type="text" inputmode="decimal" spellcheck="false" /><div class="field-error"></div>`;
      div.querySelector('label').textContent = fd.label;
      const input = div.querySelector('input');
      input.value = state.values[state.method][fd.key] ?? '';
      input.addEventListener('input', () => div.classList.remove('invalid'));
      wrap.appendChild(div);
    }
  }

  function saveFields() {
    const v = state.values[state.method];
    v.fx = $('#fx').value;
    for (const fd of METHODS[state.method].fields) {
      const el = document.getElementById('p-' + fd.key);
      if (el) v[fd.key] = el.value;
    }
  }

  function renderPresets() {
    const wrap = $('#presets');
    wrap.innerHTML = '';
    METHODS[state.method].presets.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.style.animationDelay = i * 40 + 'ms';
      b.textContent = p.fx;
      b.addEventListener('click', () => {
        Object.assign(state.values[state.method], p);
        $('#fx').value = p.fx;
        renderFields();
        updatePreview();
        runSolve();
      });
      wrap.appendChild(b);
    });
  }

  function renderLegend() {
    const s = getComputedStyle(document.documentElement);
    $('#graphLegend').innerHTML = LEGEND[state.method]
      .map(([name, v]) => `<span class="legend-item"><i style="background:${s.getPropertyValue(v)}"></i>${name}</span>`)
      .join('');
  }

  function renderHead() {
    $('#iterHead').innerHTML = '<tr>' + METHODS[state.method].cols.map(([h]) => `<th>${h}</th>`).join('') + '</tr>';
  }

  let previewTimer;
  function updatePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const el = $('#fnPreview');
      const err = $('#fxError');
      const src = $('#fx').value;
      if (!cleanExpr(src)) { el.innerHTML = ''; err.textContent = ''; return; }
      try {
        const { node, dnode } = compileFn(src);
        let t = `${METHODS[state.method].fn} = ${tex(node)}`;
        if (state.method === 'newton' && dnode) t += `\\qquad f'(x) = ${tex(dnode)}`;
        katexInto(el, t);
        el.classList.remove('dim');
        err.textContent = '';
        $('#fx').parentElement.classList.remove('invalid');
      } catch (e) {
        el.classList.add('dim');
        err.textContent = e.message.replace(/\(char \d+\)/, '').trim();
      }
    }, 120);
  }

  // ───────────── Solve ─────────────
  function fieldError(id, msg) {
    const input = document.getElementById(id);
    const field = input.closest('.field');
    field.classList.remove('invalid'); void field.offsetWidth;
    field.classList.add('invalid');
    field.querySelector('.field-error').textContent = msg;
  }

  function runSolve() {
    saveFields();
    const m = state.method;
    const v = state.values[m];
    let fn, params = {}, tol, maxIter;
    document.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
    try { fn = compileFn(v.fx); } catch (e) { fieldError('fx', e.message.replace(/\(char \d+\)/, '').trim()); return; }
    for (const fd of METHODS[m].fields) {
      try { params[fd.key] = parseNum(v[fd.key], fd.label); } catch (e) { fieldError('p-' + fd.key, e.message); return; }
    }
    try { tol = $('#tol').value.trim() ? parseNum($('#tol').value, 'Tolerance') : 1e-6; if (tol <= 0) throw new Error('Tolerance must be positive.'); } catch (e) { $('details.advanced').open = true; fieldError('tol', e.message); return; }
    try { maxIter = $('#maxIter').value.trim() ? Math.round(parseNum($('#maxIter').value, 'Max iterations')) : 50; if (maxIter < 1 || maxIter > 1000) throw new Error('Use 1–1000.'); } catch (e) { $('details.advanced').open = true; fieldError('maxIter', e.message); return; }

    const res = RootMethods[m](fn.f, { ...params }, tol, maxIter, fn.df);
    state.run = { method: m, ...res, params, f: fn.f, tol };
    if (m === 'bisection') state.run.bracket = { a: Math.min(params.a, params.b), b: Math.max(params.a, params.b) };

    // camera overview
    const xs = Object.values(params);
    for (const s of res.steps) xs.push(s.x, s.from, s.a, s.b, s.p0, s.p1);
    const good = xs.filter(ok);
    let xa = Math.min(...good), xb = Math.max(...good);
    if (xb - xa < 1e-9) { xa -= 1; xb += 1; }
    const ys = res.steps.slice(0, 2).map((s) => s.ffrom ?? s.q0).filter(ok);
    state.run.overview = { xa, xb, ys };
    state.run.minHalf = (xb - xa) / 4000;

    plot.setFunction(fn.f, m === 'fixed' ? 'g' : 'f');
    plot.setScene(state.run);
    plot.fit(xa, xb, ys, { instant: false });
    if (!plot.everFit) { plot.fit(xa, xb, ys, { instant: true }); plot.everFit = true; }
    state.follow = true; syncFollow();

    state.ph = reduceMotion ? res.steps.length : 0;
    state.lastK = -1;
    state.rows = 0;
    $('#iterBody').innerHTML = '';
    $('#tableEmpty').classList.toggle('hidden', res.steps.length > 0);
    $('#tableEmpty').textContent = res.steps.length ? '' : (res.message || 'No iterations needed.');
    setBadge('run', 'Iterating');
    $('#rootValue').classList.remove('done');
    $('#rootMeta').classList.remove('err');
    $('#rootCard').classList.remove('celebrate');
    state.finished = false;
    state.playing = res.steps.length > 0 && !reduceMotion;
    // let the curve draw in before iterating
    state.delay = state.playing ? 0.75 : 0;
    syncPlayBtn();
    syncUI(true);
    if (!state.playing) finish();

    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('method', m);
    url.searchParams.set('f', v.fx);
    for (const fd of METHODS[m].fields) url.searchParams.set(fd.key, v[fd.key]);
    if ($('#tol').value.trim()) url.searchParams.set('tol', $('#tol').value.trim());
    if ($('#maxIter').value.trim()) url.searchParams.set('n', $('#maxIter').value.trim());
    history.replaceState(null, '', url);
  }

  // ───────────── Playback ─────────────
  const stepDur = (k) => Math.max(0.32, 1.15 * Math.pow(0.9, k));

  plot.onFrame = (dt) => {
    const run = state.run;
    if (!run || !state.playing) return;
    if (state.delay > 0) { state.delay -= dt; return; }
    const n = run.steps.length;
    state.ph += (dt * state.speed) / stepDur(Math.floor(state.ph));
    if (state.ph >= n) {
      state.ph = n;
      state.playing = false;
      syncPlayBtn();
    }
    syncUI();
  };

  function syncUI(force = false) {
    const run = state.run;
    if (!run) return;
    const n = run.steps.length;
    plot.ph = state.ph;
    const visible = Math.min(n, Math.floor(state.ph + 0.85)); // a row appears as its step lands
    const k = Math.min(Math.floor(state.ph), n - 1);

    // scrubber
    const sc = $('#scrubber');
    sc.max = Math.max(1, n);
    sc.value = state.ph;
    sc.style.setProperty('--p', (n ? (state.ph / n) * 100 : 0) + '%');
    $('#stepCount').textContent = `${Math.min(n, Math.ceil(state.ph - 1e-9))} / ${n}`;

    // table
    const body = $('#iterBody');
    if (visible < state.rows) { while (body.children.length > visible) body.lastChild.remove(); state.rows = visible; }
    while (state.rows < visible) {
      const s = run.steps[state.rows];
      const tr = document.createElement('tr');
      tr.innerHTML = METHODS[run.method].cols.map(([, g]) => `<td>${g(s)}</td>`).join('');
      const idx = state.rows;
      tr.addEventListener('click', () => { state.playing = false; syncPlayBtn(); state.ph = idx + 1; syncUI(); });
      body.appendChild(tr);
      state.rows++;
      const scroller = $('#tableScroll');
      scroller.scrollTop = scroller.scrollHeight;
    }
    [...body.children].forEach((tr, i) => {
      tr.classList.toggle('current', i === visible - 1 && state.ph < n);
      tr.classList.toggle('final', i === n - 1 && state.ph >= n && run.status === 'converged');
    });

    // live estimate
    if (state.ph < n && visible > 0) {
      $('#rootValue').textContent = fmt(run.steps[visible - 1].x, 12);
      $('#rootMeta').textContent = `iteration ${visible} of ${n}`;
      setBadge('run', 'Iterating');
      state.finished = false;
      $('#rootValue').classList.remove('done');
    } else if (state.ph < n) {
      $('#rootValue').textContent = '…';
      $('#rootMeta').textContent = 'warming up';
    }

    // camera
    if (n && (k !== state.lastK || force)) {
      state.lastK = k;
      if (state.follow && state.ph < n) frameStep(run, k);
    }
    if (state.ph >= n && !state.finished) finish();
    drawSpark();
  }

  function frameStep(run, k) {
    const s = run.steps[k];
    let xs, ys = [];
    if (run.method === 'bisection') { xs = [s.a, s.b]; ys = [s.fx]; }
    else if (run.method === 'newton') { xs = [s.from, s.x]; ys = [s.ffrom]; }
    else if (run.method === 'secant') { xs = [s.p0, s.p1, s.x]; ys = [s.q0, s.q1]; }
    else xs = [s.from, s.x];
    plot.fit(Math.min(...xs), Math.max(...xs), ys, { minHalf: run.minHalf, pad: run.method === 'fixed' ? 2.2 : 1.6 });
  }

  function frameOverview() {
    const o = state.run && state.run.overview;
    if (o) plot.fit(o.xa, o.xb, o.ys);
  }

  let finishTimer;
  function finish() {
    const run = state.run;
    state.finished = true;
    clearTimeout(finishTimer);
    const card = $('#rootCard');
    const meta = $('#rootMeta');
    const n = run.steps.length;
    if (run.status === 'failed') {
      setBadge('bad', 'Failed');
      $('#rootValue').textContent = '—';
      meta.classList.add('err');
      meta.textContent = run.message;
    } else {
      meta.classList.remove('err');
      const fr = run.method === 'fixed' ? run.f(run.root) - run.root : run.f(run.root);
      const name = run.method === 'fixed' ? 'g(x) − x' : 'f(x)';
      if (run.status === 'converged') {
        setBadge('good', n ? `Converged · ${n} step${n === 1 ? '' : 's'}` : 'Exact');
        meta.textContent = `${name} = ${fmt(fr, 4)}`;
        card.classList.remove('celebrate'); void card.offsetWidth; card.classList.add('celebrate');
      } else {
        setBadge('warn', `Stopped at ${n} steps`);
        meta.textContent = `${name} = ${fmt(fr, 4)} · raise max iterations`;
      }
      scramble($('#rootValue'), fmt(run.root, 12));
      $('#rootValue').classList.add('done');
    }
    if (state.follow) finishTimer = setTimeout(() => { if (state.follow && state.finished) frameOverview(); }, 1100);
    drawSpark();
  }

  function scramble(el, finalText) {
    if (reduceMotion) { el.textContent = finalText; return; }
    const chars = finalText.split('');
    const start = performance.now();
    const dur = 650;
    const tick = (now) => {
      const p = (now - start) / dur;
      el.textContent = chars.map((c, i) => (/\d/.test(c) && p < (i + 1) / chars.length ? String((Math.random() * 10) | 0) : c)).join('');
      if (p < 1) requestAnimationFrame(tick); else el.textContent = finalText;
    };
    requestAnimationFrame(tick);
  }

  function setBadge(kind, text) {
    const b = $('#statusBadge');
    b.className = 'badge ' + kind;
    b.textContent = text;
  }

  // ───────────── Convergence sparkline ─────────────
  const spark = $('#spark');
  function drawSpark() {
    const run = state.run;
    const r = spark.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (spark.width !== Math.round(r.width * dpr)) { spark.width = Math.round(r.width * dpr); spark.height = Math.round(r.height * dpr); }
    const ctx = spark.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);
    if (!run || !run.steps.length) return;
    const css = getComputedStyle(document.documentElement);
    const c1 = css.getPropertyValue('--accent').trim(), c2 = css.getPropertyValue('--accent-2').trim();
    const faint = css.getPropertyValue('--faint').trim();
    const vals = run.steps.map((s) => Math.log10(Math.max(Math.abs(s.err), 1e-17)));
    const tolL = Math.log10(run.tol);
    let lo = Math.min(...vals, tolL), hi = Math.max(...vals, tolL);
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const n = run.steps.length;
    const X = (i) => 6 + (n === 1 ? 0.5 : i / (n - 1)) * (W - 12);
    const Y = (v) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 12);
    // tolerance line
    ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = faint; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Y(tolL)); ctx.lineTo(W, Y(tolL)); ctx.stroke(); ctx.restore();
    ctx.fillStyle = faint; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    ctx.fillText('tol', W - 2, Y(tolL) - 4);

    const shown = Math.min(n, state.ph);
    if (shown <= 0) return;
    const full = Math.floor(shown);
    const pts = [];
    for (let i = 0; i < Math.min(full + 1, n); i++) pts.push([X(i), Y(vals[i])]);
    if (full < n && pts.length > 1) {
      const t = shown - full;
      const [ax, ay] = pts[pts.length - 2];
      const [bx, by] = pts[pts.length - 1];
      pts[pts.length - 1] = [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    // area
    ctx.beginPath(); ctx.moveTo(pts[0][0], H);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(pts[pts.length - 1][0], H); ctx.closePath();
    const ag = ctx.createLinearGradient(0, 0, 0, H);
    ag.addColorStop(0, c2 + '40'); ag.addColorStop(1, c2 + '00');
    ctx.fillStyle = ag; ctx.fill();
    // line
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    const [ex, ey] = pts[pts.length - 1];
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, 7); ctx.fill();
  }

  // ───────────── Controls wiring ─────────────
  function syncPlayBtn() {
    const b = $('#playBtn');
    b.classList.toggle('playing', state.playing);
    b.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  }
  function syncFollow() { $('#followBtn').setAttribute('aria-pressed', String(state.follow)); }
  function seek(ph) {
    if (!state.run) return;
    state.ph = Math.max(0, Math.min(state.run.steps.length, ph));
    state.delay = 0;
    syncUI(true);
  }

  $('#playBtn').addEventListener('click', () => {
    if (!state.run || !state.run.steps.length) return;
    if (state.ph >= state.run.steps.length) { state.ph = 0; state.rows = 0; $('#iterBody').innerHTML = ''; state.finished = false; }
    state.playing = !state.playing;
    syncPlayBtn();
  });
  $('#restartBtn').addEventListener('click', () => { state.playing = true; syncPlayBtn(); seek(0); });
  $('#prevBtn').addEventListener('click', () => { state.playing = false; syncPlayBtn(); seek(Math.ceil(state.ph) - 1); });
  $('#nextBtn').addEventListener('click', () => { state.playing = false; syncPlayBtn(); seek(Math.floor(state.ph) + 1); });
  $('#endBtn').addEventListener('click', () => { state.playing = false; syncPlayBtn(); seek(Infinity); });
  $('#scrubber').addEventListener('input', (e) => { state.playing = false; syncPlayBtn(); seek(parseFloat(e.target.value)); });
  document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.speed button').forEach((x) => x.classList.toggle('on', x === b));
    state.speed = parseFloat(b.dataset.speed);
  }));
  $('#followBtn').addEventListener('click', () => {
    state.follow = !state.follow;
    syncFollow();
    if (state.follow && state.run) {
      if (state.ph >= state.run.steps.length) frameOverview(); else frameStep(state.run, Math.min(Math.floor(state.ph), state.run.steps.length - 1));
    }
  });
  $('#fitBtn').addEventListener('click', frameOverview);
  plot.onReset = frameOverview;
  plot.onUserMove = () => { if (state.follow) { state.follow = false; syncFollow(); } };

  tabs.forEach((t) => t.addEventListener('click', () => { if (t.dataset.method !== state.method) setMethod(t.dataset.method); }));
  $('#solveForm').addEventListener('submit', (e) => { e.preventDefault(); runSolve(); });
  $('#fx').addEventListener('input', () => { $('#fx').closest('.field').classList.remove('invalid'); updatePreview(); });
  ['tol', 'maxIter'].forEach((id) => document.getElementById(id).addEventListener('input', (e) => e.target.closest('.field').classList.remove('invalid')));

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.code === 'Space') { e.preventDefault(); $('#playBtn').click(); }
    else if (e.key === 'ArrowRight') $('#nextBtn').click();
    else if (e.key === 'ArrowLeft') $('#prevBtn').click();
  });

  // ripple on buttons
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(span);
    setTimeout(() => span.remove(), 700);
  });

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); } catch (e) { toast('Couldn’t access the clipboard'); }
  }
  $('#copyBtn').addEventListener('click', () => {
    if (state.run && ok(state.run.root)) copy(String(state.run.root), 'Root copied ✓');
  });
  $('#shareBtn').addEventListener('click', () => { runSolve(); copy(location.href, 'Link copied ✓'); });

  // theme
  $('#themeToggle').addEventListener('click', () => {
    const root = document.documentElement;
    const isLight = root.dataset.theme ? root.dataset.theme === 'light' : matchMedia('(prefers-color-scheme: light)').matches;
    root.dataset.theme = isLight ? 'dark' : 'light';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
    plot.refreshColors();
    renderLegend();
    drawSpark();
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { plot.refreshColors(); renderLegend(); drawSpark(); });
  window.addEventListener('resize', () => { movePill(); drawSpark(); });

  // ───────────── Boot ─────────────
  const q = new URLSearchParams(location.search);
  const aliases = { newton: 'newton', newtons: 'newton', secant: 'secant', bisection: 'bisection', fixed: 'fixed', 'fixed-point': 'fixed' };
  const start = aliases[(q.get('method') || location.hash.slice(1) || '').toLowerCase()] || 'bisection';
  if (q.get('f')) {
    const v = state.values[start];
    v.fx = q.get('f');
    for (const fd of METHODS[start].fields) if (q.has(fd.key)) v[fd.key] = q.get(fd.key);
    if (q.get('tol')) $('#tol').value = q.get('tol');
    if (q.get('n')) $('#maxIter').value = q.get('n');
  }
  state.method = start;
  setMethod(start, { solve: false });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { movePill(); });
  setTimeout(runSolve, 350);
})();
