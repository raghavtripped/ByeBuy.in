// src/app/auth/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabaseClient';
// Removed LoadingSpinner import

export default function AuthPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false); // Still useful for client-side URL generation

  useEffect(() => {
      setIsMounted(true); // Indicate component has mounted client-side

      // Listener to handle REDIRECT AFTER magic link or state change
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (_event, session) => {
              console.log("Auth page: Auth state changed.", session ? "Got session" : "No session");
              if (session) {
                  // If a session becomes active, redirect to listings.
                  console.log("Auth page: Session detected in listener, redirecting to /listings");
                  router.push('/listings');
              }
              // No explicit action needed if session is null (user remains on auth page)
          }
      );

      // Initial check - optional, listener handles active session redirect anyway
      // We can check just to potentially log info, but don't need isLoading state now
      supabase.auth.getSession().then(({ data }) => {
          console.log("Auth page: Initial session check complete. Session exists:", !!data.session);
      });


      return () => subscription.unsubscribe();
  // Add router to dependency array because it's used in the effect's listener
  }, [router]);

  // Construct redirect URL (for actions within Auth component like password recovery, etc.)
  const getRedirectUrl = () => {
      if (!isMounted) return undefined;
      return `${window.location.origin}/listings`;
  }

  // Directly render the Auth UI. The listener handles redirecting away if needed.
  // If user visits while logged in, they see this briefly before listener redirects.
  return (
    <div className="max-w-sm mx-auto py-16">
      <Auth
        supabaseClient={supabase}
        appearance={{ theme: ThemeSupa }}
        providers={[]}
        theme="dark"
        redirectTo={getRedirectUrl()} // Point to /listings for Auth component actions
      />
    </div>
  );
}