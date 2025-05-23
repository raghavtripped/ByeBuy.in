// src/components/CategoryFilterModal.tsx
'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, type ComponentType, type SVGProps } from 'react'; // Added ComponentType and SVGProps
import CategoryCard from '@/components/CategoryCard';
import { XMarkIcon } from '@heroicons/react/24/outline';

// Define the type for a single category item, matching CATEGORIES_WITH_ICONS_ADJUSTED from ListingsPage
// This ensures the prop type is correct.
export type CategoryItem = {
  readonly name: string;
  // Assuming icons are React components that accept SVG props (like Heroicons)
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
};

interface CategoryFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCategory: string | null;
  onCategorySelect: (categoryName: string) => void;
  onClearFilter: () => void;
  categories: readonly CategoryItem[]; // MODIFIED: Added categories prop
}

export default function CategoryFilterModal({
  isOpen,
  onClose,
  selectedCategory,
  onCategorySelect,
  onClearFilter,
  categories, // MODIFIED: Destructure categories from props
}: CategoryFilterModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50 md:hidden" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-bye-dark-bg-secondary p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold leading-6 text-gray-900 dark:text-bye-dark-text-primary"
                  >
                    Filter by Category
                  </Dialog.Title>
                  <button
                    type="button"
                    className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:text-bye-dark-text-secondary dark:hover:text-bye-dark-text-primary hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                    onClick={onClose}
                    aria-label="Close category filter"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="mt-2 space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {/* MODIFIED: Use the 'categories' prop here */}
                    {categories.map((category) => (
                      <CategoryCard
                        key={category.name}
                        categoryName={category.name}
                        icon={category.icon}
                        isSelected={selectedCategory === category.name}
                        onClick={() => {
                          onCategorySelect(category.name);
                        }}
                      />
                    ))}
                  </div>
                  {selectedCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearFilter();
                      }}
                      className="w-full mt-4 px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary focus:ring-red-500 dark:focus:ring-red-400"
                    >
                      Clear Filter & View All
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}