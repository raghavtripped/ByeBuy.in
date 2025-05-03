// src/app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, type Session } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { isPast } from '@/lib/timeUtils';

/* ---------- Types -------------------------------------------------- */
type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
  created_at?: string;
  current_highest_bid?: number | null;
  end_time?: string | null;
};

/* ---------- Component --------------------------------------------- */
export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---------- Fetch + realtime ------------------------------------ */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('listings_with_highest_bid')
          .select(
            `
              id, title, description, min_price, photos,
              created_at, current_highest_bid, end_time
            `,
          )
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setRows(data ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load listings.',
        );
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();

    const ch = supabase
      .channel('public:listings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'listings' },
        async (payload) => {
          if (!payload?.new?.id) return;
          const { data, error } = await supabase
            .from('listings_with_highest_bid')
            .select(
              'id, title, description, min_price, photos, created_at, current_highest_bid, end_time',
            )
            .eq('id', payload.new.id)
            .single();
          if (!error && data) {
            setRows((cur) => [
              data as Listing,
              ...cur.filter((r) => r.id !== data.id),
            ]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  /* ---------- Render guards --------------------------------------- */
  if (loading)
    return (
      <div className="mt-20 flex justify-center">
        <LoadingSpinner />
      </div>
    );

  if (error)
    return (
      <div className="p-8 text-center text-red-600">
        Error loading listings: {error}
      </div>
    );

  /* ---------- JSX -------------------------------------------------- */
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">
      {/* header */}
      <div className="flex justify-between items-center border-b pb-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">🎯 Current Listings</h1>
        {session && (
          <Link
            href="/listings/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            + Create Listing
          </Link>
        )}
      </div>

      {/* list / empty */}
      {rows.length === 0 ? (
        <EmptyState
          message="No listings available yet."
          action={
            session
              ? { href: '/listings/new', text: 'List an Item' }
              : { href: '/auth', text: 'Login to List an Item' }
          }
        />
      ) : (
        <ul
          role="list"
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {rows.map((l) => {
            const hasEnded = l.end_time ? isPast(l.end_time) : false;

            return (
              <li
                key={l.id}
                className={`col-span-1 flex flex-col divide-y divide-gray-200 rounded-lg bg-white text-center shadow border border-gray-200 transition-shadow duration-200 hover:shadow-lg ${
                  hasEnded ? 'opacity-60 grayscale' : ''
                }`}
              >
                <Link
                  href={`/listings/${l.id}`}
                  className="flex flex-1 flex-col p-4 pb-2 group"
                >
                  {/* image */}
                  {l.photos ? (
                    <div className="w-full h-40 bg-gray-100 rounded-md overflow-hidden mx-auto mb-3">
                      <img
                        src={l.photos}
                        alt={`Cover image for ${l.title}`}
                        className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-40 bg-gray-200 rounded-md flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="h-16 w-16 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}

                  {/* text */}
                  <h3 className="mt-1 text-gray-900 text-md font-medium group-hover:text-indigo-600">
                    {l.title}
                  </h3>
                  <dl className="mt-1 flex flex-grow flex-col items-center space-y-1">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                      Min: {formatCurrency(l.min_price)}
                    </span>

                    {l.current_highest_bid && l.current_highest_bid > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        Top Bid: {formatCurrency(l.current_highest_bid)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                        No Bids Yet
                      </span>
                    )}

                    {hasEnded && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20 mt-1">
                        Ended
                      </span>
                    )}
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
