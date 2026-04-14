# ByeBuy.in — Full Problem & Fix Reference
**Session date:** 2026-04-14
**Audit source:** `PROBLEMS_AUDIT.md` (audited 2026-02-26, live Supabase verified same day)
**DB billing issue:** Supabase MCP unauthorised during session — migrations written locally, apply after 2026-04-21

---

## Severity Key
| Code | Meaning |
|---|---|
| **C** | Critical — causes infinite loading / frozen UI |
| **H** | High — data loss, memory leak, or broken feature |
| **M** | Medium — degraded UX, stale data |
| **L** | Low — code quality / security hygiene |
| **B** | Backend — live Supabase DB / storage / cron issues |

## Status Key
| Badge | Meaning |
|---|---|
| ✅ FIXED | Code change applied to disk, live on next deploy |
| 🗄️ MIGRATION READY | SQL migration file written, apply after 2026-04-21 |
| ⚠️ STUB | Placeholder created, manual completion required |
| ✅ NO CHANGE NEEDED | Investigated — false positive or already handled |
| 🔲 FUTURE WORK | Out of scope for this session |

---

---

# CRITICAL BUGS (C)

---

## C-1 · `src/hooks/useAuth.ts` · Lines 11–14
**Status: ✅ FIXED**

### Problem
```typescript
supabase.auth.getSession().then(({ data: { session } }) => {
  setUser(session?.user ?? null);
  setLoading(false);
  // ← NO .catch() here
});
```
If `getSession()` rejected (network timeout, Supabase 5xx), `setLoading(false)` was never called. Every component that depends on `useAuth` stayed in a loading state forever. The `onAuthStateChange` listener at line 17 also calls `setLoading(false)` but only fires on auth state events — not on a pure network failure for `getSession`. So the fallback was unreliable. The only user escape was a full page reload or browser data wipe.

### Plan
Chain `.catch()` directly on the `getSession().then(...)` promise. Call `setUser(null)` and `setLoading(false)` in the catch. No structural changes to `onAuthStateChange`.

### Fix Applied
```typescript
supabase.auth.getSession()
  .then(({ data: { session } }) => {
    setUser(session?.user ?? null);
    setLoading(false);
  })
  .catch((err) => {
    console.error('[useAuth] getSession failed:', err);
    setUser(null);
    setLoading(false);
  });
```

---

## C-2 · `src/components/Navbar.tsx` · Lines 128–135
**Status: ✅ FIXED**

### Problem
```typescript
supabase.auth.getSession().then(async ({ data: { session } }) => {
  const initialUser = session?.user ?? null;
  setUser(initialUser);
  if (initialUser) await fetchUserProfile(initialUser.id);
  setLoading(false);
  // ← NO .catch()
});
```
Same class as C-1 but specifically in the Navbar. Critically, the `onAuthStateChange` listener in Navbar does NOT call `setLoading(false)` — it only updates `user` and `userProfile`. So if `getSession()` failed, `loading` stayed `true` permanently, rendering the navbar in skeleton-loader state and blocking all navigation links.

### Plan
Add `.catch()` after the `.then()` block. Call `setUser(null)` and `setLoading(false)` in the catch.

### Fix Applied
```typescript
supabase.auth.getSession()
  .then(async ({ data: { session } }) => {
    const initialUser = session?.user ?? null;
    setUser(initialUser);
    if (initialUser) await fetchUserProfile(initialUser.id);
    setLoading(false);
  })
  .catch((err) => {
    console.error('[Navbar] getSession failed:', err);
    setUser(null);
    setLoading(false);
  });
```

---

## C-3 · `src/stores/watchlistStore.ts` · Lines 209–218
**Status: ✅ FIXED**

### Problem
In `initializeWatchlist`, the `channel` variable was declared with `const` inside the `try` block:
```typescript
try {
  // ...
  const channel = await setupRealtimeChannel(...); // declared inside try
  if (get().currentUserId === userId) {
    set({ realtimeSubscription: channel });
  } else {
    await cleanupRealtimeChannel(channel);
  }
} catch (error) {
  set({ realtimeSubscription: null }); // ← channel variable not accessible here
}
```
If `setupRealtimeChannel` succeeded (returning a live channel) but something between lines 197–207 then threw unexpectedly (e.g. a Zustand `set()` error), the channel would be orphaned — the catch block couldn't access the `channel` const from the try scope to clean it up.

### Plan
Declare `let channel: RealtimeChannel | null = null` before the try block. In the catch, explicitly call `cleanupRealtimeChannel(channel)` before clearing state. Set `channel = null` after transferring ownership to the store to avoid double-cleanup.

