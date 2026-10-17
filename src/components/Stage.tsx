import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { engine, usePlay } from '../lib/engine';
import { METHODS } from '../lib/meta';
import { fmt, type MethodId } from '../lib/methods';
import { Plot } from '../plot/Plot';
import { End, Fit, Minus, Next, Pause, Play, Plus, Prev, Restart, Roots, Target } from './icons';

const LEGEND: Record<MethodId, [string, string][]> = {
  bisection: [['f(x)', '--c-curve'], ['bracket', '--c-curve-2'], ['midpoint', '--c-step']],
  falsi: [['f(x)', '--c-curve'], ['bracket', '--c-curve-2'], ['chord', '--c-step']],
  illinois: [['f(x)', '--c-curve'], ['bracket', '--c-curve-2'], ['chord (halved end)', '--c-step']],
  ridders: [['f(x)', '--c-curve'], ['bracket & midpoint', '--c-curve-2'], ['new point', '--c-step']],
  itp: [['f(x)', '--c-curve'], ['bracket', '--c-curve-2'], ['projected point', '--c-step']],
  brent: [['f(x)', '--c-curve'], ['bracket', '--c-curve-2'], ['IQI / secant / bisect', '--c-step']],
  muller: [['f(x)', '--c-curve'], ['parabola', '--c-step']],
  newton: [['f(x)', '--c-curve'], ['tangent', '--c-step']],
  secant: [['f(x)', '--c-curve'], ['secant', '--c-step']],
  halley: [['f(x)', '--c-curve'], ['hyperbola', '--c-step']],
  fixed: [['g(x)', '--c-curve'], ['y = x', '--c-curve-2'], ['cobweb', '--c-step']],
  steffensen: [['g(x)', '--c-curve'], ['y = x', '--c-curve-2'], ['Aitken leap', '--c-step']],
};

// ───────────────────────── Graph ─────────────────────────

