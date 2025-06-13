/* -------------------------------------------------------------------------- */
/*  src/components/UserAvatar.tsx (REUSABLE)                                  */
/* -------------------------------------------------------------------------- */
'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';

interface UserAvatarProps {
  /** Public URL returned by Supabase Storage (or `null`) */
  avatarUrl: string | null | undefined;
  /** Used for the `<img>` alt text (optional) */
  fullName?: string | null | undefined;
  /**
   * Avatar size – `sm` (40 px), `md` (96 px), `lg` (128 px), `xl` (160 px).
   * Defaults to `md`.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Extra Tailwind classes if you need further styling */
  className?: string;
}

const sizeClasses: Record<NonNullable<UserAvatarProps['size']>, string> = {
  sm: 'w-10 h-10',
  md: 'w-20 h-20 sm:w-24 sm:h-24',
  lg: 'w-32 h-32',
  xl: 'w-40 h-40',
};

const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  fullName,
  size = 'md',
  className = '',
}) => {
  const [imageSrc, setImageSrc] = useState(avatarUrl || '/default-avatar.png');
  const [imageError, setImageError] = useState(false);

  // Update imageSrc when avatarUrl changes
  useEffect(() => {
    setImageSrc(avatarUrl || '/default-avatar.png');
    setImageError(false);
  }, [avatarUrl]);

  const handleImageError = () => {
    if (!imageError && imageSrc !== '/default-avatar.png') {
      setImageSrc('/default-avatar.png');
      setImageError(true);
    }
  };

  return (
    <div
      className={`relative rounded-full overflow-hidden bg-slate-200 dark:bg-bye-dark-bg-hover flex items-center justify-center ring-2 ring-white dark:ring-bye-dark-bg-secondary shadow-sm ${sizeClasses[size]} ${className}`}
    >
      <Image
        src={imageSrc}
        alt={fullName || 'User avatar'}
        fill
        sizes={
          size === 'sm'
            ? '40px'
            : size === 'md'
            ? '96px'
            : size === 'lg'
            ? '128px'
            : '160px'
        }
        style={{ objectFit: 'cover' }}
        onError={handleImageError}
        quality={75}
        priority={size === 'lg' || size === 'xl'}
      />
    </div>
  );
};

export default UserAvatar;