
/* -------------------------------------------------------------------------- */
/*  src/app/account/settings/page.tsx                                         */
/* -------------------------------------------------------------------------- */
'use client';
export {};

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import Link from 'next/link';

export default function AccountSettingsPage() {
  const router = useRouter();

  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  /* ---------- Auth check ------------------------------------------------ */
  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !session?.user) {
        router.push('/auth?redirect=/account/settings');
        return;
      }
      setUser(session.user);
      setLoading(false);
    };
    fetchUser();
  }, [router]);

  /* ---------- Password email handler ------------------------------------ */
  const handleSetPassword = async () => {
    if (!user?.email) {
      setError('User email not found. Cannot set/change password.');
      setMessage(null); return;
    }
    setMessage(null); setError(null);

    const redirectTo =
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000/update-password'
        : 'https://byebuy.in/update-password';

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo });
    if (resetErr) {
      setError(`Error sending password setup/change email: ${resetErr.message}`);
    } else {
      setMessage(
        'A link to set/change your password has been sent to your email. Please check your inbox (and spam folder).'
      );
    }
  };

  /* ---------- UI states -------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <LoadingSpinner message="Loading account settings..." />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-lg text-gray-700 dark:text-bye-dark-text-primary">
          You need to be logged in to view account settings.
        </p>
        <Link
          href="/auth?redirect=/account/settings"
          className="mt-4 inline-block text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  const hasPasswordIdentity = user.identities?.some(i => i.provider === 'email');

  /* ---------- Main render ----------------------------------------------- */
  return (
    <div className="max-w-lg mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 dark:text-bye-dark-text-primary mb-8">
        Account Settings
      </h1>

      <div className="bg-white dark:bg-bye-dark-bg-secondary shadow-xl rounded-lg p-6 sm:p-8">
        {/* Email Display */}
        <div className="mb-6">
          <label
            htmlFor="emailDisplay"
            className="block text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary"
          >
            Email Address
          </label>
          <p
            id="emailDisplay"
            className="mt-1 text-gray-900 dark:text-bye-dark-text-primary p-3
                       bg-gray-100 dark:bg-bye-dark-bg-hover rounded-md text-sm break-all"
          >
            {user.email}
          </p>
        </div>

        {/* Alerts */}
        {message && (
          <div
            className="mb-4 p-3 text-sm text-green-700 bg-green-100 rounded-md
                       dark:bg-green-900/25 dark:text-green-300"
            role="alert"
          >
            {message}
          </div>
        )}
        {error && (
          <div
            className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-md
                       dark:bg-red-900/25 dark:text-red-300"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Manage password */}
        <div className="border-t border-gray-200 dark:border-bye-dark-border-primary pt-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-3">
            Manage Password
          </h2>
          <button
            onClick={handleSetPassword}
            className="w-full inline-flex justify-center items-center px-4 py-2
                       border border-transparent text-sm font-medium rounded-md shadow-sm
                       text-white bg-indigo-600 hover:bg-indigo-700
                       focus:outline-none focus:ring-2 focus:ring-indigo-500
                       dark:bg-indigo-500 dark:hover:bg-indigo-600
                       dark:focus:ring-indigo-400
                       dark:focus:ring-offset-bye-dark-bg-secondary"
          >
            {hasPasswordIdentity ? 'Change Password' : 'Set a Password for Email Login'}
          </button>
          <p className="mt-2 text-xs text-gray-500 dark:text-bye-dark-text-secondary text-center">
            {hasPasswordIdentity
              ? 'Click to receive an email to change your current password.'
              : 'If you signed up with Google/Social and want to enable email/password login, or if you forgot your password, click here.'}
          </p>
        </div>

        {/* Future sections: Change Email, MFA, etc. */}
      </div>
    </div>
  );
}