// src/components/Navbar.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';

const LOG_PREFIX = "Navbar DEBUG:"; // For easy filtering

// Custom hook to get the previous value of a prop or state
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined); // MODIFIED: Initialize useRef with undefined
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

export default function Navbar() {
  console.log(LOG_PREFIX, "Component RENDERED"); 

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const prevPathname = usePrevious(pathname); 
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    console.log(LOG_PREFIX, "isMobileMenuOpen STATE CHANGED to:", isMobileMenuOpen);
  }, [isMobileMenuOpen]);

  // Effect 1: Initial session and user fetch
  useEffect(() => {
    console.log(LOG_PREFIX, "Effect 1 (Initial Session) RUNNING");
    let mounted = true; 
    const getSessionAndUser = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error(LOG_PREFIX, "Error getting initial session:", sessionError.message);
      }
      if (mounted) {
        setUser(session?.user ?? null);
        setLoading(false);
        console.log(LOG_PREFIX, "Effect 1 - User set:", session?.user?.id);
      }
    };
    getSessionAndUser();
    return () => { 
        mounted = false; 
        console.log(LOG_PREFIX, "Effect 1 - CLEANUP");
    }
  }, []);

  // Effect 2: onAuthStateChange listener
  useEffect(() => {
    console.log(LOG_PREFIX, "Effect 2 (onAuthStateChange Listener Setup) RUNNING");
    let mounted = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      console.log(LOG_PREFIX, "Effect 2 - onAuthStateChange FIRED. Event:", _event, "User ID:", session?.user?.id);
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
      console.log(LOG_PREFIX, "Effect 2 - CLEANUP onAuthStateChange Listener");
    };
  }, []);

  // Effect 2.1: Close mobile menu on user sign-out
  useEffect(() => {
    console.log(LOG_PREFIX, "Effect 2.1 (Close on SignOut) RUNNING. User:", user?.id, "Menu Open:", isMobileMenuOpen);
    if (!user && isMobileMenuOpen) {
      console.log(LOG_PREFIX, "Effect 2.1 - SIGNED OUT & menu open, closing menu.");
      setIsMobileMenuOpen(false);
    }
  }, [user, isMobileMenuOpen]);

  // Effect 3: Close mobile menu ONLY on actual route change
  useEffect(() => {
    console.log(LOG_PREFIX, "Effect 3 (Route Change) RUNNING. Pathname:", pathname, "Prev Pathname:", prevPathname, "Menu Open:", isMobileMenuOpen);
    if (prevPathname !== undefined && pathname !== prevPathname && isMobileMenuOpen) {
      console.log(LOG_PREFIX, "Effect 3 - Pathname ACTUALLY changed from", prevPathname, "to", pathname, "closing mobile menu.");
      setIsMobileMenuOpen(false);
    }
  }, [pathname, prevPathname, isMobileMenuOpen]); 

  // Effect 4: Escape key closes mobile menu
  useEffect(() => {
    console.log(LOG_PREFIX, "Effect 4 (Escape Key Listener Setup) RUNNING. Menu Open:", isMobileMenuOpen);
    const handleEscapeKey = (event: KeyboardEvent) => {
      console.log(LOG_PREFIX, "Effect 4 - Keydown event:", event.key);
      if (event.key === 'Escape' && isMobileMenuOpen) {
        console.log(LOG_PREFIX, "Effect 4 - ESCAPE pressed, closing mobile menu.");
        setIsMobileMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      console.log(LOG_PREFIX, "Effect 4 - CLEANUP Escape Key Listener");
    };
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = useCallback(() => {
    console.log(LOG_PREFIX, "toggleMobileMenu CALLED. Current state before toggle:", isMobileMenuOpen);
    setIsMobileMenuOpen((prev) => {
      console.log(LOG_PREFIX, "toggleMobileMenu - setIsMobileMenuOpen updater. Prev state:", prev, "New state:", !prev);
      return !prev;
    });
  }, [isMobileMenuOpen]); 

  const handleLogout = useCallback(async () => {
    console.log(LOG_PREFIX, "handleLogout CALLED");
    if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false); 
        console.log(LOG_PREFIX, "handleLogout - Explicitly closed mobile menu.");
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(LOG_PREFIX, 'Logout error:', error.message);
      alert(`Logout failed: ${error.message}`);
      return;
    }
    router.push('/');
  }, [router, isMobileMenuOpen]);

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
        { href: '/account/settings', text: 'My Account' },
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
          onClick={() => {
            console.log(LOG_PREFIX, "Overlay CLICKED. Current menu state:", isMobileMenuOpen);
            setIsMobileMenuOpen(false);
          }}
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
            onClick={() => {
              console.log(LOG_PREFIX, "Menu Panel Close Button CLICKED. Current menu state:", isMobileMenuOpen);
              setIsMobileMenuOpen(false);
            }}
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
              onClick={() => {
                console.log(LOG_PREFIX, "Mobile Nav Link CLICKED:", l.text, "Current menu state:", isMobileMenuOpen);
                setIsMobileMenuOpen(false);
              }}
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
                  onClick={() => {
                    console.log(LOG_PREFIX, "Mobile User Nav Link CLICKED:", l.text, "Current menu state:", isMobileMenuOpen);
                    setIsMobileMenuOpen(false);
                  }}
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
                onClick={() => {
                  console.log(LOG_PREFIX, "Mobile Create Listing Link CLICKED. Current menu state:", isMobileMenuOpen);
                  setIsMobileMenuOpen(false);
                }}
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
              onClick={() => {
                console.log(LOG_PREFIX, "Mobile Login/Signup Link CLICKED. Current menu state:", isMobileMenuOpen);
                setIsMobileMenuOpen(false);
              }}
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