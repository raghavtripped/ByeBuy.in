# ByeBuy (formerly Bidly)

A modern, campus-centric online auction platform designed specifically for students. ByeBuy provides a secure and intuitive marketplace where students can buy and sell items within their campus community, featuring real-time bidding, instant notifications, and a seamless user experience.

## Tech Stack

### Frontend
- **Framework**: Next.js 15.3.1 with App Router
- **Language**: TypeScript 5.x
- **UI Library**: React 19.0.0
- **Styling**: Tailwind CSS 3.4.x
- **Component Libraries**: 
  - Headless UI 2.2.3 (Accessible UI components)
  - React Icons 5.5.0
  - React Slick 0.30.3 (Image carousels)

### Backend & Infrastructure
- **Backend as a Service**: Supabase
  - Authentication
  - PostgreSQL Database
  - Storage (for images)
  - Realtime subscriptions
  - Edge Functions
- **Deployment**: Vercel

### Development Tools
- **State Management**: Zustand 5.0.4
- **Linting**: ESLint 9.x
- **Package Manager**: npm/yarn
- **Database Migrations**: Supabase CLI

## Features

### Authentication & User Management
- Email/Password authentication
- Profile management with avatars
- Account settings and password reset
- User profiles with stats and history

### Listing Management
- Multi-photo listing creation
- Category-based organization
- Real-time listing updates
- Listing editing and archival
- Automated auction closing via Edge Functions

### Bidding System
- Real-time bidding
- Bid confirmation modal
- Bid history tracking
- Automated winner selection

### User Experience
- Watchlist functionality
- Real-time notifications
- Global search with filters
- Dark/Light mode support
- Responsive design with mobile navigation
- Real-time listing chat

### Content & Support
- Help center
- Terms of service
- User guidelines
- Category browsing

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and layouts
├── components/            # Reusable UI components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and configurations
├── stores/               # Zustand state management
└── types/                # TypeScript type definitions

supabase/
├── functions/            # Edge Functions
└── migrations/          # Database migrations
```

### Key Components

- `ListingCard.tsx`: Main component for displaying auction listings
- `Navbar.tsx`: Global navigation with search and user menu
- `MobileBottomNav.tsx`: Mobile-optimized navigation
- `ListingChat.tsx`: Real-time chat functionality
- `CategoryFilterModal.tsx`: Category-based listing filters
- `NotificationToast.tsx`: Global notification system
- `UserAvatar.tsx`: User profile picture component

## Backend Architecture

### Database Tables
- `listings`: Auction listings
- `bids`: User bids
- `profiles`: User profiles
- `watched_listings`: Watchlist items
- `listing_chats`: Real-time chat messages

### Supabase Features
- **Auth**: JWT-based authentication with Row Level Security
- **Storage**: Separate buckets for listing images and avatars
- **Realtime**: Subscriptions for bids, chat, and notifications
- **Edge Functions**: Automated auction closing and cleanup

## State Management

- **Global State** (Zustand):
  - `watchlistStore`: Manages user's watched items
  - `notificationStore`: Handles system notifications
- **Local State**: React hooks for component-specific state

## Getting Started

### Prerequisites
- Node.js 18.x or later
- npm or yarn
- Supabase CLI

### Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/byebuy.git
   cd byebuy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Start Supabase locally (optional):
   ```bash
   supabase start
   supabase db reset
   supabase functions serve
   ```

The application will be available at http://localhost:3000.

## Deployment

The project is deployed on Vercel with automatic deployments from the main branch. Supabase Edge Functions are deployed using the Supabase CLI.

## Future Enhancements

- Enhanced image management system
- Advanced search filters
- In-app messaging system
- Mobile app version
- Integration with campus authentication systems
- Analytics dashboard for administrators

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is private and proprietary. All rights reserved.
