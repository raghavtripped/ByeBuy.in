## ByeBuy PWA + Web Push Notifications: End‑to‑End Implementation Guide

This document is a complete, copy‑paste friendly guide to turn ByeBuy into a fully‑featured Progressive Web App (PWA) with Web Push notifications on Android, iOS (installed PWA, iOS 16.4+), and desktop browsers.

It is tailored to the current codebase (Next.js 15 App Router, Supabase, Vercel) and covers: manifest, icons, service worker, offline support, Workbox integration, push subscription flow, Supabase schema/RLS, API routes to subscribe/unsubscribe/send, VAPID keys, environment variables, platform caveats, testing, deployment, and troubleshooting.

---

### At a Glance (What’s Missing Today)

- No `manifest.webmanifest`, no service worker, no install handling
- No push subscription flow, and no backend to store/send subscriptions
- Current notifications are in‑app toasts only (`NotificationProvider` + Zustand)

---

## 1) Prerequisites

- Node.js 18+ and npm
- Vercel project configured for `byebuy.in`
- Supabase project (already in use) and CLI if you run migrations locally
- HTTPS (Vercel provides HTTPS)

---

## 2) Install Dependencies

We’ll use a maintained Next.js PWA plugin and a server library for Web Push.

```bash
npm install @ducanh2912/next-pwa web-push
```

Notes:
- `@ducanh2912/next-pwa` is compatible with Next 13–15 and App Router.
- `web-push` runs on the server to send push messages using VAPID.

---

## 3) Create a Web App Manifest

Add `public/manifest.webmanifest` (origin‑scoped). Example:

```json
{
  "name": "ByeBuy – Campus Auctions",
  "short_name": "ByeBuy",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-256.png", "sizes": "256x256", "type": "image/png" },
    { "src": "/icons/icon-384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Link it in `src/app/layout.tsx` `<head>` (add if missing):

```tsx
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />
<meta name="theme-color" content="#000000" />
```

---

## 4) Provide Icons

Place PNGs in `public/icons/`:

- Regular: `icon-192.png`, `icon-256.png`, `icon-384.png`, `icon-512.png`
- Maskable: `maskable-192.png`, `maskable-512.png`
- Apple touch icons: `apple-touch-icon-120.png`, `apple-touch-icon-152.png`, `apple-touch-icon-167.png`, `apple-touch-icon-180.png`

How to generate:
- Use PWABuilder or RealFaviconGenerator to export required sizes from your logo (SVG preferred).

---

## 5) Enable PWA with Workbox (next-pwa)

Update `next.config.ts` to wrap config with the plugin and set caching/offline fallbacks. Example:

```ts
// next.config.ts
import type { NextConfig } from 'next';
import withPWA from '@ducanh2912/next-pwa';

const baseConfig: NextConfig = {
  images: { /* existing images config… */ },
  async headers() { /* existing headers… */ }
};

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  fallbacks: { document: '/offline' },
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.destination === 'image',
        handler: 'CacheFirst',
        options: { cacheName: 'images', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } }
      },
      {
        urlPattern: ({ url }) => url.origin === self.location.origin,
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'pages' }
      }
    ]
  },
})(baseConfig);
```

Create an offline page (simple fallback): `src/app/offline/page.tsx`.

---

## 6) Add a Custom Service Worker for Push

We’ll extend the plugin with a custom service worker to handle `push` and `notificationclick`.

1) Create `src/sw.ts`:

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'ByeBuy';
    const options: NotificationOptions = {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    // Fallback if payload is not JSON
    event.waitUntil(self.registration.showNotification('ByeBuy', { body: event.data?.text() || '' }));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const hadWindow = clientsArr.some((client) => {
        if ('focus' in client) {
          client.navigate(url);
          client.focus();
          return true;
        }
        return false;
      });
      if (!hadWindow && self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
```

2) Tell the plugin to use it by adding to the `withPWA` options in `next.config.ts`:

```ts
customWorkerSrc: 'src/sw.ts'
```

---

## 7) Generate VAPID Keys (once)

VAPID keys authenticate your server as a push sender.

```bash
npx web-push generate-vapid-keys
```

Output:

```
Public Key:  <VAPID_PUBLIC_KEY>
Private Key: <VAPID_PRIVATE_KEY>
```

