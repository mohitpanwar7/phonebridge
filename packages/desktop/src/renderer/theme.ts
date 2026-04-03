// Token-based theme system with dark/light themes.
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
  bg: '#0f0f13',
  surface: '#1a1a24',
  surface2: '#252534',
  border: '#2d2d3d',
  text: '#e8e8f0',
  textMuted: '#8888aa',
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
};

export const lightTheme: Theme = {
  bg: '#f5f5fa',
  surface: '#ffffff',
  surface2: '#eeeef8',
  border: '#d0d0e0',
  text: '#1a1a2e',
  textMuted: '#6666aa',
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
};

export type ThemeMode = 'dark' | 'light';

export function applyTheme(mode: ThemeMode) {
  const t = mode === 'dark' ? darkTheme : lightTheme;
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  Object.entries(t).forEach(([key, value]) => {
    root.style.setProperty(`--${camelToKebab(key)}`, value);
  });
}

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

export function getPreferredTheme(): ThemeMode {
  const saved = localStorage.getItem('phonebridge-theme') as ThemeMode | null;
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
