// src/components/CategoryCard.tsx
import React from 'react';
import {
  ComputerDesktopIcon,
  HomeModernIcon,
  BookOpenIcon,
  ShoppingBagIcon,
  TrophyIcon,
  SquaresPlusIcon,
} from '@heroicons/react/24/outline';

export interface CategoryCardProps {
  categoryName: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  isSelected: boolean;
  onClick: () => void;
}

const iconSizeClasses = 'w-5 h-5 sm:w-6 sm:h-6';

const CategoryCard: React.FC<CategoryCardProps> = ({
  categoryName,
  icon: Icon,
  isSelected,
  onClick,
}) => {
  // Updated iconColour for new dark mode text colors
  const iconColour = isSelected
    ? 'text-indigo-600 dark:text-indigo-400' // Selected icon uses Indigo accent
    : 'text-slate-500 dark:text-bye-dark-text-secondary group-hover:text-slate-600 dark:group-hover:text-bye-dark-text-primary'; // Default/hover uses new dark text

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      title={categoryName}
      className={`
        group flex flex-col items-center justify-center
        p-2 sm:p-3
        border-2 rounded-lg
        transition-all duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-bye-dark-bg-primary
        w-full h-full min-h-[70px] sm:min-h-[90px]
        ${
          isSelected
            ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-bye-dark-bg-hover shadow-lg focus-visible:ring-indigo-500' // Selected state: Indigo border, subtle dark bg (bye-dark-bg-hover)
            : 'border-slate-200 dark:border-bye-dark-border-primary bg-white dark:bg-bye-dark-bg-secondary hover:border-slate-300 dark:hover:border-bye-dark-border-primary dark:hover:bg-bye-dark-bg-hover hover:shadow-md focus-visible:ring-slate-500 dark:focus-visible:ring-bye-dark-text-secondary' // Default state: new dark bg and border
        }
      `}
    >
      <Icon className={`${iconSizeClasses} ${iconColour}`} aria-hidden="true" />

      {/* Updated span text colors for new dark mode */}
      <span
        className={`
          mt-1 sm:mt-1.5
          text-center text-xs font-medium
          transition-colors duration-200 ease-in-out
          ${
            isSelected
              ? 'text-indigo-700 dark:text-indigo-300' // Selected text uses Indigo accent (lighter shade for dark)
              : 'text-slate-700 dark:text-bye-dark-text-primary group-hover:text-slate-800 dark:group-hover:text-bye-dark-text-primary' // Default/hover uses new dark primary text
          }
        `}
      >
        {categoryName}
      </span>
    </button>
  );
};

export default CategoryCard;

export const CATEGORIES_WITH_ICONS = [
  { name: 'Electronics & Gadgets',        icon: ComputerDesktopIcon },
  { name: 'Furniture & Dorm Essentials',  icon: HomeModernIcon },
  { name: 'Textbooks & Study Materials',  icon: BookOpenIcon },
  { name: 'Apparel & Accessories',        icon: ShoppingBagIcon },
  { name: 'Sports & Hobby Gear',          icon: TrophyIcon },
  { name: 'Other',                        icon: SquaresPlusIcon },
] as const;