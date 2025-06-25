import React from 'react';

// Dedicated <head> for the listings page – injects SEO-friendly metadata without affecting the UI.
export default function Head() {
  const title = 'Live Auctions | ByeBuy – IIM Indore Campus Marketplace';
  const description =
    'Browse live auctions on ByeBuy, the exclusive marketplace for IIM Indore students. Discover great deals on textbooks, electronics, dorm essentials and more – bid now and save!';
  const keywords = [
    'ByeBuy',
    'IIM Indore',
    'campus marketplace',
    'live auctions',
    'student auctions',
    'buy sell used goods',
    'textbooks',
    'electronics',
    'dorm essentials',
    'IIMI',
  ].join(', ');

  return (
    <>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="robots" content="index, follow" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {/* Leaving og:url & og:image dynamic / inherited */}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </>
  );
} 