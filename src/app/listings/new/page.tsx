// src/app/listings/new/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image'; // Use Next.js Image for preview
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner'; // Reuse existing spinner

// --- Constants ---
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
                router.push('/auth?redirect=/listings/new'); // Redirect to login, remember target
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
            objectUrl = URL.createObjectURL(photo);
            setPhotoPreview(objectUrl);
        } else {
            setPhotoPreview(null);
        }
        // Cleanup function to revoke the object URL
        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [photo]); // Dependency on 'photo' state

    // --- Tag Management ---
    const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTagInput(e.target.value);
    };

    const addTag = useCallback((tagToAdd: string) => {
        const cleanedTag = tagToAdd.trim().toLowerCase();
        if (cleanedTag && !selectedTags.includes(cleanedTag) && selectedTags.length < 10) { // Limit tags
            setSelectedTags((prevTags) => [...prevTags, cleanedTag]);
        }
        setTagInput(''); // Clear input after adding
    }, [selectedTags]); // Dependency on selectedTags

    const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault(); // Prevent form submission on Enter
            addTag(tagInput);
        }
    };

    const removeTag = (tagToRemove: string) => {
        setSelectedTags((prevTags) => prevTags.filter((tag) => tag !== tagToRemove));
    };

    // Filter predefined tags based on input (for potential future suggestion list)
    const filteredPredefinedTags = useMemo(() => {
        if (!tagInput) return PREDEFINED_TAGS;
        return PREDEFINED_TAGS.filter(tag =>
            tag.toLowerCase().includes(tagInput.toLowerCase())
        );
    }, [tagInput]);


    // --- Form Submission ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitMessage(null); // Clear previous messages

        // 1. Basic Validations
        if (!user) {
            setSubmitMessage({ type: 'error', text: 'Authentication error. Please log in again.' });
            return;
        }
        if (!photo) {
            setSubmitMessage({ type: 'error', text: 'Please upload a photo for the listing.' });
            return;
        }
        if (!title.trim() || !description.trim() || !minPrice || !endTime) {
             setSubmitMessage({ type: 'error', text: 'Please fill in all required fields (*).' });
             return;
        }

        // 2. Price Validation
        const minPriceFloat = parseFloat(minPrice);
        const upperCapFloat = upperCap.trim() ? parseFloat(upperCap) : null;

        if (isNaN(minPriceFloat) || minPriceFloat < 0) {
             setSubmitMessage({ type: 'error', text: 'Minimum Bid Price must be a valid non-negative number.' });
             return;
        }
         if (upperCapFloat !== null && (isNaN(upperCapFloat) || upperCapFloat <= minPriceFloat)) {
             setSubmitMessage({ type: 'error', text: 'Buy Now price must be a valid number greater than the Minimum Bid Price.' });
             return;
        }

         // 3. End Time Validation (should be in the future)
         if (new Date(endTime) <= new Date()) {
            setSubmitMessage({ type: 'error', text: 'Auction End Time must be in the future.' });
            return;
         }


        setIsSubmitting(true);
        let photoUrl: string | null = null;

        // 4. Upload Photo
        try {
            const fileExt = photo.name.split('.').pop();
            const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
            const filePath = `${user.id}/${safeTitle}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('listing-images')
                .upload(filePath, photo, { cacheControl: '3600', upsert: false });

            if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

            const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(filePath);
            photoUrl = urlData?.publicUrl ?? null;

            if (!photoUrl) throw new Error("Failed to get public URL for uploaded image.");

        } catch (error) {
            console.error("Photo upload error:", error);
            setSubmitMessage({ type: 'error', text: error instanceof Error ? error.message : 'An error occurred during photo upload.' });
            setIsSubmitting(false);
            return; // Stop submission if photo upload fails
        }


        // 5. Insert Listing into Database
        try {
            const listingData = {
                title: title.trim(),
                description: description.trim(),
                min_price: minPriceFloat,
                end_time: new Date(endTime).toISOString(), // Ensure ISO string format
                seller_id: user.id,
                photos: photoUrl, // Use the URL obtained after upload
                upper_cap: upperCapFloat,
                rules: rules.trim() || null, // Set to null if empty
                status: 'active', // Default status
                tags: selectedTags.length > 0 ? selectedTags : null, // Add the selected tags array
            };

            const { error: insertError } = await supabase.from('listings').insert(listingData);

            if (insertError) throw insertError; // Let catch block handle DB errors

            // --- Success ---
            setSubmitMessage({ type: 'success', text: 'Listing created successfully! Redirecting...' });

            // Reset form fields
            setTitle(''); setDesc(''); setMinPrice(''); setUpperCap('');
            setEndTime(''); setRules(''); setPhoto(null); setPhotoPreview(null);
            setSelectedTags([]); setTagInput('');
            // Reset file input visually (find a reliable way if needed, direct value set might not work)
            const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';


            // Redirect after a short delay
            setTimeout(() => {
                router.push('/listings'); // Redirect to the main listings page
            }, 1500);
            // Keep isSubmitting true until redirect happens

        } catch (error) {
            console.error('Listing insertion failed:', error);
            let message = 'Failed to create listing.';
             if (error instanceof Error) {
                 // Check for specific DB errors if needed (e.g., RLS violations)
                message = `Listing creation failed: ${error.message}`;
            }
            setSubmitMessage({ type: 'error', text: message });
            setIsSubmitting(false); // Allow user to retry after error
        }
         // Note: No finally block setting isSubmitting to false here on success,
         // as we want the button disabled until the redirect.
    };

    // --- Render Guards ---
    if (loadingUser) {
        return <div className="flex justify-center py-20"><LoadingSpinner message="Checking authentication..." /></div>;
    }

    // --- JSX ---
    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
                Create New Listing
            </h1>

            {/* Form wrapped in a styled container */}
            <form
                onSubmit={handleSubmit}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md p-6 sm:p-8 space-y-6" // Added padding and spacing
            >
                 {/* Submission Feedback Area */}
                 {submitMessage && (
                    <div
                        className={`p-4 rounded-md border text-sm flex items-start gap-3
                        ${submitMessage.type === 'error' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-200' : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-600/50 text-green-800 dark:text-green-200'}`}
                        role="alert"
                    >
                        {/* Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                            {submitMessage.type === 'error' ? (
                                <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm-.85-5.65a.75.75 0 0 1 1.06-1.06L10.94 11l2.75-2.75a.75.75 0 1 1 1.06 1.06L11.5 12.56l2.75 2.75a.75.75 0 1 1-1.06 1.06L10.44 13l-2.75 2.75a.75.75 0 1 1-1.06-1.06l2.75-2.75-2.75-2.75Z" clipRule="evenodd" />
                            ) : (
                                <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.84-8.41a.75.75 0 1 1-1.06-1.06L7.94 8.37 6.72 7.15a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l4.37-4.37Z" clipRule="evenodd" />
                             )}
                        </svg>
                         <span>{submitMessage.text}</span>
                    </div>
                )}

                {/* --- Field: Title --- */}
                <div>
                    <label htmlFor="title" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Listing Title <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                    <input
                        id="title"
                        type="text"
                        placeholder="e.g., Slightly Used Noise Cancelling Headphones"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        required
                        maxLength={100}
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500"
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
                        rows={4}
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                </div>

                 {/* --- Row: Prices --- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                    {/* Field: Minimum Price */}
                    <div>
                         <label htmlFor="minPrice" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                            Minimum Bid Price (₹) <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                        </label>
                        <div className="relative">
                             <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span>
                            <input
                                id="minPrice"
                                type="number"
                                placeholder="e.g., 500"
                                value={minPrice}
                                onChange={e => setMinPrice(e.target.value)}
                                required
                                min="0"
                                step="any" // Allow decimals if needed, change to "1" for whole numbers
                                className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500"
                             />
                        </div>
                    </div>
                     {/* Field: Upper Cap / Buy Now */}
                    <div>
                        <label htmlFor="upperCap" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                            Buy Now Price (₹) <span className="text-gray-500 text-xs">(Optional)</span>
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span>
                            <input
                                id="upperCap"
                                type="number"
                                placeholder="Instant buy price (optional)"
                                value={upperCap}
                                onChange={e => setUpperCap(e.target.value)}
                                min="0" // Technically should be > minPrice, validated in handleSubmit
                                step="any"
                                className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500"
                            />
                        </div>
                    </div>
                </div>


                {/* --- Field: End Time --- */}
                <div>
                    <label htmlFor="endTime" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Auction End Time <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                    <input
                        id="endTime"
                        type="datetime-local" // Standard HTML5 date-time picker
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                        required
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} // Set min to 1 minute from now
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500"
                    />
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
                        Tags <span className="text-gray-500 text-xs">(Optional, helps discovery)</span>
                    </label>
                    {/* Display selected tags */}
                     <div className="flex flex-wrap gap-2 mb-2">
                        {selectedTags.map(tag => (
                            <span key={tag} className="inline-flex items-center gap-x-1.5 rounded-full bg-blue-100 dark:bg-blue-800/60 px-2.5 py-1 text-xs font-medium text-blue-800 dark:text-blue-200 ring-1 ring-inset ring-blue-200 dark:ring-blue-700">
                                {tag}
                                <button
                                    type="button"
                                    onClick={() => removeTag(tag)}
                                    className="-mr-0.5 p-0.5 rounded-full inline-flex items-center justify-center text-blue-500 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    aria-label={`Remove ${tag}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                                </button>
                            </span>
                         ))}
                    </div>
                    {/* Tag input field */}
                    <input
                        id="tag-input"
                        type="text"
                        placeholder={selectedTags.length < 10 ? "Type a tag and press Enter (e.g., 'book')" : "Maximum 10 tags reached"}
                        value={tagInput}
                        onChange={handleTagInputChange}
                        onKeyDown={handleTagInputKeyDown}
                        disabled={selectedTags.length >= 10}
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500 disabled:opacity-50"
                    />
                    {/* Predefined tag suggestions */}
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Or click to add common tags:</p>
                     <div className="flex flex-wrap gap-2 mt-1.5">
                         {PREDEFINED_TAGS.filter(t => !selectedTags.includes(t.toLowerCase())).slice(0, 15).map(tag => ( // Show only unused, limit displayed
                             <button
                                type="button"
                                key={tag}
                                onClick={() => addTag(tag)}
                                disabled={selectedTags.length >= 10}
                                className="px-2.5 py-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {tag}
                            </button>
                         ))}
                     </div>
                </div>


                {/* --- Field: Photo Upload --- */}
                <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Upload Photo <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                     {/* Styled button-like label */}
                    <label
                        htmlFor="photo-upload"
                        className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 dark:focus-within:ring-offset-gray-800"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400">
                            <path fillRule="evenodd" d="M1.5 3A1.5 1.5 0 0 1 3 1.5h10A1.5 1.5 0 0 1 14.5 3v10a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V3ZM3 3h10v10H3V3Zm3.857 1.9a.5.5 0 0 1 .686.01l1.6 1.76a.5.5 0 0 1-.01.686l-3.28 3.2a.5.5 0 0 1-.663-.026L4 9.5l-.01-.012a.5.5 0 0 1 .66-.72l.91.82 1.5-1.5a.5.5 0 0 1 .698-.002Z" clipRule="evenodd" />
                            <path d="M10.25 5.5a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
                        </svg>
                        <span>{photo ? 'Change Photo' : 'Choose Photo'}</span>
                         {/* Hidden actual file input */}
                        <input
                            id="photo-upload"
                            type="file"
                            accept="image/png, image/jpeg, image/webp" // Specify accepted types
                            onChange={e => setPhoto(e.target.files?.[0] || null)}
                            required // Browser validation
                            className="sr-only" // Hide the default ugly input
                         />
                    </label>
                    {/* Image Preview */}
                    {photoPreview && (
                        <div className="mt-3 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-md inline-block">
                            <Image
                                src={photoPreview}
                                alt="Selected photo preview"
                                width={150} // Example size
                                height={150} // Example size
                                className="h-32 w-auto rounded-md object-contain" // Use contain to see full image
                            />
                        </div>
                    )}
                     <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">PNG, JPG, or WEBP. Max 5MB recommended.</p>
                </div>

                {/* --- Submit Button --- */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        type="submit"
                        disabled={isSubmitting || !user} // Disable if submitting or user data is missing
                        className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        {isSubmitting ? (
                            <>
                                {/* Use a simplified inline spinner */}
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
                </div>

            </form>
        </div>
    );
}