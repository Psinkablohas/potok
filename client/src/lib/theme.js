import { useSyncExternalStore } from 'react';

// Тема хранится в localStorage и применяется классом .dark на <html>
const KEY = 'potok-theme';
const listeners = new Set();

function read() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

let current = read();

export function isDarkTheme(theme) {
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function apply() {
  document.documentElement.classList.toggle('dark', isDarkTheme(current));
}

apply();

export function setTheme(theme) {
  current = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* приватный режим */ }
  apply();
  listeners.forEach((fn) => fn());
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  apply();
  listeners.forEach((fn) => fn());
});

export function useTheme() {
  const theme = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => current);
  return [theme, setTheme];
}
