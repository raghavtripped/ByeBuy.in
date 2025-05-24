/* -------------------------------------------------------------------------- /
/  src/app/listings/new/page.tsx                                             /
/ -------------------------------------------------------------------------- */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';

/* ---------- Constants ---------------------------------------------------- */
const CATEGORIES_FOR_FORM = [
  'Electronics & Gadgets',
  'Furniture & Dorm Essentials',
  'Textbooks & Study Materials',
  'Apparel & Accessories',
  'Sports & Hobby Gear',
];
const MAX_PHOTOS = 5;

interface UploadResult {
  status: 'fulfilled' | 'rejected';
  value?: string;
  reason?: unknown;
  filename: string;
}

/* ---------- Component ---------------------------------------------------- */
export default function NewListingPage() {
  const router = useRouter();

  /* ---------- State ------------------------------------------------------ */
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
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /* ---------- Effects ---------------------------------------------------- */
  useEffect(() => {
    const checkUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      setLoadingUser(false);
      if (error || !data?.user) {
        router.push('/auth?redirect=/listings/new');
      } else {
        setUser(data.user);
      }
    };
    checkUser();
  }, [router]);

  useEffect(() => {
    const objectUrls = photos.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(objectUrls);
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  /* ---------- Handlers --------------------------------------------------- */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSubmitMessage(null);
    if (!e.target.files) return;
    const filesArr = Array.from(e.target.files);
    const imageFiles = filesArr.filter((f) => f.type.startsWith('image/'));

    setPhotos((prev) => {
      const combined = [...prev, ...imageFiles];
      if (combined.length > MAX_PHOTOS) {
        setSubmitMessage({ type: 'error', text: `You can upload a maximum of ${MAX_PHOTOS} photos.` });
        return combined.slice(0, MAX_PHOTOS);
      }
      return combined;
    });
    e.target.value = '';
  };

  const handleRemovePhoto = (idx: number) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const handleCategorySelect = (c: string) => setSelectedCategory(c);

  /* ---------- Submit ----------------------------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMessage(null);

    /* -- Validation ------------------------------------------------------- */
    if (!user) {
      setSubmitMessage({ type: 'error', text: 'Authentication error. Please log in again.' });
      return;
    }
    if (photos.length === 0) {
      setSubmitMessage({ type: 'error', text: 'Please upload at least one photo.' });
      return;
    }
    if (!title.trim() || !description.trim() || !minPrice || !endTime) {
      setSubmitMessage({ type: 'error', text: 'Please fill all required fields (*).' });
      return;
    }
    if (!selectedCategory) {
      setSubmitMessage({ type: 'error', text: 'Please select a category.' });
      return;
    }

    const minPriceFloat = parseFloat(minPrice);
    const upperCapFloat = upperCap.trim() ? parseFloat(upperCap) : null;
    if (isNaN(minPriceFloat) || minPriceFloat < 0) {
      setSubmitMessage({ type: 'error', text: 'Minimum Bid Price must be a valid non-negative number.' });
      return;
    }
    if (upperCapFloat !== null) {
      if (isNaN(upperCapFloat)) {
        setSubmitMessage({ type: 'error', text: 'Buy Now price must be valid.' });
        return;
      }
      if (upperCapFloat <= minPriceFloat) {
        setSubmitMessage({ type: 'error', text: 'Buy Now price must exceed the Minimum Bid Price.' });
        return;
      }
    }
    if (new Date(endTime) <= new Date()) {
      setSubmitMessage({ type: 'error', text: 'Auction End Time must be set to a future date/time.' });
      return;
    }
    /* -- End validation --------------------------------------------------- */

    setIsSubmitting(true);

    const uploadErrors: string[] = [];
    const uploadedPhotoUrls: string[] = [];

    /* -- Step 1: Upload photos ------------------------------------------- */
    if (photos.length) {
      const uploadPromises: Promise<UploadResult>[] = photos.map((photo) => {
        const ext = photo.name.split('.').pop()?.toLowerCase() || 'file';
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const path = `${user.id}/${safeTitle}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

        return supabase.storage
          .from('listing-images')
          .upload(path, photo, { cacheControl: '3600', upsert: false })
          .then(({ error }) => {
            if (error) throw new Error(`Upload failed: ${error.message}`);
            const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(path);
            if (!urlData?.publicUrl) throw new Error(`getPublicUrl failed for ${path}`);
            return { status: 'fulfilled' as const, value: urlData.publicUrl, filename: photo.name };
          })
          .catch((reason) => ({ status: 'rejected' as const, reason, filename: photo.name }));
      });

      const results = (await Promise.all(uploadPromises)) as UploadResult[];
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) uploadedPhotoUrls.push(r.value);
        if (r.status === 'rejected') {
          const msg =
            r.reason instanceof Error ? r.reason.message : typeof r.reason === 'string' ? r.reason : JSON.stringify(r.reason);
          uploadErrors.push(`'${r.filename}': ${msg}`);
        }
      });

      if (uploadedPhotoUrls.length === 0) {
        setSubmitMessage({ type: 'error', text: `Photo upload failed. Errors: ${uploadErrors.join('; ')}` });
        setIsSubmitting(false);
        return;
      }
    }
    /* -- End photo upload ------------------------------------------------- */

    /* -- Step 2: Insert listing ------------------------------------------ */
    try {
      const { error: insertError } = await supabase.from('listings').insert({
        title: title.trim(),
        description: description.trim(),
        min_price: minPriceFloat,
        end_time: new Date(endTime).toISOString(),
        seller_id: user.id,
        photos: uploadedPhotoUrls.length ? uploadedPhotoUrls : null, // <-- use photos
        upper_cap: upperCapFloat,
        rules: rules.trim() || null,
        status: 'active',
        tags: selectedCategory ? [selectedCategory] : null, // <-- use tags
      });
      if (insertError) throw insertError;

      let success = 'Listing created successfully!';
      if (uploadErrors.length) success += ` (${uploadErrors.length} photo(s) failed).`;
      setSubmitMessage({ type: 'success', text: success + ' Redirecting…' });

      // reset form
      setTitle('');
      setDesc('');
      setMinPrice('');
      setUpperCap('');
      setEndTime('');
      setRules('');
      setPhotos([]);
      setPhotoPreviews([]);
      setSelectedCategory('');
      const input = document.getElementById('photo-upload') as HTMLInputElement | null;
      if (input) input.value = '';

      setTimeout(() => router.push('/listings'), uploadErrors.length ? 3000 : 2000);
    } catch (err) {
      console.error('Listing insertion failed:', err);
      let msg = 'Database error.';
      if (err instanceof Error) msg = `DB Error: ${err.message}`;
      if (uploadErrors.length) msg += ' (Some photos also failed upload).';
      setSubmitMessage({ type: 'error', text: msg });
      setIsSubmitting(false);
    }
  };

  /* ---------- Guard ------------------------------------------------------ */
  if (loadingUser)
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message="Checking authentication..." />
      </div>
    );

  /* ---------- JSX -------------------------------------------------------- */
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">Create New Listing</h1>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-lg shadow-md p-6 sm:p-8 space-y-6"
      >
        {/* ---------- Submission feedback ---------- */}
        {submitMessage && (
          <div
            role="alert"
            className={`p-4 rounded-md border text-sm flex gap-3 ${
              submitMessage.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/25 border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-300'
                : 'bg-green-50 dark:bg-green-900/25 border-green-200 dark:border-green-600/50 text-green-800 dark:text-green-300'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
              {submitMessage.type === 'error' ? (
                <path
                  fillRule="evenodd"
                  d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-8.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 6.25ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.84-8.41a.75.75 0 1 1-1.06-1.06L7.94 8.37 6.72 7.15a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l4.37-4.37Z"
                  clipRule="evenodd"
                />
              )}
            </svg>
            <span>{submitMessage.text}</span>
          </div>
        )}

        {/* ---------- Title ------------------------------------------------ */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Listing Title <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Slightly Used Noise Cancelling Headphones"
            required
            maxLength={100}
            className="w-full px-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
          />
        </div>

        {/* ---------- Description ----------------------------------------- */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Description <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe the item, its condition, reason for selling, etc."
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
          />
        </div>

        {/* ---------- Price row ------------------------------------------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
          {/* Min price */}
          <div>
            <label htmlFor="minPrice" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
              Minimum Bid Price (₹) <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-bye-dark-text-secondary pointer-events-none">₹</span>
              <input
                id="minPrice"
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                min="0"
                step="any"
                placeholder="e.g., 500"
                required
                className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
              />
            </div>
          </div>

          {/* Upper cap */}
          <div>
            <label htmlFor="upperCap" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
              Buy Now Price (₹) <span className="text-gray-500 text-xs">(Optional)</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-bye-dark-text-secondary pointer-events-none">₹</span>
              <input
                id="upperCap"
                type="number"
                value={upperCap}
                onChange={(e) => setUpperCap(e.target.value)}
                min="0"
                step="any"
                placeholder="Instant buy price (optional)"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
              />
            </div>
          </div>
        </div>

        {/* ---------- End time -------------------------------------------- */}
        <div>
          <label htmlFor="endTime" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Auction End Time <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
          </label>
          <input
            id="endTime"
            type="datetime-local"
            required
            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-bye-dark-text-secondary">Select date & time when the auction should automatically end.</p>
        </div>

        {/* ---------- Rules ---------------------------------------------- */}
        <div>
          <label htmlFor="rules" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Auction Rules <span className="text-gray-500 text-xs">(Optional)</span>
          </label>
          <textarea
            id="rules"
            rows={3}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="e.g., Pickup only from campus hostel X, payment via UPI within 24 hours of winning."
            className="w-full px-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
          />
        </div>

        {/* ---------- Category pills ------------------------------------- */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-bye-dark-text-primary">
            Category <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
          </label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {CATEGORIES_FOR_FORM.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleCategorySelect(cat)}
                className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-full border transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md dark:bg-indigo-500 dark:border-indigo-500'
                    : 'bg-white dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-primary border-gray-300 dark:border-bye-dark-border-primary hover:bg-gray-100 dark:hover:bg-opacity-75'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ---------- Photo upload --------------------------------------- */}
        <div>
          <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Upload Photos <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
            <span className="text-gray-500 dark:text-bye-dark-text-secondary text-xs ml-2">(Up to {MAX_PHOTOS} images)</span>
          </label>

          <label
            htmlFor="photo-upload"
            className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary bg-white dark:bg-bye-dark-bg-hover hover:bg-gray-50 dark:hover:bg-opacity-75 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500 dark:focus-within:ring-indigo-400 dark:focus-within:ring-offset-bye-dark-bg-secondary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2 text-gray-500 dark:text-bye-dark-text-secondary">
              <path d="M1.5 2A1.5 1.5 0 0 1 3 .5h10A1.5 1.5 0 0 1 14.5 2v12a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 14V2ZM3 2v12h10V2H3Z" />
              <path d="M3.857 9.5a.5.5 0 0 1 .686-.01l1.6 1.76a.5.5 0 0 1-.01.686l-3.28 3.2a.5.5 0 0 1-.663-.026L2 13.74l-.01-.012a.5.5 0 0 1 .66-.72l1.087.98L5.46 12.1a.5.5 0 0 1 .698-.002Z" />
              <path d="M12.5 6.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z" />
            </svg>
            <span>{photos.length ? `Add More / Change Photos (${photos.length}/${MAX_PHOTOS})` : 'Choose Photos'}</span>
            <input
              id="photo-upload"
              type="file"
              accept="image/png, image/jpeg, image/webp"
              multiple
              required={!photos.length}
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          {photoPreviews.length > 0 && (
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {photoPreviews.map((url, idx) => (
                <div key={url} className="relative group aspect-square">
                  <Image
                    src={url}
                    alt={`Preview ${idx + 1}`}
                    fill
                    sizes="(max-width:640px) 33vw,(max-width:768px) 25vw,20vw"
                    style={{ objectFit: 'cover' }}
                    className="rounded-md border border-gray-200 dark:border-bye-dark-border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(idx)}
                    className="absolute top-1 right-1 p-0.5 bg-red-600 text-white rounded-full opacity-75 group-hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-offset-bye-dark-bg-secondary"
                    aria-label={`Remove image ${idx + 1}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-bye-dark-text-secondary">First image will be the cover photo. PNG, JPG, WEBP accepted.</p>
        </div>

        {/* ---------- Submit ---------------------------------------------- */}
        <div className="pt-4 border-t border-gray-200 dark:border-bye-dark-border-primary">
          <button
            type="submit"
            disabled={isSubmitting || !user || loadingUser}
            className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
