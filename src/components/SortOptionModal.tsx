'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';

export type SortOption = {
  value: string;
  label: string;
};

interface SortOptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSort: string;
  onSortSelect: (sortValue: string) => void;
  sortOptions: readonly SortOption[];
}

export default function SortOptionModal({
  isOpen,
  onClose,
  selectedSort,
  onSortSelect,
  sortOptions,
}: SortOptionModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-md md:max-w-lg lg:max-w-xl transform overflow-hidden rounded-2xl bg-white dark:bg-bye-dark-bg-secondary p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold leading-6 text-gray-900 dark:text-bye-dark-text-primary"
                  >
                    Sort Listings
                  </Dialog.Title>
                  <button
                    type="button"
                    className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:text-bye-dark-text-secondary dark:hover:text-bye-dark-text-primary hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                    onClick={onClose}
                    aria-label="Close sort modal"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  <div className="flex flex-col gap-2">
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onSortSelect(option.value);
                          onClose();
                        }}
                        className={`flex items-center justify-between w-full px-4 py-3 rounded-xl text-left text-base font-medium transition-colors
                          ${selectedSort === option.value
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 shadow'
                            : 'bg-white dark:bg-bye-dark-bg-primary text-gray-700 dark:text-bye-dark-text-primary border border-gray-200 dark:border-bye-dark-border-primary hover:bg-gray-50 dark:hover:bg-bye-dark-bg-hover'}
                        `}
                      >
                        <span>{option.label}</span>
                        {selectedSort === option.value && (
                          <CheckIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
} 