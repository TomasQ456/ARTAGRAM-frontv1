/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0B0912',
          900: '#120F1A',
          800: '#1B1626',
          700: '#241E33',
          600: '#332B47',
          500: '#453A5E',
        },
        paper: {
          DEFAULT: '#F5F1EA',
          muted: '#B8AFCB',
          dim: '#8A80A3',
        },
        coral: {
          DEFAULT: '#FF6B57',
          dark: '#E14F3C',
          light: '#FF9282',
        },
        teal: {
          DEFAULT: '#2FD9C4',
          dark: '#1FB6A4',
        },
        amber: {
          DEFAULT: '#FFC24B',
          dark: '#E6A62E',
        },
        violet: {
          DEFAULT: '#8B5CF6',
          dark: '#7440E0',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px -8px rgba(0,0,0,0.6)',
        'glow-coral': '0 0 24px -4px rgba(255,107,87,0.55)',
      },
      backgroundImage: {
        'grain': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};
