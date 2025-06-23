// tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}', // Scan app directory recursively
    './src/components/**/*.{js,ts,jsx,tsx,mdx}', // Scan components directory
    './src/app/*.{js,ts,jsx,tsx,mdx}', // Scan root app files (layout, page)
  ],
  theme: {
    extend: {
      // Add custom dark mode colours inspired by Reddit and remap Indigo/Purple/Violet
      colors: {
        // Dark-mode palette (unchanged)
        'bye-dark-bg-primary': '#1A1A1B',       // Main background (Reddit #1A1A1B)
        'bye-dark-bg-secondary': '#272729',     // Cards, modals (Reddit #272729)
        'bye-dark-bg-hover': '#2A2A2B',         // Hover/active states (Reddit #2A2A2B)
        'bye-dark-text-primary': '#D7DADC',     // Main text (Reddit #D7DADC)
        'bye-dark-text-secondary': '#818384',   // Secondary text, metadata (Reddit #818384)
        'bye-dark-border-primary': '#343536',   // Borders, separators (Reddit #343536)

        // Reddit orange scale – used to override indigo/purple/violet default palettes
        indigo: {
          50: '#fff4f0',
          100: '#ffe5d9',
          200: '#ffc1ac',
          300: '#ff936a',
          400: '#ff6327',
          500: '#ff4500', /* primary */
          600: '#e03d00',
          700: '#bf3400',
          800: '#9c2b00',
          900: '#7d2300',
        },
        purple: {
          50: '#fff4f0',
          100: '#ffe5d9',
          200: '#ffc1ac',
          300: '#ff936a',
          400: '#ff6327',
          500: '#ff4500',
          600: '#e03d00',
          700: '#bf3400',
          800: '#9c2b00',
          900: '#7d2300',
        },
        violet: {
          50: '#fff4f0',
          100: '#ffe5d9',
          200: '#ffc1ac',
          300: '#ff936a',
          400: '#ff6327',
          500: '#ff4500',
          600: '#e03d00',
          700: '#bf3400',
          800: '#9c2b00',
          900: '#7d2300',
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-fluid-type')({
      settings: {
        fontSizeMin: 0.75,   // 12px at the smallest screen
        fontSizeMax: 1.25,   // 20px at screenMax
        ratioMin: 1.125,     // Minor third
        ratioMax: 1.2,       // Major third
        screenMin: 320,      // Start scaling at 320px viewport width
        screenMax: 1536,     // Stop scaling at the default 2xl breakpoint
        unit: 'rem',         // Use rem so it obeys user zoom preferences
      },
    }),
  ],
};