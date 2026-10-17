# Root Calculator

**Live:** https://richardjaee.github.io/rootcalculator.github.io/

Type a function, pick a method, and watch it hunt down a root of f(x) = 0, one animated iteration at a time.

## Methods

| Family | Methods |
| --- | --- |
| Bracketing | Bisection, False Position (regula falsi), Illinois, Ridders |
| Hybrid | ITP (Interpolate–Truncate–Project), Brent |
| Open | Newton, Secant, Halley, Müller |
| Fixed-point | Fixed-point iteration, Steffensen |

Each method has its own animation: shrinking brackets, chords, tangent lines, Halley's osculating hyperbola, Müller's parabola, cobweb diagrams and Aitken leaps.

## Features

- Playback controls with a scrubber and speed control, plus a camera that follows the iterations
- Pan, zoom and pinch on the graph; **All roots** marks every root in view, and clicking one solves there
- **Method race**: every method runs on your function and is ranked by iterations to converge
- 35 curated examples: famous constants, physics and finance equations, and functions that break particular methods
- Live LaTeX preview and symbolic derivatives (via [math.js](https://mathjs.org)), plus shareable links
- Light and dark themes, works on mobile

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # algorithm + example tests (vitest)
npm run build    # type-check and build to dist/
```

Built with Vite, React and TypeScript. Pushing to `master` runs the tests and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
