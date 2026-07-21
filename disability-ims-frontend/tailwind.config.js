/** @type {import('tailwindcss').Config} */
// Design adopted from the Fuel Loyalty "System Administrator" dashboard:
// green brand, Inter, slate surfaces, soft panel shadows. Brand colours are
// also exposed as CSS variables (src/index.css) so high-contrast mode can
// override every colour at once.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: { 25: '#f8fafc' },
        brand: {
          50: '#ebf8f0',
          100: '#d3efdd',
          200: '#a7dfbb',
          300: '#6fca92',
          400: '#38b06a',
          500: '#087536',
          600: '#0a6b30',
          700: '#075126',
          800: '#063f1e',
          900: '#052f16',
        },
        // legacy tokens mapped to CSS variables (keep existing pages working)
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        border: 'var(--border)',
        'border-2': 'var(--border-2)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        'muted-2': 'var(--muted-2)',
      },
      boxShadow: {
        panel: '0 12px 40px rgba(15, 23, 42, 0.06)',
        soft: '0 8px 24px rgba(8, 117, 54, 0.18)',
      },
      backgroundImage: {
        'brand-radial':
          'radial-gradient(circle at top right, rgba(56, 176, 106, 0.20), transparent 32%), radial-gradient(circle at bottom left, rgba(8, 117, 54, 0.14), transparent 28%)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