export function Graph({ theme, onPickRoot }: { theme: string; onPickRoot: (x: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<Plot | null>(null);
  const follow = usePlay((s) => s.follow);
  const showAll = usePlay((s) => s.showAll);
  const method = usePlay((s) => s.run?.method);
  const [legendColors, setLegendColors] = useState<Record<string, string>>({});

  useEffect(() => {
    const p = new Plot(canvasRef.current!, tipRef.current!);
    plotRef.current = p;
    engine.attach(p);
    return () => {
      engine.detach(p);
      p.destroy();
    };
  }, []);

  useEffect(() => {
    if (plotRef.current) plotRef.current.onPickRoot = onPickRoot;
  }, [onPickRoot]);

  useLayoutEffect(() => {
    plotRef.current?.refreshColors();
    const s = getComputedStyle(document.documentElement);
    setLegendColors(Object.fromEntries(['--c-curve', '--c-curve-2', '--c-step'].map((v) => [v, s.getPropertyValue(v).trim()])));
  }, [theme]);

  return (
    <div className="panel graph-panel" id="graph">
      <div className="graph-wrap">
        <canvas ref={canvasRef} />
        <div className="graph-tip" ref={tipRef} />
        {method && (
          <div className="graph-legend">
            {LEGEND[method].map(([name, v]) => (
              <span className="legend-item" key={name}>
                <i style={{ background: legendColors[v] }} />
                {name}
              </span>
            ))}
          </div>
        )}
        <div className="graph-tools">
          <button className="chip-btn" aria-pressed={follow} onClick={() => engine.setFollow(!follow)} title="Camera follows the iterations">
            <Target size={13} /> Follow
          </button>
          <button className="chip-btn" aria-pressed={showAll} onClick={() => engine.setShowAll(!showAll)} title="Mark every root in view (click one to solve there)">
            <Roots size={13} /> All roots
          </button>
          <div className="chip-group">
            <button className="chip-btn icon" onClick={() => engine.zoom(0.7)} aria-label="Zoom in">
              <Plus size={14} />
            </button>
            <button className="chip-btn icon" onClick={() => engine.zoom(1 / 0.7)} aria-label="Zoom out">
              <Minus size={14} />
            </button>
            <button className="chip-btn icon" onClick={engine.frameOverview} aria-label="Fit view" title="Fit view (or double-click the graph)">
              <Fit size={14} />
            </button>
          </div>
        </div>
      </div>
      <Player />
    </div>
  );
}

function Player() {
  const ph = usePlay((s) => s.ph);
  const n = usePlay((s) => s.run?.steps.length ?? 0);
  const playing = usePlay((s) => s.playing);
  const speed = usePlay((s) => s.speed);
  return (
    <div className="player">
      <div className="player-buttons">
        <button className="pbtn" onClick={engine.restart} aria-label="Restart">
          <Restart />
        </button>
        <button className="pbtn" onClick={engine.prev} aria-label="Previous step">
          <Prev />
        </button>
        {/* plain element on purpose: a motion component re-rendering every frame
            makes framer-motion re-measure every layout-animated node on the page */}
        <button className="pbtn play" onClick={engine.toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="pbtn" onClick={engine.next} aria-label="Next step">
          <Next />
        </button>
        <button className="pbtn" onClick={engine.end} aria-label="Skip to end">
          <End />
        </button>
      </div>
      <div className="scrub">
        <input
          type="range"
          min={0}
          max={Math.max(1, n)}
          step={0.001}
          value={ph}
          aria-label="Iteration timeline"
          style={{ ['--p' as string]: `${n ? (ph / n) * 100 : 0}%` }}
          onChange={(e) => {
            engine.pause();
            engine.seek(parseFloat(e.target.value));
          }}
        />
        <span className="step-count">
          {Math.min(n, Math.ceil(ph - 1e-9))} / {n}
        </span>
      </div>
      <div className="speed" role="group" aria-label="Playback speed">
        {[0.5, 1, 2, 4].map((s) => (
          <button key={s} className={s === speed ? 'on' : ''} onClick={() => engine.setSpeed(s)}>
            {s === 0.5 ? '½' : s}×
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Root card ─────────────────────────

const visibleOf = (ph: number, n: number) => Math.min(n, Math.floor(ph + 0.85));

export function RootCard({ theme, toast }: { theme: string; toast: (m: string) => void }) {
  const run = usePlay((s) => s.run);
  const done = usePlay((s) => s.done);
  const visible = usePlay((s) => (s.run ? visibleOf(s.ph, s.run.steps.length) : 0));
  const n = run?.steps.length ?? 0;

  let badge: [string, string] = ['', ''];
  let value = '—';
  let meta = ' ';
  let err = false;
  if (run && !done) {
    badge = ['run', 'working…'];
    value = visible > 0 ? fmt(run.steps[visible - 1].x, 12) : '…';
    meta = visible > 0 ? `iteration ${visible} of ${n}` : 'starting';
  } else if (run) {
    const name = run.kind === 'g' ? 'g(x) − x' : 'f(x)';
    const fr = run.kind === 'g' ? run.fns.f(run.root) - run.root : run.fns.f(run.root);
    if (run.status === 'failed') {
      badge = ['bad', 'failed'];
      meta = run.message ?? 'The method failed.';
      err = true;
    } else if (run.status === 'converged') {
      badge = ['good', n ? `converged in ${n} step${n === 1 ? '' : 's'}` : 'exact'];
      value = fmt(run.root, 12);
      meta = `${name} = ${fmt(fr, 4)}`;
    } else {
      badge = ['warn', `stopped after ${n} steps`];
      value = fmt(run.root, 12);
      meta = `${name} = ${fmt(fr, 4)} · try more iterations`;
    }
  }
  const finalReady = !!run && done && run.status !== 'failed';

  return (
    <div className="panel root-card">
      <div className="root-head">
        <span className="label">Root</span>
        <span className={'status ' + badge[0]}>{badge[1]}</span>
      </div>
      <div className={'root-value' + (finalReady && run!.status === 'converged' ? ' done' : '')}>{value}</div>
      <div className={'root-meta' + (err ? ' err' : '')}>{meta}</div>
      <div className="spark-wrap">
        <div className="spark-head">
          <span className="label">Error per step</span>
          <span className="spark-note">log₁₀ |Δ|</span>
        </div>
        <Sparkline theme={theme} />
      </div>
      <button
        className="btn small"
        disabled={!run || !Number.isFinite(run.root) || run.status === 'failed'}
        onClick={() => {
          navigator.clipboard.writeText(String(run!.root)).then(
            () => toast('Root copied'),
            () => toast('Couldn’t access the clipboard'),
          );
        }}
      >
        Copy root
      </button>
    </div>
  );
}

function Sparkline({ theme }: { theme: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const run = usePlay((s) => s.run);
  const ph = usePlay((s) => s.ph);
  // measured by a ResizeObserver: reading layout every frame would force a full reflow
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = ref.current!;
    const r = size;
    if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(r.width * dpr)) {
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width;
    const H = r.height;
    ctx.clearRect(0, 0, W, H);
    if (!run || !run.steps.length) return;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim();
    const red = css.getPropertyValue('--red').trim();
    const faint = css.getPropertyValue('--faint').trim();
    const vals = run.steps.map((s) => Math.log10(Math.max(Math.abs(s.err), 1e-17)));
    const tolL = Math.log10(run.tol);
    let lo = Math.min(...vals, tolL);
    let hi = Math.max(...vals, tolL);
    if (hi - lo < 1) {
      hi += 0.5;
      lo -= 0.5;
    }
    const n = run.steps.length;
    const X = (i: number) => 6 + (n === 1 ? 0.5 : i / (n - 1)) * (W - 12);
    const Y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 12);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Y(tolL));
    ctx.lineTo(W, Y(tolL));
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = faint;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('tol', W - 2, Y(tolL) - 4);

    const shown = Math.min(n, ph);
    if (shown <= 0) return;
    const full = Math.floor(shown);
    const pts: [number, number][] = [];
    for (let i = 0; i < Math.min(full + 1, n); i++) pts.push([X(i), Y(vals[i])]);
    if (full < n && pts.length > 1) {
      const t = shown - full;
      const [ax, ay] = pts[pts.length - 2];
      const [bx, by] = pts[pts.length - 1];
      pts[pts.length - 1] = [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = ink;
    for (const [x, y] of pts.slice(0, -1)) {
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, 7);
      ctx.fill();
    }
    const [ex, ey] = pts[pts.length - 1];
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, 7);
    ctx.fill();
  }, [run, ph, theme, size]);

  return <canvas ref={ref} className="spark" />;
}

// ───────────────────────── Table ─────────────────────────

export function IterTable() {
  const run = usePlay((s) => s.run);
  const visible = usePlay((s) => (s.run ? visibleOf(s.ph, s.run.steps.length) : 0));
  const done = usePlay((s) => s.done);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible]);

  const cols = run ? METHODS[run.method].cols : [];
  const n = run?.steps.length ?? 0;
  return (
    <div className="panel table-card">
      <div className="table-title">
        <span className="label">Iterations</span>
        {run && <span className="method-name">{METHODS[run.method].name}</span>}
      </div>
      <div className="table-scroll" ref={scroller}>
        <table>
          <thead>
            <tr>
              {cols.map(([h]) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run?.steps.slice(0, visible).map((s, i) => (
              <tr
                key={`${run.id}-${i}`}
                className={(i === visible - 1 && !done ? 'current' : '') + (i === n - 1 && done && run.status === 'converged' ? ' final' : '')}
                onClick={() => {
                  engine.pause();
                  engine.seek(i + 1);
                }}
              >
                {cols.map(([h, g]) => (
                  <td key={h}>{g(s)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {run && n === 0 && <div className="table-empty">{run.message ?? 'No iterations needed.'}</div>}
        {!run && <div className="table-empty">Iterations will stream in here.</div>}
      </div>
    </div>
  );
}
