// src/app/layout.tsx
'use client'; // RootLayout MUST be a client component to manage this state

import { useState, useEffect } from 'react';
import ThemeScript from '@/components/ThemeScript';
// Removed Metadata import as it's less standard for client component layouts
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AuthWatchlistManager from '@/components/AuthWatchlistManager';
import MobileBottomNav from '@/components/MobileBottomNav';
import SplashScreen from '@/components/SplashScreen'; // Import the splash screen

const inter = Inter({ subsets: ['latin'] });

// If you need to set a default title or metadata for the whole app,
// you can do it directly in the <head> or consider if a server component
// higher up (if you had nested layouts) would handle it.
// For a simple app, just letting page.tsx files handle their metadata is common.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showSplash, setShowSplash] = useState(true);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // No explicit timer here to hide the splash.
    // The SplashScreen component itself will call onSplashHidden after its minDisplayTime.
  }, []);

  const handleSplashHidden = () => {
    setShowSplash(false); // This will remove SplashScreen from the DOM
  };

  if (!isClient) {
    // Server-Side Render / Pre-Hydration:
    // Render nothing or a very minimal static placeholder to avoid FOUC.
    // Since the splash screen is full-page and fixed, rendering an empty
    // html/body or a body with just the splash screen's initial non-animated state
    // can work. The goal is to prevent the main layout from flashing.
    return (
      <html lang="en" className="h-full">
        <head>
          <ThemeScript />
          {/* Minimal head content for SSR phase of splash */}
          <title>ByeBuy – Loading...</title> {/* Static title */}
        </head>
        {/* You could put a simplified, non-JS version of the splash screen's first frame here
            or just a solid background color matching the splash screen.
            For simplicity, an empty body or one with just a basic loader is also an option.
            However, to truly prevent layout flash, the server should ideally output
            something that visually matches the splash screen's initial state if possible.
            Given the complexity of your splash, a solid color matching its gradient start
            might be the most practical SSR placeholder.
        */}
        <body className={`${inter.className} bg-indigo-700 flex flex-col min-h-screen`}>
            {/* This body will be replaced upon client hydration */}
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className="h-full">
      <head>
        <ThemeScript />
        {/* Individual pages should set their own titles via export const metadata */}
      </head>
      <body
        className={`${inter.className} bg-gray-50 dark:bg-bye-dark-bg-primary flex flex-col min-h-screen text-gray-900 dark:text-bye-dark-text-primary`}
      >
        {showSplash && (
          <SplashScreen onHidden={handleSplashHidden} minDisplayTime={2500} />
        )}
        
        {/* Main app structure - visibility controlled by splash screen presence */}
        {/* No opacity transition needed here if splash covers everything and then unmounts */}
        <AuthWatchlistManager />
        <Navbar />
        <main className="pt-4 flex-grow container mx-auto px-4 sm:px-6 lg:p-8">
          {children} {/* This will render the content of /listings (or other pages) */}
        </main>
        <Footer />
        <MobileBottomNav />
      </body>
    </html>
  );
}