// src/components/Navbar.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // --- Auth State ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session) setIsMobileMenuOpen(false);
    });
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // --- Mobile Menu Logic ---
  useEffect(() => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleLogout = async () => {
    setIsMobileMenuOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
      return alert(`Logout failed: ${error.message}`);
    }
    router.push('/auth'); // Or router.push('/') if you prefer them to land on homepage after logout
  };

  // --- Loading Skeleton ---
  if (loading) {
    return (
      <nav className="bg-gray-800 h-14 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between relative">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-8 bg-gray-700 rounded-full animate-pulse" />
            <div className="h-6 w-20 bg-gray-700 rounded animate-pulse hidden sm:block" />
          </div>
           <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
            <div className="h-6 w-16 bg-gray-700 rounded animate-pulse"></div>
          </div>
          <div className="hidden md:flex space-x-4 animate-pulse">
            <div className="h-6 bg-gray-700 w-24 rounded" />
            <div className="h-6 bg-gray-700 w-28 rounded" />
            <div className="h-7 bg-gray-700 w-24 rounded-md" />
          </div>
          <div className="md:hidden h-7 w-7 bg-gray-700 rounded animate-pulse" />
        </div>
      </nav>
    );
  }

  const navLinkClasses = (href: string): string => {
    const isActive = pathname === href;
    let classes = `transition-colors duration-150 ease-in-out text-sm rounded-md `;
    classes += `px-3 py-2 font-medium `;
    classes += isActive
        ? 'bg-gray-900 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white';
    return classes;
  };

  const mobileNavLinkClasses = (href: string): string => {
    const isActive = pathname === href;
    return `block px-4 py-3 text-base font-medium rounded-md transition-colors
            ${isActive
                ? 'bg-indigo-500 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`;
  };


  // --- Main Navbar JSX ---
  return (
    <>
      <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between relative">
          <div className="flex items-center flex-shrink-0">
            {/* Changed Link href to "/" */}
            <Link href="/" className="flex items-center space-x-2 group">
              <Image
                src="/bidly-logo.svg" alt="ByeBuy logo" width={32} height={32} priority // Alt text updated
                className="h-8 w-auto group-hover:opacity-90 transition-opacity"
              />
              <span className="text-lg font-semibold hidden md:inline group-hover:text-indigo-300 transition-colors">
                ByeBuy
              </span>
            </Link>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
            {/* Changed Link href to "/" and text to "ByeBuy" */}
            <Link href="/" className="text-lg font-semibold text-white hover:text-indigo-300 transition-colors">
              ByeBuy
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-1 flex-grow justify-start ml-4">
            {/* Changed Link href to "/" for Active Auctions if it's the homepage */}
            <Link href="/" className={navLinkClasses("/")}>
              Active Auctions
            </Link>
            <Link href="/listings/archive" className={navLinkClasses("/listings/archive")}>
              Auction Archive
            </Link>
            {user && (
              <>
                <Link href="/my-listings" className={navLinkClasses("/my-listings")}>
                  My Listings
                </Link>
                <Link href="/my-bids" className={navLinkClasses("/my-bids")}>
                  My Bids
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center flex-shrink-0">
            <div className="hidden md:flex items-center space-x-2 sm:space-x-3">
              {user ? (
                <>
                  <Link
                    href="/listings/new"
                    className="text-gray-200 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-1.5"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
                    List Item
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
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

            <div className="md:hidden">
              <button
                ref={buttonRef}
                onClick={toggleMobileMenu}
                aria-label="Toggle menu"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-menu-panel"
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              >
                {isMobileMenuOpen ? (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen && (
          <div
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-hidden="true"
          ></div>
      )}
      <div
        id="mobile-menu-panel"
        ref={menuRef}
        className={`fixed top-0 right-0 h-full w-64 sm:w-72 bg-gray-800 shadow-xl p-5 transform transition-transform duration-300 ease-in-out z-50 md:hidden
                    ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-heading"
      >
        <div className="flex justify-between items-center mb-6">
            <h2 id="mobile-menu-heading" className="text-lg font-semibold text-white">Menu</h2>
            <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 text-gray-300 hover:text-white rounded-md hover:bg-gray-700"
                aria-label="Close menu"
            >
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        <nav className="space-y-2">
          {/* Changed Link href to "/" for Active Auctions if it's the homepage */}
          <Link href="/" className={mobileNavLinkClasses("/")}>Active Auctions</Link>
          <Link href="/listings/archive" className={mobileNavLinkClasses("/listings/archive")}>Auction Archive</Link>
          {user ? (
            <>
              <hr className="border-gray-700 my-3" />
              <Link href="/listings/new" className={`${mobileNavLinkClasses("/listings/new")} bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 flex items-center justify-center`}>
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
                Create New Listing
              </Link>
              <Link href="/my-listings" className={mobileNavLinkClasses("/my-listings")}>My Listings</Link>
              <Link href="/my-bids" className={mobileNavLinkClasses("/my-bids")}>My Bids</Link>
              <hr className="border-gray-700 my-3" />
              <button onClick={handleLogout} className="block w-full text-left px-4 py-3 text-base font-medium rounded-md text-red-300 hover:bg-red-700 hover:text-white transition-colors">Logout</button>
            </>
          ) : (
            <>
              <hr className="border-gray-700 my-3" />
              <Link href="/auth" className={`${mobileNavLinkClasses("/auth")} bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 flex items-center justify-center`}>Login / Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </>
  );
}