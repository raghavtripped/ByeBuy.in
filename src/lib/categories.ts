// src/lib/categories.ts
import {
  ComputerDesktopIcon,
  HomeModernIcon,
  BookOpenIcon,
  ShoppingBagIcon,
  TrophyIcon,
  SquaresPlusIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType, SVGProps } from 'react';

// Define the type for a category item
export type CategoryItem = {
  readonly name: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const CATEGORIES_DATA: readonly CategoryItem[] = [
  { name: "Electronics & Gadgets",     icon: ComputerDesktopIcon },
  { name: "Furniture & Dorm Essentials", icon: HomeModernIcon },
  { name: "Textbooks & Study Materials", icon: BookOpenIcon },
  { name: "Apparel & Accessories",       icon: ShoppingBagIcon },
  { name: "Sports & Hobby Gear",         icon: TrophyIcon },
  { name: "Other",                       icon: SquaresPlusIcon },
] as const;