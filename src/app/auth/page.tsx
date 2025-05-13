// src/app/auth/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabaseClient';

export default function AuthPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
      setIsMounted(true); 

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (_event, session) => {
              // console.log("Auth page: Auth state changed.", session ? "Got session" : "No session", "Event:", _event);
              if (session) {
                  // Avoid redirecting if on specific auth callback paths
                  const currentPath = window.location.pathname + window.location.search + window.location.hash;
                  if (!currentPath.includes('/auth/callback') && !window.location.hash.includes('type=recovery') && !window.location.search.includes('code=')) {
                      const urlParams = new URLSearchParams(window.location.search);
                      const nextPath = urlParams.get('redirect') || '/listings';
                      // console.log(`Auth page: Session detected in listener, redirecting to ${nextPath}`);
                      router.push(nextPath);
                  }
              }
          }
      );

      // Initial check for existing session
      supabase.auth.getSession().then(({ data: { session } }) => {
          // console.log("Auth page: Initial session check. Session exists:", !!session);
          if (session) {
              const currentPath = window.location.pathname + window.location.search + window.location.hash;
              if (!currentPath.includes('/auth/callback') && !window.location.hash.includes('type=recovery') && !window.location.search.includes('code=')) {
                   const urlParams = new URLSearchParams(window.location.search);
                   const nextPath = urlParams.get('redirect') || '/listings';
                   // console.log(`Auth page: Initial session exists, redirecting to ${nextPath}`);
                   router.push(nextPath);
              }
          }
      });

      return () => subscription?.unsubscribe();
  }, [router]);

  const getRedirectUrlClientSide = (): string | undefined => {
      if (!isMounted) return undefined; 
      // This URL is for Supabase internal redirects like magic links, password recovery.
      // OAuth final redirect is configured in Supabase project settings (Site URL).
      const urlParams = new URLSearchParams(window.location.search);
      const nextPath = urlParams.get('next'); // A 'next' param for post-auth redirect
      if (nextPath) {
          // Ensure nextPath is a relative path within your app for security
          if (nextPath.startsWith('/')) {
              return `${window.location.origin}${nextPath}`;
          }
      }
      return `${window.location.origin}/listings`; // Default redirect
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 p-8 sm:p-10 bg-white dark:bg-gray-800 rounded-xl shadow-2xl">
            <div>
                <img
                    className="mx-auto h-12 w-auto"
                    src="/bidly-logo.svg" 
                    alt="ByeBuy"
                />
                <h2 className="mt-6 text-center text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                    Sign in to your account
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                    Or start bidding on awesome campus deals!
                </p>
            </div>
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
                providers={['google']} 
                socialLayout="horizontal" 
                theme="dark" 
                redirectTo={getRedirectUrlClientSide()} // Good to provide for non-OAuth methods in Auth UI
            />
        </div>
    </div>
  );
}