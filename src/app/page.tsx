// src/app/page.tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/listings');
  // No JSX needed here as redirect happens on the server or immediately on client hydration.
}