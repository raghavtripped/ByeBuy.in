## ByeBuy.in — Supabase Overview and Live Inspection Toolkit

This guide explains everything implemented for Supabase in this codebase (schemas, migrations, RLS policies, views, RPCs, edge functions, storage usage, and client config). It also provides a set of SQL commands you can run in Supabase SQL Editor to inspect the live backend and compare with code.

### What you’ll find here
- A high-level map of all Supabase pieces in this repo
- Plain-English summaries of database objects created by migrations
- What RPCs (SQL functions) exist and where they are used
- What Edge Function(s) exist and what secrets they require
- How the frontend uses Supabase (client and hooks)
- A copy-paste SQL inspection toolkit to see the real, current state of your Supabase project


## 1) Supabase pieces in this codebase

### Migrations (`supabase/migrations`)
In order of application:

- 20250509134644_initial_schema_setup.sql
  - Creates tables: `public.listings`, `public.bids`, `public.profiles`
  - Foreign keys: `listings.seller_id -> auth.users`, `bids.item_id -> listings`, `bids.bidder_id -> auth.users`, `profiles.id -> auth.users`
  - Functions: `public.handle_new_user()` (trigger handler), `public.get_distinct_listing_ids_for_bidder(uuid)`
  - Views: `archived_listings_details`, `bids_with_bidder_email`, `listings_with_highest_bid`, `listings_with_seller_email`
  - Trigger: `on_auth_user_created` on `auth.users` -> `public.handle_new_user()`
  - Indexes: `idx_listings_status_end_time` on `listings(status, end_time)`

- 20250510183304_fix_listings_with_highest_bid_view_add_tags.sql
  - Recreates `listings_with_highest_bid` view to include `tags`
  - Grants `SELECT` on that view to `anon` and `authenticated`

- 20250523140329_create_jsonb_columns_for_listings.sql
  - Adds `photos_jsonb jsonb`, `tags_jsonb jsonb` to `public.listings`
  - Populates them from existing `photos` and `tags` array columns

- 20250523150624_remote_schema.sql
  - Drops and recreates certain views
  - Creates new tables: `public.listing_chats`, `public.watched_listings`
  - Enables RLS on: `bids`, `listings`, `profiles`, `listing_chats`, `watched_listings`
  - Alters some nullability and types on `listings`/`bids` (e.g., `bid_price` nullable, `title/end_time/min_price` nullable; `photos/tags` to `text[]` at that point)
  - Indexes: several on chats, watchlist, and a GIN on `listings.tags`
  - Functions: `public.close_auction(uuid)` (table-returning), another `public.close_auction(...)` void variant, `public.validate_new_user_email()`, redefines `public.finalize_auction_outcome(uuid)`, `public.handle_new_user()`, view `listing_chats_with_sender_email`
  - Grants: explicit table grants for `listing_chats` and `watched_listings`
  - Policies (RLS): for `bids`, `listing_chats`, `listings`, `profiles`, `watched_listings` (details below)

- 20250523151602_add_and_populate_jsonb_columns_for_real.sql
  - Ensures `photos_jsonb`/`tags_jsonb` exist and are populated from array columns

- 20250524074926_update_listing_views_for_jsonb_columns.sql
  - Recreates `listings_with_highest_bid`, `archived_listings_details`, `listings_with_seller_email` to select JSONB versions of photos/tags
  - Grants `SELECT` on these views to `anon` and `authenticated`

- 20250524095325_final_jsonb_column_swap_and_view_update.sql
  - Drops old `photos`/`tags` columns and renames JSONB columns to `photos`/`tags` (final type: JSONB)
  - Recreates the same three views to use the final JSONB columns
  - Re-grants `SELECT` to `anon` and `authenticated`


### Edge Functions (`supabase/functions`)
- `close-expired-auctions`
  - File: `supabase/functions/close-expired-auctions/index.ts`
  - Purpose: Finds `listings` where `status = 'active'` and `end_time < now`, then calls `rpc('close_auction')` to close each
  - Authorization: Requires header `Authorization: Bearer <CLOSE_EXPIRED_AUCTIONS_SECRET>`
  - Environment variables used:
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `CLOSE_EXPIRED_AUCTIONS_SECRET`
  - CORS: open `'*'` in `cors.ts` (you can restrict for production)
  - Note: Scheduling is not defined in the repo. If you want an automated schedule, set up pg_cron or the Supabase Dashboard scheduler to call this function.


