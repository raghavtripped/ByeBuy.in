// src/app/layout.tsx
import ThemeScript from '@/components/ThemeScript';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // Ensure this is imported so your CSS variables are loaded
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AuthWatchlistManager from '@/components/AuthWatchlistManager';
import MobileBottomNav from '@/components/MobileBottomNav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ByeBuy – Campus Auctions',
  description: 'Your campus marketplace for timed auctions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <ThemeScript />
      </head>
      <body
        // Updated dark mode classes to use the new custom colors
        className={`${inter.className} bg-gray-50 dark:bg-bye-dark-bg-primary flex flex-col min-h-screen text-gray-900 dark:text-bye-dark-text-primary`}
      >
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