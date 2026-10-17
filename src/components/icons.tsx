import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 16, ...p }: P) => ({ viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, ...p });
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Logo = (p: P) => (
  <svg {...base(p)} viewBox="0 0 32 32">
    <g {...stroke} strokeWidth={2.2}>
      <circle cx="16" cy="5" r="3" />
      <path d="M16 8v7M16 15c-2 3-5.5 4-8 4M16 15c2 3 5.5 4 8 4M16 15c-1.5 3-3.5 5-4.5 8.5M16 15c1.5 3 3.5 5 4.5 8.5" />
      <circle cx="5.5" cy="19" r="2.5" />
      <circle cx="26.5" cy="19" r="2.5" />
      <circle cx="10.8" cy="26.5" r="2.5" />
      <circle cx="21.2" cy="26.5" r="2.5" />
    </g>
  </svg>
);
export const GitHub = (p: P) => (
  <svg {...base(p)}>
    <path
      fill="currentColor"
      d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
    />
  </svg>
);
export const Sun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    <path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" {...stroke} strokeWidth={2} />
  </svg>
);
export const Moon = (p: P) => (
  <svg {...base(p)}>
    <path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
  </svg>
);
export const Arrow = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" {...stroke} />
  </svg>
);
export const Link = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" {...stroke} strokeWidth={2} />
  </svg>
);
export const Chevron = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" {...stroke} />
  </svg>
);
export const Copy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" {...stroke} strokeWidth={2} />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" {...stroke} strokeWidth={2} />
  </svg>
);
export const Play = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
  </svg>
);
export const Pause = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" />
  </svg>
);
export const Prev = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 6l-6 6 6 6" {...stroke} strokeWidth={2.4} />
  </svg>
);
export const Next = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" {...stroke} strokeWidth={2.4} />
  </svg>
);
export const Restart = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 5v14M19 5l-9 7 9 7z" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
  </svg>
);
export const End = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 5v14M5 5l9 7-9 7z" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
  </svg>
);
export const Target = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={2} />
  </svg>
);
export const Fit = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...stroke} strokeWidth={2} />
  </svg>
);
export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" {...stroke} />
  </svg>
);
export const Minus = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" {...stroke} />
  </svg>
);
export const Roots = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12h20" {...stroke} strokeWidth={1.6} />
    <circle cx="6" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth={2} />
    <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth={2} />
    <circle cx="18" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth={2} />
  </svg>
);
export const Search = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" {...stroke} strokeWidth={2} />
    <path d="M20 20l-3.5-3.5" {...stroke} strokeWidth={2} />
  </svg>
);
export const Flag = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" {...stroke} strokeWidth={2} />
  </svg>
);
