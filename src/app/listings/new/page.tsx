// src/app/listings/new/page.tsx
'use client';

// Removed 'useMemo' import as it's no longer used
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image'; // Use Next.js Image for preview
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner'; // Reuse existing spinner

// --- Constants ---
// Predefined tags relevant to a campus marketplace
const PREDEFINED_TAGS = [
    'Electronics', 'Laptop', 'Mobile', 'Charger', 'Speaker', 'Headphones',
    'Furniture', 'Chair', 'Table', 'Lamp', 'Mattress', 'Storage',
    'Academics', 'Books', 'Notes', 'Calculator', 'Stationery',
    'Appliances', 'Kettle', 'Iron', 'Mini-fridge', 'Fan',
    'Clothing', 'Fashion', 'Accessories',
    'Sports', 'Fitness', 'Games',
    'Vehicle', 'Bicycle', 'Scooter',
    'Other', 'Home Goods', 'Decor',
];
const MAX_TAGS = 10; // Maximum number of tags allowed

// --- Component ---
export default function NewListingPage() {
    const router = useRouter();

    // --- State ---
    const [user, setUser] = useState<User | null>(null);
    const [loadingUser, setLoadingUser] = useState(true); // State for initial user check

    // Form Fields
    const [title, setTitle] = useState('');
    const [description, setDesc] = useState('');
    const [minPrice, setMinPrice] = useState('');
    const [upperCap, setUpperCap] = useState(''); // Optional "Buy Now" price
    const [endTime, setEndTime] = useState('');
    const [rules, setRules] = useState(''); // Optional rules
    const [photo, setPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null); // For preview URL

    // Tags State
    const [tagInput, setTagInput] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Submission State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // --- Effects ---
    // 1. Check user authentication on mount
    useEffect(() => {
        const checkUser = async () => {
            const { data, error } = await supabase.auth.getUser();
            setLoadingUser(false); // Mark user check as complete
            if (error || !data?.user) {
                console.log("User not logged in, redirecting from new listing page.");
                // Redirect to login, pass current path to redirect back after login
                router.push('/auth?redirect=/listings/new');
            } else {
                setUser(data.user);
            }
        }
        checkUser();
    }, [router]);

    // 2. Generate photo preview URL when photo changes
    useEffect(() => {
        let objectUrl: string | null = null;
        if (photo) {
            // Create a temporary URL for the selected file
            objectUrl = URL.createObjectURL(photo);
            setPhotoPreview(objectUrl);
        } else {
            setPhotoPreview(null); // Clear preview if photo is removed
        }
        // Cleanup function to revoke the object URL when component unmounts or photo changes
        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                console.log("Revoked photo preview URL:", objectUrl);
            }
        };
    }, [photo]); // Dependency on 'photo' state

    // --- Tag Management Callbacks ---
    // Handle changes in the tag input field
    const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTagInput(e.target.value);
    };

    // Add a tag to the selected tags list
    const addTag = useCallback((tagToAdd: string) => {
        // Clean the tag: trim whitespace, convert to lowercase
        const cleanedTag = tagToAdd.trim().toLowerCase();
        // Add only if tag has content, isn't already selected, and limit not reached
        if (cleanedTag && !selectedTags.includes(cleanedTag) && selectedTags.length < MAX_TAGS) {
            setSelectedTags((prevTags) => [...prevTags, cleanedTag]);
        }
        // Always clear the input field after attempting to add
        setTagInput('');
    }, [selectedTags]); // Recreate this function only if selectedTags changes

    // Handle key presses in the tag input (Enter or Comma to add tag)
    const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault(); // Prevent default behavior (form submission / comma insertion)
            addTag(tagInput);
        }
    };

    // Remove a tag from the selected tags list
    const removeTag = (tagToRemove: string) => {
        setSelectedTags((prevTags) => prevTags.filter((tag) => tag !== tagToRemove));
    };

    // NOTE: The unused 'filteredPredefinedTags' variable and useMemo hook have been removed.
    // Filtering of predefined tags now happens directly in the JSX map function.

    // --- Form Submission Logic ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); // Prevent default browser form submission
        setSubmitMessage(null); // Clear previous feedback messages

        // --- Client-Side Validation ---
        // 1. Authentication & Required Fields Check
        if (!user) {
            setSubmitMessage({ type: 'error', text: 'Authentication error. Please log in again.' });
            return; // Stop submission
        }
        if (!photo) {
            setSubmitMessage({ type: 'error', text: 'Please upload a photo for the listing.' });
            // Optionally focus the photo input or scroll to it here
            return;
        }
        // Check essential text fields
        if (!title.trim() || !description.trim() || !minPrice || !endTime) {
             setSubmitMessage({ type: 'error', text: 'Please fill in all required fields (*).' });
             return;
        }

        // 2. Price Logic Validation
        const minPriceFloat = parseFloat(minPrice);
        // Parse upperCap only if it's not empty/whitespace
        const upperCapFloat = upperCap.trim() ? parseFloat(upperCap) : null;

        if (isNaN(minPriceFloat) || minPriceFloat < 0) {
             setSubmitMessage({ type: 'error', text: 'Minimum Bid Price must be a valid non-negative number.' });
             return;
        }
         // Validate Buy Now price only if provided
         if (upperCapFloat !== null) {
             if (isNaN(upperCapFloat)) {
                 setSubmitMessage({ type: 'error', text: 'Buy Now price must be a valid number.' });
                 return;
             }
             if (upperCapFloat <= minPriceFloat) {
                 setSubmitMessage({ type: 'error', text: 'Buy Now price must be greater than the Minimum Bid Price.' });
                 return;
             }
         }

         // 3. End Time Validation
         // Ensure selected end time is in the future
         if (new Date(endTime) <= new Date()) {
            setSubmitMessage({ type: 'error', text: 'Auction End Time must be set to a future date and time.' });
            return;
         }
         // --- End Validation ---

        // If validations pass, proceed with submission
        setIsSubmitting(true);
        let photoUrl: string | null = null;

        // --- Step 1: Upload Photo to Supabase Storage ---
        try {
            console.log("Starting photo upload...");
            const fileExt = photo.name.split('.').pop();
            // Sanitize title for safe use in file path, limit length
            const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
            // Construct a unique file path using user ID, sanitized title, and timestamp
            const filePath = `${user.id}/${safeTitle}_${Date.now()}.${fileExt}`;

            // Perform the upload
            const { error: uploadError } = await supabase.storage
                .from('listing-images') // Target the correct bucket
                .upload(filePath, photo, {
                    cacheControl: '3600', // Cache image for 1 hour
                    upsert: false // Prevent overwriting existing files with the same name
                 });

            // Handle upload errors
            if (uploadError) {
                // Re-throw specific error for the catch block
                throw new Error(`Image upload failed: ${uploadError.message}`);
            }
            console.log("Photo uploaded successfully, path:", filePath);

            // Get the public URL of the uploaded image
            const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(filePath);
            photoUrl = urlData?.publicUrl ?? null;

            // Ensure URL was obtained
            if (!photoUrl) {
                throw new Error("Failed to get public URL for the uploaded image. Upload might have partially failed.");
            }
            console.log("Photo public URL obtained:", photoUrl);

        } catch (error) {
            // Catch errors from the upload process
            console.error("Photo upload step failed:", error);
            // Display user-friendly error message
            setSubmitMessage({ type: 'error', text: error instanceof Error ? error.message : 'An unexpected error occurred during photo upload.' });
            setIsSubmitting(false); // Allow user to try again
            return; // Stop the submission process here
        }

        // --- Step 2: Insert Listing Data into Supabase Database ---
        try {
            console.log("Preparing listing data for insertion...");
            // Prepare the data object matching the 'listings' table schema
            const listingData = {
                title: title.trim(),
                description: description.trim(),
                min_price: minPriceFloat,
                end_time: new Date(endTime).toISOString(), // Store as ISO string (TIMESTAMPTZ)
                seller_id: user.id, // Link to the authenticated user
                photos: photoUrl, // Store the public URL obtained from storage
                upper_cap: upperCapFloat, // Store null if not provided
                rules: rules.trim() || null, // Store null if rules field is empty/whitespace
                status: 'active', // Set initial status
                tags: selectedTags.length > 0 ? selectedTags : null, // Store tags array or null
            };

            console.log("Inserting listing data:", listingData);
            // Perform the database insert operation
            const { error: insertError } = await supabase.from('listings').insert(listingData);

            // Handle database insert errors
            if (insertError) {
                // Re-throw specific error for the catch block
                // Could be due to RLS, constraints, network issues, etc.
                throw insertError;
            }

            // --- Success Scenario ---
            console.log("Listing inserted successfully!");
            // Provide success feedback to the user
            setSubmitMessage({ type: 'success', text: 'Listing created successfully! Redirecting...' });

            // Reset form fields to clear the form
            setTitle(''); setDesc(''); setMinPrice(''); setUpperCap('');
            setEndTime(''); setRules(''); setPhoto(null); // Clears file selection
            setPhotoPreview(null); // Clears the preview image
            setSelectedTags([]); setTagInput(''); // Clear tags state
            // Attempt to visually reset the file input element
            const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';

            // Redirect user to the main listings page after a brief delay
            setTimeout(() => {
                router.push('/listings');
            }, 1500); // 1.5 seconds delay

            // Keep isSubmitting true until the redirect occurs
            // setIsSubmitting(false); // Don't set to false here on success

        } catch (error) {
            // Catch errors from the database insert operation
            console.error('Listing insertion step failed:', error);
            let message = 'Failed to create listing in the database.';
             if (error instanceof Error) {
                 // Provide more specific error details if available
                message = `Listing creation failed: ${error.message}`;
            }
            // Display user-friendly error message
            setSubmitMessage({ type: 'error', text: message });
            setIsSubmitting(false); // Allow user to correct issues and retry
        }
         // Note: The finally block is intentionally omitted for the success path
         // to keep the button disabled until the redirect completes.
    };

    // --- Render Guards ---
    // Show loading spinner while verifying user authentication
    if (loadingUser) {
        return <div className="flex justify-center py-20"><LoadingSpinner message="Checking authentication..." /></div>;
    }

    // User check is complete, proceed to render the form
    // (User object might still be null if redirection is happening)
    // The submit button's disabled state handles the case where user is null but form is rendered momentarily

    // --- JSX ---
    return (
        // Page container with max-width and padding
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
            {/* Page Title */}
            <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">
                Create New Listing
            </h1>

            {/* Form Component: wrapped in a styled card */}
            <form
                onSubmit={handleSubmit}
                noValidate // Disable default HTML validation, rely on JS checks
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md p-6 sm:p-8 space-y-6" // Card styling with padding and vertical spacing between elements
            >
                 {/* Submission Feedback Area: Displays success or error messages */}
                 {submitMessage && (
                    <div
                        className={`p-4 rounded-md border text-sm flex items-start gap-3 ${submitMessage.type === 'error' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-200' : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-600/50 text-green-800 dark:text-green-200'}`}
                        role="alert" // Accessibility attribute for alert messages
                    >
                        {/* Icon indicating message type */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                            {submitMessage.type === 'error' ? (
                                <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm-.85-5.65a.75.75 0 0 1 1.06-1.06L10.94 11l2.75-2.75a.75.75 0 1 1 1.06 1.06L11.5 12.56l2.75 2.75a.75.75 0 1 1-1.06 1.06L10.44 13l-2.75 2.75a.75.75 0 1 1-1.06-1.06l2.75-2.75-2.75-2.75Z" clipRule="evenodd" /> // Error Icon
                            ) : (
                                <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.84-8.41a.75.75 0 1 1-1.06-1.06L7.94 8.37 6.72 7.15a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l4.37-4.37Z" clipRule="evenodd" /> // Success Icon
                             )}
                        </svg>
                         {/* The feedback message text */}
                         <span>{submitMessage.text}</span>
                    </div>
                )}

                {/* --- Field: Listing Title --- */}
                <div>
                    {/* Label associated with the input */}
                    <label htmlFor="title" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Listing Title <span className="text-red-500 dark:text-red-400 ml-0.5">*</span> {/* Required field indicator */}
                    </label>
                    <input
                        id="title"
                        type="text"
                        placeholder="e.g., Slightly Used Noise Cancelling Headphones" // Helpful placeholder
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        required // HTML5 required attribute (basic check)
                        maxLength={100} // Limit title length
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" // Consistent styling for inputs
                    />
                </div>

                {/* --- Field: Description --- */}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Description <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                    <textarea
                        id="description"
                        placeholder="Describe the item, its condition, reason for selling, etc."
                        value={description}
                        onChange={e => setDesc(e.target.value)}
                        required
                        rows={4} // Suggests a multi-line input
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" // Consistent styling for textareas
                    />
                </div>

                 {/* --- Row: Prices (Using Grid for Alignment) --- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6"> {/* Responsive grid */}
                    {/* Field: Minimum Bid Price */}
                    <div>
                         <label htmlFor="minPrice" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                            Minimum Bid Price (₹) <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                        </label>
                        <div className="relative"> {/* Container for positioning the currency symbol */}
                             <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span> {/* Currency symbol */}
                            <input
                                id="minPrice"
                                type="number"
                                placeholder="e.g., 500"
                                value={minPrice}
                                onChange={e => setMinPrice(e.target.value)}
                                required
                                min="0" // Cannot be negative
                                step="any" // Allows decimal prices (e.g., 50.50). Use "1" for integers.
                                className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" // Left padding for symbol
                             />
                        </div>
                    </div>
                     {/* Field: Upper Cap / Buy Now Price */}
                    <div>
                        <label htmlFor="upperCap" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                            Buy Now Price (₹) <span className="text-gray-500 text-xs">(Optional)</span> {/* Indicate optional field */}
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span>
                            <input
                                id="upperCap"
                                type="number"
                                placeholder="Instant buy price (optional)"
                                value={upperCap}
                                onChange={e => setUpperCap(e.target.value)}
                                min="0" // Basic validation, stricter check in handleSubmit
                                step="any"
                                className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" // Left padding for symbol
                            />
                        </div>
                    </div>
                </div>


                {/* --- Field: Auction End Time --- */}
                <div>
                    <label htmlFor="endTime" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Auction End Time <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                    <input
                        id="endTime"
                        type="datetime-local" // Use standard browser date/time picker
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                        required
                        // Set minimum selectable time to avoid past dates (e.g., 1 minute from now)
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                    {/* Helper text */}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select the date and time when the auction should automatically end.</p>
                </div>

                 {/* --- Field: Auction Rules --- */}
                 <div>
                    <label htmlFor="rules" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Auction Rules <span className="text-gray-500 text-xs">(Optional)</span>
                    </label>
                    <textarea
                        id="rules"
                        placeholder="e.g., Pickup only from campus hostel X, Payment via UPI within 24 hours of winning."
                        value={rules}
                        onChange={e => setRules(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                </div>

                {/* --- Field: Tags --- */}
                <div>
                     <label htmlFor="tag-input" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Tags <span className="text-gray-500 text-xs">(Optional, helps discovery, max {MAX_TAGS})</span>
                    </label>
                    {/* Display selected tags as dismissible badges */}
                     <div className="flex flex-wrap gap-2 mb-2 min-h-[28px]"> {/* Min height prevents layout shift */}
                        {selectedTags.map(tag => (
                            <span key={tag} className="inline-flex items-center gap-x-1.5 rounded-full bg-blue-100 dark:bg-blue-800/60 px-2.5 py-1 text-xs font-medium text-blue-800 dark:text-blue-200 ring-1 ring-inset ring-blue-200 dark:ring-blue-700">
                                {tag} {/* Display the tag */}
                                {/* Button to remove the tag */}
                                <button
                                    type="button" // Prevent form submission
                                    onClick={() => removeTag(tag)}
                                    className="-mr-0.5 p-0.5 rounded-full inline-flex items-center justify-center text-blue-500 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    aria-label={`Remove ${tag}`} // Accessibility label
                                >
                                    {/* Close (X) icon */}
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                                </button>
                            </span>
                         ))}
                    </div>
                    {/* Input field for typing new tags */}
                    <input
                        id="tag-input"
                        type="text"
                        placeholder={selectedTags.length < MAX_TAGS ? `Type a tag and press Enter (e.g., 'book')` : `Maximum ${MAX_TAGS} tags reached`}
                        value={tagInput}
                        onChange={handleTagInputChange}
                        onKeyDown={handleTagInputKeyDown} // Handle Enter/Comma keys
                        disabled={selectedTags.length >= MAX_TAGS} // Disable input when limit is reached
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed" // Disabled styling
                    />
                    {/* Predefined tag suggestions (clickable buttons) */}
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Or click to add common tags:</p>
                     <div className="flex flex-wrap gap-2 mt-1.5">
                         {/* Map over predefined tags, filter out already selected ones, limit suggestions */}
                         {PREDEFINED_TAGS
                             .filter(t => !selectedTags.includes(t.toLowerCase())) // Show only tags not yet selected
                             .slice(0, 15) // Limit number of suggestions shown for UI cleanliness
                             .map(tag => (
                             <button
                                type="button" // Prevent form submission
                                key={tag}
                                onClick={() => addTag(tag)} // Add tag when button is clicked
                                disabled={selectedTags.length >= MAX_TAGS} // Disable if max tags reached
                                className="px-2.5 py-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" // Styling for suggestion buttons
                            >
                                {tag} {/* Tag text */}
                            </button>
                         ))}
                     </div>
                </div>


                {/* --- Field: Photo Upload --- */}
                <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Upload Photo <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                     {/* Styled label acting as a button to trigger the hidden file input */}
                    <label
                        htmlFor="photo-upload"
                        className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 dark:focus-within:ring-offset-gray-800" // Apply focus styles when hidden input is focused
                    >
                         {/* Icon for visual cue */}
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400">
                            <path fillRule="evenodd" d="M1.5 3A1.5 1.5 0 0 1 3 1.5h10A1.5 1.5 0 0 1 14.5 3v10a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V3ZM3 3h10v10H3V3Zm3.857 1.9a.5.5 0 0 1 .686.01l1.6 1.76a.5.5 0 0 1-.01.686l-3.28 3.2a.5.5 0 0 1-.663-.026L4 9.5l-.01-.012a.5.5 0 0 1 .66-.72l.91.82 1.5-1.5a.5.5 0 0 1 .698-.002Z" clipRule="evenodd" />
                            <path d="M10.25 5.5a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
                        </svg>
                        {/* Button text changes based on whether a photo is selected */}
                        <span>{photo ? 'Change Photo' : 'Choose Photo'}</span>
                         {/* The actual file input, visually hidden */}
                        <input
                            id="photo-upload"
                            type="file"
                            accept="image/png, image/jpeg, image/webp" // Restrict file types
                            onChange={e => setPhoto(e.target.files?.[0] || null)}
                            required // Mark as required for browser checks
                            className="sr-only" // Tailwind class to hide element visually but keep accessible
                         />
                    </label>
                    {/* Preview area for the selected image */}
                    {photoPreview && (
                        <div className="mt-3 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-md inline-block"> {/* Dashed border for preview container */}
                            <Image
                                src={photoPreview} // Use the temporary object URL
                                alt="Selected photo preview"
                                width={150} // Define preview dimensions
                                height={150}
                                style={{ objectFit: 'contain' }} // Use style prop for objectFit with next/image v13+
                                className="h-32 w-auto rounded-md" // Max height, auto width
                            />
                        </div>
                    )}
                     {/* Helper text providing guidance on file types/size */}
                     <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">PNG, JPG, or WEBP. Max 5MB recommended.</p>
                </div>

                {/* --- Submit Button Area --- */}
                {/* Visually separated by a top border */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        type="submit"
                        // Disable button during submission, or if user isn't loaded/logged in
                        disabled={isSubmitting || !user || loadingUser}
                        className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200" // Primary button styling with disabled state
                    >
                        {isSubmitting ? (
                            <>
                                {/* Loading indicator: SVG spinner */}
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Submitting... {/* Text indicating loading state */}
                            </>
                        ) : (
                            'Save Listing' // Default button text
                        )}
                    </button>
                </div>

            </form>
        </div>
    );
}