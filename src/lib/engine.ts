/* Playback engine: owns the animation playhead and drives the plot camera.
   Lives outside React so the canvas can tick at 60fps; components subscribe
   to just the slices they need via usePlay(selector). */
import { useSyncExternalStore } from 'react';
import type { Plot } from '../plot/Plot';
import type { Run } from './solve';

export interface PlayState {
  run: Run | null;
  ph: number;
  playing: boolean;
  speed: number;
  follow: boolean;
  done: boolean;
  showAll: boolean;
}

const stepDur = (k: number) => Math.max(0.3, 1.15 * Math.pow(0.9, k));
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

class Engine {
  private s: PlayState = { run: null, ph: 0, playing: false, speed: 1, follow: true, done: false, showAll: false };
  private listeners = new Set<() => void>();
  private plot: Plot | null = null;
  private delay = 0;
  private lastK = -1;
  private finishTimer: ReturnType<typeof setTimeout> | undefined;

  get = () => this.s;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private set(p: Partial<PlayState>) {
    this.s = { ...this.s, ...p };
    if (this.plot) {
      this.plot.ph = this.s.ph;
      this.plot.showAll = this.s.showAll;
    }
    this.listeners.forEach((l) => l());
  }

  private get n() {
    return this.s.run ? this.s.run.steps.length : 0;
  }

  attach(plot: Plot) {
    this.plot = plot;
    plot.onFrame = (dt) => this.tick(dt);
    plot.onUserMove = () => {
      if (this.s.follow) this.set({ follow: false });
    };
    plot.onReset = () => this.frameOverview();
    plot.showAll = this.s.showAll;
    if (this.s.run) this.pushToPlot();
  }

  detach(plot: Plot) {
    if (this.plot === plot) this.plot = null;
  }

  load(run: Run) {
    const n = run.steps.length;
    const instant = reduceMotion();
    clearTimeout(this.finishTimer);
    this.lastK = -1;
    this.delay = 0.75; // let the curve draw in first
    this.set({ run, ph: instant ? n : 0, playing: n > 0 && !instant, follow: true, done: false });
    this.pushToPlot();
    this.afterMove(true);
  }

  private pushToPlot() {
    const p = this.plot;
    const run = this.s.run;
    if (!p || !run) return;
    p.setFunction(run.fns.f, run.kind);
    p.setScene(run);
    p.ph = this.s.ph;
    const o = run.overview;
    p.fit(o.xa, o.xb, o.ys, { instant: !p.everFit });
    p.everFit = true;
  }

  private tick(dt: number) {
    if (!this.s.run || !this.s.playing) return;
    if (this.delay > 0) {
      this.delay -= dt;
      return;
    }
    let ph = this.s.ph + (dt * this.s.speed) / stepDur(Math.floor(this.s.ph));
    let playing = true;
    if (ph >= this.n) {
      ph = this.n;
      playing = false;
    }
    this.set({ ph, playing });
    this.afterMove();
  }

  private afterMove(force = false) {
    const n = this.n;
    const { ph } = this.s;
    const k = ph <= 0 ? 0 : Math.min(Math.ceil(ph) - 1, n - 1);
    if (n && (k !== this.lastK || force)) {
      this.lastK = k;
      if (this.s.follow && ph < n) this.frameStep(k);
    }
    if (ph >= n && !this.s.done) this.finish();
    else if (ph < n && this.s.done) this.set({ done: false });
  }

  private finish() {
    this.set({ done: true });
    clearTimeout(this.finishTimer);
    if (this.s.follow) {
      this.finishTimer = setTimeout(() => {
        if (this.s.follow && this.s.done) this.frameOverview();
      }, 1100);
    }
  }

  frameStep(k: number) {
    const run = this.s.run;
    if (!run || !this.plot) return;
    const s = run.steps[k];
    let xs: number[];
    let ys: number[] = [];
    switch (run.method) {
      case 'bisection':
      case 'falsi':
      case 'illinois':
      case 'ridders':
      case 'itp':
      case 'brent':
        xs = [s.a!, s.b!];
        ys = [s.fx];
        break;
      case 'newton':
      case 'halley':
        xs = [s.from!, s.x];
        ys = [s.ffrom!];
        break;
      case 'secant':
        xs = [s.p0!, s.p1!, s.x];
        ys = [s.q0!, s.q1!];
        break;
      case 'muller':
        xs = [s.p0!, s.p1!, s.p2!, s.x];
        ys = [s.q0!, s.q1!, s.q2!];
        break;
      case 'steffensen':
        xs = [s.from!, s.g1!, s.g2!, s.x];
        break;
      default:
        xs = [s.from!, s.x];
    }
    xs = xs.filter(Number.isFinite);
    this.plot.fit(Math.min(...xs), Math.max(...xs), ys, { minHalf: run.minHalf, pad: run.kind === 'g' ? 2.2 : 1.6 });
  }

  frameOverview = () => {
    const o = this.s.run?.overview;
    if (o && this.plot) this.plot.fit(o.xa, o.xb, o.ys);
  };

  seek(ph: number) {
    if (!this.s.run) return;
    this.delay = 0;
    this.set({ ph: Math.max(0, Math.min(this.n, ph)) });
    this.afterMove(true);
  }

  toggle = () => {
    if (!this.n) return;
    if (this.s.ph >= this.n) {
      this.lastK = -1;
      this.set({ ph: 0, done: false });
    }
    this.delay = 0;
    this.set({ playing: !this.s.playing });
  };
  pause = () => this.set({ playing: false });
  restart = () => {
    this.delay = 0;
    this.set({ playing: true });
    this.seek(0);
  };
  prev = () => {
    this.pause();
    this.seek(Math.ceil(this.s.ph) - 1);
  };
  next = () => {
    this.pause();
    this.seek(Math.floor(this.s.ph) + 1);
  };
  end = () => {
    this.pause();
    this.seek(this.n);
  };
  setSpeed = (speed: number) => this.set({ speed });
  setFollow = (follow: boolean) => {
    this.set({ follow });
    if (follow) {
      if (this.s.ph >= this.n) this.frameOverview();
      else this.frameStep(Math.min(Math.floor(this.s.ph), this.n - 1));
    }
  };
  setShowAll = (showAll: boolean) => this.set({ showAll });
  zoom = (factor: number) => {
    this.plot?.zoomCenter(factor);
    if (this.s.follow) this.set({ follow: false });
  };
  get span() {
    return this.plot?.span ?? 10;
  }
}

export const engine = new Engine();

export function usePlay<T>(sel: (s: PlayState) => T): T {
  return useSyncExternalStore(engine.subscribe, () => sel(engine.get()));
}
