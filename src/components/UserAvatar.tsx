/* -------------------------------------------------------------------------- */
/*  src/components/UserAvatar.tsx (REUSABLE)                                  */
/* -------------------------------------------------------------------------- */
'use client';

import Image from 'next/image';
import { FaUserCircle } from 'react-icons/fa';

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
  sm: 'w-10 h-10 text-2xl',
  md: 'w-20 h-20 sm:w-24 sm:h-24 text-5xl sm:text-6xl',
  lg: 'w-32 h-32 text-7xl',
  xl: 'w-40 h-40 text-8xl',
};

const iconSizeClasses: Record<NonNullable<UserAvatarProps['size']>, string> = {
  sm: 'w-8 h-8',
  md: 'w-16 h-16 sm:w-20 sm:h-20',
  lg: 'w-28 h-28',
  xl: 'w-36 h-36',
};

const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  fullName,
  size = 'md',
  className = '',
}) => (
  <div
    className={`relative rounded-full overflow-hidden bg-slate-200 dark:bg-bye-dark-bg-hover flex items-center justify-center ring-2 ring-white dark:ring-bye-dark-bg-secondary shadow-sm ${sizeClasses[size]} ${className}`}
  >
    {avatarUrl ? (
      <Image
        src={avatarUrl}
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
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          if (!img.src.endsWith('/default-avatar.png'))
            img.src = '/default-avatar.png';
        }}
      />
    ) : (
      <FaUserCircle
        className={`${iconSizeClasses[size]} text-slate-400 dark:text-bye-dark-text-secondary opacity-70`}
      />
    )}
  </div>
);

export default UserAvatar;
