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
  // const [showForm, setShowForm] = useState(false); // REMOVED UNUSED STATE

  useEffect(() => {
    console.log("UpdatePasswordPage: useEffect running. Current hash:", window.location.hash);

    // Check if the URL hash contains the necessary tokens for password recovery
    if (window.location.hash.includes('type=recovery') && window.location.hash.includes('access_token=')) {
      console.log("UpdatePasswordPage: Recovery token found in URL hash. Expecting Auth UI to handle.");
      // setShowForm(true); // REMOVED
    } else {
      const queryParams = new URLSearchParams(window.location.search);
      const urlError = queryParams.get('error_description') || queryParams.get('error');
      if (urlError) {
          console.log("UpdatePasswordPage: Error found in query params:", urlError);
          setError(decodeURIComponent(urlError));
          setMessage(null);
          // setShowForm(false); // REMOVED
      } else if (!window.location.hash) {
          console.log("UpdatePasswordPage: No recovery token or error in URL. Likely direct navigation or session issue.");
          // setShowForm(true); // REMOVED
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => { // session is available if needed
      console.log("UpdatePasswordPage: onAuthStateChange event:", event, "Session:", session);
      if (event === 'PASSWORD_RECOVERY') {
        console.log("UpdatePasswordPage: PASSWORD_RECOVERY event received!");
        setMessage('You can now set your new password.');
        setError(null);
        // setShowForm(true); // REMOVED
      } else if (event === 'USER_UPDATED' && session) { 
        console.log("UpdatePasswordPage: USER_UPDATED event received!");
        setMessage('Password updated successfully! Redirecting to login...');
        setError(null);
        // setShowForm(false); // REMOVED
        setTimeout(() => {
          router.push('/auth'); 
        }, 3000);
      } else if (event === 'SIGNED_IN') {
        console.log("UpdatePasswordPage: SIGNED_IN event received. This is unusual here unless auto-login after recovery.");
      }
    });

    return () => {
      console.log("UpdatePasswordPage: Cleaning up subscription.");
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
        {/* The "Auth session missing!" message comes from the <Auth> component itself if it decides to show it */}

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