/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
      },
      animation: {
        blob: 'blob 9s infinite ease-in-out',
        'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.16,1,0.3,1) forwards',
        shimmer: 'shimmer 3s linear infinite',
        'slide-in': 'slideIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      },
      keyframes: {
        blob: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(40px,-60px) scale(1.15)' },
          '66%': { transform: 'translate(-30px,30px) scale(0.9)' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
