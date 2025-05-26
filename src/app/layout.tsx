// src/app/layout.tsx
'use client'; // RootLayout MUST be a client component to manage this state

import { useState, useEffect } from 'react';
// Removed usePathname as it wasn't strictly needed for the simplified SSR fallback
import ThemeScript from '@/components/ThemeScript';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AuthWatchlistManager from '@/components/AuthWatchlistManager';
import MobileBottomNav from '@/components/MobileBottomNav';
import SplashScreen from '@/components/SplashScreen';
import LoadingSpinner from '@/components/LoadingSpinner'; // Ensure this is imported

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showSplash, setShowSplash] = useState(true);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSplashHidden = () => {
    setShowSplash(false);
  };

  if (!isClient) {
    // Server-Side Render / Pre-Hydration Fallback:
    // This aims to match the initial appearance of the splash screen.
    return (
      <html lang="en" className="h-full">
        <head>
          <ThemeScript />
          <title>ByeBuy – Loading...</title>
          {/* Minimal necessary meta tags for SSR if any */}
        </head>
        {/* MODIFIED: Body background to match splash's primary dark color */}
        <body className={`${inter.className} bg-bye-dark-bg-primary flex flex-col min-h-screen`}>
            {/* MODIFIED: Full-screen div with gradient matching SplashScreen */}
            <div className="fixed inset-0 z-[10000] flex items-center justify-center 
                           bg-gradient-to-br from-bye-dark-bg-primary via-bye-dark-bg-secondary to-bye-dark-bg-primary">
                <LoadingSpinner message="Initializing ByeBuy..." /> {/* Ensure LoadingSpinner text is visible on this bg */}
            </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className="h-full">
      <head>
        <ThemeScript />
        {/* Titles and other metadata should be handled by individual page.tsx files */}
      </head>
      <body
        className={`${inter.className} bg-gray-50 dark:bg-bye-dark-bg-primary flex flex-col min-h-screen text-gray-900 dark:text-bye-dark-text-primary`}
      >
        {showSplash && (
          <SplashScreen onHidden={handleSplashHidden} minDisplayTime={2500} /> // Using your original minDisplayTime
        )}
        
        {/* Main app structure */}
        <AuthWatchlistManager />
        <Navbar />
        <main className="pt-4 flex-grow container mx-auto px-4 sm:px-6 lg:p-8">
          {children}
        </main>
        <Footer />
        <MobileBottomNav />
      </body>
    </html>
  );
}