Set environment variables:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<VAPID_PUBLIC_KEY>
VAPID_PRIVATE_KEY=<VAPID_PRIVATE_KEY>
VAPID_SUBJECT=mailto:support@byebuy.in
```

- Local: add to `.env.local`
- Vercel: Project Settings → Environment Variables (Production + Preview)

---

## 8) Supabase Schema for Subscriptions

Create a table to store browser subscriptions per user.

Migration SQL (use Supabase SQL editor or CLI):

```sql
create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_web_push_subscriptions_user on public.web_push_subscriptions(user_id);

alter table public.web_push_subscriptions enable row level security;

create policy "users can insert own subscription" on public.web_push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);

create policy "users can delete own subscription" on public.web_push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

create policy "users can read own subscription" on public.web_push_subscriptions
  for select to authenticated using (auth.uid() = user_id);
```

Optional: add a `profiles.enable_push boolean default false` and toggle via settings UI.

---

## 9) API Routes: Subscribe / Unsubscribe / Send

Create three App Router endpoints under `src/app/api/push/`.

### 9.1 Subscribe

`src/app/api/push/subscribe/route.ts`:

```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function POST(request: Request) {
  const body = await request.json();
  const { endpoint, keys, userAgent } = body || {};
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase.from('web_push_subscriptions').upsert({
    user_id: user.id,
    endpoint,
    p256dh: keys?.p256dh,
    auth: keys?.auth,
    user_agent: userAgent || ''
  }, { onConflict: 'endpoint' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

### 9.2 Unsubscribe

`src/app/api/push/unsubscribe/route.ts`:

```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function POST(request: Request) {
  const { endpoint } = await request.json();
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('web_push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

### 9.3 Send (Admin/Server‑only)

`src/app/api/push/send/route.ts`:

```ts
import { NextResponse } from 'next/server';
import webPush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // required to read all subscriptions
);

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  // Protect this endpoint (e.g., with an admin secret or restrict to server calls only).
  const { userId, payload } = await request.json();
  const { data: subs, error } = await supabase
    .from('web_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const results = await Promise.allSettled(
    (subs || []).map(async (s) => {
      try {
        await webPush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any,
          JSON.stringify(payload)
        );
        return { id: s.id, ok: true };
      } catch (err: any) {
        const status = err?.statusCode || err?.status || 0;
        if (status === 404 || status === 410) {
          await supabase.from('web_push_subscriptions').delete().eq('id', s.id);
        }
        return { id: s.id, ok: false, error: String(err) };
      }
    })
  );

  return NextResponse.json({ results });
}
```

Security:
- Restrict `/api/push/send` using a secret header (e.g., `X-ADMIN-SECRET`) or Vercel Protection.
- For production systems, trigger pushes server‑side when creating `user_notifications` records.

---

## 10) Client‑Side Push Subscription UI

Create a small client component to enable/disable push in account settings (request permission and call subscribe API).

Example: `src/components/PushToggle.tsx`:

```tsx
'use client';
import { useState, useCallback } from 'react';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function PushToggle() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      if (!('serviceWorker' in navigator)) throw new Error('SW not supported');
      if (Notification.permission === 'denied') throw new Error('Permission denied');
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error('Permission not granted');
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY)
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: (sub as any).toJSON().keys,
          userAgent: navigator.userAgent
        })
      });
      setEnabled(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="flex items-center gap-2">
      <button disabled={busy || enabled} onClick={subscribe} className="btn-primary">Enable Push</button>
      <button disabled={busy || !enabled} onClick={unsubscribe} className="btn-secondary">Disable Push</button>
    </div>
  );
}
```

Add it to `src/app/account/settings/page.tsx` in an appropriate section for notification preferences.

---

## 11) Where to Trigger Push Sends

Integrate push with the existing notification points:

- New bid on user’s listing → notify seller
- User outbid → notify previous highest bidder
- Auction ending/closed → notify watchers/bidders
- New chat message → notify other participant(s)

Implementation options:

- Option A (simpler): From your Next.js server routes that already create `user_notifications`, call `/api/push/send` per recipient.
- Option B (scalable): Supabase Edge Function listens to DB inserts on `user_notifications` (via Realtime or scheduled job), queries subscriptions, and sends via Web Push directly from Deno.

For Option A, you can add a helper on the server:

```ts
await fetch(process.env.PUSH_SEND_URL!, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-ADMIN-SECRET': process.env.PUSH_ADMIN_SECRET! },
  body: JSON.stringify({ userId, payload: { title, body, url, icon, tag } })
});
```

---

## 12) iOS and Android Notes

- Android/Chrome/Edge: Full support in browser or installed PWA.
- iOS/iPadOS: Web Push works only when the site is installed as a PWA (Add to Home Screen) and on iOS 16.4+.
  - Ensure manifest + service worker are present so Safari offers install.
  - After install, user can enable Notifications in iOS Settings for the PWA.
- Desktop (Chrome/Edge/Firefox): Works when permission granted; shows system notifications.

User messaging:
- If on iOS Safari and not installed, show a tip to install the app to enable notifications.

---

## 13) Testing Locally

Service workers are disabled in Next dev mode. Test with a production build:

```bash
npm run build
npm run start
# Visit http://localhost:3000
```

Validate in Chrome DevTools:
- Application → Manifest: verify manifest and icons
- Application → Service Workers: check SW is active; use “Push” to test with payload like `{ "title": "Test", "body": "Hello", "url": "/" }`
- Network: toggle “Offline” and verify offline fallback (`/offline`)

Send a real push to your user from terminal (after subscribing):

```bash
curl -X POST http://localhost:3000/api/push/send \
  -H 'Content-Type: application/json' \
  -H "X-ADMIN-SECRET: $PUSH_ADMIN_SECRET" \
  -d '{
    "userId": "<AUTH_USER_UUID>",
    "payload": { "title": "ByeBuy", "body": "Test push", "url": "/listings" }
  }'
