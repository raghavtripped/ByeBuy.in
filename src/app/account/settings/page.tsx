// src/app/account/settings/page.tsx
'use client';
export {}; // <<<<<<<<<<<<<<<<<<<<<< ADD THIS LINE
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner'; // Assuming you have this
import Link from 'next/link'; 

export default function AccountSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.user) {
        // If not authenticated, redirect to login, then back to this page after login
        router.push('/auth?redirect=/account/settings'); 
        return; // Important to return to prevent further execution
      }
      setUser(session.user);
      setLoading(false);
    };
    fetchUser();
  }, [router]);

  const handleSetPassword = async () => {
    if (!user || !user.email) {
      setError("User email not found. Cannot set/change password.");
      setMessage(null);
      return;
    }
    setMessage(null); // Clear previous messages
    setError(null);

    let redirectTo: string;
    if (process.env.NODE_ENV === 'development') {
      redirectTo = 'http://localhost:3000/update-password';
    } else {
      redirectTo = 'https://byebuy.in/update-password'; // Your production URL
    }
    
    // console.log(`Requesting password reset/set with redirectTo: ${redirectTo} for ${user.email}`);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: redirectTo,
    });

    if (resetError) {
      setError(`Error sending password setup/change email: ${resetError.message}`);
      // console.error("Password reset/set email error:", resetError);
    } else {
      setMessage('A link to set/change your password has been sent to your email. Please check your inbox (and spam folder).');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]"> {/* Adjust min-h as needed */}
        <LoadingSpinner message="Loading account settings..." />
      </div>
    );
  }

  // This check should ideally not be hit if the useEffect redirect works, but it's a fallback.
  if (!user) {
    return (
        <div className="max-w-md mx-auto py-12 px-4 text-center">
            <p className="text-lg text-gray-700 dark:text-gray-300">You need to be logged in to view account settings.</p>
            <Link href="/auth?redirect=/account/settings" className="mt-4 inline-block text-indigo-600 hover:underline dark:text-indigo-400">
                Go to Login
            </Link>
        </div>
    );
  }
  
  // Determine if user likely signed up with email/password vs social (like Google)
  const hasPasswordIdentity = user.identities?.some(identity => identity.provider === 'email');

  return (
    <div className="max-w-lg mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 dark:text-gray-100 mb-8">
        Account Settings
      </h1>
      <div className="bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 sm:p-8">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="emailDisplay">
            Email Address
          </label>
          <p id="emailDisplay" className="mt-1 text-gray-900 dark:text-gray-100 p-3 bg-gray-100 dark:bg-gray-700 rounded-md text-sm break-all">
            {user.email}
          </p>
        </div>

        {message && <div className="mb-4 p-3 text-sm text-green-700 bg-green-100 rounded-md dark:bg-green-700/30 dark:text-green-200" role="alert">{message}</div>}
        {error && <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-md dark:bg-red-700/30 dark:text-red-200" role="alert">{error}</div>}

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Manage Password
          </h2>
          <button
            onClick={handleSetPassword}
            className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:focus:ring-offset-gray-800"
          >
            {hasPasswordIdentity ? 'Change Password' : 'Set a Password for Email Login'}
          </button>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            {hasPasswordIdentity 
              ? "Click to receive an email to change your current password." 
              : "If you signed up with Google/Social and want to enable email/password login, or if you forgot your password, click here."}
          </p>
        </div>
        {/* Future sections like "Change Email", "MFA Settings" can be added here */}
      </div>
    </div>
  );
}