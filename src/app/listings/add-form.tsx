'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AddListingForm() {
  const [user, setUser] = useState<any>(null);

  // form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [endTime, setEndTime] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  if (!user) return null; // hide form for anonymous visitors

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let photoUrl: string | null = null;

      if (photoFile) {
        const ext = photoFile.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('listing-images')
          .upload(path, photoFile);

        if (upErr) throw upErr;

        const { data } = supabase.storage
          .from('listing-images')
          .getPublicUrl(path);
        photoUrl = data.publicUrl;
      }

      const { error } = await supabase.from('listings').insert([
        {
          title,
          description,
          min_price: parseFloat(minPrice),
          end_time: new Date(endTime).toISOString(),
          seller_id: user.id,
          photos: photoUrl,
        },
      ]);

      if (error) throw error;

      alert('Listing added!');
      setTitle('');
      setDescription('');
      setMinPrice('');
      setEndTime('');
      setPhotoFile(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-10 border rounded-lg p-6 space-y-4"
    >
      <h2 className="text-xl font-semibold mb-2">Add a New Listing</h2>

      <input
        required
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full border px-3 py-2 rounded"
      />

      <textarea
        required
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full border px-3 py-2 rounded"
      />

      <input
        required
        type="number"
        placeholder="Minimum price (₹)"
        value={minPrice}
        onChange={(e) => setMinPrice(e.target.value)}
        className="w-full border px-3 py-2 rounded"
      />

      <input
        required
        type="datetime-local"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
        className="w-full border px-3 py-2 rounded"
      />

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
      />

      <button
        type="submit"
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        Add Listing
      </button>
    </form>
  );
}
