// ===== Notification Service =====

const NotificationService = {
    currentFilter: 'all',

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
                .limit(50);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
    },

    async createNotification(userId, message, type = 'info', relatedId = null) {
        if (!Storage.isSupabaseActive()) return;

        try {
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

            // Update badge count after creating notification
            await this.updateBadgeCount();
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

            // Update badge count and re-render page
            await this.updateBadgeCount();
            await this.renderNotificationsPage();
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

            // Update badge count and re-render page
            await this.updateBadgeCount();
            await this.renderNotificationsPage();
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    },

    async deleteNotification(notificationId) {
        if (!Storage.isSupabaseActive()) return;

        try {
            const { error } = await window.supabase
                .from('notifications')
                .delete()
                .eq('id', notificationId);

            if (error) throw error;

            // Update badge count and re-render page
            await this.updateBadgeCount();
            await this.renderNotificationsPage();
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    },

    async updateBadgeCount() {
        const notifications = await this.getNotifications();
        const unreadCount = notifications.filter(n => !n.is_read).length;

        // Update sidebar navigation badge
        const navBadge = document.getElementById('notifications-nav-badge');
        if (navBadge) {
            navBadge.textContent = unreadCount;
            navBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }

        // Update footer notification count
        const footerBadge = document.getElementById('notification-count');
        if (footerBadge) {
            footerBadge.textContent = unreadCount;
            footerBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
    },

    async renderNotificationsPage() {
        const notifications = await this.getNotifications();
        const listContainer = document.getElementById('notifications-list');
        const emptyState = document.getElementById('notifications-empty-state');

        if (!listContainer) return;

        // Filter notifications based on current filter
        let filteredNotifications = notifications;
        if (this.currentFilter === 'unread') {
            filteredNotifications = notifications.filter(n => !n.is_read);
        } else if (this.currentFilter === 'read') {
            filteredNotifications = notifications.filter(n => n.is_read);
        }

        // Clear existing notifications (keep empty state)
        const existingCards = listContainer.querySelectorAll('.notification-card');
        existingCards.forEach(card => card.remove());

        // Show/hide empty state
        if (filteredNotifications.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
        } else {
            if (emptyState) emptyState.style.display = 'none';

            // Render each notification
            filteredNotifications.forEach(notification => {
                const card = this.createNotificationCard(notification);
                listContainer.appendChild(card);
            });
        }
    },

    createNotificationCard(notification) {
        const card = document.createElement('div');
        card.className = `notification-card ${notification.is_read ? 'read' : 'unread'}`;
        card.style.cssText = `
            background: ${notification.is_read ? 'var(--bg-secondary)' : 'var(--bg-card)'};
            border: 1px solid ${notification.is_read ? 'var(--border-color)' : 'var(--accent-blue)'};
            border-radius: var(--radius-lg);
            padding: var(--spacing-lg);
            margin-bottom: var(--spacing-md);
            display: flex;
            gap: var(--spacing-md);
            align-items: flex-start;
            transition: var(--transition);
            opacity: ${notification.is_read ? '0.7' : '1'};
        `;

        // Notification icon
        const icon = document.createElement('div');
        icon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px; color: ${notification.is_read ? 'var(--text-muted)' : 'var(--accent-blue)'}; flex-shrink: 0;">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
        `;

        // Notification content
        const content = document.createElement('div');
        content.style.cssText = 'flex: 1;';

        const message = document.createElement('p');
        message.textContent = notification.message;
        message.style.cssText = `
            color: var(--text-primary);
            font-size: 0.9375rem;
            margin-bottom: var(--spacing-xs);
            font-weight: ${notification.is_read ? 'normal' : '500'};
        `;

        const timestamp = document.createElement('p');
        timestamp.textContent = this.formatTimestamp(notification.created_at);
        timestamp.style.cssText = `
            color: var(--text-muted);
            font-size: 0.75rem;
        `;

        content.appendChild(message);
        content.appendChild(timestamp);

        // Actions
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: var(--spacing-sm); align-items: center;';

        if (!notification.is_read) {
            const markReadBtn = document.createElement('button');
            markReadBtn.textContent = 'Mark as Read';
            markReadBtn.style.cssText = `
                padding: var(--spacing-xs) var(--spacing-sm);
                background: transparent;
                border: 1px solid var(--border-color);
                border-radius: var(--radius-sm);
                color: var(--text-secondary);
                font-size: 0.75rem;
                cursor: pointer;
                transition: var(--transition);
            `;
            markReadBtn.addEventListener('click', () => this.markAsRead(notification.id));
            markReadBtn.addEventListener('mouseenter', function () {
                this.style.borderColor = 'var(--accent-blue)';
                this.style.color = 'var(--accent-blue)';
            });
            markReadBtn.addEventListener('mouseleave', function () {
                this.style.borderColor = 'var(--border-color)';
                this.style.color = 'var(--text-secondary)';
            });
            actions.appendChild(markReadBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `;
        deleteBtn.style.cssText = `
            padding: var(--spacing-xs);
            background: transparent;
            border: 1px solid transparent;
            border-radius: var(--radius-sm);
            color: var(--text-muted);
            cursor: pointer;
            transition: var(--transition);
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        deleteBtn.addEventListener('click', () => {
            if (confirm('Delete this notification?')) {
                this.deleteNotification(notification.id);
            }
        });
        deleteBtn.addEventListener('mouseenter', function () {
            this.style.color = 'var(--color-red)';
            this.style.borderColor = 'var(--color-red)';
        });
        deleteBtn.addEventListener('mouseleave', function () {
            this.style.color = 'var(--text-muted)';
            this.style.borderColor = 'transparent';
        });
        actions.appendChild(deleteBtn);

        card.appendChild(icon);
        card.appendChild(content);
        card.appendChild(actions);

        return card;
    },

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

        return date.toLocaleDateString();
    },

    initializeNotificationsPage() {
        // Set up filter buttons
        const filterBtns = document.querySelectorAll('[data-notif-filter]');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                // Update active state
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Update filter and re-render
                this.currentFilter = e.target.dataset.notifFilter;
                await this.renderNotificationsPage();
            });
        });

        // Initial render
        this.renderNotificationsPage();
        this.updateBadgeCount();
    },

    // UI Helper to render notifications dropdown (for footer panel)
    async renderNotificationsDropdown() {
        const notifications = await this.getNotifications();
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
            await this.updateBadgeCount();
        }, interval);
    }
};
