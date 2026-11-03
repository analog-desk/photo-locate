import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07080a', 900: '#0c0e12', 850: '#11141a', 800: '#161a21', 700: '#222833', 600: '#2f3744', 500: '#4a5566' },
        gold: { 300: '#ffd89a', 400: '#ffc56b', 500: '#f5a742', 600: '#d9862a' },
        dusk: { 300: '#9fb8ff', 400: '#7593f5', 500: '#5371dc', 600: '#3b55b8' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-up': 'fadeUp .5s ease-out both' },
    },
  },
  plugins: [],
} satisfies Config;