### Supabase client and usage in the app (`src/lib`, `src/hooks`)
- `src/lib/supabaseClient.ts`
  - Creates a browser client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `src/hooks/useAuth.ts`
  - Tracks signed-in `user` and auth state via `supabase.auth.getSession()` and `onAuthStateChange`

Frontend queries touch these DB objects (selection):
- Tables: `listings`, `bids`, `profiles`, `listing_chats`, `watched_listings`, and storage buckets `listing-images`, `avatars`
- Views: `listings_with_highest_bid`, `listings_with_seller_email`, `archived_listings_details`, `bids_with_bidder_email`, `listing_chats_with_sender_email`
- RPCs: `close_auction`, `get_distinct_listing_ids_for_bidder`, `finalize_auction_outcome`

Note: Code references `user_notifications` and sometimes `users` (without schema). `user_notifications` is not defined by migrations in this repo; it may have been created via Dashboard or is pending a migration. `auth.users` is the canonical users table; plain `users` would require a public view to exist.


### Supabase config (`supabase/config.toml`)
- `project_id`: efkggsqrpmilxfmszdlz
- Exposed schemas: `public`, `graphql_public`; search path includes `public`, `extensions`
- Realtime: enabled
- Storage: enabled, image transformation disabled
- Auth:
  - `site_url`: https://byebuy.in/
  - `additional_redirect_urls`: includes `https://byebuy.in/**`, `http://localhost:3000/**`, `https://byebuy-pi.vercel.app/**`
  - Email confirmations enabled; email OTP length 6; expiry 86400s
  - MFA TOTP enabled; SMS signup disabled
- Functions section includes `functions.close-expired-auctions` import map


## 2) Database model (effective objects)

### Tables (public)
- `listings`
  - Columns: `id uuid pk`, `title text (nullable)`, `description text`, `min_price numeric (nullable)`, `end_time timestamptz (nullable)`, `seller_id uuid -> auth.users`, `photos jsonb`, `tags jsonb`, `created_at timestamptz default now()`, `status text default 'active' check in ['active','closed','cancelled']`, `winning_bid_id uuid -> bids`, `winning_bidder_id uuid -> auth.users`, `upper_cap numeric`, `rules text`
  - RLS: enabled
  - Policies (selected):
    - Public read for all (`SELECT` to public)
    - Insert only by the seller (`auth.uid() = seller_id`)
    - Update only by seller while `status = 'active'`
    - Delete by seller only if no bids exist
  - Indexes: `idx_listings_status_end_time`, `idx_listings_tags (GIN)`

- `bids`
  - Columns: `id uuid pk`, `item_id uuid -> listings (cascade)`, `bidder_id uuid -> auth.users`, `bid_price numeric (nullable)`, `timestamp timestamptz default now()`
  - RLS: enabled
  - Policies (selected):
    - `SELECT` allowed for authenticated
    - `INSERT` allowed if `auth.uid() = bidder_id` and bidder is not the seller of the listing

- `profiles`
  - Columns: `id uuid pk -> auth.users`, `email text unique`, `updated_at timestamptz default now()`
  - RLS: enabled
  - Policies: `SELECT` for authenticated, `UPDATE` only by owner (`auth.uid() = id`)

- `listing_chats`
  - Columns: `id uuid pk`, `listing_id uuid -> listings (cascade)`, `sender_id uuid -> auth.users (set null)`, `content text (1..1000)`, `created_at timestamptz default now()`
  - RLS: enabled
  - Policies: authenticated can `SELECT` and `INSERT` where `auth.uid() = sender_id`; update/delete disabled for users
  - Indexes: `idx_listing_chats_listing_id_created_at`, `idx_listing_chats_sender_id`

- `watched_listings`
  - Columns: `id uuid pk`, `user_id uuid -> auth.users (cascade)`, `listing_id uuid -> listings (cascade)`, `created_at timestamptz default now()`
  - RLS: enabled
  - Policies: authenticated can insert/select/delete their own watchlist rows (`auth.uid() = user_id`)
  - Indexes: unique `(user_id, listing_id)`

