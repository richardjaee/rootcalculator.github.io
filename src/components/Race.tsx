import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { usePlay } from '../lib/engine';
import { METHODS, METHOD_COLOR, type Values } from '../lib/meta';
import { fmt, type MethodId } from '../lib/methods';
import { race, type RaceEntry } from '../lib/solve';
import { Flag } from './icons';
import { Section } from './Section';

const W = 640;
const H = 260;
const PAD = { l: 44, r: 16, t: 14, b: 30 };

function rank(e: RaceEntry) {
  const r = e.result;
  if (r.status === 'converged') return r.steps.length;
  if (r.status === 'maxiter') return 1e4 + r.steps.length;
  return 1e6;
}

export function Race({ onLoad }: { onLoad: (m: MethodId, v: Values) => void }) {
  const run = usePlay((s) => s.run);
  const entries = useMemo(() => (run ? race(run) : []), [run]);
  const [hover, setHover] = useState<MethodId | null>(null);

  const sorted = useMemo(() => [...entries].sort((a, b) => rank(a) - rank(b)), [entries]);
  const maxSteps = Math.max(8, ...entries.map((e) => Math.min(e.result.steps.length, 60)));
  const series = entries.map((e) => ({
    e,
    pts: e.result.steps.slice(0, 60).map((s, i) => [i + 1, Math.log10(Math.max(Math.abs(s.err), 1e-16))] as const),
  }));
  const allY = series.flatMap((s) => s.pts.map((p) => p[1]));
  const yMax = Math.ceil(Math.max(1, ...allY));
  const yMin = Math.floor(Math.min(-8, ...allY));
  const X = (i: number) => PAD.l + ((i - 1) / Math.max(1, maxSteps - 1)) * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const yTicks: number[] = [];
  for (let v = yMax; v >= yMin; v -= Math.max(2, Math.ceil((yMax - yMin) / 6))) yTicks.push(v);
  const xTicks: number[] = [];
  const xStep = maxSteps > 30 ? 10 : maxSteps > 12 ? 5 : 2;
  for (let i = xStep; i <= maxSteps; i += xStep) xTicks.push(i);
  const winner = sorted[0]?.result.status === 'converged' ? sorted[0] : null;

  return (
    <Section
      id="race"
      eyebrow="Method race"
      title="Which method wins?"
      lede={
        run ? (
          <>
            Every method runs on <code>{run.src}</code> from comparable starting points. Lines that fall faster and steeper are converging faster. Click any row to load that run above.
          </>
        ) : (
          'Solve something above to start a race.'
        )
      }
    >
      <div className="race">
        <div className="panel race-chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Error versus iteration for every method">
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} className="race-grid" />
                <text x={PAD.l - 8} y={Y(v) + 4} className="race-tick" textAnchor="end">
                  10{toSup(v)}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={X(i)} y={H - 8} className="race-tick" textAnchor="middle">
                {i}
              </text>
            ))}
            <text x={W - PAD.r} y={H - 8} className="race-tick" textAnchor="end" dy={-14}>
              iteration →
            </text>
            {series.map(({ e, pts }, idx) => {
              if (pts.length === 0) return null;
              const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
              const dim = hover && hover !== e.method;
              const last = pts[pts.length - 1];
              return (
                <g key={`${run!.id}-${e.method}`} style={{ opacity: dim ? 0.12 : 1, transition: 'opacity .2s' }}>
                  <motion.path
                    d={d}
                    fill="none"
                    stroke={METHOD_COLOR[e.method]}
                    strokeWidth={hover === e.method ? 3.2 : 2.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={e.result.status === 'converged' ? undefined : '5 5'}
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.4, delay: idx * 0.12, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <motion.circle
                    cx={X(last[0])}
                    cy={Y(last[1])}
                    r={4}
                    fill={METHOD_COLOR[e.method]}
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.2 + idx * 0.12, type: 'spring' }}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div className="panel race-board">
          {sorted.map((e, i) => {
            const r = e.result;
            const steps = r.steps.length;
            const status =
              r.status === 'converged' ? `${steps} step${steps === 1 ? '' : 's'}` : r.status === 'maxiter' ? `no luck in ${steps}` : 'failed';
            return (
              <motion.button
                key={e.method}
                className={'race-row ' + r.status}
                onMouseEnter={() => setHover(e.method)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(e.method)}
                onBlur={() => setHover(null)}
                onClick={() => onLoad(e.method, e.values)}
                title={r.message ?? e.note}
                style={{ ['--mc' as string]: METHOD_COLOR[e.method] }}
              >
                <span className="race-rank">{r.status === 'converged' ? (e === winner ? <Flag size={14} /> : i + 1) : '–'}</span>
                <span className="race-name">
                  {METHODS[e.method].name}
                  <small>{e.note}</small>
                </span>
                <span className="race-bar">
                  <motion.i
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.max(4, (Math.min(steps, maxSteps) / maxSteps) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    key={run!.id}
                  />
                </span>
                <span className="race-status">{status}</span>
                <span className="race-root">{r.status === 'failed' ? '—' : fmt(r.root, 9)}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function toSup(n: number) {
  const map: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(n)
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
}
