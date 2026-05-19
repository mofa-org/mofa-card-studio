/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          50: '#FFFCF7',
          100: '#FFF8F0',
          200: '#FFF0E0',
          300: '#E8DCC8',
          400: '#D4C4A8',
        },
        ink: {
          50: '#8B7D6B',
          100: '#6B5E50',
          200: '#5D4E37',
          300: '#3C3226',
          400: '#2C2C2C',
        },
        vermillion: {
          DEFAULT: '#C41E3A',
          light: '#E63946',
          dark: '#8B0000',
        },
        amber: {
          DEFAULT: '#C4956A',
          light: '#E8B931',
          dark: '#B8860B',
        },
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'ink-spread': 'inkSpread 2s ease-in-out infinite',
        'ink-drop': 'inkDrop 1.5s ease-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        inkSpread: {
          '0%': { transform: 'scale(0.3)', opacity: '0.8' },
          '50%': { transform: 'scale(1)', opacity: '0.3' },
          '100%': { transform: 'scale(0.3)', opacity: '0.8' },
        },
        inkDrop: {
          '0%': { transform: 'translateY(-10px) scale(0)', opacity: '0' },
          '30%': { transform: 'translateY(0) scale(1)', opacity: '0.6' },
          '100%': { transform: 'translateY(0) scale(1.5)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