### Views (public)
- `listings_with_highest_bid`
- `listings_with_seller_email`
- `archived_listings_details`
- `bids_with_bidder_email`
- `listing_chats_with_sender_email`

Grants: views grant `SELECT` to `anon` and `authenticated` where set in migrations.

### Functions (SQL/RPC)
- `public.get_distinct_listing_ids_for_bidder(p_bidder_id uuid) returns table(item_id uuid)`
- `public.finalize_auction_outcome(auction_id_to_close uuid) returns detailed close result`
- `public.close_auction(auction_id_to_close uuid) returns detailed close result`
- `public.close_auction(listing_id_to_close uuid, closing_bidder_id uuid default null, closing_bid_price numeric default null) returns void` (overload)
- `public.handle_new_user()` trigger function to populate `profiles`
- `public.validate_new_user_email()` (defined; currently not attached to a trigger in migrations here)

### Triggers
- `on_auth_user_created` AFTER INSERT on `auth.users` → `public.handle_new_user()` (from initial migration)

### Storage
- Buckets referenced in code: `listing-images`, `avatars`
  - These buckets are not created via SQL migrations in this repo. Create/check them in Supabase Storage. The SQL inspection toolkit below includes queries to list buckets/objects.


### Data model diagram (ER)

```mermaid
erDiagram
  AUTH_USERS ||--o{ PROFILES : "id -> id"
  LISTINGS }o--|| AUTH_USERS : "seller_id"
  BIDS }o--|| LISTINGS : "item_id"
  BIDS }o--|| AUTH_USERS : "bidder_id"
  LISTING_CHATS }o--|| LISTINGS : "listing_id"
  LISTING_CHATS }o--|| AUTH_USERS : "sender_id"
  WATCHED_LISTINGS }o--|| LISTINGS : "listing_id"
  WATCHED_LISTINGS }o--|| AUTH_USERS : "user_id"

  AUTH_USERS {
    uuid id PK
    text email
  }
  PROFILES {
    uuid id PK FK
    text email UNIQUE
    timestamptz updated_at
  }
  LISTINGS {
    uuid id PK
    text title NULL
    text description NULL
    numeric min_price NULL
    timestamptz end_time NULL
    uuid seller_id FK
    jsonb photos
    jsonb tags
    timestamptz created_at default_now
    text status {'active','closed','cancelled'}
    uuid winning_bid_id FK NULL
    uuid winning_bidder_id FK NULL
    numeric upper_cap NULL
    text rules NULL
  }
  BIDS {
    uuid id PK
    uuid item_id FK
    uuid bidder_id FK
    numeric bid_price NULL
    timestamptz timestamp default_now
  }
  LISTING_CHATS {
    uuid id PK
    uuid listing_id FK
    uuid sender_id FK NULL
    text content (1..1000)
    timestamptz created_at default_now
  }
  WATCHED_LISTINGS {
    uuid id PK
    uuid user_id FK
    uuid listing_id FK
    timestamptz created_at default_now
    UNIQUE(user_id, listing_id)
  }
```


## 2.1) RLS policies (explicit)

Defined in `20250523150624_remote_schema.sql`:

