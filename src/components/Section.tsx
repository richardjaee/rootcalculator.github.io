import type { ReactNode } from 'react';

export function Section(props: { id: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section id={props.id} className="section">
      <header className="section-head">
        <h2>{props.title}</h2>
        {props.lede && <p className="section-lede">{props.lede}</p>}
      </header>
      {props.children}
    </section>
  );
}
