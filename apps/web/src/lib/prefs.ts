const THEME_KEY = 'opex.theme';
const LANG_KEY = 'opex.language';
const AUTOSAVE_KEY = 'opex.autosave';
const HIGHLIGHT_KEY = 'opex.highlight';
const SOUND_KEY = 'opex.sound';

export type ThemePref = 'Light' | 'Dark' | 'System';

function readFlag(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

export function getTheme(): ThemePref {
  const raw = localStorage.getItem(THEME_KEY);
  if (raw === 'Light' || raw === 'Dark' || raw === 'System') return raw;
  return 'Light';
}

export function applyTheme(theme: ThemePref): void {
  localStorage.setItem(THEME_KEY, theme);
  const dark =
    theme === 'Dark' ||
    (theme === 'System' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function getLanguage(): string {
  return localStorage.getItem(LANG_KEY) ?? 'English';
}

export function setLanguage(value: string): void {
  localStorage.setItem(LANG_KEY, value);
}

export function getAutoSave(): boolean {
  return readFlag(AUTOSAVE_KEY, true);
}

export function setAutoSave(value: boolean): void {
  localStorage.setItem(AUTOSAVE_KEY, String(value));
}

export function getHighlight(): boolean {
  return readFlag(HIGHLIGHT_KEY, true);
}

export function setHighlight(value: boolean): void {
  localStorage.setItem(HIGHLIGHT_KEY, String(value));
}

export function getSound(): boolean {
  return readFlag(SOUND_KEY, false);
}

export function setSound(value: boolean): void {
  localStorage.setItem(SOUND_KEY, String(value));
}