```sql
-- bids
create policy "Allow authenticated users to read bids"
on public.bids for select to authenticated using (true);

create policy "Enable authenticated users to insert bids on others' items"
on public.bids for insert to authenticated
with check (
  auth.uid() = bidder_id
  and auth.uid() <> (select listings.seller_id from listings where listings.id = bids.item_id)
);

-- listing_chats
create policy "Allow authenticated read access to all listing chats"
on public.listing_chats for select to authenticated using (true);

create policy "Allow authenticated users to send messages in listing chats"
on public.listing_chats for insert to authenticated
with check (auth.uid() = sender_id and listing_id is not null and content is not null);

create policy "Disallow deletions of listing chat messages by users"
on public.listing_chats for delete to authenticated using (false);

create policy "Disallow updates to listing chat messages by users"
on public.listing_chats for update to authenticated using (false);

-- listings
create policy "Allow public read access to listings"
on public.listings for select to public using (true);

create policy "Enable authenticated users to insert their own new listings"
on public.listings for insert to authenticated with check (auth.uid() = seller_id);

create policy "Enable sellers to delete own listings (if no bids)"
on public.listings for delete to authenticated
using (
  auth.uid() = seller_id and not exists (select 1 from bids where bids.item_id = listings.id)
);

create policy "Enable sellers to update own active listings"
on public.listings for update to authenticated
using (auth.uid() = seller_id and status = 'active')
with check (auth.uid() = seller_id and status = 'active');

-- profiles
create policy "Allow authenticated users to read profiles"
on public.profiles for select to authenticated using (true);

create policy "Enable users to update their own profile"
on public.profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

-- watched_listings
create policy "Allow authenticated users to add to their own watchlist"
on public.watched_listings for insert to authenticated with check (auth.uid() = user_id);

create policy "Allow authenticated users to read their own watchlist"
on public.watched_listings for select to authenticated using (auth.uid() = user_id);

create policy "Allow authenticated users to remove from their own watchlist"
on public.watched_listings for delete to authenticated using (auth.uid() = user_id);
```


## 2.2) Functions and triggers (snippets)

- `handle_new_user()` trigger on `auth.users` (populates `public.profiles`):

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
```

- `get_distinct_listing_ids_for_bidder(p_bidder_id uuid)`:

```sql
create or replace function public.get_distinct_listing_ids_for_bidder(p_bidder_id uuid)
returns table(item_id uuid) language sql stable as $$
  select distinct b.item_id from public.bids b where b.bidder_id = p_bidder_id;
$$;
grant execute on function public.get_distinct_listing_ids_for_bidder(uuid) to authenticated;
revoke execute on function public.get_distinct_listing_ids_for_bidder(uuid) from public;
```

- `finalize_auction_outcome(auction_id_to_close uuid)` (seller-only; checks `auth.uid()`):

```sql
create or replace function public.finalize_auction_outcome(auction_id_to_close uuid)
returns table(closed_auction_id uuid, outcome_status text, final_winning_bid_id uuid,
              final_winning_bidder_id uuid, final_winning_bid_amount numeric, message text)
language plpgsql security definer as $$
-- locks listing, checks seller matches auth.uid(), ensures ended, finds highest bid, updates listing
$$;
```

- `close_auction(auction_id_to_close uuid)` (admin/service role via Edge Function):

```sql
create or replace function public.close_auction(auction_id_to_close uuid)
returns table(closed_auction_id uuid, outcome_status text, final_winning_bid_id uuid,
              final_winning_bidder_id uuid, final_winning_bid_amount numeric, message text)
language plpgsql security definer as $$
-- locks listing, validates end_time, chooses highest bid, updates status and winners
$$;
```


## 2.3) Frontend ↔ database mapping (what uses what)

- Listings
  - Browse: `listings_with_highest_bid`, `listings_with_seller_email`
  - Detail: `listings`, `archived_listings_details`, `bids_with_bidder_email` (plus realtime on `bids` and `listings`)
  - Create/Update: `listings`, storage bucket `listing-images`

- Bidding
  - Reads: `bids`
  - Writes: `bids`
  - My Bids page: RPC `get_distinct_listing_ids_for_bidder`, reads `listings` and `bids`, subscribes to realtime

- Chats
  - Reads: `listing_chats_with_sender_email`
  - Writes: `listing_chats`

- Watchlist
  - Writes: `watched_listings` (insert/delete own)
  - Reads: via `watched_listings` and listing views

- Profiles & Settings
  - Table: `profiles`
  - Storage: `avatars`

- Notifications
  - Code references `user_notifications` (not present in migrations here)


## 2.4) Realtime

- Subscriptions use `postgres_changes` on:
  - `public.bids` (INSERT)
  - `public.listings` (UPDATE)
- RLS policies allow these reads for authenticated users (and `listings` is readable by `public`). Ensure only safe columns are exposed.

## 3) Edge Function: close-expired-auctions

Endpoint: deployed via Supabase Edge Functions as `close-expired-auctions`.
- Logic: finds expired active listings and calls `rpc('close_auction', { auction_id_to_close: <id> })` per listing.
- Auth: requires header `Authorization: Bearer <CLOSE_EXPIRED_AUCTIONS_SECRET>`.
- Needs environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOSE_EXPIRED_AUCTIONS_SECRET`.
- CORS: `*` (open) in `cors.ts`.
- Scheduling: not defined in code. To automate, configure a scheduler (pg_cron or Dashboard) to call this function on an interval.


