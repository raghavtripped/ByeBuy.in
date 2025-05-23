// src/components/Navbar.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';

/* ---------- Helpers ------------------------------------------------------ */
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/* ---------- Component ---------------------------------------------------- */
export default function Navbar() {
  /* ── State ─────────────────────────────────── */
  const [user, setUser] = useState<User | null>(null);
  const prevUser = usePrevious(user);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  /* ── Router / Location ──────────────── */
  const router = useRouter();
  const pathname = usePathname();
  const prevPathname = usePrevious(pathname);

  /* ── Refs ───────────────────────────── */
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /* ── Initial session fetch ──────────── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => authListener?.subscription.unsubscribe();
  }, []);

  /* ── Close mobile menu on logout ────── */
  useEffect(() => {
    if (prevUser && !user && isMobileMenuOpen) setIsMobileMenuOpen(false);
  }, [user, prevUser, isMobileMenuOpen]);

  /* ── Close menu on route change ─────── */
  useEffect(() => {
    if (prevPathname !== undefined && pathname !== prevPathname && isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  }, [pathname, prevPathname, isMobileMenuOpen]);

  /* ── Esc to close menu ──────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isMobileMenuOpen]);

  /* ── Handlers ───────────────────────── */
  const toggleMobileMenu = useCallback(
    () => setIsMobileMenuOpen(prev => !prev),
    []
  );

  const handleLogout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) router.push('/');
    else alert(`Logout failed: ${error.message}`);
  }, [router]);

  /* ── Links ──────────────────────────── */
  const commonNavLinks = [
    { href: '/', text: 'Active Auctions' },
    { href: '/listings/archive', text: 'Auction Archive' },
  ];

  const userNavLinks = user
    ? [
        { href: '/my-watchlist', text: 'My Watchlist' },
        { href: '/my-listings', text: 'My Listings' },
        { href: '/my-bids', text: 'My Bids' },
        { href: '/account/settings', text: 'My Account' },
      ]
    : [];

  /* ── Class helpers ──────────────────── */
  // Updated for new dark mode text colors
  const navLinkClasses = (href: string) =>
    `transition-colors duration-150 ease-in-out text-sm rounded-md px-3 py-2 font-medium ${
      pathname === href
        ? 'bg-black/20 dark:bg-white/10 text-white dark:text-bye-dark-text-primary' // Active state slightly different for dark
        : 'text-gray-300 dark:text-bye-dark-text-secondary hover:bg-black/10 dark:hover:bg-white/5 hover:text-white dark:hover:text-bye-dark-text-primary'
    }`;

  // Updated for new dark mode text colors and panel background
  const mobileNavLinkClasses = (href: string) =>
    `block px-4 py-3 text-base font-medium rounded-md transition-colors ${
      pathname === href
        ? 'bg-indigo-500 text-white' // Active link in mobile menu often uses accent
        : 'text-bye-dark-text-secondary hover:bg-bye-dark-bg-hover hover:text-bye-dark-text-primary' // Using new dark vars
    }`;

  /* ── Loading skeleton ───────────────── */
  if (loading) {
    return (
      // Updated skeleton background to match new dark theme
      <nav className="bg-gray-200 dark:bg-bye-dark-bg-primary h-14 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between relative">
          <div className="flex items-center space-x-4">
            {/* Updated skeleton elements to use a color that contrasts with bye-dark-bg-primary */}
            <div className="h-8 w-8 bg-gray-300 dark:bg-bye-dark-bg-secondary rounded-full animate-pulse" />
            <div className="h-6 w-20 bg-gray-300 dark:bg-bye-dark-bg-secondary rounded animate-pulse hidden sm:block" />
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
            <div className="h-6 w-16 bg-gray-300 dark:bg-bye-dark-bg-secondary rounded animate-pulse"></div>
          </div>
          <div className="hidden md:flex space-x-4 animate-pulse">
            <div className="h-6 bg-gray-300 dark:bg-bye-dark-bg-secondary w-24 rounded" />
            <div className="h-6 bg-gray-300 dark:bg-bye-dark-bg-secondary w-28 rounded" />
          </div>
          <div className="md:hidden h-7 w-7 bg-gray-300 dark:bg-bye-dark-bg-secondary rounded animate-pulse" />
        </div>
      </nav>
    );
  }

  /* ── JSX ────────────────────────────── */
  return (
    <>
      {/* ---------- Top bar ---------- */}
      {/* Updated Navbar background and default text for dark mode */}
      <nav className="bg-gray-800 dark:bg-bye-dark-bg-primary text-white dark:text-bye-dark-text-primary shadow-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between relative">
          {/* Brand (Logo and Text for Desktop, Logo only for Mobile on left) */}
          <Link href="/" className="flex items-center space-x-2 group flex-shrink-0">
            <Image
              src="/bidly-logo.svg" // Assuming this SVG is neutral or adapts well
              alt="ByeBuy logo"
              width={32}
              height={32}
              priority
              className="h-8 w-auto group-hover:opacity-90 transition-opacity"
            />
            {/* Desktop brand text - ensure hover color works with new dark bg */}
            <span className="text-lg font-semibold hidden md:inline text-white dark:text-bye-dark-text-primary group-hover:text-indigo-300 dark:group-hover:text-indigo-400 transition-colors">
              ByeBuy
            </span>
          </Link>

          {/* Center brand (mobile only) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
            {/* Ensure hover color works with new dark bg */}
            <Link href="/" className="text-lg font-semibold text-white dark:text-bye-dark-text-primary hover:text-indigo-300 dark:hover:text-indigo-400 transition-colors">
              ByeBuy
            </Link>
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center space-x-1 flex-grow justify-start ml-4">
            {commonNavLinks.map(l => (
              <Link key={l.text} href={l.href} className={navLinkClasses(l.href)}>
                {l.text}
              </Link>
            ))}
            {user &&
              userNavLinks.map(l => (
                <Link key={l.text} href={l.href} className={navLinkClasses(l.href)}>
                  {l.text}
                </Link>
              ))}
          </div>

          {/* Right-side actions (Desktop buttons and Mobile Hamburger) */}
          <div className="flex items-center flex-shrink-0">
            {/* Desktop buttons */}
            <div className="hidden md:flex items-center space-x-2">
              {user ? (
                <>
                  {/* Ensure Indigo button contrasts well with bye-dark-bg-primary */}
                  <Link
                    href="/listings/new"
                    className="flex items-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-md text-sm font-medium text-white dark:text-gray-100 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-1.5">
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                    </svg>
                    List Item
                  </Link>
                  {/* Ensure Red button contrasts well */}
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded-md text-sm font-medium text-white dark:text-gray-100 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-md text-sm font-medium text-white dark:text-gray-100 transition-colors"
                >
                  Login / Sign Up
                </Link>
              )}
            </div>

            {/* Hamburger (mobile only) */}
            <div className="md:hidden">
              {/* Hamburger icon color and hover/focus states for new dark bg */}
              <button
                ref={buttonRef}
                onClick={toggleMobileMenu}
                aria-label="Toggle menu"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-menu-panel"
                className="inline-flex items-center justify-center p-2 rounded-md text-bye-dark-text-secondary hover:text-bye-dark-text-primary hover:bg-bye-dark-bg-hover focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white dark:focus:ring-indigo-500"
              >
                {isMobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ---------- Mobile overlay ---------- */}
      {isMobileMenuOpen && (
        // Overlay can remain similar, backdrop-blur helps
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ---------- Mobile panel ---------- */}
      <div
        id="mobile-menu-panel"
        ref={menuRef}
        // Updated panel background and border
        className={`fixed top-0 right-0 h-full w-64 sm:w-72 bg-white dark:bg-bye-dark-bg-secondary shadow-xl p-5 transform transition-transform duration-300 ease-in-out z-50 md:hidden border-l border-transparent dark:border-bye-dark-border-primary ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Panel header text and close button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-bye-dark-text-primary">Menu</h2>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1 text-gray-500 dark:text-bye-dark-text-secondary hover:text-gray-700 dark:hover:text-bye-dark-text-primary rounded-md hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover"
            aria-label="Close menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="space-y-2">
          {commonNavLinks.map(l => (
            <Link
              key={`mobile-${l.text}`}
              href={l.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={mobileNavLinkClasses(l.href)} // mobileNavLinkClasses updated for new dark vars
            >
              {l.text}
            </Link>
          ))}

          {/* Divider color */}
          <hr className="border-gray-200 dark:border-bye-dark-border-primary my-3" />

          {user ? (
            // Logout button in mobile panel
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-3 text-base font-medium rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            >
              Logout
            </button>
          ) : (
            // Login/Signup button in mobile panel
            <Link
              href="/auth"
              onClick={() => setIsMobileMenuOpen(false)}
              // Ensure Indigo button contrasts well with bye-dark-bg-secondary
              className={`${mobileNavLinkClasses( // mobileNavLinkClasses already handles non-active state
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