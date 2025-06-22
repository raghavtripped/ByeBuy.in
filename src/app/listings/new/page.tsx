// src/app/listings/new/page.tsx
'use client';

// Removed unused imports like useCallback, X, Plus, Clock
import { useState, useEffect, useRef, FormEvent, FC, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, Save, Loader2, UploadCloud, GripVertical, Trash2, 
  ArrowRight, ArrowLeft, DollarSign, FileText, Image as ImageIcon, Tag 
} from 'lucide-react';
// Assuming a 'useNotifications' hook exists and works as intended
import { useNotifications } from '@/hooks/useNotifications';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';

// --- TYPES ---

// FIX: A single, unified type for photo data.
interface PhotoPreview {
  file: File;
  id: string;
  url: string;
}

// FIX: The photos are now directly part of FormData using the PhotoPreview type.
interface FormData {
  title: string;
  description: string;
  minPrice: string;
  upperCap: string;
  endTime: string;
  category: string;
  rules: string;
  photos: PhotoPreview[];
}

interface ValidationErrors {
  title?: string;
  description?: string;
  endTime?: string;
  minPrice?: string;
  upperCap?: string;
  photos?: string;
  category?: string;
}

const initialFormData: FormData = {
  title: '',
  description: '',
  minPrice: '',
  upperCap: '',
  endTime: '',
  category: '',
  rules: '',
  photos: [], // Photos are now initialized inside the main form state.
};

const CATEGORIES_FOR_FORM = [
  'Electronics & Gadgets', 'Furniture & Dorm Essentials', 'Textbooks & Study Materials',
  'Apparel & Accessories', 'Sports & Hobby Gear', 'Other',
];

// --- REUSABLE SUB-COMPONENTS ---

