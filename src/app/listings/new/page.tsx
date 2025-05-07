// src/app/listings/new/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';

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
const MAX_TAGS = 10;
const MAX_PHOTOS = 5;

// Corrected: Interface for associating filename with upload result
interface UploadResult {
  status: 'fulfilled' | 'rejected';
  value?: string; // URL if fulfilled
  reason?: unknown; // Use unknown instead of any for rejection reason
  filename: string;
}

// --- Component ---
export default function NewListingPage() {
    const router = useRouter();

    // --- State ---
    const [user, setUser] = useState<User | null>(null);
    const [loadingUser, setLoadingUser] = useState(true);
    const [title, setTitle] = useState('');
    const [description, setDesc] = useState('');
    const [minPrice, setMinPrice] = useState('');
    const [upperCap, setUpperCap] = useState('');
    const [endTime, setEndTime] = useState('');
    const [rules, setRules] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // --- Effects ---
    useEffect(() => {
        const checkUser = async () => {
            const { data, error } = await supabase.auth.getUser();
            setLoadingUser(false);
            if (error || !data?.user) {
                router.push('/auth?redirect=/listings/new');
            } else {
                setUser(data.user);
            }
        }
        checkUser();
    }, [router]);

    useEffect(() => {
        const newObjectUrls = photos.map(file => URL.createObjectURL(file));
        setPhotoPreviews(newObjectUrls);
        return () => {
            newObjectUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [photos]);

    // --- Tag Management Callbacks ---
    const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { setTagInput(e.target.value); };
    const addTag = useCallback((tagToAdd: string) => {
        const cleanedTag = tagToAdd.trim().toLowerCase();
        if (cleanedTag && !selectedTags.includes(cleanedTag) && selectedTags.length < MAX_TAGS) {
            setSelectedTags((prevTags) => [...prevTags, cleanedTag]);
        }
        setTagInput('');
    }, [selectedTags]);
    const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } };
    const removeTag = (tagToRemove: string) => { setSelectedTags((prevTags) => prevTags.filter((tag) => tag !== tagToRemove)); };

    // --- Photo Management Callbacks ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSubmitMessage(null);
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            const imageFiles = filesArray.filter(file => file.type.startsWith('image/'));
            setPhotos(prevPhotos => {
                const combined = [...prevPhotos, ...imageFiles];
                if (combined.length > MAX_PHOTOS) {
                    setSubmitMessage({ type: 'error', text: `You can upload a maximum of ${MAX_PHOTOS} photos.` });
                    return combined.slice(0, MAX_PHOTOS);
                }
                return combined;
            });
             e.target.value = '';
        }
    };
    const handleRemovePhoto = (indexToRemove: number) => { setPhotos(prevPhotos => prevPhotos.filter((_, index) => index !== indexToRemove)); };

    // --- Form Submission Logic ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitMessage(null);

        // --- Validation ---
        if (!user) { setSubmitMessage({ type: 'error', text: 'Authentication error.' }); return; }
        if (photos.length === 0) { setSubmitMessage({ type: 'error', text: 'Please upload at least one photo.' }); return; }
        if (!title.trim() || !description.trim() || !minPrice || !endTime) { setSubmitMessage({ type: 'error', text: 'Please fill all required fields (*).' }); return; }
        const minPriceFloat = parseFloat(minPrice);
        const upperCapFloat = upperCap.trim() ? parseFloat(upperCap) : null;
        if (isNaN(minPriceFloat) || minPriceFloat < 0) { setSubmitMessage({ type: 'error', text: 'Minimum Bid must be a non-negative number.' }); return; }
        if (upperCapFloat !== null && (isNaN(upperCapFloat) || upperCapFloat <= minPriceFloat)) { setSubmitMessage({ type: 'error', text: 'Buy Now price must be a valid number greater than Minimum Bid.' }); return; }
        if (new Date(endTime) <= new Date()) { setSubmitMessage({ type: 'error', text: 'End Time must be in the future.' }); return; }
        // --- End Validation ---

        setIsSubmitting(true);
        const uploadErrors: string[] = [];

        // --- Step 1: Upload Photos ---
        console.log(`Starting upload for ${photos.length} photos...`);
        
        const uploadPromises: Promise<UploadResult>[] = photos.map((photoFile) => {
            const fileExt = photoFile.name.split('.').pop()?.toLowerCase() || 'file';
            const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
            const filePath = `${user.id}/${safeTitle}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

            return supabase.storage
                .from('listing-images')
                .upload(filePath, photoFile, { cacheControl: '3600', upsert: false })
                .then(({ error: uploadError }) => {
                    if (uploadError) {
                        throw new Error(`Upload failed: ${uploadError.message}`);
                    }
                    const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(filePath);
                    const publicUrl = urlData?.publicUrl;
                    if (!publicUrl) {
                        throw new Error(`GetPublicUrl failed.`);
                    }
                    return { status: 'fulfilled' as const, value: publicUrl, filename: photoFile.name };
                })
                .catch(error => {
                     console.error(`Error uploading ${photoFile.name}:`, error);
                     return { status: 'rejected' as const, reason: error, filename: photoFile.name }; // Pass raw error
                });
        });

        const results: UploadResult[] = await Promise.all(uploadPromises);

        const uploadedPhotoUrls: string[] = [];
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                uploadedPhotoUrls.push(result.value);
            } else if (result.status === 'rejected') {
                // CORRECTED: Type narrowing for reason
                let reasonText = 'Unknown upload error';
                if (result.reason instanceof Error) {
                    reasonText = result.reason.message;
                } else if (typeof result.reason === 'string') {
                    reasonText = result.reason;
                } else {
                    // Fallback if reason is not Error or string (should be rare with current catch)
                    reasonText = JSON.stringify(result.reason);
                }
                uploadErrors.push(`'${result.filename}': ${reasonText}`);
            }
        });

        if (uploadedPhotoUrls.length === 0 && photos.length > 0) { // Check if any photos were attempted
            console.error("All photo uploads failed.");
            setSubmitMessage({ type: 'error', text: `Photo upload failed. Errors: ${uploadErrors.join('; ')}` });
            setIsSubmitting(false);
            return;
        }
        if (uploadErrors.length > 0) {
            console.warn("Some photos failed to upload:", uploadErrors);
        }

        // --- Step 2: Insert Listing Data ---
        try {
            console.log("Inserting listing with photo URLs:", uploadedPhotoUrls);
            const listingData = {
                title: title.trim(), description: description.trim(),
                min_price: minPriceFloat, end_time: new Date(endTime).toISOString(),
                seller_id: user.id, photos: uploadedPhotoUrls,
                upper_cap: upperCapFloat, rules: rules.trim() || null,
                status: 'active', tags: selectedTags.length > 0 ? selectedTags : null,
            };

            const { error: insertError } = await supabase.from('listings').insert(listingData);
            if (insertError) throw insertError;

            let successMsg = 'Listing created successfully!';
            if (uploadErrors.length > 0) successMsg += ` (${uploadErrors.length} photo(s) failed to upload). Redirecting...`;
            else successMsg += ' Redirecting...';
            setSubmitMessage({ type: 'success', text: successMsg });

            setTitle(''); setDesc(''); setMinPrice(''); setUpperCap('');
            setEndTime(''); setRules(''); setPhotos([]); setPhotoPreviews([]);
            setSelectedTags([]); setTagInput('');
            const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';

            setTimeout(() => { router.push('/listings'); }, uploadErrors.length > 0 ? 3000 : 2000); // Longer delay if there were partial errors

        } catch (error) {
            console.error('Listing insertion failed:', error);
            let message = 'Database error during listing creation.';
             if (error instanceof Error) message = `DB Error: ${error.message}`;
             if (uploadErrors.length > 0) message += ` (${uploadErrors.length} photo(s) also failed upload).`;
            setSubmitMessage({ type: 'error', text: message });
            setIsSubmitting(false);
        }
    };

    // --- Render Guards ---
    if (loadingUser) return <div className="flex justify-center py-20"><LoadingSpinner message="Checking authentication..." /></div>;

    // --- JSX ---
    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">
                Create New Listing
            </h1>
            <form
                onSubmit={handleSubmit}
                noValidate
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md p-6 sm:p-8 space-y-6"
            >
                {/* Submission Feedback Area */}
                 {submitMessage && (
                    <div
                        className={`p-4 rounded-md border text-sm flex items-start gap-3 ${submitMessage.type === 'error' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-200' : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-600/50 text-green-800 dark:text-green-200'}`}
                        role="alert"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                            {submitMessage.type === 'error' ? ( <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-8.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /> ) : ( <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.84-8.41a.75.75 0 1 1-1.06-1.06L7.94 8.37 6.72 7.15a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l4.37-4.37Z" clipRule="evenodd" /> )}
                        </svg>
                         <span>{submitMessage.text}</span>
                    </div>
                )}

                 {/* --- Field: Title --- */}
                 <div>
                    <label htmlFor="title" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Listing Title <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                    <input id="title" type="text" placeholder="e.g., Slightly Used Noise Cancelling Headphones" value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" />
                </div>

                {/* --- Field: Description --- */}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Description <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                    <textarea id="description" placeholder="Describe the item, its condition, reason for selling, etc." value={description} onChange={e => setDesc(e.target.value)} required rows={4} className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" />
                </div>

                 {/* --- Row: Prices --- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                    <div>
                         <label htmlFor="minPrice" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                            Minimum Bid Price (₹) <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                        </label>
                        <div className="relative"><span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span><input id="minPrice" type="number" placeholder="e.g., 500" value={minPrice} onChange={e => setMinPrice(e.target.value)} required min="0" step="any" className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" /></div>
                    </div>
                    <div>
                        <label htmlFor="upperCap" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                            Buy Now Price (₹) <span className="text-gray-500 text-xs">(Optional)</span>
                        </label>
                        <div className="relative"><span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span><input id="upperCap" type="number" placeholder="Instant buy price (optional)" value={upperCap} onChange={e => setUpperCap(e.target.value)} min="0" step="any" className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" /></div>
                    </div>
                </div>

                {/* --- Field: Auction End Time --- */}
                <div>
                    <label htmlFor="endTime" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Auction End Time <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                    </label>
                    <input id="endTime" type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} required min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select the date and time when the auction should automatically end.</p>
                </div>

                 {/* --- Field: Auction Rules --- */}
                 <div>
                    <label htmlFor="rules" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Auction Rules <span className="text-gray-500 text-xs">(Optional)</span>
                    </label>
                    <textarea id="rules" placeholder="e.g., Pickup only from campus hostel X, Payment via UPI within 24 hours of winning." value={rules} onChange={e => setRules(e.target.value)} rows={3} className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500" />
                </div>

                {/* --- Field: Tags --- */}
                <div>
                     <label htmlFor="tag-input" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Tags <span className="text-gray-500 text-xs">(Optional, helps discovery, max {MAX_TAGS})</span>
                    </label>
                     <div className="flex flex-wrap gap-2 mb-2 min-h-[28px]">
                        {selectedTags.map(tag => ( <span key={tag} className="inline-flex items-center gap-x-1.5 rounded-full bg-blue-100 dark:bg-blue-800/60 px-2.5 py-1 text-xs font-medium text-blue-800 dark:text-blue-200 ring-1 ring-inset ring-blue-200 dark:ring-blue-700">{tag}<button type="button" onClick={() => removeTag(tag)} className="-mr-0.5 p-0.5 rounded-full inline-flex items-center justify-center text-blue-500 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`Remove ${tag}`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg></button></span> ))}
                    </div>
                    <input
                        id="tag-input" type="text"
                        placeholder={selectedTags.length < MAX_TAGS ? `Type a tag and press Enter (e.g., 'book')` : `Maximum ${MAX_TAGS} tags reached`}
                        value={tagInput} onChange={handleTagInputChange} onKeyDown={handleTagInputKeyDown}
                        disabled={selectedTags.length >= MAX_TAGS}
                        className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Or click to add common tags:</p>
                     <div className="flex flex-wrap gap-2 mt-1.5">
                         {PREDEFINED_TAGS.filter(t => !selectedTags.includes(t.toLowerCase())).slice(0, 15).map(tag => ( <button type="button" key={tag} onClick={() => addTag(tag)} disabled={selectedTags.length >= MAX_TAGS} className="px-2.5 py-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">{tag}</button> ))}
                     </div>
                </div>

                {/* --- Photo Upload Section --- */}
                <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        Upload Photos <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
                        <span className="text-gray-500 dark:text-gray-400 text-xs ml-2">(Up to {MAX_PHOTOS} images)</span>
                    </label>
                    <label htmlFor="photo-upload" className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 dark:focus-within:ring-offset-gray-800">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400"><path d="M1.5 2A1.5 1.5 0 0 1 3 0.5h10A1.5 1.5 0 0 1 14.5 2v12a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 14V2ZM3 2v12h10V2H3Z" /> <path d="M3.857 9.5a.5.5 0 0 1 .686-.01l1.6 1.76a.5.5 0 0 1-.01.686l-3.28 3.2a.5.5 0 0 1-.663-.026L2 13.74l-.01-.012a.5.5 0 0 1 .66-.72l1.087.98L5.46 12.1a.5.5 0 0 1 .698-.002Z" /> <path d="M12.5 6.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z" /></svg>
                        <span>{photos.length > 0 ? `Add More / Change Photos (${photos.length}/${MAX_PHOTOS})` : 'Choose Photos'}</span>
                        <input id="photo-upload" type="file" accept="image/png, image/jpeg, image/webp" multiple onChange={handleFileChange} required={photos.length === 0} className="sr-only" />
                    </label>
                    {photoPreviews.length > 0 && (
                        <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                            {photoPreviews.map((previewUrl, index) => (
                                <div key={previewUrl} className="relative group aspect-square">
                                    <Image src={previewUrl} alt={`Preview ${index + 1}`} fill sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 20vw" style={{ objectFit: 'cover' }} className="rounded-md border border-gray-200 dark:border-gray-600" />
                                    <button type="button" onClick={() => handleRemovePhoto(index)} className="absolute top-1 right-1 p-0.5 bg-red-600 text-white rounded-full opacity-75 group-hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1" aria-label={`Remove image ${index + 1}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">First image will be the cover photo. PNG, JPG, WEBP accepted.</p>
                </div>

                {/* --- Submit Button Area --- */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                     <button type="submit" disabled={isSubmitting || !user || loadingUser} className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200">
                        {isSubmitting ? ( <> <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Submitting... </> ) : ( 'Save Listing' )}
                     </button>
                </div>
            </form>
        </div>
    );
}