### Fix Applied
```typescript
let channel: RealtimeChannel | null = null;
try {
  // ...
  channel = await setupRealtimeChannel(...);
  if (get().currentUserId === userId) {
    set({ realtimeSubscription: channel });
    channel = null; // ownership transferred to store
  } else {
    await cleanupRealtimeChannel(channel);
    channel = null;
  }
} catch (error) {
  if (channel) await cleanupRealtimeChannel(channel); // ← now reachable
  set({ realtimeSubscription: null, ... });
}
```

---

## C-4 · `src/components/WatchlistButton.tsx` · Lines 37–79
**Status: ✅ NO CHANGE NEEDED (false positive)**

### Problem (as audited)
The audit claimed that when a PostgreSQL unique violation (23505) occurred, the function returned early leaving `isLoading` as `true` permanently, disabling the button until page reload.

### Investigation
Re-reading the code: the `return` at line 57 is inside a `try` block that has `finally { setIsLoading(false); }` at line 77. In JavaScript, `finally` runs on **all** exit paths from a `try` block, including early `return`. The button is NOT permanently locked.

### Conclusion
False positive. The `finally` clause already correctly handles all code paths. No fix needed.

---

---

# HIGH-SEVERITY BUGS (H)

---

## H-1 · `src/app/listings/page.tsx` · Lines 206–269
**Status: ✅ FIXED**

### Problem
The realtime channel was created with a hardcoded name:
```typescript
channel = supabase.channel('public-listings-active-page');
```
If `removeChannel` failed during cleanup (network issue), the channel remained active in Supabase's internal registry. On next component mount, a new channel with the same name was created — resulting in two channels simultaneously delivering events to old and new callbacks. This caused duplicate realtime events, potential duplicate state updates, and flickering or doubled-up listings.

### Plan
Use a unique channel name per mount by appending `Date.now()`. This ensures name collisions are impossible even if the old channel wasn't fully cleaned up before remount.

### Fix Applied
```typescript
channel = supabase.channel(`public-listings-active-${Date.now()}`);
```

---

## H-2 · `src/app/listings/(detail)/[id]/page.tsx` · Lines 170–172
**Status: ✅ FIXED**

### Problem
```typescript
bidsChannel.subscribe((s, e) => {
  if (s === 'CHANNEL_ERROR') console.error('Bids RT Error:', e);
  // ← no self-cleanup triggered on error
});
```
When a channel entered `CHANNEL_ERROR` state, the code only logged it. The channel remained active (or in a broken state) until the component unmounted and the cleanup function ran. In React Strict Mode's double-invoke during development, new channels could be created before old broken ones finished teardown, accumulating orphaned channels.

### Plan
In the `CHANNEL_ERROR` callback, immediately call `supabase.removeChannel()` on the affected channel. The cleanup `return () =>` function will still try to remove it on unmount, but Supabase handles removing an already-removed channel gracefully.

### Fix Applied
```typescript
bidsChannel.subscribe((s, e) => {
  if (s === 'CHANNEL_ERROR') {
    console.error('Bids RT Error:', e);
    supabase.removeChannel(bidsChannel);
  } else if (s === 'TIMED_OUT') console.warn('Bids RT Timeout');
});
listingChannel.subscribe((s, e) => {
  if (s === 'CHANNEL_ERROR') {
    console.error('Listing RT Error:', e);
    supabase.removeChannel(listingChannel);
  } else if (s === 'TIMED_OUT') console.warn('Listing RT Timeout');
});
```

---

## H-3 · `src/components/Navbar.tsx` · Lines 307–336
**Status: ✅ FIXED**

### Problem
```typescript
channel = supabase.channel(`noti-${user.id}`)
```
`supabase.removeChannel()` is async. The `useEffect([user])` cleanup fires the async call but doesn't await it. If `user` changed quickly (sign out → sign in in under 100ms), the async cleanup from the first effect might not have completed before the new effect created a new channel with the same name, leaving two channels delivering notifications simultaneously.

### Plan
Append `Date.now()` to the channel name. Since each mount gets a unique name, even if the old cleanup is still in-flight, the new channel never collides with it.

### Fix Applied
```typescript
channel = supabase.channel(`noti-${user.id}-${Date.now()}`)
```

---

## H-4 + B-6 · `user_notifications` table missing
**Status: 🗄️ MIGRATION READY — `20260414000002_create_user_notifications_table.sql`**

### Problem
The `user_notifications` table was referenced throughout the frontend (Navbar unread badge, notifications page) but **did not exist in the live DB** (confirmed via Supabase MCP query). Every query to it returned an error that was silently swallowed. The notification badge never appeared. The notifications page always showed an empty state with no user-facing error.

Additionally, the notification pipeline was incomplete end-to-end:
- `push_subscriptions` table existed with 141 rows (all users registered)
- `send-test-notification` edge function existed on live
- But `user_notifications` table, the insert triggers, and the delivery logic were all missing