```

---

## 14) Deployment (Vercel)

1) Add env vars in Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
   - `SUPABASE_SERVICE_ROLE_KEY` (for `/api/push/send` only)
   - `PUSH_ADMIN_SECRET` (if you protect the send endpoint)

2) Deploy normally (no command changes). After deploy:
   - Check `https://byebuy.in/manifest.webmanifest`
   - Check `https://byebuy.in/sw.js` (generated by plugin)
   - Install the app and test offline + push

---

## 15) Troubleshooting

- SW not registering locally: ensure you are on `npm run start` (prod) and `withPWA({ disable: process.env.NODE_ENV === 'development' })`.
- Push subscription fails: verify `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set and is a base64url string; ensure page is served over HTTPS.
- 404/410 on send: subscription is stale; the send endpoint cleans them up on failure—try resubscribing.
- iOS not receiving: ensure the app is installed (Add to Home Screen) and iOS version is 16.4+; enable notifications in iOS settings for the PWA.
- CSP blocks SW: if you add a CSP later, include `worker-src 'self'` and allow `manifest-src 'self'`.

---

## 16) Security & Privacy

- Ask explicit consent before enabling push; allow easy opt‑out.
- Store only what is necessary: endpoint and keys; avoid PII in payloads.
- Protect admin send endpoint with a secret and/or server‑only access.

---

## 17) Task Checklist

- [ ] Install deps: `@ducanh2912/next-pwa`, `web-push`
- [ ] Add `public/manifest.webmanifest` and link it in `layout.tsx`
- [ ] Generate icons and place under `public/icons/`
- [ ] Wrap `next.config.ts` with `withPWA` and add `customWorkerSrc: 'src/sw.ts'`
- [ ] Create `src/sw.ts` with `push` and `notificationclick` handlers
- [ ] Create `src/app/offline/page.tsx`
- [ ] Generate VAPID keys and set env vars (local + Vercel)
- [ ] Create Supabase table `web_push_subscriptions` + RLS policies
- [ ] Add API routes: subscribe, unsubscribe, send
- [ ] Add `PushToggle` to `account/settings`
- [ ] Wire push sends to notification creation points
- [ ] Test locally with prod build, then deploy

---

## 18) Appendix: Copy‑Paste Snippets Index

- Manifest: `public/manifest.webmanifest`
- SW: `src/sw.ts`
- Next config PWA wrapper: `next.config.ts`
- Offline route: `src/app/offline/page.tsx`
- API: `src/app/api/push/subscribe/route.ts`, `src/app/api/push/unsubscribe/route.ts`, `src/app/api/push/send/route.ts`
- UI: `src/components/PushToggle.tsx`
- SQL: migration for `web_push_subscriptions` with RLS

If you want, I can implement each step directly in the repo. Ping me and I’ll wire it up end‑to‑end and push a branch for review.


---

## 19) Install Prompt UX (Add to Home Screen)

Modern browsers may show a mini‑infobar or let you trigger a custom prompt via `beforeinstallprompt`. Capturing it lets you offer a branded “Install App” CTA.

Create `src/components/InstallPrompt.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>; 
};

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !deferred) return null;
  return (
    <div className="fixed bottom-4 inset-x-4 z-[9999] rounded-xl bg-white dark:bg-gray-800 p-4 shadow-xl flex items-center justify-between">
      <div className="mr-3">
        <div className="font-semibold">Install ByeBuy</div>
        <div className="text-sm opacity-80">Get an app‑like experience</div>
      </div>
      <div className="flex gap-2">
        <button
          className="px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700"
          onClick={() => setVisible(false)}
        >Not now</button>
        <button
          className="px-3 py-2 rounded-md bg-indigo-600 text-white"
          onClick={async () => {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            setVisible(false);
            setDeferred(null);
            // Optionally send analytics: choice.outcome
          }}
        >Install</button>
      </div>
    </div>
  );
}
```

Render this somewhere global (e.g., below `Navbar` in `src/app/layout.tsx`) only on platforms where it makes sense.

---

## 20) Offline Page Example

Create `src/app/offline/page.tsx` to provide a graceful offline UI:

```tsx
export default function OfflinePage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <h1 className="text-2xl font-bold mb-2">You are offline</h1>
      <p className="max-w-md opacity-80">
        Some features may be unavailable. Please reconnect to the internet. You can still browse cached content.
      </p>
    </div>
  );
}
```

The PWA config earlier sets `fallbacks: { document: '/offline' }` so navigations fall back here when offline.

---

## 21) Advanced Caching Strategies (Workbox)

Tune runtime caching for better performance and reliability. Extend `runtimeCaching` in `next.config.ts`:

```ts
workboxOptions: {
  navigateFallback: '/offline',
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    // Images from this origin
    {
      urlPattern: ({ request, url }) => request.destination === 'image' && url.origin === self.location.origin,
      handler: 'CacheFirst',
      options: { cacheName: 'images-local', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } }
    },
    // Supabase storage images
    {
      urlPattern: ({ url }) => /\.supabase\.co\/.+\/storage\//.test(url.href),
      handler: 'CacheFirst',
      options: { cacheName: 'images-supabase', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } }
    },
    // Static assets (scripts/styles)
    {
      urlPattern: ({ request }) => ['style', 'script', 'worker', 'font'].includes(request.destination),
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'assets' }
    },
    // API calls (avoid caching mutations)
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !/send|subscribe|unsubscribe/.test(url.pathname),
      handler: 'NetworkFirst',
      options: { cacheName: 'api', networkTimeoutSeconds: 5 }
    }
  ]
}
```

Notes:
- Denylist API navigations from fallback so API 404 doesn’t route to `/offline`.
- Cache Supabase images aggressively; APIs conservatively.

---

## 22) Notification Actions and Payload Schema

Enrich notifications with actions (e.g., “Bid Now”, “View Chat”). Update `src/sw.ts` to include actions when a payload provides them:

```ts
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const title = data.title || 'ByeBuy';
  const options: NotificationOptions = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/', actionUrlMap: data.actionUrlMap || {} },
    actions
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const actionUrlMap = data.actionUrlMap || {};
  const targetUrl = action && actionUrlMap[action] ? actionUrlMap[action] : data.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const hadWindow = clientsArr.some((client) => {
        client.navigate(targetUrl);
        if ('focus' in client) client.focus();
        return true;
      });
      if (!hadWindow && self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
```

Example payload:

```json
{
  "title": "You were outbid!",
  "body": "Listing XYZ now has a higher bid.",
  "url": "/listings/abc",
  "actions": [
    { "action": "bid", "title": "Bid Now" },
    { "action": "watch", "title": "View Listing" }
  ],
  "actionUrlMap": {
    "bid": "/listings/abc#bid",
    "watch": "/listings/abc"
  }
}
```

---

## 23) Admin/Test Tooling

Add a route to send a test push to the current authenticated user for quick validation.

`src/app/api/push/test/route.ts`:

```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await fetch(new URL('/api/push/send', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ADMIN-SECRET': process.env.PUSH_ADMIN_SECRET! },
    body: JSON.stringify({
      userId: user.id,
      payload: { title: 'ByeBuy', body: 'Test notification', url: '/' }
    })
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

---

## 24) Supabase Edge Function Alternative (Serverless Push)

You can push from a Supabase Edge Function triggered by DB inserts into `user_notifications`.

Example Deno function (TypeScript): `supabase/functions/send-push/index.ts`:

```ts
// deno.json should allow npm: web-push
// import_map.json may map npm:web-push
import { serve } from 'https://deno.land/std/http/server.ts';
import webPush from 'npm:web-push';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!;

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async (req) => {
  const { userId, payload } = await req.json();
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/web_push_subscriptions?user_id=eq.${userId}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const subs = await resp.json();
  const results = await Promise.allSettled(subs.map((s: any) =>
    webPush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any, JSON.stringify(payload))
  ));
  return new Response(JSON.stringify({ results }), { headers: { 'content-type': 'application/json' } });
});
```

Invoke this function from DB triggers or from application code.

---

## 25) Environment Variables Cheat Sheet (Where to Get “Stuff”)

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase → Project Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase → Project Settings → API → anon public client key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API → service_role key (server‑only)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Generated via `npx web-push generate-vapid-keys` (public, client‑side OK)
- `VAPID_PRIVATE_KEY`: Same generator output (server‑only)
- `VAPID_SUBJECT`: Your contact: `mailto:support@byebuy.in` or origin URL
- `PUSH_ADMIN_SECRET`: Any random secret string you set (server‑only) to protect send/test routes

Where to set:
- Local: `.env.local`
- Vercel: Project → Settings → Environment Variables → Add to Production & Preview

Never expose private keys in client code. Only `NEXT_PUBLIC_*` variables are safe for the browser.

---

## 26) Platform Install Steps (User‑Facing)

- Android (Chrome):
  1. Visit `byebuy.in`
  2. Tap menu (⋮) → Install App (or accept prompt)
  3. App appears on launcher; notifications work after enabling push

- iOS (Safari, iOS 16.4+):
  1. Open `byebuy.in`
  2. Share button → Add to Home Screen
  3. Open the installed app from Home Screen
  4. In app, tap Enable Push; iOS may ask for permission
  5. If needed: iOS Settings → Notifications → ByeBuy → Allow Notifications

- Desktop (Chrome/Edge):
  1. Click install icon in address bar or menu → Install
  2. Accept notification permission in app

---

## 27) Lighthouse & PWA Compliance

Use Chrome Lighthouse (Audits → PWA):
- Installable: manifest + icons present, service worker controlling the page
- Best Practices: HTTPS, no mixed content, fast responses
- Performance: good TTI, LCP; images optimized
- Accessibility: contrast, labels

Fix any failed audits before rollout.

---

## 28) QA Checklist (Functional Tests)

- Install flows work on Android, iOS (A2HS), Desktop
- App launches standalone with correct theme color and icon
- Offline navigation shows `/offline` and cached pages/images
- Push subscribe/unsubscribe flows update DB rows
- Test push reaches all user devices; click focuses the right URL
- iOS receives push only when launched as installed PWA
- Old subscriptions are removed on 404/410
- Unsubscribe stops further messages

---

## 29) Security, Consent, and Privacy

- Present clear consent for push; make disabling obvious in Settings
- Avoid sensitive content in payloads; keep bodies short
- Validate server requests; restrict send endpoints via secrets/ACL
- Consider data retention: periodically prune old subscriptions
- Optional: add audit logs for sent notifications

---

## 30) Common Errors → Fixes

- `DOMException: Registration failed – permission denied`
  - User blocked notifications; prompt to enable in browser/system settings
- `TypeError: Failed to fetch in subscribe`
  - Missing HTTPS or incorrect VAPID public key format (must be base64url)
- `410 Gone` when sending
  - Subscription expired; resubscribe; sender should delete the row
- No SW in dev
  - Use `npm run build && npm run start` to test PWA features locally

---

## 31) Rollout Plan

1. Implement on a feature branch; add env vars to Vercel Preview
2. Test on real Android and iOS devices from preview URL
3. Run Lighthouse; fix issues
4. Merge to main; enable Production env vars
5. Monitor errors (Vercel/Edge logs) and Supabase usage; iterate

---

## 32) Maintenance

- Review Workbox cache versions when making large asset changes
- Rotate `PUSH_ADMIN_SECRET` periodically
- Prune stale `web_push_subscriptions` (already auto‑pruned on send failures)
- Re‑run Lighthouse after major UI changes