## 4) Live Inspection Toolkit (paste into Supabase SQL)

Run each block separately. If a block errors, the feature/extension may not exist in your project (that’s okay).

```sql
-- 4.1 Project overview: schemas and extensions
select schema_name from information_schema.schemata order by 1;
select extname, extversion from pg_extension order by 1;
show server_version;
show timezone;
```

```sql
-- 4.2 Tables and columns in public
select table_name from information_schema.tables where table_schema = 'public' and table_type='BASE TABLE' order by 1;
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
order by table_name, ordinal_position;

-- Row counts and sizes
select relname as table_name,
       n_live_tup as approx_rows,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables order by total_size desc;
```

```sql
-- 4.3 Views and their definitions
select table_name as view_name from information_schema.views where table_schema='public' order by 1;
select schemaname, viewname, pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true) as view_sql
from pg_views where schemaname='public' order by 1,2;
```

```sql
-- 4.4 Functions (list and definitions for our key functions)
select n.nspname as schema, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in (
  'close_auction', 'finalize_auction_outcome', 'get_distinct_listing_ids_for_bidder', 'handle_new_user', 'validate_new_user_email'
)
order by p.proname, args;

-- Full definitions
select pg_get_functiondef(p.oid) as ddl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in (
  'close_auction', 'finalize_auction_outcome', 'get_distinct_listing_ids_for_bidder', 'handle_new_user', 'validate_new_user_email'
);

-- Function privileges
select n.nspname as schema, p.proname, pg_get_userbyid(pg_proc_owner) as owner, p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('close_auction','finalize_auction_outcome','get_distinct_listing_ids_for_bidder','handle_new_user');
```

```sql
-- 4.5 Foreign keys
select
  c.conname as fk_name,
  c.conrelid::regclass as table_from,
  a.attname as column_from,
  c.confrelid::regclass as table_to,
  af.attname as column_to
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace ns on ns.oid = t.relnamespace
join lateral unnest(c.conkey) with ordinality as ck(attnum, ord) on true
join lateral unnest(c.confkey) with ordinality as fk(attnum, ord) on fk.ord = ck.ord
join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
join pg_attribute af on af.attrelid = c.confrelid and af.attnum = fk.attnum
where c.contype='f' and ns.nspname='public'
order by table_from::text, fk_name;
```

```sql
-- 4.6 Indexes
select * from pg_indexes where schemaname='public' order by tablename, indexname;
```

```sql
-- 4.7 Row Level Security (RLS) flags and policies
select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r'
order by table_name;

select * from pg_policies where schemaname='public' order by tablename, policyname;

-- Policy expressions with qualifiers
select schemaname, tablename, policyname, permissive, roles, cmd,
       coalesce(qual, '<none>') as using,
       coalesce(with_check, '<none>') as with_check
from pg_policies where schemaname in ('public','storage') order by schemaname, tablename, policyname;
```

```sql
-- 4.8 Grants (who has which privileges)
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public','storage','auth')
order by table_schema, table_name, grantee, privilege_type;
```

```sql
-- 4.9 Triggers
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema in ('public','auth')
order by event_object_schema, event_object_table, trigger_name;
```

```sql
-- 4.10 Auth insight (safe to run)
select count(*) as total_users from auth.users;
select * from auth.identities limit 20;
-- If available in your project:
-- select * from auth.mfa_factors limit 20;
```

```sql
-- 4.11 Storage buckets/objects
select * from storage.buckets order by name;
select bucket_id, name, owner, created_at, updated_at from storage.objects order by created_at desc limit 50;
-- Storage policies (if any)
select * from pg_policies where schemaname='storage' order by tablename, policyname;
```

```sql
-- 4.12 Scheduler / Cron (will error if pg_cron extension is not installed)
select * from cron.job order by jobid;
```

