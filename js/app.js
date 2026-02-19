// ===== New App Module for ContentFlow UI =====

const NewApp = {
    currentPage: 'calendar',

    async init() {
        console.log('Initializing NewApp...');

        this.initMobileMenu(); // Mobile support

        // --- SUPABASE SESSION SYNC & RECOVERY ---
        if (window.supabase) {
            // 1. Recover Session from URL (e.g. magic link / reset password)
            const { data: { session } } = await window.supabase.auth.getSession();

            // 2. Sync to LocalStorage if we have a valid session but no local user
            if (session && session.user && !Auth.getCurrentUser()) {
                console.log('Syncing Supabase session to local storage...');
                const user = session.user;
                const appUser = {
                    id: user.id,
                    email: user.email,
                    name: user.user_metadata.full_name || user.email.split('@')[0],
                    avatar: Auth.getInitials(user.user_metadata.full_name || user.email),
                    role: user.user_metadata.role || 'Employee',
                    joined: user.created_at || new Date().toISOString()
                };
                // Save and set current user so checkAuth passes
                localStorage.setItem('contentflow_current_user', JSON.stringify(appUser));
                Auth.currentUser = appUser;
            }


        }
        // ----------------------------------------

        // Check Auth
        if (typeof Auth !== 'undefined' && !Auth.checkAuth()) return;
        this.updateUserDisplay();
        this.checkRoleAccess();

        // Initialize Modules
        if (typeof NotificationService !== 'undefined') {
            // Poll for notifications every 60s + Realtime
            NotificationService.startPolling(this.handleNewNotifications.bind(this));
            await this.updateNotificationBadge();
        }

        // Render initial content
        if (typeof NewCalendar !== 'undefined' && NewCalendar.init) NewCalendar.init(); // Initialize calendar if module is ready
        this.renderTasks(); // Render tasks immediately
        this.renderAnalytics(); // Render analytics immediately

        // Attach listeners
        this.attachEventListeners();
        // attachModalListeners is now handled by delegation in attachEventListeners
        this.attachFormListeners();
        this.attachAnalyticsListeners();
        this.attachSettingsListeners();

        // Default to user's preferred page from settings
        try {
            const settings = JSON.parse(localStorage.getItem('clearcut_advanced_settings') || '{}');
            this.handleNavigation(settings.defaultPage || 'calendar');
        } catch {
            this.handleNavigation('calendar');
        }

        console.log('Application Initialized');
    },

    // ===== Auth & Profile =====
    // initAuth() is replaced by updateUserDisplay and Auth.checkAuth in init()
    // and logout logic moved to attachEventListeners

    checkRoleAccess() {
        // Ensure we have the latest user data
        const user = Auth.getCurrentUser();
        Auth.currentUser = user; // specific fix to ensure sync

        if (!user) return;

        // Fallback: If role is missing, default to 'Admin' (legacy support)
        // Also normalize to title case for display consistecy
        const role = user.role || 'Admin';
        console.log('Checking Role Access for:', user.name, 'Resolved Role:', role);

        const isAdmin = role.toLowerCase() === 'admin';
        const isTeamLeader = role.toLowerCase() === 'team leader' || role.toLowerCase() === 'tl';

        // Selectors
        const adminSection = document.getElementById('admin-menu-section');
        const analyticsNav = document.querySelector('a[data-page="analytics"]');
        const settingsNav = document.querySelector('a[data-page="settings"]');
        const employeeDashboard = document.getElementById('my-dashboard-nav');
        const createBtn = document.getElementById('create-task-btn');

        if (isAdmin || isTeamLeader) {
            // Admin & TL see Management sections
            if (adminSection) adminSection.style.display = 'block';
            if (analyticsNav) analyticsNav.style.display = 'flex';
            if (settingsNav) settingsNav.style.display = 'flex';
            if (createBtn) createBtn.style.display = 'flex';
            if (employeeDashboard) employeeDashboard.style.display = 'none';

            // Update Label to differentiate from Admin
            const adminLabel = adminSection ? adminSection.querySelector('p') : null;
            if (adminLabel) {
                adminLabel.textContent = isAdmin ? 'ADMIN' : 'MANAGEMENT';
            }
        } else {
            // Employee sees ONLY Calendar & Tasks
            if (adminSection) adminSection.style.display = 'none';
            if (analyticsNav) analyticsNav.style.display = 'none';
            if (createBtn) createBtn.style.display = 'none';
            if (settingsNav) settingsNav.style.display = 'flex';
            if (employeeDashboard) employeeDashboard.style.display = 'none';

            // Ensure Calendar or Tasks is active if they were on a restricted page
            const currentPage = document.querySelector('.nav-item.active');
            if (currentPage && (currentPage.dataset.page === 'analytics' || currentPage.dataset.page === 'settings')) {
                this.handleNavigation('calendar');
            }
        }
    },

    updateUserDisplay() {
        const user = Auth.currentUser;
        if (!user) return;

        // Top Header is gone, update Sidebar
        const avatarEl = document.getElementById('sidebar-user-avatar');
        const nameEl = document.getElementById('sidebar-user-name');
        const roleEl = document.getElementById('sidebar-user-role');

        if (avatarEl) avatarEl.textContent = user.avatar;
        if (nameEl) nameEl.textContent = user.name;
        if (roleEl) roleEl.textContent = user.role;
    },

    handleNewNotifications(notifications) {
        console.log('New notifications received:', notifications);
        this.updateNotificationBadge();
        // Toast removed as per user request (only red dot)
        // if (notifications.length > 0 && typeof this.showNotification === 'function') {
        //    this.showNotification(`You have ${notifications.length} new notification(s)`);
        // }
    },

    async handleNotificationClick(notification) {
        console.log('Notification clicked:', notification);

        // Mark as read if not already
        if (!notification.is_read) {
            NotificationService.markAsRead(notification.id);
        }

        // Handle based on type
        // Types: 'task_assigned', 'task_status_change', 'task_update', 'overdue' (smart)
        if (notification.taskId || notification.related_id) {
            const taskId = notification.taskId || notification.related_id;

            // Switch to Tasks/Calendar view if not already there?
            // Actually, we can open the modal from anywhere if we have the data.
            // But if we are on 'settings' page, the modal might look weird or depend on other things?
            // Let's safe-switch to 'calendar' or 'tasks' page first?
            // "if that is task that redirect to task section and show that task" - User request.

            // Redirect to Tasks section (which is actually 'calendar' in this app structure usually, 
            // or we have a 'tasks' page which is the list view?)
            // renderProjectsPage is the list view. renderCalendar is calendar.
            // Let's go to list view for clarity? Or Calendar?
            // User said "redirect to task section". 
            // Let's assume 'tasks' (list view) or just open the modal on top of current view if possible.
            // But changing view ensures context.

            this.handleNavigation('tasks'); // Switch to tasks view for context

            try {
                // Fetch task details
                // Storage.getTasks() is cached/fast.
                const tasks = await Storage.getTasks();
                const task = tasks.find(t => t.id == taskId); // loose equality for string/int safety

                if (task) {
                    if (typeof NewCalendar !== 'undefined' && NewCalendar.openEditTaskModal) {
                        NewCalendar.openEditTaskModal(task);
                    } else {
                        console.error('NewCalendar module not loaded');
                    }
                } else {
                    this.showNotification('Task not found or deleted.', 'error');
                }
            } catch (e) {
                console.error('Error handling notification click:', e);
            }
        }
    },

    async updateNotificationBadge() {
        if (typeof NotificationService === 'undefined') return;

        // Delegate to NotificationService for consolidated badge logic (sidebar & footer)
        await NotificationService.updateBadgeCount();

        // Update the floating panel list (if any notifications exist)
        const notifications = await NotificationService.getNotifications();
        const list = document.getElementById('notification-list');
        if (list) {
            if (notifications.length === 0) {
                list.innerHTML = '<p style="color:var(--text-secondary); font-size:0.8rem; text-align:center;">No new notifications</p>';
            } else {
                list.innerHTML = notifications.slice(0, 5).map(n => `
                    <div style="padding: 10px; border-bottom: 1px solid var(--border-color); ${!n.is_read ? 'background: rgba(79, 70, 229, 0.1);' : ''}">
                        <p style="font-size: 0.9rem; margin-bottom: 4px;">${n.message}</p>
                        <span style="font-size: 0.7rem; color: var(--text-secondary);">${new Date(n.created_at).toLocaleString()}</span>
                    </div>
                `).join('');
            }
        }
    },

    // ===== Analytics Filters & Advanced =====
    attachAnalyticsListeners() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active class from all
                filterBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.color = 'var(--text-secondary)';
                    b.style.boxShadow = 'none';
                });

                // Add active to clicked
                e.target.classList.add('active');
                e.target.style.background = 'var(--bg-elevated)';
                e.target.style.color = 'var(--text-primary)';
                e.target.style.boxShadow = 'var(--shadow-sm)';

                const period = e.target.textContent.toLowerCase();
                this.renderCharts(period);
            });
        });

        // Export PDF Logic
        const exportBtn = document.getElementById('export-pdf-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                if (window.notifications) Notifications.show('Generating Report... Please wait', 'info');

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('p', 'mm', 'a4');
                const content = document.getElementById('analytics-page'); // Capture entire page

                if (!content) return;

                try {
                    const canvas = await html2canvas(content, {
                        scale: 1.5, // Better resolution
                        backgroundColor: '#0a0a0a', // Dark theme bg
                        useCORS: true
                    });

                    const imgData = canvas.toDataURL('image/png');
                    const imgProps = doc.getImageProperties(imgData);
                    const pdfWidth = doc.internal.pageSize.getWidth();
                    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                    doc.save('Agency_Performance_Report.pdf');

                    if (window.notifications) Notifications.show('Report Downloaded Successfully!', 'success');
                } catch (err) {
                    console.error('PDF Error:', err);
                    if (window.notifications) Notifications.show('Failed to generate report', 'error');
                }
            });
        }
    },


    // ===== Settings & Preferences =====
    attachSettingsListeners() {
        // Toggle Dark/Light Mode
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.checked = document.body.classList.contains('light-mode');
            themeToggle.addEventListener('change', () => {
                document.body.classList.toggle('light-mode');
                const isLight = document.body.classList.contains('light-mode');
                localStorage.setItem('clearcut_theme', isLight ? 'light' : 'dark');
            });
        }

        // Test Notification Button
        const testNotifBtn = document.getElementById('test-notification-btn');
        if (testNotifBtn) {
            testNotifBtn.addEventListener('click', () => {
                if (typeof NotificationService !== 'undefined') {
                    NotificationService.playNotificationSound();
                    this.showNotification('This is a test notification with sound!');
                } else {
                    this.showNotification('Notification Service not ready', 'error');
                }
            });
        }

        // Auto Refresh
        const autoRefreshToggle = document.getElementById('setting-auto-refresh');
        if (autoRefreshToggle) {
            autoRefreshToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                // Save preference logic if needed
                // Currently notifications.js starts polling by default in init()
                // We could stop/start polling here if we wanted deeper integration
            });
        }

        // Default Page Setting
        const defaultPageSelect = document.getElementById('setting-default-page');
        if (defaultPageSelect) {
            // Load saved
            const saved = JSON.parse(localStorage.getItem('clearcut_advanced_settings') || '{}');
            if (saved.defaultPage) defaultPageSelect.value = saved.defaultPage;

            defaultPageSelect.addEventListener('change', (e) => {
                const settings = JSON.parse(localStorage.getItem('clearcut_advanced_settings') || '{}');
                settings.defaultPage = e.target.value;
                localStorage.setItem('clearcut_advanced_settings', JSON.stringify(settings));
                this.showNotification('Default start page saved');
            });
        }
    },

    loadSettings() {
        const user = Auth.getCurrentUser();
        if (user) {
            if (document.getElementById('settings-name')) document.getElementById('settings-name').value = user.name;
            if (document.getElementById('settings-email')) document.getElementById('settings-email').value = user.email;
            if (document.getElementById('settings-header-name')) document.getElementById('settings-header-name').textContent = user.name;
            if (document.getElementById('settings-avatar-display')) document.getElementById('settings-avatar-display').textContent = user.avatar;
            if (document.getElementById('settings-role-badge')) document.getElementById('settings-role-badge').textContent = user.role || 'Admin';
        }

        // Load advanced settings from localStorage
        this.loadAdvancedSettings();

        // Save button listener
        const saveBtn = document.getElementById('save-advanced-settings-btn');
        if (saveBtn && !saveBtn._listenerAttached) {
            saveBtn._listenerAttached = true;
            saveBtn.addEventListener('click', () => this.saveAdvancedSettings());
        }
    },

    loadAdvancedSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('clearcut_advanced_settings') || '{}');
            const defaultPage = document.getElementById('setting-default-page');
            const defaultFilter = document.getElementById('setting-default-filter');
            const autoRefresh = document.getElementById('setting-auto-refresh');

            if (defaultPage) defaultPage.value = settings.defaultPage || 'calendar';
            if (defaultFilter) defaultFilter.value = settings.defaultFilter || 'all';
            if (autoRefresh) autoRefresh.checked = settings.autoRefresh !== false; // default true
        } catch (e) {
            console.error('Error loading advanced settings:', e);
        }
    },

    saveAdvancedSettings() {
        const defaultPage = document.getElementById('setting-default-page');
        const defaultFilter = document.getElementById('setting-default-filter');
        const autoRefresh = document.getElementById('setting-auto-refresh');

        const settings = {
            defaultPage: defaultPage ? defaultPage.value : 'calendar',
            defaultFilter: defaultFilter ? defaultFilter.value : 'all',
            autoRefresh: autoRefresh ? autoRefresh.checked : true
        };

        localStorage.setItem('clearcut_advanced_settings', JSON.stringify(settings));
        this.showNotification('Settings saved successfully!');
    },

    saveProfile() {
        const name = document.getElementById('settings-name').value;
        const email = document.getElementById('settings-email').value;

        if (name && email) {
            const user = Auth.getCurrentUser();
            user.name = name;
            user.email = email;
            // Re-generate avatar initials
            user.avatar = Auth.getInitials(name);

            // Hack: Update localStorage directly since Auth doesn't have update method
            localStorage.setItem('clearcut_current_user', JSON.stringify(user));

            // Refresh Auth UI
            this.updateUserDisplay(); // Changed from initAuth

            // Refresh Settings UI
            this.loadSettings();

            if (window.notifications) Notifications.show('Profile updated successfully!', 'success');
        }
    },

    async getTimelineData(period) {
        const tasks = await Storage.getTasks();
        let labels = [];
        let data = [];

        const now = new Date();
        const dataMap = {};

        const getTaskDate = (task) => {
            if (task.createdAt) return new Date(task.createdAt);
            // Legacy support: try parsing ID if it looks like a timestamp (all digits)
            if (/^\d+$/.test(task.id)) return new Date(parseInt(task.id));
            // Absolute fallback: assume today if unknown (or verify if we should count it)
            return new Date();
        };

        if (period === 'daily') {
            // Last 7 Days
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                labels.push(dateStr);
                dataMap[dateStr] = 0;
            }

            tasks.forEach(task => {
                const date = getTaskDate(task);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (dataMap.hasOwnProperty(dateStr)) {
                    dataMap[dateStr]++;
                }
            });

        } else if (period === 'monthly') {
            // Jan - Dec of current year
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            labels = months;
            months.forEach(m => dataMap[m] = 0);

            tasks.forEach(task => {
                const date = getTaskDate(task);
                if (date.getFullYear() === now.getFullYear()) {
                    const monthStr = date.toLocaleDateString('en-US', { month: 'short' });
                    if (dataMap.hasOwnProperty(monthStr)) {
                        dataMap[monthStr]++;
                    }
                }
            });

        } else if (period === 'yearly') {
            // Last 5 Years
            for (let i = 4; i >= 0; i--) {
                const year = now.getFullYear() - i;
                labels.push(year.toString());
                dataMap[year] = 0;
            }

            tasks.forEach(task => {
                const date = getTaskDate(task);
                const yearStr = date.getFullYear().toString();
                if (dataMap.hasOwnProperty(yearStr)) {
                    dataMap[yearStr]++;
                }
            });
        }

        // Only show mock data if absolutely NO tasks exist to avoid empty state confusion
        // Use a flag for empty data instead of mutating tasks
        if (tasks.length === 0) {
            if (period === 'daily') data = [0, 0, 0, 0, 0, 0, 0];
            if (period === 'monthly') data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            if (period === 'yearly') data = [0, 0, 0, 0, 0];
        } else {
            // Fill real data
            data = labels.map(label => dataMap[label]);
        }

        return { labels, data };
    },


    // ===== Navigation =====
    // attachNavigationListeners is replaced by attachEventListeners and handleNavigation
    // ===== Centralized Event Handling (The Fix for All) =====
    attachEventListeners() {
        console.log('Attaching Global Event Listeners...');

        // Explicit Listeners (Safety Net)


        document.body.addEventListener('click', (e) => {
            const target = e.target;

            // 1. Sidebar Navigation (Delegate)
            const navItem = target.closest('.nav-item');
            if (navItem) {
                e.preventDefault();
                if (navItem.dataset.page) {
                    this.handleNavigation(navItem.dataset.page);
                }
                return;
            }

            // 2. Open Modals (Global IDs)


            // Open Task Modal (from any button with this class or ID)
            if (target.closest('.open-task-modal-btn')) {
                this.openModal('task-modal');
                return;
            }

            // 3. Close Modals (X buttons, Cancel buttons)
            if (target.closest('.modal-close') || target.closest('.modal-cancel-btn')) {
                const modal = target.closest('.modal');
                if (modal) this.closeModalElement(modal);
                return;
            }

            // Close background click
            if (target.classList.contains('modal')) {
                this.closeModalElement(target);
                return;
            }

            // 4. Notifications
            if (target.closest('#notification-bell')) {
                e.preventDefault();
                e.stopPropagation();
                const panel = document.getElementById('notification-panel');
                if (panel) {
                    const isHidden = panel.style.display === 'none';
                    panel.style.display = isHidden ? 'block' : 'none';
                    if (isHidden) {
                        this.updateNotificationBadge();
                        // Mark as read after a short delay so user sees them first
                        setTimeout(() => {
                            if (typeof NotificationService !== 'undefined') {
                                NotificationService.markAllAsRead().then(() => {
                                    const badge = document.getElementById('notification-count');
                                    if (badge) badge.style.display = 'none';
                                });
                            }
                        }, 2000);
                    }
                }
                return;
            }

            // 5. Logout - CHECK FIRST because it is INSIDE the profile container
            if (target.closest('#sidebar-logout-btn') || target.closest('#logout-btn')) {
                e.preventDefault();
                e.stopPropagation(); // Stop bubbling to profile
                Auth.logout();
                return;
            }

            // 6. User Profile -> Profile Page
            const profile = target.closest('#sidebar-user-profile') || target.closest('.user-mini-profile');
            // Ensure we are not clicking logout or notification bell inside profile
            if (profile && !target.closest('#notification-bell')) {
                e.preventDefault();
                this.handleNavigation('profile');
                this.loadSettings();
                return;
            }
        });

        // Close notification panel if clicked outside (separate listener for simplicity)
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notification-panel');
            const bell = document.getElementById('notification-bell');
            if (panel && panel.style.display === 'block') {
                if (!panel.contains(e.target) && (!bell || !bell.contains(e.target))) {
                    panel.style.display = 'none';
                }
            }
        });

        // Mapping specific cancel IDs to their modals for delegation fallback
        const cancelMap = {
            'cancel-task': 'task-modal',
            'cancel-client': 'client-modal',
            'cancel-employee': 'employee-modal',
            'cancel-edit-task': 'edit-task-modal',
            'cancel-edit-employee': 'edit-employee-modal',
            'cancel-edit-client': 'edit-client-modal',
            'cancel-group': 'create-group-modal'
        };

        Object.keys(cancelMap).forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.add('modal-cancel-btn'); // Tag them for delegation
        });

        // Explicit Listeners for Logout (Critical Action)
        const logoutBtn = document.getElementById('sidebar-logout-btn');
        if (logoutBtn) {
            console.log('Attaching direct listener for SIDEBAR LOGOUT');
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Explicit LOGOUT clicked');
                Auth.logout();
            });
        }


        // Tag close buttons too
        document.querySelectorAll('.modal-close').forEach(btn => btn.classList.add('modal-close'));
    },

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Lock Body Scroll
            console.log(`Opening modal: ${modalId}`);

            if (modalId === 'task-modal') {
                // Force re-populate every time to catch new employees/clients
                this.populateTaskDropdowns().catch(console.error);
            }
        } else {
            console.error(`Modal not found: ${modalId}`);
        }
    },

    async populateTaskDropdowns() {
        const user = Auth.getCurrentUser();
        const role = (user && user.role) ? user.role.toLowerCase() : 'admin';
        const isAdmin = role === 'admin';

        console.log('Populating Dropdowns - User Role:', role, 'isAdmin:', isAdmin);

        // Fetch employees and clients once for both create and edit modals
        let employees = [];
        let clients = [];

        try {
            employees = await Storage.getEmployees();
            console.log('Employees found:', employees.length);
        } catch (error) {
            console.error('Error fetching employees:', error);
        }

        try {
            clients = await Storage.getClients();
            console.log('Clients found:', clients.length);
        } catch (error) {
            console.error('Error fetching clients:', error);
        }

        // Helper: populate an assignee select
        const populateAssigneeSelect = (groupEl, selectEl) => {
            if (!groupEl || !selectEl) return;
            if (isAdmin) {
                groupEl.style.setProperty('display', 'block', 'important');
                selectEl.innerHTML = '<option value="">Select Employee</option>';
                if (employees.length === 0) {
                    selectEl.innerHTML += '<option value="">No Employees Found</option>';
                } else {
                    employees.forEach(emp => {
                        const option = document.createElement('option');
                        option.value = emp.id;
                        option.textContent = emp.name;
                        selectEl.appendChild(option);
                    });
                }
            } else {
                groupEl.style.display = 'none';
            }
        };

        // Helper: populate a client select
        const populateClientSelect = (groupEl, selectEl) => {
            if (!selectEl) return;
            if (groupEl) groupEl.style.setProperty('display', isAdmin ? 'block' : 'none', 'important');
            selectEl.innerHTML = '<option value="">Select Client</option>';
            if (clients.length === 0) {
                selectEl.innerHTML += '<option value="">No Clients Found</option>';
            } else {
                clients.forEach(client => {
                    const option = document.createElement('option');
                    option.value = client.id;
                    option.textContent = client.name;
                    selectEl.appendChild(option);
                });
            }
        };

        // 1. Create Task Modal dropdowns
        populateAssigneeSelect(
            document.getElementById('task-assignee-group'),
            document.getElementById('task-assignee')
        );
        populateClientSelect(
            null,
            document.getElementById('task-client')
        );

        // 2. Edit Task Modal dropdowns
        populateAssigneeSelect(
            document.getElementById('edit-task-assignee-group'),
            document.getElementById('edit-task-assignee')
        );
        populateClientSelect(
            document.getElementById('edit-task-client-group'),
            document.getElementById('edit-task-client')
        );
    },

    closeModalElement(modal) {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = ''; // Unlock Body Scroll
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    },

    handleNavigation(pageId) {
        // Update Sidebar UI
        document.querySelectorAll('.nav-item').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.page === pageId) {
                tab.classList.add('active');
            }
        });

        // Show Content
        const pages = document.querySelectorAll('.page');
        pages.forEach(page => {
            page.classList.remove('active');
            page.style.display = 'none'; // Force hide to override any inline styles
        });

        // Map 'tasks' and 'projects' to 'projects-page'
        const targetId = (pageId === 'tasks' || pageId === 'projects') ? 'projects' : pageId;
        const activePage = document.getElementById(`${targetId}-page`);

        if (activePage) {
            activePage.classList.add('active');
            activePage.style.display = 'block'; // Force show
            this.currentPage = pageId;

            // Refresh content when switching pages
            if (pageId === 'analytics') {
                this.renderAnalytics();
            } else if (pageId === 'tasks' || pageId === 'projects') {
                this.renderProjectsPage();
            } else if (pageId === 'group' || pageId === 'client-approvals') {
                this.renderGroupPage();
            } else if (pageId === 'employees') {
                this.renderEmployeesPage();
            } else if (pageId === 'clients') {
                this.renderClientsPage();
            } else if (pageId === 'profile') {
                this.loadSettings(); // loadSettings updates the profile inputs
            } else if (pageId === 'notifications') {
                NotificationService.initializeNotificationsPage();
            }
        }
    },

    // ===== Modal Management =====
    // Deprecated: Handled by attachEventListeners delegation

    // ===== Form Handling =====
    attachFormListeners() {
        const taskForm = document.getElementById('task-form');
        const clientForm = document.getElementById('client-form');

        if (taskForm) {
            taskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleTaskSubmit();
            });
        }

        if (clientForm) {
            clientForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleClientSubmit();
            });
        }

        const editTaskForm = document.getElementById('edit-task-form');
        if (editTaskForm) {
            editTaskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleEditTaskSubmit();
            });
        }

        // Delete Task Button
        const deleteTaskBtn = document.getElementById('delete-task-btn');
        if (deleteTaskBtn) {
            deleteTaskBtn.addEventListener('click', () => {
                this.deleteCurrentTask();
            });
        }

        const employeeForm = document.getElementById('employee-form');
        if (employeeForm) {
            employeeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleEmployeeSubmit();
            });
        }

        const editEmployeeForm = document.getElementById('edit-employee-form');
        if (editEmployeeForm) {
            editEmployeeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleEditEmployeeSubmit();
            });
        }

        const editClientForm = document.getElementById('edit-client-form');
        if (editClientForm) {
            editClientForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleEditClientSubmit();
            });
        }

        const groupForm = document.getElementById('group-form');
        if (groupForm) {
            groupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreateGroupSubmit();
            });
        }


        // Filter buttons
        const filterChips = document.querySelectorAll('.filter-chip');
        filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const parent = chip.parentElement;
                parent.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');

                // Handle filter change
                if (chip.dataset.filter) {
                    this.filterTasks(chip.dataset.filter);
                } else if (chip.dataset.period) {
                    this.filterAnalytics(chip.dataset.period);
                }
            });
        });
    },

    async handleTaskSubmit() {
        const title = document.getElementById('task-title').value;
        const taskType = document.getElementById('task-type').value;
        const status = document.getElementById('task-status').value;
        const assignedDate = document.getElementById('task-assigned-date').value;
        const dueDate = document.getElementById('task-due-date').value || assignedDate;

        // Logic to determining Client and Assignee
        const clientSelect = document.getElementById('task-client');
        let clientId = clientSelect ? clientSelect.value : null;

        // If no client selected, try to find default or create one
        if (!clientId) {
            const clients = await Storage.getClients();
            if (clients.length > 0) {
                clientId = clients[0].id;
            } else {
                const defaultClient = await Storage.addClient({
                    name: 'Default Client',
                    email: 'default@example.com',
                    phone: '',
                    company: 'Default Company'
                });
                clientId = defaultClient.id;
            }
        }

        // Determine Assignee
        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && currentUser.role === 'Admin';

        let assigneeId = currentUser.id; // Default to self
        let assigneeName = currentUser.name;

        if (isAdmin) {
            const assigneeSelect = document.getElementById('task-assignee');
            if (assigneeSelect && assigneeSelect.value) {
                assigneeId = assigneeSelect.value;
                const selectedOption = assigneeSelect.options[assigneeSelect.selectedIndex];
                assigneeName = selectedOption ? selectedOption.text : currentUser.name;
            }
        }

        await Storage.addTask({
            title,
            clientId,
            project: 'General Project',
            stage: taskType,
            status,
            assignee: assigneeName,
            assigneeId: assigneeId,
            priority: 'Medium',
            assignedDate: assignedDate,
            endDate: dueDate,
            deadline: dueDate, // Sync with legacy
            createdBy: currentUser.id
        });

        // Notification is now created automatically in SupabaseService.addTask()

        this.closeModal('task-modal');
        NewCalendar.refresh();
        await this.renderAnalytics();
        await this.renderTasks();
        this.showNotification('Project created successfully!');
    },

    async handleEditTaskSubmit() {
        const taskId = document.getElementById('edit-task-id').value;
        const title = document.getElementById('edit-task-title').value;
        const taskType = document.getElementById('edit-task-type').value;
        const status = document.getElementById('edit-task-status').value;
        const assignedDate = document.getElementById('edit-task-assigned-date').value;
        const dueDate = document.getElementById('edit-task-due-date').value || assignedDate;

        // Get the previous status to detect changes
        const previousStatus = this._editingTaskPreviousStatus || '';
        const previousAssigneeId = this._editingTaskPreviousAssigneeId || '';

        // Build update payload
        const updates = {
            title,
            stage: taskType,
            status,
            deadline: dueDate,
            assigned_date: assignedDate
        };

        // Admin and Group Leaders can change assignee and client
        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && currentUser.role && currentUser.role.toLowerCase() === 'admin';
        const isGroupLeader = currentUser && (currentUser.role === 'Group Leader' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Group Leader'));

        if (isAdmin || isGroupLeader) {
            const assigneeSelect = document.getElementById('edit-task-assignee');
            const clientSelect = document.getElementById('edit-task-client');

            if (assigneeSelect && assigneeSelect.value) {
                updates.assignee_id = assigneeSelect.value;
                const selectedOption = assigneeSelect.options[assigneeSelect.selectedIndex];
                updates.assignee = selectedOption ? selectedOption.text : '';
            }

            if (clientSelect) {
                updates.client_id = clientSelect.value || null;
            }
        }

        await Storage.updateTask(taskId, updates);

        // Create notification if status changed and task is assigned to someone else
        const assigneeId = updates.assignee_id || previousAssigneeId;
        if (status !== previousStatus && assigneeId && currentUser && assigneeId !== currentUser.id) {
            try {
                if (typeof NotificationService !== 'undefined') {
                    await NotificationService.createNotification(
                        assigneeId,
                        `Project "${title}" status changed to ${status}`,
                        'task_status_change',
                        taskId
                    );
                }
            } catch (e) {
                console.error('Error creating status change notification:', e);
            }
        }


        // Notify if assignee changed
        if (updates.assignee_id && updates.assignee_id !== previousAssigneeId && currentUser && updates.assignee_id !== currentUser.id) {
            try {
                if (typeof NotificationService !== 'undefined') {
                    await NotificationService.createNotification(
                        updates.assignee_id,
                        `Project "${title}" has been assigned to you`,
                        'task_assigned',
                        taskId
                    );
                }
            } catch (e) {
                console.error('Error creating reassignment notification:', e);
            }
        }

        this.closeModal('edit-task-modal');
        NewCalendar.refresh();
        await this.renderAnalytics();
        await this.renderTasks();
        this.showNotification('Project updated successfully!');
    },

    async deleteCurrentTask() {
        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));
        const isGroupLeader = currentUser && (currentUser.role === 'Group Leader' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Group Leader'));

        const taskId = document.getElementById('edit-task-id').value;
        if (!taskId) return;

        // Scoping check for Group Leader
        if (!isAdmin && isGroupLeader) {
            const task = await Storage.getTaskById(taskId);
            // Since Storage.getTasks() (and thus getTaskById) is scoped for TLs,
            // if we can't find the task, it means it's outside their group.
            if (!task) {
                this.showNotification('Permission Denied: You can only delete tasks within your group.', 'error');
                return;
            }
        } else if (!isAdmin) {
            this.showNotification('Permission Denied: Only Admins and Group Leaders can delete projects.', 'error');
            return;
        }

        const title = document.getElementById('edit-task-title').value || 'this task';
        if (!confirm(`Are you sure you want to delete "${title}" ? This action cannot be undone.`)) {
            return;
        }

        try {
            await Storage.deleteTask(taskId);
            this.closeModal('edit-task-modal');
            NewCalendar.refresh();
            await this.renderAnalytics();
            await this.renderTasks();
            this.showNotification('Project deleted successfully!');
        } catch (error) {
            console.error('Error deleting task:', error);
            this.showNotification('Failed to delete task: ' + error.message);
        }
    },

    // Restored Helper
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            this.closeModalElement(modal);
        }
    },

    async handleClientSubmit() {
        const name = document.getElementById('client-name').value;
        const phone = document.getElementById('client-phone').value;
        const address = document.getElementById('client-address').value;

        try {
            await Storage.addClient({
                name,
                email: '', // Optional/Removed
                phone,
                address,
                status: 'Approved'
            });

            this.closeModal('client-modal');
            this.showNotification('Client added successfully!', 'success');

            // Refresh visuals
            this.renderClientsPage();
            this.populateTaskDropdowns();
        } catch (error) {
            console.error('Failed to add client:', error);
            this.showNotification('Error adding client: ' + error.message, 'error');
        }
    },

    async handleEmployeeSubmit() {
        const nameInput = document.getElementById('employee-name');
        const emailInput = document.getElementById('employee-email');
        const passInput = document.getElementById('employee-password');
        const groupInput = document.getElementById('employee-group');

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passInput.value;
        const group = null; // Group logic simplified per user request

        // Use Auth to resolve creation
        const result = await Auth.createEmployee(name, email, password, group);

        if (result.success) {
            this.closeModal('employee-modal');
            this.showNotification(result.message || 'Employee account created successfully!');

            // Refresh Views
            if (this.currentGroupId && this.currentGroupName === group) {
                // If we are in the detail view of the group we just added a member to
                this.renderGroupMembers(this.currentGroupName);
            } else {
                // otherwise go back to main list
                this.renderGroupPage();
            }
            this.renderEmployeesPage(); // Sync with new Employees module

            // Reset form
            nameInput.value = '';
            emailInput.value = '';
            passInput.value = '';
        } else {
            this.showNotification(result.message || 'Failed to create employee', 'error');
        }
    },

    populateClientDropdown() {
        const clientSelect = document.getElementById('task-client');
        if (!clientSelect) return;

        const clients = Storage.getClients();
        clientSelect.innerHTML = '<option value="">Select client</option>';

        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            clientSelect.appendChild(option);
        });
    },

    // ===== Analytics Rendering =====
    async renderAnalytics() {
        const stats = await Storage.getStats();

        // Update stat cards
        const totalTasksStat = document.getElementById('total-tasks-stat');
        const completedStat = document.getElementById('completed-stat');
        const inProgressStat = document.getElementById('in-progress-stat');
        const pendingStat = document.getElementById('pending-stat');

        if (totalTasksStat) totalTasksStat.textContent = stats.totalTasks || 0;
        if (completedStat) completedStat.textContent = stats.completedTasks || 0;
        if (inProgressStat) inProgressStat.textContent = stats.inProgressTasks || 0;
        if (pendingStat) pendingStat.textContent = stats.pendingTasks || 0;

        // Render charts (simplified - you can add Chart.js later)
        await this.renderCharts();
    },

    async renderCharts(period = 'monthly') {
        const tasks = await Storage.getTasks();

        // 1. Process Data for Charts (Pie & Bar remain based on ALL tasks)
        const stageCount = {};
        const statusCount = { 'Pending': 0, 'In Progress': 0, 'Done': 0 };

        tasks.forEach(task => {
            stageCount[task.stage] = (stageCount[task.stage] || 0) + 1;
            if (statusCount.hasOwnProperty(task.status)) {
                statusCount[task.status]++;
            }
        });

        // 2. Get Filtered Timeline Data
        const { labels: timelineLabels, data: timelineData } = await this.getTimelineData(period);

        // Destroy existing charts
        if (this.pieChart) this.pieChart.destroy();
        if (this.barChart) this.barChart.destroy();
        if (this.lineChart) this.lineChart.destroy();

        // Common Options
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'Inter', size: 12 }, padding: 20 } }
            }
        };

        // 3. Pie Chart
        const pieCtx = document.getElementById('pie-chart');
        if (pieCtx) {
            this.pieChart = new Chart(pieCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(stageCount),
                    datasets: [{
                        data: Object.values(stageCount),
                        backgroundColor: [
                            'rgba(59, 130, 246, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(139, 92, 246, 0.8)',
                            'rgba(16, 185, 129, 0.8)', 'rgba(239, 68, 68, 0.8)', 'rgba(252, 211, 77, 0.8)'
                        ],
                        borderColor: 'rgba(17, 17, 17, 1)',
                        borderWidth: 2
                    }]
                },
                options: { ...commonOptions, cutout: '70%' }
            });
        }

        // 4. Bar Chart
        const barCtx = document.getElementById('bar-chart');
        if (barCtx) {
            this.barChart = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(statusCount),
                    datasets: [{
                        label: 'Projects',
                        data: Object.values(statusCount),
                        backgroundColor: '#3B82F6',
                        borderColor: '#3B82F6',
                        borderWidth: 0,
                        borderRadius: 4,
                        barPercentage: 0.6,
                        categoryPercentage: 0.8
                    }]
                },
                options: {
                    ...commonOptions,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.1)', borderDash: [5, 5] }, ticks: { color: '#9CA3AF' } },
                        x: { grid: { display: false }, ticks: { color: '#9CA3AF' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // 5. Line Chart - Timeline (Premium)
        const lineCtx = document.getElementById('line-chart');
        if (lineCtx) {
            // Hover Line Plugin
            const verticalHoverLine = {
                id: 'verticalHoverLine',
                beforeDatasetsDraw(chart) {
                    const { ctx, tooltip, chartArea: { top, bottom } } = chart;
                    if (tooltip._active && tooltip._active.length) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(tooltip._active[0].element.x, top);
                        ctx.lineTo(tooltip._active[0].element.x, bottom);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)'; // Premium Purple
                        ctx.setLineDash([5, 5]);
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            };

            // Create premium gradient
            const gradient = lineCtx.getContext('2d').createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(139, 92, 246, 0.5)');
            gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.1)');
            gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

            this.lineChart = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: timelineLabels, // Use filtered labels
                    datasets: [{
                        label: 'Projects Created',
                        data: timelineData, // Use filtered data
                        borderColor: '#8B5CF6',
                        backgroundColor: gradient,
                        borderWidth: 3,
                        pointBackgroundColor: '#111',
                        pointBorderColor: '#8B5CF6',
                        pointBorderWidth: 2,
                        pointRadius: 4, // Visible points
                        pointHoverRadius: 10, // Larger hover
                        pointHoverBackgroundColor: '#8B5CF6',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 3, // Thicker border
                        fill: true,
                        tension: 0.4,
                        cubicInterpolationMode: 'monotone'
                    }]
                },
                plugins: [verticalHoverLine], // Register plugin
                options: {
                    ...commonOptions,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(17, 17, 17, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#e5e7eb',
                            titleFont: { family: 'Inter', size: 13, weight: 600 },
                            padding: 12,
                            cornerRadius: 8,
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            displayColors: false,
                            callbacks: { label: (context) => ` ${context.parsed.y} Tasks Created` }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255, 255, 255, 0.03)', borderDash: [6, 6] },
                            ticks: { color: '#6B7280', font: { family: 'Inter', size: 11 }, stepSize: 2 },
                            border: { display: false }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#6B7280', font: { family: 'Inter', size: 11 } },
                            border: { display: false }
                        }
                    }
                }
            });
        }
    },

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },



    filterAnalytics(period) {
        console.log('Filter analytics by:', period);
        // Implement period filtering logic here
    },

    // ===== Group Rendering & CRUD =====
    async renderGroupPage() {
        const groupsGrid = document.getElementById('groups-grid');
        try {
            const createBtn = document.getElementById('create-group-btn');

            // Reset Views
            const detailView = document.getElementById('group-detail-view');
            if (detailView) detailView.style.display = 'none';
            if (groupsGrid) groupsGrid.style.display = 'grid';

            // Check Permissions
            const currentUser = Auth.getCurrentUser();
            const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));

            if (createBtn) createBtn.style.display = isAdmin ? 'flex' : 'none';

            if (!groupsGrid) return;

            // Fetch Data
            const groups = await Storage.getGroups();
            const employees = await Storage.getEmployees();

            // Group Leader Scoping
            let filteredGroups = groups;
            if (!isAdmin && (currentUser.role === 'Group Leader' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Group Leader'))) {
                const tlGroupName = currentUser.group || (currentUser.user_metadata && currentUser.user_metadata.group);
                if (tlGroupName) {
                    filteredGroups = groups.filter(t => t.name === tlGroupName);
                } else {
                    filteredGroups = [];
                }
            }

            if (filteredGroups.length === 0) {
                groupsGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                        <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.2;">👥</div>
                        <p>${isAdmin ? 'No groups created yet.' : 'You are not assigned to any group.'}</p>
                        ${isAdmin ? '<p style="font-size: 0.9rem; opacity: 0.8;">Click "Create Group" to get started.</p>' : ''}
                    </div>
                `;
                return;
            }

            groupsGrid.innerHTML = filteredGroups.map(group => {
                const groupEmployees = employees.filter(e => e.team === group.name || e.group === group.name);
                const memberCount = groupEmployees.length;

                // Find leader for this group
                const leader = groupEmployees.find(e => (e.role || '').toLowerCase() === 'team leader' || (e.role || '').toLowerCase() === 'tl' || (e.role || '').toLowerCase() === 'group leader');
                const leaderName = leader ? leader.name : 'No Leader Assigned';

                return `
                <div class="stat-card group-card" onclick="NewApp.openGroupDetail('${group.id}')" style="cursor: pointer; transition: transform 0.2s; border: 1px solid var(--border-color); position: relative; padding-bottom: 4.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <div style="width: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(group.name)}</h3>
                                <span style="font-size: 0.75rem; padding: 4px 10px; background: rgba(79, 70, 229, 0.1); color: var(--primary-color); border-radius: 20px; font-weight: 600;">ACTIVE</span>
                            </div>
                            <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                                ${this.escapeHtml(group.description || 'Our agency task force responsible for creative delivery and client satisfaction.')}
                            </p>
                        </div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 0.875rem; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 10px; margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700;">
                                ${Auth.getInitials(leaderName)}
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Group Leader</div>
                                <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary);">${this.escapeHtml(leaderName)}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 32px; height: 32px; border-radius: 50%; background: #22c55e; color: white; display: flex; align-items: center; justify-content: center;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                </svg>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Resources</div>
                                <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary);">${memberCount} Members Active</div>
                            </div>
                        </div>
                    </div>

                    <div style="position: absolute; bottom: 1.25rem; left: 1rem; right: 1rem; display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary" style="flex: 1; padding: 0.6rem; font-size: 0.85rem; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center; gap: 0.5rem; text-transform: uppercase; font-weight: 700;" onclick="event.stopPropagation(); NewApp.openGroupDetail('${group.id}')">
                            ACCESS GROUP
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                        ${isAdmin ? `
                        <button class="action-btn delete" onclick="event.stopPropagation(); NewApp.deleteGroup('${group.id}', '${this.escapeHtml(group.name)}')" title="Delete Group" style="color: #ef4444; padding: 8px; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; background: rgba(239, 68, 68, 0.1);">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                        ` : ''}
                    </div>
                </div>
        `;
            }).join('');
        } catch (error) {
            console.error('Error rendering groups page:', error);
            if (groupsGrid) {
                groupsGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 2rem;">
                        <p>Error loading groups. Please try refreshing the page.</p>
                        <p style="font-size: 0.8rem; opacity: 0.7;">${this.escapeHtml(error.message)}</p>
                    </div>
                `;
            }
        }
    },

    async renderEmployeesPage() {
        const grid = document.getElementById('employees-grid');
        if (!grid) return;

        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));

        try {
            const employees = await Storage.getEmployees();

            if (employees.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                        <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.2;">👤</div>
                        <p>No employees found.</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = employees.map(emp => {
                const initials = emp.avatar || (emp.name ? Auth.getInitials(emp.name) : 'EE');
                const isEmployeeTL = (emp.role || '').toLowerCase() === 'team leader' || (emp.role || '').toLowerCase() === 'tl';

                return `
                <div class="stat-card employee-card" style="padding: 1.5rem; border: 1px solid var(--border-color); position: relative;">
        ${isAdmin ? `
                    <div style="position: absolute; top: 1rem; right: 1rem; display: flex; gap: 0.5rem;">
                        <button class="action-btn edit" onclick="NewApp.openEditEmployeeModal('${emp.id}')" title="Edit Employee">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path>
                            </svg>
                        </button>
                        <button class="action-btn delete" onclick="NewApp.deleteEmployee('${emp.id}', '${emp.name}')" title="Delete Employee" style="color: #ef4444;">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                    ` : ''
                    }

<div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
    <div class="user-avatar" style="width: 64px; height: 64px; font-size: 1.5rem; margin-bottom: 1rem; background: var(--bg-card); border: 2px solid var(--border-color);">
        ${initials}
    </div>
    <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">${emp.name}</h3>
    <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem;">
        <span class="task-badge" style="background: rgba(59, 130, 246, 0.1); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.2); font-size: 0.7rem;">
            ${emp.role || 'Employee'}
        </span>
        ${emp.team ? `
                            <span class="task-badge" style="background: rgba(139, 92, 246, 0.1); color: #A78BFA; border: 1px solid rgba(139, 92, 246, 0.2); font-size: 0.7rem;">
                                ${emp.team}
                            </span>
                            ` : `
                            <span class="task-badge" style="background: rgba(107, 114, 128, 0.1); color: #9CA3AF; border: 1px solid rgba(107, 114, 128, 0.2); font-size: 0.7rem;">
                                Unassigned
                            </span>
                            `}
    </div>
    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
        ${emp.email}
    </div>

                    </div>
                </div>
            `;
            }).join('');
        } catch (error) {
            console.error('Error rendering employees page:', error);
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444;">Error loading employees: ${error.message}</div>`;
        }
    },


    async openCreateGroupModal() {
        this.openModal('create-group-modal');

        // Populate Leader and Members lists
        const leaderSelect = document.getElementById('create-group-leader');
        const membersSelect = document.getElementById('create-group-members-select');

        if (!leaderSelect || !membersSelect) return;

        leaderSelect.innerHTML = '<option value="">Select an employee...</option>';
        membersSelect.innerHTML = '';

        try {
            const employees = await Storage.getEmployees();

            // Populate Leader Dropdown
            leaderSelect.innerHTML += employees.map(emp =>
                `<option value="${emp.id}">${emp.name} (${emp.role || 'Employee'})</option>`
            ).join('');

            // Populate Members Multi-select
            membersSelect.innerHTML = employees.map(emp =>
                `<option value="${emp.id}">${emp.name}</option>`
            ).join('');

            if (employees.length === 0) {
                const opt = document.createElement('option');
                opt.textContent = 'No employees available';
                opt.disabled = true;
                membersSelect.appendChild(opt);
            }
        } catch (error) {
            console.error('Error populating team modal:', error);
            this.showNotification('Error loading employees for group creation.', 'error');
        }
    },

    async handleCreateGroupSubmit() {
        const nameInput = document.getElementById('create-group-name');
        const descInput = document.getElementById('create-group-desc');

        const name = nameInput.value.trim();
        const desc = descInput.value.trim();

        const leaderId = document.getElementById('create-group-leader').value;
        const membersSelect = document.getElementById('create-group-members-select');
        const memberIds = Array.from(membersSelect.selectedOptions).map(opt => opt.value);

        if (!name || !leaderId) {
            this.showNotification('Group name and Leader are required', 'error');
            return;
        }

        try {
            // 1. Create the Group
            const team = await Storage.addTeam(name, desc);

            // 2. Assign Leader role and group
            const employees = await Storage.getEmployees();
            const leader = employees.find(e => e.id === leaderId);

            if (leader) {
                // Update Leader role and group in Supabase/Local
                if (typeof SupabaseService !== 'undefined' && window.supabase) {
                    await window.supabase.from('users').update({ role: 'Team Leader', team: name }).eq('id', leaderId);
                } else {
                    let users = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                    users = users.map(u => u.id === leaderId ? { ...u, role: 'Team Leader', team: name } : u);
                    localStorage.setItem('contentflow_users', JSON.stringify(users));
                }

                // Send Notification to Leader
                await NotificationService.createNotification(
                    leaderId,
                    `You have been appointed as the Group Leader for "${name}".You now have management access for this group.`,
                    'success'
                );
            }

            // 3. Assign Members to group
            for (const mId of memberIds) {
                if (typeof SupabaseService !== 'undefined' && window.supabase) {
                    await window.supabase.from('users').update({ team: name }).eq('id', mId);
                } else {
                    let users = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                    users = users.map(u => u.id === mId ? { ...u, team: name } : u);
                    localStorage.setItem('contentflow_users', JSON.stringify(users));
                }

                // Send Notification to Members (only if not the leader who already got one)
                if (mId !== leaderId) {
                    await NotificationService.createNotification(
                        mId,
                        `You have been added to the new group: "${name}".`,
                        'info'
                    );
                }
            }

            this.showNotification(`Group "${name}" created with ${memberIds.length} members!`, 'success');
            this.closeModal('create-group-modal');

            // Reset form
            nameInput.value = '';
            descInput.value = '';
            this.renderGroupPage();
            if (this.renderEmployeesPage) this.renderEmployeesPage(); // Sync Employees module
        } catch (error) {
            console.error('Error creating group:', error);
            this.showNotification('Failed to create group: ' + error.message, 'error');
        }
    },

    async deleteGroup(id, name) {
        if (!confirm(`Are you sure you want to delete the group "${name}" ? This will NOT delete the employees, but they will become unassigned.`)) return;

        try {
            // Optional: Update users who were in this team to remove team assignment?
            // For now, we just delete the team definition. The string match in renderTeamPage will just fail to match, 
            // effectively making them unassigned or we should explicitly update them.
            // Let's implement explicit update for data integrity.
            const employees = await Storage.getEmployees();
            const teamMembers = employees.filter(e => e.team === name);

            // We need to update these users to have team = null
            // This might be slow if many users. For MVP, we'll just delete the team.
            // The grouped logic checks user.team. If we delete the team entity, the user still has user.team = "Marketing".
            // So if we re-create "Marketing", they rejoin? Yes.
            // Text based linking is loose but flexible. 

            await Storage.deleteGroup(id);
            this.showNotification('Group deleted successfully', 'success');
            this.renderGroupPage();
        } catch (error) {
            console.error('Error deleting group:', error);
            this.showNotification('Failed to delete group', 'error');
        }
    },

    // ===== Group Detail View =====
    async openGroupDetail(groupId) {
        document.getElementById('groups-grid').style.display = 'none';
        document.getElementById('create-group-btn').style.display = 'none';
        const detailView = document.getElementById('group-detail-view');
        detailView.style.display = 'block';

        const group = await Storage.getGroupById(groupId);
        if (!group) {
            this.closeGroupDetail();
            return;
        }

        document.getElementById('detail-group-name').textContent = group.name;
        document.getElementById('detail-group-desc').textContent = group.description || 'No description provided.';

        // Store current group info for member management
        this.currentGroupName = group.name;

        await this.renderGroupMembers(group.name);
    },

    closeGroupDetail() {
        document.getElementById('group-detail-view').style.display = 'none';
        document.getElementById('groups-grid').style.display = 'grid';

        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));
        if (isAdmin) document.getElementById('create-group-btn').style.display = 'flex';

        this.currentGroupName = null;
    },

    async renderGroupMembers(groupName) {
        const grid = document.getElementById('group-members-grid');
        if (!grid) return;

        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 2rem;">Loading group members...</p>';

        try {
            const employees = await Storage.getEmployees();
            const groupMembers = employees.filter(e => e.team === groupName || e.group === groupName);

            if (groupMembers.length === 0) {
                grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">No members assigned to this group yet.</p>';
                return;
            }

            grid.innerHTML = groupMembers.map(emp => {
                const initials = emp.avatar || (emp.name ? Auth.getInitials(emp.name) : 'EE');
                const isLeader = (emp.role || '').toLowerCase() === 'team leader' || (emp.role || '').toLowerCase() === 'tl' || (emp.role || '').toLowerCase() === 'group leader';

                return `
                <div class="stat-card" style="padding: 1rem; display: flex; align-items: center; gap: 1rem; border: 1px solid var(--border-color);">
                    <div class="user-avatar" style="width: 48px; height: 48px; font-size: 1.1rem; background: ${isLeader ? 'var(--primary-color)' : 'var(--bg-card)'}; color: ${isLeader ? 'white' : 'var(--text-primary)'};">
                        ${initials}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 1rem;">${emp.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${emp.role || 'Employee'}</div>
                    </div>
                    ${isLeader ? '<span class="task-badge" style="background: rgba(79, 70, 229, 0.1); color: var(--primary-color);">LEADER</span>' : ''}
                </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering group members:', error);
            grid.innerHTML = '<p style="color: #ef4444; text-align: center;">Error loading members.</p>';
        }
    },

    openAddEmployeeModal() {
        this.openModal('employee-modal');
        // Clear fields in case it was used before
        const nameInput = document.getElementById('employee-name');
        const emailInput = document.getElementById('employee-email');
        const passInput = document.getElementById('employee-password');
        const groupInput = document.getElementById('employee-team'); // Using the existing ID for team/group

        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        if (passInput) passInput.value = '';
        if (groupInput) groupInput.value = '';
    },

    openAddGroupMemberModal() {
        // Open the existing Add Employee modal, but pre-fill the group
        this.openAddEmployeeModal();
        if (this.currentGroupName) {
            setTimeout(() => {
                const groupInput = document.getElementById('employee-team');
                if (groupInput) groupInput.value = this.currentGroupName;
            }, 100);
        }
    },

    async renderClientsPage() {
        const clientContainer = document.getElementById('client-list-container');
        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));

        if (!clientContainer) return;

        // Clients
        const clients = await Storage.getClients();
        if (clients.length === 0) {
            clientContainer.innerHTML = '<div style="text-align:center; padding:1rem; color:var(--text-secondary);">No clients added yet</div>';
        } else {
            clientContainer.innerHTML = clients.map(client => `
            <div style="background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                <div style="flex:1;">
                    <div style="font-weight: 500; font-size: 0.95rem;">${client.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); opacity: 0.8;">${client.address || 'No Address Provided'}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${client.email} | ${client.phone || 'No Phone'}</div>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                     <button class="action-btn edit" onclick="NewApp.openEditClientModal('${client.id}')" title="Edit Client">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path>
                        </svg>
                     </button>
                     ${isAdmin ? `
                     <button class="action-btn delete" onclick="NewApp.deleteClient('${client.id}', '${client.name}')" title="Delete Client" style="color: #ef4444;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                     </button>
                     ` : ''}
                </div>
            </div>
            `).join('');
        }
    },

    // ===== Tasks Rendering =====
    _currentTaskFilter: 'all',
    _currentTaskSearch: '',
    _currentTaskAssignee: '',
    _currentTaskClient: '',
    _taskFilterListenersAttached: false,

    // Alias for compatibility to prevent init crash
    renderTasks(filter) {
        return this.renderProjectsPage();
    },

    async renderProjectsPage() {
        const grid = document.getElementById('projects-grid');
        if (!grid) return;

        // Reset views
        document.getElementById('projects-main-view').style.display = 'block';
        document.getElementById('project-detail-view').style.display = 'none';

        let clients = await Storage.getClients();
        let allTasks = await Storage.getTasks();

        // User scoping
        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));
        const isTeamLeader = currentUser && (currentUser.role === 'Team Leader' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Team Leader'));

        if (!isAdmin && !isTeamLeader && currentUser) {
            // Standard Employee: Filter tasks to only those assigned to current user
            allTasks = allTasks.filter(t => (t.assignee_id || t.assigneeId) === currentUser.id);

            // Filter clients to only those having at least one task assigned to this user
            clients = clients.filter(client =>
                allTasks.some(t => (t.client_id || t.clientId) === client.id)
            );
        }
        // Note: For Team Leaders, Storage.getClients and Storage.getTasks are ALREADY scoped by team.
        // So no extra manual filtering is needed here. They will see all team tasks and all tea-related clients.

        // Compute Aggregate Stats for Dashboard
        const totalTasks = allTasks.length;
        const completedTasks = allTasks.filter(t => t.status === 'Done').length;
        const inProgressTasks = allTasks.filter(t => t.status === 'In Progress').length;
        const pendingTasks = allTasks.filter(t => t.status === 'Pending').length;

        const totalEl = document.getElementById('project-total-stat');
        const completedEl = document.getElementById('project-completed-stat');
        const inProgressEl = document.getElementById('project-in-progress-stat');
        const pendingEl = document.getElementById('project-pending-stat');

        if (totalEl) totalEl.textContent = totalTasks;
        if (completedEl) completedEl.textContent = completedTasks;
        if (inProgressEl) inProgressEl.textContent = inProgressTasks;
        if (pendingEl) pendingEl.textContent = pendingTasks;

        if (clients.length === 0) {
            const msg = isAdmin
                ? 'No clients found. Add clients in "Team & Clients" to see them here.'
                : 'No projects assigned to you yet.';
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">${msg}</div>`;
            return;
        }

        grid.innerHTML = clients.map(client => {
            // Compute stats
            const clientTasks = allTasks.filter(t => (t.client_id || t.clientId) === client.id);
            const total = clientTasks.length;
            const pending = clientTasks.filter(t => t.status === 'Pending').length;
            const inProgress = clientTasks.filter(t => t.status === 'In Progress').length;
            const done = clientTasks.filter(t => t.status === 'Done').length;

            // Progress bar calculation
            const progress = total === 0 ? 0 : Math.round((done / total) * 100);

            // Escape strings for safety
            const safeName = this.escapeHtml(client.name);
            const safeId = this.escapeHtml(client.id);

            return `
    <div class="stat-card project-card" onclick="NewApp.openProjectDetail('${safeId}')" style="cursor: pointer; transition: transform 0.2s; border: 1px solid var(--border-color);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div>
                        <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">${safeName}</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary);">${clientTasks.length} Tasks</p>
                    </div>
                    <div style="background: rgba(59, 130, 246, 0.1); color: #60A5FA; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500;">
                        ${progress}% Done
                    </div>
                </div>

                <!-- Stats removed as per user request -->
                <div style="margin-bottom: 1rem;"></div>

                <div class="progress-bar" style="height: 6px;">
                    <div class="progress-fill" style="width: ${progress}%;"></div>
                </div>
            </div>
    `;
        }).join('');
    },

    async openProjectDetail(clientId) {
        const client = await Storage.getClientById(clientId);
        if (!client) return;

        // UI Switch
        document.getElementById('projects-main-view').style.display = 'none';
        const detailView = document.getElementById('project-detail-view');
        detailView.style.display = 'block';

        // Set Header
        document.getElementById('project-detail-name').textContent = client.name;

        // Back Button
        document.getElementById('back-to-projects-btn').onclick = () => this.closeProjectDetail();

        // Add Task Button with Pre-selection
        const addTaskBtn = document.getElementById('add-project-task-btn');
        if (addTaskBtn) {
            addTaskBtn.onclick = () => {
                if (typeof NewCalendar !== 'undefined') {
                    NewCalendar.openTaskModal(null, clientId); // Pass clientId to pre-select
                }
            };
        }

        // Fetch Data
        let allTasks = await Storage.getTasks();

        // User scoping
        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));
        const isTeamLeader = currentUser && (currentUser.role === 'Team Leader' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Team Leader'));

        if (!isAdmin && !isTeamLeader && currentUser) {
            // Standard Employee: Only see their own tasks
            allTasks = allTasks.filter(t => (t.assignee_id || t.assigneeId) === currentUser.id);
        }
        // Team Leaders: Storage.getTasks() is already scoped to their team, so they see all team tasks.

        const clientTasks = allTasks.filter(t => (t.client_id || t.clientId) === clientId);

        // Render Analytics Cards for this Client
        const statsRow = document.getElementById('project-stats-row');
        if (statsRow) {
            const pending = clientTasks.filter(t => t.status === 'Pending').length;
            const inProgress = clientTasks.filter(t => t.status === 'In Progress').length;
            const done = clientTasks.filter(t => t.status === 'Done').length;

            const createCard = (label, count, colorClass) => `
    <div class="stat-card" style="padding: 1rem;">
                    <div class="stat-value" style="font-size: 1.5rem;">${count}</div>
                    <div class="stat-label">${label}</div>
                </div>
    `;

            statsRow.innerHTML = `
                ${createCard('Total Tasks', clientTasks.length, '')}
                ${createCard('Pending', pending, 'pending')}
                ${createCard('In Progress', inProgress, 'in-progress')}
                ${createCard('Completed', done, 'done')}
`;
        }

        // Render Task List
        const listContainer = document.getElementById('project-tasks-list');
        if (listContainer) {
            if (clientTasks.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No tasks for this client.</div>';
            } else {
                listContainer.innerHTML = '';
                clientTasks.forEach(task => {
                    const card = this.createTaskCard(task, client); // Reuse existing card creator
                    // Remove client badge/name since we are in client view? usage preference.
                    // Actually existing card has client name, it's fine.
                    listContainer.appendChild(card);
                });
            }
        }
    },

    closeProjectDetail() {
        document.getElementById('project-detail-view').style.display = 'none';
        document.getElementById('projects-main-view').style.display = 'block';
    },
    _populateTaskFilterDropdowns(allTasks, isAdmin) {
        // Assignee filter (admin only)
        const assigneeFilter = document.getElementById('task-filter-assignee');
        if (assigneeFilter) {
            if (isAdmin) {
                assigneeFilter.style.display = 'block';
                const currentVal = assigneeFilter.value;
                const uniqueAssignees = {};
                allTasks.forEach(t => {
                    const id = t.assignee_id || t.assigneeId;
                    if (id && t.assignee) uniqueAssignees[id] = t.assignee;
                });
                assigneeFilter.innerHTML = '<option value="">All Assignees</option>';
                Object.entries(uniqueAssignees).forEach(([id, name]) => {
                    assigneeFilter.innerHTML += `<option value="${id}">${this.escapeHtml(name)}</option>`;
                });
                assigneeFilter.value = currentVal;
            } else {
                assigneeFilter.style.display = 'none';
            }
        }

        // Client filter (admin only)
        const clientFilter = document.getElementById('task-filter-client');
        if (clientFilter) {
            if (isAdmin) {
                clientFilter.style.display = 'block';
                const currentVal = clientFilter.value;
                const uniqueClients = {};
                allTasks.forEach(t => {
                    const id = t.client_id || t.clientId;
                    if (id) uniqueClients[id] = id; // We'll show ID, could lookup name
                });
                // We'll populate with names by fetching later
                clientFilter.innerHTML = '<option value="">All Clients</option>';
                Storage.getClients().then(clients => {
                    clients.forEach(c => {
                        if (uniqueClients[c.id]) {
                            clientFilter.innerHTML += `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`;
                        }
                    });
                    clientFilter.value = currentVal;
                }).catch(() => { });
            } else {
                clientFilter.style.display = 'none';
            }
        }
    },

    createTaskCard(task, client) {
        const card = document.createElement('div');
        card.className = 'stat-card glass-task-card';
        card.style.marginBottom = '1rem';
        card.style.cursor = 'pointer';

        // Add click handler to open edit modal
        card.addEventListener('click', () => {
            NewCalendar.openTaskModal(task);
        });

        const statusColors = {
            'Pending': 'rgba(245, 158, 11, 0.25)',
            'In Progress': 'rgba(59, 130, 246, 0.25)',
            'Done': 'rgba(16, 185, 129, 0.25)',
            'Cancel': 'rgba(107, 114, 128, 0.25)'
        };

        const statusBorderColors = {
            'Pending': 'rgba(245, 158, 11, 0.6)',
            'In Progress': 'rgba(59, 130, 246, 0.6)',
            'Done': 'rgba(16, 185, 129, 0.6)',
            'Cancel': 'rgba(107, 114, 128, 0.6)'
        };

        const statusTextColors = {
            'Pending': '#F59E0B',
            'In Progress': '#3B82F6',
            'Done': '#10B981',
            'Cancel': '#9CA3AF'
        };

        const stageColors = {
            'Script': 'rgba(59, 130, 246, 0.2)',
            'Shoot': 'rgba(245, 158, 11, 0.2)',
            'Edit': 'rgba(139, 92, 246, 0.2)',
            'Post': 'rgba(16, 185, 129, 0.2)',
            'Ads': 'rgba(239, 68, 68, 0.2)',
            'Meeting': 'rgba(252, 211, 77, 0.2)'
        };

        const stageBorderColors = {
            'Script': 'rgba(59, 130, 246, 0.4)',
            'Shoot': 'rgba(245, 158, 11, 0.4)',
            'Edit': 'rgba(139, 92, 246, 0.4)',
            'Post': 'rgba(16, 185, 129, 0.4)',
            'Ads': 'rgba(239, 68, 68, 0.4)',
            'Meeting': 'rgba(252, 211, 77, 0.4)'
        };

        card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
                <h3 style="font-size: 1.125rem; margin-bottom: 0.5rem; font-weight: 600;">${this.escapeHtml(task.title)}</h3>
                <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                    <span>📁 ${this.escapeHtml(task.project)}</span>
                    <span>👤 ${this.escapeHtml(task.assignee)}</span>
                    <span>📅 ${this.formatDate(task.deadline)}</span>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <span class="task-badge" style="
                        padding: 0.375rem 0.875rem; 
                        background: ${statusColors[task.status]}; 
                        border: 1px solid ${statusBorderColors[task.status]};
                        color: ${statusTextColors[task.status]}; 
                        border-radius: 6px; 
                        font-size: 0.75rem; 
                        font-weight: 600;
                        backdrop-filter: blur(10px);
                    ">${task.status}</span>
                    <span class="task-badge" style="
                        padding: 0.375rem 0.875rem; 
                        background: ${stageColors[task.stage] || 'rgba(255, 255, 255, 0.1)'}; 
                        border: 1px solid ${stageBorderColors[task.stage] || 'rgba(255, 255, 255, 0.2)'}; 
                        color: var(--text-primary);
                        border-radius: 6px; 
                        font-size: 0.75rem;
                        backdrop-filter: blur(10px);
                    ">${task.stage}</span>
                    <span class="task-badge priority-badge priority-${task.priority.toLowerCase()}" style="
                        padding: 0.375rem 0.875rem; 
                        border-radius: 6px; 
                        font-size: 0.75rem;
                    ">${task.priority}</span>
                </div>
            </div>
            <div class="action-btn edit" style="margin-left: 10px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path>
                </svg>
            </div>
        </div>
        `;

        const editBtn = card.querySelector('.action-btn.edit');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                NewCalendar.openEditTaskModal(task);
            });
        }

        return card;
    },

    async deleteEmployee(id, name) {
        if (!confirm(`Are you sure you want to delete employee "${name}"? This action cannot be undone.`)) return;

        try {
            await Storage.deleteEmployee(id);
            this.showNotification(`Employee "${name}" deleted successfully`, 'success');
            // Refresh the employee list
            if (document.getElementById('employees-grid')) {
                this.renderEmployeesPage();
            } else {
                // If on group page or other, maybe refresh that too?
                // For now, simple refresh is sufficient.
            }
        } catch (error) {
            console.error('Error deleting employee:', error);
            this.showNotification('Failed to delete employee: ' + error.message, 'error');
        }
    },

    async openEditEmployeeModal(empId) {
        try {
            let employees = [];
            if (typeof SupabaseService !== 'undefined' && window.supabase) {
                employees = await SupabaseService.getUsers();
            } else {
                employees = JSON.parse(localStorage.getItem('contentflow_users')) || [];
            }

            const emp = employees.find(e => e.id === empId);
            if (!emp) return;

            document.getElementById('edit-employee-id').value = emp.id;
            document.getElementById('edit-employee-name').value = emp.name;
            document.getElementById('edit-employee-email').value = emp.email || '';
            // Role is no longer editable in this modal
            if (document.getElementById('edit-employee-role')) {
                document.getElementById('edit-employee-role').value = emp.role || 'Employee';
            }
            if (document.getElementById('edit-employee-team')) {
                document.getElementById('edit-employee-team').value = emp.team || '';
            }

            this.openModal('edit-employee-modal');
        } catch (error) {
            console.error('Error opening edit employee modal:', error);
        }
    },

    async handleEditEmployeeSubmit() {
        const id = document.getElementById('edit-employee-id').value;
        const name = document.getElementById('edit-employee-name').value;
        const email = document.getElementById('edit-employee-email').value;
        const password = document.getElementById('edit-employee-password').value;
        const role = 'Employee'; // Role logic simplified per user request

        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));
        const isTeamLeader = currentUser && (currentUser.role === 'Team Leader' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Team Leader'));

        try {
            // Permission Check
            if (!isAdmin) {
                if (isTeamLeader) {
                    // TL can only edit if the member is in their team
                    const member = (await Storage.getEmployees()).find(e => e.id === id);
                    const currentTLTeam = currentUser.team || (currentUser.user_metadata && currentUser.user_metadata.team);
                    if (!member || member.team !== currentTLTeam) {
                        this.showNotification('Permission Denied: You can only edit members of your own team.', 'error');
                        return;
                    }
                } else {
                    this.showNotification('Permission Denied: Only Admins and Team Leaders can edit employees.', 'error');
                    return;
                }

                // Prevent TL from promoting to Admin
                if (role === 'Admin') {
                    this.showNotification('Permission Denied: Team Leaders cannot assign Admin roles.', 'error');
                    return;
                }
            }

            if (typeof SupabaseService !== 'undefined' && window.supabase) {
                const updateData = { name, email };
                if (password) updateData.password = password; // Only update if provided
                // Role is not updated via this modal, it's fixed to 'Employee' if it were to be set.

                const { error } = await window.supabase
                    .from('users')
                    .update(updateData)
                    .eq('id', id);

                if (error) throw error;
            } else {
                let users = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                users = users.map(u => {
                    if (u.id === id) {
                        const updated = { ...u, name, email };
                        if (password) updated.password = password;
                        // Role is not updated via this modal, it's fixed to 'Employee' if it were to be set.
                        return updated;
                    }
                    return u;
                });
                localStorage.setItem('contentflow_users', JSON.stringify(users));
            }

            this.closeModal('edit-employee-modal');
            this.showNotification('Employee updated successfully!');
            this.renderGroupPage(); // Correcting to renderGroupPage as per previous rebranding
            this.renderEmployeesPage(); // Sync with new Employees module
        } catch (error) {
            console.error('Failed to update employee:', error);
            this.showNotification('Error updating employee: ' + error.message, 'error');
        }
    },

    async openEditClientModal(clientId) {
        try {
            const client = await Storage.getClientById(clientId);
            if (!client) return;

            document.getElementById('edit-client-id').value = client.id;
            document.getElementById('edit-client-name').value = client.name;
            document.getElementById('edit-client-email').value = client.email;
            document.getElementById('edit-client-phone').value = client.phone || '';
            document.getElementById('edit-client-address').value = client.address || '';

            this.openModal('edit-client-modal');
        } catch (error) {
            console.error('Error opening edit client modal:', error);
        }
    },

    async handleEditClientSubmit() {
        const id = document.getElementById('edit-client-id').value;
        const name = document.getElementById('edit-client-name').value;
        const email = document.getElementById('edit-client-email').value;
        const phone = document.getElementById('edit-client-phone').value;
        const address = document.getElementById('edit-client-address').value;

        try {
            await Storage.updateClient(id, { name, email, phone, address });

            this.closeModal('edit-client-modal');
            this.showNotification('Client updated successfully!');
            this.renderClientsPage();
        } catch (error) {
            console.error('Failed to update client:', error);
            this.showNotification('Error updating client: ' + error.message, 'error');
        }
    },

    async promoteToTeamLeader(id, name, email, team) {
        if (!confirm(`Are you sure you want to promote ${name} to Team Leader of "${team || 'Unassigned'}" ? `)) return;

        try {
            // 1. Update Role in DB/Storage
            if (typeof SupabaseService !== 'undefined' && window.supabase) {
                const { error } = await window.supabase
                    .from('users')
                    .update({ role: 'Team Leader' })
                    .eq('id', id);
                if (error) throw error;
            } else {
                let users = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                users = users.map(u => u.id === id ? { ...u, role: 'Team Leader' } : u);
                localStorage.setItem('contentflow_users', JSON.stringify(users));
            }

            // 2. Mock Email Notification
            const emailBody = `
Subject: You have been promoted!

Dear ${name},

Congratulations! You have been promoted to Team Leader${team ? ' of the ' + team + ' Team' : ''}.
You now have access to team management and analytics features.

Best regards,
    Agency Admin
        `;
            console.log(`% c[MOCK EMAIL SENT]To: ${email} \n${emailBody} `, 'color: #10B981; font-weight: bold;');
            this.showNotification(`Email sent to ${email}. Promoted to Team Leader!`, 'success');

            // 3. Refresh UI
            this.renderTeamPage();
            this.renderEmployeesPage(); // Sync with new Employees module
        } catch (error) {
            console.error('Promotion failed:', error);
            this.showNotification('Failed to promote user: ' + error.message, 'error');
        }
    },

    async deleteEmployee(id, name) {
        const currentUser = Auth.getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'Admin' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Admin'));
        const isTeamLeader = currentUser && (currentUser.role === 'Team Leader' || (currentUser.user_metadata && currentUser.user_metadata.role === 'Team Leader'));

        if (!confirm(`Are you sure you want to delete employee "${name}" ? This action cannot be undone.`)) return;

        try {
            // Permission Check for TL
            if (!isAdmin && isTeamLeader) {
                // We need to check if the target employee belongs to the TL's team
                const employees = await Storage.getEmployees();
                const empToDelete = employees.find(e => e.id === id);

                // Storage.getEmployees() is already scoped for TLs, so if we find them, they are in our team.
                if (!empToDelete) {
                    this.showNotification('Permission Denied: You can only delete members of your own team.', 'error');
                    return;
                }
            } else if (!isAdmin) {
                this.showNotification('Permission Denied: Only Admins and Team Leaders can delete employees.', 'error');
                return;
            }

            await Storage.deleteEmployee(id);
            this.showNotification(`Employee ${name} deleted successfully`);
            this.renderTeamPage();
            this.renderEmployeesPage(); // Sync with new Employees module
        } catch (error) {
            console.error('Error deleting employee:', error);
            this.showNotification('Failed to delete employee: ' + error.message, 'error');
        }
    },

    async deleteClient(id, name) {
        if (!confirm(`Are you sure you want to delete client "${name}" ? This action cannot be undone.`)) return;

        try {
            await Storage.deleteClient(id);
            this.showNotification(`Client ${name} deleted successfully`);
            this.renderClientsPage();
        } catch (error) {
            console.error('Error deleting client:', error);
            this.showNotification('Failed to delete client: ' + error.message, 'error');
        }
    },

    filterTasks(filter) {
        this.renderTasks(filter);
    },

    initMobileMenu() {
        const mobileBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const navItems = document.querySelectorAll('.nav-item');

        if (mobileBtn && sidebar && overlay) {
            mobileBtn.addEventListener('click', () => {
                sidebar.classList.add('mobile-open');
                overlay.style.display = 'block';
            });

            overlay.addEventListener('click', () => {
                sidebar.classList.remove('mobile-open');
                overlay.style.display = 'none';
            });

            // Close sidebar when a nav item is clicked
            navItems.forEach(item => {
                item.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        sidebar.classList.remove('mobile-open');
                        overlay.style.display = 'none';
                    }
                });
            });
        }
    },

    // ===== Utility Functions =====
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatDate(dateString) {
        const date = new Date(dateString);
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    },

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: #3B82F6;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    },

    togglePasswordVisibility(inputId, toggleEl) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const isPassword = input.getAttribute('type') === 'password';
        input.setAttribute('type', isPassword ? 'text' : 'password');

        if (isPassword) {
            toggleEl.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>`;
        } else {
            toggleEl.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>`;
        }
    }
};

// Add notification animations
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}
`;
document.head.appendChild(style);

// Expose NewApp globally
window.NewApp = NewApp;

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NewApp.init());
} else {
    NewApp.init();
}
