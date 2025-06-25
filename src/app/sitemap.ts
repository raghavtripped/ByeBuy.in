import { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabaseClient';

// Base URL of your website
const BASE_URL = 'https://byebuy.in';

// Type definitions for database responses
interface SellerData {
  seller_id: string;
  created_at: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. Static Pages
  const staticRoutes = [
    '/', // Homepage
    '/listings', // Main listings page
    '/listings/archive',
    '/listings/new',
    '/about',
    '/help',
    '/terms',
    '/auth',
    '/profile',
    '/account/settings',
    '/my-listings',
    '/my-bids',
    '/my-watchlist',
    '/notifications',
    '/update-password',
  ].map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date().toISOString(),
    changeFrequency: (route === '/' || route === '/listings') ? 'daily' as const : 'weekly' as const,
    priority: (route === '/' || route === '/listings') ? 1.0 : 0.8,
  }));

  // 2. Dynamic Listing Detail Pages
  let listingRoutes: MetadataRoute.Sitemap = [];
  try {
    const { data: listings, error } = await supabase
      .from('listings')
      .select('id, created_at, status')
      .eq('status', 'active'); // Only include active listings

    if (error) {
      console.error('Error fetching listings for sitemap:', error);
    } else if (listings) {
      listingRoutes = listings.map((listing) => ({
        url: `${BASE_URL}/listings/${listing.id}`,
        lastModified: listing.created_at ? new Date(listing.created_at).toISOString() : new Date().toISOString(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
    }
  } catch (e) {
    console.error('Exception fetching listings for sitemap:', e);
  }
  
  // 3. Dynamic Public Seller Profile Pages
  let sellerProfileRoutes: MetadataRoute.Sitemap = [];
  try {
    // Get unique seller IDs from active listings to ensure we only include sellers with active content
    const { data: activeSellers, error } = await supabase
      .from('listings')
      .select('seller_id, created_at')
      .eq('status', 'active')
      .not('seller_id', 'is', null);

    if (error) {
      console.error('Error fetching sellers for sitemap:', error);
    } else if (activeSellers) {
      // Remove duplicates and create seller profile routes
      const uniqueSellers = activeSellers.reduce((acc: SellerData[], current) => {
        const existingSeller = acc.find(seller => seller.seller_id === current.seller_id);
        if (!existingSeller) {
          acc.push(current);
        } else if (new Date(current.created_at) > new Date(existingSeller.created_at)) {
          // Update with more recent timestamp
          existingSeller.created_at = current.created_at;
        }
        return acc;
      }, [] as SellerData[]);

      sellerProfileRoutes = uniqueSellers.map((seller) => ({
        url: `${BASE_URL}/sellers/${seller.seller_id}`,
        lastModified: seller.created_at ? new Date(seller.created_at).toISOString() : new Date().toISOString(),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }));
    }
  } catch(e) {
    console.error('Exception fetching sellers for sitemap:', e);
  }

  return [
    ...staticRoutes,
    ...listingRoutes,
    ...sellerProfileRoutes,
  ];
} 