```sql
-- 4.13 Edge functions metadata (may not exist via SQL; try if present)
-- Some projects expose this; many do not store Edge Function metadata in Postgres.
-- select * from supabase_functions.http_functions;
```

```sql
-- 4.14 Quick data sanity checks relevant to the app
select status, count(*) from public.listings group by 1 order by 1;
select item_id, max(bid_price) as highest_bid from public.bids group by 1 order by 2 desc limit 20;
select listing_id, count(*) as messages from public.listing_chats group by 1 order by 2 desc limit 20;
select user_id, count(*) as watch_count from public.watched_listings group by 1 order by 2 desc limit 20;

-- 4.15 Migration history (if using Supabase CLI migrations)
select * from supabase_migrations.schema_migrations order by version;

-- 4.16 Existence checks for code-referenced but unmigrated objects
select 'user_notifications' as name, exists (
  select 1 from information_schema.tables where table_schema='public' and table_name='user_notifications'
) as exists;
```


## 5) Contrast and compare: code vs. live backend

Use the inspection queries to verify:
- Tables present in live DB match the list in section 2 (especially `listing_chats`, `watched_listings`)
- `listings.photos` and `listings.tags` types are JSONB (not text[])
- Views exist and definitions reference JSONB columns
- RLS is enabled on: `listings`, `bids`, `profiles`, `listing_chats`, `watched_listings`; policies match the intent above
- Functions exist: `close_auction`, `finalize_auction_outcome`, `get_distinct_listing_ids_for_bidder`, `handle_new_user` (and whether `validate_new_user_email` is actually used)
- Trigger exists on `auth.users` → `public.handle_new_user`
- Buckets `listing-images` and `avatars` exist in storage
- If you intend to use notifications, check if `user_notifications` exists (code references it; migrations here do not create it)
- If you need automatic closing of expired auctions, ensure a scheduler calls the `close-expired-auctions` Edge Function (or set up `cron`)


## 6) Environment checklist

- Frontend env vars (Next.js):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- Edge Function env vars:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `CLOSE_EXPIRED_AUCTIONS_SECRET`


## 7) FAQs for non-developers

- “Why can’t I query `users` from the frontend?”
  - The true table is `auth.users` (system schema). Frontends typically use public views like `listings_with_seller_email` instead. Direct access to `auth.users` is restricted.

- “Where are Edge Functions listed in SQL?”
  - They’re deployed outside the database. Some Supabase projects expose limited metadata via special schemas, but in general you won’t see them in `information_schema`. Use the Supabase Dashboard → Edge Functions.

- “Why do some queries error in the SQL editor?”
  - It usually means the optional extension/table/view isn’t installed/created in your live project. That’s a useful signal for the comparison.


## 8) How to test key paths

- Test RPCs directly in SQL Editor:

```sql
-- close_auction (admin/service role typically)
select * from public.close_auction('00000000-0000-0000-0000-000000000000');

-- finalize_auction_outcome (must be called by the seller user)
select * from public.finalize_auction_outcome('00000000-0000-0000-0000-000000000000');
```

- Test Edge Function via curl (replace placeholders):

```bash
curl -X POST \
  -H "Authorization: Bearer $CLOSE_EXPIRED_AUCTIONS_SECRET" \
  -H "Content-Type: application/json" \
  "https://$PROJECT_REF.functions.supabase.co/close-expired-auctions"
```

- Optional: enforce email domain restriction by attaching `validate_new_user_email` as a trigger (if desired):

```sql
drop trigger if exists validate_new_user_email_before_insert on auth.users;
create trigger validate_new_user_email_before_insert
before insert on auth.users
for each row execute function public.validate_new_user_email();
```


## 9) Gaps and recommendations

- `user_notifications` is referenced in the app but not defined in migrations here. If it exists remotely, pull it into migrations; if not, create it and add policies.
- Storage buckets `listing-images` and `avatars` are referenced; ensure they exist and apply appropriate storage policies.
- The `validate_new_user_email` function is defined but not attached to a trigger in these migrations. Attach if you intend to enforce the domain/whitelist.
- Automated closing schedule for auctions is not configured; either set up `pg_cron` to call the Edge Function URL or use Supabase Scheduler.

— End of guide —