### Plan
1. Create `user_notifications` table with columns: `id`, `user_id`, `message`, `type` (bid/listing/system), `read`, `link`, `created_at`
2. Add RLS: users can SELECT/UPDATE/DELETE own rows; INSERT only from service role
3. Add indexes for fast unread badge query
4. Add DB trigger `trg_notify_seller_on_bid` — inserts notification when a bid is placed on a seller's listing
5. Add DB trigger `trg_notify_winner_on_close` — inserts notification when listing status changes to 'closed' and a winner is set

### Fix Applied
Migration file `20260414000002_create_user_notifications_table.sql` creates:
- The table with all required columns
- Two indexes (by `user_id`; partial index on unread rows)
- RLS enabled with 3 policies (SELECT, UPDATE, DELETE for own rows)
- `notify_seller_on_bid()` trigger function + `trg_notify_seller_on_bid` trigger on `bids` table
- `notify_winner_on_close()` trigger function + `trg_notify_winner_on_close` trigger on `listings` table

**Also fixed in the same pass (M-5):** `markAsRead` in `notifications/page.tsx` now does optimistic update + revert on failure, and `fetchNotifications` now logs errors instead of silently ignoring them.

---

## H-5 · `src/app/listings/(detail)/[id]/page.tsx` · Line ~147
**Status: ✅ FIXED**

### Problem
```typescript
const { data: WUserData } = await supabase
  .from('users')
  .select('email')
  .eq('id', fetchedListingData.winning_bidder_id)
  .single();
```
`public.users` does not exist. Auth users live in `auth.users`, which is not accessible via PostgREST with the anon key. This query always failed silently (PostgREST 404), `WUserData` was always `null`, and the winner's email was never shown on closed auctions.

### Plan
Replace `from('users')` with `from('profiles')`. The `profiles` table has an `email` column (confirmed from live schema) and the RLS policy allows any authenticated user to read all profiles.

### Fix Applied
```typescript
const { data: WUserData, error: wUserErr } = await supabase
  .from('profiles')  // ← was 'users'
  .select('email')
  .eq('id', fetchedListingData.winning_bidder_id)
  .single();
if (wUserErr) console.error('[ListingDetail] Winner profile fetch error:', wUserErr.message);
if (WUserData) setWinnerEmail(WUserData.email);
```

---

## H-6 · `src/app/listings/(detail)/[id]/page.tsx` · Line ~184
**Status: ✅ FIXED**

### Problem
```typescript
useEffect(() => {
  // countdown interval setup — calls loadData() when auction ends
}, [listing?.end_time, listing?.status, auctionEnded, loadData, id]);
```
`loadData` was listed as a dependency. When bids arrived via realtime, state updates (`setListing`, `setBids`) caused React to re-evaluate `loadData`'s `useCallback` — and if its dependencies changed, `loadData` got a new reference. This caused the countdown `useEffect` to re-run: clearing the existing interval and creating a new one. During active bidding this could happen multiple times per second, causing the countdown timer to flicker and waste CPU.

### Plan
Remove `loadData` from the countdown deps array. Store `loadData` in a ref (`loadDataRef`) that is kept up-to-date via a separate `useEffect`. The countdown interval calls `loadDataRef.current()` instead of `loadData` directly — this breaks the dependency chain without creating a stale closure.

### Fix Applied
```typescript
const loadDataRef = useRef(loadData);
useEffect(() => { loadDataRef.current = loadData; }, [loadData]);

useEffect(() => {
  // ... countdown logic calls loadDataRef.current() when auction ends
}, [listing?.end_time, listing?.status, auctionEnded, id]); // loadData removed
```
Also added `useRef` to the import line.

---

## H-7 · `src/components/AuthWatchlistManager.tsx` · Lines 16–64
**Status: ✅ FIXED**

### Problem
On initial page load, Supabase fires both `getSession()` (used inside `initializeAuth`) and an `INITIAL_SESSION`/`SIGNED_IN` event from `onAuthStateChange`. Both paths called `initializeWatchlist(userId)` nearly simultaneously:
```typescript
// Path 1:
const initializeAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) await initializeWatchlist(session.user.id);
};

// Path 2:
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    await initializeWatchlist(session.user.id); // fires at the same time
  }
});
```
The watchlist store's guard (`if (get().currentUserId === userId && get().hasFetchedInitialWatchlist) return`) only protected against double-init if the first call had already completed and set `hasFetchedInitialWatchlist = true`. If both calls arrived before either completed, both passed the guard and triggered duplicate initialisation — setting up two realtime channels and fetching the watchlist twice.

### Plan
Add an `initializingForUserId` ref in `AuthWatchlistManager`. Before calling `initializeWatchlist(userId)`, check if that userId is already being initialised. If so, return immediately. Clear the ref when initialisation completes (in `finally`).

