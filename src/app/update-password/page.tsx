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
      /* Supabase <Auth> will show the "set new password" form automatically */
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-bye-dark-bg-primary dark:via-bye-dark-bg-primary dark:to-bye-dark-bg-primary py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-8 sm:p-10 bg-white dark:bg-bye-dark-bg-secondary rounded-xl shadow-2xl border border-gray-100 dark:border-bye-dark-border-primary">
        <div>
          <h2 className="text-center text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Set Your New Password
          </h2>
        </div>

        {message && (
          <div
            className="p-3 my-3 text-sm text-green-700 bg-green-50 rounded-md dark:bg-green-900/25 dark:text-green-300 border border-green-200 dark:border-green-700/50"
            role="alert"
          >
            {message}
          </div>
        )}

        {error && (
          <div
            className="p-3 my-3 text-sm text-red-700 bg-red-50 rounded-md dark:bg-red-900/25 dark:text-red-300 border border-red-200 dark:border-red-700/50"
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
                  brand: '#7c3aed',
                  brandAccent: '#6d28d9',
                  brandButtonText: 'white',
                  defaultButtonBackground: '#f1f5f9',
                  defaultButtonBackgroundHover: '#e2e8f0',
                  defaultButtonBorder: '#e2e8f0',
                  defaultButtonText: '#334155',
                  dividerBackground: '#e2e8f0',
                  inputBackground: '#ffffff',
                  inputBorder: '#e2e8f0',
                  inputBorderHover: '#c7d2fe',
                  inputBorderFocus: '#7c3aed',
                  inputText: '#1e293b',
                  inputLabelText: '#475569',
                  inputPlaceholder: '#94a3b8',
                  messageText: '#ef4444',
                  messageTextDanger: '#dc2626',
                  anchorTextColor: '#7c3aed',
                  anchorTextHoverColor: '#6d28d9',
                },
              },
            },
            className: {
              button: 'font-semibold shadow-lg hover:shadow-xl transition-all duration-200 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700',
              input: 'transition-all duration-200 focus:ring-2 focus:ring-indigo-500/30 dark:focus:ring-indigo-500/30 focus:border-indigo-600 dark:focus:border-indigo-600 bg-white dark:bg-bye-dark-bg-hover border-gray-300 dark:border-bye-dark-border-primary text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-400 dark:placeholder-bye-dark-text-secondary',
              label: 'font-medium text-gray-700 dark:text-bye-dark-text-primary',
            },
          }}
        />

        <p className="mt-4 text-center text-sm text-gray-600 dark:text-bye-dark-text-secondary">
          Remembered your password?{' '}
          <Link
            href="/auth"
            className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
