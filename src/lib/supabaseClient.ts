import { createClient, type Session, type User } from '@supabase/supabase-js';

export type { Session, User };          // 👈 export so pages can import

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
