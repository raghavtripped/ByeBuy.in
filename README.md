# ByeBuy — Campus Auction Marketplace

A modern, campus-centric online auction platform built for students at **IIM Indore**. ByeBuy is a secure, mobile-first marketplace where students buy and sell items within their campus community, with real-time bidding, live chat, watchlists, and instant in-app notifications.

## 🚀 Live

**Production**: [https://byebuy.in](https://byebuy.in)

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 15.4.10 (App Router, client-rendered root layout)
- **Language**: TypeScript 5.x
- **UI**: React 19.1.0
- **Styling**: Tailwind CSS 3.4.17 (custom dark theme, `tailwindcss-fluid-type`)
- **Components & UX**:
  - Headless UI 2.2.4 (accessible primitives)
  - Heroicons 2.2.0 / Lucide React 0.513.0 / React Icons 5.5.0
  - React Slick 0.30.3 + slick-carousel (image carousels)
  - Framer Motion 11.18.2 (animations)
  - react-hot-toast 2.5.2 (toasts)
  - react-share 5.2.2 (social sharing)

### State Management
- **Zustand 5.0.4** — global stores for watchlist and notifications
- React hooks + custom hooks (`useAuth`, `useNotifications`) for local/reusable state

### Backend & Infrastructure
- **Supabase** (Backend as a Service):
  - Authentication (Email/Password + Google OAuth, restricted to `@iimidr.ac.in`)
  - PostgreSQL with Row Level Security (RLS)
  - Storage (`listing-images` and `avatars` buckets)
  - Realtime subscriptions for live bids, chat, and notifications
  - Edge Functions for scheduled auction closing and notifications
- **Hosting**: Vercel (automatic deployments from `main`)
- **Domain**: Custom domain with SSL

### Tooling
- ESLint 9.28.0 (`eslint-config-next`)
- Supabase CLI (migrations, edge functions)
- Custom SQL injection test suite (Node)

## 🎯 Core Features

### 🔐 Authentication & Profiles
- Institutional email only (`@iimidr.ac.in`), enforced via DB trigger
- Google OAuth + Email/Password
- Profile management: avatar, hostel, batch
- Account settings and password reset
- User stats: active listings, items sold, auctions won

### 📋 Listings
- Multi-photo upload (drag & drop, up to 5 images)
- 6 categories: Electronics & Gadgets, Furniture & Dorm Essentials, Textbooks & Study Materials, Apparel & Accessories, Sports & Hobby Gear, Other
- Auction config: minimum starting bid, optional "Buy Now" cap, custom end time, rules/description
- Live preview while creating a listing
- Edit active listings; automatic archival of closed auctions

### 🎲 Bidding
- Real-time bids across all viewers
- Bid validation (minimum increments, caps)
- Full bid history with timestamps
- Auto-close when "Buy Now" price is met
- Automated winner determination at auction end

### 💬 Communication & Social
- Per-listing real-time chat
- Watchlist for saving favorite listings
- In-app notifications (bids, auction outcomes, system messages) with unread badge
- Social sharing for listings

### 🎨 Experience
- Mobile-first responsive design with dedicated bottom navigation
- Dark/light mode with system-preference detection and manual toggle
- Global search + category filters + sort (newest, ending soon, price, bid count)
- Splash screen with guaranteed timeout, skeleton/loading states, error boundaries

## 📱 Pages & Routes

### Public
- `/` → redirects to `/listings`
- `/listings` → marketplace (active auctions)
- `/listings/[id]` → auction detail + bidding
- `/listings/[id]/edit` → edit listing (seller only)
- `/listings/archive` → closed/cancelled auctions
- `/auth` → sign in / sign up
- `/about`, `/help`, `/terms`
- `/sellers/[sellerId]` → public seller profile

### Protected
- `/listings/new` → create listing
- `/my-listings` → your listings
- `/my-bids` → your bids
- `/my-watchlist` → your saved listings
- `/profile` → profile & stats
- `/notifications` → notification center
- `/account/settings` → account settings
- `/update-password` → password update

Also includes `sitemap.ts` and `robots.txt` for SEO.

## 🧩 Key Components

### Core UI
- `ListingCard.tsx`, `Navbar.tsx`, `MobileBottomNav.tsx`, `Footer.tsx`
- `ListingChat.tsx`, `ConfirmBidModal.tsx`, `WatchlistButton.tsx`
- `UserAvatar.tsx`, `LoadingSpinner.tsx`, `EmptyState.tsx`, `InfoPopover.tsx`

### Feature
- `CategoryCard.tsx`, `CategoryFilterModal.tsx`, `SortOptionModal.tsx`
- `IntegratedSearchBar.tsx`, `ShareButtons.tsx`, `ListingPreview` (in `listings/new`)
- `NotificationProvider.tsx`, `NotificationToast.tsx`

### Layout / Infra
- `SplashScreen.tsx`, `ThemeScript.tsx`, `ErrorBoundary.tsx`, `AuthWatchlistManager.tsx`

## 🗄️ Database

### Tables
- `listings` — auction listings (photos & tags stored as JSONB), pricing, status
- `bids` — bids with amount and timestamp
- `profiles` — user profile data (avatar, hostel, batch)
- `watched_listings` — watchlist entries
- `listing_chats` — per-listing chat messages
- `user_notifications` — in-app notifications (type: `bid` | `listing` | `system`, read flag, link)
- `push_subscriptions` — Web Push subscription details (one row per user)

### Views
- `listings_with_highest_bid` — listings with current highest bid
- `listings_with_seller_email` — listings with seller contact
- `bids_with_bidder_email` — bids with bidder contact
- `archived_listings_details` — closed/cancelled listings with winner info
- `listing_chats_with_sender_email` — chat messages with sender info

### Functions (RPC)
- `close_auction(uuid)` — closes an auction and determines outcome
- `finalize_auction_outcome(uuid)` — finalizes winner/outcome
- `get_distinct_listing_ids_for_bidder(uuid)` — listings a user has bid on
- `get_public_seller_profile(...)` — safe public seller data
- `handle_new_user()` / `validate_new_user_email()` — signup triggers (email domain enforcement)

> Schema is defined across `supabase/migrations/`. See **`SUPABASE_OVERVIEW.md`** for a complete object-by-object map plus a copy-paste SQL toolkit to inspect the live backend.

## 🔧 Edge Functions

`supabase/functions/`:
- **`close-expired-auctions`** — finds `active` listings past their `end_time` and closes each via `close_auction`. Requires `Authorization: Bearer <CLOSE_EXPIRED_AUCTIONS_SECRET>`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOSE_EXPIRED_AUCTIONS_SECRET`. Scheduled via Supabase cron.
- **`email-domain-validation`** — application-level `@iimidr.ac.in` check (`verify_jwt: true`). *Source lives on the live project; the repo file is a stub — pull from the Supabase dashboard before redeploying.*
- **`send-test-notification`** — Web Push sender (`verify_jwt: false`); uses VAPID keys. *Repo file is a stub — pull from the dashboard before redeploying.*

## 🔔 Notifications

- **In-app notifications** are live: backed by the `user_notifications` table, surfaced via `NotificationProvider`, the notifications page, and the Navbar unread badge.
- **Web Push (PWA)** is in progress: the `push_subscriptions` table exists and a push edge function is deployed. The full client wiring (manifest, service worker, subscription flow) is documented in **`PWA_PUSH_GUIDE.md`**.

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x or later
- npm
- Supabase CLI
- Git

### Setup

1. **Clone**
   ```bash
   git clone https://github.com/raghavtripped/ByeBuy.in.git
   cd ByeBuy.in
   ```

2. **Install**
   ```bash
   npm install
   ```

3. **Environment** — create `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Database (local)**
   ```bash
   supabase start
   supabase db reset
   supabase functions serve
   ```

5. **Run**
   ```bash
   npm run dev
   ```
   App runs at http://localhost:3000.

### Scripts
```bash
npm run dev      # development server
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint

# Security testing
npm run security:sql-injection        # local
npm run security:sql-injection:prod   # against https://byebuy.in
npm run security:test-all
```

## 🚀 Deployment

- **Vercel**: pushes to `main` trigger automatic build & deploy
- **Supabase**: migrations applied via CLI; edge functions deployed with `supabase functions deploy <name>`
- **Edge function scheduling**: `close-expired-auctions` runs on a Supabase cron schedule

## 🔒 Security

- Institutional email restriction (`@iimidr.ac.in`) at both DB trigger and (optionally) edge-function level
- JWT-based sessions; Row Level Security on all user-data tables
- Parameterized queries (no string-built SQL) — XSS/SQLi conscious
- Security response headers (`Permissions-Policy`) set in `next.config.ts`
- Automated SQL injection test suite (`sql-injection-test-suite.js`)
- See `SECURITY_TESTING_README.md` and `SQL_INJECTION_TESTING_GUIDE.md`

## 📊 Performance

### Frontend
- Next.js `<Image>` with WebP, tuned `deviceSizes`/`imageSizes`, and 31-day cache TTL (`next.config.ts`)
- Route-based code splitting, tree shaking, minification

### Backend / Supabase egress optimizations
- Explicit field selection instead of `select('*')` to cut payload size
- Capped list queries to bound result sets and reduce egress
- Indexed queries (e.g. `listings(status, end_time)`, unread-notification partial index)

## 📚 Repository Docs

- `SUPABASE_OVERVIEW.md` — full Supabase map + live inspection SQL toolkit
- `PWA_PUSH_GUIDE.md` — end-to-end PWA + Web Push implementation guide
- `PROBLEMS_AUDIT.md` — issue audit with resolution plans
- `SESSION_FIXES_2026_04_14.md` — detailed fix log (loading/realtime/security)
- `SECURITY_TESTING_README.md`, `SQL_INJECTION_TESTING_GUIDE.md` — security testing

## 🔮 Roadmap

- Complete Web Push (PWA install, service worker, offline support)
- Wire notification triggers (`notify_seller_on_bid`, `notify_winner_on_close`) into the push pipeline
- Direct user-to-user messaging
- Payment integration
- Analytics dashboard
- Campus SSO integration

## 🤝 Contributing

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit (`git commit -m 'Add your feature'`)
4. Push (`git push origin feature/your-feature`)
5. Open a Pull Request

Follow TypeScript best practices, match existing component patterns, keep formatting consistent, and update docs for new features.

## 📄 License

Private and proprietary. All rights reserved.

## 📞 Support

- **Email**: support@byebuy.in
- **In-app**: `/help`

---

**Built with ❤️ for the IIM Indore community**
