// Apple-inspired design token system with dark/light themes.

export type ThemeMode = 'dark' | 'light';

// ---------------------------------------------------------------------------
// Legacy interface (kept for backward-compat; prefer Tokens below)
// ---------------------------------------------------------------------------
export interface Theme {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  danger: string;
  success: string;
  warning: string;
}

export const darkTheme: Theme = {
  bg: '#0a0a0f',
  surface: '#141419',
  surface2: '#1c1c24',
  border: '#2d2d3d',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  danger: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
};

export const lightTheme: Theme = {
  bg: '#f5f5f7',
  surface: '#ffffff',
  surface2: '#f0f0f5',
  border: '#d0d0e0',
  text: '#1d1d1f',
  textMuted: '#86868b',
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  danger: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
};

// ---------------------------------------------------------------------------
// Expanded token set
// ---------------------------------------------------------------------------
export interface Tokens {
  // Backgrounds
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceGlass: string;

  // Borders
  border: string;
  borderSubtle: string;

  // Text hierarchy
  t1: string;
  t2: string;
  t3: string;
  t4: string;

  // Accent
  accent: string;
  accentHover: string;
  accentLight: string;
  accentBg: string;
  accentBgSubtle: string;

  // Semantic
  green: string;
  greenBg: string;
  red: string;
  redBg: string;
  amber: string;
  amberBg: string;
  blue: string;
  blueBg: string;

  // Font
  mono: string;
}

const MONO_STACK =
  "'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Menlo', 'Consolas', monospace";

const darkTokens: Tokens = {
  // Backgrounds
  bg: '#0a0a0f',
  surface: '#141419',
  surfaceRaised: '#1c1c24',
  surfaceGlass: 'rgba(20,20,30,0.72)',

  // Borders
  border: 'rgba(255,255,255,0.08)',
  borderSubtle: 'rgba(255,255,255,0.04)',

  // Text
  t1: '#f4f4f5',
  t2: '#a1a1aa',
  t3: '#71717a',
  t4: '#52525b',

  // Accent
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  accentLight: '#a78bfa',
  accentBg: 'rgba(124,58,237,0.16)',
  accentBgSubtle: 'rgba(124,58,237,0.08)',

  // Semantic
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.12)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.12)',
  amber: '#f59e0b',
  amberBg: 'rgba(245,158,11,0.12)',
  blue: '#3b82f6',
  blueBg: 'rgba(59,130,246,0.12)',

  // Font
  mono: MONO_STACK,
};

const lightTokens: Tokens = {
  // Backgrounds
  bg: '#f5f5f7',
  surface: '#ffffff',
  surfaceRaised: '#f0f0f5',
  surfaceGlass: 'rgba(255,255,255,0.72)',

  // Borders
  border: 'rgba(0,0,0,0.08)',
  borderSubtle: 'rgba(0,0,0,0.04)',

  // Text
  t1: '#1d1d1f',
  t2: '#424245',
  t3: '#86868b',
  t4: '#aeaeb2',

  // Accent
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  accentLight: '#8b5cf6',
  accentBg: 'rgba(124,58,237,0.10)',
  accentBgSubtle: 'rgba(124,58,237,0.05)',

  // Semantic
  green: '#16a34a',
  greenBg: 'rgba(22,163,74,0.10)',
  red: '#dc2626',
  redBg: 'rgba(220,38,38,0.10)',
  amber: '#d97706',
  amberBg: 'rgba(217,119,6,0.10)',
  blue: '#2563eb',
  blueBg: 'rgba(37,99,235,0.10)',

  // Font
  mono: MONO_STACK,
};

/** Return the full token set for the given mode. */
export function getTokens(mode: ThemeMode): Tokens {
  return mode === 'dark' ? darkTokens : lightTokens;
}

// ---------------------------------------------------------------------------
// Glass helper -- returns an inline-style object for frosted-glass surfaces
// ---------------------------------------------------------------------------
export interface GlassStyle {
  background: string;
  backdropFilter: string;
  WebkitBackdropFilter: string;
  border: string;
}

/** Convenience: returns a CSS-in-JS style object for a frosted-glass panel. */
export function cssGlass(mode: ThemeMode): GlassStyle {
  const tk = getTokens(mode);
  return {
    background: tk.surfaceGlass,
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: `1px solid ${tk.border}`,
  };
}

// ---------------------------------------------------------------------------
// Apply theme to DOM  (sets CSS custom properties + body/root background)
// ---------------------------------------------------------------------------
export function applyTheme(mode: ThemeMode) {
  const t = mode === 'dark' ? darkTheme : lightTheme;
  const tk = getTokens(mode);
  const root = document.documentElement;

  root.setAttribute('data-theme', mode);

  // Legacy custom properties (--bg, --surface, etc.)
  Object.entries(t).forEach(([key, value]) => {
    root.style.setProperty(`--${camelToKebab(key)}`, value);
  });

  // Extended token custom properties (--tk-bg, --tk-surface-glass, etc.)
  Object.entries(tk).forEach(([key, value]) => {
    root.style.setProperty(`--tk-${camelToKebab(key)}`, value);
  });

  // Keep body/html background in sync
  document.body.style.background = tk.bg;
  root.style.background = tk.bg;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

export function getPreferredTheme(): ThemeMode {
  const saved = localStorage.getItem('phonebridge-theme') as ThemeMode | null;
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
