// src/components/LoadingSpinner.tsx
import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'; // Optional size prop
  message?: string; // Optional message below spinner
}

export default function LoadingSpinner({ size = 'md', message }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
  };

  return (
    // Updated default text color for the container (affects message if not overridden)
    <div className="flex flex-col items-center justify-center py-10 text-gray-500 dark:text-bye-dark-text-secondary">
      <svg
        // Updated spinner color for dark mode (using Indigo accent)
        className={`animate-spin text-indigo-600 dark:text-indigo-400 ${sizeClasses[size]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor" // Inherits the text-indigo color
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor" // Inherits the text-indigo color
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      {/* Message text color will inherit from the parent div's dark:text-bye-dark-text-secondary */}
      {message && <p className="mt-3 text-sm">{message}</p>}
    </div>
  );
}