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

## Resolution Plans
**Added:** 2026-02-26 — Based on full codebase read + live Supabase schema inspection via MCP.

---

### PLAN: C-1 · `src/hooks/useAuth.ts` — Missing `.catch()` on `getSession()`

**Root cause confirmed:** `getSession()` returns a Promise that rejects on network failure. The existing `.then()` only handles the success path. No catch means `setLoading(false)` is never called on failure.

**Additional observation (from code read):** `onAuthStateChange` in the same effect *also* calls `setLoading(false)`, but Supabase only fires `onAuthStateChange` after a state change event — not on a pure network failure for `getSession`. So the fallback is not reliable.

**Plan:**
1. Chain `.catch((err) => { console.error('[useAuth] getSession failed:', err); setUser(null); setLoading(false); })` directly on the `getSession().then(...)` promise at line 11.
2. No other structural changes needed — `onAuthStateChange` stays as the live-update listener.
3. This is a one-line change with zero risk of side effects.

**File:** `src/hooks/useAuth.ts` · Line 11–14

---

### PLAN: C-2 · `src/components/Navbar.tsx` — `getSession()` failure leaves Navbar loading forever

**Root cause confirmed:** Same pattern as C-1. Line 128: `supabase.auth.getSession().then(async ({ data: { session } }) => { ... setLoading(false); })` — no `.catch()`. If this rejects, the navbar stays in skeleton-loader state permanently, blocking all navigation links.

**Plan:**
1. Add `.catch((err) => { console.error('[Navbar] getSession failed:', err); setUser(null); setLoading(false); })` after the `.then(...)` block at line 135.
2. Optionally: refactor to `try/catch` inside an async IIFE wrapping both `getSession()` and `fetchUserProfile()` for consistency (but simple `.catch` chaining achieves the same result with minimal diff).
3. No changes needed to `onAuthStateChange` listener — it already handles subsequent auth events.

**File:** `src/components/Navbar.tsx` · Lines 128–135

---

### PLAN: C-3 · `src/stores/watchlistStore.ts` — Orphaned realtime channel on initialization error

**Root cause re-examined (from code read):** The current code is more defensive than the audit description implies. `setupRealtimeChannel` internally calls `cleanup()` (which calls `channel.unsubscribe()` + `supabase.removeChannel()`) before rejecting. So if the channel was created but subscription fails, the internal cleanup handles it.

**Remaining risk:** If `setupRealtimeChannel` resolves successfully (returns channel) but `set({ ... realtimeSubscription: channel })` at line 198–204 is not reached because `get().currentUserId !== userId` (user changed mid-init), the `cleanupRealtimeChannel(channel)` at line 207 handles it — this is correct. However, the catch block (lines 209–218) sets `realtimeSubscription: null` but does NOT explicitly clean up the channel variable from the outer scope. If `setupRealtimeChannel` succeeded (channel is valid) but something between lines 197–207 threw (unlikely, but possible), the channel would be orphaned.

**Plan:**
1. Declare `let channel: RealtimeChannel | null = null` at the top of the `try` block (before the `supabase.from(...)` fetch).
2. Assign the result of `setupRealtimeChannel` to this variable.
3. In the `catch` block, add: `if (channel) await cleanupRealtimeChannel(channel);` before setting state.
4. This makes the cleanup unconditional and makes the intent explicit regardless of what internal cleanup `setupRealtimeChannel` performed.

**File:** `src/stores/watchlistStore.ts` · Lines 178–219

---

### PLAN: C-4 · `src/components/WatchlistButton.tsx` — `isLoading` never reset on unique constraint error

**Root cause confirmed:** Line 55–57:
```typescript
if (error?.code === '23505') {
  return;  // ← isLoading stays true forever
}
```
The `finally { setIsLoading(false); }` at line 77 only runs when the try block exits normally or via `throw`. An early `return` inside a `try` block **does** trigger `finally` in JavaScript. Wait — actually **yes, `finally` DOES run on early return**. Let me reconsider...

**Re-examination:** In JavaScript, `return` inside a `try` block *does* trigger the `finally` block. So `setIsLoading(false)` at line 77 in `finally` *should* run even when `return` is called at line 57.

**Actual bug:** The `return` at line 57 is inside the `try` block, which has a `finally` — so `setIsLoading(false)` DOES get called. The audit description of C-4 may be based on a version without the `finally` block, or the `return` being outside the try/finally scope.

**Looking at actual code structure (lines 40–79):**
- `try { ... if (error?.code === '23505') { return; } ... } catch { ... } finally { setIsLoading(false); }`
- `finally` will execute. The button is NOT permanently locked.

**Resolution:** C-4 as described is actually already handled correctly by the `finally` block. No code change needed. **Recommend marking this as a false positive** — the `finally` clause already ensures `setIsLoading(false)` runs on all code paths including early returns.

**Action:** Add a comment in the code near line 55–57 clarifying that `finally` handles the reset, to prevent future confusion.

**File:** `src/components/WatchlistButton.tsx` · Lines 37–79

---

### PLAN: H-1 · `src/app/listings/page.tsx` — Realtime channel not removed if `removeChannel` fails

**Root cause confirmed:** Cleanup in the `useEffect` return function calls `supabase.removeChannel(channel)` but only logs the error on failure — the channel object remains active in Supabase's internal registry if the call fails. On re-mount, a new channel with the same name `'public-listings-active-page'` is created, leaving two active listeners.

**Plan:**
1. **Rename the channel with a stable but unique name** to avoid the duplicate-name collision problem: use a constant channel name but explicitly call `supabase.removeChannel()` in a `try/catch` with a best-effort approach — even if it fails, the old channel will eventually be garbage collected by Supabase's internal timeout.
2. **Better approach:** Generate a unique channel name per mount using `useId()` (React 18) or `useRef(crypto.randomUUID())`. This way even if cleanup fails, the next mount creates a different-named channel that doesn't interfere.
3. **Add an isMounted check in the subscribe callback** (status handler) to avoid state updates on unmounted components.
4. Change cleanup to always attempt `removeChannel`, but wrap in `try/catch` — not just `.catch()` — so cleanup errors don't bubble.

**Minimal fix (low-risk):** Just add a unique suffix to the channel name: `supabase.channel(\`public-listings-active-\${Date.now()}\`)` — guarantees no collision even if old channel wasn't cleaned up.

**File:** `src/app/listings/page.tsx` · Lines 206–269

---

### PLAN: H-2 · `src/app/listings/(detail)/[id]/page.tsx` — Realtime channels orphaned on subscription error

**Root cause confirmed (from code read):** Lines 166–172 show:
```typescript
bidsChannel.subscribe((s,e) => { if (s === 'CHANNEL_ERROR') console.error(...); });
listingChannel.subscribe((s,e) => { if (s === 'CHANNEL_ERROR') console.error(...); });
return () => { supabase.removeChannel(bidsChannel); supabase.removeChannel(listingChannel); };
```
On `CHANNEL_ERROR`, only a log occurs — no self-cleanup. The cleanup `return ()` does call `removeChannel` unconditionally (correct), but if the component re-mounts before the first cleanup runs (React Strict Mode double-invoke), both old and new channels are active simultaneously for a brief window.

