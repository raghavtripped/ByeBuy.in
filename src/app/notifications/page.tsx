'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, type User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import Link from 'next/link';

interface Notification {
  id: string;
  created_at: string;
  message: string;
  type: 'bid' | 'listing' | 'system';
  read: boolean;
  user_id: string;
  link?: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session || !session.user) {
        router.push('/auth?redirect=/notifications');
        return;
      }
      setUser(session.user);
      await fetchNotifications(session.user.id);
      setLoading(false);
    };
    checkUser();
  }, [router]);

  const fetchNotifications = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data);
    }
  };

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from('user_notifications')
      .update({ read: true })
      .eq('id', notificationId);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message="Loading notifications..." />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white dark:bg-bye-dark-bg-primary">
        <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Notifications
          </h1>
          <p className="text-gray-600 dark:text-bye-dark-text-secondary mb-6">
            Please log in to view your notifications
          </p>
          <Link
            href="/auth?redirect=/notifications"
            className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-bye-dark-bg-primary transition-all duration-200"
          >
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-bye-dark-bg-primary">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Notifications
        </h1>

        {notifications.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-bye-dark-bg-secondary rounded-lg border border-gray-200 dark:border-bye-dark-border-primary">
            <p className="text-gray-600 dark:text-bye-dark-text-secondary">
              No notifications yet
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg border cursor-pointer transition-colors duration-200 ${
                  notification.read
                    ? 'bg-gray-50 dark:bg-bye-dark-bg-secondary border-gray-200 dark:border-bye-dark-border-primary'
                    : 'bg-indigo-50 dark:bg-indigo-900/25 border-indigo-200 dark:border-indigo-700/50'
                }`}
                onClick={() => {
                  if (!notification.read) {
                    markAsRead(notification.id);
                  }
                  if (notification.link) {
                    router.push(notification.link);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-grow">
                    <p className={`text-sm ${
                      notification.read
                        ? 'text-gray-600 dark:text-bye-dark-text-secondary'
                        : 'text-gray-900 dark:text-bye-dark-text-primary font-medium'
                    }`}>
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mt-1">
                      {new Date(notification.created_at).toLocaleDateString()} at{' '}
                      {new Date(notification.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                  {!notification.read && (
                    <span className="h-2 w-2 bg-indigo-600 dark:bg-indigo-400 rounded-full"></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
