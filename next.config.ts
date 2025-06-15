// /workspaces/bidly/next.config.ts

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()' // Removed browsing-topics
          }
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'efkggsqrpmilxfmszdlz.supabase.co', // YOUR Supabase project hostname
        port: '', // Default HTTPS port (443)
        pathname: '/storage/v1/object/public/listing-images/**', // Allow any image in this bucket path
      },
      {
        protocol: 'https',
        hostname: 'efkggsqrpmilxfmszdlz.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/avatars/**', // Add this line for avatars
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**', // Allow Google profile images
      },
      // Example of adding another domain in the future:
      // {
      //   protocol: 'https',
      //   hostname: 'another-image-host.com',
      //   pathname: '/images/**',
      // },
    ],
    // Optimize for common device sizes
    deviceSizes: [640, 750, 828, 1080, 1200],
    // Optimize for common image sizes in UI
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Use WebP for optimal compression
    formats: ['image/webp'],
    // Cache optimized images for 31 days
    minimumCacheTTL: 2678400,
  },
  // Add other Next.js config options here if needed in the future
};

export default nextConfig;