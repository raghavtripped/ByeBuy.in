# ByeBuy.in — Comprehensive Problems Audit
**Date:** 2026-02-26
**Audited by:** Claude Code (full codebase + Supabase schema review)

---

## Root Cause: Why Pages Get "Stuck" (Require Full Browser Data Clear)

The freeze/stuck behaviour is caused by **four compounding failure modes**, not one:

1. **Auth init can hang forever** — if `getSession()` fails (network blip, Supabase hiccup), the loading flag is never cleared, so the app renders a spinner forever.
2. **Orphaned realtime subscriptions accumulate** — channels are not always unsubscribed on unmount, so after navigating between pages a few times, many background listeners pile up, consuming memory and causing the tab to degrade.
3. **Race conditions in initialisation** — auth + watchlist init can fire simultaneously, leaving state partially set.
4. **localStorage corruption** — theme and potentially other values are written without safety checks, and corrupted values persist until a full browser wipe.

---

## CRITICAL BUGS (cause infinite loading / frozen UI)

### C-1 · `src/hooks/useAuth.ts` · Lines 11–14
**Missing `.catch()` on `getSession()`**

```typescript
supabase.auth.getSession().then(({ data: { session } }) => {
  setUser(session?.user ?? null);
  setLoading(false);
  // ← NO .catch() here
});
```

If `getSession()` rejects (network timeout, 5xx from Supabase), `setLoading(false)` is never called. Every component that depends on `useAuth` stays in a loading state forever. The only escape is a full page reload — which may still fail if the network stays down — or a browser data clear that resets state.

**Impact:** Any brief Supabase outage or slow network permanently locks the app on the loading spinner until the user wipes browser data.

---

### C-2 · `src/components/Navbar.tsx` · Lines 128–135
**`getSession()` failure leaves Navbar loading forever**

```typescript
supabase.auth.getSession().then(async ({ data: { session } }) => {
  const initialUser = session?.user ?? null;
  setUser(initialUser);
  if (initialUser) await fetchUserProfile(initialUser.id);
  setLoading(false);
  // ← NO .catch(), setLoading(false) never runs on failure
});
```

Same class of bug as C-1 but in the Navbar specifically. If `getSession()` throws, Navbar shows skeleton loaders forever, blocking all navigation.

---

### C-3 · `src/stores/watchlistStore.ts` · Lines 209–218
**Orphaned realtime channel on initialization error**

```typescript
catch (error) {
  set({
    error: errorMessage,
    isLoading: false,
    hasFetchedInitialWatchlist: true,
    currentUserId: null,
    realtimeSubscription: null  // ← reference cleared but channel not unsubscribed
  });
}
```

The `channel` object is created at line ~190 and `subscribe()` called on it. If an error occurs after that point, the `catch` block sets `realtimeSubscription: null` in the store — but never calls `supabase.removeChannel(channel)`. The channel keeps running in the background, listening for events and calling handlers on a store that considers itself uninitialised.

On subsequent initialisation attempts, a new channel is created, so over time multiple orphaned channels accumulate.

**Impact:** Memory grows indefinitely with each failed watchlist init. Realtime handlers fire against stale closures, potentially corrupting state.

---

### C-4 · `src/components/WatchlistButton.tsx` · Lines 37–73
**`isLoading` never reset on unique constraint error**

```typescript
setIsLoading(true);
// ...
if (error?.code === '23505') {
  // Keep the optimistic update
  return;  // ← returns without setIsLoading(false)
}
```

When a PostgreSQL unique violation (23505) occurs (user already has item in watchlist), the function returns early. `isLoading` stays `true`. The Watchlist button is permanently disabled until page reload.

---

## HIGH-SEVERITY BUGS (data loss / silent failure / memory leak)

### H-1 · `src/app/listings/page.tsx` · Lines 261–268
**Realtime channel not removed if `removeChannel` fails**

```typescript
return () => {
  isMounted = false;
  if (channel) {
    supabase.removeChannel(channel)
      .then(() => console.log('Listings RT channel unsubscribed.'))
      .catch(err => console.error('Error removing listings channel:', err));
  }
};
```

If `removeChannel` rejects (network issue), the channel remains active. On the next mount of the listings page, a new channel named `'public-listings-active-page'` is created — but Supabase will now have two channels with the same name, both delivering events to the old and new callbacks simultaneously.

