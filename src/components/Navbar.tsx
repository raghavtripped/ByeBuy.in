// src/components/Navbar.tsx
'use client'; // This component needs client-side interactivity for auth state and logout

import { useState, useEffect } from 'react';
import Link from 'next/link'; // For client-side navigation
import { useRouter } from 'next/navigation'; // To handle navigation after logout
import { supabase, User } from '@/lib/supabaseClient'; // Import Supabase client and User type

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null); // State to hold the current user object
  const [loading, setLoading] = useState(true); // State to manage initial loading
  const router = useRouter(); // Hook for navigation

  useEffect(() => {
    // Function to get the current user session
    async function getUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Error fetching user:', error.message);
      }
      setUser(data?.user ?? null); // Set user or null if no user/error
      setLoading(false); // Set loading to false after fetching
    }

    getUser(); // Fetch user on initial component mount

    // Subscribe to authentication state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null); // Update user state based on the session
        // Ensure loading is false if state changes quickly after mount
        if (loading) {
            setLoading(false);
        }
      }
    );

    // Cleanup function to unsubscribe from the listener when the component unmounts
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [loading]); // Added loading dependency to ensure setLoading(false) runs if state changes fast

  // Handler for the logout button
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
      alert(`Logout failed: ${error.message}`); // Inform user
    } else {
      setUser(null); // Immediately update local state
      router.refresh(); // Refresh server components and fetch new data reflecting logged-out state
      router.push('/auth'); // Redirect to auth page after logout
    }
  };

  // While initially checking auth state, show a minimal placeholder or nothing
  if (loading) {
    return (
      <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/listings" className="font-bold text-xl hover:text-indigo-300">
            Bidly
          </Link>
          {/* Loading Placeholder for right side */}
          <div className="flex space-x-4 animate-pulse">
                <div className="h-6 bg-gray-700 rounded w-20"></div>
                <div className="h-6 bg-gray-700 rounded w-20"></div>
                <div className="h-6 bg-gray-700 rounded w-16"></div>
          </div>
        </div>
      </nav>
    );
  }

  // Main Navbar structure
  return (
    <nav className="bg-gray-800 text-white shadow-md sticky top-0 z-50"> {/* Sticky navbar */}
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Left Side: Brand/Logo and Listings Link */}
        <div className="flex items-center space-x-4">
          <Link href="/listings" className="font-bold text-xl hover:text-indigo-300">
            Bidly
          </Link>
          <Link href="/listings" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
            All Listings
          </Link>
        </div>

        {/* Right Side: Conditional Links based on Auth State */}
        <div className="flex items-center space-x-4"> {/* Reverted spacing change, keep consistent */}
          {user ? (
            // Links shown when user is logged IN
            <>
              {/* --- ADDED "+ List Item" Link --- */}
              <Link href="/listings/new" className="text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-md text-sm font-medium">
                 + List Item
              </Link>
              {/* --- END OF ADDED LINK --- */}

              <Link href="/my-listings" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                My Listings
              </Link>
              <Link href="/my-bids" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                My Bids
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition duration-150 ease-in-out"
              >
                Logout
              </button>
            </>
          ) : (
            // Link shown when user is logged OUT
            <Link href="/auth" className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition duration-150 ease-in-out">
              Login / Sign Up
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}