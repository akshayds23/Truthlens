/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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
        }
      }
    },
  },
  plugins: [],
}