**Impact:** Duplicate realtime events → duplicate state updates → potential for flickering or doubled-up listings appearing.

---

### H-2 · `src/app/listings/(detail)/[id]/page.tsx` · Lines 170–172
**Realtime channels orphaned on subscription error**

```typescript
bidsChannel.subscribe((s, e) => {
  if (s === 'CHANNEL_ERROR') console.error('Bids RT Error:', e);
  // ← no cleanup triggered on error
});
listingChannel.subscribe((s, e) => { ... });

return () => {
  supabase.removeChannel(bidsChannel);
  supabase.removeChannel(listingChannel);
};
```

If the user navigates away while channels are in `CHANNEL_ERROR` or `TIMED_OUT` state, the cleanup still calls `removeChannel`, but there's no guarantee a timed-out channel is actually cleaned up server-side. Worse, if the component re-mounts quickly (React Strict Mode double-mount, or fast back-nav), new channels are created before old ones finish teardown.

---

### H-3 · `src/components/Navbar.tsx` · Lines 307–336
**Notification realtime channel can be duplicated on fast user state changes**

```typescript
useEffect(() => {
  let channel: ... = null;
  if (user?.id) {
    fetchUnread(user.id);
    channel = supabase.channel(`noti-${user.id}`)
      .on('postgres_changes', { ... }, () => fetchUnread(user.id))
      .subscribe();
  }
  return () => { if (channel) supabase.removeChannel(channel); };
}, [user]);
```

The cleanup in the return function only removes the channel captured by the _current_ closure. If `user` changes quickly (sign in/out race during session restore), the channel from the previous render may not be fully unsubscribed before the new one is set up.

---

### H-4 · `src/app/notifications/page.tsx` · Lines 40–48
**`user_notifications` table may not exist (missing migration)**

```typescript
const { data, error } = await supabase
  .from('user_notifications')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

The `user_notifications` table is referenced throughout the app (Navbar unread count, full notifications page) but is **not defined in any migration file**. If it doesn't exist in the live DB, every query returns an error that is silently swallowed, the notification badge never appears, and the notifications page shows an empty state with no user-facing error.

---

### H-5 · `src/app/listings/(detail)/[id]/page.tsx` · Line ~147
**Querying `users` table that doesn't exist in PostgREST**

```typescript
const { data: WUserData } = await supabase
  .from('users')
  .select('email')
  .eq('id', fetchedListingData.winning_bidder_id)
  .single();
