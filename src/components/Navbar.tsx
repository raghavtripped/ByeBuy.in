// src/components/Navbar.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  /* ── auth sync ─────────────────────────────── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => listener?.subscription?.unsubscribe();
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

  /* ── skeleton while auth resolves ──────────── */
  if (loading) {
    return (
      <nav className="bg-gray-800 h-14 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="h-8 w-20 bg-gray-700 rounded animate-pulse" />
          <div className="flex space-x-4 animate-pulse">
            <div className="h-6 bg-gray-700 w-20 rounded" />
            <div className="h-6 bg-gray-700 w-20 rounded" />
            <div className="h-6 bg-gray-700 w-16 rounded" />
          </div>
        </div>
      </nav>
    );
  }

  /* ── real navbar ───────────────────────────── */
  return (
    <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* left block — logo + “All listings” */}
        <div className="flex items-center space-x-4">
          {/* >>> icon + text wrapped in one link <<< */}
          <Link href="/listings" className="flex items-center space-x-2">
            <Image
              src="/bidly-logo.svg"
              alt="Bidly logo"
              width={32}
              height={32}
              priority
              className="h-8 w-auto"
            />
            <span className="text-lg font-semibold hidden sm:inline">Bidly</span>
          </Link>

          <Link
            href="/listings"
            className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
          >
            All Listings
          </Link>
        </div>

        {/* right block — conditional */}
        <div className="flex items-center space-x-4">
          {user ? (
            <>
              <Link
                href="/listings/new"
                className="text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-md text-sm"
              >
                + List Item
              </Link>
              <Link
                href="/my-listings"
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm"
              >
                My Listings
              </Link>
              <Link
                href="/my-bids"
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm"
              >
                My Bids
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm"
            >
              Login / Sign Up
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
