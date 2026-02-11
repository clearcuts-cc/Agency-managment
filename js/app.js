// ===== New App Module for ContentFlow UI =====

const NewApp = {
    currentPage: 'calendar',

    async init() {
        console.log('Initializing Application...');

        // Check for active session
        if (!Auth.checkAuth()) return;

        // Initialize User & Sidebar
        this.updateUserDisplay();
        this.checkRoleAccess();

        // Initialize Modules
        if (typeof NotificationService !== 'undefined') {
            // Poll for notifications every 30s
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

        // Default to Calendar
        this.handleNavigation('calendar');

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

        // Selectors
        const adminSection = document.getElementById('admin-menu-section');
        const analyticsNav = document.querySelector('a[data-page="analytics"]');
        const settingsNav = document.querySelector('a[data-page="settings"]');
        const employeeDashboard = document.getElementById('my-dashboard-nav');
        const createBtn = document.getElementById('create-task-btn');

        if (isAdmin) {
            // Admin sees EVERYTHING
            if (adminSection) adminSection.style.display = 'block';
            if (analyticsNav) analyticsNav.style.display = 'flex';
            if (settingsNav) settingsNav.style.display = 'flex';
            if (createBtn) createBtn.style.display = 'flex';
            if (employeeDashboard) employeeDashboard.style.display = 'none';
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
        // Show toast
        if (notifications.length > 0 && typeof this.showNotification === 'function') {
            this.showNotification(`You have ${notifications.length} new notification(s)`);
        }
    },

    async updateNotificationBadge() {
        if (typeof NotificationService === 'undefined') return;

        const notifications = await NotificationService.getNotifications();
        const count = notifications.filter(n => !n.is_read).length;

        const badge = document.getElementById('notification-count');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }

        // Update panel list
        const list = document.getElementById('notification-list');
        if (list) {
            if (notifications.length === 0) {
                list.innerHTML = '<p style="color:var(--text-secondary); font-size:0.8rem; text-align:center;">No new notifications</p>';
            } else {
                list.innerHTML = notifications.map(n => `
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


    // ===== Settings & Profile =====
    attachSettingsListeners() {
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.handleNavigation('settings'); // Changed from navigateToPage
                this.loadSettings();
            });
        }

        const profileForm = document.getElementById('profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProfile();
            });
        }

        const testBtn = document.getElementById('test-notification-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                if (window.notifications) Notifications.show('This is a test notification!', 'info');
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

            // 6. User Profile -> Settings
            const profile = target.closest('#sidebar-user-profile') || target.closest('.user-mini-profile');
            // Ensure we are not clicking logout or notification bell inside profile
            if (profile && !target.closest('#notification-bell')) {
                e.preventDefault();
                this.handleNavigation('settings');
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
            'cancel-edit-client': 'edit-client-modal'
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
                this.populateTaskDropdowns();
            }
        } else {
            console.error(`Modal not found: ${modalId}`);
        }
    },

    async populateTaskDropdowns() {
        const user = Auth.getCurrentUser();
        const role = (user && user.role) ? user.role.toLowerCase() : 'admin'; // Default to admin for safety in this check
        const isAdmin = role === 'admin';

        console.log('Populating Dropdowns - User Role:', role, 'isAdmin:', isAdmin);

        // 1. Assignee Dropdown
        const assigneeGroup = document.getElementById('task-assignee-group');
        const assigneeSelect = document.getElementById('task-assignee');

        if (assigneeGroup && assigneeSelect) {
            // ALWAYS SHOW for now if we are debugging why it's missing, 
            // but let's stick to the Admin requirement and just make it more reliable.
            if (isAdmin) {
                assigneeGroup.style.setProperty('display', 'block', 'important');
                assigneeSelect.innerHTML = '<option value="">Select Employee</option>';

                let employees = [];
                try {
                    if (window.SupabaseService && window.supabase) {
                        const allUsers = await window.SupabaseService.getUsers();
                        employees = allUsers.filter(u => u.role && u.role.toLowerCase() === 'employee');
                    } else {
                        // Fallback to local storage
                        const localUsers = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                        employees = localUsers.filter(u => u.role && u.role.toLowerCase() === 'employee');
                    }
                } catch (error) {
                    console.error('Error fetching employees:', error);
                    const localUsers = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                    employees = localUsers.filter(u => u.role && u.role.toLowerCase() === 'employee');
                }

                if (employees.length === 0) {
                    const option = document.createElement('option');
                    option.value = "";
                    option.textContent = "No Employees Found (Add them in Team)";
                    assigneeSelect.appendChild(option);
                } else {
                    employees.forEach(emp => {
                        const option = document.createElement('option');
                        option.value = emp.id;
                        option.textContent = emp.name;
                        assigneeSelect.appendChild(option);
                    });
                }
            } else {
                assigneeGroup.style.display = 'none';
            }
        }

        // 2. Client Dropdown
        const clientSelect = document.getElementById('task-client');
        if (clientSelect) {
            clientSelect.innerHTML = '<option value="">Select Client</option>';
            try {
                const clients = await Storage.getClients();
                if (clients.length === 0) {
                    const option = document.createElement('option');
                    option.value = "";
                    option.textContent = "No Clients Found (Add them in Clients)";
                    clientSelect.appendChild(option);
                } else {
                    clients.forEach(client => {
                        const option = document.createElement('option');
                        option.value = client.id;
                        option.textContent = client.name;
                        clientSelect.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Error fetching clients:', error);
            }
        }
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
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        const activePage = document.getElementById(`${pageId}-page`);
        if (activePage) {
            activePage.classList.add('active');
            this.currentPage = pageId;

            // Refresh content when switching pages
            if (pageId === 'analytics') {
                this.renderAnalytics();
            } else if (pageId === 'tasks') {
                this.renderTasks();
            } else if (pageId === 'client-approvals') {
                this.renderTeamPage();
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
                assigneeName = assigneeSelect.options[assigneeSelect.selectedIndex].text;
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

        // Send Notification to Employee (Red Dot)
        if (assigneeId !== currentUser.id) {
            if (typeof NotificationService !== 'undefined') {
                await NotificationService.createNotification(
                    assigneeId,
                    `New Task: ${title}`,
                    'info',
                    { taskId: title }
                );
            }
        }

        this.closeModal('task-modal');
        NewCalendar.refresh();
        await this.renderAnalytics();
        await this.renderTasks();
        this.showNotification('Task created successfully!');
    },

    async handleEditTaskSubmit() {
        const taskId = document.getElementById('edit-task-id').value;
        const title = document.getElementById('edit-task-title').value;
        const taskType = document.getElementById('edit-task-type').value;
        const status = document.getElementById('edit-task-status').value;
        const assignedDate = document.getElementById('edit-task-assigned-date').value;
        const dueDate = document.getElementById('edit-task-due-date').value || assignedDate;

        await Storage.updateTask(taskId, {
            title,
            stage: taskType,
            status,
            deadline: dueDate
        });

        this.closeModal('edit-task-modal');
        NewCalendar.refresh();
        await this.renderAnalytics();
        await this.renderTasks();
        this.showNotification('Task updated successfully!');
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
        const email = document.getElementById('client-email').value;
        const phone = document.getElementById('client-phone').value;
        const address = document.getElementById('client-address').value;

        try {
            await Storage.addClient({
                name,
                email,
                phone,
                address,
                status: 'Approved'
            });

            this.closeModal('client-modal');
            this.showNotification('Client added successfully!', 'success');

            // Refresh visuals
            this.renderTeamPage();
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

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passInput.value;

        // Use Auth to resolve creation
        const result = await Auth.createEmployee(name, email, password);

        if (result.success) {
            this.closeModal('employee-modal');
            this.showNotification(result.message || 'Employee account created successfully!');

            // Refresh Team List
            this.renderTeamPage();

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
                        label: 'Tasks',
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
                        label: 'Tasks Created',
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


    filterAnalytics(period) {
        console.log('Filter analytics by:', period);
        // Implement period filtering logic here
    },

    // ===== Team & Clients Rendering =====
    async renderTeamPage() {
        const empContainer = document.getElementById('employee-list-container');
        const clientContainer = document.getElementById('client-list-container');

        if (!empContainer && !clientContainer) return;

        // Employees
        if (empContainer) {
            let employees = [];

            if (typeof SupabaseService !== 'undefined' && window.supabase) {
                try {
                    const allUsers = await SupabaseService.getUsers();
                    employees = allUsers.filter(u => u.role && u.role.toLowerCase() === 'employee');
                } catch (error) {
                    console.error('Failed to fetch users from Supabase:', error);
                    // Fallback to local
                    const allUsers = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                    employees = allUsers.filter(u => u.role && u.role.toLowerCase() === 'employee');
                }
            } else {
                const allUsers = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                employees = allUsers.filter(u => u.role && u.role.toLowerCase() === 'employee');
            }

            if (employees.length === 0) {
                empContainer.innerHTML = '<div style="text-align:center; padding:1rem; color:var(--text-secondary);">No employees added yet</div>';
            } else {
                empContainer.innerHTML = employees.map(emp => {
                    const initials = emp.avatar || (emp.name ? Auth.getInitials(emp.name) : 'EE');
                    return `
                    <div style="background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; gap: 1rem;">
                        <div class="user-avatar" style="width: 40px; height: 40px; font-size: 1rem;">${initials}</div>
                        <div style="flex:1;">
                            <div style="font-weight: 500; font-size: 0.95rem;">${emp.name}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">${emp.email}</div>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                             <span class="task-badge" style="background: rgba(59, 130, 246, 0.1); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.2); margin-right: 0.5rem;">${emp.role || 'Employee'}</span>
                             <button class="action-btn edit" onclick="NewApp.openEditEmployeeModal('${emp.id}')" title="Edit Employee">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path>
                                </svg>
                             </button>
                        </div>
                    </div>
                `;
                }).join('');
            }
        }

        // Clients
        if (clientContainer) {
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
                        </div>
                    </div>
                 `).join('');
            }
        }
    },

    // ===== Tasks Rendering =====
    async renderTasks(filter = 'all') {
        const tasksList = document.getElementById('tasks-list');
        if (!tasksList) return;

        let tasks = await Storage.getTasks();

        // Apply filter
        if (filter !== 'all') {
            const statusMap = {
                'pending': 'Pending',
                'in-progress': 'In Progress',
                'done': 'Done'
            };
            tasks = tasks.filter(t => t.status === statusMap[filter]);
        }

        if (tasks.length === 0) {
            tasksList.innerHTML = `
                <div style="text-align: center; padding: 4rem; color: var(--text-secondary);">
                    <p>No tasks found</p>
                </div>
            `;
            return;
        }

        tasksList.innerHTML = '';

        // Use a loop to handle async client fetching if needed in future, 
        // currently client fetching is sync but good to prepare.
        for (const task of tasks) {
            const client = await Storage.getClientById(task.clientId);
            const taskCard = this.createTaskCard(task, client);
            tasksList.appendChild(taskCard);
        }
    },

    createTaskCard(task, client) {
        const card = document.createElement('div');
        card.className = 'stat-card glass-task-card';
        card.style.marginBottom = '1rem';
        card.style.cursor = 'pointer';

        // Add click handler to open edit modal
        card.addEventListener('click', () => {
            NewCalendar.openEditTaskModal(task);
        });

        const statusColors = {
            'Pending': 'rgba(245, 158, 11, 0.25)',
            'In Progress': 'rgba(59, 130, 246, 0.25)',
            'Done': 'rgba(16, 185, 129, 0.25)'
        };

        const statusBorderColors = {
            'Pending': 'rgba(245, 158, 11, 0.6)',
            'In Progress': 'rgba(59, 130, 246, 0.6)',
            'Done': 'rgba(16, 185, 129, 0.6)'
        };

        const statusTextColors = {
            'Pending': '#F59E0B',
            'In Progress': '#3B82F6',
            'Done': '#10B981'
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
            document.getElementById('edit-employee-role').value = emp.role || 'Employee';

            this.openModal('edit-employee-modal');
        } catch (error) {
            console.error('Error opening edit employee modal:', error);
        }
    },

    async handleEditEmployeeSubmit() {
        const id = document.getElementById('edit-employee-id').value;
        const name = document.getElementById('edit-employee-name').value;
        const role = document.getElementById('edit-employee-role').value;

        try {
            if (typeof SupabaseService !== 'undefined' && window.supabase) {
                const { error } = await window.supabase
                    .from('users')
                    .update({ name, role })
                    .eq('id', id);

                if (error) throw error;
            } else {
                let users = JSON.parse(localStorage.getItem('contentflow_users')) || [];
                users = users.map(u => u.id === id ? { ...u, name, role } : u);
                localStorage.setItem('contentflow_users', JSON.stringify(users));
            }

            this.closeModal('edit-employee-modal');
            this.showNotification('Employee updated successfully!');
            this.renderTeamPage();
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
            this.renderTeamPage();
        } catch (error) {
            console.error('Failed to update client:', error);
            this.showNotification('Error updating client: ' + error.message, 'error');
        }
    },

    filterTasks(filter) {
        this.renderTasks(filter);
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
            background: var(--accent-blue);
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

        // Toggle SVG icon
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
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NewApp.init());
} else {
    NewApp.init();
}
