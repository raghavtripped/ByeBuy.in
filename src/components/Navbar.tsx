// src/components/Navbar.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation'; // Ensure usePathname is imported
import { supabase, type User } from '@/lib/supabaseClient';

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname(); // Get current pathname

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
      return alert(`Logout failed: ${error.message}`);
    }
    setUser(null);
    router.push('/auth');
  };

  if (loading) {
    return (
      <nav className="bg-gray-800 h-14 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-8 bg-gray-700 rounded-full animate-pulse" />
            <div className="h-6 w-20 bg-gray-700 rounded animate-pulse sm:inline hidden" />
            <div className="h-6 w-24 bg-gray-700 rounded animate-pulse" />
            <div className="h-6 w-28 bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="flex space-x-4 animate-pulse">
            <div className="h-7 w-24 bg-gray-700 rounded-md" />
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <Link href="/listings" className="flex items-center space-x-2 group">
            <Image
              src="/bidly-logo.svg"
              alt="Bidly logo"
              width={32}
              height={32}
              priority
              className="h-8 w-auto group-hover:opacity-90 transition-opacity"
            />
            <span className="text-lg font-semibold hidden sm:inline group-hover:text-indigo-300 transition-colors">
              Bidly
            </span>
          </Link>

          <Link
            href="/listings"
            className="text-gray-300 hover:text-white px-2 sm:px-3 py-2 rounded-md text-sm font-medium transition-colors"
            aria-current={pathname === "/listings" ? "page" : undefined}
          >
            Active Auctions
          </Link>

          <Link
            href="/listings/archive"
            className="text-gray-300 hover:text-white px-2 sm:px-3 py-2 rounded-md text-sm font-medium transition-colors"
            aria-current={pathname === "/listings/archive" ? "page" : undefined}
          >
            Auction Archive
          </Link>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {user ? (
            <>
              <Link
                href="/listings/new"
                className="text-gray-200 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-1.5">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
                List Item
              </Link>
              <Link
                href="/my-listings"
                className="text-gray-300 hover:text-white px-2 sm:px-3 py-2 rounded-md text-sm hidden md:inline-block transition-colors"
                aria-current={pathname === "/my-listings" ? "page" : undefined}
              >
                My Listings
              </Link>
              <Link
                href="/my-bids"
                className="text-gray-300 hover:text-white px-2 sm:px-3 py-2 rounded-md text-sm hidden md:inline-block transition-colors"
                aria-current={pathname === "/my-bids" ? "page" : undefined}
              >
                My Bids
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                aria-label="Logout"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            >
              Login / Sign Up
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}