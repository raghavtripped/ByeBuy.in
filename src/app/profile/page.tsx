// src/app/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';

import {
  FiList,
  FiSettings,
  FiHelpCircle,
  FiLogOut,
  FiUser,
} from 'react-icons/fi';
import { FaUserCircle } from 'react-icons/fa';

interface ProfileLinkItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  isExternal?: boolean;
}

const ProfileLinkItem: React.FC<ProfileLinkItemProps> = ({
  href,
  icon: Icon,
  label,
  isExternal,
}) => (
  <Link
    href={href}
    target={isExternal ? '_blank' : undefined}
    rel={isExternal ? 'noopener noreferrer' : undefined}
    className="flex items-center p-4 bg-white dark:bg-bye-dark-bg-secondary hover:bg-slate-50 dark:hover:bg-bye-dark-bg-hover rounded-lg shadow-sm transition-colors duration-150 group"
  >
    <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-4 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors" />
    <span className="text-sm font-medium text-slate-700 dark:text-bye-dark-text-primary group-hover:text-slate-900 dark:group-hover:text-bye-dark-text-primary">
      {label}
    </span>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5 ml-auto text-slate-400 dark:text-bye-dark-text-secondary group-hover:text-slate-500 dark:group-hover:text-bye-dark-text-secondary transition-colors"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  </Link>
);

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  /* ------------------------------------------------------------------ */
  /*  Auth                                                              */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error) console.error('Session error:', error.message);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (_event === 'SIGNED_OUT') router.replace('/auth');
      }
    );

    return () => authListener?.subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) alert(`Logout failed: ${error.message}`);
    setLoading(false);
  };

  /* ------------------------------------------------------------------ */
  /*  Render guards                                                     */
  /* ------------------------------------------------------------------ */
  if (loading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-bye-dark-bg-primary p-4">
        <LoadingSpinner message="Loading profile" />
      </div>
    );

  if (!user)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-bye-dark-bg-primary p-4 text-center">
        <FiUser className="w-16 h-16 text-slate-400 dark:text-bye-dark-text-secondary/75 mb-4" />
        <p className="text-slate-700 dark:text-bye-dark-text-primary mb-2">
          Please log in to view your profile.
        </p>
        <Link
          href="/auth"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-bye-dark-bg-primary"
        >
          Login
        </Link>
      </div>
    );

  /* ------------------------------------------------------------------ */
  /*  Avatar                                                            */
  /* ------------------------------------------------------------------ */
  const UserAvatar = () => (
    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-indigo-100 dark:bg-indigo-500/30 rounded-full flex items-center justify-center mb-3 sm:mb-4 ring-4 ring-white dark:ring-bye-dark-bg-secondary shadow-md">
      <FaUserCircle className="w-16 h-16 sm:w-20 sm:h-20 text-indigo-500 dark:text-indigo-300" />
    </div>
  );

  /* ------------------------------------------------------------------ */
  /*  Page                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-bye-dark-bg-primary pb-20 md:pb-8">
      {/* mobile header */}
      <header className="bg-white dark:bg-bye-dark-bg-secondary shadow-sm sticky top-0 z-30 md:hidden">
        <div className="max-w-md mx-auto px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-bye-dark-text-primary text-center">
            My Profile
          </h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-center mb-6 sm:mb-8 pt-4 md:pt-0">
          <UserAvatar />
          {user.email && (
            <p className="text-sm text-slate-600 dark:text-bye-dark-text-secondary break-all text-center">
              {user.email}
            </p>
          )}
        </div>

        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-bye-dark-text-secondary/80 uppercase tracking-wider px-1 mb-2">
            My Activity
          </h2>
          <ProfileLinkItem
            href="/my-listings"
            icon={FiList}
            label="My Listings"
          />

          <h2 className="text-xs font-semibold text-slate-500 dark:text-bye-dark-text-secondary/80 uppercase tracking-wider px-1 pt-4 mb-2">
            Account &amp; Support
          </h2>
          <ProfileLinkItem
            href="/account/settings"
            icon={FiSettings}
            label="Account Settings"
          />
          <ProfileLinkItem
            href="/help"
            icon={FiHelpCircle}
            label="Help Center"
          />

          <div className="pt-6">
            <button
              onClick={handleLogout}
              disabled={loading}
              className="w-full flex items-center justify-center p-3 bg-red-50 hover:bg-red-100 dark:bg-red-900/25 dark:hover:bg-red-900/35 rounded-lg shadow-sm transition-colors duration-150 group disabled:opacity-50"
            >
              <FiLogOut className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors" />
              <span className="text-sm font-medium text-red-700 dark:text-red-300 group-hover:text-red-800 dark:group-hover:text-red-200">
                {loading ? 'Logging out…' : 'Logout'}
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
