'use client';

import { Fragment, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Popover, Transition } from '@headlessui/react';
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  FunnelIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';

type SortOptionValue = 'created_at_desc' | 'end_time_asc' | 'price_asc' | 'price_desc' | 'bid_count_desc';

interface SortOption {
  value: SortOptionValue;
  label: string;
}

import type { ComponentType, SVGProps } from 'react';

interface CategoryItem {
  readonly name: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface IntegratedSearchBarProps {
  // Search
  searchInput: string;
  setSearchInput: (value: string) => void;
  onSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  
  // Category
  selectedCategory: string | null;
  onCategoryChange: (categoryName: string | null) => void;
  categoriesData: readonly CategoryItem[];
  
  // Sort
  selectedSort: SortOptionValue;
  onSortChange: (sortValue: SortOptionValue) => void;
  sortOptionsData: readonly SortOption[];
}

// Portal component for dropdowns
function PortalDropdown({ children, show, buttonRef, onClose }: { 
  children: React.ReactNode; 
  show: boolean; 
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onClose?: () => void;
}) {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (show && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 8, // 8px gap
        left: rect.right - 280 + window.scrollX, // Align to right edge, 280px dropdown width
        width: rect.width
      });
    }
  }, [show, buttonRef]);

  // Handle click outside
  useEffect(() => {
    if (!show) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show, onClose, buttonRef]);

  if (!show) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        zIndex: 9999,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

export default function IntegratedSearchBar({
  searchInput,
  setSearchInput,
  onSearchSubmit,
  selectedCategory,
  onCategoryChange,
  categoriesData,
  selectedSort,
  onSortChange,
  sortOptionsData,
}: IntegratedSearchBarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);

  const currentSortLabel = sortOptionsData.find((s) => s.value === selectedSort)?.label || 'Sort by';

  return (
    <div className={`flex items-center w-full bg-white/95 dark:bg-bye-dark-bg-secondary/95 backdrop-blur-sm shadow-xl rounded-2xl p-1.5 sm:p-2 space-x-1 sm:space-x-2 border border-gray-200/50 dark:border-bye-dark-border-primary/50 transition-all duration-300 ${
      searchFocused ? 'ring-2 ring-indigo-500/30 dark:ring-indigo-400/30 shadow-2xl' : ''
    }`}>
      {/* Search Input Section */}
      <form onSubmit={onSearchSubmit} className="flex-grow flex items-center min-w-0">
        <div className="flex items-center pl-3 pr-2">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search by title or description..."
          className="w-full bg-transparent focus:outline-none py-2.5 text-sm sm:text-base text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-500 dark:placeholder-bye-dark-text-secondary min-w-0"
        />
      </form>

      {/* Vertical Separator */}
      <div className="h-8 w-px bg-gray-200 dark:bg-bye-dark-border-primary hidden sm:block"></div>

      {/* Category Filter Pill */}
      <Popover className="relative">
        {({ open, close }) => (
          <>
            <Popover.Button
              ref={categoryButtonRef}
              className={`flex items-center space-x-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all duration-200 whitespace-nowrap
                ${selectedCategory 
                  ? 'bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-700/40 dark:to-purple-700/40 text-indigo-700 dark:text-indigo-200 hover:from-indigo-200 hover:to-purple-200 dark:hover:from-indigo-700/60 dark:hover:to-purple-700/60 ring-1 ring-indigo-200 dark:ring-indigo-600/50'
                  : 'bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-primary hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
            >
              <FunnelIcon className="h-4 w-4 hidden sm:inline-block" />
              <span className="truncate max-w-[80px] sm:max-w-[120px]">
                {selectedCategory ? selectedCategory : 'Category'}
              </span>
              <ChevronDownIcon className={`h-4 w-4 transform transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </Popover.Button>
            
            <PortalDropdown show={open} buttonRef={categoryButtonRef} onClose={close}>
              <Transition
                as={Fragment}
                show={open}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1 scale-95"
                enterTo="opacity-100 translate-y-0 scale-100"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0 scale-100"
                leaveTo="opacity-0 translate-y-1 scale-95"
              >
                <div className="w-64 sm:w-72 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-xl shadow-2xl p-3">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-bye-dark-text-primary">Filter by Category</h3>
                    {selectedCategory && (
                      <button
                        onClick={() => { onCategoryChange(null); close(); }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    <button
                      onClick={() => { onCategoryChange(null); close(); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover ${
                        !selectedCategory 
                          ? 'font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' 
                          : 'text-gray-700 dark:text-bye-dark-text-secondary'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span>🏷️</span>
                        <span>All Categories</span>
                      </div>
                    </button>
                    {categoriesData.map((cat, index) => {
                      const IconComponent = cat.icon;
                      return (
                        <button
                          key={cat.name + index}
                          onClick={() => { onCategoryChange(cat.name); close(); }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover ${
                            selectedCategory === cat.name 
                              ? 'font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' 
                              : 'text-gray-700 dark:text-bye-dark-text-secondary'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <IconComponent className="w-4 h-4" />
                            <span>{cat.name}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Transition>
            </PortalDropdown>
          </>
        )}
      </Popover>

      {/* Sort Pill */}
      <Popover className="relative">
        {({ open, close }) => (
          <>
            <Popover.Button
              ref={sortButtonRef}
              className={`flex items-center space-x-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all duration-200 whitespace-nowrap
                bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-primary hover:bg-gray-200 dark:hover:bg-slate-600
              `}
            >
              <AdjustmentsHorizontalIcon className="h-4 w-4 hidden sm:inline-block" />
              <span className="truncate max-w-[80px] sm:max-w-[120px]">
                <span className="hidden sm:inline">Sort: </span>{currentSortLabel.replace('Sort: ', '')}
              </span>
              <ChevronDownIcon className={`h-4 w-4 transform transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </Popover.Button>
            
            <PortalDropdown show={open} buttonRef={sortButtonRef} onClose={close}>
              <Transition
                as={Fragment}
                show={open}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1 scale-95"
                enterTo="opacity-100 translate-y-0 scale-100"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0 scale-100"
                leaveTo="opacity-0 translate-y-1 scale-95"
              >
                <div className="w-56 sm:w-64 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-xl shadow-2xl p-3">
                   <h3 className="text-sm font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-3">Sort by</h3>
                  <div className="space-y-1">
                    {sortOptionsData.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { onSortChange(opt.value); close(); }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover ${
                          selectedSort === opt.value 
                            ? 'font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' 
                            : 'text-gray-700 dark:text-bye-dark-text-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Transition>
            </PortalDropdown>
          </>
        )}
      </Popover>
    </div>
  );
} 