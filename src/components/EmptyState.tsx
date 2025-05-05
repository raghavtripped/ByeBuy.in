// src/components/EmptyState.tsx

import React from 'react';
import Link from 'next/link';

// Interface defining the component's props.
interface EmptyStateProps {
  message: string; // The message to display when no data is available
  action?: { // Optional action button details
    href: string; // The URL to navigate to when the button is clicked
    text: string; // The text for the action button
  };
  className?: string; // Optional className for adding extra CSS classes to the wrapper
}

export default function EmptyState({ message, action, className = '' }: EmptyStateProps) {
  return (
    <div 
      className={`text-center py-10 px-6 bg-white rounded-lg shadow-sm border border-gray-200 dark:bg-gray-800 dark:border-gray-700 ${className}`} // Container with default styles and dark mode support
    >
      {/* Empty state icon (generic icon, can be replaced with a custom one) */}
      <svg
        className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" // Icon styling (centered, large, gray)
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        {/* Path for a simple "empty box" icon (can be replaced with something more fitting) */}
        <path
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>

      {/* Display the message */}
      <p className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-300">
        {message}
      </p>

      {/* Optional action button */}
      {action && (
        <div className="mt-6">
          <Link
            href={action.href} // Link to the action page
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {action.text} {/* Action button text */}
          </Link>
        </div>
      )}
    </div>
  );
}
