'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase, type Session } from '@/lib/supabaseClient';

export default function AuthPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  /* 🔄 keep live session state */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  /* ───────── already logged in ───────── */
  if (session) {
    return (
      <div className="max-w-sm mx-auto py-16 text-center space-y-4">
        <p className="text-xl">✅ You’re already logged in.</p>

        <button
          onClick={() => router.push('/listings')}
          className="px-4 py-2 bg-indigo-600 text-white rounded"
        >
          Go to Listings
        </button>

        <button
          onClick={() => supabase.auth.signOut()}
          className="block mx-auto text-sm text-red-600 underline"
        >
          Log out
        </button>
      </div>
    );
  }

  /* ───────── sign-in / sign-up ───────── */
  return (
    <div className="max-w-sm mx-auto py-16">
      <Auth
        supabaseClient={supabase}
        appearance={{ theme: ThemeSupa }}
        providers={[] /* add 'google' later */}
        theme="dark"
        redirectTo="/listings"
      />
    </div>
  );
}
