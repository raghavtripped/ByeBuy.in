'use client';

import { useState, useEffect } from 'react';
import {
  FacebookShareButton,
  TwitterShareButton,
  WhatsappShareButton,
  FacebookIcon,
  TwitterIcon,
  WhatsappIcon,
} from 'react-share';
import { LinkIcon } from '@heroicons/react/24/outline';
import { useNotificationStore } from '@/stores/notificationStore';

interface ShareButtonsProps {
  title: string;
  className?: string;
}

export default function ShareButtons({ title, className = '' }: ShareButtonsProps) {
  const [shareUrl, setShareUrl] = useState('');
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(window.location.href);
    }
  }, []);

  const shareTitle = `Check out this listing on ByeBuy: ${title}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      addNotification({ message: 'Link copied to clipboard!', type: 'success' });
    } catch (err) {
      console.error('Failed to copy:', err);
      addNotification({ message: 'Failed to copy link.', type: 'error' });
    }
  };

  if (!shareUrl) return null;

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <WhatsappShareButton url={shareUrl} title={shareTitle} separator=":: ">
        <WhatsappIcon size={32} round />
      </WhatsappShareButton>

      <TwitterShareButton url={shareUrl} title={shareTitle}>
        <TwitterIcon size={32} round />
      </TwitterShareButton>

      <FacebookShareButton url={shareUrl} hashtag="#ByeBuyAuction">
        <FacebookIcon size={32} round />
      </FacebookShareButton>
      
      <button 
        onClick={handleCopyLink}
        title="Copy link"
        className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover transition-colors"
      >
        <LinkIcon className="w-5 h-5 text-gray-500 dark:text-bye-dark-text-secondary" />
      </button>
    </div>
  );
} 