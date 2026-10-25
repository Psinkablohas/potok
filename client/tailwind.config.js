const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        subtle: token('subtle'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        primary: { DEFAULT: token('primary'), soft: token('primary-soft'), ink: token('primary-ink') },
        danger: token('danger'),
        success: token('success'),
        warn: token('warn'),
      },
      boxShadow: {
        pop: '0 8px 24px -6px rgb(15 23 42 / 0.18), 0 2px 6px -2px rgb(15 23 42 / 0.08)',
      },
      zIndex: { panel: '30', modal: '40', pop: '50', toast: '60' },
    },
  },
  plugins: [],
};
