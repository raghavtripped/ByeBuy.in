// src/app/layout.tsx
import ThemeScript from '@/components/ThemeScript';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // Ensure this is imported so your CSS variables are loaded
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AuthWatchlistManager from '@/components/AuthWatchlistManager';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bidly – Campus Auctions', // Consider changing to ByeBuy if brand name is final
  description: 'Your campus marketplace for timed auctions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full"> {/* ThemeScript will toggle 'dark' class here */}
      <head>
        <ThemeScript />
      </head>
      <body
        // OPTION 1 (Recommended - Explicit Tailwind utility for light text in dark mode):
        className={`${inter.className} bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen text-gray-900 dark:text-gray-100`}
        // OPTION 2 (Relying purely on your globals.css variables - remove Tailwind dark text utility):
        // className={`${inter.className} bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen text-gray-900`}
        // And ensure your globals.css body rule for dark mode correctly applies var(--foreground-dark)
        // and that var(--foreground-dark) is a light color.
        // Option 1 is generally more direct when already using Tailwind utility classes.
      >
        <AuthWatchlistManager />
        <Navbar />
        <main className="pt-4 flex-grow container mx-auto px-4 sm:px-6 lg:p-8"> 
            {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}