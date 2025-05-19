// src/components/Navbar.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils'; // Assuming you have cn utility

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
    let mounted = true; 
    const getSessionAndUser = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Navbar: Error getting initial session:", sessionError.message);
      }
      if (mounted) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    };
    getSessionAndUser();
    return () => {
        mounted = false;
    }
  }, []);

  // Effect 2: onAuthStateChange listener (MODIFIED - only handles auth state changes)
  useEffect(() => {
    let mounted = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []); // Empty dependency array - runs only on mount

  // Effect 2.1: New effect to close mobile menu on sign-out if it's open
  useEffect(() => {
    if (!user && isMobileMenuOpen) { 
      setIsMobileMenuOpen(false);
    }
  }, [user, isMobileMenuOpen]); // Depends on user and isMobileMenuOpen

  // Effect 3: Close mobile menu on route change
  useEffect(() => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  }, [pathname, isMobileMenuOpen]); // Added isMobileMenuOpen to ensure it only acts if menu is open

  // Effect 4: Escape key closes mobile menu
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isMobileMenuOpen]); 

  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  const handleLogout = useCallback(async () => {
    setIsMobileMenuOpen(false); 
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
      // Consider replacing alert with your new notification system (Item #8)
      alert(`Logout failed: ${error.message}`); 
      return;
    }
    router.push('/');
  }, [router]); 

  // --- Loading Skeleton ---
  if (loading) {
    return (
      <nav className="bg-background text-foreground h-14 shadow-md sticky top-0 z-50"> {/* Use theme vars */}
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between relative">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-8 bg-muted rounded-full animate-pulse" /> {/* Use theme vars */}
            <div className="h-6 w-20 bg-muted rounded animate-pulse hidden sm:block" />
          </div>
           <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
            <div className="h-6 w-16 bg-muted rounded animate-pulse"></div>
          </div>
          <div className="hidden md:flex items-center space-x-4 animate-pulse"> {/* Adjusted spacing for My Account */}
            <div className="h-6 bg-muted w-24 rounded" /> {/* Active Auctions */}
            <div className="h-6 bg-muted w-28 rounded" /> {/* Auction Archive */}
            <div className="h-6 bg-muted w-28 rounded" /> {/* My Watchlist */}
            <div className="h-6 bg-muted w-24 rounded" /> {/* My Listings */}
            <div className="h-6 bg-muted w-20 rounded" /> {/* My Bids */}
            <div className="h-6 bg-muted w-24 rounded" /> {/* My Account - ADDED SKELETON */}
            <div className="h-7 bg-muted w-24 rounded-md" /> {/* List Item / Login */}
          </div>
          <div className="md:hidden h-7 w-7 bg-muted rounded animate-pulse" />
        </div>
      </nav>
    );
  }

  // --- Link Styling Functions ---
  // Keeping these custom for now as they have specific active states not covered by the generic .link
  const navLinkClasses = (href: string): string => {
    const isActive = pathname === href;
    return `transition-colors duration-150 ease-in-out text-sm rounded-md px-3 py-2 font-medium ${
      isActive
        ? 'bg-gray-900 dark:bg-accent text-white dark:text-accent-foreground' // Adjusted active dark style
        : 'text-gray-300 dark:text-muted-foreground hover:bg-gray-700 dark:hover:bg-accent hover:text-white dark:hover:text-accent-foreground'
    }`;
  };

  const mobileNavLinkClasses = (href: string): string => {
    const isActive = pathname === href;
    return `block px-4 py-3 text-base font-medium rounded-md transition-colors ${
      isActive
        ? 'bg-primary text-primary-foreground' // Use theme vars
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground' // Use theme vars
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
        { href: '/account/settings', text: 'My Account' }, // ADDED "My Account" link
      ]
    : [];

  // --- Main Navbar JSX ---
  return (
    <>
      {/* MODIFIED: Using bg-background and text-foreground from theme */}
      <nav className="bg-background text-foreground shadow-md sticky top-0 z-40 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between relative">
          {/* Logo Section */}
          <div className="flex items-center flex-shrink-0">
            <Link href="/" className="flex items-center space-x-2 group">
              <Image
                src="/bidly-logo.svg" // Assuming this logo works well on both light/dark backgrounds
                alt="ByeBuy logo"
                width={32}
                height={32}
                priority
                className="h-8 w-auto group-hover:opacity-90 transition-opacity"
              />
              <span className="text-lg font-semibold hidden md:inline text-foreground group-hover:text-primary transition-colors">
                ByeBuy
              </span>
            </Link>
          </div>

          {/* Centered Mobile Logo/Title */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
            <Link href="/" className="text-lg font-semibold text-foreground hover:text-primary transition-colors">
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
              userNavLinks.map((l) => ( // userNavLinks now includes "My Account"
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
                  {/* MODIFIED: Using .btn .btn-primary (and .btn-sm for consistency) */}
                  <Link
                    href="/listings/new"
                    className={cn("btn btn-primary btn-sm flex items-center")} // text-gray-200 removed, handled by btn-primary
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-4 h-4 mr-1.5" // Icon color will be inherited or can be set by text-primary-foreground
                    >
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                    </svg>
                    List Item
                  </Link>
                  {/* MODIFIED: Using .btn .btn-destructive .btn-sm */}
                  <button
                    onClick={handleLogout}
                    className={cn("btn btn-destructive btn-sm")}
                  >
                    Logout
                  </button>
                </>
              ) : (
                // MODIFIED: Using .btn .btn-primary .btn-sm
                <Link
                  href="/auth"
                  className={cn("btn btn-primary btn-sm")}
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
                // MODIFIED: Using .icon-btn .icon-btn-ghost for styling
                className={cn("icon-btn icon-btn-ghost p-2 text-muted-foreground hover:text-accent-foreground")}
              >
                {isMobileMenuOpen ? (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                ) : (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
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
          className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm z-40 md:hidden" // Adjusted backdrop opacity
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        ></div>
      )}

      {/* MODIFIED: Using bg-background, text-foreground, border-border from theme */}
      <div
        id="mobile-menu-panel"
        ref={menuRef}
        className={`fixed top-0 right-0 h-full w-64 sm:w-72 bg-background text-foreground border-l border-border shadow-xl p-5 transform transition-transform duration-300 ease-in-out z-50 md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-heading"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id="mobile-menu-heading" className="text-lg font-semibold text-foreground">Menu</h2>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            // MODIFIED: Using .icon-btn .icon-btn-ghost
            className={cn("icon-btn icon-btn-ghost p-1 text-muted-foreground hover:text-accent-foreground")}
            aria-label="Close menu"
          >
            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <nav className="space-y-2">
          {commonNavLinks.map((l) => (
            <Link
              key={`mobile-${l.text}`}
              href={l.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={mobileNavLinkClasses(l.href)} // mobileNavLinkClasses already updated to use theme vars
            >
              {l.text}
            </Link>
          ))}

          {user && (
            <>
              <hr className="border-border my-3" /> {/* Use theme var */}
              {userNavLinks.map((l) => ( // Will include "My Account"
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

          <hr className="border-border my-3" /> {/* Use theme var */}

          {user ? (
            <>
              {/* MODIFIED: Using .btn .btn-primary and full width for mobile */}
              <Link
                href="/listings/new"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn("btn btn-primary w-full flex items-center justify-center mb-2")} // Added mb-2 for spacing
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
                Create New Listing
              </Link>
              {/* MODIFIED: Using .btn .btn-destructive and full width for mobile */}
              <button
                onClick={handleLogout}
                className={cn("btn btn-destructive w-full text-left justify-start")} // text-left and justify-start to mimic original if desired
              >
                Logout
              </button>
            </>
          ) : (
            // MODIFIED: Using .btn .btn-primary and full width for mobile
            <Link
              href="/auth"
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn("btn btn-primary w-full flex items-center justify-center")}
            >
              Login / Sign Up
            </Link>
          )}
        </nav>
      </div>
    </>
  );
}