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
      // Add custom dark mode colors inspired by Reddit
      colors: {
        'bye-dark-bg-primary': '#1A1A1B',       // Main background (Reddit #1A1A1B)
        'bye-dark-bg-secondary': '#272729',     // Cards, modals (Reddit #272729)
        'bye-dark-bg-hover': '#2A2A2B',         // Hover/active states (Reddit #2A2A2B)
        'bye-dark-text-primary': '#D7DADC',     // Main text (Reddit #D7DADC)
        'bye-dark-text-secondary': '#818384',   // Secondary text, metadata (Reddit #818384)
        'bye-dark-border-primary': '#343536',   // Borders, separators (Reddit #343536)
        // You can add more specific shades if needed later,
        // e.g., for different text opacities or border variants.
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