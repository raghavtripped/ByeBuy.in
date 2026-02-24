// src/app/layout.tsx
'use client';

import { useState, useEffect } from 'react';
import ThemeScript from '@/components/ThemeScript';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import SplashScreen from '@/components/SplashScreen';
import LoadingSpinner from '@/components/LoadingSpinner';
import NotificationProvider from '@/components/NotificationProvider';
import ErrorBoundary from '@/components/ErrorBoundary';
import AuthWatchlistManager from '@/components/AuthWatchlistManager';
import { supabase } from '@/lib/supabaseClient';

const inter = Inter({ subsets: ['latin'] });

function getInitialTheme(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showSplash, setShowSplash] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [mainAppVisible, setMainAppVisible] = useState(false);
  const [isDark] = useState(getInitialTheme);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    // Timeout fallback: force initialization after 8s to prevent infinite loading
    const timeout = setTimeout(() => {
      setAuthInitialized(true);
      setIsClient(true);
    }, 8000);

    // Initialize auth
    supabase.auth.getSession().then(() => {
      clearTimeout(timeout);
      setAuthInitialized(true);
      setIsClient(true);
    }).catch(() => {
      // On failure, still unblock the UI — user just won't be authenticated
      clearTimeout(timeout);
      setAuthInitialized(true);
      setIsClient(true);
    });

    // Set up auth listener — also unblocks isClient on INITIAL_SESSION event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setAuthInitialized(true);
      setIsClient(true);
    });

    return () => {
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, []);

  const handleSplashHidden = () => {
    setShowSplash(false);
    setTimeout(() => {
      setMainAppVisible(true);
    }, 50);
  };

  if (!isClient || !authInitialized) {
    return (
      <html lang="en" className={`h-full ${isDark ? 'dark' : ''}`}>
        <head>
          <ThemeScript />
          <title>ByeBuy – Loading...</title>
          <meta name="description" content="Your campus marketplace for timed auctions." />
        </head>
        <body className={`${inter.className} bg-bye-dark-bg-primary flex flex-col min-h-screen`} suppressHydrationWarning>
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gradient-to-br from-bye-dark-bg-primary via-bye-dark-bg-secondary to-bye-dark-bg-primary">
            <LoadingSpinner message="Initializing ByeBuy..." />
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={`h-full ${isDark ? 'dark' : ''}`}>
      <head>
        <ThemeScript />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body
        className={`${inter.className} bg-gray-50 dark:bg-bye-dark-bg-primary flex flex-col min-h-screen text-gray-900 dark:text-bye-dark-text-primary`}
        suppressHydrationWarning
      >
        {showSplash && (
          <SplashScreen onHidden={handleSplashHidden} minDisplayTime={2000} />
        )}
        
        <div 
          className={`flex flex-col min-h-screen transition-opacity duration-300 ease-in-out ${mainAppVisible ? 'opacity-100' : 'opacity-0'}`}
          style={{ visibility: mainAppVisible ? 'visible' : 'hidden' }}
        >
          <ErrorBoundary>
            <AuthWatchlistManager />
            <Navbar />
            <main className="pt-4 flex-grow container mx-auto px-3 sm:px-4 md:px-6 lg:p-8">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
            <Footer />
            <MobileBottomNav />
          </ErrorBoundary>
        </div>
        <NotificationProvider />
      </body>
    </html>
  );
}