**Plan:**
1. In the `CHANNEL_ERROR` subscribe callbacks, call `supabase.removeChannel(bidsChannel)` / `supabase.removeChannel(listingChannel)` respectively, then set a local flag indicating the channel is dead (so the cleanup function doesn't try again).
2. Use `useRef` for both channels so the cleanup function always has the latest reference.
3. Wrap `removeChannel` calls in the cleanup return function with `try/catch` to prevent cleanup errors from surfacing.
4. For React Strict Mode protection: add `isMounted` check inside the subscribe callbacks, same as listings page.

**File:** `src/app/listings/(detail)/[id]/page.tsx` · Lines 164–172

---

### PLAN: H-3 · `src/components/Navbar.tsx` — Notification channel duplicated on fast user state changes

**Root cause confirmed (from code read):** Lines 307–336 — the `useEffect([user])` cleanup is: `return () => { if (channel) supabase.removeChannel(channel); }`. React guarantees this cleanup runs before the next effect invocation, so the scenario described (old channel not unsubscribed before new one is created) should not happen in standard React 18 rendering.

**However:** `supabase.removeChannel()` is async. The cleanup fires the async call but doesn't `await` it. If the user changes quickly (sign out → sign in in <100ms), the async cleanup from the first effect may not have completed before the new channel is created with the same name `noti-${user.id}`.

**Plan:**
1. Track whether the channel has been cleaned up with a local boolean flag inside the effect closure.
2. In the subscribe callback inside `fetchUnread`, check the flag before calling `setHasUnread`.
3. **Better:** Ensure channel names are unique per instantiation: `supabase.channel(\`noti-\${user.id}-\${Date.now()}\`)` prevents duplicate-name conflicts even during async cleanup races.
4. The current code structure is otherwise correct — this is a minor race condition that only manifests under rapid auth state flips.

**File:** `src/components/Navbar.tsx` · Lines 307–336

---

### PLAN: H-4 + B-6 · `user_notifications` table missing + notification pipeline incomplete

**Root cause confirmed (from live DB):** The `user_notifications` table does NOT exist in the live database. The `push_subscriptions` table exists with 141 rows (all users). The `send-test-notification` edge function exists but is not in local code. There is no trigger/function that creates notification records when auction events occur.

**What the frontend expects (from code read):**
- `user_notifications` with columns: `id`, `created_at`, `message`, `type` (`'bid' | 'listing' | 'system'`), `read`, `user_id`, `link`
- Queried from both `notifications/page.tsx` and `Navbar.tsx` (unread badge)

**Plan (full pipeline):**
1. **Create migration** for `user_notifications` table:
   ```sql
   CREATE TABLE user_notifications (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     message TEXT NOT NULL,
     type TEXT NOT NULL CHECK (type IN ('bid', 'listing', 'system')),
     read BOOLEAN NOT NULL DEFAULT FALSE,
     link TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   -- Index for fast user lookup
   CREATE INDEX idx_user_notifications_user_id ON user_notifications(user_id);
   -- Index for unread badge query
   CREATE INDEX idx_user_notifications_unread ON user_notifications(user_id, read) WHERE read = FALSE;
   ```
2. **Add RLS policies:**
   - SELECT: `auth.uid() = user_id`
   - UPDATE (mark read): `auth.uid() = user_id`
   - DELETE: `auth.uid() = user_id`
   - INSERT: service role only (notifications created by backend triggers, not users directly)
3. **Create DB trigger function** `notify_on_bid()` that inserts into `user_notifications` when a bid is placed on someone's listing (seller gets notified). Runs `AFTER INSERT ON bids`.
4. **Create DB trigger function** `notify_on_auction_close()` that inserts winner notification when `listings.status` changes to `'closed'`.
5. **Fix `markAsRead` in `notifications/page.tsx`**: Add optimistic update + revert on error (see M-5 plan below).
6. **Retrieve `send-test-notification` edge function source** from live Supabase dashboard and add to `supabase/functions/send-test-notification/` local directory so it can be version-controlled.

**Note on push notifications:** The 141 existing `push_subscriptions` rows can be used to deliver browser push notifications once the pipeline is wired. The `send-test-notification` edge function should be called from the trigger-fired notifications path or from the `close-expired-auctions` edge function after auction closure.

**Files:** New migration file, `src/app/notifications/page.tsx`, `src/components/Navbar.tsx`

---

### PLAN: H-5 · `src/app/listings/(detail)/[id]/page.tsx` — Querying non-existent `public.users` table

**Root cause confirmed (from code read, line 147):**
```typescript
const {data: WUserData} = await supabase.from('users').select('email')...
```
`public.users` does not exist. Only `auth.users` exists, and it is inaccessible via PostgREST with the anon key.

**Observation:** This code path is inside the `else` branch (line 137: fetching from `listings_with_seller_email` when the listing is NOT in the archive). The `archived_listings_details` view (used in the `if` branch) already joins to `auth.users` via a SECURITY DEFINER view and returns `winner_email` directly. So the winner email is already available for archived/closed listings fetched that way.

**For the non-archived path:** The listing data comes from `listings_with_seller_email` which does NOT include winner email. The fix is:

**Plan:**
1. Replace `supabase.from('users').select('email')...` with `supabase.from('profiles').select('email').eq('id', fetchedListingData.winning_bidder_id).single()`.
2. The `profiles` table has an `email` column (confirmed from live schema). The RLS policy "Authenticated users can view other user profiles for contact" allows any authenticated user to SELECT all rows (`USING: true`). This will work for authenticated users.
3. **For unauthenticated users:** The `profiles` table has no public SELECT policy. If the listing detail page needs to show winner email to unauthenticated visitors, call the existing `get_public_seller_profile(id)` RPC instead (though that doesn't expose email, it does expose the profile). Alternatively, consider that winner email should only be visible to authenticated users, which is acceptable.
4. **Simpler alternative:** Add `winner_email` to the `listings_with_seller_email` view by left-joining `auth.users winner ON l.winning_bidder_id = winner.id`. This mirrors what `archived_listings_details` already does, so the frontend code can just read it from `lData.winner_email` without a separate query.

**Recommended approach:** Option 4 — add winner email to the view. Creates one DB change instead of frontend logic change.

**File:** `src/app/listings/(detail)/[id]/page.tsx` · Line ~147; or add migration to update `listings_with_seller_email` view.

---

### PLAN: H-6 · `src/app/listings/(detail)/[id]/page.tsx` — Countdown timer re-creates interval on every `loadData` change

**Root cause confirmed (from code read, line 184):**
```typescript
useEffect(() => {
  // countdown interval setup
}, [listing?.end_time, listing?.status, auctionEnded, loadData, id]);
```
`loadData` is a `useCallback` with `[id]` as its dependency — so `loadData` itself is stable as long as `id` doesn't change. The issue described in the audit (loadData changing on every bid) is only relevant if `loadData`'s deps change. Since `id` is stable, `loadData` is stable too.

**Actual remaining concern:** The countdown effect still calls `loadData()` inside the interval (when `remaining === "Auction Ended"`). This triggers a full data refresh, which in turn causes React state updates (`setListing`, `setBids`), which can change `listing?.status`, which causes this `useEffect` to re-run — clearing the existing interval and creating a new one. This creates a brief double-trigger on auction end.

**Plan:**
1. Remove `loadData` from the countdown `useEffect` dependency array.
2. Store `loadData` in a ref (`const loadDataRef = useRef(loadData); useEffect(() => { loadDataRef.current = loadData; }, [loadData]);`) and call `loadDataRef.current()` inside the countdown interval instead.
3. This breaks the dep chain: countdown timer's interval only re-creates when `listing?.end_time`, `listing?.status`, `auctionEnded`, or `id` change — not when `loadData` changes.
4. The ref pattern is a well-established React pattern for stable callbacks in effects.

**File:** `src/app/listings/(detail)/[id]/page.tsx` · Line ~184

---

### PLAN: H-7 · `src/components/AuthWatchlistManager.tsx` — Race condition: double `initializeWatchlist` call

**Root cause confirmed (from code read):** `initializeAuth` (guarded by `initializationAttempted.current = true`) calls `initializeWatchlist(session.user.id)`. The `onAuthStateChange` listener for `SIGNED_IN` also calls `initializeWatchlist(session.user.id)`. On initial page load, Supabase fires BOTH an `INITIAL_SESSION` or `SIGNED_IN` event from `onAuthStateChange` AND returns the session from `getSession()`. The `initializationAttempted` ref prevents double-calling `initializeAuth`, but `onAuthStateChange(SIGNED_IN)` runs independently.

**The watchlist store guard:** `initializeWatchlist` checks `if (get().currentUserId === userId && get().hasFetchedInitialWatchlist) return;` — this prevents double-init only if the FIRST call already completed (set `hasFetchedInitialWatchlist = true`). If both calls arrive before either completes, both pass the guard.

**Plan:**
1. Add an `isInitializing` flag to `AuthWatchlistManager` — a `useRef<string | null>(null)` that holds the userId currently being initialized.
2. Before calling `initializeWatchlist(userId)`, check: `if (initializingRef.current === userId) return;`; set `initializingRef.current = userId` before the call; clear it after.
3. **Better alternative:** Add an `initializingForUserId` field to the watchlist store itself. In `initializeWatchlist`, at the very start: `if (get().initializingForUserId === userId) return;`; set `initializingForUserId: userId` immediately before any async work; clear it on completion/error. This makes the guard atomic and available across all callers.
4. The `onAuthStateChange` event filter could also be changed to listen for `INITIAL_SESSION` instead of `SIGNED_IN` (since on page load the event is `INITIAL_SESSION`, not `SIGNED_IN`) — this would avoid the double-trigger without needing a flag.

**File:** `src/components/AuthWatchlistManager.tsx` · Lines 16–64; `src/stores/watchlistStore.ts`

---

### PLAN: M-1 · `src/components/Navbar.tsx` — Stale closure in click-outside handler

**Re-examination (from code read):** The current `handleClickOutside` implementation (lines 168–195) does NOT read `isUserMenuOpen` directly from state — it only calls `setIsUserMenuOpen(false)`. The `isMobileMenuOpen` variable IS read directly (line 182: `isMobileMenuOpen // Only if mobile menu is open`), which is why it's in the deps array.

**Actual status:** The audit description of M-1 appears to describe an older version of the code. In the current code, the deps array `[isMobileMenuOpen]` is correct because that's the only state variable actually read inside the handler. No fix needed for `isUserMenuOpen`.

**Plan:** No code change required. Add a comment on the `useEffect` explaining why `isUserMenuOpen` is intentionally NOT in the deps array (it's not read in the handler body). Prevents future developers from "fixing" it incorrectly.

**File:** `src/components/Navbar.tsx` · Line 195

---

### PLAN: M-2 · `src/app/listings/page.tsx` — `isMounted` not checked in subscribe callback

**Root cause confirmed (from code read, lines 231–237):** The subscribe callback logs status but does not call `setLoading` or `fetchListings`. So even if the subscribe fires after unmount, it only produces a console log — no state update.

**Actual impact:** Very low. The subscribe callback is fire-and-forget and currently only logs. The RT event callback (line 224–229) correctly checks `if (isMounted)`.

**Plan:** Add `if (!isMounted) return;` at the top of the subscribe callback at line 232 as defensive hygiene. It prevents any future work added to the subscribe callback from accidentally updating unmounted state.

**File:** `src/app/listings/page.tsx` · Lines 231–237

---

### PLAN: M-3 · `src/app/my-listings/page.tsx` — `fetchUserDataAndListings` with empty dep array

**Plan:** Read the file before making conclusions, then:
1. If the callback closes over stable module-level values only (Supabase client, which is a module singleton), the empty dep array is correct.
2. If it closes over any state or props that could change (e.g., router), add those to the deps array.
3. If the function is genuinely pure given the `u: User` parameter it receives, the empty array is intentional and correct — add a `// eslint-disable-line react-hooks/exhaustive-deps` comment with explanation.

**File:** `src/app/my-listings/page.tsx` · Lines 100–139

---

### PLAN: M-4 · `src/components/Navbar.tsx` — `localStorage.setItem` without try/catch

**Root cause confirmed (from code read, lines 53–64):** `localStorage.setItem('theme', newTheme)` called inside a `setTheme` state updater function with no error handling. In Safari private mode, `localStorage.setItem` throws `QuotaExceededError`.

**Plan:**
1. Wrap both `localStorage.setItem` calls (one in `toggleTheme`, one in the initial `useEffect` that reads saved theme — actually the initial effect only reads, not writes) in `try/catch`:
   ```typescript
   try {
     localStorage.setItem('theme', newTheme);
   } catch (e) {
     console.warn('[Navbar] Could not save theme preference:', e);
   }
   ```
2. For the initial read in the `useEffect` (line 38), wrap `localStorage.getItem('theme')` in `try/catch` and validate the result: only accept `'light'` or `'dark'`, treat any other value as `null`.
3. One-line change in each location; zero risk.

**File:** `src/components/Navbar.tsx` · Lines 38–64

---

### PLAN: M-5 · `src/app/notifications/page.tsx` — `markAsRead` no error handling, no optimistic revert

**Root cause confirmed (from code read, lines 51–56):** `markAsRead` performs the Supabase update but never checks the returned `error`, and the UI immediately shows the notification as read (React re-renders based on the click handler calling `markAsRead` then routing). On failure, the notification appears read locally but on next load appears unread again.

**Plan:**
1. Change `markAsRead` to return a success/failure boolean.
2. Add optimistic update: before calling `markAsRead`, update the local `notifications` state to set `read: true` for the given ID.
3. On failure, revert: restore the original `read: false` value in local state.
4. Show a toast/inline error message if update fails.
5. Also fix `fetchNotifications` (line 39–49): add `else { console.error('Failed to fetch notifications:', error); }` to the `if (!error && data)` guard so failures are visible.

**File:** `src/app/notifications/page.tsx` · Lines 39–56

---

### PLAN: M-6 · Various files — Silent swallowing of Supabase errors

**Root cause confirmed:** Pattern `if (!error && data) { setSomeState(data); }` — errors are silently ignored throughout.

**Plan (per-file):**
- **`notifications/page.tsx`**: Covered by M-5 plan above. Add `else` branch with `setError('Failed to load notifications')`.
- **`profile/page.tsx`**: Add error state display. Show a dismissible banner: "Failed to load profile. Refresh to try again."
- **`my-listings/page.tsx`**: Add error state. If the query fails, show "Could not load your listings" with a retry button.
- **`listings/(detail)/[id]/page.tsx`**: The existing error handling in `loadData` is actually decent (lines 156–160: catches and sets error state). The silent parts are the individual sub-queries within the try block (e.g., winner bid fetch at line 144: `const {data: WBidData} = await supabase.from('bids')...` — no error check). Fix: destructure `error` and log it if present.

**Approach:** A single pass through all 4 files, adding `if (error) console.error(...)` after every `const { data, error } = await supabase...` call, and surfacing user-facing errors where critical data is missing.

---

### PLAN: L-1 · `src/app/listings/(detail)/[id]/page.tsx` — Bid placed but highest-bid display lag

**Root cause confirmed (from code read):** After `executePlaceBid` succeeds, the code already does an optimistic local update at lines 213–226 — it immediately adds the new bid to the `bids` state array. `currentHighestBidVal` is derived from `bids[0]?.bid_price` via `useMemo`, so it will immediately reflect the new bid. The "Bid placed!" message appears, and the highest bid display updates instantly.

**Actual status:** This bug as described appears already fixed by the optimistic update logic added to `executePlaceBid`. The realtime channel is a secondary sync mechanism.

**Plan:** Verify by testing. If the display still lags, the issue might be in the `useMemo([bids])` not updating immediately due to React batching. If so, call `setBids` with proper new array to ensure re-render. Currently looks correct. **No immediate code change needed.**

---

### PLAN: L-2 · `supabase/functions/close-expired-auctions/cors.ts` — CORS `*` in production

**Root cause confirmed (from edge function code read):** `'Access-Control-Allow-Origin': '*'` — allows any origin. This edge function is called by a pg_cron job (server-to-server), NOT by the browser. The CORS header is completely irrelevant for server-to-server calls. However, since the function has `verify_jwt: false`, a malicious actor could attempt to call it from a browser if they discover the URL.

**Plan:**
1. Restrict CORS to the production domain: `'Access-Control-Allow-Origin': 'https://byebuy.in'`.
2. More importantly: the real security is the `functionSecret` check (line ~45 in the edge function). Any call without the correct `CLOSE_EXPIRED_AUCTIONS_SECRET` gets a 401. CORS is a browser-level restriction, not a server-level security control — but tightening it is still good hygiene.
3. The CORS change is made in `cors.ts` within the edge function.

**File:** `supabase/functions/close-expired-auctions/cors.ts` (needs to be pulled from live first — see B-10 plan)

---

### PLAN: L-3 · `validate_new_user_email()` function — Never triggered (dead code)

**Root cause confirmed (from live DB):** The trigger `before_user_insert_validate_email` calls `validate_user_email_domain()`, NOT `validate_new_user_email()`. The `validate_new_user_email` function has the Gmail whitelist but is never executed.

**`validate_user_email_domain` (active):** Only checks `NOT LIKE '%@iimidr.ac.in'` — blocks everything else, no whitelist.
**`validate_new_user_email` (dead):** Whitelists `raghavtripathi2408@gmail.com` and `raghavtripathi2203@gmail.com`, then does the same `@iimidr.ac.in` check.

**Decision required (two paths):**

**Option A — Enable the whitelist (developer-friendly):**
1. Update the trigger to call `validate_new_user_email` instead of `validate_user_email_domain`.
2. Drop `validate_user_email_domain` (now unused).
3. Migration:
   ```sql
   DROP TRIGGER IF EXISTS before_user_insert_validate_email ON auth.users;
   CREATE TRIGGER before_user_insert_validate_email
     BEFORE INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION public.validate_new_user_email();
   DROP FUNCTION IF EXISTS public.validate_user_email_domain();
   ```

**Option B — Accept current strict behavior, drop dead function:**
1. Keep the trigger as-is (points to `validate_user_email_domain`).
2. Drop the dead `validate_new_user_email` function.
3. To add developer accounts: add them to `auth.users` manually via the Supabase dashboard (bypass the trigger).
4. Migration: `DROP FUNCTION IF EXISTS public.validate_new_user_email();`

**Recommended:** Option A — enables the whitelist for dev accounts and cleans up the dead code.

**Files:** New migration file

---

### PLAN: L-4 · Auction auto-close cron job not working (covered by B-1 — see below)

Covered in B-1 resolution plan.

---

### PLAN: L-5 · Single shared Supabase client — Multi-tab session sync

**Root cause confirmed:** `src/lib/supabaseClient.ts` exports a single module-level `supabase` instance. Supabase JS v2 uses `localStorage` for session persistence. If one tab calls `signOut()`, the localStorage token is cleared — all other open tabs lose their session silently. On the next auth-dependent API call, they get a 401.

**Impact:** If a user signs out in Tab A, Tab B continues to show UI as if signed in, but API calls will fail. The auth listener (`onAuthStateChange`) fires across tabs for token changes in localStorage (Supabase broadcasts this), so tabs should receive the `SIGNED_OUT` event and update UI. But if the listener hasn't been set up or was dropped (because of the C-1/C-2 loading bugs), the UI stays stale.

**Plan:**
1. The primary fix is C-1 and C-2: ensure auth listeners are robust. Once those are fixed, `SIGNED_OUT` events will properly update the UI in all tabs.
2. Optionally: add a `storage` event listener on `window` in the main layout to detect localStorage changes from other tabs and trigger a session refresh:
   ```typescript
   window.addEventListener('storage', (e) => {
     if (e.key?.startsWith('sb-') && e.key.endsWith('-auth-token')) {
       supabase.auth.getSession(); // re-check session
     }
   });
   ```
3. This is a progressive enhancement — fixing C-1/C-2 already addresses most of the impact.

**File:** `src/app/layout.tsx` (or a dedicated session sync hook)

---

### PLAN: L-6 · `src/components/Navbar.tsx` — Theme `localStorage` read without runtime validation

**Root cause confirmed (from code read, lines 38–50):** `const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null` — this is a TypeScript cast, not runtime validation. If a corrupted or unexpected value exists in localStorage (e.g., someone manually set it to `"auto"` or `"system"`), the theme state receives an invalid value, and `document.documentElement.classList.toggle('dark', newTheme === 'dark')` still works (since only `'dark'` triggers the class), but `theme === 'light'` checks would fail to show the correct icon.

**Plan:**
1. Add a runtime validator helper:
   ```typescript
   const isValidTheme = (v: unknown): v is 'light' | 'dark' => v === 'light' || v === 'dark';
   ```
2. Use it: `const savedTheme = isValidTheme(localStorage.getItem('theme')) ? localStorage.getItem('theme') as 'light' | 'dark' : null;`
3. Wrap `localStorage.getItem` in try/catch (for Safari private mode).
4. Combined with M-4 fix, this makes the entire `useTheme` hook robust against localStorage failures.

**File:** `src/components/Navbar.tsx` · Lines 38–50

---

### PLAN: B-1 · Cron job sending wrong auth token

**Root cause confirmed (from live cron job query):** The pg_cron job sends `'Bearer Ragwl/@123@new'` which appears to be an old hardcoded password. The edge function expects `Bearer ${CLOSE_EXPIRED_AUCTIONS_SECRET}` where `CLOSE_EXPIRED_AUCTIONS_SECRET` is an environment variable set in the Supabase function config. The `timeout_milliseconds` is `1000` (1 second) — insufficient since the function can process multiple listings serially.

**How to find the correct secret:** In the Supabase dashboard → Edge Functions → close-expired-auctions → Environment Variables → copy the value of `CLOSE_EXPIRED_AUCTIONS_SECRET`.

**Plan:**
1. Update the pg_cron job via SQL:
   ```sql
   SELECT cron.alter_job(
     job_id := 1,
     command := $cmd$
       SELECT net.http_post(
         url := 'https://efkggsqrpmilxfmszdlz.supabase.co/functions/v1/close-expired-auctions',
         headers := jsonb_build_object('Authorization', 'Bearer <CORRECT_SECRET_HERE>'),
         timeout_milliseconds := 15000
       );
     $cmd$
   );
   ```
2. Set `timeout_milliseconds` to `15000` (15 seconds) — the function processes listings in parallel via `Promise.all`, so even with 10 concurrent listings it should complete well within this window.
3. **Security:** The secret value should NOT be stored in migration files or version control. Update the cron job via the Supabase dashboard SQL editor directly, or use Supabase secrets management.
4. **Verify fix:** After updating, check the function logs in Supabase dashboard — should see `Authorization successful.` and successful RPC calls instead of 401 errors.

**Location:** pg_cron job ID 1, update via Supabase SQL editor (not a migration file).

---

### PLAN: B-2 · `listing-images` bucket — No user ownership check on upload

**Root cause confirmed (from policies):** INSERT policy `allow_uploads` only checks `bucket_id = 'listing-images'` and `auth.role() = 'authenticated'`. There is no path-based ownership check. The `avatars` bucket correctly enforces `owner = auth.uid()`. No DELETE policy exists. No file size limit.

**Plan:**
1. **Fix INSERT policy** — add path ownership check:
   ```sql
   -- Drop old policy
   DROP POLICY IF EXISTS "allow_uploads" ON storage.objects;
   -- Create new policy enforcing user owns the folder
   CREATE POLICY "listing_images_insert_own_folder"
     ON storage.objects FOR INSERT
     WITH CHECK (
       bucket_id = 'listing-images'
       AND auth.role() = 'authenticated'
       AND (storage.foldername(name))[1] = auth.uid()::text
     );
   ```
   This enforces that uploads go into `{user_id}/...` paths only.

2. **Add DELETE policy** — allow users to delete their own files:
   ```sql
   CREATE POLICY "listing_images_delete_own"
     ON storage.objects FOR DELETE
     USING (
       bucket_id = 'listing-images'
       AND auth.uid()::text = (storage.foldername(name))[1]
     );
   ```

3. **Set file size limit** — update bucket settings:
   ```sql
   UPDATE storage.buckets
   SET file_size_limit = 5242880  -- 5 MB
   WHERE id = 'listing-images';
   ```
   Also add `allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']` to prevent uploading arbitrary file types.

4. **Frontend:** Ensure the listing creation flow uploads images to `{user.id}/{listing_id}/{filename}` paths (verify current upload path structure in the new listing form).

**Files:** New migration for storage policies; check `src/app/listings/new/page.tsx` for upload path.

---

### PLAN: B-3 · Duplicate and conflicting RLS policies on `profiles`

**Root cause confirmed (from live policy query):** SELECT: two policies — "Authenticated users can view other user profiles for contact" (USING: `true`) and "Users can read their own profile only" (USING: `auth.uid() = id`). Since both are PERMISSIVE, OR'd together = `true OR (auth.uid() = id)` = all rows visible. UPDATE: three policies — one authenticated + two identical public-role.

**Intent analysis from policy names:**
- "for contact" policy suggests the intended behavior IS to allow all authenticated users to see all profiles (needed to display seller info, bidder info, etc.).
- The "own profile only" policy is likely a leftover from an earlier more-restrictive design.

**Plan:**
1. Drop the redundant/conflicting policies:
   ```sql
   -- Drop the narrow select policy (the broad one is intentional)
   DROP POLICY IF EXISTS "Users can read their own profile only" ON public.profiles;
   -- Drop the two duplicate public-role UPDATE policies
   DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
   DROP POLICY IF EXISTS "Users can update their own profile data" ON public.profiles;
   ```
2. Keep:
   - SELECT: "Authenticated users can view other user profiles for contact" (USING: true) — this is the correct intent (authenticated users need to see seller/winner profiles)
   - UPDATE: "Enable users to update their own profile" (authenticated role, `auth.uid() = id`) — correct
   - INSERT: "Disallow direct inserts to profiles by users" — correct (profiles created by trigger only)
   - DELETE: "Disallow direct deletes from profiles by users" — correct
3. Result: 4 clean, non-conflicting policies.
4. Add a migration for these DROP statements so the schema stays in sync.

**Files:** New migration file

---

### PLAN: B-4 · `validate_new_user_email` dead function + wrong trigger target

**Covered by L-3 resolution plan above.** See L-3.

---

### PLAN: B-5 · `listings_with_seller_email` view missing `tags` column

**Root cause confirmed (from live view query):** The view definition for `listings_with_seller_email` does not include `l.tags`. The listing detail page queries this view for active listings (non-archived path), so `listing.tags` will be `undefined`.

**Plan:**
1. Add a migration to recreate the view with `tags` included:
   ```sql
   CREATE OR REPLACE VIEW listings_with_seller_email AS
   SELECT
     l.id, l.title, l.description, l.min_price, l.photos, l.tags,
     l.seller_id, l.end_time, l.created_at, l.upper_cap, l.rules,
     l.status, l.winning_bid_id, l.winning_bidder_id,
     u.email AS seller_email
   FROM listings l
   LEFT JOIN auth.users u ON l.seller_id = u.id;
   ```
2. **Also add `winner_email`** to this view at the same time (solving H-5 without a frontend change):
   ```sql
   CREATE OR REPLACE VIEW listings_with_seller_email AS
   SELECT
     l.id, l.title, l.description, l.min_price, l.photos, l.tags,
     l.seller_id, l.end_time, l.created_at, l.upper_cap, l.rules,
     l.status, l.winning_bid_id, l.winning_bidder_id,
     u.email AS seller_email,
     w.email AS winner_email
   FROM listings l
   LEFT JOIN auth.users u ON l.seller_id = u.id
   LEFT JOIN auth.users w ON l.winning_bidder_id = w.id;
   ```
   This kills two birds with one migration (B-5 + H-5).
3. Update the TypeScript type in `listing/(detail)/[id]/page.tsx` to include `tags?: string[] | null` and `winner_email?: string | null` in the `Listing` type.
4. Remove the `supabase.from('users')` query (H-5 fix) since `winner_email` is now available directly from the view.

**Files:** New migration file; `src/app/listings/(detail)/[id]/page.tsx` type definitions and line ~147.

---

### PLAN: B-7 · `get_public_seller_profile` function not in migrations

**Root cause confirmed (from live DB + migration files):** The function exists on the live DB (returns `full_name, avatar_url, hostel, batch, bio, active_listings_count, items_sold_count` as SECURITY DEFINER). There is no migration for it — it was added manually.

**Plan:**
1. Add a migration that creates the function:
   ```sql
   CREATE OR REPLACE FUNCTION public.get_public_seller_profile(profile_id_to_fetch uuid)
   RETURNS TABLE(full_name text, avatar_url text, hostel text, batch text, bio text,
                 active_listings_count bigint, items_sold_count bigint)
   LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
   BEGIN
     RETURN QUERY
     SELECT p.full_name, p.avatar_url, p.hostel, p.batch, p.bio,
       (SELECT COUNT(*) FROM listings l WHERE l.seller_id = profile_id_to_fetch AND l.status = 'active'),
       (SELECT COUNT(*) FROM listings l WHERE l.seller_id = profile_id_to_fetch AND l.status = 'closed' AND l.winning_bidder_id IS NOT NULL)
     FROM profiles p WHERE p.id = profile_id_to_fetch;
   END;
   $$;
   ```
   Match exactly what's on the live DB (confirmed from function definition query).
2. Since the function already exists on live, `CREATE OR REPLACE` is safe — it won't break anything.
3. File naming: `supabase/migrations/<timestamp>_add_get_public_seller_profile_function.sql`

**Files:** New migration file

---

### PLAN: B-8 · Duplicate `avatars` bucket UPDATE policies

**Root cause confirmed (from live policies):** Two identical UPDATE policies on `storage.objects` for the avatars bucket. One is a leftover from a policy rename.

**Plan:**
1. Drop one of the duplicate policies:
   ```sql
   DROP POLICY IF EXISTS "Authenticated users can manage their own avatar" ON storage.objects;
   -- Keep: "Authenticated users can update their own avatar"
   ```
2. Verify after drop that the remaining policy still works (`(bucket_id = 'avatars') AND (owner = auth.uid())`).
3. Include this in the same migration as B-3 or create a separate storage-policy cleanup migration.

**Files:** New migration file (can combine with B-2 as a storage policy cleanup migration)

---

### PLAN: B-9 · `push_subscriptions` UNIQUE constraint allows only one device per user

**Root cause confirmed:** `UNIQUE(user_id)` on `push_subscriptions` — only one push subscription per user. Second device registration fails with unique constraint error (23505).

**Decision required (two options):**

**Option A — Allow multiple subscriptions per user (multi-device):**
1. Drop the unique constraint on `user_id`.
2. Frontend: on `subscribe()`, INSERT a new row; on `unsubscribe()`, DELETE the row matching the subscription's endpoint.
3. When sending push notifications, iterate over all rows for a given `user_id`.
4. Risk: subscription stacking — dead/expired subscriptions accumulate. Add periodic cleanup logic.

**Option B — UPSERT behavior (single active subscription per user, latest device wins):**
1. Keep the unique constraint.
2. Frontend: use `INSERT ... ON CONFLICT (user_id) DO UPDATE SET subscription_details = EXCLUDED.subscription_details, created_at = NOW()`.
3. This means "last device to register gets push notifications" — acceptable for a small-scale app.
4. Handle the 23505 conflict error gracefully in frontend code (currently unhandled — causes silent failure on second device registration).

**Recommended for current scale (141 users):** Option B — simpler, existing constraint is fine, just needs UPSERT on registration and conflict handling.

**Files:** Frontend push subscription registration code (wherever `push_subscriptions` INSERT is called — likely in service worker or settings page)

---

### PLAN: B-10 · Two edge functions exist in production but not locally

**Root cause confirmed:** `email-domain-validation` (verify_jwt: true) and `send-test-notification` (verify_jwt: false) exist on live but not in `supabase/functions/`.

**Plan:**
1. Use the Supabase MCP or dashboard to get the source code of both functions.
2. Create `supabase/functions/email-domain-validation/index.ts` and `supabase/functions/send-test-notification/index.ts` locally.
3. Add them to `.gitignore` exclusions if they contain hardcoded secrets (unlikely, but check).
4. Test that redeploying them via `supabase functions deploy` doesn't break the live behavior.
5. **For `email-domain-validation`:** This likely validates user email domain on auth signup at the application level. Understand its current behavior before redeploying to ensure it doesn't conflict with the DB trigger (`validate_user_email_domain`). If they duplicate logic, consider removing one.
6. **For `send-test-notification`:** Wire this into the notification pipeline plan (H-4/B-6). Document what it expects as input.

**Files:** Create `supabase/functions/email-domain-validation/index.ts` and `supabase/functions/send-test-notification/index.ts`

---

### PLAN: Schema Drift — `push_subscriptions` not in migrations

**Root cause confirmed:** Table exists in live DB but not in any local migration file.

**Plan:**
1. Create a migration that represents the current live state:
   ```sql
   CREATE TABLE IF NOT EXISTS public.push_subscriptions (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
     subscription_details JSONB NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
   );
   COMMENT ON TABLE push_subscriptions IS 'Stores user push notification subscription details.';
   -- RLS
   ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can view their own subscriptions." ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
   CREATE POLICY "Users can insert their own subscriptions." ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
   CREATE POLICY "Users can update their own subscriptions." ON push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
   CREATE POLICY "Users can delete their own subscriptions." ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);
   ```
2. Since the table already exists on live, use `CREATE TABLE IF NOT EXISTS` so the migration is idempotent and doesn't break a fresh apply.
3. Similarly, create migrations for `Storage buckets` (`listing-images`, `avatars`) — these are created manually but need migration code for fresh deploys.

**Files:** New migration file `<timestamp>_add_missing_tables_and_buckets.sql`

---

### Summary Table

| Issue | Files Changed | DB Change | Complexity |
|---|---|---|---|
| C-1 | `src/hooks/useAuth.ts` | None | 1 line |
| C-2 | `src/components/Navbar.tsx` | None | 1 line |
| C-3 | `src/stores/watchlistStore.ts` | None | 3 lines |
| C-4 | None (false positive) | None | Comment only |
| H-1 | `src/app/listings/page.tsx` | None | Small |
| H-2 | `src/app/listings/(detail)/[id]/page.tsx` | None | Small |
| H-3 | `src/components/Navbar.tsx` | None | Small |
| H-4+B-6 | `src/app/notifications/page.tsx`, new migration | CREATE TABLE + triggers | Large |
| H-5 | Solved by B-5 view update | None | 0 extra lines |
| H-6 | `src/app/listings/(detail)/[id]/page.tsx` | None | Small |
| H-7 | `src/stores/watchlistStore.ts` + `AuthWatchlistManager.tsx` | None | Small |
| M-1 | None (false positive) | None | Comment only |
| M-2 | `src/app/listings/page.tsx` | None | 1 line |
| M-3 | `src/app/my-listings/page.tsx` | None | 1 line or comment |
| M-4 | `src/components/Navbar.tsx` | None | ~4 lines |
| M-5 | `src/app/notifications/page.tsx` | None | Small |
| M-6 | Various pages | None | Small per file |
| L-2 | `supabase/functions/close-expired-auctions/cors.ts` | None | 1 line |
| L-3/B-4 | New migration | DROP FUNCTION + recreate trigger | Small |
| B-1 | None (SQL editor update) | UPDATE cron job | Dashboard change |
| B-2 | New migration | Storage policy UPDATE | Small |
| B-3 | New migration | DROP 3 duplicate policies | Small |
| B-5+H-5 | New migration + `[id]/page.tsx` | CREATE OR REPLACE VIEW | Small |
| B-7 | New migration | CREATE OR REPLACE FUNCTION | Medium (copy from live) |
| B-8 | New migration | DROP 1 duplicate policy | 1 line |
| B-9 | Frontend push registration code | Optional: keep constraint, fix UPSERT | Small |
| B-10 | Create 2 new function files | None | Medium (need source from live) |
| Schema drift | New migration | CREATE TABLE IF NOT EXISTS | Medium |

---

## Independent Review Comments
**Added:** 2026-02-26 — Full re-verification against live codebase (all key files read) + live Supabase backend (MCP queries: tables, views, functions, triggers, RLS policies, cron jobs, storage buckets).

This section comments on each resolution plan: whether it is correct, whether it will actually fix the stated problem, and any second- or third-order risks that could emerge from applying it.

---

### Review: C-1 · `useAuth.ts` — Missing `.catch()`

**Plan is correct and complete.**

Verified against live code (lines 11–14): no `.catch()` on `getSession()`. The `onAuthStateChange` listener at line 17 does call `setLoading(false)`, so there IS a partial fallback — but only if Supabase fires an auth state event, which doesn't happen on a pure network failure. The `.catch()` fix is the right call.

**Safe to apply. Zero second-order risk.**

One thing to verify first: there are two separate `getSession()` patterns in the codebase — one in `useAuth.ts` and one in `Navbar.tsx` (C-2). Apply both together so neither can re-introduce a stuck state after the other is fixed.

---

### Review: C-2 · `Navbar.tsx` — Missing `.catch()` on `getSession()`

**Plan is correct and complete.**

Verified against live code (lines 128–135): `getSession().then(async ({ data: { session } }) => { ... setLoading(false); })` — no `.catch()`. Critically, the `onAuthStateChange` at line 137 does NOT call `setLoading(false)` — it only updates `user` and `userProfile`. So if `getSession()` fails, `loading` stays `true` forever and the navbar renders the skeleton-loader state permanently, blocking all navigation.

**Safe to apply. Zero second-order risk.**

The `.catch()` block should call `setLoading(false)` and `setUser(null)` — the plan states this correctly. Do not also set `userProfile(null)` in the catch; it starts as `null` already, so this would be redundant but harmless.

---

### Review: C-3 · `watchlistStore.ts` — Orphaned realtime channel in catch block

**Plan is directionally correct but overstates the current bug.**

Verified against live code: `setupRealtimeChannel` already performs its own cleanup internally (lines 52–62: `cleanup()` is called on timeout and CHANNEL_ERROR, which calls `channel.unsubscribe()` + `supabase.removeChannel()`). So when the outer catch at line 209 fires, the channel has already been cleaned up by the internal retry/error path. The channel is NOT actually orphaned in the common failure cases.

**The remaining edge case** (plan is correct about this): if `setupRealtimeChannel` resolves successfully (returns a channel) but then something in lines 197–207 throws unexpectedly (e.g., Zustand's `set()` throws, which is extremely unlikely), the channel would be orphaned. The plan's fix — declaring `let channel = null` before the try block and calling `cleanupRealtimeChannel(channel)` in the catch — correctly handles this edge case.

**Second-order risk:** When the outer catch calls `cleanupRealtimeChannel(channel)`, it may double-call cleanup on a channel that `setupRealtimeChannel` already cleaned up internally. This is safe because `cleanupRealtimeChannel` wraps everything in try/catch and the Supabase client handles removing a non-existent channel gracefully. The result would be at most a benign `console.error` log from the cleanup.

**Before applying:** The structural change (moving `let channel` declaration before the try block) is a small refactor. Make sure the variable is typed as `RealtimeChannel | null` and initialized to `null` so the catch guard `if (channel)` works correctly even if `setupRealtimeChannel` was never called.

---

### Review: C-4 · `WatchlistButton.tsx` — `isLoading` not reset on 23505

**Plan is correct: this is a confirmed false positive. No code change needed.**

Verified against live code: the `return` at line 57 is inside a `try` block that has a `finally { setIsLoading(false); }` at line 77. JavaScript's `finally` runs on all exit paths from a `try` block, including early `return`. The button is NOT permanently locked.

**Safe to close as false positive.** A comment clarifying this (as the plan suggests) is good hygiene to prevent a future developer from "fixing" it incorrectly.

---

### Review: H-1 · `listings/page.tsx` — Channel not removed on `removeChannel` failure

**Plan is correct. The unique-suffix approach is the right fix.**

Verified against live code (lines 218, 265–267): channel named `'public-listings-active-page'` (hardcoded) with `.catch()` on cleanup but no fallback. If cleanup fails, the next mount creates a second identically-named channel.

**The minimal fix** (use `Date.now()` suffix or `useRef(crypto.randomUUID())`) is the cleanest approach. It eliminates the name collision problem entirely without needing to guarantee cleanup always succeeds.

**Second-order risk to watch:** The `fetchListings` callback (line 227) is captured inside the realtime event handler at mount time. If `fetchListings`'s own closure becomes stale (its dependencies include `selectedCategory`, `currentSearchTerm`, `sortOption` from the `useCallback`), old channels calling stale closures could fetch with wrong filter parameters. This is a pre-existing issue separate from H-1, but adding a unique channel name makes it slightly more likely that an old stale channel lingers longer. The effect dependency array at line 270 (`[selectedCategory, fetchListings, currentSearchTerm, sortOption]`) should re-mount the effect when these change, so old channels do get cleaned up — just asynchronously. Low practical risk.

---

### Review: H-2 · `listings/(detail)/[id]/page.tsx` — Channels orphaned on error

**Plan is correct but React Strict Mode concern is overstated in production.**

Verified against live code (lines 164–173): channels `listing-bids-${id}` and `listing-details-status-${id}` are created in a `useEffect([id, loadData])`. Cleanup at line 172 calls `removeChannel` unconditionally. The `CHANNEL_ERROR` callback only logs, no self-cleanup.

**React Strict Mode** (which double-invokes effects in dev) is the main risk here. In production builds, Strict Mode double-invoke does not happen, so this is primarily a development-environment concern.

**Second-order risk:** The plan recommends calling `supabase.removeChannel(bidsChannel)` inside the `CHANNEL_ERROR` subscribe callback (step 1), then having the cleanup function not try again if the channel was already removed. If you add a "channel removed" flag, make sure the cleanup function checks this flag BEFORE calling removeChannel. If you don't, the cleanup will attempt to remove an already-removed channel — which is safe in practice (Supabase client handles it) but may log errors.

**The `useRef` for channels (plan step 2) is technically unnecessary** because the cleanup `return () =>` closure already captures the correct channel variables from the outer `useEffect` scope. Using refs adds no functional benefit here unless you need to access the channels from outside the effect (you don't). Skip this step to keep the change minimal.

---

### Review: H-3 · `Navbar.tsx` — Notification channel duplicated on fast auth changes

**Plan is correct. Risk is low in normal use.**

Verified against live code (lines 307–336): `useEffect([user])` pattern with `noti-${user.id}` channel name. If `user` changes faster than `removeChannel()` completes (async), two channels with the same name could exist briefly.

**The timestamp suffix fix** (`noti-${user.id}-${Date.now()}`) is correct. No channel name collision possible.

**Second-order risk:** With the timestamp suffix, if the cleanup fails (removeChannel rejects), the orphaned channel name is unique and will never be re-created by subsequent mounts. This is actually better than the current behavior — stale channels don't interfere with new ones. The only cost is a slightly higher number of channels on Supabase's side until they time out. For 141 users, this is negligible.

---

### Review: H-4 + B-6 · `user_notifications` table missing + notification pipeline incomplete

**Plan is directionally correct but has a critical omission that would cause silent failure.**

**Confirmed missing:** `user_notifications` table is not in the live DB (verified via `list_tables` — only `bids`, `listings`, `profiles`, `listing_chats`, `watched_listings`, `push_subscriptions` exist).

**Critical gap in the plan — trigger function security:**

The plan says to create DB trigger functions for `AFTER INSERT ON bids` (notify seller) and on `status` change to `'closed'` (notify winner). The plan also says the INSERT RLS policy should be "service role only."

**This creates a conflict.** In PostgreSQL, trigger functions run in the security context of the triggering user (the bidder, in the case of `AFTER INSERT ON bids`), NOT the service role. If the INSERT RLS on `user_notifications` is "service role only," the trigger function will be blocked by RLS when trying to insert the notification record. The fix: the trigger functions must be marked `SECURITY DEFINER` so they run as the function owner (postgres/superuser), bypassing RLS for the INSERT. **If this is omitted, the notification pipeline will silently fail every time a bid is placed — bids will succeed, but no notification will be created.** The plan does not mention `SECURITY DEFINER` on the trigger functions.

**Second-order risk — transaction atomicity:** If the trigger function throws an error (e.g., because the notifications insert fails for any reason), the entire bid INSERT transaction rolls back. The bidder's bid would be lost. The trigger function must either be marked as `EXCEPTION WHEN OTHERS THEN NULL` (swallow errors) or use `pg_background` / deferred notifications to avoid this. This is a well-known PostgreSQL pattern issue with "side effect" triggers.

**Things to verify before applying:**
1. The trigger functions MUST be `SECURITY DEFINER` or the INSERT RLS must explicitly allow the triggering user to insert.
2. Wrap the notification insert in `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL END` so a notification failure never rolls back a bid.
3. The `send-test-notification` edge function (needed for push delivery) has `verify_jwt: false` on live. Before wiring it into the pipeline, either add authentication to it (a secret header check) or change `verify_jwt` to `true` with service role calling it. Currently unauthenticated callers can trigger it.
4. Pull the source of `send-test-notification` from the Supabase dashboard FIRST (before creating the table and triggers) so you understand what input format it expects.

---

### Review: H-5 · Querying non-existent `public.users` table

**Plan (Option 4 — add winner_email to view) is correct. Handled by B-5 plan.**

Verified against live code (line 147): `supabase.from('users').select('email')...` — confirmed `public.users` doesn't exist, confirmed this is a dead query that always returns null.

**One thing the plan misses:** Even after the view is updated with `winner_email`, the `select()` call at line 138 explicitly names its columns: `'id, title, description, min_price, photos, end_time, upper_cap, rules, seller_email, seller_id, status, winning_bidder_id, winning_bid_id'`. It does NOT include `tags` or `winner_email`. **The frontend select string must also be updated** to include `tags, winner_email`, otherwise the new view columns will be fetched but not returned by PostgREST (explicit column selection). Do this at the same time as the migration. The plan mentions updating TypeScript types but not updating the `.select()` string itself — this is a required step to actually fix the bug.

---

### Review: H-6 · Countdown timer re-creates interval on every `loadData` change

**Plan is correct but the scope of the bug may be narrower than described.**

Verified against live code (line 184): `useEffect(... [listing?.end_time, listing?.status, auctionEnded, loadData, id])`. `loadData` is a `useCallback` with `[id]` as its dep, so `loadData` is stable as long as `id` is stable. On a given listing page, `id` never changes. So `loadData` itself does not change on every bid arrival.

**The real (smaller) remaining bug:** When the countdown hits "Auction Ended", the timer calls `loadData()` (line 184), which re-fetches and calls `setListing(...)`, which updates `listing?.status` (in deps), which re-runs the countdown effect, which clears and re-creates the interval. This happens exactly ONCE at auction end — not on every bid. So the impact is a brief flicker at auction end, not continuous CPU churn.

**The ref pattern in the plan is still the correct fix** because it removes `loadData` from deps entirely, breaking the end-of-auction flicker cycle. Low risk to apply.

**Before applying:** Verify that the `loadDataRef.current` update effect (`useEffect(() => { loadDataRef.current = loadData; }, [loadData])`) is added BEFORE the countdown effect in the component body, or React may execute them in an order that leads to a stale ref on first render. Ordering useEffect declarations doesn't strictly guarantee execution order, but placing the ref-sync effect earlier is good practice.

---

### Review: H-7 · Race condition — double `initializeWatchlist` call

**Plan is correct. The store-level guard (Option 3) is the better approach.**

Verified against live code: `AuthWatchlistManager.tsx` lines 16–64. The `onAuthStateChange` listener at line 35 listens for `SIGNED_IN` and `SIGNED_OUT`. On initial page load with an existing session, Supabase v2 fires `INITIAL_SESSION` from `onAuthStateChange` — NOT `SIGNED_IN`. So the most common case (page refresh while logged in) does NOT trigger the race condition, because `onAuthStateChange(SIGNED_IN)` will not fire.

**When the race does occur:** It fires on actual sign-in events (user logs in during a session). In this case, both `initializeAuth` (which calls `getSession()`) and `onAuthStateChange(SIGNED_IN)` call `initializeWatchlist`. Since `initializationAttempted.current` prevents double-call of `initializeAuth`, the race is between the `SIGNED_IN` event handler and the `getSession()` call inside `initializeAuth`. If `getSession()` resolves before `SIGNED_IN` fires, the watchlist is already initialized and the guard `hasFetchedInitialWatchlist` catches the second call. The race window is narrow.

**Adding `initializingForUserId` to the store (Option 3) is the correct, robust fix.** However, note that you must add it to the `WatchlistState` interface AND the initial state in the `create()` call. Also ensure `initializingForUserId` is cleared in the `catch` block, not just on success — otherwise a failed init would permanently block subsequent re-tries for the same userId.

---

### Review: M-1 · Stale closure in click-outside handler

**Confirmed false positive. No change needed.**

Verified against live code (lines 168–195): `handleClickOutside` reads `isMobileMenuOpen` (line 181) directly from the closure. It calls `setIsUserMenuOpen(false)` (state setter, always fresh). The deps array `[isMobileMenuOpen]` is correct. This matches what the plan says.

---

### Review: M-2 · `isMounted` not checked in subscribe callback

**Correct assessment. Plan is valid defensive hygiene.**

Verified against live code (lines 231–237): the subscribe callback only logs (`console.log` / `console.error`). No state updates. Impact is effectively zero in production. The one-line `if (!isMounted) return` addition is safe and free.

---

### Review: M-3 · `fetchUserDataAndListings` empty dep array

**Confirmed correct as-is.**

Verified against live code (lines 100–138): the callback only uses `supabase` (module-level singleton) and its parameter `u: User`. No state or props are closed over. Empty dep array is intentional and correct. A comment is sufficient — no code change needed.

---

### Review: M-4 · `localStorage.setItem` without try/catch

**Plan is correct and safe.**

Verified against live code (lines 38–64): `localStorage.getItem('theme')` (read on mount, no try/catch) and `localStorage.setItem('theme', newTheme)` inside `toggleTheme` (no try/catch). Both need wrapping.

**Second-order risk:** The `setTheme` state updater function is called inside a React setState callback. If `localStorage.setItem` throws there, it would propagate out of the state updater, potentially crashing the component in browsers where localStorage throws (Safari private mode, some Firefox configurations). The `try/catch` wrapper prevents this. Very safe fix.

**One clarification:** The plan says "For the initial read in the `useEffect` (line 38), wrap `localStorage.getItem('theme')` in try/catch and validate the result." The initial read is a `getItem` (not `setItem`) — this is less likely to throw (reads rarely throw, writes do). But wrapping the read is still good practice since `localStorage.getItem` CAN throw in some environments (e.g., security-restricted contexts). Apply the runtime validator `isValidTheme` as planned.

---

### Review: M-5 · `markAsRead` no error handling

**Plan is correct but the UX flow needs careful thought.**

Verified against live code (lines 51–56, 110–117): `markAsRead` is called in an onClick handler and is NOT awaited. The click handler immediately proceeds to `router.push(notification.link)` after calling `markAsRead`. So the UI already navigates away before the async update completes.

**Second-order risk of the optimistic update approach:** Adding an optimistic update + revert requires the click handler to `await markAsRead(...)` before navigating (otherwise, the revert on failure would happen after the user has navigated away, affecting a component that may be unmounted). This changes the UX: navigation is now blocked until the DB update resolves (or fails). Given Supabase latency this is typically <200ms, but it's a behavioral change. Make sure the click handler is marked `async` and the `onClick` prop is aware of this.

**This plan also depends on H-4+B-6 being resolved first** (table must exist before markAsRead can succeed at all).

---

### Review: M-6 · Silent Supabase errors across multiple files

**Plan is correct and important for debuggability.**

The pattern `if (!error && data) { setState(data); }` means failures produce empty UI with no log and no user feedback. Adding `else { console.error(...) }` branches is safe with zero side effects. The per-file additions are straightforward.

**Priority note:** `my-listings/page.tsx` already has good error handling at line 128–133 (`if (listErr) throw listErr` which is then caught). The M-6 issue there applies to sub-queries within that file. The `listings/(detail)/[id]/page.tsx` has decent error handling for the main `loadData` function but not for sub-queries (e.g., the bid fetch at line 144 and the winner-user query at line 147). Fixing H-5 eliminates the winner-user query entirely, which removes one silent failure point.

---

### Review: L-2 · CORS `*` on `close-expired-auctions`

**Plan is correct in principle but lower priority than stated.**

This edge function is called server-to-server (pg_cron → edge function). CORS headers are irrelevant for server-to-server calls — they are a browser-enforced mechanism. The only practical security concern is that someone could discover the function URL and call it with a curl command. However, the function already validates the `CLOSE_EXPIRED_AUCTIONS_SECRET` header, so without the secret, any call returns 401. CORS restriction adds no meaningful protection on top of this.

**Apply as hygiene, but only after B-1 is fixed.** Fix B-1 first (wrong auth token) since that's the actual blocker.

---

### Review: L-3 / B-4 · `validate_new_user_email` dead function + wrong trigger target

**Plan is correct. Option A (switch to whitelist function) is the recommended path.**

Verified against live DB: trigger `before_user_insert_validate_email` calls `validate_user_email_domain` (confirmed). `validate_new_user_email` (with Gmail whitelist) is deployed but never called (confirmed).

**Critical second-order risk with the migration:**

The plan's migration drops the old trigger, creates the new one, then drops the old function. **If the migration partially fails** (e.g., trigger created but function drop fails), the system could end up with BOTH triggers attached or with the wrong function. Write the migration as a single transaction to make it atomic:

```sql
BEGIN;
DROP TRIGGER IF EXISTS before_user_insert_validate_email ON auth.users;
CREATE TRIGGER before_user_insert_validate_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.validate_new_user_email();
DROP FUNCTION IF EXISTS public.validate_user_email_domain();
COMMIT;
```

**Also:** After applying this, test that `raghavtripathi2408@gmail.com` can sign up (whitelist check), that `user@iimidr.ac.in` can sign up (domain check), and that `user@gmail.com` (non-whitelisted) is blocked. Do this in a test before running on the live DB.

**Third-order risk:** The whitelist in `validate_new_user_email` only has two Gmail addresses hardcoded. If additional developer/admin accounts need to be onboarded via Gmail, the function must be updated. The plan should note this as a maintenance dependency.

---

### Review: L-5 · Multi-tab session sync

**Plan is correct. The primary fix (C-1/C-2) already addresses most of the impact.**

Supabase JS v2 automatically broadcasts session changes via the `storage` event to other open tabs through its `onAuthStateChange` listener. As long as each tab has a working `onAuthStateChange` listener (ensured by C-1/C-2 fixes), sign-out in one tab should propagate correctly to all others.

**The optional `storage` event listener** in the plan is belt-and-suspenders. It's safe to add but not essential if C-1/C-2 are fixed properly. Skip it in the first pass; revisit only if multi-tab sync issues persist after C-1/C-2 are deployed.

---

### Review: L-6 · Theme localStorage read without runtime validation

**Plan is correct and safe.**

Verified against live code (line 38): `localStorage.getItem('theme') as 'light' | 'dark' | null` — TypeScript cast without runtime validation. The `isValidTheme` helper pattern in the plan correctly handles this.

**Safe to apply simultaneously with M-4** (both affect the same `useTheme` hook in Navbar.tsx).

---

### Review: B-1 · Cron job sending wrong auth token

**Plan is correct. This is the single highest-impact fix to make.**

Verified against live DB: `command` contains `'Bearer Ragwl/@123@new'` with `timeout_milliseconds:=1000`. Confirmed.

**Important clarification on `timeout_milliseconds`:** In `pg_net.http_post`, this is the HTTP response timeout — it tells pg_net how long to wait for a response from the edge function. If the edge function takes longer than 1000ms to respond, pg_net drops the connection, but the edge function continues executing on the Supabase edge runtime. So increasing to 15000ms means pg_net will wait up to 15 seconds for the response (useful for logging/monitoring). The function's actual execution is not killed by this timeout. Increasing to 15000 is still recommended to get response confirmation in logs.

**Secret management:** The plan correctly says "do not store the secret in migration files." Apply this via the Supabase dashboard SQL editor directly. Make sure the actual `CLOSE_EXPIRED_AUCTIONS_SECRET` value is copied from Edge Functions → Environment Variables (not guessed or re-generated unless you also update the function's env var).

**After fixing, verify:** Check edge function logs in the Supabase dashboard for the next cron run (within 30 minutes). You should see `"Authorization successful."` and the function should process the 27 listings, closing any that are past `end_time`. Currently there are 27 listings and 0 have been auto-closed by the cron (all closures have been manual). Confirm the function doesn't accidentally close active-but-not-yet-expired listings.

---

### Review: B-2 · `listing-images` bucket — No user ownership check on upload

**Plan is correct AND the upload path structure is compatible with the proposed policy.**

Verified against live code:
- `src/app/listings/new/page.tsx` line 416: `filePath = \`${currentUser.id}/${safeTitlePrefix}_...\`` — first segment is `user_id`. ✓
- `src/app/listings/(detail)/[id]/edit/page.tsx` line 369: `fileName = \`${currentUser!.id}/${listingId}/...\`` — first segment is `user_id`. ✓

The policy `(storage.foldername(name))[1] = auth.uid()::text` checks that the first path segment equals the user's UUID. Both upload paths use `currentUser.id` as the first segment. **The policy will not break existing or new uploads.**

**Second-order risk — existing images in the bucket:** There are 27 existing listings. If any existing images were uploaded to paths that don't start with the owner's user ID (e.g., if someone manually uploaded to an arbitrary path), those images would not be affected by the new INSERT policy (it only applies to future uploads). But if a DELETE policy is added (as planned), sellers might not be able to delete images if the path format doesn't match. Verify that all existing listing images follow the `{user_id}/...` path format before enabling the DELETE policy — or make the DELETE policy more permissive for existing images.

**One gap in the plan:** There is currently NO SELECT (read) policy on `listing-images`. The bucket has `public: true`, so reads are open to everyone without a policy. The plan doesn't mention adding a SELECT policy, which is correct — public listing images should be publicly readable. Just confirm this is intentional.

**File size limit:** The `avatars` bucket has `file_size_limit: 4194304` (4 MB). The plan sets `listing-images` to 5 MB. Consider using the same 4 MB limit for consistency, or adjust based on expected listing photo sizes.

---

### Review: B-3 · Duplicate and conflicting RLS policies on `profiles`

**Plan is correct. Safe to apply.**

Verified against live DB: 7 policies exist — two SELECT (one broad, one narrow), three UPDATE (one authenticated-role + two identical public-role), one INSERT (disallow), one DELETE (disallow). Confirmed.

**Second-order risk — `email` column exposure:** After dropping "Users can read their own profile only" (the narrow SELECT policy), the remaining SELECT policy ("Authenticated users can view other user profiles for contact", USING: `true`) means any authenticated user can read ALL columns of ALL profiles, including the `email` column. The `profiles` table has `email` stored as a text column (separate from `auth.users.email`). Consider whether exposing every user's email to every other authenticated user is intentional. If you want to restrict email visibility, you would need a column-level security approach (or a view that excludes the `email` column for non-self lookups). The plan does not address this — make a deliberate decision about email exposure before applying.

**The two duplicate public-role UPDATE policies** (`polroles: {0}`) are safe to drop. The authenticated-role UPDATE policy remains and is strictly more appropriate (it explicitly requires authentication, whereas public-role + `auth.uid() = id` effectively requires it implicitly). No functional change results from dropping the public-role duplicates.

---

### Review: B-5 + H-5 · `listings_with_seller_email` view missing `tags` and winner email

**Plan is correct but the frontend fix is incomplete as written.**

Verified against live DB: `listings_with_seller_email` has no `l.tags` and no `winner_email`. Confirmed. `archived_listings_details` already has `winner_email` via the same auth.users join pattern — confirming the join approach works.

**Critical frontend step that the plan mentions but needs emphasis:**

The `select()` call in `listings/(detail)/[id]/page.tsx` line 138 explicitly lists columns:
```
'id, title, description, min_price, photos, end_time, upper_cap, rules, seller_email, seller_id, status, winning_bidder_id, winning_bid_id'
```
This explicit selection means PostgREST will return ONLY these columns, even if the underlying view has more. **You must add `tags, winner_email` to this select string** at the same time as applying the migration. If you run the migration but don't update the frontend, the bug is still present.

**Also remove** the dead `supabase.from('users')` query at line 147 after `winner_email` is available from the view. Do not leave it in place — even though it always returns null, it generates an unnecessary PostgREST error for every closed listing viewed.

**View security:** The view joins `auth.users` to get `seller_email` (already working) and `winner_email` (new). This is the same pattern used in `archived_listings_details` and `listing_chats_with_sender_email`. Supabase's view ownership means these joins work correctly for authenticated users. No additional security configuration is needed.

---

### Review: B-7 · `get_public_seller_profile` not in migrations

**Plan is correct. Safe to apply.**

Verified against live DB: function exists and its body was confirmed. The `CREATE OR REPLACE FUNCTION` in the plan matches the live definition exactly. Applying this migration will not change the live behavior — it just brings local migrations in sync.

**No second-order risk.** Apply as-is.

---

### Review: B-8 · Duplicate `avatars` UPDATE policies

**Plan is correct. Safe to apply.**

Verified against live DB: two identical UPDATE (polcmd: `w`) policies for avatars confirmed. Dropping either one is safe.

**Additional observation:** There is also a distinct DELETE policy ("Authenticated users can delete their own avatar") which the audit did not flag. This DELETE policy is fine — it's not a duplicate. The storage policy query also confirms there's an INSERT policy ("Authenticated users can upload their own avatar") with a path check — correctly mirroring what B-2 wants to add for `listing-images`.

---

### Review: B-9 · `push_subscriptions` UNIQUE constraint — one device per user

**Plan (Option B — UPSERT) is correct for current scale.**

Verified: `push_subscriptions` has `user_id UNIQUE` constraint. CONFIRMED.

**Before applying:** Find the frontend push registration code (likely in a service worker or settings page — not found in the main scan). The code performing `INSERT INTO push_subscriptions` needs to be changed to an UPSERT. If you can't find this code, the fix cannot be applied. Look in `public/` directory for service worker files, or in any settings/profile page that subscribes to push notifications.

---

### Review: B-10 · Two edge functions exist in production but not locally

**Plan is correct. Low urgency but important for maintainability.**

`email-domain-validation` (verify_jwt: true) and `send-test-notification` (verify_jwt: false) both exist on live.

**Important concern about `email-domain-validation`:** This edge function likely duplicates logic from the DB trigger `before_user_insert_validate_email`. Having both a DB-level trigger and an edge function enforcing email domain restriction creates redundancy. If they get out of sync (one updated, the other not), the behavior becomes unpredictable. After pulling the source and adding it to local code, decide whether both are needed or if one should be removed.

**Important concern about `send-test-notification` (verify_jwt: false):** The `verify_jwt: false` setting means no JWT verification on requests. The function name says "test" — this suggests it was created for development testing, not production use. Before wiring it into the notifications pipeline as H-4/B-6 plans, either:
1. Rename it to `send-notification` and add `verify_jwt: true` or internal auth
2. Or create a new, properly secured edge function for production notification delivery

Do not wire an unprotected "test" function into the production notification flow.

---

### Review: Schema Drift — `push_subscriptions` not in migrations

**Plan is correct. Use `IF NOT EXISTS` for idempotency.**

Verified: `push_subscriptions` table has `id, user_id (UNIQUE), subscription_details (JSONB), created_at` columns. The plan's migration SQL matches the live schema.

**Important:** The plan also mentions adding migrations for storage buckets (`listing-images`, `avatars`). Storage bucket creation in Supabase migrations via `INSERT INTO storage.buckets` can work, but it requires the `storage` schema to be available in the migration context (it is in Supabase). Use `INSERT INTO storage.buckets ... ON CONFLICT DO NOTHING` for idempotency. Test this in a dev branch (`supabase db reset`) before applying to production.

---

## Pre-Resolution Checklist (Do These Before Applying Any Fix)

**Before touching the database or cron job:**

1. **B-1 first, everything else second.** The cron job has been silently failing for an unknown amount of time. Fix it first. After fixing, monitor the next cron run (within 30 minutes) to verify auctions close correctly. If there are listings with `end_time` in the past and `status = 'active'`, the first successful cron run will close them all at once — verify this behavior is acceptable.

2. **Locate the `CLOSE_EXPIRED_AUCTIONS_SECRET` value** in Supabase → Edge Functions → close-expired-auctions → Environment Variables BEFORE updating the cron job. Do not regenerate it — update the cron job command to use the existing secret.

3. **Verify upload path structure** for `listing-images` before applying B-2 storage policy. Confirmed from code: both `new/page.tsx` (line 416) and `edit/page.tsx` (line 369) use `${user.id}/...` as the first path segment. The B-2 policy is safe to apply.

4. **Decide on email exposure in `profiles`** before applying B-3. The remaining SELECT policy after cleanup will allow all authenticated users to read all profile rows including `email`. If this is not intentional, add a column-level restriction before applying.

5. **Choose L-3/B-4 Option A or B** (switch trigger vs. keep as-is) before writing the migration. This affects all new user registrations immediately upon applying. Test the chosen function manually on a test account before modifying the trigger.

6. **Pull `send-test-notification` and `email-domain-validation` source from Supabase dashboard FIRST** (B-10) before designing the notification pipeline (H-4/B-6). The edge function source tells you what input format it expects and whether it has auth. This knowledge gates the pipeline design.

7. **Create a dev branch** in Supabase before applying any DB migrations. Test all DDL changes (view updates, new tables, RLS policies, trigger functions) in the branch and verify the app works end-to-end before merging to production.

**Migration ordering (apply in this sequence):**

```
1. B-1  — Fix cron job (dashboard SQL editor, not a migration file)
2. B-3  — Drop duplicate profiles RLS policies
3. B-8  — Drop duplicate avatars storage policy
4. B-2  — Fix listing-images storage policy + file size limit
5. B-5/H-5 — Update listings_with_seller_email view (tags + winner_email)
             — Simultaneously update frontend select() string and remove dead users query
6. L-3/B-4 — Switch email validation trigger (atomic BEGIN/COMMIT)
7. B-7  — Add get_public_seller_profile to migrations (CREATE OR REPLACE)
8. Schema — Add push_subscriptions migration (CREATE TABLE IF NOT EXISTS)
9. H-4/B-6 — Create user_notifications table + trigger functions (SECURITY DEFINER)
             — Only after pull and review of send-test-notification source
```

**Frontend code changes can be applied in any order** (they reference DB features that should exist before deployment):

```
- C-1, C-2  — Add .catch() (apply together, 2 files)
- C-3       — Defensive channel cleanup in watchlistStore catch
- C-4       — Add clarifying comment only (no functional change)
- H-1       — Unique channel name in listings/page.tsx
- H-2       — CHANNEL_ERROR self-cleanup in listing detail page
- H-3       — Timestamp suffix on notification channel name
- H-6       — loadData ref pattern for countdown effect
- H-7       — initializingForUserId guard in watchlistStore
- M-1       — Comment only
- M-2       — Defensive isMounted in subscribe callback
- M-3       — Comment only
- M-4, L-6  — Wrap localStorage calls in try/catch + runtime validation (same file, apply together)
- M-5       — Async markAsRead with revert (depends on H-4 table existing)
- M-6       — Add error logging across 4 files
- L-2       — Restrict CORS (apply after pulling function source for B-10)
```

---

*Review completed: 2026-02-26. All findings cross-verified against live code and live Supabase backend via MCP. No resolution actions taken — comments only.*

---

## Fix Status Log
**Updated:** 2026-04-14 — All code-side fixes applied; DB migrations created (apply after billing resolved on 2026-04-21)

### Code Fixes (applied to disk — no DB required)

| Issue | Status | Details |
|---|---|---|
| C-1 | ✅ FIXED | `src/hooks/useAuth.ts` — added `.catch()` on `getSession()` |
| C-2 | ✅ FIXED | `src/components/Navbar.tsx` — added `.catch()` on `getSession()` |
| C-3 | ✅ FIXED | `src/stores/watchlistStore.ts` — `channel` declared before `try`; catch calls `cleanupRealtimeChannel(channel)` |
| C-4 | ✅ NO CHANGE NEEDED | False positive — `finally` block already handles all exit paths |
| H-1 | ✅ FIXED | `src/app/listings/page.tsx` — unique channel name per mount (`Date.now()` suffix) |
| H-2 | ✅ FIXED | `src/app/listings/(detail)/[id]/page.tsx` — `CHANNEL_ERROR` now calls `supabase.removeChannel()` on bids and listing channels |
| H-3 | ✅ FIXED | `src/components/Navbar.tsx` — notification channel name uses `Date.now()` suffix |
| H-5 | ✅ FIXED | `src/app/listings/(detail)/[id]/page.tsx` — replaced `from('users')` (doesn't exist) with `from('profiles')` |
| H-6 | ✅ FIXED | `src/app/listings/(detail)/[id]/page.tsx` — countdown timer uses `loadDataRef` pattern; `loadData` removed from deps |
| H-7 | ✅ FIXED | `src/components/AuthWatchlistManager.tsx` — added `initializingForUserId` ref; concurrent `initializeWatchlist` calls for same user are now blocked |
| M-1 | ✅ NO CHANGE NEEDED | False positive — handler doesn't read `isUserMenuOpen` directly |
| M-2 | ✅ FIXED | `src/app/listings/page.tsx` — added `isMounted` guard at top of subscribe callback |
| M-3 | ✅ FIXED | `src/app/my-listings/page.tsx` — confirmed empty dep array is intentional; added explanatory comment |
| M-4 | ✅ FIXED | `src/components/Navbar.tsx` — `localStorage.setItem` wrapped in `try/catch` |
| M-5 | ✅ FIXED | `src/app/notifications/page.tsx` — `markAsRead` now does optimistic update + reverts on error; `fetchNotifications` logs errors |
| M-6 | ✅ FIXED | `src/app/profile/page.tsx` — individual query errors in `Promise.all` stats fetch now logged; `src/app/listings/(detail)/[id]/page.tsx` — winner bid/profile fetch errors now logged |
| L-2 | ✅ FIXED | `supabase/functions/close-expired-auctions/cors.ts` — CORS restricted to `https://byebuy.in` |
| L-6 | ✅ FIXED | `src/components/Navbar.tsx` — theme `localStorage` read validated at runtime + wrapped in `try/catch` |

### DB Migrations Created (apply after 2026-04-21 when billing is resolved)

| Issue | Migration File | What It Does |
|---|---|---|
| B-5 | `20260414000001_add_tags_to_listings_with_seller_email.sql` | Adds `l.tags` column to `listings_with_seller_email` view |
| H-4 + B-6 | `20260414000002_create_user_notifications_table.sql` | Creates `user_notifications` table, RLS policies, bid notification trigger, auction-close winner notification trigger |
| B-2 | `20260414000003_fix_listing_images_storage_policies.sql` | Enforces `{user_id}/...` path ownership on INSERT, adds DELETE policy, sets 5 MB limit + image MIME types |
| B-3 | `20260414000004_consolidate_profiles_rls_policies.sql` | Drops 3 redundant/duplicate policies on `profiles` table |
| B-7 / Schema drift | `20260414000005_add_get_public_seller_profile_function.sql` | Captures `get_public_seller_profile` RPC in migrations (was live-only) |
| B-8 | `20260414000006_remove_duplicate_avatars_policy.sql` | Drops duplicate `avatars` bucket UPDATE policy |
| Schema drift | `20260414000007_capture_push_subscriptions_table.sql` | Captures `push_subscriptions` table + RLS in migrations (was live-only) |
| B-4 / L-3 | `20260414000008_fix_email_validation_trigger.sql` | Re-points trigger to `validate_new_user_email` (with Gmail whitelist); drops dead `validate_user_email_domain` |

### Still Requires Manual Action

| Issue | What's Needed |
|---|---|
| B-1 | **Cron job wrong auth token (auctions never auto-close)** — Migration template created at `supabase/migrations/20260414000009_fix_cron_job_auth_token.MANUAL.sql`. Open that file, paste the real `CLOSE_EXPIRED_AUCTIONS_SECRET` from Supabase Dashboard → Edge Functions → `close-expired-auctions` → Environment Variables, then run it in the SQL editor. Do NOT commit the secret to git. |
| B-9 | ✅ NO CODE TO FIX — The push subscription frontend registration code does not exist in the current codebase (the PWA guide is a future implementation spec). The 141 rows in `push_subscriptions` were created by an old prototype. When the PWA push flow is implemented per `PWA_PUSH_GUIDE.md`, use `upsert({ onConflict: 'user_id' })` instead of `insert()` so that a second device overwrites the first rather than erroring with 23505. |
| B-10 | ⚠️ STUBS CREATED — Supabase MCP unauthorized (billing issue, resolves 2026-04-21). Stub files created at `supabase/functions/email-domain-validation/index.ts` and `supabase/functions/send-test-notification/index.ts` with instructions. After billing resolves: copy real source from Supabase Dashboard → Edge Functions → [function name] → Code, paste into stub files, then `supabase functions deploy <name>`. Do NOT deploy the stubs as-is. |