### Fix Applied
```typescript
const initializingForUserId = useRef<string | null>(null);

const safeInitializeWatchlist = async (userId: string) => {
  if (initializingForUserId.current === userId) return; // block concurrent call
  initializingForUserId.current = userId;
  try {
    await initializeWatchlist(userId);
  } finally {
    initializingForUserId.current = null;
  }
};
```
Both `initializeAuth` and the `onAuthStateChange` handler now call `safeInitializeWatchlist` instead of `initializeWatchlist` directly. On `SIGNED_OUT`, `initializingForUserId.current` is also cleared.

---

---

# MEDIUM-SEVERITY BUGS (M)

---

## M-1 · `src/components/Navbar.tsx` · Line ~195
**Status: ✅ NO CHANGE NEEDED (false positive)**

### Problem (as audited)
The click-outside handler's `useEffect` listed only `isMobileMenuOpen` in its deps, not `isUserMenuOpen`. The audit claimed `isUserMenuOpen` would be stale inside the handler.

### Investigation
Re-reading the handler: it only calls `setIsUserMenuOpen(false)` (a React state setter — always fresh, not a stale closure) and never reads `isUserMenuOpen` directly. The dep array `[isMobileMenuOpen]` is correct because `isMobileMenuOpen` is the only state value actually read inside the handler body.

### Conclusion
False positive. No fix needed.

---

## M-2 · `src/app/listings/page.tsx` · Lines 231–237
**Status: ✅ FIXED**

### Problem
The subscribe status callback didn't check `isMounted` before running:
```typescript
.subscribe((status) => {
  console.log('Listings RT subscription status:', status);
  // ... no isMounted check
});
```
If the component unmounted between channel creation and the subscribe callback firing, the callback still ran (harmless for now since it only logs, but a maintenance trap).

### Plan
Add `if (!isMounted) return` at the top of the subscribe callback as defensive hygiene.

### Fix Applied
```typescript
.subscribe((status) => {
  if (!isMounted) return;
  console.log('Listings RT subscription status:', status);
  // ...
});
```

---

## M-3 · `src/app/my-listings/page.tsx` · Lines 100–139
**Status: ✅ FIXED (comment added)**

### Problem (as audited)
`fetchUserDataAndListings` was a `useCallback` with an empty dependency array `[]`, which the audit flagged as potentially closing over stale state.

### Investigation
Reading the function: it only closes over `supabase` (a module-level singleton — never changes), `setLoading`, `setError`, `setDeleteError`, `setFinalizeMessage`, `setListings` (React state setters — always stable), and `parsePhotosJson` (a pure function in scope). All user-specific data arrives via the `u: User` parameter. The empty dep array is intentional and correct.

### Fix Applied
Added an explanatory comment so future developers don't incorrectly add deps:
```typescript
[] // eslint-disable-line react-hooks/exhaustive-deps
// Safe: only closes over `supabase` (module singleton) and local setters.
// All user-specific data arrives via the `u` parameter, not closed-over state.
```

---

## M-4 · `src/components/Navbar.tsx` · Lines 53–64
**Status: ✅ FIXED**

### Problem
```typescript
localStorage.setItem('theme', newTheme); // ← no try/catch
```
`localStorage.setItem` throws `QuotaExceededError` / `DOMException` in Safari private mode and in some environments where storage is full or disabled. This call was inside a React `setTheme` state updater function — an unhandled exception there could crash the component tree.

### Plan
Wrap in `try/catch`. Log a warning on failure. Theme toggle still works visually (state updates) even if the preference can't be persisted.

### Fix Applied
```typescript
try {
  localStorage.setItem('theme', newTheme);
} catch {
  console.warn('[Navbar] Could not save theme preference to localStorage');
}
```

---

## M-5 · `src/app/notifications/page.tsx`
**Status: ✅ FIXED**

### Problem
```typescript
const markAsRead = async (notificationId: string) => {
  await supabase
    .from('user_notifications')
    .update({ read: true })
    .eq('id', notificationId);
  // ← no error check, no UI revert on failure
};
```
If the update failed, the notification appeared read in the UI but on next load reappeared as unread. No error was shown to the user. Additionally, `fetchNotifications` used `if (!error && data)` — silently ignoring fetch errors and leaving the page in an empty state with no explanation.

### Plan
1. Optimistic update: set `read: true` in local state immediately on click
2. On failure: revert to `read: false` in local state
3. `fetchNotifications`: add `else { console.error(...) }` branch

### Fix Applied
```typescript
const markAsRead = async (notificationId: string) => {
  // Optimistic update
  setNotifications(prev =>
    prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
  );
  const { error } = await supabase
    .from('user_notifications')
    .update({ read: true })
    .eq('id', notificationId);
  if (error) {
    console.error('[Notifications] Failed to mark as read:', error.message);
    // Revert
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: false } : n)
    );
  }
};
```

---

## M-6 · Various files — Silent Supabase error swallowing
**Status: ✅ FIXED (key locations)**

