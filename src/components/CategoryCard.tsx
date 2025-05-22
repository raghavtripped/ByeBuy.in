/* -------------------------------------------------------------------------- */
/*  src/components/CategoryCard.tsx                                           */
/* -------------------------------------------------------------------------- */

import React from 'react';
import {
  ComputerDesktopIcon,        // Electronics & Gadgets
  HomeModernIcon,             // Furniture & Dorm Essentials
  BookOpenIcon,               // Textbooks & Study Materials
  ShoppingBagIcon,            // Apparel & Accessories
  TrophyIcon,                 // Sports & Hobby Gear
  SquaresPlusIcon,            // Other
} from '@heroicons/react/24/outline';

/* -------------------------------------------------------------------------- */
/*  Public props                                                              */
/* -------------------------------------------------------------------------- */
export interface CategoryCardProps {
  categoryName: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  isSelected: boolean;
  onClick: () => void;
}

/* More compact icon size                                                             */
const iconSizeClasses = 'w-5 h-5 sm:w-6 sm:h-6';

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */
const CategoryCard: React.FC<CategoryCardProps> = ({
  categoryName,
  icon: Icon,
  isSelected,
  onClick,
}) => {
  const iconColour = isSelected
    ? 'text-indigo-600 dark:text-indigo-400'
    : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      title={categoryName}
      className={`
        group flex flex-col items-center justify-center
        p-2 sm:p-3                                   /* tighter padding   */
        border-2 rounded-lg
        transition-all duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900
        w-full h-full min-h-[70px] sm:min-h-[90px]    /* shorter height    */
        ${
          isSelected
            ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-slate-700 shadow-lg focus-visible:ring-indigo-500'
            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-md focus-visible:ring-slate-500'
        }
      `}
    >
      <Icon className={`${iconSizeClasses} ${iconColour}`} aria-hidden="true" />

      <span
        className={`
          mt-1 sm:mt-1.5                               /* smaller gap      */
          text-center text-xs font-medium              /* smaller text     */
          transition-colors duration-200 ease-in-out
          ${
            isSelected
              ? 'text-indigo-700 dark:text-indigo-300'
              : 'text-slate-700 dark:text-slate-200 group-hover:text-slate-800 dark:group-hover:text-slate-100'
          }
        `}
      >
        {categoryName}
      </span>
    </button>
  );
};

export default CategoryCard;

/* -------------------------------------------------------------------------- */
/*  Default mapping (matches DB names)                                        */
/* -------------------------------------------------------------------------- */
export const CATEGORIES_WITH_ICONS = [
  { name: 'Electronics & Gadgets',        icon: ComputerDesktopIcon },
  { name: 'Furniture & Dorm Essentials',  icon: HomeModernIcon },
  { name: 'Textbooks & Study Materials',  icon: BookOpenIcon },
  { name: 'Apparel & Accessories',        icon: ShoppingBagIcon },
  { name: 'Sports & Hobby Gear',          icon: TrophyIcon },
  { name: 'Other',                        icon: SquaresPlusIcon },
] as const;