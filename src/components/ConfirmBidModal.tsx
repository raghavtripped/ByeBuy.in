// src/components/ConfirmBidModal.tsx
'use client';

import { MouseEvent } from 'react';
import { formatCurrency } from '@/lib/formatUtils'; // Assuming you have this

interface ConfirmBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  bidAmount: number | null;
  listingTitle: string;
  currentHighestBid: number | null; // Could be 0 if no bids
  minimumBid: number;
  isLoading?: boolean; // To disable confirm button during submission
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
  if (!isOpen || bidAmount === null) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-bid-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 sm:p-8 w-full max-w-md transform transition-all duration-300 ease-in-out scale-100">
        <h2 id="confirm-bid-title" className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mb-4 text-center">
          Confirm Your Bid
        </h2>
        
        <div className="space-y-3 text-sm sm:text-base text-gray-700 dark:text-gray-300 mb-6">
          <p>You are about to place a bid of: 
            <strong className="text-indigo-600 dark:text-indigo-400 text-lg ml-1">{formatCurrency(bidAmount)}</strong>
          </p>
          <p className="truncate">
            For item: <strong className="font-medium">{listingTitle}</strong>
          </p>
          {currentHighestBid && currentHighestBid > 0 ? (
            <p>Current highest bid is: <strong className="font-medium">{formatCurrency(currentHighestBid)}</strong></p>
          ) : (
            <p>Minimum starting bid is: <strong className="font-medium">{formatCurrency(minimumBid)}</strong></p>
          )}
           <p className="mt-1">
            Your bid must be at least <strong className="font-medium">{formatCurrency(Math.max(minimumBid, (currentHighestBid || 0) + 1))}</strong>.
          </p>
        </div>

        <p className="text-center text-gray-600 dark:text-gray-400 mb-6 text-sm">
          Are you sure you want to proceed?
        </p>

        <div className="flex flex-col sm:flex-row-reverse gap-3 sm:gap-4">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Placing Bid...
              </>
            ) : (
              'Confirm Bid'
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-base font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 disabled:opacity-60 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}