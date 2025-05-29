// src/components/NotificationProvider.tsx
'use client';

import React from 'react';
import NotificationToast from '@/components/NotificationToast'; // Path to your toast component
import { useNotificationStore } from '@/stores/notificationStore'; // Path to your store

const NotificationProvider: React.FC = () => {
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 max-w-xs w-full pointer-events-none">
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto"> {/* Re-enable pointer events for the toast itself */}
          <NotificationToast
            id={notification.id}
            message={notification.message}
            type={notification.type}
            onDismiss={removeNotification}
          />
        </div>
      ))}
    </div>
  );
};

export default NotificationProvider;