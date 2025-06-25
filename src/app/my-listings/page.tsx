// src/app/my-listings/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications'; // Add this import
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type User } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { isPast } from '@/lib/timeUtils';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
const parsePhotosJson = (
  photosInput: string | string[] | null | undefined
): string[] | null => {
  if (photosInput == null) return null;
  if (Array.isArray(photosInput)) {
    return photosInput.every((i) => typeof i === 'string') ? photosInput : null;
  }
  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      return Array.isArray(parsed) && parsed.every((i) => typeof i === 'string')
        ? parsed
        : null;
    } catch (err) {
      console.error('Failed to parse photos JSON string:', photosInput, err);
      return null;
    }
  }
  return null;
};

const getStoragePathFromURL = (photoUrl: string): string | null => {
  try {
    const { pathname } = new URL(photoUrl);
    const parts = pathname.split('/');
    const idx = parts.indexOf('public');
    if (idx !== -1 && idx + 1 < parts.length) return parts.slice(idx + 1).join('/');
    console.warn('Could not parse storage path:', photoUrl);
    return null;
  } catch (err) {
    console.error('URL parse error', err);
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
export type SellerListing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  end_time: string | null;
  created_at: string;
  photos: string[] | null;
  status: 'active' | 'closed' | 'cancelled' | string;
};

type ViewFilter = 'active' | 'past';

/** Row payload emitted by Supabase realtime for `listings` */
type SellerListingPayload = Partial<Omit<SellerListing, 'photos'>> & {
  id: string;
  photos?: string[] | null;
};


/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */
export default function MyListingsPage() {
  const router = useRouter();
  const { showNotification } = useNotifications(); // Add notifications hook
  
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');

  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [finalizeMessage, setFinalizeMessage] = useState<
    { type: 'success' | 'error'; text: string } | null
  >(null);

  /* --------------------------- fetch listings ------------------------ */
  const fetchUserDataAndListings = useCallback(
    async (u: User) => {
      setLoading(true);
      setError(null);
      setDeleteError(null);
      setFinalizeMessage(null);

      try {
        const { data, error: listErr } = await supabase
          .from('listings')
          .select(
            'id, title, description, min_price, end_time, created_at, photos, status'
          )
          .eq('seller_id', u.id)
          .order('created_at', { ascending: false });

        if (listErr) throw listErr;

        const typed = (data ?? []).map(
          (l) =>
            ({
              ...l,
              photos: parsePhotosJson(l.photos),
              status: l.status as SellerListing['status'],
            }) as SellerListing
        );

        setListings(typed);
      } catch (err) {
        console.error('Fetch listings error', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load your listings.'
        );
        setListings([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /* --------------------- realtime handler ---------------------------- */
  const handleRealtimeUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<SellerListingPayload>) => {
      const { new: rawNew, old: rawOld, eventType } = payload;

      // Determine the relevant record and ensure it has an ID
      const relevantRecord =
        rawNew && 'id' in rawNew
          ? rawNew
          : rawOld && 'id' in rawOld
          ? rawOld
          : undefined;

      if (!relevantRecord?.id) {
        console.warn('MyListings RT: Received event without a valid record ID.', payload);
        return;
      }

      const id = relevantRecord.id;
      const photosFrom = (rec: typeof relevantRecord | undefined): string[] | null =>
        rec && rec.photos ? parsePhotosJson(rec.photos) : null;

      setListings((prev) => {
        let next = [...prev];

        switch (eventType) {
          case 'INSERT': {
            if (
              rawNew &&
              rawNew.title &&
              rawNew.status &&
              rawNew.created_at &&
              typeof rawNew.min_price === 'number'
            ) {
              const fresh: SellerListing = {
                id: rawNew.id,
                title: rawNew.title,
                description: rawNew.description ?? '',
                min_price: rawNew.min_price,
                end_time: rawNew.end_time ?? null,
                created_at: rawNew.created_at,
                photos: photosFrom(rawNew),
                status: rawNew.status as SellerListing['status'],
              };
              if (!next.some((l) => l.id === id)) next.unshift(fresh);
            }
            break;
          }

          case 'UPDATE': {
            const idx = next.findIndex((l) => l.id === id);
            if (idx !== -1 && rawNew) {
              const cur = next[idx];
              next[idx] = {
                ...cur,
                ...(rawNew.title !== undefined && { title: rawNew.title }),
                ...(rawNew.description !== undefined && {
                  description: rawNew.description,
                }),
                ...(rawNew.min_price !== undefined && {
                  min_price: rawNew.min_price,
                }),
                ...(rawNew.end_time !== undefined && {
                  end_time: rawNew.end_time,
                }),
                ...(rawNew.status !== undefined && {
                  status: rawNew.status as SellerListing['status'],
                }),
                ...(rawNew.created_at !== undefined && {
                  created_at: rawNew.created_at,
                }),
                ...(rawNew.photos !== undefined && {
                  photos: photosFrom(rawNew),
                }),
              };
            }
            break;
          }

          case 'DELETE':
            next = next.filter((l) => l.id !== id);
            break;
        }

        return next.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    },
    []
  );

  /* ------------------------- setup on mount -------------------------- */
  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authErr || !auth?.user) {
        router.push('/auth?redirect=/my-listings');
        setLoading(false);
        return;
      }

      setUser(auth.user);
      await fetchUserDataAndListings(auth.user);
      if (!mounted) return;

      channel = supabase
        .channel(`my-listings-${auth.user.id}`)
        .on<SellerListingPayload>(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'listings',
            filter: `seller_id=eq.${auth.user.id}`,
          },
          handleRealtimeUpdate
        )
        .subscribe();
    };

    init();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel).catch(console.error);
    };
  }, [router, fetchUserDataAndListings, handleRealtimeUpdate]);

  /* --------------------------- finalize ------------------------------ */
  const handleFinalizeAuction = async (id: string) => {
    setFinalizingId(id);
    setFinalizeMessage(null);
    const title = listings.find((l) => l.id === id)?.title ?? 'auction';

    if (
      !window.confirm(
        `Finalize "${title}"? This will close the auction and choose a winner.`
      )
    ) {
      setFinalizingId(null);
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        'finalize_auction_outcome',
        { auction_id_to_close: id }
      );
      if (error) throw error;

      const result = data?.[0];
      if (!result) throw new Error('Unexpected response from finalize RPC.');

      if (result.outcome_status === 'error')
        throw new Error(result.message || 'Finalization error.');

      setListings((prev) =>
        prev.map((l) =>
          l.id === id && result.outcome_status.startsWith('closed')
            ? { ...l, status: 'closed' }
            : l
        )
      );
      setFinalizeMessage({
        type: 'success',
        text: result.message || 'Auction finalized.',
      });
    } catch (err) {
      setFinalizeMessage({
        type: 'error',
        text:
          'Finalization failed: ' +
          (err instanceof Error ? err.message : 'Unknown error.'),
      });
    } finally {
      setFinalizingId(null);
      setTimeout(() => setFinalizeMessage(null), 7000);
    }
  };

  /* ---------------------------- delete -------------------------------- */
  const handleDeleteListing = async (id: string, photos: string[] | null) => {
    setDeletingId(id);
    setDeleteError(null);
    const title = listings.find((l) => l.id === id)?.title ?? 'listing';

    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) {
      setDeletingId(null);
      return;
    }

    try {
      const { error: bidErr, count } = await supabase
        .from('bids')
        .select('id', { head: true, count: 'exact' })
        .eq('item_id', id);
        
      if (bidErr) throw bidErr;
      if ((count ?? 0) > 0) throw new Error('Cannot delete: bids already placed.');

      const { error: delErr } = await supabase
        .from('listings')
        .delete()
        .eq('id', id);
        
      if (delErr) throw delErr;

      if (photos?.length) {
        const paths = photos
          .map(getStoragePathFromURL)
          .filter(Boolean) as string[];
          
        if (paths.length) {
          const { error: storErr } = await supabase.storage
            .from('listing-images')
            .remove(paths);
            
          if (storErr) {
            const msg = `Listing deleted, but some images failed to remove: ${storErr.message}`;
            setDeleteError(msg);
            showNotification({
              type: 'warning',
              message: msg,
              duration: 10000
            });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deletion failed unexpectedly.';
      setDeleteError(message);
      showNotification({
        type: 'error',
        message: `Delete failed: ${message}`
      });
    } finally {
      setDeletingId(null);
      if (!deleteError) setTimeout(() => setDeleteError(null), 7000);
    }
  };

  /* --------------------------- filtering ------------------------------ */
  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      if (viewFilter === 'active')
        return l.status === 'active' && !isPast(l.end_time);
      if (viewFilter === 'past')
        return (
          l.status === 'closed' ||
          l.status === 'cancelled' ||
          (l.status === 'active' && isPast(l.end_time))
        );
      return false;
    });
  }, [listings, viewFilter]);

  /* ------------------------------ UI --------------------------------- */
  const tabClass = (tab: ViewFilter) => {
    const base =
      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-bye-dark-bg-primary';
    const active = 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm';
    const inactive =
      'bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-secondary hover:bg-gray-200 dark:hover:bg-bye-dark-bg-hover/75';
    return `${base} ${viewFilter === tab ? active : inactive}`;
  };

  /* ------------------------- render guards --------------------------- */
  if (loading && !user)
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <LoadingSpinner message="Authenticating" />
      </section>
    );

  if (!user && !loading)
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          My Listings
        </h1>
        <p className="text-gray-600 dark:text-bye-dark-text-secondary">
          Please log in to view your listings.
        </p>
        <Link
          href="/auth?redirect=/my-listings"
          className="mt-4 inline-block text-indigo-600 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Go to Login
        </Link>
      </section>
    );

  if (loading && user)
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          My Listings
        </h1>
        <LoadingSpinner message="Loading your listings" />
      </section>
    );

  if (error)
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          My Listings
        </h1>
        <p className="text-red-600 dark:text-red-300">Error: {error}</p>
      </section>
    );

  /* ------------------------------ page -------------------------------- */
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4 pb-4 border-b border-gray-200 dark:border-bye-dark-border-primary">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          My Listings
        </h1>
        <div className="flex space-x-2">
          <button
            className={tabClass('active')}
            onClick={() => setViewFilter('active')}
          >
            Active
          </button>
          <button
            className={tabClass('past')}
            onClick={() => setViewFilter('past')}
          >
            Past / Needs Finalizing
          </button>
        </div>
      </header>

      {finalizeMessage && (
        <div
          role="alert"
          className={`mb-4 p-3 rounded-md border text-sm flex items-start gap-2 ${
            finalizeMessage.type === 'error'
              ? 'bg-red-50 dark:bg-red-900/25 border-red-200 dark:border-red-600/50 text-red-700 dark:text-red-300'
              : 'bg-green-50 dark:bg-green-900/25 border-green-200 dark:border-green-600/50 text-green-700 dark:text-green-300'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            {finalizeMessage.type === 'error' ? (
              <path
                fillRule="evenodd"
                d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            ) : (
              <path
                fillRule="evenodd"
                d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.84-8.41a.75.75 0 1 1-1.06-1.06L7.94 8.37 6.72 7.15a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l4.37-4.37Z"
                clipRule="evenodd"
              />
            )}
          </svg>
          <span>{finalizeMessage.text}</span>
        </div>
      )}

      {deleteError && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-md border text-sm flex items-start gap-2 bg-red-50 dark:bg-red-900/25 border-red-200 dark:border-red-600/50 text-red-700 dark:text-red-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path
              fillRule="evenodd"
              d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          <span>{deleteError}</span>
        </div>
      )}

      {filteredListings.length === 0 ? (
        <EmptyState
          message={
            viewFilter === 'active'
              ? 'You have no active listings.'
              : 'You have no past listings or listings needing finalization.'
          }
          action={{ href: '/listings/new', text: 'List an Item' }}
        />
      ) : (
        <ul className="space-y-6">
          {filteredListings.map((l) => {
            const beingDeleted = deletingId === l.id;
            const beingFinalized = finalizingId === l.id;
            const needsFinalizing = l.status === 'active' && isPast(l.end_time);
            const canDelete = l.status === 'active' && !needsFinalizing;
            const canFinalize = needsFinalizing;

            /* badge ----------------------------------------------------- */
            let badgeText =
              l.status.charAt(0).toUpperCase() + l.status.slice(1);
            let badgeClasses =
              'bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-secondary ring-gray-500/20 dark:ring-bye-dark-border-primary/30';

            if (l.status === 'active')
              badgeClasses =
                'bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 ring-teal-600/20 dark:ring-teal-500/30';
            if (needsFinalizing) {
              badgeText = 'Needs Finalizing';
              badgeClasses =
                'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 ring-blue-600/20 dark:ring-blue-500/30';
            } else if (l.status === 'closed')
              badgeClasses =
                'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 ring-green-600/20 dark:ring-green-500/30';
            else if (l.status === 'cancelled')
              badgeClasses =
                'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 ring-yellow-600/20 dark:ring-yellow-500/30';

            const thumb = l.photos && l.photos.length ? l.photos[0] : null;

            return (
              <li
                key={l.id}
                className={`border border-gray-200 dark:border-bye-dark-border-primary p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white dark:bg-bye-dark-bg-secondary transition-opacity ${
                  beingDeleted || beingFinalized
                    ? 'opacity-50 pointer-events-none'
                    : ''
                }`}
              >
                {/* thumbnail */}
                <div className="flex-shrink-0 w-full sm:w-[120px] h-[80px] bg-gray-100 dark:bg-bye-dark-bg-hover rounded overflow-hidden group relative">
                  {thumb ? (
                    <Link
                      href={`/listings/${l.id}`}
                      aria-label={`View ${l.title}`}
                    >
                      <Image
                        src={thumb}
                        alt={`Cover for ${l.title}`}
                        width={120}
                        height={80}
                        style={{ objectFit: 'cover' }}
                        className="w-full h-full transition-transform duration-300 group-hover:scale-105"
                        quality={85}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            '/placeholder-image.svg';
                        }}
                      />
                    </Link>
                  ) : (
                    <Link
                      href={`/listings/${l.id}`}
                      className="w-full h-full flex items-center justify-center"
                      aria-label={`View ${l.title}`}
                    >
                      <svg
                        className="h-10 w-10 text-gray-400 dark:text-bye-dark-text-secondary/60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </Link>
                  )}
                </div>

                {/* details */}
                <div className="flex-grow min-w-0">
                  <Link
                    href={`/listings/${l.id}`}
                    className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block mb-1 break-words"
                  >
                    {l.title}
                  </Link>
                  <p className="text-gray-600 dark:text-bye-dark-text-secondary text-sm mb-2 line-clamp-2 break-words">
                    {l.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-bye-dark-text-primary">
                    <span>
                      Min Price:{' '}
                      <span className="font-medium text-gray-900 dark:text-bye-dark-text-primary">
                        {formatCurrency(l.min_price)}
                      </span>
                    </span>

                    {l.end_time && (
                      <span className="flex items-center gap-1">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-3.5 h-3.5 opacity-70 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 16 16"
                        >
                          <path
                            fillRule="evenodd"
                            d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h4.25a.75.75 0 0 0 0-1.5H8.5V3.75Z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {needsFinalizing
                          ? 'Ended: '
                          : l.status === 'closed'
                          ? 'Closed: '
                          : 'Ends: '}
                        <span className="font-medium text-gray-900 dark:text-bye-dark-text-primary">
                          {new Date(l.end_time).toLocaleString([], {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </span>
                    )}

                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClasses}`}
                    >
                      {badgeText}
                    </span>
                  </div>
                </div>

                {/* actions */}
                <div className="flex-shrink-0 mt-3 sm:mt-0 sm:ml-4 space-y-2 sm:space-y-0 sm:flex sm:flex-col md:flex-row md:space-x-2 items-center">
                  {canFinalize && (
                    <button
                      onClick={() => handleFinalizeAuction(l.id)}
                      disabled={beingFinalized || beingDeleted}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-xl shadow-sm text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:focus:ring-offset-bye-dark-bg-secondary disabled:opacity-50 transition-all duration-200"
                    >
                      {beingFinalized ? (
                        <>
                          <svg
                            className="animate-spin -ml-0.5 mr-1.5 h-3 w-3"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Finalizing…
                        </>
                      ) : (
                        'Finalize'
                      )}
                    </button>
                  )}

                  <Link
                    href={`/listings/${l.id}/edit`}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-bye-dark-border-primary text-xs font-medium rounded-md shadow-sm text-gray-700 dark:text-bye-dark-text-primary bg-white dark:bg-bye-dark-bg-hover hover:bg-gray-50 dark:hover:bg-bye-dark-bg-hover/75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:focus:ring-offset-bye-dark-bg-secondary disabled:opacity-50"
                    aria-disabled={
                      beingDeleted ||
                      beingFinalized ||
                      l.status === 'closed' ||
                      l.status === 'cancelled'
                    }
                    onClick={(e) => {
                      if (
                        beingDeleted ||
                        beingFinalized ||
                        l.status === 'closed' ||
                        l.status === 'cancelled'
                      )
                        e.preventDefault();
                    }}
                  >
                    Edit
                  </Link>

                  {canDelete && (
                    <button
                      onClick={() => handleDeleteListing(l.id, l.photos)}
                      disabled={beingDeleted || beingFinalized}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white dark:text-gray-100 bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-red-400 dark:focus:ring-offset-bye-dark-bg-secondary disabled:opacity-50"
                    >
                      {beingDeleted ? (
                        <>
                          <svg
                            className="animate-spin -ml-0.5 mr-1.5 h-3 w-3"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Deleting…
                        </>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