### Problem
Pattern seen repeatedly throughout the codebase:
```typescript
const { data, error } = await supabase.from('...').select('...');
if (!error && data) {
  setSomeState(data);
}
// error is never logged or surfaced
```
When Supabase returned an error (wrong RLS, missing table, network issue), the page showed an empty state with no indication of why. Particularly bad on the listing detail page where winner bid/profile queries were `const { data } = await supabase...` with no destructured `error` at all.

### Fix Applied
**`src/app/profile/page.tsx`** — Stats `Promise.all`: each query now destructures `error` individually and logs it:
```typescript
const [
  { count: act, error: e1 },
  { count: sold, error: e2 },
  { count: won, error: e3 },
] = await Promise.all([...]);
if (e1) console.error('[ProfilePage] Active listings count error:', e1.message);
if (e2) console.error('[ProfilePage] Items sold count error:', e2.message);
if (e3) console.error('[ProfilePage] Auctions won count error:', e3.message);
```

**`src/app/listings/(detail)/[id]/page.tsx`** — Winner bid and winner profile fetches now destructure and log errors (was completely silent before).

---

---

# LOW-SEVERITY / CODE QUALITY (L)

---

## L-1 · Bid placed — highest-bid display lag
**Status: ✅ NO CHANGE NEEDED**

### Problem (as audited)
After placing a bid, the highest-bid display might not update until the realtime INSERT event fires.

### Investigation
The code already performs an optimistic local update immediately after `executePlaceBid` succeeds — the new bid is added to the `bids` state array at once. `currentHighestBidVal` is derived from `bids[0]?.bid_price` via `useMemo`, so it updates instantly. The display does not lag.

### Conclusion
False positive — already handled by existing optimistic update logic.

---

## L-2 · `supabase/functions/close-expired-auctions/cors.ts` — CORS open to `*`
**Status: ✅ FIXED**

### Problem
```typescript
'Access-Control-Allow-Origin': '*'
```
The function is called server-to-server (pg_cron → edge function) so CORS is irrelevant for that path. However, since `verify_jwt: false` is set on this function, a malicious actor could attempt to call it from a browser. Open CORS doesn't provide security (the real protection is the `CLOSE_EXPIRED_AUCTIONS_SECRET` check), but it's poor hygiene.

### Fix Applied
```typescript
'Access-Control-Allow-Origin': 'https://byebuy.in'
```

---

## L-3 · `validate_new_user_email()` — defined but never triggered
**Status: 🗄️ MIGRATION READY — `20260414000008_fix_email_validation_trigger.sql`**
*(See B-4 below — same issue, addressed together)*

---

## L-4 · Auction auto-close not scheduled
**Status: ⚠️ STUB — `20260414000009_fix_cron_job_auth_token.MANUAL.sql`**
*(See B-1 below — same issue, addressed there)*

---

## L-5 · Single shared Supabase client — multi-tab session sync
**Status: ✅ NO CHANGE NEEDED**

### Problem (as audited)
If one tab logs out, all other open tabs lose their session silently.

### Investigation
Supabase JS v2 broadcasts `SIGNED_OUT` events across tabs via `localStorage` events. With C-1 and C-2 now fixed, the `onAuthStateChange` listeners in `useAuth` and `Navbar` are robust and will correctly receive and handle the `SIGNED_OUT` event across tabs. No additional fix is needed — fixing the auth listeners (C-1, C-2) resolves the multi-tab impact of this issue.

---

## L-6 · `src/components/Navbar.tsx` — Theme `localStorage` read without runtime validation
**Status: ✅ FIXED**

### Problem
```typescript
const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
```
TypeScript `as` cast doesn't validate at runtime. If someone manually set `localStorage.theme = "auto"` or some corrupted value, the theme state would receive an invalid value. Additionally `localStorage.getItem` itself can throw in Safari private mode.

### Fix Applied
```typescript
let savedTheme: 'light' | 'dark' | null = null;
try {
  const raw = localStorage.getItem('theme');
  if (raw === 'light' || raw === 'dark') savedTheme = raw; // runtime validation
} catch {
  // localStorage unavailable (private mode on some browsers)
}
```

---

---

# BACKEND / SUPABASE ISSUES (B)

---

## B-1 · Cron Job Sending Wrong Auth Token
**Status: ⚠️ STUB — `20260414000009_fix_cron_job_auth_token.MANUAL.sql`**

### Problem
The pg_cron job "Close Expired Auctions" (runs every 30 min) sends:
```sql
headers := jsonb_build_object('Authorization', 'Bearer Ragwl/@123@new')
```
The edge function validates `authHeader !== 'Bearer ' + CLOSE_EXPIRED_AUCTIONS_SECRET` and returns **401** on mismatch. `Ragwl/@123@new` is an old hardcoded password, not the actual secret in the function's environment variables. **Every cron invocation returns 401 — expired auctions are never auto-closed.**

