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

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showSplash, setShowSplash] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [mainAppVisible, setMainAppVisible] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSplashHidden = () => {
    setShowSplash(false);
    setTimeout(() => {
      setMainAppVisible(true);
    }, 50);
  };

  if (!isClient) {
    return (
      <html lang="en" className="h-full">
        <head>
          <ThemeScript />
          <title>ByeBuy – Loading...</title>
          <meta name="description" content="Your campus marketplace for timed auctions." />
        </head>
        <body className={`${inter.className} bg-bye-dark-bg-primary flex flex-col min-h-screen`}>
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gradient-to-br from-bye-dark-bg-primary via-bye-dark-bg-secondary to-bye-dark-bg-primary">
            <LoadingSpinner message="Initializing ByeBuy..." />
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className="h-full">
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${inter.className} bg-gray-50 dark:bg-bye-dark-bg-primary flex flex-col min-h-screen text-gray-900 dark:text-bye-dark-text-primary`}
      >
        {showSplash && (
          <SplashScreen onHidden={handleSplashHidden} minDisplayTime={3500} />
        )}
        
        <div 
          className={`flex flex-col min-h-screen transition-opacity duration-300 ease-in-out ${mainAppVisible ? 'opacity-100' : 'opacity-0'}`}
          style={{ visibility: mainAppVisible ? 'visible' : 'hidden' }}
        >
          <ErrorBoundary>
            <Navbar />
            <main className="pt-4 flex-grow container mx-auto px-4 sm:px-6 lg:p-8">
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