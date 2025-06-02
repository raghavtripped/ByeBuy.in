// src/components/Navbar.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';
import { useNotifications } from '@/hooks/useNotifications'; // Add this import

// Import icons
import { 
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  Bars3Icon,
  XMarkIcon,
  PlusIcon,
  ListBulletIcon,
  CurrencyDollarIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  ArchiveBoxIcon,
  FireIcon,
  ChevronDownIcon,
  HeartIcon
} from '@heroicons/react/24/outline';

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
  /* ── State & Hooks ─────────────────────────────── */
  const router = useRouter();
  const pathname = usePathname();
  const prevPathname = usePrevious(pathname); // Re-added prevPathname declaration
  const searchParams = useSearchParams();
  const pageSearchTerm = searchParams.get('search') || '';
  const { showNotification } = useNotifications(); // Add notifications hook

  const [user, setUser] = useState<User | null>(null);
  const prevUser = usePrevious(user);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(pageSearchTerm);
  const [searchFocused, setSearchFocused] = useState(false);

  /* ── Refs ───────────────────────────── */
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);

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

  /* ── Close menus on user change ─────── */
  useEffect(() => {
    if (prevUser && !user) {
      setIsMobileMenuOpen(false);
      setIsUserMenuOpen(false);
    }
  }, [user, prevUser]);

  /* ── Close menu on route change ─────── */
  useEffect(() => {
    if (prevPathname !== undefined && pathname !== prevPathname) {
      setIsMobileMenuOpen(false);
      setIsUserMenuOpen(false);
    }
  }, [pathname, prevPathname]);

  /* ── Close menus on outside click ──── */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node) &&
        !userButtonRef.current?.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* ── Keyboard navigation ──────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
          menuButtonRef.current?.focus();
        }
        if (isUserMenuOpen) {
          setIsUserMenuOpen(false);
          userButtonRef.current?.focus();
        }
      }
      // Cmd/Ctrl + K for search focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isMobileMenuOpen, isUserMenuOpen]);

  /* ── Handlers ───────────────────────── */
  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(prev => !prev);
    setIsUserMenuOpen(false);
  }, []);

  const toggleUserMenu = useCallback(() => {
    setIsUserMenuOpen(prev => !prev);
    setIsMobileMenuOpen(false);
  }, []);

  const handleLogout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      router.push('/');
      setIsUserMenuOpen(false);
    } else {
      showNotification({ 
        message: `Logout failed: ${error.message}`, 
        type: 'error' 
      });
    }
  }, [router, showNotification]); // Add showNotification to deps

  /* ── Sync search term with URL ──────────────────── */
  useEffect(() => {
    if (pathname === '/listings') {
      setSearchTerm(pageSearchTerm);
    }
  }, [pageSearchTerm, pathname]);

  /* ── Search Handler ────────────────────────────── */
  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTerm = searchTerm.trim();
    
    // Navigate to listings with search param if term exists
    router.push(`/listings${trimmedTerm ? `?search=${encodeURIComponent(trimmedTerm)}` : ''}`);
    
    // Reset focus and close mobile menu if open
    searchRef.current?.blur();
    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
  }, [searchTerm, router, isMobileMenuOpen]);

  const handleSearchFocus = () => setSearchFocused(true);
  const handleSearchBlur = () => setSearchFocused(false);

  /* ── Navigation Links ─────────────── */
  const mainNavLinks = [
    { href: '/', text: 'Live Auctions', icon: FireIcon },
    { href: '/listings/archive', text: 'Archive', icon: ArchiveBoxIcon },
    { href: '/help', text: 'Help', icon: QuestionMarkCircleIcon },
  ];

  const userNavLinks = [
    { href: '/profile', text: 'My Profile', icon: UserCircleIcon },
    { href: '/my-watchlist', text: 'My Watchlist', icon: HeartIcon },
    { href: '/my-listings', text: 'My Listings', icon: ListBulletIcon },
    { href: '/my-bids', text: 'My Bids', icon: CurrencyDollarIcon },
    { href: '/account/settings', text: 'Account Settings', icon: Cog6ToothIcon },
  ];

  /* ── Styles ────────────────────────── */
  const navLinkClasses = (href: string, isActive: boolean = pathname === href) =>
    `group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
      isActive
        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
        : 'text-gray-300 dark:text-bye-dark-text-secondary hover:text-white dark:hover:text-bye-dark-text-primary hover:bg-white/10 dark:hover:bg-white/5 hover:shadow-md'
    }`;

  const mobileNavLinkClasses = (href: string, isActive: boolean = pathname === href) =>
    `group flex items-center px-4 py-3 text-base font-medium rounded-xl transition-all duration-200 ${
      isActive
        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
        : 'text-gray-700 dark:text-bye-dark-text-primary hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover hover:text-gray-900 dark:hover:text-bye-dark-text-primary'
    }`;

  const userMenuLinkClasses = (href: string, isActive: boolean = pathname === href) =>
    `group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
      isActive
        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
        : 'text-gray-700 dark:text-bye-dark-text-primary hover:bg-gray-50 dark:hover:bg-bye-dark-bg-hover hover:text-gray-900 dark:hover:text-bye-dark-text-primary'
    }`;

  /* ── Loading State ─────────────────── */
  if (loading) {
    return (
      <nav className="bg-gray-900/95 dark:bg-bye-dark-bg-primary backdrop-blur-xl border-b border-gray-800 dark:border-bye-dark-border-primary sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="h-8 w-8 bg-gray-700 dark:bg-bye-dark-bg-secondary rounded-full animate-pulse" />
              <div className="h-6 w-20 bg-gray-700 dark:bg-bye-dark-bg-secondary rounded animate-pulse hidden sm:block" />
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <div className="h-10 w-80 bg-gray-700 dark:bg-bye-dark-bg-secondary rounded-lg animate-pulse" />
              <div className="flex space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-8 w-20 bg-gray-700 dark:bg-bye-dark-bg-secondary rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
            <div className="h-8 w-8 bg-gray-700 dark:bg-bye-dark-bg-secondary rounded-full animate-pulse" />
          </div>
        </div>
      </nav>
    );
  }

  /* ── Main Component ─────────────────── */
  return (
    <>
      <nav className="bg-gray-900/95 dark:bg-bye-dark-bg-primary backdrop-blur-xl border-b border-gray-800 dark:border-bye-dark-border-primary sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo Section */}
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center space-x-3 group">
                <div className="relative">
                  <Image
                    src="/bidly-logo.svg"
                    alt="ByeBuy logo"
                    width={32}
                    height={32}
                    priority
                    className="h-8 w-8 transition-transform duration-200 group-hover:scale-110"
                  />
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full blur opacity-0 group-hover:opacity-20 transition-opacity duration-200" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent hidden md:block">
                  ByeBuy
                </span>
              </Link>
            </div>

            {/* Center brand (mobile only) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
              <Link href="/" className="text-lg font-semibold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                ByeBuy
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6 flex-1 justify-center max-w-2xl">
              {/* Enhanced Search Bar */}
              <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
                <div className={`relative transition-all duration-300 ${
                  searchFocused ? 'transform scale-105' : ''
                }`}>
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-bye-dark-text-secondary" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search auctions... (⌘K)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={handleSearchFocus}
                    onBlur={handleSearchBlur}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-800/80 dark:bg-bye-dark-bg-secondary border border-gray-700 dark:border-bye-dark-border-primary rounded-xl text-white dark:text-bye-dark-text-primary placeholder-gray-400 dark:placeholder-bye-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all duration-200 hover:bg-gray-800 dark:hover:bg-bye-dark-bg-hover"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl transition-opacity duration-200 pointer-events-none ${
                    searchFocused ? 'opacity-100' : 'opacity-0'
                  }`} />
                </div>
              </form>

              {/* Navigation Links */}
              <div className="flex items-center space-x-2">
                {mainNavLinks.map(link => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={navLinkClasses(link.href)}
                    >
                      <Icon className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                      {link.text}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center space-x-3">
              {user ? (
                <>
                  {/* Create Listing Button */}
                  <Link
                    href="/listings/new"
                    className="hidden md:flex items-center px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 transform hover:scale-105"
                  >
                    <PlusIcon className="w-4 h-4 mr-2" />
                    List Item
                  </Link>

                  {/* Notifications Link - MODIFIED */}
                  <Link
                    href="/notifications" // Link to notifications page
                    className="hidden md:block p-2 text-gray-400 dark:text-bye-dark-text-secondary hover:text-white dark:hover:text-bye-dark-text-primary hover:bg-gray-800 dark:hover:bg-bye-dark-bg-hover rounded-lg transition-all duration-200 relative"
                    aria-label="Notifications"
                  >
                    <BellIcon className="w-6 h-6" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  </Link>

                  {/* User Menu - Desktop Only */}
                  <div className="relative hidden md:block" ref={userMenuRef}>
                    <button
                      ref={userButtonRef}
                      onClick={toggleUserMenu}
                      className="flex items-center space-x-2 p-2 text-gray-300 dark:text-bye-dark-text-secondary hover:text-white dark:hover:text-bye-dark-text-primary hover:bg-gray-800 dark:hover:bg-bye-dark-bg-hover rounded-lg transition-all duration-200"
                    >
                      <UserCircleIcon className="w-8 h-8" />
                      <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${
                        isUserMenuOpen ? 'rotate-180' : ''
                      }`} />
                    </button>

                    {/* User Dropdown */}
                    {isUserMenuOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-bye-dark-bg-secondary rounded-xl shadow-xl border border-gray-200 dark:border-bye-dark-border-primary py-2 transform transition-all duration-200 origin-top-right">
                        {/* User Email and Signed In Status */}
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-bye-dark-border-primary">
                          <p className="text-sm font-medium text-gray-900 dark:text-bye-dark-text-primary">
                            {user.email}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">
                            Signed in
                          </p>
                        </div>
                        <div className="py-2">
                          {/* NEW: My Profile Link */}
                          <Link
                            href="/profile"
                            className={userMenuLinkClasses('/profile')} // Use existing class helper
                            onClick={() => setIsUserMenuOpen(false)}
                          >
                            <UserCircleIcon className="w-4 h-4 mr-3" /> {/* Icon for My Profile */}
                            My Profile
                          </Link>
                          {userNavLinks.map(link => {
                            const Icon = link.icon;
                            return (
                              <Link
                                key={link.href}
                                href={link.href}
                                className={userMenuLinkClasses(link.href)}
                                onClick={() => setIsUserMenuOpen(false)}
                              >
                                <Icon className="w-4 h-4 mr-3" />
                                {link.text}
                              </Link>
                            );
                          })}
                          <hr className="my-2 border-gray-200 dark:border-bye-dark-border-primary" />
                          <button
                            onClick={handleLogout}
                            className="w-full flex items-center px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Sign Out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <Link
                  href="/auth"
                  className="hidden md:flex items-center px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 transform hover:scale-105"
                >
                  Sign In
                </Link>
              )}

              {/* Mobile Menu Button */}
              <button
                ref={menuButtonRef}
                onClick={toggleMobileMenu}
                className="md:hidden p-2 text-gray-400 dark:text-bye-dark-text-secondary hover:text-white dark:hover:text-bye-dark-text-primary hover:bg-gray-800 dark:hover:bg-bye-dark-bg-hover rounded-lg transition-all duration-200"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <XMarkIcon className="w-6 h-6" />
                ) : (
                  <Bars3Icon className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu Panel */}
      <div
        ref={mobileMenuRef}
        className={`fixed top-0 right-0 h-full w-80 bg-white dark:bg-bye-dark-bg-secondary shadow-2xl transform transition-transform duration-300 ease-out z-50 md:hidden border-l border-gray-200 dark:border-bye-dark-border-primary ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Mobile Menu Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-bye-dark-border-primary">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary">Menu</h2>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 text-gray-500 dark:text-bye-dark-text-secondary hover:text-gray-700 dark:hover:text-bye-dark-text-primary hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover rounded-lg transition-all duration-200"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Mobile Search */}
          <div className="p-6 border-b border-gray-200 dark:border-bye-dark-border-primary">
            <form onSubmit={handleSearchSubmit} className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-bye-dark-text-secondary" />
              <input
                type="text"
                placeholder="Search auctions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-bye-dark-bg-hover border border-gray-300 dark:border-bye-dark-border-primary rounded-xl text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-500 dark:placeholder-bye-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent"
              />
            </form>
          </div>

          {/* Mobile Navigation Links */}
          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {/* Main Links */}
            {mainNavLinks.map(link => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={mobileNavLinkClasses(link.href)}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {link.text}
                </Link>
              );
            })}

            {/* User Links (if logged in) */}
            {user && (
              <>
                <div className="pt-4">
                  <h3 className="px-4 text-xs font-semibold text-gray-500 dark:text-bye-dark-text-secondary uppercase tracking-wider mb-3">
                    My Account
                  </h3>
                  {/* NEW: My Profile Link in Mobile Menu */}
                  <Link
                    href="/profile"
                    className={mobileNavLinkClasses('/profile')}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <UserCircleIcon className="w-5 h-5 mr-3" />
                    My Profile
                  </Link>
                  {userNavLinks.map(link => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={mobileNavLinkClasses(link.href)}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <Icon className="w-5 h-5 mr-3" />
                        {link.text}
                      </Link>
                    );
                  })}
                </div>

                {/* Create Listing Button */}
                <Link
                  href="/listings/new"
                  className="flex items-center justify-center px-4 py-3 mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium transition-all duration-200 hover:shadow-lg"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <PlusIcon className="w-5 h-5 mr-2" />
                  List New Item
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Footer */}
          <div className="p-6 border-t border-gray-200 dark:border-bye-dark-border-primary">
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-bye-dark-bg-hover rounded-xl">
                  <UserCircleIcon className="w-8 h-8 text-gray-400 dark:text-bye-dark-text-secondary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-bye-dark-text-primary truncate">
                      {user.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">
                      Signed in
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-medium transition-all duration-200"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/auth"
                className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium transition-all duration-200 hover:shadow-lg"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}