Additionally, `timeout_milliseconds := 1000` (1 second) is insufficient — any Supabase latency causes the HTTP call to time out before the function completes.

### Plan
Update the pg_cron job via `cron.alter_job()` with the correct secret and increase timeout to 15 seconds. The secret must not be committed to version control.

### Fix Applied
Created `supabase/migrations/20260414000009_fix_cron_job_auth_token.MANUAL.sql` with a placeholder:
```sql
SELECT cron.alter_job(
    job_id := 1,
    command := $cmd$
        SELECT net.http_post(
            url := 'https://efkggsqrpmilxfmszdlz.supabase.co/functions/v1/close-expired-auctions',
            headers := jsonb_build_object('Authorization', 'Bearer <PASTE_SECRET_HERE>'),
            timeout_milliseconds := 15000
        );
    $cmd$
);
```

**To complete:**
1. Supabase Dashboard → Edge Functions → `close-expired-auctions` → Environment Variables → copy `CLOSE_EXPIRED_AUCTIONS_SECRET`
2. Paste into the file replacing `<PASTE_SECRET_HERE>`
3. Run in SQL Editor — do NOT commit the secret to git
4. File uses `.MANUAL.sql` extension so `supabase db push` won't auto-apply it

---

## B-2 · `listing-images` Bucket — No User Ownership Check on Upload
**Status: 🗄️ MIGRATION READY — `20260414000003_fix_listing_images_storage_policies.sql`**

