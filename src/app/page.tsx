// src/app/page.tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/listings');
  // In the App Router, the redirect function should be sufficient.
  // No need to return null or any JSX if the redirect is meant to be immediate.
}