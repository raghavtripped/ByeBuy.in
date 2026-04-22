'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import UserAvatar from '@/components/UserAvatar';

type SellerProfile = {
  fullName: string | null;
  avatarUrl: string | null;
  hostel: string | null;
  batch: string | null;
  bio: string | null;
  activeListingsCount: number;
  itemsSoldCount: number;
};

// Icons
const EnvelopeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);

const ListingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

const SoldIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
  </svg>
);

export default function SellerProfile() {
  const { sellerId } = useParams<{ sellerId: string }>();

  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [sellerEmailForMailto, setSellerEmailForMailto] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
      setLoadingAuth(false);
    });
  }, []);

  // Fetch seller profile
  useEffect(() => {
    const fetchSellerProfile = async () => {
      if (!sellerId) return;

      setLoadingProfile(true);
      setError(null);

      try {
        // Fetch basic profile info
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, hostel, batch, bio')
          .eq('id', sellerId)
          .single();

        if (profileError) throw profileError;
        if (!profileData) throw new Error('Seller not found');

        // Fetch active listings count
        const { count: activeCount, error: activeError } = await supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', sellerId)
          .eq('status', 'active');

        if (activeError) throw activeError;

        // Fetch sold items count
        const { count: soldCount, error: soldError } = await supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', sellerId)
          .eq('status', 'closed')
          .not('winning_bidder_id', 'is', null);

        if (soldError) throw soldError;

        setSellerProfile({
          fullName: profileData.full_name,
          avatarUrl: profileData.avatar_url,
          hostel: profileData.hostel,
          batch: profileData.batch,
          bio: profileData.bio,
          activeListingsCount: activeCount || 0,
          itemsSoldCount: soldCount || 0
        });
      } catch (err) {
        console.error('Error fetching seller profile:', err);
        setError(err instanceof Error ? err.message : 'Failed to load seller profile');
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchSellerProfile();
  }, [sellerId]);

  // Fetch seller email for mailto link (only if viewer is logged in)
  useEffect(() => {
    const fetchSellerEmail = async () => {
      if (!currentUser || !sellerId) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', sellerId)
          .single();

        if (error) throw error;
        if (data?.email) setSellerEmailForMailto(data.email);
      } catch (err) {
        console.error('Error fetching seller email:', err);
        // Don't set error state here as it's not critical
      }
    };

    fetchSellerEmail();
  }, [currentUser, sellerId]);

  if (loadingProfile || loadingAuth) {
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <LoadingSpinner message="Loading seller profile..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="p-6 text-center text-red-600 dark:text-red-300 font-medium rounded-lg bg-red-50 dark:bg-red-900/20">
          {error}
        </div>
      </div>
    );
  }

  if (!sellerProfile) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="p-6 text-center text-gray-700 dark:text-bye-dark-text-secondary rounded-lg bg-gray-50 dark:bg-bye-dark-bg-hover">
          Seller profile not found
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-bye-dark-bg-primary">
      <main className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-gray-50 dark:bg-bye-dark-bg-secondary p-6 sm:p-8 rounded-xl shadow-lg border border-gray-200 dark:border-bye-dark-border-primary">
          {/* Avatar & Name Section */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="mb-4">
              <UserAvatar
                avatarUrl={sellerProfile.avatarUrl}
                fullName={sellerProfile.fullName || 'Seller'}
                size="xl"
                className="border-2 border-gray-200 dark:border-bye-dark-border-primary"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              {sellerProfile.fullName || 'Anonymous Seller'}
            </h1>
          </div>

          {/* Campus Details Section */}
          {(sellerProfile.batch || sellerProfile.hostel) && (
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-6 text-sm text-gray-600 dark:text-bye-dark-text-secondary">
              {sellerProfile.batch && (
                <div className="flex items-center">
                  <span className="font-medium">Batch:</span>
                  <span className="ml-2">{sellerProfile.batch}</span>
                </div>
              )}
              {sellerProfile.hostel && (
                <div className="flex items-center">
                  <span className="font-medium">Hostel:</span>
                  <span className="ml-2">{sellerProfile.hostel}</span>
                </div>
              )}
            </div>
          )}

          {/* Bio Section */}
          {sellerProfile.bio && (
            <div className="mb-8">
              <p className="text-gray-700 dark:text-bye-dark-text-primary whitespace-pre-wrap text-center">
                {sellerProfile.bio}
              </p>
            </div>
          )}

          {/* Stats Section */}
          <div className="flex flex-col sm:flex-row justify-center items-center gap-6 mb-8">
            <div className="flex items-center">
              <ListingsIcon />
              <span className="text-gray-600 dark:text-bye-dark-text-secondary">
                Active Listings: <span className="font-semibold text-gray-900 dark:text-bye-dark-text-primary">{sellerProfile.activeListingsCount}</span>
              </span>
            </div>
            <div className="flex items-center">
              <SoldIcon />
              <span className="text-gray-600 dark:text-bye-dark-text-secondary">
                Items Sold: <span className="font-semibold text-gray-900 dark:text-bye-dark-text-primary">{sellerProfile.itemsSoldCount}</span>
              </span>
            </div>
          </div>

          {/* Email Button */}
          {currentUser && sellerEmailForMailto && (
            <div className="flex justify-center">
              <a
                href={`mailto:${sellerEmailForMailto}?subject=Inquiry regarding ByeBuy listings&body=Hi ${encodeURIComponent(sellerProfile.fullName || 'Seller')},%0D%0A%0D%0A[Your message here]%0D%0A%0D%0AThanks!`}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-xl shadow-sm text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary transition-all duration-200"
              >
                <EnvelopeIcon />
                Email Seller
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 