### Problem
Storage policy `allow_uploads` only checked:
```sql
(bucket_id = 'listing-images') AND (auth.role() = 'authenticated')
```
Any authenticated user could upload to **any path**, including `{another_user_id}/...`. The `avatars` bucket correctly enforced `owner = auth.uid()` — `listing-images` did not. Additionally: no DELETE policy (sellers couldn't remove their own photos), no file size limit (`file_size_limit: null` — unlimited uploads).

### Plan
1. Replace INSERT policy to enforce `{user_id}/...` folder ownership
2. Add DELETE policy for own files
3. Set 5 MB size limit and restrict to image MIME types

### Fix Applied
Migration `20260414000003_fix_listing_images_storage_policies.sql`:
```sql
-- Drop permissive policy
DROP POLICY IF EXISTS "allow_uploads" ON storage.objects;

-- New INSERT: enforces folder ownership
CREATE POLICY "listing_images_insert_own_folder"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'listing-images'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- New DELETE: own files only
CREATE POLICY "listing_images_delete_own"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Size limit + MIME types
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif']
WHERE id = 'listing-images';
```

---

## B-3 · Duplicate and Conflicting RLS Policies on `profiles`
**Status: 🗄️ MIGRATION READY — `20260414000004_consolidate_profiles_rls_policies.sql`**

### Problem
The `profiles` table had 7 policies, several conflicting:

**SELECT (two, both for `authenticated`):**
- `"Authenticated users can view other user profiles for contact"` — `USING: true` (all rows)
- `"Users can read their own profile only"` — `USING: auth.uid() = id` (own row only)

With PERMISSIVE policies, these OR together → effectively `true` → all rows visible. The second policy was redundant and created false impression of restricted access.

**UPDATE (three total):**
- `"Enable users to update their own profile"` — role: `authenticated`, `auth.uid() = id` ✓
- `"Users can update their own profile"` — role: `public`, `auth.uid() = id` (duplicate)
- `"Users can update their own profile data"` — role: `public`, `auth.uid() = id` (identical duplicate)

### Plan
Drop the 3 redundant policies. Keep the 4 clean intentional ones: broad SELECT, authenticated UPDATE, INSERT blocked, DELETE blocked.

### Fix Applied
Migration `20260414000004_consolidate_profiles_rls_policies.sql`:
```sql
DROP POLICY IF EXISTS "Users can read their own profile only" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile data" ON public.profiles;
```

---

## B-4 · `validate_new_user_email()` Function — Wrong Trigger Target (Dead Code)
**Status: 🗄️ MIGRATION READY — `20260414000008_fix_email_validation_trigger.sql`**

### Problem
The migration creates `validate_new_user_email()` (has Gmail whitelist for developer accounts). But the live trigger `before_user_insert_validate_email` was attached to a **different function**: `validate_user_email_domain()`.

`validate_user_email_domain` (active): blocks ALL non-`@iimidr.ac.in` emails with no exceptions — no Gmail whitelist.
`validate_new_user_email` (dead): whitelists dev Gmail accounts, then does the `@iimidr.ac.in` check.

Result: developer accounts using Gmail could not be re-invited/re-onboarded. `validate_new_user_email` was deployed but never called — dead code.

### Plan (Option A — enable whitelist)
Re-point the trigger to `validate_new_user_email`. Drop the dead `validate_user_email_domain`.

### Fix Applied
Migration `20260414000008_fix_email_validation_trigger.sql`:
```sql
CREATE OR REPLACE FUNCTION public.validate_new_user_email() ... ; -- idempotent

DROP TRIGGER IF EXISTS before_user_insert_validate_email ON auth.users;
CREATE TRIGGER before_user_insert_validate_email
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.validate_new_user_email();

DROP FUNCTION IF EXISTS public.validate_user_email_domain();
```

---

## B-5 · `listings_with_seller_email` View Missing `tags` Column
**Status: 🗄️ MIGRATION READY — `20260414000001_add_tags_to_listings_with_seller_email.sql`**

### Problem
The view definition for `listings_with_seller_email` did not include `l.tags` (intentionally commented out in the last migration with `-- l.tags, -- This view did not have tags previously`). The listing detail page fetches from this view for active/open auctions, so `listing.tags` was always `undefined` — tags were never displayed on the listing detail page for active auctions.

### Plan
Recreate the view with `l.tags` included.

### Fix Applied
Migration `20260414000001_add_tags_to_listings_with_seller_email.sql`:
```sql
CREATE OR REPLACE VIEW public.listings_with_seller_email AS
SELECT l.id, l.title, l.description, l.min_price, l.photos, l.seller_id,
       l.end_time, l.created_at, l.upper_cap, l.rules, l.tags, -- ← added
       l.status, l.winning_bid_id, l.winning_bidder_id,
       u.email AS seller_email
FROM public.listings l LEFT JOIN auth.users u ON l.seller_id = u.id;
```

---

## B-6 · `push_subscriptions` Table Exists But Notification Pipeline Incomplete
**Status: 🗄️ MIGRATION READY** *(addressed by H-4 migration)*

### Problem
141 users had a `push_subscriptions` row. The `send-test-notification` edge function existed. But `user_notifications` table was completely absent — no notification records, no insert triggers, no delivery logic. The push subscription system was half-implemented infrastructure stubs.

### Fix Applied
The `user_notifications` table and DB triggers were created in migration `20260414000002`. The remaining gap (calling `send-test-notification` from the trigger pipeline to deliver actual browser push) is future work blocked on B-10.

---

## B-7 · `get_public_seller_profile` Function Not in Migrations
**Status: 🗄️ MIGRATION READY — `20260414000005_add_get_public_seller_profile_function.sql`**

### Problem
The live DB had a `get_public_seller_profile(profile_id_to_fetch uuid)` SECURITY DEFINER function that correctly bypasses RLS to expose seller profile data to unauthenticated users. It was added manually (not via migration). A `supabase db reset` would have removed it, breaking the public seller profile page.

### Fix Applied
Migration `20260414000005_add_get_public_seller_profile_function.sql` captures it with `CREATE OR REPLACE FUNCTION` (safe to run against live DB that already has it).

---

## B-8 · `avatars` Bucket — Duplicate UPDATE Policies
**Status: 🗄️ MIGRATION READY — `20260414000006_remove_duplicate_avatars_policy.sql`**

### Problem
Two functionally identical UPDATE policies on the `avatars` bucket:
- `"Authenticated users can manage their own avatar"` — `(bucket_id = 'avatars') AND (owner = auth.uid())`
- `"Authenticated users can update their own avatar"` — identical

Leftover from a policy rename. Harmless in practice but confusing.

### Fix Applied
Migration `20260414000006_remove_duplicate_avatars_policy.sql`:
```sql
DROP POLICY IF EXISTS "Authenticated users can manage their own avatar" ON storage.objects;
```

---

## B-9 · `push_subscriptions` UNIQUE Constraint — One Device Per User
**Status: ✅ NO CHANGE NEEDED (no frontend code to fix)**

### Problem (as audited)
`UNIQUE(user_id)` on `push_subscriptions` — second device registration would fail with 23505 or silently overwrite.

### Investigation
There is **no push subscription frontend registration code** in the current codebase. The PWA guide (`PWA_PUSH_GUIDE.md`) is a future implementation spec. The 141 existing rows were likely created by an old prototype. Nothing to fix now.

### For Future Implementation
When building the push flow per `PWA_PUSH_GUIDE.md`, use `upsert` with `onConflict: 'user_id'` so the latest device always wins gracefully:
```typescript
await supabase.from('push_subscriptions').upsert(
  { user_id, subscription_details },
  { onConflict: 'user_id' }
);
```

---

## B-10 · Two Edge Functions Exist in Production But Not Locally
**Status: ⚠️ STUBS CREATED**

### Problem
- `email-domain-validation` (ACTIVE, verify_jwt: true) — deployed but not in `supabase/functions/`
- `send-test-notification` (ACTIVE, verify_jwt: false) — deployed but not in `supabase/functions/`

These functions cannot be updated, version-controlled, or redeployed from the current codebase. Any changes must be made directly in the Supabase dashboard.

### Plan
Pull function source from live dashboard, add to local `supabase/functions/` for version control.

### Fix Applied
Could not pull live source — Supabase MCP unauthorised during session (billing issue, resolves 2026-04-21). Stub files created at:
- `supabase/functions/email-domain-validation/index.ts`
- `supabase/functions/send-test-notification/index.ts`

Each stub has detailed instructions at the top.

**To complete after April 21:**
1. Dashboard → Edge Functions → `email-domain-validation` → Code tab → copy → paste into stub
2. Dashboard → Edge Functions → `send-test-notification` → Code tab → copy → paste into stub
3. `supabase functions deploy email-domain-validation`
4. `supabase functions deploy send-test-notification`

**Notes:**
- `email-domain-validation`: verify_jwt = true. Before redeploying, confirm it doesn't duplicate the DB trigger logic (migration `20260414000008` already fixes the trigger correctly).
- `send-test-notification`: verify_jwt = false (no auth required). Likely uses VAPID keys stored in env vars. Once `user_notifications` table exists (migration `20260414000002`), wire this function into the notification pipeline so DB trigger → edge function → browser push.

---

## B-11 · Schema Drift — `push_subscriptions` Table Not in Migrations
**Status: 🗄️ MIGRATION READY — `20260414000007_capture_push_subscriptions_table.sql`**

### Problem
`push_subscriptions` table existed in live DB with 141 rows but was absent from all migration files. A `supabase db reset` would have lost the table definition.

### Fix Applied
Migration `20260414000007_capture_push_subscriptions_table.sql` uses `CREATE TABLE IF NOT EXISTS` so it's safe to run against the live DB (won't error or affect existing rows). Also captures all 4 RLS policies using a `DO $$ BEGIN IF NOT EXISTS ... END $$` block for idempotency.

