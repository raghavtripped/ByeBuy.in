'use client';

import { useEffect } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const router = useRouter();

  // When the session already exists (return visit) → jump to /listings
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push('/listings');
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) router.push('/listings');
      });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto' }}>
      <Auth
        supabaseClient={supabase}
        appearance={{ theme: ThemeSupa }}
        providers={['google']}
        theme="dark"
        redirectTo={`https://${process.env.NEXT_PUBLIC_CODESPACE_HOST}/listings`}
        // ^ Codespaces exposes this env var automatically
      />
    </div>
  );
}
