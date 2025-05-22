// src/app/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, User } from '@/lib/supabaseClient'; // Assuming User type is exported
import LoadingSpinner from '@/components/LoadingSpinner';

// Icons for list items
import { FiList, FiSettings, FiHelpCircle, FiLogOut, FiUser } from 'react-icons/fi'; // General purpose icons
import { FaUserCircle } from 'react-icons/fa'; // Larger profile icon

interface ProfileLinkItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  isExternal?: boolean;
}

const ProfileLinkItem: React.FC<ProfileLinkItemProps> = ({ href, icon: Icon, label, isExternal }) => (
  <Link
    href={href}
    target={isExternal ? '_blank' : undefined}
    rel={isExternal ? 'noopener noreferrer' : undefined}
    className="flex items-center p-4 bg-white dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-600/50 rounded-lg shadow-sm transition-colors duration-150 group"
  >
    <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-4 group-hover:text-indigo-700 dark:group-hover:text-indigo-500 transition-colors" />
    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-slate-50">
      {label}
    </span>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 ml-auto text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors">
      <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
  </Link>
);

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error fetching session:', error.message);
      }
      setUser(session?.user ?? null);
      setLoading(false);
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (_event === 'SIGNED_OUT') {
        router.replace('/auth'); // Redirect to auth page on sign out
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
      // Optionally show an error to the user
      alert(`Logout failed: ${error.message}`);
    }
    // The onAuthStateChange listener should handle the redirect.
    // setUser(null); // Redundant due to onAuthStateChange
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <LoadingSpinner message="Loading profile..." />
      </div>
    );
  }

  if (!user) {
    // This case should ideally be handled by redirecting to login if a page requires auth
    // For now, showing a message or redirecting.
    // router.replace('/auth'); // Or show a message
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 text-center">
        <FiUser className="w-16 h-16 text-slate-400 dark:text-slate-500 mb-4" />
        <p className="text-slate-700 dark:text-slate-300 mb-2">Please log in to view your profile.</p>
        <Link href="/auth" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
          Login
        </Link>
      </div>
    );
  }

  // Placeholder for user avatar - replace with actual avatar logic if available
  const UserAvatar = () => (
    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-indigo-100 dark:bg-indigo-700 rounded-full flex items-center justify-center mb-3 sm:mb-4 ring-4 ring-white dark:ring-slate-800 shadow-md">
      <FaUserCircle className="w-16 h-16 sm:w-20 sm:h-20 text-indigo-500 dark:text-indigo-300" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20 md:pb-8"> {/* Padding bottom for mobile nav */}
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-30 md:hidden"> {/* Mobile specific header */}
        <div className="max-w-md mx-auto px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100 text-center">My Profile</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-center mb-6 sm:mb-8 pt-4 md:pt-0">
          <UserAvatar />
          {user.email && (
            <p className="text-sm text-slate-600 dark:text-slate-300 break-all text-center">
              {user.email}
            </p>
          )}
          {/* You can add user's name or other details here if available in your 'profiles' table */}
        </div>

        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 mb-2">
            My Activity
          </h2>
          <ProfileLinkItem href="/my-listings" icon={FiList} label="My Listings" />
          {/* My Bids and My Watchlist are directly in bottom nav, but can be duplicated here if desired for consistency */}
          {/* <ProfileLinkItem href="/my-bids" icon={FiAward} label="My Bids" /> */}
          {/* <ProfileLinkItem href="/my-watchlist" icon={FiHeart} label="My Watchlist" /> */}


          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 pt-4 mb-2">
            Account & Support
          </h2>
          <ProfileLinkItem href="/account/settings" icon={FiSettings} label="Account Settings" />
          <ProfileLinkItem href="/help" icon={FiHelpCircle} label="Help Center" /> {/* Replace /help with actual link */}

          <div className="pt-6">
            <button
              onClick={handleLogout}
              disabled={loading}
              className="w-full flex items-center justify-center p-3 bg-red-50 hover:bg-red-100 dark:bg-red-800/30 dark:hover:bg-red-700/50 rounded-lg shadow-sm transition-colors duration-150 group disabled:opacity-50"
            >
              <FiLogOut className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 group-hover:text-red-700 dark:group-hover:text-red-500 transition-colors" />
              <span className="text-sm font-medium text-red-700 dark:text-red-300 group-hover:text-red-800 dark:group-hover:text-red-200">
                {loading ? 'Logging out...' : 'Logout'}
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}