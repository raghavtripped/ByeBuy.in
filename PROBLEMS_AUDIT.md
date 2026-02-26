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

| Reference in Code | Status | Impact |
|---|---|---|
| `user_notifications` table | **Not in any migration** | Notification system entirely broken |
| `public.users` table | **Doesn't exist** (should be `auth.users`) | Winner email never shown on closed auctions |
| `listing_chats_with_sender_email` view | Defined in migration ✓ | OK |
| `listings_with_highest_bid` view | Defined in migration ✓ | OK |
| `finalize_auction_outcome()` RPC | Defined in migration ✓ | OK |
| `close_auction()` RPC (two overloads) | Defined in migration ✓ | OK |
| Storage buckets `listing-images`, `avatars` | **Created manually, not in migrations** | Will break in fresh deploy |

---

## Priority Fix Order

1. **C-1, C-2** — Add `.catch()` to all `getSession()` calls; always call `setLoading(false)` in catch.
2. **C-3** — In watchlist store catch block, call `supabase.removeChannel(channel)` before clearing the reference.
3. **C-4** — In `WatchlistButton`, call `setIsLoading(false)` on all early returns.
4. **H-4** — Create the `user_notifications` migration or remove all references if the feature isn't ready.
5. **H-5** — Replace `supabase.from('users')` with a join through `profiles` or a service-role RPC.
6. **H-1, H-2, H-3** — Audit every realtime channel setup; ensure cleanup is unconditional and synchronous where possible.
7. **H-6** — Move `loadData` out of `useEffect` dependencies for the countdown, or use a ref.
8. **H-7** — Add a flag to the watchlist store preventing concurrent init calls.
9. **M-1 through M-6** — Fix missing deps, add error surfaces, wrap localStorage in try/catch.
10. **L-3, L-4** — Attach `validate_new_user_email` trigger and set up auction auto-close schedule.

---

*Next step: Connect to Supabase via MCP to verify live DB state against items H-4, H-5, and the data model gaps above.*
