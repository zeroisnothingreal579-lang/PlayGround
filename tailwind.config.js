/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08080c',
          900: '#0b0b11',
          850: '#0e0e16',
          800: '#12121c',
          750: '#171725',
          700: '#1d1d2d',
          600: '#29293d',
          500: '#38384f',
          400: '#5d5d78',
          300: '#8b8ba6',
          200: '#b9b9cc',
          100: '#e6e6f0',
        },
        violet: {
          50: '#f4f1ff',
          100: '#ebe5ff',
          200: '#d8ccff',
          300: '#bca4ff',
          400: '#9c75ff',
          500: '#8147ff',
          600: '#7025f5',
          700: '#5f17d7',
          800: '#5015b0',
          900: '#42158d',
        },
        mint: '#54e6b1',
        amber: '#f6c768',
        coral: '#ff7b8a',
        sky: '#6bc7ff',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 20px 60px -30px rgba(0,0,0,.65)',
        violet: '0 0 0 1px rgba(129,71,255,.34), 0 18px 50px -20px rgba(112,37,245,.45)',
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .3s ease both',
        'pulse-ring': 'pulse-ring 2.4s ease-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        float: 'float 7s ease-in-out infinite',
        scan: 'scan 3.6s linear infinite',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(84,230,177,.45)' },
          '70%': { boxShadow: '0 0 0 7px rgba(84,230,177,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(84,230,177,0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '15%': { opacity: '.65' },
          '85%': { opacity: '.65' },
          '100%': { transform: 'translateY(1000%)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
