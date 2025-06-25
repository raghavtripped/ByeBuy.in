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

        // Light-mode palette for exceptional polish
        'light-bg-primary': '#FFFFFF',          // Pure white for maximum crispness
        'light-bg-secondary': '#F9FAFB',        // Tailwind gray-50 for cards/sections
        'light-bg-hover': '#F3F4F6',            // Tailwind gray-100 for hover states
        'light-text-primary': '#111827',        // Tailwind gray-900 for primary text
        'light-text-secondary': '#4B5563',      // Tailwind gray-600 for secondary text
        'light-border-primary': '#E5E7EB',      // Tailwind gray-200 for subtle borders
        'light-border-interactive': '#D1D5DB',  // Tailwind gray-300 for input borders

        // Remove the temporary blue overrides so that Tailwind's default
        // Indigo / Purple / Violet scales are used again. Those defaults
        // provide the vibrant indigo-600 → purple-600 gradient in light mode
        // and the lighter indigo-500 → purple-500 variant when the `dark:`
        // prefix is applied, exactly matching the requested colour scheme.
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