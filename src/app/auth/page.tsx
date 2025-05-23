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
              if (session) {
                  const currentPath = window.location.pathname + window.location.search + window.location.hash;
                  if (!currentPath.includes('/auth/callback') && !window.location.hash.includes('type=recovery') && !window.location.search.includes('code=')) {
                      const urlParams = new URLSearchParams(window.location.search);
                      const nextPath = urlParams.get('redirect') || '/listings';
                      router.push(nextPath);
                  }
              }
          }
      );

      supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
              const currentPath = window.location.pathname + window.location.search + window.location.hash;
              if (!currentPath.includes('/auth/callback') && !window.location.hash.includes('type=recovery') && !window.location.search.includes('code=')) {
                   const urlParams = new URLSearchParams(window.location.search);
                   const nextPath = urlParams.get('redirect') || '/listings';
                   router.push(nextPath);
              }
          }
      });

      return () => subscription?.unsubscribe();
  }, [router]);

  const getRedirectUrlClientSide = (): string | undefined => {
      if (!isMounted) return undefined; 
      const urlParams = new URLSearchParams(window.location.search);
      const nextPath = urlParams.get('next');
      if (nextPath) {
          if (nextPath.startsWith('/')) {
              return `${window.location.origin}${nextPath}`;
          }
      }
      return `${window.location.origin}/listings`;
  }

  // Supabase Auth UI uses its own dark theme variables, but we can adjust our container.
  // The 'theme="dark"' prop on Auth component handles its internal dark mode.
  // We mainly need to style the page background and the card holding the Auth component.

  return (
    // Updated page background for dark mode
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-bye-dark-bg-primary py-12 px-4 sm:px-6 lg:px-8">
        {/* Updated card background for dark mode */}
        <div className="max-w-md w-full space-y-8 p-8 sm:p-10 bg-white dark:bg-bye-dark-bg-secondary rounded-xl shadow-2xl">
            <div>
                {/* eslint-disable-next-line @next/next/no-img-element, @next/next/no-img-element */}
                <img
                    className="mx-auto h-12 w-auto"
                    src="/bidly-logo.svg" 
                    alt="ByeBuy"
                />
                {/* Updated title text color for dark mode */}
                <h2 className="mt-6 text-center text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-bye-dark-text-primary">
                    Sign in to your account
                </h2>
                {/* Updated subtitle text color for dark mode */}
                <p className="mt-2 text-center text-sm text-gray-600 dark:text-bye-dark-text-secondary">
                    Or start bidding on awesome campus deals!
                </p>
            </div>
            {isMounted && ( // Conditionally render Auth UI once isMounted is true to ensure client-side URLs are ready
                <Auth
                    supabaseClient={supabase}
                    appearance={{ 
                        theme: ThemeSupa, // ThemeSupa handles its own dark/light theming based on the 'theme' prop
                        variables: {
                            default: {
                                colors: {
                                    brand: 'rgb(79, 70, 229)', // Your app's Indigo
                                    brandAccent: 'rgb(101, 91, 239)', // A slightly lighter Indigo
                                    // You can override other ThemeSupa variables here if needed
                                    // For example, to match our new dark mode more closely:
                                    // inputBackground: '#2A2A2B', // bye-dark-bg-hover
                                    // inputBorder: '#343536',    // bye-dark-border-primary
                                    // inputText: '#D7DADC',      // bye-dark-text-primary
                                    // ... and so on for anchors, messages, etc.
                                    // However, ThemeSupa's default dark theme is generally quite good.
                                },
                                // Example: If you wanted to make the default font match Inter
                                // fonts: {
                                //  bodyFontFamily: `Inter, sans-serif`,
                                //  buttonFontFamily: `Inter, sans-serif`,
                                //  labelFontFamily: `Inter, sans-serif`,
                                // },
                            },
                        },
                    }}
                    providers={['google']} 
                    socialLayout="horizontal" 
                    theme="dark" // This tells Supabase Auth UI to use its dark variant.
                                 // It will pick up OS preference if not set, but 'dark' forces it.
                                 // You could also make this dynamic based on your ThemeScript:
                                 // theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
                                 // (but that requires careful handling of isMounted and theme state)
                    redirectTo={getRedirectUrlClientSide()}
                />
            )}
            {!isMounted && ( // Optional: Show a simple loader while waiting for mount
                <div className="text-center py-10">
                    <p className="text-sm text-gray-500 dark:text-bye-dark-text-secondary">Loading authentication form...</p>
                </div>
            )}
        </div>
    </div>
  );
}