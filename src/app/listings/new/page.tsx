// src/app/listings/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, User } from '@/lib/supabaseClient';

// This component now represents the full page for adding a new listing
export default function NewListingPage() {
  const router = useRouter();

  // --- All the state from the original AddListingForm ---
  const [title, setTitle] = useState('');
  const [description, setDesc] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [endTime, setEndTime] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [upperCap, setUpperCap] = useState('');
  const [rules, setRules] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  // --- Fetch User Effect (same as before) ---
  useEffect(() => {
    // Redirect if not logged in (important for a dedicated page)
    const checkUser = async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
            console.log("User not logged in, redirecting from new listing page.");
            router.push('/auth'); // Redirect to login if not authenticated
        } else {
            setUser(data.user);
        }
    }
    checkUser();
  }, [router]); // Add router dependency

  // --- Handle Submit Function (with redirect on success) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMessage(null);
    if (!user) { /* ... user check ... */ return alert('Log in first'); }
    if (!photo) { /* ... photo check ... */ return alert('Please upload a photo'); }

    setIsSubmitting(true);
    let photoUrl: string | null = null;

    // 1. Upload Photo (same logic)
    if (photo) {
      const fileExt = photo.name.split('.').pop();
      const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      const filePath = `${user.id}/${safeTitle}_${Date.now()}.${fileExt}`;
      const { error: upErr } = await supabase.storage.from('listing-images').upload(filePath, photo, { cacheControl: '3600', upsert: false });
      if (upErr) { /* ... error handling ... */ setSubmitMessage(`Image upload failed: ${upErr.message}`); setIsSubmitting(false); return; }
      const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(filePath);
      photoUrl = urlData?.publicUrl ?? null;
    }

    // 2. Prepare data (same logic)
    const minPriceFloat = parseFloat(minPrice);
    const upperCapFloat = upperCap.trim() === '' ? null : parseFloat(upperCap);
    if (isNaN(minPriceFloat) || minPriceFloat < 0) { /* ... validation ... */ setSubmitMessage('Error: Minimum Price must be a valid positive number.'); setIsSubmitting(false); return; }
    if (upperCapFloat !== null && (isNaN(upperCapFloat) || upperCapFloat <= minPriceFloat)) { /* ... validation ... */ setSubmitMessage('Error: Upper Cap / Buy Now price must be a valid number greater than the Minimum Price.'); setIsSubmitting(false); return; }

    // 3. Insert Listing (same logic)
    try {
      const { error: insertError } = await supabase.from('listings').insert({
          title: title.trim(), description: description.trim(),
          min_price: minPriceFloat, end_time: new Date(endTime),
          seller_id: user.id, photos: photoUrl,
          upper_cap: upperCapFloat, rules: rules.trim() === '' ? null : rules.trim(),
          status: 'active',
      });
      if (insertError) throw insertError;

      // --- 4. Success Handling (Show message then redirect) ---
      setSubmitMessage('✅ Listing created successfully! Redirecting...');

      // Reset form fields immediately
      setTitle(''); setDesc(''); setMinPrice(''); setEndTime('');
      setPhoto(null); setUpperCap(''); setRules('');
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Redirect after a short delay to allow user to see the message
      setTimeout(() => {
          router.push('/listings'); // Redirect to the main listings page
      }, 1500); // Redirect after 1.5 seconds

    } catch (error) { /* ... error handling (same as before) ... */
        console.error('Listing insert failed:', error);
        let message = 'Failed to create listing.';
        if (error instanceof Error) { message += ` Error: ${error.message}`; }
        else if (error !== null && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') { message += ` Error: ${(error as { message: string }).message}`; }
        else if (typeof error === 'string') { message += ` Error: ${error}`; }
        setSubmitMessage(message);
    } finally {
        // Set submitting false only AFTER the timeout might have started,
        // so button remains disabled until redirect happens on success.
        // If there was an error, it gets set here.
         if (submitMessage && !submitMessage.startsWith('✅')) {
             setIsSubmitting(false);
         }
         // On success, isSubmitting stays true until redirect
    }
  };

  // --- Render Page Structure ---
  return (
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">Create New Listing</h1>
          {/* Render the actual form JSX (same as before) */}
          <form onSubmit={handleSubmit} className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow space-y-4">
              {/* ----- Start of Form JSX (Example - ensure yours is complete) ----- */}
               <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 border-b pb-2">Listing Details</h2>
                {submitMessage && ( <p className={`text-sm p-2 rounded ${submitMessage.startsWith('Error:') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{submitMessage}</p>)}
                <div><label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Title <span className="text-red-600">*</span></label><input id="title" type="text" placeholder="What are you selling?" value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700 dark:text-gray-100" /></div>
                <div><label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Description <span className="text-red-600">*</span></label><textarea id="description" placeholder="Describe the item, its condition, etc." value={description} onChange={e => setDesc(e.target.value)} required rows={3} className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700 dark:text-gray-100" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label htmlFor="minPrice" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Minimum Bid Price (₹) <span className="text-red-600">*</span></label><input id="minPrice" type="number" placeholder="e.g., 500" value={minPrice} onChange={e => setMinPrice(e.target.value)} required min="0" step="any" className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700 dark:text-gray-100" /></div><div><label htmlFor="upperCap" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Upper Cap / Buy Now Price (₹) <span className="text-gray-500 text-xs">(Optional)</span></label><input id="upperCap" type="number" placeholder="e.g., 2000 (Optional)" value={upperCap} onChange={e => setUpperCap(e.target.value)} min="0" step="any" className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700 dark:text-gray-100" /></div></div>
                <div><label htmlFor="endTime" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Auction End Time <span className="text-red-600">*</span></label><input id="endTime" type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} required min={new Date().toISOString().slice(0, 16)} className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700 dark:text-gray-100" /></div>
                <div><label htmlFor="rules" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Auction Rules <span className="text-gray-500 text-xs">(Optional)</span></label><textarea id="rules" placeholder="Any specific rules? e.g., 'Pickup only', 'Payment within 24 hours'" value={rules} onChange={e => setRules(e.target.value)} rows={2} className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700 dark:text-gray-100" /></div>
                <div><label htmlFor="photo-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Upload Photo <span className="text-red-600">*</span></label><input id="photo-upload" type="file" accept="image/png, image/jpeg, image/webp" onChange={e => setPhoto(e.target.files?.[0] || null)} required className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-800 dark:file:text-indigo-400 dark:file:hover:bg-indigo-900" /> {photo && ( /* eslint-disable-next-line @next/next/no-img-element */ <img src={URL.createObjectURL(photo)} alt="Preview" className="mt-2 h-20 w-auto rounded" /> )} </div>
                <button type="submit" disabled={isSubmitting || !user} className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? ( <><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Submitting...</> ) : ( 'Save Listing' )}</button>
              {/* ----- End of Form JSX ----- */}
          </form>
      </div>
  );
}
