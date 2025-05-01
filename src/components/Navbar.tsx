// src/components/Navbar.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';

export default function Navbar() {
  const [user, setUser]   = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router            = useRouter();

  /* ─────────── check auth + realtime listener ─────────── */
  useEffect(() => {
    async function getUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error) console.error('Error fetching user:', error.message);
      setUser(data?.user ?? null);
      setLoading(false);
    }
    getUser();

    /* keep user in sync */
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => { authListener?.subscription?.unsubscribe(); };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
      alert(`Logout failed: ${error.message}`);
    } else {
      setUser(null);
      router.push('/auth');
    }
  };

  /* ─────────── loading skeleton ─────────── */
  if (loading) {
    return (
      <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="h-8 w-20 bg-gray-700 rounded animate-pulse"></div>
          <div className="flex space-x-4 animate-pulse">
            <div className="h-6 bg-gray-700 rounded w-20"></div>
            <div className="h-6 bg-gray-700 rounded w-20"></div>
            <div className="h-6 bg-gray-700 rounded w-16"></div>
          </div>
        </div>
      </nav>
    );
  }

  /* ─────────── real navbar ─────────── */
  return (
    <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Left: logo + all listings link */}
        <div className="flex items-center space-x-4">
          <Link href="/listings" className="flex items-center flex-shrink-0">
            <Image
              src="/bidly-logo.svg"
              alt="Bidly Logo"
              width={80}
              height={32}
              priority
              className="h-8 w-auto"
            />
          </Link>

          <Link
            href="/listings"
            className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
          >
            All Listings
          </Link>
        </div>

        {/* Right: conditional links */}
        <div className="flex items-center space-x-4">
          {user ? (
            <>
              <Link
                href="/listings/new"
                className="text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-md text-sm font-medium"
              >
                + List Item
              </Link>
              <Link
                href="/my-listings"
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                My Listings
              </Link>
              <Link
                href="/my-bids"
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                My Bids
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium"
            >
              Login / Sign Up
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
