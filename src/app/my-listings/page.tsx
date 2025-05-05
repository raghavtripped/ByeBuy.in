'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, type User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { isPast } from '@/lib/timeUtils';

/* ---------- Types -------------------------------------------------- */
type SellerListing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  end_time: string | null;
  created_at: string;
  photos: string | null;
};
type ViewFilter = 'active' | 'past';

/* ---------- Helpers ------------------------------------------------ */
const getStoragePathFromURL = (photoUrl: string): string | null => {
  try {
    const url = new URL(photoUrl);
    const [, path] = url.pathname.split('/listing-images/');
    return path || null; // null if undefined / ''
  } catch {
    return null;
  }
};

/* ---------- Component --------------------------------------------- */
export default function MyListingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');

  /* ---------- Fetch user + listings once --------------------------- */
  useEffect(() => {
    const fetchUserDataAndListings = async () => {
      setLoading(true);
      setError(null);
      setDeleteError(null);

      /* 1. Get current user */
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        router.push('/auth');
        return;
      }
      setUser(userData.user);

      /* 2. Fetch listings */
      const { data, error: listingError } = await supabase
        .from('listings')
        .select('id, title, description, min_price, end_time, created_at, photos')
        .eq('seller_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (listingError) {
        setError(listingError.message);
        setListings([]);
      } else {
        setListings(data ?? []);
      }
      setLoading(false);
    };

    fetchUserDataAndListings();
  }, [router]);

  /* ---------- Delete handler -------------------------------------- */
  const handleDeleteListing = async (listingId: string, photoUrl: string | null) => {
    setDeletingId(listingId);
    setDeleteError(null);

    /* Confirm intent */
    const title = listings.find(l => l.id === listingId)?.title ?? 'this listing';
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) {
      setDeletingId(null);
      return;
    }

    try {
      /* Prevent deletion if bids exist */
      const { error: bidsErr, count } = await supabase
        .from('bids')
        .select('id', { count: 'exact', head: true })
        .eq('item_id', listingId);

      if (bidsErr) throw new Error(`Bid check failed: ${bidsErr.message}`);
      if ((count ?? 0) > 0) throw new Error('Cannot delete: bids already placed.');

      /* Delete DB row */
      const { error: delErr } = await supabase
        .from('listings')
        .delete()
        .eq('id', listingId);
      if (delErr) throw new Error(`Database deletion failed: ${delErr.message}`);

      /* -- Storage clean-up --------------------------------------- */
      if (photoUrl) {
        const storagePath = getStoragePathFromURL(photoUrl);
        if (storagePath) {
          const { error: storageErr } = await supabase
            .storage
            .from('listing-images')
            .remove([storagePath]);

          if (storageErr) {
            console.error(
              `Storage deletion failed for ${storagePath}: ${storageErr.message}`,
            );
            setDeleteError(
              `Listing deleted, but failed to remove image: ${storageErr.message}`,
            );
          }
        } else {
          console.warn(`Couldn’t parse image path from URL: ${photoUrl}`);
          setDeleteError(
            'Listing deleted, but could not parse image path for removal.',
          );
        }
      }
      /* ------------------------------------------------------------ */

      /* Update UI */
      setListings(prev => prev.filter(l => l.id !== listingId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown deletion error.';
      console.error('handleDeleteListing error:', err);
      setDeleteError(msg);
      alert(msg);
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- Filter listings ------------------------------------- */
  const filteredListings = useMemo(
    () =>
      listings.filter(l =>
        viewFilter === 'active' ? !isPast(l.end_time) : isPast(l.end_time),
      ),
    [listings, viewFilter],
  );

  /* ---------- Button classes -------------------------------------- */
  const tabClass = (tab: ViewFilter) =>
    [
      'px-3 py-1.5 rounded text-sm font-medium',
      viewFilter === tab
        ? 'bg-indigo-600 text-white'
        : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    ].join(' ');

  /* ---------- Render guards --------------------------------------- */
  if (loading)
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
          My Listings
        </h1>
        <LoadingSpinner />
      </section>
    );

  if (error)
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
          My Listings
        </h1>
        <p className="text-center text-red-600">{error}</p>
      </section>
    );

  if (!user)
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
          My Listings
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400">
          Please{' '}
          <Link href="/auth" className="text-indigo-600 underline">
            log in
          </Link>{' '}
          to view your listings.
        </p>
      </section>
    );

  /* ---------- Main render ----------------------------------------- */
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      {/* header & tabs */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">My Listings</h1>
        <div className="flex space-x-2">
          <button className={tabClass('active')} onClick={() => setViewFilter('active')}>
            Active
          </button>
          <button className={tabClass('past')} onClick={() => setViewFilter('past')}>
            Past
          </button>
        </div>
      </header>

      {/* delete error banner */}
      {deleteError && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-200 rounded text-sm">
          {deleteError}
        </div>
      )}

      {/* list or empty-state */}
      {filteredListings.length === 0 ? (
        <EmptyState
          message={
            viewFilter === 'active'
              ? 'You have no active listings.'
              : 'You have no past listings.'
          }
          action={{ href: '/listings/new', text: 'List an Item' }}
        />
      ) : (
        <ul className="space-y-6">
          {filteredListings.map(listing => (
            <li
              key={listing.id}
              className="border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white dark:bg-gray-800"
            >
              {/* image */}
              {listing.photos && (
                <Link href={`/listings/${listing.id}`} className="flex-shrink-0 block">
                  <div className="w-full sm:w-[120px] h-[120px] sm:h-[80px] bg-gray-100 dark:bg-gray-700 rounded overflow-hidden group">
                    <img
                      src={listing.photos}
                      alt={`Cover for ${listing.title}`}
                      className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                    />
                  </div>
                </Link>
              )}

              {/* details */}
              <div className="flex-grow">
                <Link
                  href={`/listings/${listing.id}`}
                  className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1"
                >
                  {listing.title}
                </Link>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2">
                  {listing.description}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-800 dark:text-gray-400">
                  <span>
                    Min Price:{' '}
                    <span className="font-medium">
                      {formatCurrency(listing.min_price)}
                    </span>
                  </span>
                  {listing.end_time && (
                    <span>
                      Ends:{' '}
                      <span className="font-medium">
                        {new Date(listing.end_time).toLocaleString()}
                      </span>
                    </span>
                  )}
                  {viewFilter === 'past' && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                      Ended
                    </span>
                  )}
                </div>
              </div>

              {/* delete button */}
              <div className="flex-shrink-0 mt-2 sm:mt-0 sm:ml-4">
                <button
                  onClick={() => handleDeleteListing(listing.id, listing.photos)}
                  disabled={deletingId === listing.id || viewFilter === 'past'}
                  title={
                    viewFilter === 'past' ? 'Cannot delete ended listings' : undefined
                  }
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingId === listing.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
