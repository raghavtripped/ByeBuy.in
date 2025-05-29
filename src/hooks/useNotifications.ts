// src/hooks/useNotifications.ts
'use client'; // This hook will be used in client components

import { useNotificationStore } from '@/stores/notificationStore'; // Path to your existing Zustand store

// Define the API for showing notifications
interface ShowNotificationParams {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // Optional duration in ms
}

export const useNotifications = () => {
  const addNotification = useNotificationStore(state => state.addNotification);

  const showNotification = ({ message, type, duration }: ShowNotificationParams) => {
    addNotification({ message, type, duration });
  };

  return { showNotification };
};