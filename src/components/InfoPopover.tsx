import { Popover, Transition } from '@headlessui/react';
import { HelpCircle } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';

interface InfoPopoverProps {
  title?: string; // Optional title for the popover panel
  content: React.ReactNode; // The main help text/content
  iconSize?: string; // e.g., 'w-4 h-4', defaults to 'w-5 h-5'
  panelWidth?: string; // e.g., 'w-64', 'w-72', 'max-w-xs', defaults to 'w-72 max-w-[calc(100vw-2rem)]'
  panelPlacement?: 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';
  className?: string; // For the root Popover div
}

export default function InfoPopover({ 
  title, 
  content, 
  iconSize = 'w-5 h-5', 
  panelWidth = 'w-72 max-w-[calc(100vw-2rem)]',
  panelPlacement = 'bottom-start',
  className 
}: InfoPopoverProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle escape key for mobile
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Enhanced mobile-aware positioning
  const getPanelPositionClasses = () => {
    if (isMobile) {
      return 'fixed inset-0 flex items-center justify-center z-50 p-4';
    }

    const baseClasses = 'absolute z-50';
    
    switch (panelPlacement) {
      case 'bottom-start':
        return `${baseClasses} left-0 mt-2`;
      case 'bottom-end':
        return `${baseClasses} right-0 mt-2`;
      case 'top-start':
        return `${baseClasses} left-0 bottom-full mb-2`;
      case 'top-end':
        return `${baseClasses} right-0 bottom-full mb-2`;
      case 'left':
        return `${baseClasses} right-full mr-2 top-1/2 -translate-y-1/2`;
      case 'right':
        return `${baseClasses} left-full ml-2 top-1/2 -translate-y-1/2`;
      default:
        return `${baseClasses} left-0 mt-2`;
    }
  };

  // Get panel width classes based on mobile state
  const getPanelWidthClasses = () => {
    if (isMobile) {
      return 'w-full max-w-sm mx-auto';
    }
    return panelWidth;
  };

  return (
    <Popover className={`relative inline-flex items-center ${className || ''}`}>
      {({ open }) => {
        // Sync internal state with Headless UI open state
        if (open !== isOpen) setIsOpen(open);
        
        return (
          <>
            <Popover.Button
              className={`group p-1.5 -m-1.5 rounded-full outline-none
                         text-gray-400 dark:text-bye-dark-text-secondary 
                         hover:text-indigo-600 dark:hover:text-indigo-400
                         focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400
                         focus-visible:ring-offset-2 dark:focus-visible:ring-offset-bye-dark-bg-primary
                         transition-all duration-200 touch-manipulation`}
              aria-label={title || "More information"}
            >
              <HelpCircle 
                className={`${iconSize} transition-transform duration-200
                           group-hover:scale-110 group-focus-visible:scale-110`}
                strokeWidth={2}
              />
            </Popover.Button>

            <Transition
              as={Fragment}
              show={isOpen}
              enter="transition ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transition ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Popover.Panel 
                className={`${getPanelPositionClasses()} ${getPanelWidthClasses()}
                           bg-white dark:bg-bye-dark-bg-secondary 
                           border border-gray-200 dark:border-bye-dark-border-primary 
                           rounded-xl shadow-xl focus:outline-none
                           overflow-hidden`}
                static
              >
                {({ close }) => (
                  <div className="relative">
                    {/* Mobile backdrop */}
                    {isMobile && (
                      <div 
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm -z-10"
                        onClick={() => close()}
                        aria-hidden="true"
                      />
                    )}

                    <div className={`p-4 ${isMobile ? 'p-5' : 'p-4'}`}>
                      {/* Mobile close button */}
                      {isMobile && (
                        <button
                          onClick={() => close()}
                          className="absolute top-4 right-4 p-2 rounded-full
                                   text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200
                                   focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                                   transition-colors"
                          aria-label="Close"
                        >
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}

                      {title && (
                        <h4 className={`font-semibold mb-2 pr-8
                                     text-gray-900 dark:text-bye-dark-text-primary
                                     ${isMobile ? 'text-base' : 'text-sm'}`}>
                          {title}
                        </h4>
                      )}
                      
                      <div className={`space-y-2 text-gray-600 dark:text-bye-dark-text-secondary
                                    ${isMobile ? 'text-base leading-relaxed' : 'text-sm'}`}>
                        {content}
                      </div>
                    </div>
                  </div>
                )}
              </Popover.Panel>
            </Transition>
          </>
        );
      }}
    </Popover>
  );
} 