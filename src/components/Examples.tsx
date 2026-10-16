import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { CATEGORIES, EXAMPLES, type Category, type Example } from '../lib/examples';
import { METHODS, METHOD_COLOR } from '../lib/meta';
import { compileFn } from '../lib/parse';
import { Arrow, Search } from './icons';
import { Section } from './Section';
import { Tex } from './Tex';

export function Examples({ onLoad, activeId }: { onLoad: (ex: Example) => void; activeId: string | null }) {
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return EXAMPLES.filter(
      (e) =>
        (cat === 'all' || e.category === cat) &&
        (!needle || [e.title, e.blurb, e.values.fx, METHODS[e.method].name].some((s) => s.toLowerCase().includes(needle))),
    );
  }, [cat, q]);

  return (
    <Section
      id="examples"
      eyebrow={`${EXAMPLES.length} examples`}
      title="Things to try"
      lede="Famous equations, physical laws, and functions that trip up particular methods. Click a card to load it into the graph."
    >
      <div className="ex-toolbar">
        <div className="ex-cats" role="tablist">
          {CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
              {cat === c.id && <motion.span layoutId="ex-pill" className="ex-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span className="ex-cat-text">
                <span aria-hidden>{c.emoji}</span> {c.label}
              </span>
            </button>
          ))}
        </div>
        <label className="ex-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search examples…" aria-label="Search examples" />
        </label>
      </div>

      <div className="ex-grid">
        <AnimatePresence initial={false}>
          {list.map((ex, i) => (
            <ExampleCard key={ex.id} ex={ex} index={i} active={ex.id === activeId} onLoad={onLoad} />
          ))}
        </AnimatePresence>
        {list.length === 0 && <p className="ex-empty">No examples match “{q}”.</p>}
      </div>
    </Section>
  );
}

function ExampleCard({ ex, index, active, onLoad }: { ex: Example; index: number; active: boolean; onLoad: (ex: Example) => void }) {
  const tex = useMemo(() => {
    const kind = METHODS[ex.method].kind;
    try {
      return `${kind}(x) = ${compileFn(ex.values.fx).tex}`;
    } catch {
      return ex.values.fx;
    }
  }, [ex]);
  const cat = CATEGORIES.find((c) => c.id === ex.category)!;
  return (
    <motion.button
      className={'panel ex-card' + (active ? ' active' : '')}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35, delay: Math.min(index, 12) * 0.03 }}
      whileHover={{ y: -4 }}
      onClick={() => onLoad(ex)}
      style={{ ['--mc' as string]: METHOD_COLOR[ex.method] }}
    >
      <span className="ex-top">
        <span className="ex-cat">
          {cat.emoji} {cat.label}
        </span>
        {ex.answer && <span className="ex-answer">{ex.answer}</span>}
      </span>
      <span className="ex-title">{ex.title}</span>
      <span className="ex-formula">
        <Tex tex={tex} />
      </span>
      <span className="ex-blurb">{ex.blurb}</span>
      <span className="ex-foot">
        <span className="method-chip">{METHODS[ex.method].name}</span>
        <span className="ex-go">
          {active ? 'Loaded' : 'Try it'} <Arrow size={14} />
        </span>
      </span>
    </motion.button>
  );
}
