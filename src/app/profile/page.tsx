'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';

import LoadingSpinner from '@/components/LoadingSpinner';
import UserAvatar from '@/components/UserAvatar';

import {
  FiList,
  FiSettings,
  FiHelpCircle,
  FiLogOut,
  FiUser
} from 'react-icons/fi';

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
  isExternal
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
  const router = useRouter();

  /* ─────────────────────────────── state ────────────────────────────── */
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ✨  profile table data
  const [profileData, setProfileData] = useState<{
    full_name: string | null;
    avatar_url: string | null;
    hostel: string | null;
    batch: string | null;
    bio: string | null;
  } | null>(null);

  // ✨  quick stats
  const [activeListingsCount, setActiveListingsCount] = useState(0);
  const [itemsSoldCount, setItemsSoldCount] = useState(0);

  /* ─────────────────────── fetch auth + profile info ────────────────── */
  useEffect(() => {
    const fetchEverything = async () => {
      setLoading(true);

      const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
      const session = sessionRes?.session;
      if (sessionErr || !session?.user) {
        router.replace('/auth?redirect=/profile');
        setLoading(false);
        return;
      }
      const user = session.user;
      setAuthUser(user);

      /* 1️⃣  profile row ------------------------------------------------ */
      const { data: profileRes, error: profileErr } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, hostel, batch, bio')
        .eq('id', user.id)
        .single();

      if (profileErr && profileErr.code !== 'PGRST116') { // 116 = no rows found
        console.error('Profile fetch error:', profileErr.message);
      } else {
        setProfileData(profileRes ?? null);
      }

      /* 2️⃣  stats ------------------------------------------------------ */
      try {
        const todayIso = new Date().toISOString();

        // active listings still running
        const { count: activeCnt } = await supabase
          .from('listings')
          .select('id', { head: true, count: 'exact' })
          .eq('seller_id', user.id)
          .eq('status', 'active')
          .gt('end_time', todayIso);
        setActiveListingsCount(activeCnt ?? 0);

        // items sold (closed with winner)
        const { count: soldCnt } = await supabase
          .from('listings')
          .select('id', { head: true, count: 'exact' })
          .eq('seller_id', user.id)
          .eq('status', 'closed')
          .not('winning_bidder_id', 'is', null);
        setItemsSoldCount(soldCnt ?? 0);
      } catch (statsErr) {
        console.error('Stats fetch error:', statsErr);
      }

      setLoading(false);
    };

    fetchEverything();

    const { data: listener } = supabase.auth.onAuthStateChange((_evt, ses) => {
      if (_evt === 'SIGNED_OUT') router.replace('/auth');
      setAuthUser(ses?.user ?? null);
    });

    return () => listener?.subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) alert(`Logout failed: ${error.message}`);
    setLoading(false);
  };

  /* ───────────────────────── render guards ──────────────────────────── */
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-bye-dark-bg-primary p-4">
        <LoadingSpinner message="Loading profile" />
      </div>
    );

  if (!authUser)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-bye-dark-bg-primary p-4 text-center">
        <FiUser className="w-16 h-16 text-slate-400 dark:text-bye-dark-text-secondary/75 mb-4" />
        <p className="text-slate-700 dark:text-bye-dark-text-primary mb-3">
          Please log in to view your profile.
        </p>
        <Link
          href="/auth"
          className="inline-flex px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-bye-dark-bg-primary"
        >
          Login
        </Link>
      </div>
    );

  /* ─────────────────────────────── page ─────────────────────────────── */
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
        {/* avatar + basic info */}
        <div className="flex flex-col items-center mb-6 sm:mb-8 pt-4 md:pt-0">
          <UserAvatar
            avatarUrl={profileData?.avatar_url}
            fullName={profileData?.full_name}
          />

          {profileData?.full_name && (
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 dark:text-bye-dark-text-primary mt-2 text-center">
              {profileData.full_name}
            </h2>
          )}

          {authUser.email && (
            <p
              className={`text-sm text-slate-600 dark:text-bye-dark-text-secondary break-all text-center ${
                profileData?.full_name ? '' : 'mt-2'
              }`}
            >
              {authUser.email}
            </p>
          )}

          {(profileData?.batch || profileData?.hostel) && (
            <div className="mt-1 text-xs text-center text-slate-500 dark:text-bye-dark-text-secondary/90">
              {profileData.batch && <span>{profileData.batch}</span>}
              {profileData.batch && profileData.hostel && <span> • </span>}
              {profileData.hostel && <span>{profileData.hostel}</span>}
            </div>
          )}

          {profileData?.bio && (
            <p className="mt-3 text-sm text-center text-slate-600 dark:text-bye-dark-text-secondary max-w-md">
              {profileData.bio}
            </p>
          )}
        </div>

        {/* stats */}
        <div className="mb-6 sm:mb-8 p-4 bg-white dark:bg-bye-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-bye-dark-border-primary">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-bye-dark-text-primary mb-3 text-center uppercase tracking-wider">
            Activity Stats
          </h3>
          <div className="flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {activeListingsCount}
              </p>
              <p className="text-xs text-slate-500 dark:text-bye-dark-text-secondary">
                Active Listings
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {itemsSoldCount}
              </p>
              <p className="text-xs text-slate-500 dark:text-bye-dark-text-secondary">
                Items Sold
              </p>
            </div>
            {/* ➜ add more stats here whenever you need */}
          </div>
        </div>

        {/* links & actions */}
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-bye-dark-text-secondary/80 uppercase tracking-wider px-1 mb-2">
            My Activity
          </h2>
          <ProfileLinkItem href="/my-listings" icon={FiList} label="My Listings" />

          <h2 className="text-xs font-semibold text-slate-500 dark:text-bye-dark-text-secondary/80 uppercase tracking-wider px-1 pt-4 mb-2">
            Account &amp; Support
          </h2>
          <ProfileLinkItem href="/account/settings" icon={FiSettings} label="Account Settings" />
          <ProfileLinkItem href="/help" icon={FiHelpCircle} label="Help Center" />

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
