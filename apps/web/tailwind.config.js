/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#F6F7FB',
        surface: '#FFFFFF',
        ink: '#111827',
        muted: '#6B7280',
        line: '#E6E8F0',
        brand: {
          50: '#EEF0FF',
          100: '#DDE0FF',
          200: '#C5C6FD',
          400: '#8183F4',
          500: '#5B5BF0',
          600: '#4F46E5',
          700: '#4338CA',
        },
        ok: '#16A34A',
        run: '#D97706',
        fail: '#DC2626',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(17, 24, 39, 0.06)',
        lift: '0 8px 20px rgba(79, 70, 229, 0.25)',
      },
    },
  },
  plugins: [],
};
