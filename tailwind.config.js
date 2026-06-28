/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        verdict: {
          true: '#10b981',
          mostly: '#f59e0b',
          false: '#ef4444',
          misleading: '#f59e0b',
          unverifiable: '#6b7280',
        },
      },
    },
  },
  plugins: [],
};
