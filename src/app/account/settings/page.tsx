// src/app/account/settings/page.tsx
'use client';

import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications'; // Add this import
import LoadingSpinner from '@/components/LoadingSpinner';
import Link from 'next/link';
import Image from 'next/image'; // Added for avatar preview

// --- Helper: Get storage path from URL (if needed for deleting old avatar) ---
const getStoragePathFromURL = (photoUrl: string): string | null => {
  try {
    const url = new URL(photoUrl);
    const pathSegments = url.pathname.split('/');
    const publicSegmentIndex = pathSegments.indexOf('public');
    if (publicSegmentIndex !== -1 && publicSegmentIndex + 1 < pathSegments.length) {
      return pathSegments.slice(publicSegmentIndex + 1).join('/');
    }
    return null;
  } catch (e) {
    console.error("Error parsing storage URL for avatar:", e, photoUrl);
    return null;
  }
};


export default function AccountSettingsPage() {
  const router = useRouter();
  const { showNotification } = useNotifications(); // Add notifications hook

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // General page loading
  const [isSubmitting, setIsSubmitting] = useState(false); // For profile update submission
  
  // Messages for different actions
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // --- NEW State for Profile Fields ---
  const [fullName, setFullName] = useState('');
  const [hostel, setHostel] = useState('');
  const [batch, setBatch] = useState('');
  const [bio, setBio] = useState('');
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // --- Auth check and Initial Profile Data Fetch ---
  useEffect(() => {
    const fetchUserAndProfile = async () => {
      setLoading(true);
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      
      if (sessionErr || !session?.user) {
        router.push('/auth?redirect=/account/settings');
        return;
      }
      setUser(session.user);

      // Fetch existing profile data
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, hostel, batch, bio')
        .eq('id', session.user.id)
        .single();

      if (profileErr && profileErr.code !== 'PGRST116') { // PGRST116: no rows found (new user)
        console.error("Error fetching profile:", profileErr);
        setProfileError("Could not load your profile data. Please try again.");
      } else if (profileData) {
        setFullName(profileData.full_name || '');
        setHostel(profileData.hostel || '');
        setBatch(profileData.batch || '');
        setBio(profileData.bio || '');
        setCurrentAvatarUrl(profileData.avatar_url || null);
        setAvatarPreview(profileData.avatar_url || null);
      }
      setLoading(false);
    };
    fetchUserAndProfile();
  }, [router]);

  // --- Avatar File Handling ---
  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    setProfileMessage(null); setProfileError(null);
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // Max 2MB
        setProfileError("Avatar image must be less than 2MB.");
        setAvatarFile(null);
        setAvatarPreview(currentAvatarUrl); // Revert preview
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setProfileError("Invalid file type. Please upload a JPG, PNG, or WEBP image.");
        setAvatarFile(null);
        setAvatarPreview(currentAvatarUrl); // Revert preview
        return;
      }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Profile Update Handler ---
  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    setProfileMessage(null);
    setProfileError(null);
    let newAvatarPublicUrl = currentAvatarUrl; // Assume current avatar URL unless new one is uploaded

    try {
      // Step 1: Upload new avatar if one is selected
    if (avatarFile && user) {
      const fileExt = avatarFile.name.split('.').pop();
      const objectPathInBucket = `${user.id}/profile.${fileExt}`; // Path within the 'avatars' bucket

      // Optionally delete old avatar if path is different (not required if always overwriting)
      if (currentAvatarUrl) {
        const oldPath = getStoragePathFromURL(currentAvatarUrl);
        if (oldPath && oldPath !== objectPathInBucket) {
          // Optionally delete old avatar here if needed
          // await supabase.storage.from('avatars').remove([oldPath]);
        }
      }

      console.log("-----------------------------------------");
      console.log("DEBUG: Attempting Avatar Upload");
      console.log("DEBUG: Authenticated User ID (for RLS):", user.id);
      console.log("DEBUG: Object Path in Bucket (for RLS 'name' column):", objectPathInBucket);
      console.log("DEBUG: Bucket Name:", 'avatars');
      console.log("-----------------------------------------");

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(objectPathInBucket, avatarFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error("DEBUG: Upload Error Object:", JSON.stringify(uploadError, null, 2));
        throw new Error(`Avatar upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(objectPathInBucket);
      if (!urlData?.publicUrl) throw new Error("Could not get public URL for new avatar.");
      newAvatarPublicUrl = urlData.publicUrl;
      setCurrentAvatarUrl(newAvatarPublicUrl);
    }

      // Step 2: Update profile data in 'profiles' table
      const profileUpdates = {
        id: user.id, // Ensure ID is part of the update for RLS
        full_name: fullName.trim() || null,
        avatar_url: newAvatarPublicUrl,
        hostel: hostel.trim() || null,
        batch: batch.trim() || null,
        bio: bio.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfileMessage('Profile updated successfully!');
      setAvatarFile(null); // Clear the file input state after successful upload
    } catch (err) {
      console.error("Profile update error:", err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setProfileError(`Profile update failed: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };


  // --- Password email handler ---
  const handleSetPassword = async () => {
    if (!user?.email) {
      showNotification({
        type: 'error',
        message: 'User email not found. Cannot set/change password.'
      });
      return;
    }
    
    const redirectTo = process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000/update-password'
      : 'https://byebuy.in/update-password';

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      user.email, 
      { redirectTo }
    );

    if (resetErr) {
      showNotification({
        type: 'error',
        message: `Error sending password setup/change email: ${resetErr.message}`
      });
    } else {
      showNotification({
        type: 'success', 
        message: 'Password reset link sent to your email. Please check your inbox (and spam folder).'
      });
    }
  };

  /* ---------- UI states -------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <LoadingSpinner message="Loading account settings..." />
      </div>
    );
  }

  if (!user) { // Should be caught by useEffect, but as a fallback
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-lg text-gray-700 dark:text-bye-dark-text-primary">
          You need to be logged in to view account settings.
        </p>
        <Link
          href="/auth?redirect=/account/settings"
          className="mt-4 inline-block text-indigo-600 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  const hasPasswordIdentity = user.identities?.some(i => i.provider === 'email');

  /* ---------- Main render ----------------------------------------------- */
  return (
    <div className="max-w-2xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 dark:text-bye-dark-text-primary mb-8">
        Account Settings
      </h1>

      {/* Profile Update Form */}
      <form onSubmit={handleProfileUpdate} className="bg-white dark:bg-bye-dark-bg-secondary shadow-xl rounded-lg p-6 sm:p-8 space-y-6 mb-10">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-bye-dark-text-primary border-b dark:border-bye-dark-border-primary pb-3 mb-6">
          Edit Profile
        </h2>

        {/* Avatar Upload */}
        <div className="flex flex-col items-center sm:flex-row sm:items-start gap-4 sm:gap-6">
          <div className="flex-shrink-0">
            <Image
              src={avatarPreview || '/default-avatar.png'} // Provide a default avatar placeholder
              alt="Profile Avatar Preview"
              width={96} // w-24
              height={96} // h-24
              className="rounded-full object-cover w-24 h-24 border-2 border-gray-300 dark:border-bye-dark-border-primary shadow-sm"
              onError={(e) => { (e.target as HTMLImageElement).src = '/default-avatar.png'; }}
            />
          </div>
          <div className="flex-grow text-center sm:text-left">
            <label htmlFor="avatarUpload" className="block text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary mb-1">
              Profile Picture
            </label>
            <input
              type="file"
              id="avatarUpload"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleAvatarChange}
              className="block w-full text-sm text-gray-500 dark:text-bye-dark-text-secondary
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-full file:border-0
                         file:text-sm file:font-semibold
                         file:bg-indigo-50 dark:file:bg-indigo-500/20 file:text-indigo-700 dark:file:text-indigo-300
                         hover:file:bg-indigo-100 dark:hover:file:bg-indigo-500/30"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-bye-dark-text-secondary">Max 2MB. JPG, PNG, or WEBP.</p>
          </div>
        </div>
        
        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">
            Full Name
          </label>
          <input
            id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 sm:text-sm bg-white dark:bg-bye-dark-bg-hover text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-400 dark:placeholder-bye-dark-text-secondary"
            placeholder="Your full name"
          />
        </div>

        {/* Hostel */}
        <div>
          <label htmlFor="hostel" className="block text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">
            Hostel Name/Number <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">(Optional)</span>
          </label>
          <input
            id="hostel" type="text" value={hostel} onChange={(e) => setHostel(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 sm:text-sm bg-white dark:bg-bye-dark-bg-hover text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-400 dark:placeholder-bye-dark-text-secondary"
            placeholder="e.g., Hostel 15, Room 203"
          />
        </div>
        
        {/* Batch */}
        <div>
          <label htmlFor="batch" className="block text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">
            Batch/Program <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">(Optional)</span>
          </label>
          <input
            id="batch" type="text" value={batch} onChange={(e) => setBatch(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 sm:text-sm bg-white dark:bg-bye-dark-bg-hover text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-400 dark:placeholder-bye-dark-text-secondary"
            placeholder="e.g., PGP 2023-25"
          />
        </div>

        {/* Bio */}
        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">
            Short Bio <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">(Optional)</span>
          </label>
          <textarea
            id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 sm:text-sm bg-white dark:bg-bye-dark-bg-hover text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-400 dark:placeholder-bye-dark-text-secondary"
            placeholder="Tell us a bit about yourself or your transaction preferences..."
          />
        </div>

        {/* Profile Alerts */}
        {profileMessage && (
          <div className="p-3 text-sm text-green-700 bg-green-100 rounded-md dark:bg-green-900/25 dark:text-green-300" role="alert">
            {profileMessage}
          </div>
        )}
        {profileError && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-md dark:bg-red-900/25 dark:text-red-300" role="alert">
            {profileError}
          </div>
        )}

        <div className="pt-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:focus:ring-indigo-400 dark:focus:ring-offset-bye-dark-bg-secondary disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Saving Profile...
              </>
            ) : (
              'Save Profile Changes'
            )}
          </button>
        </div>
      </form>


      {/* Manage Password Section */}
      <div className="bg-white dark:bg-bye-dark-bg-secondary shadow-xl rounded-lg p-6 sm:p-8 mt-10">
        {/* Email Display (Read-only) */}
        <div className="mb-6">
          <label
            htmlFor="emailDisplayPassword"
            className="block text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary"
          >
            Email Address (for password management)
          </label>
          <p
            id="emailDisplayPassword"
            className="mt-1 text-gray-900 dark:text-bye-dark-text-primary p-3
                       bg-gray-100 dark:bg-bye-dark-bg-hover rounded-md text-sm break-all"
          >
            {user.email}
          </p>
        </div>

        <div className="border-t border-gray-200 dark:border-bye-dark-border-primary pt-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-3">
            Manage Password
          </h2>
          <button
            onClick={handleSetPassword}
            className="w-full inline-flex justify-center items-center px-4 py-2
                       border border-transparent text-sm font-medium rounded-md shadow-sm
                       text-white bg-indigo-600 hover:bg-indigo-700
                       focus:outline-none focus:ring-2 focus:ring-indigo-500
                       dark:bg-indigo-500 dark:hover:bg-indigo-600
                       dark:focus:ring-indigo-400
                       dark:focus:ring-offset-bye-dark-bg-secondary"
          >
            {hasPasswordIdentity ? 'Change Password' : 'Set a Password for Email Login'}
          </button>
          <p className="mt-2 text-xs text-gray-500 dark:text-bye-dark-text-secondary text-center">
            {hasPasswordIdentity
              ? 'Click to receive an email to change your current password.'
              : 'If you signed up with Google/Social and want to enable email/password login, or if you forgot your password, click here.'}
          </p>
        </div>
      </div>
    </div>
  );
}