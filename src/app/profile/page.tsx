/* -------------------------------------------------------------------------- */
/*  src/app/profile/page.tsx                                                  */
/* -------------------------------------------------------------------------- */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';

import LoadingSpinner from '@/components/LoadingSpinner';
import UserAvatar from '@/components/UserAvatar';

import {
  FiList,
  FiTrendingUp,
  FiSettings,
  FiHelpCircle,
  FiLogOut,
  FiUser,
  FiAlertTriangle,
} from 'react-icons/fi';

/* -------------------------------------------------------------------------- */
/*  Re-usable link row                                                        */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/*  Page component                                                            */
/* -------------------------------------------------------------------------- */
export default function ProfilePage() {
  const router = useRouter();

  /* ----------------------------- state ----------------------------------- */
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  const [profileData, setProfileData] = useState<{
    full_name: string | null;
    avatar_url: string | null;
    hostel: string | null;
    batch: string | null;
    bio: string | null;
  } | null>(null);

  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [activeListingsCount, setActiveListingsCount] = useState<number | null>(
    null
  );
  const [itemsSoldCount, setItemsSoldCount] = useState<number | null>(null);
  const [auctionsWonCount, setAuctionsWonCount] = useState<number | null>(null);

  /* ---------------------- fetch auth & profile -------------------------- */
  useEffect(() => {
    const fetchAuthAndProfile = async () => {
      const { data: sessRes, error: sessErr } =
        await supabase.auth.getSession();
      const session = sessRes?.session;

      if (sessErr || !session?.user) {
        router.replace('/auth?redirect=/profile');
        return;
      }

      const user = session.user;
      setAuthUser(user);

      const { data: pData, error: pErr } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, hostel, batch, bio') /* 👈 avatar_url */
        .eq('id', user.id)
        .single();

      if (pErr && pErr.code !== 'PGRST116') {
        console.error('Profile fetch error:', pErr.message);
      } else {
        setProfileData(pData ?? null);
      }

      setPageLoading(false);
    };

    fetchAuthAndProfile();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_evt, ses) => {
        if (_evt === 'SIGNED_OUT') router.replace('/auth');
        setAuthUser(ses?.user ?? null);
      }
    );
    return () => listener?.subscription.unsubscribe();
  }, [router]);

  /* --------------------------- fetch stats ----------------------------- */
  useEffect(() => {
    if (!authUser) return;

    const fetchStats = async () => {
      setStatsLoading(true);
      setStatsError(null);

      try {
        const todayIso = new Date().toISOString();

        const [
          { count: act },
          { count: sold },
          { count: won },
        ] = await Promise.all([
          supabase
            .from('listings')
            .select('id', { head: true, count: 'exact' })
            .eq('seller_id', authUser.id)
            .eq('status', 'active')
            .gt('end_time', todayIso),
          supabase
            .from('listings')
            .select('id', { head: true, count: 'exact' })
            .eq('seller_id', authUser.id)
            .eq('status', 'closed')
            .not('winning_bidder_id', 'is', null),
          supabase
            .from('listings')
            .select('id', { head: true, count: 'exact' })
            .eq('status', 'closed')
            .eq('winning_bidder_id', authUser.id),
        ]);

        setActiveListingsCount(act ?? 0);
        setItemsSoldCount(sold ?? 0);
        setAuctionsWonCount(won ?? 0);
      } catch (err) {
        console.error('Stats fetch error:', err);
        setStatsError('Could not load stats');
        setActiveListingsCount(0);
        setItemsSoldCount(0);
        setAuctionsWonCount(0);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [authUser]);

  /* ------------------------------ logout ------------------------------ */
  const handleLogout = async () => {
    setPageLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) alert(`Logout failed: ${error.message}`);
    setPageLoading(false);
  };

  /* --------------------------- render guards -------------------------- */
  if (pageLoading)
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

  /* ------------------------------- page ------------------------------- */
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
        {/* avatar & identity */}
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

          {statsLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner message="Loading stats" />
            </div>
          ) : (
            <>
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
                <div>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {auctionsWonCount}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-bye-dark-text-secondary">
                    Auctions Won
                  </p>
                </div>
              </div>

              {statsError && (
                <div className="mt-4 flex items-center justify-center text-xs text-red-600 dark:text-red-400">
                  <FiAlertTriangle className="w-4 h-4 mr-1" />
                  {statsError}
                </div>
              )}
            </>
          )}
        </div>

        {/* links & actions */}
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-bye-dark-text-secondary/80 uppercase tracking-wider px-1 mb-2">
            My Activity
          </h2>
          <ProfileLinkItem
            href="/my-listings"
            icon={FiList}
            label="My Listings"
          />
          <ProfileLinkItem href="/my-bids" icon={FiTrendingUp} label="My Bids" />

          <h2 className="text-xs font-semibold text-slate-500 dark:text-bye-dark-text-secondary/80 uppercase tracking-wider px-1 pt-4 mb-2">
            Account &amp; Support
          </h2>
          <ProfileLinkItem
            href="/account/settings"
            icon={FiSettings}
            label="Account Settings"
          />
          <ProfileLinkItem href="/help" icon={FiHelpCircle} label="Help Center" />

          {/* logout button */}
          <div className="pt-6">
            <button
              onClick={handleLogout}
              disabled={pageLoading}
              className="w-full flex items-center justify-center p-3 bg-red-50 hover:bg-red-100 dark:bg-red-900/25 dark:hover:bg-red-900/35 rounded-lg shadow-sm transition-colors duration-150 group disabled:opacity-50"
            >
              <FiLogOut className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors" />
              <span className="text-sm font-medium text-red-700 dark:text-red-300 group-hover:text-red-800 dark:group-hover:text-red-200">
                {pageLoading ? 'Logging out…' : 'Logout'}
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