```

There is no `public.users` table. Auth users live in `auth.users`, which is not accessible via PostgREST/the anon key. This query will always fail (PostgREST 404/406), `WUserData` will always be `null`, and the winner's email is never displayed on closed auctions.

---

### H-6 · `src/app/listings/(detail)/[id]/page.tsx` · Line ~184
**Countdown timer `useEffect` depends on `loadData` — which changes every render**

```typescript
useEffect(() => {
  // sets up setInterval for countdown
}, [listing?.end_time, listing?.status, auctionEnded, loadData, id]);
```

`loadData` is defined as a `useCallback` inside the component. If its own dependencies change (which they do when bids arrive via realtime), `loadData` gets a new reference, triggering this effect, clearing the existing interval, and creating a new one. This can happen multiple times per second during active bidding.

**Impact:** Countdown timer flickers, unnecessary CPU usage, and can interfere with bid UI during active auctions.

---

### H-7 · `src/components/AuthWatchlistManager.tsx` · Lines 16–64
**Race condition: `initializeAuth` and `onAuthStateChange` both call `initializeWatchlist`**

```typescript
const initializeAuth = async () => {
  if (initializationAttempted.current) return;
  initializationAttempted.current = true;
  // ...
  if (session?.user) await initializeWatchlist(session.user.id);
};

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    await initializeWatchlist(session.user.id);  // ← can fire at same time
  }
});
```

On initial load, Supabase typically fires both `getSession()` (used inside `initializeAuth`) and an `INITIAL_SESSION` or `SIGNED_IN` event from `onAuthStateChange`. Both paths can invoke `initializeWatchlist()` with the same user ID nearly simultaneously. The watchlist store's own guard (`hasFetchedInitialWatchlist`) may not be set yet by the first call when the second starts.

---

## MEDIUM-SEVERITY BUGS (degraded UX, stale data)

### M-1 · `src/components/Navbar.tsx` · Line ~195
**Stale closure in click-outside handler**

```typescript
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    // references isMobileMenuOpen AND isUserMenuOpen
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [isMobileMenuOpen]);  // ← missing isUserMenuOpen in deps
```

The handler captures `isUserMenuOpen` at the time the effect runs, but the effect only re-runs when `isMobileMenuOpen` changes. If the user menu opens without the mobile menu changing, the click-outside handler has a stale `isUserMenuOpen = false` and won't close the user menu.

---

### M-2 · `src/app/listings/page.tsx` · Lines 206–244
**`setupRealtimeSubscription` doesn't check `isMounted` at subscribe time**

```typescript
const setupRealtimeSubscription = async () => {
  channel = supabase.channel('public-listings-active-page');
  channel.on('postgres_changes', { ... }, async (payload) => {
    if (isMounted) {  // ← isMounted checked inside callback — good
      await fetchListings(...);
    }
  })
  .subscribe((status) => {
    console.log('RT status:', status);
    // ← no isMounted check here; subscribe() is fire-and-forget
  });
};
```

If the component unmounts between the `channel` creation and the `subscribe()` callback firing, the subscription proceeds on an unmounted component. The `isMounted` check inside the event callback is correct, but the subscribe confirmation itself doesn't clean up if unmounted.

---

### M-3 · `src/app/my-listings/page.tsx` · Lines 100–139
**`fetchUserDataAndListings` useCallback has empty dependency array but uses external state**

```typescript
const fetchUserDataAndListings = useCallback(
  async (u: User) => {
    // uses u parameter correctly, but...
    // may close over stale module-level state
  },
  []  // ← empty deps — always the same function reference
);
```

The function is stable (same reference), which is fine for most uses, but if it closes over any module-level state that changes (e.g. Supabase client, router), it will use stale values. If a user logs out and back in quickly, the stale closure could act on the wrong session context.

---

### M-4 · `src/components/Navbar.tsx` · Lines 53–64
**`localStorage.setItem` called without try/catch**

```typescript
const toggleTheme = useCallback(() => {
  setTheme(prevTheme => {
    const newTheme = prevTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);  // ← no try/catch
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    return newTheme;
  });
}, []);
```

If localStorage is full or disabled (private browsing on some browsers), the write throws a `DOMException`. The `setTheme` state updater function runs inside React state management — an unhandled exception here can crash the component tree.

---

### M-5 · `src/app/notifications/page.tsx`
**`markAsRead` doesn't handle errors; no optimistic revert**

```typescript
const markAsRead = async (notificationId: string) => {
  await supabase
    .from('user_notifications')
    .update({ read: true })
    .eq('id', notificationId);
  // ← no error check, no UI revert on failure
};
```

If the update fails, the notification appears read in the UI (optimistic), but on next load it reappears as unread. No error message is shown.

---

### M-6 · Various files
**Silent swallowing of Supabase errors throughout the codebase**

Pattern seen repeatedly:
```typescript
const { data, error } = await supabase.from('...').select('...');
if (!error && data) {
  setSomeState(data);
}
// error is never logged, no user feedback
```

Files where this occurs (non-exhaustive):
- `src/app/notifications/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/my-listings/page.tsx`
- `src/app/listings/(detail)/[id]/page.tsx`

**Impact:** When Supabase returns an error (wrong RLS, missing table, network issue), the page silently shows empty state. Users think the app is "stuck" or broken with no way to know why.

---

## LOW-SEVERITY / CODE QUALITY ISSUES

### L-1 · `src/app/listings/(detail)/[id]/page.tsx` · Line ~228
**Bid confirmation doesn't await realtime update before re-enabling form**

After placing a bid, the form is cleared and success shown, but the highest-bid display won't update until the realtime `INSERT` event fires. A user could misread this as the bid failing and try to place it again.

---

### L-2 · `supabase/functions/close-expired-auctions/index.ts`
**CORS is open (`*`) — should be restricted for production**

```typescript
// cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // ...
};
```

The edge function accepting requests from any origin. In production, this should be restricted to the Supabase scheduler or known IPs.

---

### L-3 · `supabase/migrations`
**`validate_new_user_email()` function defined but never attached to a trigger**

The function exists in `20250523150624_remote_schema.sql` but there's no `CREATE TRIGGER` statement connecting it to `auth.users`. If email domain restriction is intended, it is silently not enforced.

---

### L-4 · `supabase/config.toml`
**Auction auto-close not scheduled**

The edge function `close-expired-auctions` has no pg_cron or Supabase scheduler entry in any migration. Auctions past their `end_time` are never automatically closed — this must be called manually or via an external cron job.

---

### L-5 · `src/lib/supabaseClient.ts`
**Single shared Supabase client with no session isolation between tabs**

Multiple browser tabs share the same localStorage session. If one tab logs out, the session in localStorage is cleared, and all other tabs will fail their next auth-dependent request — potentially getting stuck on loading states (see C-1, C-2) rather than redirecting to login.

---

### L-6 · `src/components/Navbar.tsx` · Lines 38–50
**Theme reads `localStorage` on mount without SSR guard**

```typescript
useEffect(() => {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  // ...
}, []);
```

This is inside a `useEffect` so it's client-only, which is correct. However, there's no fallback if localStorage throws (private mode on some browsers), and no handling if the stored value is something other than `'light'` or `'dark'` (type-cast `as 'light' | 'dark' | null` doesn't validate at runtime).

---

## Data Model Gaps (Code vs. Supabase Schema)

| Reference in Code | Live DB Status | Impact |
|---|---|---|
| `user_notifications` table | **CONFIRMED MISSING** (live DB verified) | Notification system entirely broken |
| `public.users` table | **CONFIRMED MISSING** (only `auth.users` exists) | Winner email never shown on closed auctions |
| `push_subscriptions` table | **EXISTS in live DB, NOT in migrations** | Schema drift; breaks on fresh deploy |
| `get_public_seller_profile()` function | **EXISTS in live DB, NOT in migrations** | Schema drift |
| `listing_chats_with_sender_email` view | Defined in migration ✓ | OK |
| `listings_with_highest_bid` view | EXISTS with `bid_count` ✓ | OK — earlier note that `bid_count` was missing was **incorrect** |
| `finalize_auction_outcome()` RPC | Defined in migration ✓ | OK |
| `close_auction()` RPC (two overloads) | Defined in migration ✓ | OK |
| Storage buckets `listing-images`, `avatars` | **Created manually, not in migrations** | Will break in fresh deploy |
| `email-domain-validation` edge function | **EXISTS in live, NOT in local code** | Schema drift; can't redeploy |
| `send-test-notification` edge function | **EXISTS in live, NOT in local code** | Schema drift; can't redeploy |

---

## LIVE BACKEND AUDIT (Supabase — verified 2026-02-26)

> All findings below are confirmed against the live project `efkggsqrpmilxfmszdlz` via the Supabase Management API.

### B-1 · CRITICAL — Cron Job Sending Wrong Auth Token

**pg_cron job "Close Expired Auctions"** (runs every 30 min):
```sql
SELECT net.http_post(
    url:='https://efkggsqrpmilxfmszdlz.supabase.co/functions/v1/close-expired-auctions',
    headers:=jsonb_build_object('Authorization', 'Bearer Ragwl/@123@new'),
    timeout_milliseconds:=1000
);
```

The edge function validates `authHeader !== 'Bearer ' + CLOSE_EXPIRED_AUCTIONS_SECRET` and returns **401** on mismatch. The cron job sends `Ragwl/@123@new` — this looks like an old hardcoded password, not the actual secret stored in the function's environment variables. **Every cron invocation is almost certainly returning 401, meaning expired auctions are never auto-closed.**

Additionally, `timeout_milliseconds:=1000` (1 second) is insufficient — if Supabase has any latency, the HTTP call times out before the function completes any work.

---

### B-2 · CRITICAL — `listing-images` Bucket: No User Ownership Check on Upload

Storage policy `allow_uploads`:
```sql
-- with_check:
(bucket_id = 'listing-images') AND (auth.role() = 'authenticated')
```

Any authenticated user can upload to **any path** in the `listing-images` bucket, including `{another_user_id}/...`. There is no `storage.foldername(name)[1] = auth.uid()::text` check (unlike the `avatars` bucket which has this correctly). An authenticated user can overwrite or pollute another user's listing images by uploading to their folder path.

Additionally, there is **no DELETE policy** on `listing-images`. Sellers cannot delete their own listing photos, and the bucket has **no file size limit** (`file_size_limit: null`). Users can upload files of any size, potentially filling the storage bucket.

---

### B-3 · HIGH — Duplicate and Conflicting RLS Policies on `profiles`

The `profiles` table has 7 policies, several of which conflict or are duplicated:

**SELECT policies (two, both for `authenticated`):**
- `"Authenticated users can view other user profiles for contact"` — `USING: true` (all rows visible)
- `"Users can read their own profile only"` — `USING: auth.uid() = id` (own row only)

With PERMISSIVE policies, these are OR'd together. The effective result is any authenticated user can see **all** profiles (the first policy makes the second redundant). But the naming implies the intent was to restrict access, which is not what's happening.

**UPDATE policies (three total — two are identical duplicates):**
- `"Enable users to update their own profile"` — role: `authenticated`, `auth.uid() = id`
- `"Users can update their own profile"` — role: `public`, `auth.uid() = id`
- `"Users can update their own profile data"` — role: `public`, `auth.uid() = id` (identical to above)

The two `public`-role UPDATE policies are identical duplicates. Multiple conflicting policies on the same table create confusion and risk of unintended access if any are accidentally dropped or modified.

---

### B-4 · HIGH — `validate_new_user_email` Function Is a Dead Letter

The migration creates `validate_new_user_email()` with a Gmail developer whitelist. However, the **live trigger** `before_user_insert_validate_email` is attached to a **different function**: `validate_user_email_domain()`.

`validate_user_email_domain` does NOT have the Gmail whitelist — it blocks ALL non-`@iimidr.ac.in` emails with no exceptions. The migration's `validate_new_user_email` function is deployed but never called by any trigger. It is dead code on the live DB.

Implication: developer accounts using Gmail addresses cannot be used to sign up new sessions. If the developer accounts `raghavtripathi2408@gmail.com` / `raghavtripathi2203@gmail.com` need to be re-invited or re-onboarded, they will be blocked.

---

### B-5 · HIGH — `listings_with_seller_email` View Missing `tags` Column

The live view definition for `listings_with_seller_email` does NOT include the `tags` column:

```sql
SELECT l.id, l.title, l.description, l.min_price, l.photos, l.seller_id,
       l.end_time, l.created_at, l.upper_cap, l.rules, l.status,
       l.winning_bid_id, l.winning_bidder_id, u.email AS seller_email
