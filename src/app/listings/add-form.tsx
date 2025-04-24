'use client';

import { useState, useEffect } from 'react';
import { supabase, type User } from '@/lib/supabaseClient';

export default function AddListingForm() {
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [endTime, setEndTime]   = useState('');
  const [photo,   setPhoto]     = useState<File | null>(null);
  const [user,    setUser]      = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return alert('Log in first');

    let photoUrl: string | null = null;
    if (photo) {
      const ext = photo.name.split('.').pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase
        .storage.from('listing-images')
        .upload(path, photo);
      if (upErr) return alert('Image upload failed: ' + upErr.message);

      photoUrl = supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from('listings').insert({
      title,
      description,
      min_price: parseFloat(minPrice),
      end_time: new Date(endTime),
      seller_id: user.id,
      photos: photoUrl,
    });
    if (error) return alert('Insert failed: ' + error.message);

    // reset form
    setTitle(''); setDesc(''); setMinPrice(''); setEndTime(''); setPhoto(null);
  };

  return (
    <form onSubmit={handleSubmit} className="mb-10 space-y-3">
      <h2 className="text-xl font-semibold">Add a New Listing</h2>

      <input
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded"
      />

      <textarea
        placeholder="Description"
        value={description}
        onChange={e => setDesc(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded"
      />

      <input
        type="number"
        placeholder="Min Price ₹"
        value={minPrice}
        onChange={e => setMinPrice(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded"
      />

      <input
        type="datetime-local"
        value={endTime}
        onChange={e => setEndTime(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded"
      />

      <input
        type="file"
        accept="image/*"
        onChange={e => setPhoto(e.target.files?.[0] || null)}
      />

      <button className="bg-indigo-600 text-white px-4 py-2 rounded">
        Save
      </button>
    </form>
  );
}
