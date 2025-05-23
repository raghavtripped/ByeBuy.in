// src/app/update-password/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ------------------------------------------------------------------ */
  /*  URL + auth-listener handling                                      */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    // 1) Check the URL on first load
    if (
      window.location.hash.includes('type=recovery') &&
      window.location.hash.includes('access_token=')
    ) {
      /* Supabase <Auth> will show the “set new password” form automatically */
    } else {
      const qp = new URLSearchParams(window.location.search);
      const urlError = qp.get('error_description') || qp.get('error');
      if (urlError) {
        setError(decodeURIComponent(urlError));
        setMessage(null);
      }
    }

    // 2) Listen for Supabase auth events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setMessage('You can now set your new password.');
        setError(null);
      } else if (_event === 'USER_UPDATED' && session) {
        setMessage('Password updated successfully! Redirecting to login…');
        setError(null);
        setTimeout(() => router.push('/auth'), 3000);
      }
    });

    return () => subscription?.unsubscribe();
  }, [router]);

  /* ------------------------------------------------------------------ */
  /*  UI                                                                */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-bye-dark-bg-primary py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-8 sm:p-10 bg-white dark:bg-bye-dark-bg-secondary rounded-xl shadow-2xl">
        <div>
          <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-bye-dark-text-primary">
            Set&nbsp;Your&nbsp;New&nbsp;Password
          </h2>
        </div>

        {message && (
          <div
            className="p-3 my-3 text-sm text-green-700 bg-green-100 rounded-md dark:bg-green-900/25 dark:text-green-300"
            role="alert"
          >
            {message}
          </div>
        )}

        {error && (
          <div
            className="p-3 my-3 text-sm text-red-700 bg-red-100 rounded-md dark:bg-red-900/25 dark:text-red-300"
            role="alert"
          >
            Error: {error}
          </div>
        )}

        {/* Supabase Auth UI */}
        <Auth
          supabaseClient={supabase}
          view="update_password"
          providers={[]}
          theme="dark"
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'rgb(79, 70, 229)',
                  brandAccent: 'rgb(101, 91, 239)',
                },
              },
            },
          }}
        />

        <p className="mt-4 text-center text-sm text-gray-600 dark:text-bye-dark-text-secondary">
          Remembered your password?{' '}
          <Link
            href="/auth"
            className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Sign&nbsp;in
          </Link>
        </p>
      </div>
    </div>
  );
}
