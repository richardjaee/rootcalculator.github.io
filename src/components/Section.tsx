import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function Section(props: { id: string; eyebrow: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <motion.section
      id={props.id}
      className="section"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="section-head">
        <span className="eyebrow accent">{props.eyebrow}</span>
        <h2>{props.title}</h2>
        {props.lede && <p className="section-lede">{props.lede}</p>}
      </header>
      {props.children}
    </motion.section>
  );
}
