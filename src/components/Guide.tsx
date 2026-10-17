import { FAMILY_LABEL, METHODS, METHOD_ORDER } from '../lib/meta';
import type { MethodId } from '../lib/methods';
import { Section } from './Section';
import { Tex } from './Tex';

const SYNTAX: [string, string, string][] = [
  ['Powers', 'x^3, x**2', 'x^{3},\\; x^{2}'],
  ['Implicit ×', '2x, 3 sin(x), x(1 - x)', '2x,\\; 3\\sin x'],
  ['Trig', 'sin cos tan asin acos atan', '\\sin x,\\; \\arctan x'],
  ['Hyperbolic', 'sinh cosh tanh', '\\cosh x'],
  ['Exp & logs', 'e^x, exp(x), log(x), log10(x), log(x, 2)', 'e^{x},\\; \\ln x,\\; \\log_{10} x'],
  ['Roots', 'sqrt(x), cbrt(x), nthRoot(x, 5)', '\\sqrt{x},\\; \\sqrt[3]{x}'],
  ['Other', 'abs(x), sign(x), floor(x)', '|x|'],
  ['Constants', 'pi, e, phi (or π, φ)', '\\pi,\\; e,\\; \\varphi'],
];

export function Guide({ onPick }: { onPick: (m: MethodId) => void }) {
  return (
    <Section
      id="guide"
      title="Methods"
      lede="The trade-off is safety against speed. Bracketing methods always find a root but take more steps. Open methods are faster but can wander off. Fixed-point methods iterate x = g(x) directly."
    >
      <div className="guide-grid">
        {METHOD_ORDER.map((id) => {
          const m = METHODS[id];
          return (
            <article key={id} className="guide-card">
              <header>
                <h3>{m.name}</h3>
                <span className="family">{FAMILY_LABEL[m.family]}</span>
              </header>
              <div className="guide-formula">
                <Tex tex={m.tex} display />
              </div>
              <dl>
                <dt>Speed</dt>
                <dd>{m.order}</dd>
                <dt>Needs</dt>
                <dd>{m.needs}</dd>
              </dl>
              <ul className="pc">
                {m.pros.map((p) => (
                  <li key={p} className="pro">
                    {p}
                  </li>
                ))}
                {m.cons.map((c) => (
                  <li key={c} className="con">
                    {c}
                  </li>
                ))}
              </ul>
              <button className="linkish guide-try" onClick={() => onPick(id)}>
                Use {m.name}
              </button>
            </article>
          );
        })}

        <article className="guide-card syntax">
          <header>
            <h3>Writing functions</h3>
          </header>
          <table>
            <tbody>
              {SYNTAX.map(([name, code, tex]) => (
                <tr key={name}>
                  <th>{name}</th>
                  <td>
                    <code>{code}</code>
                  </td>
                  <td className="syntax-tex">
                    <Tex tex={tex} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="syntax-note">
            Numeric fields accept expressions too, so <code>pi/2</code> or <code>sqrt(2)</code> work as starting points. You can type <code>f(x) =</code> or leave it off.
          </p>
        </article>
      </div>
    </Section>
  );
}
