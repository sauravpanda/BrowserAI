/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"  // This tells Tailwind to scan these file types in src folder
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  darkMode: 'class', // Enable dark mode if needed
}