---

---

# April 21 Checklist (After Billing Resolves)

Apply these in order:

```
1.  supabase/migrations/20260414000001_add_tags_to_listings_with_seller_email.sql
2.  supabase/migrations/20260414000002_create_user_notifications_table.sql
3.  supabase/migrations/20260414000003_fix_listing_images_storage_policies.sql
4.  supabase/migrations/20260414000004_consolidate_profiles_rls_policies.sql
5.  supabase/migrations/20260414000005_add_get_public_seller_profile_function.sql
6.  supabase/migrations/20260414000006_remove_duplicate_avatars_policy.sql
7.  supabase/migrations/20260414000007_capture_push_subscriptions_table.sql
8.  supabase/migrations/20260414000008_fix_email_validation_trigger.sql
```

Then complete the stubs:
```
9.  20260414000009_fix_cron_job_auth_token.MANUAL.sql  ← paste real secret, run in SQL editor
10. supabase/functions/email-domain-validation/index.ts ← paste real source, deploy
11. supabase/functions/send-test-notification/index.ts  ← paste real source, deploy
```

---

# Files Changed This Session

### Modified
| File | Issues Fixed |
|---|---|
| `src/hooks/useAuth.ts` | C-1 |
| `src/components/Navbar.tsx` | C-2, H-3, M-4, L-6 |
| `src/components/AuthWatchlistManager.tsx` | H-7 |
| `src/stores/watchlistStore.ts` | C-3 |
| `src/app/listings/page.tsx` | H-1, M-2 |
| `src/app/listings/(detail)/[id]/page.tsx` | H-2, H-5, H-6, M-6 |
| `src/app/notifications/page.tsx` | M-5 |
| `src/app/profile/page.tsx` | M-6 |
| `src/app/my-listings/page.tsx` | M-3 |
| `supabase/functions/close-expired-auctions/cors.ts` | L-2 |
| `PROBLEMS_AUDIT.md` | Status log appended |

### Created
| File | Purpose |
|---|---|
| `supabase/migrations/20260414000001_add_tags_to_listings_with_seller_email.sql` | B-5 |
| `supabase/migrations/20260414000002_create_user_notifications_table.sql` | H-4 + B-6 |
| `supabase/migrations/20260414000003_fix_listing_images_storage_policies.sql` | B-2 |
| `supabase/migrations/20260414000004_consolidate_profiles_rls_policies.sql` | B-3 |
| `supabase/migrations/20260414000005_add_get_public_seller_profile_function.sql` | B-7 / Schema drift |
| `supabase/migrations/20260414000006_remove_duplicate_avatars_policy.sql` | B-8 |
| `supabase/migrations/20260414000007_capture_push_subscriptions_table.sql` | B-11 / Schema drift |
| `supabase/migrations/20260414000008_fix_email_validation_trigger.sql` | B-4 / L-3 |
| `supabase/migrations/20260414000009_fix_cron_job_auth_token.MANUAL.sql` | B-1 stub |
| `supabase/functions/email-domain-validation/index.ts` | B-10 stub |
| `supabase/functions/send-test-notification/index.ts` | B-10 stub |
| `SESSION_FIXES_2026_04_14.md` | This file |
