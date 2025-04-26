// src/app/listings/add-form.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase, User } from '@/lib/supabaseClient'; // Ensure User type is imported

export default function AddListingForm() {
  // Existing state
  const [title, setTitle] = useState('');
  const [description, setDesc] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [endTime, setEndTime] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // --- NEW state variables ---
  const [upperCap, setUpperCap] = useState(''); // For 'Buy Now' / Upper Cap price (string for input)
  const [rules, setRules] = useState('');     // For optional rules

  // --- State for loading/feedback ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the current user on component mount
    supabase.auth.getUser().then(({ data, error }) => {
        if (error) {
            console.error("Error fetching user for form:", error.message);
        }
        setUser(data?.user ?? null);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission
    setSubmitMessage(null); // Clear previous messages
    if (!user) {
        setSubmitMessage('Error: You must be logged in to create a listing.');
        return alert('Log in first'); // Also alert for immediate feedback
    }
    if (!photo) { // Make photo required for now, adjust if needed
        setSubmitMessage('Error: Please upload a photo for the listing.');
        return alert('Please upload a photo');
    }

    setIsSubmitting(true); // Indicate loading state

    let photoUrl: string | null = null;
    let uploadError = null;

    // 1. Upload Photo to Supabase Storage
    if (photo) {
      const fileExt = photo.name.split('.').pop();
      // Use a more structured path: user_id/listing_title_timestamp.ext
      const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30); // Sanitize title for filename
      const filePath = `${user.id}/${safeTitle}_${Date.now()}.${fileExt}`;

      const { error: upErr } = await supabase
        .storage
        .from('listing-images') // Make sure bucket name matches exactly
        .upload(filePath, photo, {
             cacheControl: '3600', // Optional: cache control
             upsert: false // Optional: don't overwrite if somehow exists
         });

      if (upErr) {
        console.error('Image upload failed:', upErr);
        uploadError = `Image upload failed: ${upErr.message}`;
        // Continue to attempt listing insert even if image fails? Or stop here?
        // Let's stop here for now:
        setSubmitMessage(uploadError);
        setIsSubmitting(false);
        return; // Stop submission if image upload fails
      } else {
          // Get public URL after successful upload
          const { data: urlData } = supabase
            .storage
            .from('listing-images')
            .getPublicUrl(filePath);
          photoUrl = urlData?.publicUrl ?? null; // Assign the public URL
          console.log('Photo uploaded:', photoUrl);
      }
    }

    // 2. Prepare data for listing insert
    const minPriceFloat = parseFloat(minPrice);
    // Convert upperCap string to number or null if empty/invalid
    const upperCapFloat = upperCap.trim() === '' ? null : parseFloat(upperCap);

    // Basic validation check (ensure minPrice is valid)
    if (isNaN(minPriceFloat) || minPriceFloat < 0) {
        setSubmitMessage('Error: Minimum Price must be a valid positive number.');
        setIsSubmitting(false);
        return;
    }
    // Optional: Validate upperCap if provided
    if (upperCapFloat !== null && (isNaN(upperCapFloat) || upperCapFloat <= minPriceFloat)) {
        setSubmitMessage('Error: Upper Cap / Buy Now price must be a valid number greater than the Minimum Price.');
        setIsSubmitting(false);
        return;
    }


    // 3. Insert Listing into Supabase Database
    try {
      const { error: insertError } = await supabase
          .from('listings')
          .insert({
              title: title.trim(),
              description: description.trim(),
              min_price: minPriceFloat,
              end_time: new Date(endTime), // Ensure endTime is a valid date string
              seller_id: user.id, // Set the seller ID
              photos: photoUrl, // Use the URL obtained from storage upload
              // --- Include NEW fields ---
              upper_cap: upperCapFloat, // Include the parsed upper cap (or null)
              rules: rules.trim() === '' ? null : rules.trim(), // Include rules (or null if empty)
              status: 'active', // Explicitly set status, though DB has default
          });

      if (insertError) {
        throw insertError; // Throw error to be caught below
      }

      // 4. Success: Reset form and show success message
      setSubmitMessage('✅ Listing created successfully!');
      setTitle('');
      setDesc('');
      setMinPrice('');
      setEndTime('');
      setPhoto(null);
      setUpperCap(''); // Reset new fields
      setRules('');     // Reset new fields
      // Clear the file input visually (requires a trick)
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (error: any) {
        console.error('Listing insert failed:', error);
        let message = 'Failed to create listing.';
        if (error && typeof error === 'object' && 'message' in error) {
            message += ` Error: ${error.message}`;
        }
        setSubmitMessage(message);
        // Optionally attempt to delete the uploaded photo if insert fails? More complex cleanup.
    } finally {
        setIsSubmitting(false); // Set loading false after attempt
    }
  };

  // --- Render Form ---
  return (
    <form onSubmit={handleSubmit} className="mb-10 p-6 border border-gray-200 rounded-lg bg-white shadow space-y-4">
      <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">Add a New Listing</h2>

      {/* Display Submission Message */}
      {submitMessage && (
          <p className={`text-sm p-2 rounded ${submitMessage.startsWith('Error:') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {submitMessage}
          </p>
      )}

      {/* Title Input */}
      <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-600">*</span></label>
          <input
            id="title"
            type="text"
            placeholder="What are you selling?"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            maxLength={100} // Optional: Add max length
            className="w-full border border-gray-300 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
      </div>

       {/* Description Input */}
       <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-600">*</span></label>
          <textarea
            id="description"
            placeholder="Describe the item, its condition, etc."
            value={description}
            onChange={e => setDesc(e.target.value)}
            required
            rows={3} // Adjust rows as needed
            className="w-full border border-gray-300 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
       </div>

       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
           {/* Min Price Input */}
           <div>
              <label htmlFor="minPrice" className="block text-sm font-medium text-gray-700 mb-1">Minimum Bid Price (₹) <span className="text-red-600">*</span></label>
              <input
                id="minPrice"
                type="number"
                placeholder="e.g., 500"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                required
                min="0" // Cannot be negative
                step="any" // Allows decimals
                className="w-full border border-gray-300 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
           </div>

           {/* ------ NEW FIELD: Upper Cap ------ */}
           <div>
              <label htmlFor="upperCap" className="block text-sm font-medium text-gray-700 mb-1">Upper Cap / Buy Now Price (₹) <span className="text-gray-500 text-xs">(Optional)</span></label>
              <input
                id="upperCap"
                type="number"
                placeholder="e.g., 2000 (Optional)"
                value={upperCap}
                onChange={e => setUpperCap(e.target.value)}
                min="0" // Cannot be negative
                step="any"
                className="w-full border border-gray-300 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
           </div>
       </div>


        {/* Auction End Time Input */}
       <div>
          <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-1">Auction End Time <span className="text-red-600">*</span></label>
          <input
            id="endTime"
            type="datetime-local" // Use datetime-local for date and time
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            required
            // Optional: Set min value to prevent setting past dates
            min={new Date().toISOString().slice(0, 16)}
            className="w-full border border-gray-300 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
       </div>

      {/* ------ NEW FIELD: Rules ------ */}
      <div>
          <label htmlFor="rules" className="block text-sm font-medium text-gray-700 mb-1">Auction Rules <span className="text-gray-500 text-xs">(Optional)</span></label>
          <textarea
            id="rules"
            placeholder="Any specific rules? e.g., 'Pickup only', 'Payment within 24 hours'"
            value={rules}
            onChange={e => setRules(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 px-3 py-2 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
       </div>


       {/* Photo Upload Input */}
       <div>
          <label htmlFor="photo-upload" className="block text-sm font-medium text-gray-700 mb-1">Upload Photo <span className="text-red-600">*</span></label>
          <input
            id="photo-upload" // Added ID for resetting
            type="file"
            accept="image/png, image/jpeg, image/webp" // Be specific about accepted types
            onChange={e => setPhoto(e.target.files?.[0] || null)}
            required // Make photo required
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
          {/* Optional: Show preview of selected image */}
          {photo && <img src={URL.createObjectURL(photo)} alt="Preview" className="mt-2 h-20 w-auto rounded" /> }
       </div>


      {/* Submit Button */}
      <button
         type="submit"
         disabled={isSubmitting || !user} // Disable if submitting or not logged in
         className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
       >
        {isSubmitting ? (
             <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
               Submitting...
             </>
         ) : (
             'Save Listing'
         )}
      </button>
    </form>
  );
}