
/* -------------------------------------------------------------------------- */
/*  src/components/Navbar.tsx                                                 */
/* -------------------------------------------------------------------------- */
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
  const [user, setUser]         = useState<User | null>(null);
  const prevUser                = usePrevious(user);
  const [loading, setLoading]   = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  /* ── Router / Location ──────────────── */
  const router       = useRouter();
  const pathname     = usePathname();
  const prevPathname = usePrevious(pathname);

  /* ── Refs ───────────────────────────── */
  const menuRef   = useRef<HTMLDivElement>(null);
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
  const navLinkClasses = (href: string) =>
    `transition-colors duration-150 ease-in-out text-sm rounded-md px-3 py-2 font-medium ${
      pathname === href
        ? 'bg-gray-900 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;

  const mobileNavLinkClasses = (href: string) =>
    `block px-4 py-3 text-base font-medium rounded-md transition-colors ${
      pathname === href
        ? 'bg-indigo-500 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;

  /* ── Loading skeleton ───────────────── */
  if (loading) {
    return (
      <nav className="bg-gray-800 h-14 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex space-x-4">
            <div className="h-8 w-8 bg-gray-700 rounded-full animate-pulse" />
            <div className="h-6 w-20 bg-gray-700 rounded animate-pulse hidden sm:block" />
          </div>
          <div className="md:hidden h-7 w-7 bg-gray-700 rounded animate-pulse" />
        </div>
      </nav>
    );
  }

  /* ── JSX ────────────────────────────── */
  return (
    <>
      {/* ---------- Top bar ---------- */}
      <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between relative">
          {/* Brand */}
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

          {/* Desktop buttons */}
          <div className="hidden md:flex items-center space-x-2">
            {user ? (
              <>
                <Link
                  href="/listings/new"
                  className="flex items-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-medium transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-1.5">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                  </svg>
                  List Item
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-md text-sm font-medium transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/auth"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-medium transition-colors"
              >
                Login / Sign Up
              </Link>
            )}
          </div>

          {/* Hamburger (mobile only) */}
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
      </nav>

      {/* ---------- Mobile overlay ---------- */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ---------- Mobile panel ---------- */}
      <div
        id="mobile-menu-panel"
        ref={menuRef}
        className={`fixed top-0 right-0 h-full w-64 sm:w-72 bg-gray-800 shadow-xl p-5 transform transition-transform duration-300 ease-in-out z-50 md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-white">Menu</h2>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1 text-gray-300 hover:text-white rounded-md hover:bg-gray-700"
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
              className={mobileNavLinkClasses(l.href)}
            >
              {l.text}
            </Link>
          ))}

          <hr className="border-gray-700 my-3" />

          {user ? (
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-3 text-base font-medium rounded-md text-red-300 hover:bg-red-700 hover:text-white transition-colors"
            >
              Logout
            </button>
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

