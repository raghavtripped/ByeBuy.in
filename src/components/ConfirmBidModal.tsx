// src/components/ConfirmBidModal.tsx
'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useRef } from 'react';
import { formatCurrency } from '@/lib/formatUtils';

interface ConfirmBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  bidAmount: number | null;
  listingTitle: string;
  currentHighestBid: number | null;
  minimumBid: number;
  isLoading?: boolean;
}

export default function ConfirmBidModal({
  isOpen,
  onClose,
  onConfirm,
  bidAmount,
  listingTitle,
  currentHighestBid,
  minimumBid,
  isLoading = false,
}: ConfirmBidModalProps) {
  const confirmButtonRef = useRef(null);

  if (bidAmount === null || bidAmount === undefined) {
    return null;
  }

  const currentTopBid = currentHighestBid ?? 0;
  const bidIncrease = currentTopBid > 0 ? bidAmount - currentTopBid : 0;
  const percentIncrease = currentTopBid > 0 ? Math.round(((bidAmount - currentTopBid) / currentTopBid) * 100) : 0;
  
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog 
        as="div" 
        className="relative z-50" 
        onClose={isLoading ? () => {} : onClose} 
        initialFocus={confirmButtonRef} 
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          {/* Updated backdrop overlay for dark mode */}
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm dark:bg-black/75" aria-hidden="true" />
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
              {/* Updated Dialog.Panel background for dark mode */}
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl bg-white dark:bg-bye-dark-bg-secondary p-6 text-left align-middle shadow-xl transition-all">
                {/* Updated Dialog.Title text color for dark mode */}
                <Dialog.Title 
                  as="h3" 
                  id="confirm-bid-title"
                  className="text-lg sm:text-xl font-semibold leading-6 text-gray-900 dark:text-bye-dark-text-primary text-center"
                >
                  Confirm Your Bid
                </Dialog.Title>
                
                {bidAmount !== null && ( 
                  <>
                    <div className="mt-4">
                      {/* Updated descriptive text colors for dark mode */}
                      <p className="text-sm text-gray-600 dark:text-bye-dark-text-secondary mb-4">
                        {`You're about to place a bid on `}
                        <span className="font-medium text-gray-800 dark:text-bye-dark-text-primary break-words">
                          {`"${listingTitle}"`}
                        </span>
                        {`.`}
                      </p>
                      
                      {/* Updated info box background, border, and text colors for dark mode */}
                      <div className="bg-gray-50 dark:bg-bye-dark-bg-hover rounded-lg p-4 mb-4 border border-gray-200 dark:border-bye-dark-border-primary">
                        <p className="text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary mb-1">Your bid amount:</p>
                        {/* Ensure Indigo accent contrasts well */}
                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(bidAmount)}</p>
                        
                        {currentTopBid > 0 && (
                          // Updated divider border and text colors in this sub-section
                          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-bye-dark-border-primary opacity-75 dark:opacity-100">
                            <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">
                              {bidIncrease > 0 ? (
                                <>
                                  This is <span className="font-medium text-green-600 dark:text-green-400"> {/* Ensure green contrasts */}
                                    +{formatCurrency(bidIncrease)}
                                  </span> 
                                  {percentIncrease > 0 && (
                                    <span className="ml-1">
                                      ({percentIncrease}% above current highest bid of {formatCurrency(currentTopBid)})
                                    </span>
                                  )}
                                  {percentIncrease === 0 && bidIncrease > 0 && (
                                    <span className="ml-1">
                                      (above current highest bid of {formatCurrency(currentTopBid)})
                                    </span>
                                  )}
                                </>
                              ) : bidIncrease === 0 ? ( // Ensure yellow contrasts
                                <span className="text-yellow-600 dark:text-yellow-400">Matches current highest bid of {formatCurrency(currentTopBid)}</span>
                              ) : ( // Ensure red contrasts
                                <span className="text-red-600 dark:text-red-400">Below current highest bid of {formatCurrency(currentTopBid)}</span>
                              )}
                            </p>
                          </div>
                        )}
                        {currentTopBid === 0 && (
                            // Updated divider border and text colors
                            <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mt-2 pt-2 border-t border-gray-200 dark:border-bye-dark-border-primary opacity-75 dark:opacity-100">
                                This will be the first bid, starting at {formatCurrency(minimumBid)}.
                            </p>
                        )}
                      </div>
                      
                      {/* Updated disclaimer text color for dark mode */}
                      <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary opacity-80 mb-6">
                        By confirming, you commit to purchasing this item for your bid amount if you are the winner when the auction ends. This action is binding.
                      </p>
                    </div>

                    <div className="mt-6 flex flex-col sm:flex-row-reverse gap-3">
                      {/* Confirm button: Ensure Indigo accent and text contrast well */}
                      <button
                        type="button"
                        ref={confirmButtonRef}
                        className="w-full inline-flex justify-center rounded-md border border-transparent bg-indigo-600 dark:bg-indigo-500 px-4 py-2 text-sm font-medium text-white dark:text-gray-100 hover:bg-indigo-700 dark:hover:bg-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-bye-dark-bg-secondary disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={onConfirm}
                        disabled={isLoading || bidAmount === null}
                      >
                        {isLoading ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Processing...
                          </span>
                        ) : (
                          'Yes, Confirm Bid'
                        )}
                      </button>
                      {/* Cancel button: Updated background, border, and text colors for dark mode */}
                      <button
                        type="button"
                        className="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-bye-dark-border-primary bg-white dark:bg-bye-dark-bg-hover px-4 py-2 text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary hover:bg-gray-50 dark:hover:bg-opacity-75 dark:hover:bg-bye-dark-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:focus-visible:ring-bye-dark-text-secondary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-bye-dark-bg-secondary disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={onClose}
                        disabled={isLoading}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}