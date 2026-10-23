// ─────────────────────────────────────────────────────────────────────────────
//icons.js — Crisp Vector SVG Icon Registry for The Twilight Arcade
// Zero OS emojis. Stroke-2 geometric cyber-arcade vector iconography.
// ─────────────────────────────────────────────────────────────────────────────

const PATHS = {
  coin: `
    <polygon points="12 2 20.5 7 20.5 17 12 22 3.5 17 3.5 7" stroke="currentColor" stroke-width="2" fill="rgba(255,184,74,0.16)" stroke-linejoin="round"/>
    <polygon points="12 6.5 14 10.2 18 10.8 15 13.6 15.8 17.5 12 15.6 8.2 17.5 9 13.6 6 10.8 10 10.2" stroke="currentColor" stroke-width="1.6" fill="currentColor" stroke-linejoin="round"/>
  `,
  ticket: `
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.14)" stroke-linejoin="round"/>
    <line x1="9.5" y1="6" x2="9.5" y2="18" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2.2 2.2" stroke-linecap="round"/>
    <path d="M13.5 10.5h3.5M13.5 13.5h2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,
  trophy: `
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" stroke="currentColor" stroke-width="2" fill="rgba(255,184,74,0.15)" stroke-linejoin="round"/>
    <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 14v4M8 20h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,
  crown: `
    <polygon points="3 18 5 7 9.5 12 12 5 14.5 12 19 7 21 18" stroke="currentColor" stroke-width="2" fill="rgba(255,184,74,0.18)" stroke-linejoin="round"/>
    <line x1="3" y1="21" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,
  shield: `
    <path d="M12 2.5 19.5 5.8v5.7c0 5-3.2 8.7-7.5 10.2-4.3-1.5-7.5-5.2-7.5-10.2V5.8L12 2.5Z" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.12)" stroke-linejoin="round"/>
    <path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  bolt: `
    <polygon points="13 2 4 14 11 14 10 22 20 10 13 10" stroke="currentColor" stroke-width="2" fill="rgba(255,184,74,0.2)" stroke-linejoin="round"/>
  `,
  flame: `
    <path d="M12 2.5c2.2 3.2 5.5 5.6 5.5 10.2A5.5 5.5 0 0 1 6.5 12.7c0-2.6 1.4-4.7 2.8-6.2.4 1.8 1.6 2.5 2.7 2.5-.5-2.1-.7-4.3 0-6.5Z" stroke="currentColor" stroke-width="2" fill="rgba(255,106,90,0.18)" stroke-linejoin="round"/>
  `,
  gamepad: `
    <path d="M6 8h12a4 4 0 0 1 3.9 4.9l-1.1 5a2.6 2.6 0 0 1-4.4 1.2L14.2 17H9.8l-2.2 2.1a2.6 2.6 0 0 1-4.4-1.2l-1.1-5A4 4 0 0 1 6 8Z" stroke="currentColor" stroke-width="2" fill="rgba(138,92,255,0.14)" stroke-linejoin="round"/>
    <path d="M7.5 11v3M6 12.5h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="15.5" cy="11.5" r="1" fill="currentColor"/>
    <circle cx="17.5" cy="13.5" r="1" fill="currentColor"/>
  `,
  crosshair: `
    <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
    <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,
  swords: `
    <path d="m14.5 17.5-11-11V3h3.5l11 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m13 19 6-6M16 16l4 4M19 21l2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="m9.5 17.5 11-11V3H17L6 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m11 19-6-6M8 16l-4 4M5 21l-2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,
  idCard: `
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.1)"/>
    <circle cx="8.5" cy="11" r="2.3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M5.2 16.5c.8-1.7 2-2.5 3.3-2.5s2.5.8 3.3 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M14 9.5h4.5M14 12.5h4.5M14 15.5h2.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,
  camera3d: `
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.14)" stroke-linejoin="round"/>
    <path d="m12 12 8-4.5M12 12 4 7.5M12 12v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,
  isoGrid: `
    <polygon points="12 3 21 8 12 13 3 8" stroke="currentColor" stroke-width="2" fill="rgba(138,92,255,0.15)" stroke-linejoin="round"/>
    <polyline points="3 12.5 12 17.5 21 12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="3 16.5 12 21.5 21 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  orbit: `
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="currentColor"/>
    <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-24 12 12)" stroke="currentColor" stroke-width="1.8"/>
    <path d="m18.5 5.5 2 1-1 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  eightBall: `
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="rgba(18,22,40,0.85)"/>
    <circle cx="12" cy="10.5" r="4" stroke="currentColor" stroke-width="1.6"/>
    <text x="12" y="12.5" text-anchor="middle" font-size="6.5" font-weight="800" fill="currentColor" font-family="Inter, sans-serif">8</text>
  `,
  dice: `
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.2" stroke="currentColor" stroke-width="2" fill="rgba(255,77,154,0.14)"/>
    <circle cx="8.2" cy="8.2" r="1.4" fill="currentColor"/>
    <circle cx="15.8" cy="8.2" r="1.4" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
    <circle cx="8.2" cy="15.8" r="1.4" fill="currentColor"/>
    <circle cx="15.8" cy="15.8" r="1.4" fill="currentColor"/>
  `,
  claw: `
    <path d="M12 2v5M8.5 7h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M9 7c-2.5 2-3.5 5-2 8l2.5 2M15 7c2.5 2 3.5 5 2 8l-2.5 2M12 7v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="19" r="2.5" stroke="currentColor" stroke-width="1.8" fill="rgba(255,184,74,0.2)"/>
  `,
  terminal: `
    <rect x="2.5" y="4" width="19" height="16" rx="2.5" stroke="currentColor" stroke-width="2" fill="rgba(95,224,138,0.1)"/>
    <path d="m7 9.5 3 2.5-3 2.5M12 14.5h4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  shirt: `
    <path d="M8.5 4 12 6l3.5-2 4.5 3.2-2.2 3.8-2.3-1.2V20H8.5V9.8L6.2 11 4 7.2 8.5 4Z" stroke="currentColor" stroke-width="2" fill="rgba(255,77,154,0.12)" stroke-linejoin="round"/>
  `,
  hammer: `
    <path d="m14.5 6.5 3 3-9.5 9.5-3-3 9.5-9.5Z" stroke="currentColor" stroke-width="2" fill="rgba(255,184,74,0.15)" stroke-linejoin="round"/>
    <path d="m13 5 2.5-2.5 5 5L18 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  map: `
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.12)" stroke-linejoin="round"/>
    <line x1="9" y1="3" x2="9" y2="18" stroke="currentColor" stroke-width="1.8"/>
    <line x1="15" y1="6" x2="15" y2="21" stroke="currentColor" stroke-width="1.8"/>
  `,
  briefcase: `
    <rect x="3" y="7" width="18" height="13" rx="2.2" stroke="currentColor" stroke-width="2" fill="rgba(255,184,74,0.12)"/>
    <path d="M9 7V5a1.8 1.8 0 0 1 1.8-1.8h2.4A1.8 1.8 0 0 1 15 5v2M3 12.5h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,
  sparkles: `
    <path d="m12 2.5 2.1 5.4 5.4 2.1-5.4 2.1-2.1 5.4-2.1-5.4-5.4-2.1 5.4-2.1L12 2.5Z" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.18)" stroke-linejoin="round"/>
    <path d="M19 16.5v4M17 18.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,
  phone: `
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" stroke="currentColor" stroke-width="2" fill="rgba(138,92,255,0.14)"/>
    <line x1="10" y1="5.5" x2="14" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="12" cy="18" r="1.1" fill="currentColor"/>
  `,
  radio: `
    <rect x="3" y="8" width="18" height="12" rx="2.5" stroke="currentColor" stroke-width="2" fill="rgba(255,77,154,0.12)"/>
    <path d="M6 8 16.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="8.5" cy="14" r="2.5" stroke="currentColor" stroke-width="1.8"/>
    <path d="M14 12h4M14 15.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,
  wave: `
    <path d="M7.5 11V5.5a1.5 1.5 0 0 1 3 0V10M10.5 10V4.5a1.5 1.5 0 0 1 3 0V10M13.5 10V5.5a1.5 1.5 0 0 1 3 0V13M16.5 11.5a1.5 1.5 0 0 1 3 0v3c0 4-2.8 6.5-6.5 6.5S6.5 18.5 6.5 14v-3a1.5 1.5 0 0 1 3 0" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  dance: `
    <circle cx="12" cy="4.5" r="2.2" stroke="currentColor" stroke-width="2"/>
    <path d="m7 9.5 5 1.5 5-3M12 11v4.5l-3.5 5M12 15.5l4 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  hype: `
    <polyline points="5 13 12 6 19 13" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="5 19 12 12 19 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  think: `
    <circle cx="12" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.1)"/>
    <path d="M9.8 9.2a2.2 2.2 0 1 1 3.4 1.9c-.8.5-1.2 1-1.2 1.9M12 15.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="6.5" cy="19.5" r="1.2" fill="currentColor"/>
  `,
  chat: `
    <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4.5 3.5v-3.5H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5Z" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.12)" stroke-linejoin="round"/>
    <path d="M7.5 10.5h9M7.5 13.5h5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,
  gift: `
    <rect x="3.5" y="8" width="17" height="4" rx="1" stroke="currentColor" stroke-width="2" fill="rgba(255,184,74,0.18)"/>
    <path d="M5 12h14v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8ZM12 8v13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12 8H8.5a2.2 2.2 0 1 1 0-4.4C10.8 3.6 12 8 12 8ZM12 8h3.5a2.2 2.2 0 1 0 0-4.4C13.2 3.6 12 8 12 8Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
  `,
  lock: `
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2" fill="rgba(154,160,192,0.12)"/>
    <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,
  check: `
    <polyline points="4.5 12.5 9.5 17.5 19.5 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  close: `
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  `,
  eye: `
    <path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" stroke-width="2" fill="rgba(84,224,238,0.1)"/>
    <circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="2" fill="currentColor"/>
  `,
  users: `
    <circle cx="9" cy="8.5" r="3" stroke="currentColor" stroke-width="2"/>
    <path d="M3.5 18.5c.9-2.8 3-4.2 5.5-4.2s4.6 1.4 5.5 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16.5" cy="9.5" r="2.3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M15.5 14.5c2 .2 3.8 1.4 4.5 3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,
};

export function icon(name, size = 16, cls = '') {
  const body = PATHS[name] || PATHS.sparkles;
  const classAttr = cls ? ` class="svgIcon ${cls}"` : ` class="svgIcon"`;
  return `<svg${classAttr} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
}

export { PATHS };
