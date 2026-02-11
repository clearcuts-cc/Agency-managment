// ===== Notification Service =====

const NotificationService = {
    async getNotifications() {
        if (!Storage.isSupabaseActive()) return [];

        try {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser) return [];

            const { data, error } = await window.supabase
                .from('notifications')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
    },

    async createNotification(userId, message, type = 'info', relatedId = null) {
        if (!Storage.isSupabaseActive()) return;

        try {
            // If userId is 'admin', we need to find all admins (in a real app).
            // For now, let's assume specific user targeting or simple logging.

            const { error } = await window.supabase
                .from('notifications')
                .insert([{
                    user_id: userId,
                    message,
                    type,
                    related_id: relatedId,
                    is_read: false
                }]);

            if (error) throw error;
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    },

    async markAsRead(notificationId) {
        if (!Storage.isSupabaseActive()) return;

        try {
            const { error } = await window.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId);

            if (error) throw error;
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    },

    async markAllAsRead() {
        if (!Storage.isSupabaseActive()) return;

        try {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser) return;

            const { error } = await window.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', currentUser.id)
                .eq('is_read', false);

            if (error) throw error;
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    },

    // UI Helper to render notifications
    async renderNotificationsDropdown() {
        const notifications = await this.getNotifications();
        // (Implementation dependent on UI structure, usually populates a dropdown)
        // I will implement the DOM manipulation in App.js or similar
        return notifications;
    },

    // Check for new notifications (Polling)
    startPolling(callback, interval = 30000) {
        if (!Storage.isSupabaseActive()) return;

        setInterval(async () => {
            const notifications = await this.getNotifications();
            const unread = notifications.filter(n => !n.is_read);
            if (unread.length > 0) {
                callback(unread);
            }
        }, interval);
    }
};
