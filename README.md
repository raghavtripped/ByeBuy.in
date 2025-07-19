# ByeBuy - Campus Auction Marketplace

A modern, campus-centric online auction platform designed specifically for students at IIM Indore. ByeBuy provides a secure and intuitive marketplace where students can buy and sell items within their campus community, featuring real-time bidding, instant notifications, and a seamless user experience.

## 🚀 Live Demo

**Production URL**: [https://byebuy.in](https://byebuy.in)

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 15.4.2 with App Router
- **Language**: TypeScript 5.x
- **UI Library**: React 19.1.0
- **Styling**: Tailwind CSS 3.4.17 with custom dark theme
- **Component Libraries**: 
  - Headless UI 2.2.4 (Accessible UI components)
  - React Icons 5.5.0
  - React Slick 0.30.3 (Image carousels)
  - Framer Motion 11.18.2 (Animations)
  - Lucide React 0.513.0 (Icons)

### Backend & Infrastructure
- **Backend as a Service**: Supabase
  - Authentication (Email/Password + Google OAuth)
  - PostgreSQL Database with Row Level Security
  - Storage (for listing images and avatars)
  - Realtime subscriptions for live updates
  - Edge Functions for automated auction closing
- **Deployment**: Vercel with automatic deployments
- **Domain**: Custom domain with SSL

### Development Tools
- **State Management**: Zustand 5.0.4
- **Linting**: ESLint 9.28.0
- **Package Manager**: npm
- **Database Migrations**: Supabase CLI
- **Security Testing**: Custom SQL injection test suite

## 🎯 Core Features

### 🔐 Authentication & User Management
- **Institutional Email Only**: Restricted to @iimidr.ac.in emails
- **Google OAuth Integration**: Seamless sign-in with Google accounts
- **Profile Management**: Custom avatars, hostel info, batch details
- **Account Settings**: Password reset, profile updates
- **User Statistics**: Active listings, items sold, auctions won

### 📋 Listing Management
- **Multi-Photo Upload**: Drag & drop interface with up to 5 images
- **Category System**: 6 predefined categories (Electronics, Furniture, Textbooks, etc.)
- **Auction Configuration**: 
  - Minimum starting bid
  - Optional "Buy Now" price (upper cap)
  - Custom end time
  - Auction rules and descriptions
- **Real-time Updates**: Live status changes and bid notifications
- **Listing Editing**: Modify active listings before bidding starts
- **Archival System**: Automatic archiving of closed auctions

### 🎲 Bidding System
- **Real-time Bidding**: Live bid updates across all users
- **Bid Validation**: Minimum bid increments, maximum limits
- **Bid History**: Complete transaction history with timestamps
- **Auto-closing**: Auctions automatically close when "Buy Now" price is met
- **Winner Selection**: Automated winner determination at auction end

### 💬 Communication & Social Features
- **Real-time Chat**: Built-in messaging system for each listing
- **Watchlist**: Save favorite listings for easy tracking
- **Notifications**: Real-time alerts for bids, auction endings, and messages
- **Share Functionality**: Social media sharing for listings

### 🎨 User Experience
- **Responsive Design**: Mobile-first approach with dedicated mobile navigation
- **Dark/Light Mode**: Theme switching with system preference detection
- **Search & Filters**: 
  - Global search across titles and descriptions
  - Category-based filtering
  - Multiple sort options (newest, ending soon, price, bid count)
- **Loading States**: Smooth loading animations and skeleton screens
- **Error Handling**: Graceful error states with retry mechanisms

## 📱 Pages & Routes

### Public Pages
- **`/`** → Redirects to `/listings`
- **`/listings`** → Main marketplace with all active auctions
- **`/listings/[id]`** → Individual auction detail page with bidding
- **`/listings/[id]/edit`** → Edit listing (seller only)
- **`/auth`** → Authentication page (sign in/sign up)
- **`/about`** → About page
- **`/help`** → Help center and guidelines
- **`/terms`** → Terms of service
- **`/sellers/[sellerId]`** → Seller profile page

### Protected Pages (Require Authentication)
- **`/listings/new`** → Create new auction listing
- **`/my-listings`** → User's created listings (active/past)
- **`/my-bids`** → User's bidding history and current bids
- **`/my-watchlist`** → User's saved/favorited listings
- **`/profile`** → User profile and statistics
- **`/notifications`** → User notifications center
- **`/account/settings`** → Account settings
- **`/update-password`** → Password update

## 🧩 Key Components

### Core UI Components
- **`ListingCard.tsx`** → Main auction card with hover effects and real-time data
- **`Navbar.tsx`** → Global navigation with search, user menu, and theme toggle
- **`MobileBottomNav.tsx`** → Mobile-optimized bottom navigation
- **`ListingChat.tsx`** → Real-time chat system for each listing
- **`ConfirmBidModal.tsx`** → Bid confirmation with validation
- **`WatchlistButton.tsx`** → Add/remove listings from watchlist
- **`UserAvatar.tsx`** → User profile picture component
- **`LoadingSpinner.tsx`** → Consistent loading states
- **`EmptyState.tsx`** → Empty state illustrations

### Feature Components
- **`CategoryFilterModal.tsx`** → Category-based listing filters
- **`SortOptionModal.tsx`** → Sorting options for listings
- **`IntegratedSearchBar.tsx`** → Advanced search with filters
- **`NotificationToast.tsx`** → Global notification system
- **`ShareButtons.tsx`** → Social media sharing
- **`PhotoUploader.tsx`** → Multi-photo upload with drag & drop
- **`ListingPreview.tsx`** → Live preview during listing creation

### Layout Components
- **`SplashScreen.tsx`** → App initialization screen
- **`Footer.tsx`** → Site footer with links
- **`ErrorBoundary.tsx`** → Error handling wrapper
- **`ThemeScript.tsx`** → Theme initialization script

## 🗄️ Database Schema

### Core Tables
- **`listings`** → Auction listings with photos, pricing, and status
- **`bids`** → User bids with timestamps and amounts
- **`profiles`** → User profile data (avatar, hostel, batch)
- **`watched_listings`** → User watchlist items
- **`listing_chats`** → Real-time chat messages
- **`user_notifications`** → System notifications

### Database Views
- **`listings_with_highest_bid`** → Listings with current highest bid info
- **`listings_with_seller_email`** → Listings with seller contact info
- **`bids_with_bidder_email`** → Bids with bidder contact info
- **`archived_listings_details`** → Closed/cancelled listings with winner info

### Database Functions
- **`get_distinct_listing_ids_for_bidder`** → Get all listings a user has bid on
- **`finalize_auction_outcome`** → Manually close auctions and determine winners
- **`close_auction`** → Automated auction closing logic

## 🔄 State Management

### Global State (Zustand)
- **`watchlistStore`** → Manages user's watched listings across sessions
- **`notificationStore`** → Global notification system state

### Local State
- **React Hooks** → Component-specific state management
- **Custom Hooks** → `useAuth`, `useNotifications` for reusable logic

## 🔧 Backend Services

### Supabase Features
- **Authentication**: JWT-based with Row Level Security (RLS)
- **Storage**: Separate buckets for listing images and user avatars
- **Realtime**: WebSocket subscriptions for live updates
- **Edge Functions**: Automated auction closing and cleanup

### Edge Functions
- **`close-expired-auctions`** → Scheduled function to close expired auctions
- **CORS Support** → Proper cross-origin request handling
- **Error Handling** → Comprehensive error logging and recovery

## 🎨 Design System

### Color Palette
- **Primary**: Indigo/Purple gradient theme
- **Secondary**: Blue/Cyan accents
- **Success**: Green for winning bids
- **Warning**: Orange for ending soon
- **Error**: Red for errors and cancellations

### Dark Mode
- **Custom Dark Theme**: Tailored dark mode with proper contrast
- **System Preference**: Automatic theme detection
- **Manual Toggle**: User-controlled theme switching

### Responsive Breakpoints
- **Mobile**: < 768px (bottom navigation)
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px (full navigation)

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x or later
- npm or yarn
- Supabase CLI
- Git

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/byebuy.git
   cd byebuy
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Create a `.env.local` file with:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Database Setup**:
   ```bash
   supabase start
   supabase db reset
   supabase functions serve
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```

The application will be available at http://localhost:3000.

### Security Testing
```bash
# Run SQL injection tests
npm run security:sql-injection

# Test production environment
npm run security:sql-injection:prod

# Run all security tests
npm run security:test-all
```

## 🚀 Deployment

### Production Deployment
- **Platform**: Vercel with automatic deployments from main branch
- **Domain**: Custom domain with SSL certificate
- **Environment**: Production environment variables configured
- **Edge Functions**: Deployed via Supabase CLI

### Deployment Process
1. Push to main branch triggers automatic deployment
2. Vercel builds and deploys the Next.js application
3. Supabase Edge Functions deployed separately
4. Database migrations run automatically

## 🔒 Security Features

### Authentication Security
- **Institutional Email Restriction**: Only @iimidr.ac.in emails allowed
- **JWT Tokens**: Secure session management
- **Row Level Security**: Database-level access control
- **Password Policies**: Strong password requirements

### Data Protection
- **Input Validation**: Comprehensive form validation
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Content Security Policy
- **CSRF Protection**: Token-based request validation

### Testing
- **SQL Injection Test Suite**: Automated security testing
- **Manual Security Audits**: Regular security reviews
- **Error Handling**: Graceful error responses

## 📊 Performance Optimizations

### Frontend
- **Image Optimization**: Next.js Image component with lazy loading
- **Code Splitting**: Automatic route-based code splitting
- **Bundle Optimization**: Tree shaking and minification
- **Caching**: Static asset caching and service workers

### Backend
- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: Efficient database connections
- **CDN**: Global content delivery network
- **Caching**: Redis caching for frequently accessed data

## 🔮 Future Enhancements

### Planned Features
- **Enhanced Image Management**: Advanced image editing and optimization
- **Advanced Search**: AI-powered search with filters
- **In-app Messaging**: Direct messaging between users
- **Mobile App**: Native iOS/Android applications
- **Analytics Dashboard**: Detailed user and auction analytics
- **Payment Integration**: Secure payment processing
- **Campus Integration**: SSO with campus authentication systems

### Technical Improvements
- **Performance Monitoring**: Real-time performance tracking
- **A/B Testing**: Feature experimentation framework
- **Internationalization**: Multi-language support
- **Progressive Web App**: Offline functionality and app-like experience

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Maintain consistent code formatting
- Write comprehensive tests
- Update documentation for new features
- Follow the existing component patterns

## 📄 License

This project is private and proprietary. All rights reserved.

## 📞 Support

For support and questions:
- **Email**: support@byebuy.in
- **Documentation**: Check the `/help` page
- **Issues**: Report bugs through the help center

---

**Built with ❤️ for the IIM Indore community**
