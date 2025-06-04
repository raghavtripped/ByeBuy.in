// src/app/listings/new/page.tsx
'use client';

import { useState, useEffect } from 'react'; // Removed FormEvent, ChangeEvent
import { Camera, X, Plus, Clock, Tag, DollarSign, FileText, Image as ImageIcon, Check, AlertCircle, Info } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import InfoPopover from '@/components/InfoPopover';

// Types
interface ValidationErrors {
  title?: string;
  description?: string;
  endTime?: string;
  minPrice?: string;
  upperCap?: string;
  photos?: string;
  category?: string;
}

interface SubmitMessage {
  type: 'success' | 'error';
  text: string;
}

// Supabase specific error interface (optional, for more detailed error handling)
interface SupabaseError extends Error {
  details?: string;
  hint?: string;
  code?: string;
}

const LoadingSpinner = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mb-3"></div>
    <p className="text-sm text-gray-600 dark:text-bye-dark-text-secondary">{message}</p>
  </div>
);

const CATEGORIES_FOR_FORM = [
  'Electronics & Gadgets',
  'Furniture & Dorm Essentials',
  'Textbooks & Study Materials',
  'Apparel & Accessories',
  'Sports & Hobby Gear',
] as const;

const MAX_PHOTOS = 5;

export default function ModernListingPage() {
  const router = useRouter();
  const { showNotification } = useNotifications();
  const { user: currentUser, loading: loadingUser } = useAuth();
  
  const [currentStep, setCurrentStep] = useState(0);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [upperCap, setUpperCap] = useState('');
  const [endTime, setEndTime] = useState('');
  const [rules, setRules] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<SubmitMessage | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const steps = [
    { id: 0, title: 'Basic Info', icon: FileText },
    { id: 1, title: 'Pricing', icon: DollarSign },
    { id: 2, title: 'Photos', icon: Camera },
    { id: 3, title: 'Category & Rules', icon: Tag },
  ];

  useEffect(() => {
    const objectUrls = photos.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(objectUrls);
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos]);

  const validateStep = (stepIndex: number): boolean => {
    const errors: ValidationErrors = {};
    
    switch (stepIndex) {
      case 0: // Basic Info
        if (!title.trim()) errors.title = 'Title is required.';
        if (title.trim().length > 100) errors.title = 'Title cannot exceed 100 characters.';
        if (!description.trim()) errors.description = 'Description is required.';
        if (!endTime) errors.endTime = 'End time is required.';
        else {
          const selectedDate = new Date(endTime);
          const now = new Date();
          const minEndDate = new Date(now.getTime() + 60 * 60 * 1000); 
          const maxEndDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); 

          if (selectedDate <= minEndDate) errors.endTime = 'End time must be at least 1 hour in the future.';
          if (selectedDate > maxEndDate) errors.endTime = `End time cannot be more than 90 days in the future.`;
        }
        break;
      case 1: // Pricing
        if (!minPrice) errors.minPrice = 'Minimum price is required.';
        else if (isNaN(parseFloat(minPrice)) || parseFloat(minPrice) <= 0) 
          errors.minPrice = 'Must be a valid positive number.';
        if (upperCap && (isNaN(parseFloat(upperCap)) || parseFloat(upperCap) <= parseFloat(minPrice))) 
          errors.upperCap = 'Buy now price must be higher than minimum bid price.';
        break;
      case 2: // Photos
        if (photos.length === 0) errors.photos = 'At least one photo is required.';
        break;
      case 3: // Category & Rules
        if (!selectedCategory) errors.category = 'Please select a category.';
        break;
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setValidationErrors({}); 
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
    setValidationErrors({}); 
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArr = Array.from(e.target.files);
    const imageFiles = filesArr.filter((f) => f.type.startsWith('image/'));

    if (imageFiles.length === 0 && filesArr.length > 0) {
        showNotification({ message: 'Only image files (PNG, JPG, WEBP) are accepted.', type: 'error' });
        return;
    }
    if (photos.length + imageFiles.length > MAX_PHOTOS) {
        showNotification({ message: `You can upload a maximum of ${MAX_PHOTOS} photos.`, type: 'error' });
    }

    setPhotos(prev => {
      const combined = [...prev, ...imageFiles];
      return combined.slice(0, MAX_PHOTOS);
    });
    e.target.value = '';
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setPhotos(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async () => {
    for (let i = 0; i < steps.length; i++) {
        if (!validateStep(i)) {
            setCurrentStep(i);
            showNotification({ message: 'Please correct the errors on this step before submitting.', type: 'error' });
            return;
        }
    }
    if (!currentUser) {
      showNotification({ message: 'Authentication error. Please log in again.', type: 'error' });
      router.push('/auth?redirect=/listings/new');
      return;
    }
    if (photos.length === 0) {
        setCurrentStep(2); 
        showNotification({ message: 'Please upload at least one photo.', type: 'error'});
        setValidationErrors(prev => ({...prev, photos: 'At least one photo is required'}));
        return;
    }
    
    setIsSubmitting(true);
    setSubmitMessage(null);

    const uploadedPhotoUrls: string[] = [];
    const uploadErrors: string[] = [];

    if (photos.length > 0) {
      const uploadPromises = photos.map((photoFile) => {
        const fileExt = photoFile.name.split('.').pop()?.toLowerCase() || 'file';
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const safeTitlePrefix = title.trim().replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20) || 'listing';
        const filePath = `${currentUser.id}/${safeTitlePrefix}_${Date.now()}_${randomSuffix}.${fileExt}`;

        return supabase.storage
          .from('listing-images')
          .upload(filePath, photoFile, { cacheControl: '3600', upsert: false })
          .then(({ data: uploadData, error: uploadError }) => {
            if (uploadError) {
              console.error('Supabase storage upload error:', uploadError);
              throw new Error(`Upload failed for ${photoFile.name}: ${uploadError.message}`);
            }
            if (!uploadData?.path) {
              throw new Error(`Upload succeeded for ${photoFile.name} but path is missing.`);
            }
            const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(uploadData.path);
            if (!urlData?.publicUrl) {
              throw new Error(`Failed to get public URL for ${uploadData.path}`);
            }
            return { status: 'fulfilled' as const, value: urlData.publicUrl, filename: photoFile.name };
          })
          .catch((reason) => {
            console.error(`Upload promise rejected for ${photoFile.name}:`, reason);
            const message = reason instanceof Error ? reason.message : String(reason);
            return { status: 'rejected' as const, reason: message, filename: photoFile.name };
          });
      });

      const results = await Promise.allSettled(uploadPromises);
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          if (result.value.status === 'fulfilled' && result.value.value) {
            uploadedPhotoUrls.push(result.value.value);
          } else if (result.value.status === 'rejected') {
            uploadErrors.push(`'${result.value.filename}': ${result.value.reason}`);
          }
        } else {
          console.error('A photo upload processing promise was rejected:', result.reason);
          uploadErrors.push(`An unexpected error occurred during one of the photo uploads.`);
        }
      });

      if (photos.length > 0 && uploadedPhotoUrls.length === 0 && uploadErrors.length > 0) {
        const errorSummary = `Photo upload failed for all images. Errors: ${uploadErrors.join('; ')}`;
        showNotification({ type: 'error', message: errorSummary });
        setSubmitMessage({ type: 'error', text: errorSummary});
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const minPriceFloat = parseFloat(minPrice);
      const upperCapFloat = upperCap.trim() ? parseFloat(upperCap) : null;

      const listingPayload = {
        seller_id: currentUser.id,
        title: title.trim(),
        description: description.trim(),
        min_price: minPriceFloat,
        upper_cap: upperCapFloat,
        end_time: new Date(endTime).toISOString(),
        rules: rules.trim() || null,
        tags: selectedCategory ? [selectedCategory] : null,
        photos: uploadedPhotoUrls.length > 0 ? uploadedPhotoUrls : null,
        status: 'active' as const,
      };
      
      const { data: newListing, error: insertError } = await supabase
        .from('listings')
        .insert(listingPayload)
        .select()
        .single(); 
      
      if (insertError) {
        console.error('Supabase insert error:', insertError);
        throw insertError;
      }
      if (!newListing) {
        throw new Error('Listing created but no data returned from database.');
      }

      let successMessageText = 'Listing created successfully!';
      if (uploadErrors.length > 0) {
        successMessageText += ` However, ${uploadErrors.length} photo(s) failed to upload: ${uploadErrors.join('; ')}. You can edit the listing to re-upload them.`;
      }
      
      showNotification({ type: 'success', message: successMessageText + ' Redirecting…' });
      
      setIsSubmitting(false);
      router.push(`/listings/${newListing.id}`);

    } catch (err) { // Type err as unknown or Error
      console.error('Listing insertion or final processing failed:', err);
      let userFriendlyMessage = 'An error occurred while creating the listing.';
      if (err instanceof Error) {
          userFriendlyMessage = `Error: ${err.message}`;
          // For Supabase specific errors, check if 'details' or 'hint' exist on the error object
          const specificError = err as SupabaseError; // Cast to our defined interface
          if (specificError.details) userFriendlyMessage += ` Details: ${specificError.details}`;
          if (specificError.hint) userFriendlyMessage += ` Hint: ${specificError.hint}`;
      } else if (typeof err === 'string') {
          userFriendlyMessage = err;
      }

      if (uploadErrors.length > 0) {
        userFriendlyMessage += ` Additionally, some photos failed to upload: ${uploadErrors.join('; ')}`;
      }
      showNotification({ type: 'error', message: userFriendlyMessage });
      setSubmitMessage({ type: 'error', text: userFriendlyMessage });
      setIsSubmitting(false);
    }
  };


  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-bye-dark-bg-primary">
        <LoadingSpinner message="Checking authentication..." />
      </div>
    );
  }

  const inputBaseClasses = "w-full px-4 py-3 border-2 rounded-xl text-base focus:ring-0 transition-all";
  const inputNormalBorder = "border-gray-200 dark:border-bye-dark-border-primary focus:border-indigo-500 dark:focus:border-indigo-400";
  const inputErrorBorder = "border-red-400 dark:border-red-500 focus:border-red-500 dark:focus:border-red-400";
  const inputTextColors = "text-gray-900 dark:text-bye-dark-text-primary";
  const inputBgColors = "bg-white dark:bg-bye-dark-bg-hover";
  const placeholderColors = "placeholder-gray-400 dark:placeholder-bye-dark-text-secondary";

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Basic Info
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-2">Tell us about your item</h2>
              <p className="text-gray-600 dark:text-bye-dark-text-secondary">Start with the basics to attract potential bidders</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-bye-dark-text-primary mb-2">
                  <span>Item Title</span>
                  <span className="text-red-500 dark:text-red-400">*</span>
                  <InfoPopover
                    content={
                      <div className="space-y-1 text-xs">
                        <p className="font-medium">A good title should:</p>
                        <ul className="list-disc list-outside pl-4 space-y-0.5">
                          <li>Be clear and descriptive</li>
                          <li>Include brand name if applicable</li>
                          <li>Mention condition (e.g., &quot;Like New&quot;)</li>
                          <li>Keep it concise (max 100 chars)</li>
                        </ul>
                      </div>
                    }
                  />
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Bose QuietComfort 45 (Like New)"
                  className={`${inputBaseClasses} ${inputTextColors} ${inputBgColors} ${placeholderColors} ${validationErrors.title ? inputErrorBorder : inputNormalBorder}`}
                  maxLength={100}
                />
                {validationErrors.title && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.title}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-bye-dark-text-primary mb-2">
                  <span>Description</span>
                  <span className="text-red-500 dark:text-red-400">*</span>
                   <InfoPopover
                    content={
                      <p className="text-xs">Provide all relevant details about your item. Mention condition, features, any defects, and reason for selling if you wish.</p>
                    }
                  />
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your item's condition, features, any wear and tear, and why you're selling it..."
                  className={`${inputBaseClasses} ${inputTextColors} ${inputBgColors} ${placeholderColors} resize-none ${validationErrors.description ? inputErrorBorder : inputNormalBorder}`}
                />
                {validationErrors.description && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.description}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-bye-dark-text-primary mb-2">
                  <Clock className="w-4 h-4 text-gray-500 dark:text-bye-dark-text-secondary" />
                  <span>Auction End Time</span>
                  <span className="text-red-500 dark:text-red-400">*</span>
                  <InfoPopover
                    content={
                      <div className="space-y-1 text-xs">
                        <p className="font-medium">Auction duration rules:</p>
                        <ul className="list-disc list-outside pl-4 space-y-0.5">
                          <li>Minimum: 1 hour from now</li>
                          <li>Maximum: 90 days from now</li>
                          <li>Time is based on your browser&apos;s local timezone.</li>
                          <li>Cannot be changed after listing.</li>
                        </ul>
                      </div>
                    }
                  />
                </label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  min={new Date(Date.now() + 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  className={`${inputBaseClasses} ${inputTextColors} ${inputBgColors} ${placeholderColors} ${validationErrors.endTime ? inputErrorBorder : inputNormalBorder}`}
                />
                {validationErrors.endTime && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.endTime}
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 1: // Pricing
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-2">Set your pricing</h2>
              <p className="text-gray-600 dark:text-bye-dark-text-secondary">Determine your starting bid and optional buy-now price</p>
            </div>

            <div className="space-y-6">
              <div className="bg-indigo-50 dark:bg-indigo-900/25 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-1">Pricing Tips</h3>
                    <p className="text-indigo-800 dark:text-indigo-300 text-sm">Set a competitive starting price to attract bidders. The buy-now price should ideally be your target selling price if you want a quick sale.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-bye-dark-text-primary mb-2">
                  <span>Minimum Bid Price</span>
                  <span className="text-red-500 dark:text-red-400">*</span>
                  <InfoPopover
                    content={
                      <div className="space-y-1 text-xs">
                        <p className="font-medium">This is the starting bid. Consider:</p>
                        <ul className="list-disc list-outside pl-4 space-y-0.5">
                          <li>Original price & current condition</li>
                          <li>Typical market value for similar items</li>
                          <li>Cannot be changed after first bid.</li>
                        </ul>
                      </div>
                    }
                  />
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-bye-dark-text-secondary font-medium">₹</span>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    min="1"
                    step="any"
                    placeholder="e.g., 500"
                    className={`${inputBaseClasses} ${inputTextColors} ${inputBgColors} ${placeholderColors} pl-8 ${validationErrors.minPrice ? inputErrorBorder : inputNormalBorder}`}
                  />
                </div>
                {validationErrors.minPrice && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.minPrice}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-bye-dark-text-primary mb-2">
                  <span>Buy Now Price</span>
                  <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary font-normal">(Optional)</span>
                  <InfoPopover
                    content={
                       <div className="space-y-1 text-xs">
                        <p className="font-medium">Allows instant purchase if a bid reaches this.</p>
                        <ul className="list-disc list-outside pl-4 space-y-0.5">
                          <li>Must be higher than minimum bid.</li>
                          <li>Auction ends immediately if met.</li>
                          <li>Good for quick sales at your ideal price.</li>
                        </ul>
                      </div>
                    }
                  />
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-bye-dark-text-secondary font-medium">₹</span>
                  <input
                    type="number"
                    value={upperCap}
                    onChange={(e) => setUpperCap(e.target.value)}
                    min={minPrice ? (parseFloat(minPrice) + 1).toString() : "1"}
                    step="any"
                    placeholder="e.g., 2000"
                    className={`${inputBaseClasses} ${inputTextColors} ${inputBgColors} ${placeholderColors} pl-8 ${validationErrors.upperCap ? inputErrorBorder : inputNormalBorder}`}
                  />
                </div>
                {validationErrors.upperCap && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.upperCap}
                  </p>
                )}
                <p className="text-gray-500 dark:text-bye-dark-text-secondary text-xs mt-1.5">If someone bids this amount, they win instantly.</p>
              </div>
            </div>
          </div>
        );

      case 2: // Photos
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-2">Add Photos</h2>
              <div className="flex items-center justify-center gap-1.5">
                <p className="text-gray-600 dark:text-bye-dark-text-secondary">Good photos help your item sell faster!</p>
                <InfoPopover
                  content={
                    <div className="space-y-1 text-xs">
                      <p className="font-medium">Photo Tips:</p>
                      <ul className="list-disc list-outside pl-4 space-y-0.5">
                        <li>Use good, natural lighting.</li>
                        <li>Show item from multiple angles.</li>
                        <li>Highlight key features and any defects.</li>
                        <li>First photo is your cover image.</li>
                        <li>Max {MAX_PHOTOS} photos. JPG, PNG, WEBP accepted.</li>
                      </ul>
                    </div>
                  }
                />
              </div>
            </div>

            <div className="space-y-6">
              {photos.length === 0 ? (
                <label className="block cursor-pointer group">
                  <div className="border-2 border-dashed border-gray-300 dark:border-bye-dark-border-primary rounded-xl p-8 text-center hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all">
                    <ImageIcon className="w-12 h-12 text-gray-400 dark:text-bye-dark-text-secondary group-hover:text-indigo-500 dark:group-hover:text-indigo-400 mx-auto mb-4 transition-colors" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">Upload your first photo</h3>
                    <p className="text-gray-600 dark:text-bye-dark-text-secondary mb-4 text-sm">Drag & drop or click to browse (up to {MAX_PHOTOS})</p>
                    <div className="inline-flex items-center gap-2 bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium group-hover:bg-indigo-700 dark:group-hover:bg-indigo-600 transition-colors">
                      <Plus className="w-4 h-4" />
                      Choose Photos
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleFileChange}
                    className="sr-only"
                    id="photo-upload-initial"
                  />
                </label>
              ) : (
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                    {photoPreviews.map((url, idx) => (
                      <div key={idx} className="relative group aspect-square">
                        <Image
                          src={url}
                          alt={`Preview ${idx + 1}`}
                          fill
                          sizes="(max-width: 640px) 50vw, 33vw"
                          className="object-cover rounded-xl border-2 border-gray-200 dark:border-bye-dark-border-primary"
                        />
                        {idx === 0 && (
                          <div className="absolute top-1.5 left-1.5 bg-indigo-600 dark:bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                            COVER
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 focus:opacity-100 focus:ring-2 focus:ring-red-400 focus:ring-offset-1 dark:focus:ring-offset-bye-dark-bg-secondary transition-opacity"
                          aria-label={`Remove photo ${idx + 1}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                      <label htmlFor="photo-upload-more" className="aspect-square border-2 border-dashed border-gray-300 dark:border-bye-dark-border-primary rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all group">
                        <Plus className="w-8 h-8 text-gray-400 dark:text-bye-dark-text-secondary group-hover:text-indigo-500 dark:group-hover:text-indigo-400 mb-1 transition-colors" />
                        <span className="text-xs text-gray-600 dark:text-bye-dark-text-secondary font-medium group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">Add More</span>
                        <span className="text-[10px] text-gray-400 dark:text-bye-dark-text-secondary/70">({MAX_PHOTOS - photos.length} left)</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={handleFileChange}
                          className="sr-only"
                          id="photo-upload-more"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
              
              {validationErrors.photos && (
                <p className="text-red-500 dark:text-red-400 text-xs flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.photos}
                </p>
              )}
            </div>
          </div>
        );

      case 3: // Category & Rules
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-100 dark:bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Tag className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-2">Final Details</h2>
              <p className="text-gray-600 dark:text-bye-dark-text-secondary">Choose a category and set any special rules.</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-bye-dark-text-primary mb-3">
                  <span>Category</span>
                  <span className="text-red-500 dark:text-red-400">*</span>
                   <InfoPopover content={<p className="text-xs">Select the category that best fits your item.</p>} />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CATEGORIES_FOR_FORM.map(category => (
                    <button
                      type="button"
                      key={category}
                      role="radio"
                      aria-checked={selectedCategory === category}
                      className={`relative text-left w-full cursor-pointer rounded-xl border-2 p-4 transition-all duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-bye-dark-bg-secondary ${
                        selectedCategory === category
                          ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400'
                          : 'border-gray-200 dark:border-bye-dark-border-primary bg-white dark:bg-bye-dark-bg-hover hover:border-gray-300 dark:hover:border-bye-dark-text-secondary/70 focus-visible:ring-gray-400 dark:focus-visible:ring-bye-dark-text-secondary'
                      }`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${selectedCategory === category ? 'text-indigo-700 dark:text-indigo-200' : 'text-gray-900 dark:text-bye-dark-text-primary'}`}>{category}</span>
                        {selectedCategory === category && (
                          <div className="w-5 h-5 bg-indigo-600 dark:bg-indigo-400 rounded-full flex items-center justify-center shadow">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {validationErrors.category && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.category}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-bye-dark-text-primary mb-2">
                  <span>Auction Rules</span>
                  <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary font-normal">(Optional)</span>
                  <InfoPopover
                    content={
                       <div className="space-y-1 text-xs">
                        <p className="font-medium">Examples:</p>
                        <ul className="list-disc list-outside pl-4 space-y-0.5">
                          <li>&ldquo;Pickup from campus only.&rdquo;</li>
                          <li>&ldquo;Payment via UPI within 24 hours.&rdquo;</li>
                          <li>&ldquo;No returns accepted.&rdquo;</li>
                        </ul>
                      </div>
                    }
                  />
                </label>
                <textarea
                  rows={3}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="e.g., Pickup from Hostel X only, payment via UPI preferred within 24 hours of auction end..."
                  className={`${inputBaseClasses} ${inputTextColors} ${inputBgColors} ${placeholderColors} resize-none ${inputNormalBorder}`}
                />
                <p className="text-gray-500 dark:text-bye-dark-text-secondary text-xs mt-1.5">Set clear expectations for buyers (e.g., pickup, payment).</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-bye-dark-bg-primary">
      <div className="bg-white dark:bg-bye-dark-bg-secondary border-b border-gray-200 dark:border-bye-dark-border-primary sticky top-0 z-30 shadow-sm">
        <div className="px-4 py-3 sm:py-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-bye-dark-text-primary">Create New Listing</h1>
              <div className="text-xs sm:text-sm text-gray-500 dark:text-bye-dark-text-secondary">
                Step {currentStep + 1} of {steps.length}: <span className="font-semibold text-gray-700 dark:text-bye-dark-text-primary">{steps[currentStep].title}</span>
              </div>
            </div>
            
            <div className="flex items-center">
              {steps.map((step, index) => {
                const IconComponent = step.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                
                return (
                  <div key={step.id} className={`flex items-center ${index > 0 ? 'flex-1' : ''}`}>
                    {index > 0 && (
                       <div className={`flex-auto border-t-2 transition-colors duration-300 ease-in-out ${
                        isCompleted || isActive ? 'border-indigo-600 dark:border-indigo-400' : 'border-gray-300 dark:border-bye-dark-border-primary'
                      }`}></div>
                    )}
                    <div 
                        className={`flex flex-col items-center cursor-pointer transition-all duration-200 ${isActive ? 'scale-110' : 'opacity-70 hover:opacity-100'}`}
                        onClick={isCompleted ? () => setCurrentStep(index) : undefined}
                    >
                        <div className={`flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 mb-1 transition-all duration-300 ease-in-out ${
                        isCompleted 
                            ? 'border-green-500 bg-green-500 dark:border-green-400 dark:bg-green-400' 
                            : isActive 
                            ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-500 dark:bg-indigo-500 shadow-lg' 
                            : 'border-gray-300 dark:border-bye-dark-border-primary bg-white dark:bg-bye-dark-bg-secondary'
                        }`}>
                        {isCompleted ? (
                            <Check className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        ) : (
                            <IconComponent className={`w-5 h-5 sm:w-6 sm:h-6 ${isActive ? 'text-white' : 'text-gray-400 dark:text-bye-dark-text-secondary'}`} />
                        )}
                        </div>
                        <span className={`text-xs text-center font-medium transition-colors ${
                            isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-bye-dark-text-secondary'
                        }`}>
                        {step.title}
                        </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 sm:py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-bye-dark-bg-secondary rounded-2xl shadow-lg border border-gray-200 dark:border-bye-dark-border-primary p-6 sm:p-10">
            {submitMessage && submitMessage.type === 'error' && ( 
              <div className={`mb-6 p-3 sm:p-4 rounded-xl border flex items-start gap-3 ${
                  'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700/50 text-red-800 dark:text-red-300'
              }`}>
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{submitMessage.text}</span>
              </div>
            )}

            {renderStepContent()}
          </div>

          <div className="flex gap-3 sm:gap-4 mt-8">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                type="button"
                className="flex-1 py-3 px-4 sm:px-6 border-2 border-gray-300 dark:border-bye-dark-border-primary text-gray-700 dark:text-bye-dark-text-primary font-semibold rounded-xl hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover active:scale-95 transition-all"
              >
                Previous
              </button>
            )}
            
            {currentStep < steps.length - 1 ? (
              <button
                onClick={handleNext}
                type="button"
                className="flex-1 py-3 px-4 sm:px-6 bg-indigo-600 dark:bg-indigo-500 text-white font-semibold rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-600 active:scale-95 transition-all"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                type="button"
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 sm:px-6 bg-green-600 dark:bg-green-500 text-white font-semibold rounded-xl hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Creating Listing...
                  </>
                ) : (
                  'Create Listing'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}