/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#06060a',
          900: '#0a0a10',
          850: '#0e0e15',
          800: '#12121b',
          750: '#171722',
          700: '#1e1e2b',
          600: '#2a2a3a',
        },
        iris: {
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        electric: {
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#22d3ee',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,.22), 0 18px 60px -20px rgba(124,58,237,.5)',
        card: '0 1px 0 rgba(255,255,255,.03) inset, 0 24px 60px -32px rgba(0,0,0,.9)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(.9)', opacity: '.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1200%)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
        float: 'float 7s ease-in-out infinite',
        pulseRing: 'pulseRing 2.4s cubic-bezier(.2,.6,.3,1) infinite',
        scan: 'scan 5s linear infinite',
        rise: 'rise .5s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
}
