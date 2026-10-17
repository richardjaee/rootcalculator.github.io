import { EXAMPLES, type Example } from '../lib/examples';
import { METHOD_ORDER } from '../lib/meta';
import { GitHub, Logo, Moon, Sun } from './icons';

const REPO = 'https://github.com/richardjaee/rootcalculator.github.io';

export function TopBar({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="./">
          <Logo size={28} />
          <span>Root Calculator</span>
        </a>
        <nav className="topnav">
          <a href="#workspace">Calculator</a>
          <a href="#race">Race</a>
          <a href="#examples">Problems</a>
          <a href="#guide">Methods</a>
        </nav>
        <div className="topbar-actions">
          <a className="icon-btn" href={REPO} target="_blank" rel="noopener" aria-label="View source on GitHub">
            <GitHub size={18} />
          </a>
          <button className="icon-btn" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}

const TRY = ['kepler', 'phi', 'dottie', 'wien', 'newton-cycle'];

export function Intro({ onLoad }: { onLoad: (ex: Example) => void }) {
  const items = TRY.map((id) => EXAMPLES.find((e) => e.id === id)!);
  return (
    <section className="intro">
      <h1>Root Calculator</h1>
      <p>
        Type a function, pick one of {METHOD_ORDER.length} methods, and watch it narrow in on where f(x) = 0, one step at a time.
      </p>
      <p className="try">
        Try{' '}
        {items.map((ex, i) => (
          <span key={ex.id}>
            <button className="linkish" onClick={() => onLoad(ex)}>
              {ex.title}
            </button>
            {i < items.length - 2 ? ', ' : i === items.length - 2 ? ' or ' : '.'}
          </span>
        ))}
      </p>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-name">Richard Chung</span>
        <span className="footer-links">
          <span className="kbd-hint">
            <kbd>Space</kbd> play/pause · <kbd>←</kbd>
            <kbd>→</kbd> step
          </span>
          <a href={REPO} target="_blank" rel="noopener">
            Source on GitHub
          </a>
        </span>
      </div>
    </footer>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div key={message} className="toast" role="status">
      {message}
    </div>
  );
}
