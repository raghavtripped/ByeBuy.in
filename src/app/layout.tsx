// src/app/layout.tsx
import ThemeScript from '@/components/ThemeScript';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

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
        {/* inject dark/light class before paint */}
        <ThemeScript />
      </head>

      {/* light bg → gray-50 | dark bg → gray-900 */}
      <body
        className={`${inter.className} bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen`}
      >
        <Navbar />
        <main className="pt-4 flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
