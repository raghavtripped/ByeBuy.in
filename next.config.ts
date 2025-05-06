// /workspaces/bidly/next.config.ts

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'efkggsqrpmilxfmszdlz.supabase.co', // YOUR Supabase project hostname
        port: '', // Default HTTPS port (443)
        pathname: '/storage/v1/object/public/listing-images/**', // Allow any image in this bucket path
      },
      // Example of adding another domain in the future:
      // {
      //   protocol: 'https',
      //   hostname: 'another-image-host.com',
      //   pathname: '/images/**',
      // },
    ],
  },
  // Add other Next.js config options here if needed in the future
};

export default nextConfig;