-- NO l.tags
```

The listing detail page (`listings/(detail)/[id]/page.tsx`) fetches from `listings_with_seller_email` to display a listing. Any code that tries to read `listing.tags` from this view will get `undefined`. Tags are used for display and search — they will be missing on the listing detail page for active/open auctions.

---

### B-6 · MEDIUM — `push_subscriptions` Table Exists But Notification Pipeline Is Incomplete

**Live data:** 141 users have a `push_subscriptions` row (one per user due to `UNIQUE(user_id)` constraint). The `send-test-notification` edge function exists on the live server. Yet the `user_notifications` table (where notification records would be stored) is completely absent.

The push subscription system is half-implemented: user browsers are registered for push, but there is no backend mechanism to:
- Create notification records in the database
- Trigger the `send-test-notification` / notification-delivery edge function when auction events occur (bid placed, auction closed, etc.)

The `user_notifications` table, the notification creation triggers/functions, and the delivery logic are all missing. The entire notification pipeline exists only as infrastructure stubs.

---

### B-7 · MEDIUM — `get_public_seller_profile` Function Not in Migrations

The live DB has a `get_public_seller_profile(profile_id_to_fetch uuid)` SECURITY DEFINER function that correctly bypasses RLS to expose seller profile data to unauthenticated users. This was likely added to fix the issue where the seller profile page fails for unauthenticated visitors (see security concern #9 in the original audit).

However, this function is not in any migration file. If the local migrations are run (e.g., `supabase db reset`), this function will not exist, breaking the public seller profile page.

---

### B-8 · MEDIUM — `avatars` Bucket Has Duplicate UPDATE Policies

Two identical UPDATE policies exist on the `avatars` bucket:
- `"Authenticated users can manage their own avatar"` — `(bucket_id = 'avatars') AND (owner = auth.uid())`
- `"Authenticated users can update their own avatar"` — `(bucket_id = 'avatars') AND (owner = auth.uid())`

These are functionally identical. One is a leftover from a policy rename operation. While harmless in practice (both allow the same UPDATE), duplicate policies are confusing and should be cleaned up.

---

### B-9 · LOW — `push_subscriptions` UNIQUE Constraint on `user_id`

```sql
CREATE UNIQUE INDEX push_subscriptions_user_id_key ON push_subscriptions USING btree (user_id);
```

One push subscription per user. If a user registers on a second device (phone + laptop), the second registration will either fail (if the app doesn't handle the unique conflict) or overwrite the first, meaning push notifications only reach the most recently registered device.

---

### B-10 · LOW — Two Edge Functions Exist in Production But Not Locally

- `email-domain-validation` (ACTIVE, verify_jwt: true) — deployed but not in the local `supabase/functions/` directory
- `send-test-notification` (ACTIVE, verify_jwt: false) — deployed but not in the local `supabase/functions/` directory

These functions cannot be updated, version-controlled, or redeployed from the current codebase. Any changes must be made directly in the Supabase dashboard.

---

### B-11 · INFO — App Scale (Live Data as of 2026-02-26)

| Table | Row Count |
|---|---|
| `profiles` | 141 |
| `push_subscriptions` | 141 (1:1 with profiles — every user has a push sub) |
| `listings` | 27 |
| `bids` | 3 |
| `listing_chats` | 0 |
| `watched_listings` | 2 |

---

### Corrections to Earlier Analysis

- **`bid_count` in `listings_with_highest_bid`** — The earlier static analysis incorrectly stated this column was missing. **Live DB confirmed:** the view does compute and expose `bid_count` via a correlated subquery. The "Most Bids" sort IS functional.
- **`validate_new_user_email` trigger** — Corrected: the trigger `before_user_insert_validate_email` is attached to `validate_user_email_domain`, not `validate_new_user_email`. The latter is a dead function.

---

## Priority Fix Order (Updated)

### Immediate / Blocking

1. **B-1** — Fix the cron job auth token: update the pg_cron job to use the correct `CLOSE_EXPIRED_AUCTIONS_SECRET` value, and increase `timeout_milliseconds` to at least 10000.
2. **C-1, C-2** — Add `.catch()` to all `getSession()` calls; always call `setLoading(false)` in catch.
3. **C-3** — In watchlist store catch block, call `supabase.removeChannel(channel)` before clearing the reference.
4. **C-4** — In `WatchlistButton`, call `setIsLoading(false)` on all early returns.

### High Priority / Broken Features

5. **H-4 + B-6** — Either create the `user_notifications` table (migration) and wire up the full notification pipeline, or remove all frontend notification references.
6. **H-5** — Replace `supabase.from('users')` with a query via `profiles` or `get_public_seller_profile` RPC.
7. **B-5** — Add `tags` column to the `listings_with_seller_email` view so listing detail pages show tags.
8. **B-2** — Fix the `listing-images` INSERT policy to enforce user path ownership; add a DELETE policy; set a reasonable file size limit.

### Medium Priority / Security & Stability

9. **B-3** — Consolidate the 7 `profiles` RLS policies into 3 clear, intentional ones (decide: should all authenticated users see all profiles, or only their own?).
10. **B-4** — Either attach `validate_new_user_email` (with Gmail whitelist) to the trigger, or accept `validate_user_email_domain` (no whitelist) and remove the dead function.
11. **H-1, H-2, H-3** — Audit every realtime channel setup; ensure cleanup is unconditional.
12. **H-6** — Move `loadData` out of `useEffect` dependencies for the countdown, or use a ref.
13. **H-7** — Add a flag to the watchlist store preventing concurrent init calls.

### Low Priority / Hygiene

14. **B-7, B-10** — Capture `get_public_seller_profile`, `email-domain-validation`, `send-test-notification`, and `push_subscriptions` in migrations/local code.
15. **B-8** — Remove duplicate `avatars` UPDATE storage policy.
16. **M-1 through M-6** — Fix missing deps, add error surfaces, wrap localStorage in try/catch.
17. **L-2** — Restrict CORS on `close-expired-auctions` edge function.

---
