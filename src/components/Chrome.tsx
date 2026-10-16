import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { EXAMPLES, type Example } from '../lib/examples';
import { METHODS, METHOD_ORDER } from '../lib/meta';
import { compileFn } from '../lib/parse';
import { Arrow, GitHub, Logo, Moon, Sun } from './icons';
import { Tex } from './Tex';

const REPO = 'https://github.com/richardjaee/rootcalculator.github.io';

export function TopBar({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  return (
    <header className="topbar">
      <a className="brand" href="./">
        <span className="logo">
          <Logo size={22} />
        </span>
        <span className="brand-name">
          Root<span className="dim">Finder</span>
        </span>
      </a>
      <nav className="topnav">
        <a href="#race">Race</a>
        <a href="#examples">Examples</a>
        <a href="#guide">Guide</a>
      </nav>
      <div className="topbar-actions">
        <a className="icon-btn" href={REPO} target="_blank" rel="noopener" aria-label="View source on GitHub">
          <GitHub size={18} />
        </a>
        <button className="icon-btn" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              style={{ display: 'grid' }}
            >
              {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </header>
  );
}

const TICKER = ['omega', 'kepler', 'phi', 'logistic-cycle', 'wien', 'newton-cycle', 'irr', 'pi-sin'];

export function Hero({ onLoad }: { onLoad: (ex: Example) => void }) {
  const items = useMemo(
    () =>
      TICKER.map((id) => {
        const ex = EXAMPLES.find((e) => e.id === id)!;
        let tex = ex.values.fx;
        try {
          tex = `${METHODS[ex.method].kind}(x) = ${compileFn(ex.values.fx).tex}`;
        } catch {
          /* fall back to the raw text */
        }
        return { ex, tex };
      }),
    [],
  );
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), 3200);
    return () => clearInterval(t);
  }, [paused, items.length]);
  const cur = items[i];

  return (
    <section className="hero">
      <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
        Find where <span className="grad">f(x) = 0</span>.
      </motion.h1>
      <motion.p className="lede" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.08 }}>
        Type any function, pick one of {METHOD_ORDER.length} root-finding methods, and watch it close in on the root one animated step at a time. Then race all of them against each other.
      </motion.p>
      <motion.div className="hero-row" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.16 }}>
        <button
          className="ticker"
          onClick={() => onLoad(cur.ex)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-label={`Try ${cur.ex.title}`}
        >
          <span className="ticker-label">Try</span>
          <span className="ticker-window">
            <AnimatePresence mode="wait">
              <motion.span
                key={cur.ex.id}
                className="ticker-item"
                initial={{ y: 18, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -18, opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.35 }}
              >
                <Tex tex={cur.tex} />
                <small>{cur.ex.title}</small>
              </motion.span>
            </AnimatePresence>
          </span>
          <Arrow size={15} />
        </button>
        <div className="hero-stats">
          <a href="#guide">
            <b>{METHOD_ORDER.length}</b> methods
          </a>
          <a href="#examples">
            <b>{EXAMPLES.length}</b> examples
          </a>
          <a href="#race">
            <b>1</b> race
          </a>
        </div>
      </motion.div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>
        Made by <strong>Richard Chung</strong>
      </span>
      <span className="dot">•</span>
      <a href={REPO} target="_blank" rel="noopener">
        Source
      </a>
      <span className="dot">•</span>
      <span className="kbd-hint">
        <kbd>Space</kbd> play/pause <kbd>←</kbd>
        <kbd>→</kbd> step
      </span>
    </footer>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message}
          className="toast"
          role="status"
          initial={{ opacity: 0, y: 24, x: '-50%', scale: 0.95 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: 12, x: '-50%', scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