const FormInput: FC<{
  id: keyof Omit<FormData, 'photos'>; // Adjusted type for safety
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  charLimit?: number;
  as?: 'textarea';
}> = ({ id, label, value, onChange, type = 'text', placeholder, error, charLimit, as }) => {
  const InputComponent = as === 'textarea' ? 'textarea' : 'input';
  return (
    <div className="relative">
      <InputComponent
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        type={type}
        placeholder={placeholder || " "}
        rows={as === 'textarea' ? 4 : undefined}
        className={`peer block w-full px-4 pt-6 pb-2 bg-white/50 dark:bg-black/20 rounded-lg border-2 transition-colors duration-200
          ${error 
            ? 'border-red-400 focus:border-red-500' 
            : 'border-transparent focus:border-indigo-400'}
          focus:outline-none focus:ring-0`}
      />
      <label
        htmlFor={id}
        className={`absolute text-sm text-gray-600 dark:text-gray-400 duration-300 transform -translate-y-3.5 scale-75 top-4 z-10 origin-[0] left-4
          peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3.5`}
      >
        {label}
      </label>
      {charLimit && (
        <div className="absolute bottom-2 right-3 text-xs text-gray-500 dark:text-gray-400">
          {value.length} / {charLimit}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
};

// FIX: PhotoUploader now takes an `onPhotosChange` callback instead of a state setter.
const PhotoUploader: FC<{
  photos: PhotoPreview[];
  onPhotosChange: (photos: PhotoPreview[]) => void;
  error?: string;
}> = ({ photos, onPhotosChange, error }) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const { showNotification } = useNotifications();
  const MAX_PHOTOS = 5;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    addPhotos(files);
    e.target.value = ""; // Allow re-selecting the same file
  };

  const addPhotos = (newFiles: File[]) => {
    const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));
    if (photos.length + imageFiles.length > MAX_PHOTOS) {
      showNotification({ message: `You can upload a maximum of ${MAX_PHOTOS} photos.`, type: 'error' });
      return;
    }
    const newPhotoPreviews = imageFiles.slice(0, MAX_PHOTOS - photos.length).map(file => ({
      file: file,
      id: `${file.name}-${Date.now()}`,
      url: URL.createObjectURL(file),
    }));
    onPhotosChange([...photos, ...newPhotoPreviews]);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    addPhotos(files);
  };

  const handleRemove = (id: string) => {
    const photoToRemove = photos.find(p => p.id === id);
    if (photoToRemove) URL.revokeObjectURL(photoToRemove.url);
    onPhotosChange(photos.filter(p => p.id !== id));
  };

  const handleDragSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const newPhotos = [...photos];
    const draggedItemContent = newPhotos.splice(dragItem.current, 1)[0];
    newPhotos.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    onPhotosChange(newPhotos);
  };

  return (
    <div className="space-y-4">
      <div
        onDragEnter={() => setIsDraggingOver(true)}
        onDragLeave={() => setIsDraggingOver(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`relative block w-full border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
          isDraggingOver 
            ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
        }`}
      >
        <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
        <span className="mt-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
          Drag & drop photos here, or click to browse
        </span>
        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
          PNG, JPG, WEBP up to 5MB. Max {MAX_PHOTOS} photos.
        </span>
        <input type="file" multiple accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              draggable
              onDragStart={() => (dragItem.current = index)}
              onDragEnter={() => (dragOverItem.current = index)}
              onDragEnd={handleDragSort}
              onDragOver={e => e.preventDefault()}
              className="relative aspect-square group cursor-grab active:cursor-grabbing"
            >
              <Image src={photo.url} alt="Preview" fill sizes="33vw" className="rounded-lg object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <GripVertical className="text-white" />
                <button
                  type="button"
                  onClick={() => handleRemove(photo.id)}
                  className="p-1.5 bg-red-500/80 hover:bg-red-500 rounded-full text-white"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
               {index === 0 && (
                  <div className="absolute top-1.5 left-1.5 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    COVER
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
};

// FIX: This component now correctly receives photos from formData.
const ListingPreview: FC<{ formData: FormData }> = ({ formData }) => {
  return (
    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-white/20 shadow-lg rounded-2xl overflow-hidden">
      <div className="aspect-video bg-gray-200 dark:bg-gray-700 relative">
        {formData.photos.length > 0 ? (
          <Image src={formData.photos[0].url} alt="Listing preview" fill className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500" />
          </div>
        )}
      </div>
      <div className="p-6 space-y-4">
        <h3 className="font-bold text-xl text-gray-900 dark:text-white truncate">
          {formData.title || 'Your Item Title'}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 h-10 overflow-hidden">
          {formData.description || 'A detailed description of your item will appear here.'}
        </p>
        <div className="flex justify-between items-center pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Starting Bid</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              ₹{formData.minPrice || '0'}
            </p>
          </div>
           {formData.upperCap && (
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Buy Now</p>
              <p className="font-semibold text-lg text-gray-800 dark:text-gray-200">
                ₹{formData.upperCap}
              </p>
            </div>
           )}
        </div>
      </div>
    </div>
  );
};


// --- MAIN COMPONENT ---
export default function UltimateListingCreationPage() {
  const router = useRouter();
  const { showNotification } = useNotifications();
  const { user: currentUser, loading: loadingUser } = useAuth();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
  
  // FIX: Removed separate `photoPreviews` state.

  // Effect for Auto-Save and Load from sessionStorage (runs only once)
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem('listingDraft');
      if (draft) {
        // Restore everything except photos, which can't be stored.
        const parsedDraft = JSON.parse(draft);
        setFormData({ ...initialFormData, ...parsedDraft, photos: [] });
        showNotification({ message: "Draft restored!", type: 'info' });
      }
    } catch (e) {
      console.warn("Could not parse draft.", e);
      sessionStorage.removeItem('listingDraft');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const debounceSave = setTimeout(() => {
      // Create a savable version of the form data without File objects
      const { photos: _photos, ...savableData } = formData; // eslint-disable-line @typescript-eslint/no-unused-vars
      if (JSON.stringify(savableData) !== JSON.stringify(initialFormData)) {
        sessionStorage.setItem('listingDraft', JSON.stringify(savableData));
      }
    }, 1000);
    return () => clearTimeout(debounceSave);
  }, [formData]);
  
  // FIX: This problematic useEffect has been removed.

  const handleSaveDraft = async () => {
    setIsSaving(true);
    const { photos: _photos, ...savableData } = formData; // eslint-disable-line @typescript-eslint/no-unused-vars
    sessionStorage.setItem('listingDraft', JSON.stringify(savableData));
    await new Promise(res => setTimeout(res, 700));
    setIsSaving(false);
    showNotification({ message: 'Draft saved successfully!', type: 'success' });
  };
  
  const validateStep = (currentStep: number): boolean => {
    const newErrors: ValidationErrors = {};
    switch (currentStep) {
      case 1:
        if (!formData.title.trim()) newErrors.title = 'Title is required.';
        if (formData.title.length > 80) newErrors.title = 'Title must be 80 characters or less.';
        if (!formData.description.trim()) newErrors.description = 'Description is required.';
        break;
      case 2:
        if (formData.photos.length === 0) newErrors.photos = 'At least one photo is required.';
        break;
      case 3:
        if (!formData.minPrice) newErrors.minPrice = 'Minimum price is required.';
        else if (+formData.minPrice <= 0) newErrors.minPrice = 'Price must be positive.';
        if (formData.upperCap && +formData.upperCap <= +formData.minPrice) {
          newErrors.upperCap = 'Buy Now price must be higher than the minimum bid.';
        }
        if (!formData.endTime) newErrors.endTime = 'End time is required.';
        break;
      case 4:
        if (!formData.category) newErrors.category = 'A category must be selected.';
        break;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setAnimationDirection('forward');
      setStep(s => s < 4 ? s + 1 : s);
    }
  };

  const handlePrev = () => {
    setAnimationDirection('backward');
    setStep(s => s > 1 ? s - 1 : s);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if(errors[name as keyof ValidationErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  // FIX: A dedicated handler to update photos in the main form state.
  const handlePhotosChange = (newPhotos: PhotoPreview[]) => {
    setFormData(prev => ({ ...prev, photos: newPhotos }));
    if (errors.photos) {
      setErrors(prev => ({ ...prev, photos: undefined }));
    }
  };
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loadingUser) return; // wait for auth
    if (!currentUser) {
      showNotification({ message: 'Please log in to create a listing.', type: 'error' });
      router.push('/auth?redirect=/listings/new');
      return;
    }
    let isFormValid = true;
    for (let i = 1; i <= 4; i++) {
        if (!validateStep(i)) {
            isFormValid = false;
        }
    }
    if (!isFormValid) {
       showNotification({ message: 'Please fix all errors before submitting.', type: 'error' });
       for (let i = 1; i <= 4; i++) {
         if(!validateStep(i)) {
           setStep(i);
           return;
         }
       }
       return;
    }

    setIsSubmitting(true);

    // ------------ Upload Photos -------------
    const uploadedPhotoUrls: string[] = [];
    const uploadErrors: string[] = [];
    const MAX_PHOTOS = 5;

    if (formData.photos.length > 0) {
      const uploadPromises = formData.photos.slice(0, MAX_PHOTOS).map((preview) => {
        const photoFile = preview.file;
        const fileExt = photoFile.name.split('.').pop()?.toLowerCase() || 'file';
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const safeTitlePrefix = formData.title.trim().replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20) || 'listing';
        const filePath = `${currentUser.id}/${safeTitlePrefix}_${Date.now()}_${randomSuffix}.${fileExt}`;

        return supabase.storage
          .from('listing-images')
          .upload(filePath, photoFile, { cacheControl: '3600', upsert: false })
          .then(({ data, error }) => {
            if (error || !data?.path) {
              throw new Error(error?.message || 'Upload failed');
            }
            const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(data.path);
            if (!urlData?.publicUrl) throw new Error('Could not get public URL');
            return urlData.publicUrl;
          });
      });

      const results = await Promise.allSettled(uploadPromises);
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          uploadedPhotoUrls.push(res.value);
        } else {
          uploadErrors.push(`Photo ${idx + 1}: ${res.reason}`);
        }
      });

      if (uploadedPhotoUrls.length === 0) {
        showNotification({ message: `Photo uploads failed: ${uploadErrors.join('; ')}`, type: 'error' });
        setIsSubmitting(false);
        return;
      }
    }

    // ------------ Insert Listing -------------
    try {
      const minPriceFloat = parseFloat(formData.minPrice);
      const upperCapFloat = formData.upperCap.trim() ? parseFloat(formData.upperCap) : null;

      const { data: newListing, error: insertError } = await supabase
        .from('listings')
        .insert({
          seller_id: currentUser.id,
          title: formData.title.trim(),
          description: formData.description.trim(),
          min_price: minPriceFloat,
          upper_cap: upperCapFloat,
          end_time: new Date(formData.endTime).toISOString(),
          rules: formData.rules.trim() || null,
          tags: formData.category ? [formData.category] : null,
          photos: uploadedPhotoUrls,
          status: 'active',
        })
        .select()
        .single();

      if (insertError || !newListing) {
        throw insertError || new Error('Listing insertion failed');
      }

      showNotification({ message: '🎉 Listing created successfully! Redirecting…', type: 'success' });
      sessionStorage.removeItem('listingDraft');
      router.push(`/listings/${newListing.id}`);
    } catch (err) {
      console.error(err);
      showNotification({ message: 'Error creating listing. Please try again.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const steps = [
    { num: 1, title: 'Details', icon: FileText },
    { num: 2, title: 'Photos', icon: ImageIcon },
    { num: 3, title: 'Pricing', icon: DollarSign },
    { num: 4, title: 'Category', icon: Tag },
  ];
  
  const variants = {
    enter: (direction: 'forward' | 'backward') => ({ x: direction === 'forward' ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: 'forward' | 'backward') => ({ x: direction === 'forward' ? '-100%' : '100%', opacity: 0 }),
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Item Details</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">Start with the basics. A great title and description attract more bidders.</p>
            <FormInput id="title" label="Item Title" value={formData.title} onChange={handleFormChange} error={errors.title} charLimit={80} placeholder="e.g., Like New AirPods Pro 2" />
            <FormInput id="description" label="Description" as="textarea" value={formData.description} onChange={handleFormChange} error={errors.description} placeholder="Describe the condition, features, and any flaws."/>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Upload Photos</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">Show off your item! The first photo will be the cover image. You can drag to reorder.</p>
            <PhotoUploader photos={formData.photos} onPhotosChange={handlePhotosChange} error={errors.photos} />
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Set Your Price</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">Choose a starting bid and an optional &quot;Buy Now&quot; price for a quick sale.</p>
            <FormInput id="minPrice" label="Starting Bid (₹)" type="number" value={formData.minPrice} onChange={handleFormChange} error={errors.minPrice} placeholder="500" />
            <FormInput id="upperCap" label="Buy Now Price (₹) - Optional" type="number" value={formData.upperCap} onChange={handleFormChange} error={errors.upperCap} placeholder="2000" />
            <FormInput id="endTime" label="Auction End Time" type="datetime-local" value={formData.endTime} onChange={handleFormChange} error={errors.endTime} />
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Final Details</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">Select a category and add any specific rules for buyers.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category</label>
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES_FOR_FORM.map(cat => (
                  <button key={cat} type="button" onClick={() => { setFormData(f => ({ ...f, category: cat })); if(errors.category) setErrors(e => ({...e, category: undefined})) }}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.category === cat 
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40' 
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}>
                      <span className="font-semibold">{cat}</span>
                  </button>
                ))}
              </div>
              {errors.category && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.category}</p>}
            </div>
            <FormInput id="rules" label="Auction Rules (Optional)" as="textarea" value={formData.rules} onChange={handleFormChange} placeholder="e.g., Pickup from campus only. Payment via UPI."/>
          </div>
        );
      case 5:
        return (
           <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="text-center py-12"
          >
            <div className="w-24 h-24 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Listing Created!</h2>
            <p className="mt-2 text-gray-600 dark:text-gray-300">Your item is now live. Good luck with the auction!</p>
            <button
                onClick={() => router.push('/')}
                className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-indigo-600 rounded-lg shadow-lg hover:bg-indigo-700 transition-all transform hover:scale-105"
            >
                View My Listing
                <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )
      default: return null;
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-bye-dark-bg-primary p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div className="font-bold text-xl text-gray-800 dark:text-white">
            Create Listing
          </div>
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 bg-white/70 dark:text-indigo-300 dark:bg-slate-800/70 rounded-lg shadow-md hover:bg-white transition-all"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-8">
          <div className="flex flex-col">
            {step <= 4 && (
              <div className="mb-8">
                <div className="flex items-center justify-between">
                  {steps.map((s, index) => (
                    <Fragment key={s.num}>
                      <div className="flex flex-col items-center text-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                          ${step > s.num ? 'bg-green-500 border-green-500 text-white' : ''}
                          ${step === s.num ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : ''}
                          ${step < s.num ? 'bg-white/50 dark:bg-slate-700/50 border-gray-300 dark:border-gray-600' : ''}
                        `}>
                          {step > s.num ? <Check className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                        </div>
                        <p className={`mt-2 text-xs font-semibold transition-colors ${step >= s.num ? 'text-gray-800 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{s.title}</p>
                      </div>
                      {index < steps.length - 1 && <div className={`flex-1 h-1 mx-2 rounded-full transition-colors ${step > s.num ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}></div>}
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
            
            <div className="relative bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary shadow-xl rounded-2xl p-6 sm:p-8 flex-grow">
              <AnimatePresence mode="wait" custom={animationDirection}>
                <motion.div
                  key={step}
                  custom={animationDirection}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'tween', ease: 'easeInOut', duration: 0.4 }}
                >
                  {renderStepContent()}
                </motion.div>
              </AnimatePresence>
            </div>
            
            {step <= 4 && (
              <div className="mt-8 flex items-center justify-between">
                <button 
                  onClick={handlePrev} 
                  disabled={step === 1}
                  className="flex items-center gap-2 px-5 py-2.5 font-semibold text-gray-700 dark:text-gray-200 bg-white/70 dark:bg-slate-700/50 rounded-lg shadow-md hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ArrowLeft className="w-5 h-5"/> Previous
                </button>
                {step < 4 ? (
                  <button 
                    onClick={handleNext}
                    className="flex items-center gap-2 px-5 py-2.5 font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                  >
                    Next <ArrowRight className="w-5 h-5"/>
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2.5 font-semibold text-white bg-gradient-to-r from-green-500 to-teal-600 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-70 disabled:cursor-wait transition-all"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    {isSubmitting ? 'Creating Listing...' : 'Create Listing'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="hidden lg:block lg:sticky lg:top-8 self-start mt-8 lg:mt-0">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-4">Live Preview</h3>
            <ListingPreview formData={formData} />
          </div>
        </div>
      </div>
    </div>
  );
}