// src/app/layout.tsx
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
      {/* body acts as a flex column so footer sticks to bottom */}
      <body
        className={`${inter.className} bg-gray-50 flex flex-col min-h-screen`}
      >
        <Navbar />
        {/* main grows to fill, pushing footer down */}
        <main className="pt-4 flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
