// src/app/listings/[id]/edit/page.tsx
'use client';

import { useEffect, useState, FormEvent, ChangeEvent, DragEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import Image from 'next/image';

const LoadingSpinner = ({ message }: { message: string }) => (
  <div className="text-center py-10">{message}...</div>
);

const showNotification = (type: 'success' | 'error', message: string) => {
  if (typeof window !== 'undefined') {
    alert(`${type === 'success' ? 'Success' : 'Error'}: ${message}`);
  }
  console.log(`Notification (${type}): ${message}`);
};

interface Listing {
  id: string;
  title: string;
  description: string | null;
  min_price: number;
  upper_cap: number | null;
  end_time: string;
  seller_id: string;
  photos: string[] | null;
  tags: string[] | null;
  rules: string | null;
  status: 'active' | 'closed' | 'cancelled';
}

type DisplayPhoto = {
  id: string;
  url: string;
  isNew: boolean;
  file?: File;
};

const CATEGORIES_FOR_FORM = [
  'Electronics & Gadgets',
  'Furniture & Dorm Essentials',
  'Textbooks & Study Materials',
  'Apparel & Accessories',
  'Sports & Hobby Gear',
  'Other',
];

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const listingId = params.id as string;

  const [listing, setListing] = useState<Listing | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [hasBids, setHasBids] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<
    | {
        type: 'success' | 'error';
        text: string;
      }
    | null
  >(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [upperCap, setUpperCap] = useState('');
  const [rules, setRules] = useState('');

  const MAX_PHOTOS = 5;
  const [displayPhotos, setDisplayPhotos] = useState<DisplayPhoto[]>([]);
  const [photosToDeleteFromStorage, setPhotosToDeleteFromStorage] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  /* -------------------------------------------------------------------- */
  /*  AUTH & LISTING LOAD                                                  */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!listingId || !currentUser) return;

    const fetchListingDetails = async () => {
      setLoadingPage(true);
      setPageError(null);
      try {
        const { data: listingData, error: listingError } = await supabase
          .from('listings')
          .select('*, photos, tags')
          .eq('id', listingId)
          .single();

        if (listingError) throw new Error(listingError.message || 'F.L.D.');
        if (!listingData) throw new Error('L.N.F.');
        if (currentUser.id !== listingData.seller_id) throw new Error('N.A.E.');
        if (listingData.status !== 'active') throw new Error(`L.S.N.A: ${listingData.status}`);

        const processedListingData: Listing = {
          ...listingData,
          photos: listingData.photos || [],
          tags: listingData.tags || [],
        };
        setListing(processedListingData);

        const { count: bidCount, error: bidError } = await supabase
          .from('bids')
          .select('id', { count: 'exact', head: true })
          .eq('item_id', listingId);
        if (bidError) console.error('Failed to fetch bid count:', bidError.message);
        setHasBids(bidCount !== null && bidCount > 0);
      } catch (err: unknown) {
        let specificError = 'An unexpected error occurred while loading the listing.';
        if (err instanceof Error) {
          if (err.message === 'F.L.D.') specificError = 'Failed to fetch listing details.';
          else if (err.message === 'L.N.F.') specificError = 'Listing not found.';
          else if (err.message === 'N.A.E.') specificError = 'You are not authorized to edit this listing.';
          else if (err.message.startsWith('L.S.N.A:'))
            specificError = `This listing is ${err.message.split(': ')[1]} and cannot be edited.`;
          else specificError = err.message;
        } else {
          specificError = String(err);
        }
        setPageError(specificError);
        setListing(null);
      } finally {
        setLoadingPage(false);
      }
    };

    fetchListingDetails();
  }, [listingId, currentUser]);

  /* -------------------------------------------------------------------- */
  /*  PREFILL FORM WHEN LISTING LOADED                                     */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    if (listing) {
      setTitle(listing.title || '');
      setDescription(listing.description || '');
      setMinPrice(listing.min_price?.toString() || '');
      setUpperCap(listing.upper_cap?.toString() || '');
      setRules(listing.rules || '');

      const initialPhotosFromDB: string[] = listing.photos || [];
      setDisplayPhotos(initialPhotosFromDB.map((url) => ({ id: url, url, isNew: false })));
      setPhotosToDeleteFromStorage([]);

      const initialTagsArray: string[] = listing.tags || [];
      setSelectedCategory(initialTagsArray.length > 0 ? initialTagsArray[0] : '');

      setSubmitMessage(null);
    }
  }, [listing]);

  /* -------------------------------------------------------------------- */
  /*  HELPERS                                                              */
  /* -------------------------------------------------------------------- */
  const validatePricesForSubmit = (): boolean => {
    let isValid = true;
    const messages: string[] = [];

    if (!hasBids) {
      const minPriceNum = parseFloat(minPrice);
      if (!minPrice.trim()) {
        messages.push('Minimum Bid Price is required.');
        isValid = false;
      } else if (isNaN(minPriceNum) || minPriceNum < 0) {
        messages.push('Minimum Bid Price must be a valid non-negative number.');
        isValid = false;
      }

      if (upperCap.trim()) {
        const upperCapNum = parseFloat(upperCap);
        const minNumForCompare = parseFloat(minPrice);
        if (isNaN(upperCapNum)) {
          messages.push('Buy Now Price must be a valid number if provided.');
          isValid = false;
        } else if (!isNaN(minNumForCompare) && upperCapNum <= minNumForCompare) {
          messages.push('Buy Now Price must be greater than Minimum Bid Price.');
          isValid = false;
        }
      }
    }

    if (!isValid) {
      setSubmitMessage({ type: 'error', text: messages.join(' ') });
    }
    return isValid;
  };

  const getStoragePathFromUrl = (url: string): string | null => {
    try {
      const urlParts = new URL(url);
      const pathSegments = urlParts.pathname.split('/');
      const objectPathIndex = pathSegments.findIndex((segment) => segment === 'object');
      if (objectPathIndex !== -1 && pathSegments.length > objectPathIndex + 3) {
        return pathSegments.slice(objectPathIndex + 3).join('/');
      }
      console.warn('Could not determine storage path from URL:', url);
      return null;
    } catch (error) {
      console.error('Error parsing URL for storage path:', error, url);
      return null;
    }
  };

  const currentEffectivePhotoCount = displayPhotos.filter((dp) => {
    if (dp.isNew) return true;
    return !photosToDeleteFromStorage.includes(dp.url);
  }).length;

  /* -------------------------------------------------------------------- */
  /*  PHOTO HANDLERS                                                       */
  /* -------------------------------------------------------------------- */
  const processAndStageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const filesArray = Array.from(files);
    const availableSlots = MAX_PHOTOS - currentEffectivePhotoCount;

    if (filesArray.length > availableSlots) {
      showNotification(
        'error',
        `You can only upload ${MAX_PHOTOS} photos. You can add ${availableSlots > 0 ? availableSlots : 0} more.`
      );
      filesArray.splice(availableSlots);
      if (filesArray.length === 0) return;
    }

    const newDisplayPhotosToAdd: DisplayPhoto[] = filesArray.map((file) => ({
      id: `preview_${file.name}_${Date.now()}_${Math.random()}`,
      url: URL.createObjectURL(file),
      isNew: true,
      file,
    }));
    setDisplayPhotos((prev) => [...prev, ...newDisplayPhotosToAdd]);
  };

  const handlePhotoInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    processAndStageFiles(e.target.files);
    e.target.value = '';
  };

  const handleDeletePhoto = (photoIdToDelete: string) => {
    const photoToDeleteObj = displayPhotos.find((p) => p.id === photoIdToDelete);
    if (!photoToDeleteObj) return;

    if (photoToDeleteObj.isNew && photoToDeleteObj.url.startsWith('blob:')) {
      URL.revokeObjectURL(photoToDeleteObj.url);
    } else if (!photoToDeleteObj.isNew) {
      if (!photosToDeleteFromStorage.includes(photoToDeleteObj.url)) {
        setPhotosToDeleteFromStorage((prev) => [...prev, photoToDeleteObj.url]);
      }
    }

    setDisplayPhotos((prev) => prev.filter((p) => p.id !== photoIdToDelete));
  };

  const handleSetAsPrimary = (photoIdToMakePrimary: string) => {
    setDisplayPhotos((prevPhotos) => {
      const itemIndex = prevPhotos.findIndex((p) => p.id === photoIdToMakePrimary);
      if (itemIndex === -1 || itemIndex === 0) return prevPhotos;
      const item = prevPhotos[itemIndex];
      const rest = prevPhotos.filter((_, i) => i !== itemIndex);
      return [item, ...rest];
    });
  };

  useEffect(() => {
    return () => {
      displayPhotos.forEach((dp) => {
        if (dp.isNew && dp.url.startsWith('blob:')) {
          URL.revokeObjectURL(dp.url);
        }
      });
    };
  }, [displayPhotos]);

  /* -------------------------------------------------------------------- */
  /*  DRAG & DROP                                                          */
  /* -------------------------------------------------------------------- */
  const handleDragOver = (e: DragEvent<HTMLLabelElement | HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLLabelElement | HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };
  const handleDrop = (e: DragEvent<HTMLLabelElement | HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processAndStageFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  /* -------------------------------------------------------------------- */
  /*  CATEGORY                                                             */
  /* -------------------------------------------------------------------- */
  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSubmitMessage(null);
  };

  /* -------------------------------------------------------------------- */
  /*  SUBMIT                                                               */
  /* -------------------------------------------------------------------- */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitMessage(null);

    const finalPhotoOrderForCheck = displayPhotos.filter((p) => !(!p.isNew && photosToDeleteFromStorage.includes(p.url)));
    if (finalPhotoOrderForCheck.length === 0) {
      setSubmitMessage({ type: 'error', text: 'Please upload at least one photo.' });
      return;
    }
    if (!title.trim()) {
      setSubmitMessage({ type: 'error', text: 'Title is required.' });
      return;
    }
    if (!description.trim()) {
      setSubmitMessage({ type: 'error', text: 'Description is required.' });
      return;
    }
    if (!selectedCategory) {
      setSubmitMessage({ type: 'error', text: 'Please select a category.' });
      return;
    }
    if (!validatePricesForSubmit()) return;

    const confirmed = window.confirm('Save changes to this listing?');
    if (!confirmed) return;
    setIsSubmitting(true);

    try {
      /* -- delete removed photos -- */
      if (photosToDeleteFromStorage.length > 0) {
        const pathsToDelete = photosToDeleteFromStorage
          .map(getStoragePathFromUrl)
          .filter((path): path is string => path !== null);
        if (pathsToDelete.length > 0) {
          const { error: deleteError } = await supabase.storage.from('listing-images').remove(pathsToDelete);
          if (deleteError) throw new Error('Failed to remove some old photos. Please check your listing and try again.');
        }
      }

      /* -- upload new photos -- */
      const uploadedPhotoUrls: { originalId: string; newUrl: string }[] = [];
      for (const displayPhoto of displayPhotos) {
        if (displayPhoto.isNew && displayPhoto.file) {
          const file = displayPhoto.file;
          const fileName = `${currentUser!.id}/${listingId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
          const { data: uploadData, error: uploadError } = await supabase.storage.from('listing-images').upload(fileName, file);
          if (uploadError) throw new Error(`Failed to upload new photo: ${file.name}.`);
          if (uploadData) {
            const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(uploadData.path);
            uploadedPhotoUrls.push({ originalId: displayPhoto.id, newUrl: urlData.publicUrl });
          }
        }
      }

      /* -- compose final photo array in order -- */
      const finalDatabasePhotoUrls = displayPhotos
        .map((dp) => {
          if (dp.isNew) {
            const uploaded = uploadedPhotoUrls.find((up) => up.originalId === dp.id);
            return uploaded ? uploaded.newUrl : '';
          }
          return dp.url;
        })
        .filter((url) => url && !photosToDeleteFromStorage.includes(url));

      /* -- build update payload -- */
      const updatePayload: {
        title: string;
        description: string;
        rules: string | null;
        photos: string[] | null;
        tags: string[] | null;
        min_price?: number;
        upper_cap?: number | null;
      } = {
        title: title.trim(),
        description: description.trim(),
        rules: rules.trim() || null,
        photos: finalDatabasePhotoUrls.length > 0 ? finalDatabasePhotoUrls : null,
        tags: selectedCategory ? [selectedCategory] : null,
      };

      if (!hasBids) {
        const parsedMinPrice = parseFloat(minPrice);
        updatePayload.min_price = parsedMinPrice;
        if (upperCap.trim()) {
          const parsedUpperCap = parseFloat(upperCap);
          updatePayload.upper_cap = parsedUpperCap;
        } else {
          updatePayload.upper_cap = null;
        }
      }

      /* -- update row -- */
      const { error: updateError } = await supabase
        .from('listings')
        .update(updatePayload)
        .eq('id', listingId)
        .eq('seller_id', currentUser!.id);
      if (updateError) throw new Error(`Failed to save listing changes to the database. ${updateError.message}`);

      showNotification('success', 'Listing updated successfully!');
      router.push(`/listings/${listingId}`);
    } catch (err: unknown) {
      let message = 'Failed to save changes. Please try again.';
      if (err instanceof Error) message = err.message;
      else if (typeof err === 'string') message = err;
      setSubmitMessage({ type: 'error', text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* -------------------------------------------------------------------- */
  /*  RENDER GUARDS                                                        */
  /* -------------------------------------------------------------------- */
  if (loadingPage)
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message="Loading listing data" />
      </div>
    );

  if (pageError) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 text-center">
        <div className="bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-300 p-4 rounded-md inline-block">
          <p className="font-semibold">Error Loading Page</p>
          <p className="text-sm mt-1">{pageError}</p>
        </div>

        <button
          onClick={() => router.push('/my-listings')}
          className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-indigo-400 dark:focus:ring-offset-red-900/25"
        >
          Back to My Listings
        </button>
      </div>
    );
  }

  if (!listing)
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 text-center text-gray-600 dark:text-bye-dark-text-secondary">
        Listing data could not be loaded.
      </div>
    );

  /* -------------------------------------------------------------------- */
  /*  JSX                                                                  */
  /* -------------------------------------------------------------------- */
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
        Edit Listing: <span className="font-medium text-indigo-600 dark:text-indigo-400">{listing.title}</span>
      </h1>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-lg shadow-md p-6 sm:p-8 space-y-6"
      >
        {/* Alert */}
        {submitMessage && (
          <div
            role="alert"
            className={`p-4 rounded-md border text-sm flex items-start gap-3 ${
              submitMessage.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/25 border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-300'
                : 'bg-green-50 dark:bg-green-900/25 border-green-200 dark:border-green-600/50 text-green-800 dark:text-green-300'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-5 h-5 flex-shrink-0 mt-0.5"
            >
              {submitMessage.type === 'error' ? (
                <path
                  fillRule="evenodd"
                  d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-8.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
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

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Listing Title <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={100}
            className="w-full border border-gray-300 dark:border-bye-dark-border-primary px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 text-sm dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Description <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            className="w-full border border-gray-300 dark:border-bye-dark-border-primary px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 text-sm dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
          />
        </div>

        {/* Prices */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
          <div>
            <label htmlFor="minPrice" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
              Minimum Bid Price (₹){' '}
              {!hasBids && <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-bye-dark-text-secondary pointer-events-none">₹</span>
              <input
                id="minPrice"
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                required={!hasBids}
                disabled={hasBids}
                min="0"
                step="any"
                className={`w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 text-sm dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary ${
                  hasBids ? 'disabled:opacity-60 disabled:cursor-not-allowed' : ''
                }`}
              />
            </div>
            {hasBids && (
              <p className="mt-1 text-xs text-gray-500 dark:text-bye-dark-text-secondary">Price cannot be changed after bids are placed.</p>
            )}
          </div>

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
                disabled={hasBids}
                min="0"
                step="any"
                className={`w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-bye-dark-border-primary rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 text-sm dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary ${
                  hasBids ? 'disabled:opacity-60 disabled:cursor-not-allowed' : ''
                }`}
              />
            </div>
            {hasBids && (
              <p className="mt-1 text-xs text-gray-500 dark:text-bye-dark-text-secondary">Price cannot be changed after bids are placed.</p>
            )}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-bye-dark-text-primary">
            Category <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
          </label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {CATEGORIES_FOR_FORM.map((category) => (
              <button
                type="button"
                key={category}
                onClick={() => handleCategorySelect(category)}
                className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-full border transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary ${
                  selectedCategory === category
                    ? 'bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-600 dark:border-indigo-500 ring-indigo-500 shadow-md'
                    : 'bg-white dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-primary border-gray-300 dark:border-bye-dark-border-primary hover:bg-gray-100 dark:hover:bg-opacity-75 dark:hover:bg-bye-dark-bg-hover ring-indigo-500'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div>
          <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Photos <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>
            <span className="text-gray-500 dark:text-bye-dark-text-secondary text-xs ml-2">({currentEffectivePhotoCount} / {MAX_PHOTOS} images)</span>
          </label>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`mt-1 p-4 border-2 border-dashed rounded-md transition-colors ${
              isDraggingOver ? 'border-indigo-500 bg-indigo-50 dark:bg-bye-dark-bg-hover' : 'border-gray-300 dark:border-bye-dark-border-primary hover:border-gray-400 dark:hover:border-bye-dark-text-secondary'
            }`}
          >
            {/* preview grid */}
            {displayPhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-4">
                {displayPhotos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className={`relative group aspect-square rounded-md overflow-hidden border dark:border-bye-dark-border-primary ${
                      !photo.isNew && photosToDeleteFromStorage.includes(photo.url) ? 'opacity-40' : ''
                    }`}
                  >
                    <Image src={photo.url} alt={`Photo ${index + 1}`} fill sizes="(max-width: 640px) 33vw, 20vw" className="object-cover" />

                    {/* primary/delete actions */}
                    {!(!photo.isNew && photosToDeleteFromStorage.includes(photo.url)) && (
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex flex-col items-center justify-center p-1 space-y-1 opacity-0 group-hover:opacity-100">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleSetAsPrimary(photo.id)}
                            className="text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                            title="Set as primary"
                          >
                            Set Primary
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 bg-red-500 text-white rounded hover:bg-red-600"
                          title="Delete photo"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {/* marked for deletion overlay */}
                    {!photo.isNew && photosToDeleteFromStorage.includes(photo.url) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60">
                        <p className="text-white text-[10px] sm:text-xs font-semibold text-center px-1">Marked for Deletion</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* drag/drop label */}
            {currentEffectivePhotoCount < MAX_PHOTOS && (
              <label htmlFor="photo-upload-edit" className="cursor-pointer flex flex-col items-center justify-center w-full py-6 text-center">
                <svg className="w-10 h-10 mb-3 text-gray-400 dark:text-bye-dark-text-secondary" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" />
                </svg>
                <p className="text-sm text-gray-600 dark:text-bye-dark-text-primary">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">
                  PNG, JPG, WEBP (Max {MAX_PHOTOS - currentEffectivePhotoCount > 0 ? MAX_PHOTOS - currentEffectivePhotoCount : 0} more)
                </p>
                <input
                  id="photo-upload-edit"
                  type="file"
                  multiple
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handlePhotoInputChange}
                  className="hidden"
                />
              </label>
            )}

            {currentEffectivePhotoCount === 0 && displayPhotos.length === 0 && (
              <p className="text-center text-sm text-red-600 dark:text-red-400 mt-2">At least one photo is required.</p>
            )}
          </div>

          <p className="mt-1.5 text-xs text-gray-500 dark:text-bye-dark-text-secondary">First image shown will be the cover photo. You can reorder by setting a new primary.</p>
        </div>

        {/* Auction Rules */}
        <div>
          <label htmlFor="rules" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-bye-dark-text-primary">
            Auction Rules <span className="text-gray-500 text-xs">(Optional)</span>
          </label>
          <textarea
            id="rules"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 dark:border-bye-dark-border-primary px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 text-sm dark:bg-bye-dark-bg-hover dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
          />
        </div>

        {/* Buttons */}
        <div className="pt-5 border-t border-gray-200 dark:border-bye-dark-border-primary">
          <button
            type="submit"
            disabled={isSubmitting || loadingPage || currentEffectivePhotoCount === 0}
            className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving Changes...
              </>
            ) : (
              'Save Changes'
            )}
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="ml-0 mt-3 sm:mt-0 sm:ml-3 w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-gray-300 dark:border-bye-dark-border-primary text-base font-medium rounded-md shadow-sm text-gray-700 dark:text-bye-dark-text-primary bg-white dark:bg-bye-dark-bg-hover hover:bg-gray-50 dark:hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary disabled:opacity-60 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
