// src/components/NotificationToast.tsx
import React from 'react';
import { Transition } from '@headlessui/react';
import { Fragment } from 'react';

// Icons from react-icons (already installed)
import { IoCheckmarkCircleOutline } from 'react-icons/io5'; // Success
import { IoWarningOutline } from 'react-icons/io5';       // Warning
import { IoInformationCircleOutline } from 'react-icons/io5'; // Info
import { IoCloseCircleOutline } from 'react-icons/io5';    // Error
import { XMarkIcon } from '@heroicons/react/24/outline';  // Dismiss icon

interface NotificationToastProps {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onDismiss: (id: string) => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ id, message, type, onDismiss }) => {
  const IconComponent =
    type === 'success'
      ? IoCheckmarkCircleOutline
      : type === 'warning'
      ? IoWarningOutline
      : type === 'info'
      ? IoInformationCircleOutline
      : IoCloseCircleOutline;

  const baseClasses = "flex items-center gap-3 p-4 pr-6 rounded-lg shadow-lg border";
  const typeClasses = {
    success: "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/50",
    error: "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/50",
    info: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50",
    warning: "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700/50",
  };

  const iconColor = {
    success: "text-green-600 dark:text-green-400",
    error: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
    warning: "text-yellow-600 dark:text-yellow-400",
  };

  return (
    <Transition
      show={true} // Always show when in the notifications array, Transition will handle its mount/unmount
      as={Fragment}
      enter="transform ease-out duration-300 transition"
      enterFrom="translate-x-full opacity-0"
      enterTo="translate-x-0 opacity-100"
      leave="transition ease-in duration-200 transform"
      leaveFrom="opacity-100 translate-x-0"
      leaveTo="opacity-0 translate-x-full"
    >
      <div className={`${baseClasses} ${typeClasses[type]}`}>
        <IconComponent className={`w-6 h-6 flex-shrink-0 ${iconColor[type]}`} />
        <p className="text-sm font-medium flex-grow">{message}</p>
        <button
          onClick={() => onDismiss(id)}
          className={`p-1 rounded-full ${iconColor[type]} hover:bg-black/10 dark:hover:bg-white/10`}
          aria-label="Dismiss notification"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </Transition>
  );
};

export default NotificationToast;