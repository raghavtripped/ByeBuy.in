// src/app/layout.tsx
import ThemeScript from '@/components/ThemeScript';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AuthWatchlistManager from '@/components/AuthWatchlistManager'; // ENSURE THIS IS UNCOMMENTED

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bidly – Campus Auctions',
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
        className={`${inter.className} bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen text-gray-900 dark:text-gray-800`} // Note: text-gray-800 in dark mode might be hard to see
      >
        <AuthWatchlistManager /> {/* ENSURE THIS IS UNCOMMENTED */}
        <Navbar />
        <main className="pt-4 flex-grow container mx-auto px-4 sm:px-6 lg:p-8"> 
            {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}