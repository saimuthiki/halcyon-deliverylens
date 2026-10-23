/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#15212B', soft: '#3A4852' },
        paper: '#F3F5F4',
        surface: '#FFFFFF',
        line: '#D9DFDD',
        slate: { DEFAULT: '#5E6B75', light: '#E7ECEA' },
        route: { DEFAULT: '#0E6B63', dark: '#0A524C', tint: '#E3F1EE' },
        late: { DEFAULT: '#A84F0B', tint: '#FBEEE2' },
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
