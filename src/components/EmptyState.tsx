// src/components/EmptyState.tsx
import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  message: string;
  action?: { // Optional action button details
    href: string;
    text: string;
  };
  className?: string; // Allow passing additional classes
}

export default function EmptyState({ message, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`text-center py-10 px-6 bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
         {/* Simple icon - replace or enhance if desired */}
         <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="mt-4 text-sm font-medium text-gray-700">{message}</p>
      {action && (
        <div className="mt-6">
          <Link
            href={action.href}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {action.text}
          </Link>
        </div>
      )}
    </div>
  );
}