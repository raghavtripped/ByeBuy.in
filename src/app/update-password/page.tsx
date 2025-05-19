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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => { // CORRECTED: Removed unused session parameter
      if (event === 'PASSWORD_RECOVERY') {
        setMessage('You can now set your new password.');
        setError(null);
      } else if (event === 'USER_UPDATED') {
        setMessage('Password updated successfully! Redirecting to login...');
        setError(null);
        setTimeout(() => {
          router.push('/auth'); 
        }, 3000);
      }
    });

    const queryParams = new URLSearchParams(window.location.search);
    const urlError = queryParams.get('error_description') || queryParams.get('error');
    if (urlError) {
        setError(decodeURIComponent(urlError));
        setMessage(null);
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-8 sm:p-10 bg-white dark:bg-gray-800 rounded-xl shadow-2xl">
        <div>
          <h2 className="mt-6 text-center text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
            Set Your New Password
          </h2>
        </div>

        {message && (
          <div className="p-3 my-3 text-sm text-green-700 bg-green-100 rounded-md dark:bg-green-700/30 dark:text-green-200" role="alert">
            {message}
          </div>
        )}
        {error && (
          <div className="p-3 my-3 text-sm text-red-700 bg-red-100 rounded-md dark:bg-red-700/30 dark:text-red-200" role="alert">
            Error: {error}
          </div>
        )}
        
        <Auth
          supabaseClient={supabase}
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
          view="update_password" 
          providers={[]} 
          theme="dark" 
        />
        <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Remembered your password?{' '}
          <Link href="/auth" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}