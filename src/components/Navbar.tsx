// src/components/Navbar.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react'; // Added useCallback
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

  // Effect 1: Initial session and user fetch (runs once on mount)
  useEffect(() => {
    // console.log("Navbar: Initial session fetch effect RUNNING");
    let mounted = true; 

    const getSessionAndUser = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Navbar: Error getting initial session:", sessionError.message);
      }
      if (mounted) {
        // console.log("Navbar: Initial session user:", session?.user?.id);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    };
    getSessionAndUser();
    
    return () => {
        mounted = false;
    }
  }, []); // Empty dependency array - runs only on mount

  // Effect 2: onAuthStateChange listener (runs primarily on mount, re-evaluates if isMobileMenuOpen changes)
  useEffect(() => {
    // console.log("Navbar: Setting up onAuthStateChange listener effect RUNNING. isMobileMenuOpen:", isMobileMenuOpen);
    let mounted = true;

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // console.log("Navbar: onAuthStateChange event:", event, "User:", session?.user?.id);
      setUser(session?.user ?? null);
      // setLoading(false); // Loading is primarily for initial load, auth changes update user

      // If user logs out WHILE mobile menu is open, close it.
      if (event === 'SIGNED_OUT' && isMobileMenuOpen) {
        // console.log("Navbar: User signed out, mobile menu was open, closing it.");
        setIsMobileMenuOpen(false);
      }
    });

    return () => {
      mounted = false;
      // console.log("Navbar: Cleaning up onAuthStateChange listener.");
      authListener?.subscription?.unsubscribe();
    };
  // isMobileMenuOpen is included because it's used in the callback for a conditional state update.
  // This means the listener will be re-subscribed if isMobileMenuOpen changes.
  // If this causes performance issues or unwanted re-subscriptions,
  // an alternative would be to manage menu closing on logout via a different effect that watches `user`.
  }, [isMobileMenuOpen]); 

  // Effect 3: Close mobile menu on route change
  useEffect(() => {
    if (isMobileMenuOpen) {
      // console.log("Navbar: Pathname changed, closing mobile menu.");
      setIsMobileMenuOpen(false);
    }
  }, [isMobileMenuOpen, pathname]); // Only depends on pathname

  // Effect 4: Escape key closes mobile menu
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileMenuOpen) {
        // console.log("Navbar: Escape key pressed, closing mobile menu.");
        setIsMobileMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isMobileMenuOpen]); // Depends on isMobileMenuOpen to add/remove listener

  // --- handlers (useCallback for stable references if passed as props, good practice) ---
  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  const handleLogout = useCallback(async () => {
    setIsMobileMenuOpen(false); 
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
      alert(`Logout failed: ${error.message}`); // Using alert as per original
      return;
    }
    router.push('/');
  }, [router]); // router is a stable dependency from next/navigation

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
            <div className="h-6 bg-gray-700 w-24 rounded" /> {/* Active Auctions */}
            <div className="h-6 bg-gray-700 w-28 rounded" /> {/* Auction Archive */}
            <div className="h-6 bg-gray-700 w-28 rounded" /> {/* My Watchlist */}
            <div className="h-6 bg-gray-700 w-24 rounded" /> {/* My Listings */}
            <div className="h-6 bg-gray-700 w-20 rounded" /> {/* My Bids */}
            <div className="h-6 bg-gray-700 w-24 rounded" /> {/* My Account */}
            <div className="h-7 bg-gray-700 w-24 rounded-md" /> {/* List Item / Login */}
          </div>
          <div className="md:hidden h-7 w-7 bg-gray-700 rounded animate-pulse" />
        </div>
      </nav>
    );
  }

  // --- Link Styling Functions ---
  const navLinkClasses = (href: string): string => {
    const isActive = pathname === href;
    return `transition-colors duration-150 ease-in-out text-sm rounded-md px-3 py-2 font-medium ${
      isActive
        ? 'bg-gray-900 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;
  };

  const mobileNavLinkClasses = (href: string): string => {
    const isActive = pathname === href;
    return `block px-4 py-3 text-base font-medium rounded-md transition-colors ${
      isActive
        ? 'bg-indigo-500 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;
  };

// --- Define Link Structures ---
const commonNavLinks = [
  { href: '/', text: 'Active Auctions' },
  { href: '/listings/archive', text: 'Auction Archive' },
];

const userNavLinks = user
  ? [
      { href: '/my-watchlist', text: 'My Watchlist' },
      { href: '/my-listings', text: 'My Listings' },
      { href: '/my-bids',     text: 'My Bids' },
      { href: '/account/settings', text: 'My Account' }, // <-- ADDED THIS LINE
    ]
  : [];

  // --- Main Navbar JSX ---
  return (
    <>
      <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between relative">
          {/* Logo Section */}
          <div className="flex items-center flex-shrink-0">
            <Link href="/" className="flex items-center space-x-2 group">
              <Image
                src="/bidly-logo.svg"
                alt="ByeBuy logo"
                width={32}
                height={32}
                priority
                className="h-8 w-auto group-hover:opacity-90 transition-opacity"
              />
              <span className="text-lg font-semibold hidden md:inline group-hover:text-indigo-300 transition-colors">
                ByeBuy
              </span>
            </Link>
          </div>

          {/* Centered Mobile Logo/Title */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
            <Link href="/" className="text-lg font-semibold text-white hover:text-indigo-300 transition-colors">
              ByeBuy
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-1 flex-grow justify-start ml-4">
            {commonNavLinks.map((l) => (
              <Link key={l.text} href={l.href} className={navLinkClasses(l.href)}>
                {l.text}
              </Link>
            ))}
            {user &&
              userNavLinks.map((l) => (
                <Link key={l.text} href={l.href} className={navLinkClasses(l.href)}>
                  {l.text}
                </Link>
              ))}
          </div>

          {/* Right Aligned Actions (Desktop and Mobile Hamburger) */}
          <div className="flex items-center flex-shrink-0">
            {/* desktop buttons */}
            <div className="hidden md:flex items-center space-x-2 sm:space-x-3">
              {user ? (
                <>
                  <Link
                    href="/listings/new"
                    className="text-gray-200 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-4 h-4 mr-1.5"
                    >
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                    </svg>
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

            {/* mobile hamburger */}
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
                  <svg
                    className="block h-6 w-6"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="block h-6 w-6"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* mobile overlay & panel */}
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
        className={`fixed top-0 right-0 h-full w-64 sm:w-72 bg-gray-800 shadow-xl p-5 transform transition-transform duration-300 ease-in-out z-50 md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
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
            <svg
              className="h-6 w-6"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <nav className="space-y-2">
          {commonNavLinks.map((l) => (
            <Link
              key={`mobile-${l.text}`}
              href={l.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={mobileNavLinkClasses(l.href)}
            >
              {l.text}
            </Link>
          ))}

          {user && (
            <>
              <hr className="border-gray-700 my-3" />
              {userNavLinks.map((l) => (
                <Link
                  key={`mobile-${l.text}`}
                  href={l.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={mobileNavLinkClasses(l.href)}
                >
                  {l.text}
                </Link>
              ))}
            </>
          )}

          <hr className="border-gray-700 my-3" />

          {user ? (
            <>
              <Link
                href="/listings/new"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`${mobileNavLinkClasses(
                  '/listings/new'
                )} bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 flex items-center justify-center`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-4 h-4 mr-2"
                >
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
                Create New Listing
              </Link>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-3 text-base font-medium rounded-md text-red-300 hover:bg-red-700 hover:text-white transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`${mobileNavLinkClasses(
                '/auth'
              )} bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 flex items-center justify-center`}
            >
              Login / Sign Up
            </Link>
          )}
        </nav>
      </div>
    </>
  );
}