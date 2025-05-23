// src/components/EmptyState.tsx

import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  message: string;
  action?: {
    href: string;
    text: string;
  };
  className?: string;
}

export default function EmptyState({ message, action, className = '' }: EmptyStateProps) {
  return (
    // Updated container background, border for dark mode
    <div 
      className={`text-center py-10 px-6 bg-white dark:bg-bye-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-bye-dark-border-primary ${className}`}
    >
      {/* Updated icon color for dark mode */}
      <svg
        className="mx-auto h-12 w-12 text-gray-400 dark:text-bye-dark-text-secondary opacity-75" // Made icon slightly more subtle
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>

      {/* Updated message text color for dark mode */}
      <p className="mt-4 text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">
        {message}
      </p>

      {action && (
        <div className="mt-6">
          {/* Updated action button for dark mode (focus ring offset and potentially bg/hover if needed) */}
          <Link
            href={action.href}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary focus:ring-indigo-500 dark:focus:ring-indigo-400"
            // Note: dark:text-gray-100 can be added if needed for button text, but white usually works on indigo-500
          >
            {action.text}
          </Link>
        </div>
      )}
    </div>
  );
}