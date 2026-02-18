// ===== Notification Service =====

const NotificationService = {
    currentFilter: 'all',
    _dismissedSmartKey: 'clearcut_dismissed_smart_notifications',

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
        try {
            const notifications = await this.getNotifications();
            const unreadDbCount = notifications.filter(n => !n.is_read).length;

            // Include smart notifications in the count
            // These are always "unread" until dismissed or resolved
            const smartNotifications = await this.generateSmartNotifications();
            const smartCount = smartNotifications.length;

            const totalUnread = unreadDbCount + smartCount;

            // Update sidebar navigation badge
            const navBadge = document.getElementById('notifications-nav-badge');
            if (navBadge) {
                navBadge.textContent = totalUnread;
                navBadge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
            }

            // Update footer notification count
            const footerBadge = document.getElementById('notification-count');
            if (footerBadge) {
                footerBadge.textContent = totalUnread;
                footerBadge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
            }
        } catch (error) {
            console.error('Error updating badge count:', error);
        }
    },

    async renderNotificationsPage() {
        const dbNotifications = await this.getNotifications();
        const smartNotifications = await this.generateSmartNotifications();
        const listContainer = document.getElementById('notifications-list');
        const emptyState = document.getElementById('notifications-empty-state');

        if (!listContainer) return;

        // Combine all notifications
        let allNotifications = [];

        // Add smart notifications (at the top)
        smartNotifications.forEach(sn => {
            allNotifications.push({
                ...sn,
                _isSmart: true
            });
        });

        // Add DB notifications
        dbNotifications.forEach(n => {
            allNotifications.push({
                ...n,
                _isSmart: false
            });
        });

        // Filter based on current filter
        let filtered = allNotifications;
        if (this.currentFilter === 'smart') {
            filtered = allNotifications.filter(n => n._isSmart);
        } else if (this.currentFilter === 'unread') {
            filtered = allNotifications.filter(n => n._isSmart || !n.is_read);
        } else if (this.currentFilter === 'read') {
            filtered = allNotifications.filter(n => !n._isSmart && n.is_read);
        }

        // Clear existing notifications (keep empty state)
        const existingCards = listContainer.querySelectorAll('.notification-card');
        existingCards.forEach(card => card.remove());

        // Show/hide empty state
        if (filtered.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
        } else {
            if (emptyState) emptyState.style.display = 'none';

            filtered.forEach(notification => {
                if (notification._isSmart) {
                    const card = this.createSmartNotificationCard(notification);
                    listContainer.appendChild(card);
                } else {
                    const card = this.createNotificationCard(notification);
                    listContainer.appendChild(card);
                }
            });
        }
    },

    // ===== Smart Notification System =====
    async generateSmartNotifications() {
        const currentUser = Auth.getCurrentUser();
        if (!currentUser) return [];

        const isAdmin = currentUser.role && currentUser.role.toLowerCase() === 'admin';
        let tasks = await Storage.getTasks();

        // Employees see only their tasks
        if (!isAdmin) {
            tasks = tasks.filter(t => (t.assignee_id || t.assigneeId) === currentUser.id);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const todayStr = today.toISOString().split('T')[0];

        const dismissed = this._getDismissedSmartIds();
        const notifications = [];

        tasks.forEach(task => {
            if (task.status === 'Done') return;

            const deadline = task.deadline ? new Date(task.deadline) : null;
            if (!deadline) return;
            deadline.setHours(0, 0, 0, 0);

            const deadlineStr = deadline.toISOString().split('T')[0];

            // Overdue tasks
            if (deadline < today) {
                const smartId = `overdue_${task.id}_${todayStr}`;
                if (!dismissed.includes(smartId)) {
                    const daysOverdue = Math.ceil((today - deadline) / 86400000);
                    notifications.push({
                        id: smartId,
                        message: `⚠️ "${task.title}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue (deadline: ${deadlineStr})`,
                        type: 'overdue',
                        severity: 'danger',
                        taskId: task.id,
                        created_at: new Date().toISOString()
                    });
                }
            }

            // Due today
            if (deadlineStr === todayStr) {
                const smartId = `due_today_${task.id}_${todayStr}`;
                if (!dismissed.includes(smartId)) {
                    notifications.push({
                        id: smartId,
                        message: `📅 "${task.title}" is due today! Status: ${task.status}`,
                        type: 'due_today',
                        severity: 'warning',
                        taskId: task.id,
                        created_at: new Date().toISOString()
                    });
                }
            }

            // Pending from yesterday (still not done)
            if (task.status === 'Pending') {
                const smartId = `pending_reminder_${task.id}_${todayStr}`;
                if (!dismissed.includes(smartId)) {
                    notifications.push({
                        id: smartId,
                        message: `🔔 "${task.title}" is still pending. Consider starting this task.`,
                        type: 'pending_reminder',
                        severity: 'info',
                        taskId: task.id,
                        created_at: new Date().toISOString()
                    });
                }
            }
        });

        return notifications;
    },

    _getDismissedSmartIds() {
        try {
            return JSON.parse(localStorage.getItem(this._dismissedSmartKey) || '[]');
        } catch {
            return [];
        }
    },

    _dismissSmartNotification(smartId) {
        const dismissed = this._getDismissedSmartIds();
        if (!dismissed.includes(smartId)) {
            dismissed.push(smartId);
            localStorage.setItem(this._dismissedSmartKey, JSON.stringify(dismissed));
        }
    },

    _clearAllDismissed() {
        localStorage.removeItem(this._dismissedSmartKey);
    },

    createSmartNotificationCard(notification) {
        const card = document.createElement('div');
        card.className = 'notification-card smart-notification';

        const severityColors = {
            danger: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)', icon: '#EF4444' },
            warning: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.3)', icon: '#F59E0B' },
            info: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.3)', icon: '#3B82F6' }
        };
        const colors = severityColors[notification.severity] || severityColors.info;

        card.style.cssText = `
            background: ${colors.bg};
            border: 1px solid ${colors.border};
            border-radius: var(--radius-lg);
            padding: var(--spacing-lg);
            margin-bottom: var(--spacing-md);
            display: flex;
            gap: var(--spacing-md);
            align-items: flex-start;
            transition: var(--transition);
        `;

        // Smart badge
        const badge = document.createElement('div');
        badge.innerHTML = '⚡';
        badge.style.cssText = `font-size: 1.25rem; flex-shrink: 0; line-height: 1.5;`;

        const content = document.createElement('div');
        content.style.cssText = 'flex: 1;';

        const msg = document.createElement('p');
        msg.textContent = notification.message;
        msg.style.cssText = `color: var(--text-primary); font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem;`;

        const label = document.createElement('span');
        label.textContent = 'Smart Alert';
        label.style.cssText = `font-size: 0.6875rem; color: ${colors.icon}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;`;

        content.appendChild(msg);
        content.appendChild(label);

        // Dismiss button
        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = '✕';
        dismissBtn.title = 'Dismiss';
        dismissBtn.style.cssText = `
            background: transparent; border: none; color: var(--text-muted); font-size: 1rem;
            cursor: pointer; padding: 0.25rem; line-height: 1; border-radius: 4px;
            transition: all 0.2s;
        `;
        dismissBtn.addEventListener('click', () => {
            this._dismissSmartNotification(notification.id);
            card.style.opacity = '0';
            card.style.transform = 'translateX(20px)';
            setTimeout(() => {
                card.remove();
                // Check if empty
                const listContainer = document.getElementById('notifications-list');
                const emptyState = document.getElementById('notifications-empty-state');
                if (listContainer && listContainer.querySelectorAll('.notification-card').length === 0 && emptyState) {
                    emptyState.style.display = 'block';
                }
            }, 300);
        });
        dismissBtn.addEventListener('mouseenter', function () { this.style.color = '#EF4444'; });
        dismissBtn.addEventListener('mouseleave', function () { this.style.color = 'var(--text-muted)'; });

        card.appendChild(badge);
        card.appendChild(content);
        card.appendChild(dismissBtn);

        return card;
    },

    async clearAllNotifications() {
        // Dismiss all smart notifications
        const smartNotifications = await this.generateSmartNotifications();
        smartNotifications.forEach(sn => {
            this._dismissSmartNotification(sn.id);
        });

        // Delete all DB notifications
        if (Storage.isSupabaseActive()) {
            try {
                const currentUser = Auth.getCurrentUser();
                if (currentUser) {
                    await window.supabase
                        .from('notifications')
                        .delete()
                        .eq('user_id', currentUser.id);
                }
            } catch (e) {
                console.error('Error clearing DB notifications:', e);
            }
        }

        await this.updateBadgeCount();
        await this.renderNotificationsPage();
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
        actions.style.cssText = 'display: flex; gap: var(--spacing-sm); align-items: center; flex-wrap: wrap;';

        // Special action for password reset requests
        if (notification.type === 'password_reset_request' && notification.related_id) {
            const resetBtn = document.createElement('button');
            resetBtn.textContent = 'Reset Password';
            resetBtn.style.cssText = `
                padding: var(--spacing-xs) var(--spacing-sm);
                background: var(--accent-blue);
                border: 1px solid var(--accent-blue);
                border-radius: var(--radius-sm);
                color: white;
                font-size: 0.75rem;
                cursor: pointer;
                transition: var(--transition);
                font-weight: 500;
            `;
            resetBtn.addEventListener('click', async () => {
                if (confirm('Send password reset email to this employee?')) {
                    await this.handlePasswordReset(notification.related_id, notification.id);
                }
            });
            resetBtn.addEventListener('mouseenter', function () {
                this.style.background = 'var(--color-purple)';
                this.style.borderColor = 'var(--color-purple)';
            });
            resetBtn.addEventListener('mouseleave', function () {
                this.style.background = 'var(--accent-blue)';
                this.style.borderColor = 'var(--accent-blue)';
            });
            actions.appendChild(resetBtn);
        }

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

    async handlePasswordReset(employeeUserId, notificationId) {
        if (!Storage.isSupabaseActive()) {
            alert('Supabase is not connected');
            return;
        }

        try {
            // Get employee email
            const { data: employee, error: fetchError } = await window.supabase
                .from('users')
                .select('email, name')
                .eq('id', employeeUserId)
                .single();

            if (fetchError || !employee) {
                alert('Employee not found');
                return;
            }

            // Send password reset email
            const redirectUrl = window.SupabaseService._getPasswordResetUrl();
            const { error: resetError } = await window.supabase.auth.resetPasswordForEmail(
                employee.email,
                { redirectTo: redirectUrl }
            );

            if (resetError) throw resetError;

            // Mark notification as read
            await this.markAsRead(notificationId);

            alert(`Password reset email sent to ${employee.name} (${employee.email})`);
        } catch (error) {
            console.error('Error sending password reset:', error);
            alert('Failed to send password reset email. Please try again.');
        }
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
            // Remove old listeners by cloning
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
        });

        // Re-query after clone
        document.querySelectorAll('[data-notif-filter]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                document.querySelectorAll('[data-notif-filter]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.notifFilter;
                await this.renderNotificationsPage();
            });
        });

        // Clear All button
        const clearAllBtn = document.getElementById('clear-all-notifications-btn');
        if (clearAllBtn) {
            const newClearBtn = clearAllBtn.cloneNode(true);
            clearAllBtn.parentNode.replaceChild(newClearBtn, clearAllBtn);
            newClearBtn.addEventListener('click', async () => {
                if (confirm('Clear all notifications? This will dismiss all smart alerts and delete all stored notifications.')) {
                    await this.clearAllNotifications();
                }
            });
        }

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
