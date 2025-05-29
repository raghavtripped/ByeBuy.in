// src/stores/notificationStore.ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid'; // For unique IDs. Install if not already: npm install uuid

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // Milliseconds, defaults to 5000 (5 seconds)
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  addNotification: (notification) => {
    const id = uuidv4();
    const newNotification = { ...notification, id };
    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    const duration = newNotification.duration ?? 5000;
    
    // Auto-remove notification after its duration
    setTimeout(() => {
      get().removeNotification(id);
    }, duration);
  },
  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));