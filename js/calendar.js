// ===== New Calendar Module for ContentFlow UI =====

const NewCalendar = {
    currentDate: new Date(),
    selectedDate: new Date(),

    monthNames: [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ],

    init() {
        this.populateYearDropdown();
        this.renderCalendar();
        this.attachEventListeners();
    },

    populateYearDropdown() {
        const yearSelect = document.getElementById('calendar-year-select');
        if (!yearSelect) return;

        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 5;
        const endYear = currentYear + 10;

        yearSelect.innerHTML = '';
        for (let year = startYear; year <= endYear; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    },

    changeMonth(monthIndex) {
        // Directly set the month to the selected value
        this.currentDate = new Date(this.currentDate.getFullYear(), parseInt(monthIndex), 1);
        this.renderCalendar();
    },

    changeYear(year) {
        // Directly set the year to the selected value
        this.currentDate = new Date(parseInt(year), this.currentDate.getMonth(), 1);
        this.renderCalendar();
    },

    async renderCalendar() {
        // Prevent recursive rendering
        if (this.isRendering) return;
        this.isRendering = true;

        const calendarGrid = document.getElementById('calendar-grid');
        const monthSelect = document.getElementById('calendar-month-select');
        const yearSelect = document.getElementById('calendar-year-select');

        if (!calendarGrid) {
            this.isRendering = false;
            return;
        }

        // Update month and year selects
        if (monthSelect) {
            monthSelect.value = this.currentDate.getMonth();
        }
        if (yearSelect) {
            yearSelect.value = this.currentDate.getFullYear();
        }

        // Clear existing calendar
        calendarGrid.innerHTML = '';

        // Fetch all tasks ONCE to avoid N+1 queries
        this.allTasks = await Storage.getTasks();
        const allTasks = this.allTasks;

        // Get first day of month and number of days
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        // Add empty cells for days before the month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day-cell empty-cell';
            calendarGrid.appendChild(emptyCell);
        }

        // Add current month's days only
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = this.createDayElement(day, false, 0, allTasks);
            calendarGrid.appendChild(dayElement);
        }

        // Update Date View if active
        const dateView = document.getElementById('date-view');
        if (dateView && dateView.style.display !== 'none' && this.selectedDate) {
            const date = this.selectedDate;
            const tasksOnDay = allTasks.filter(t => {
                const taskDate = new Date(t.deadline || t.created_at).toDateString();
                return taskDate === date.toDateString();
            });
            const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
            const isAdmin = currentUser && currentUser.role === 'Admin';
            const visibleTasks = isAdmin ? tasksOnDay : tasksOnDay.filter(t => t.assigneeId === currentUser.id);

            this.renderDateView(date, visibleTasks);
        }

        // Reset rendering flag
        this.isRendering = false;
    },

    createDayElement(day, isOtherMonth, monthOffset, allTasks = []) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day-cell';

        // Calculate the actual date
        const date = new Date(
            this.currentDate.getFullYear(),
            this.currentDate.getMonth() + monthOffset,
            day
        );

        // Add classes
        if (isOtherMonth) {
            dayCell.classList.add('other-month');
        }

        // Check if it's today
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            dayCell.classList.add('today');
        }

        // Create day number
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        if (date.toDateString() === today.toDateString()) {
            dayNumber.classList.add('today');
        }
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
        const isAdmin = currentUser && currentUser.role === 'Admin';

        // Add task button (Admin Only)
        if (isAdmin) {
            const addBtn = document.createElement('button');
            addBtn.className = 'add-task-btn';
            addBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            `;
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openTaskModal(date);
            });
            dayCell.appendChild(addBtn);
        }

        // Filter tasks for this day from the passed allTasks
        const tasksOnDay = allTasks.filter(t => {
            const taskDate = new Date(t.deadline || t.created_at).toDateString();
            return taskDate === date.toDateString();
        });

        // For Employees, filter ONLY tasks assigned to them
        const visibleTasks = isAdmin ? tasksOnDay : tasksOnDay.filter(t => t.assigneeId === currentUser.id);

        // Click handler for the whole cell to open Date View
        dayCell.addEventListener('click', (e) => {
            // Don't trigger if clicking add button or task pills (they stop propagation)
            this.renderDateView(date, visibleTasks);
        });

        // Create tasks container
        const dayTasks = document.createElement('div');
        dayTasks.className = 'day-tasks';

        // Add task pills (max 3 visible)
        visibleTasks.slice(0, 3).forEach(task => {
            const taskPill = document.createElement('div');
            taskPill.className = `task-pill ${task.stage.toLowerCase()}`;
            taskPill.textContent = task.title;
            taskPill.title = `${task.title} - ${task.status}`;
            taskPill.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditTaskModal(task);
            });
            dayTasks.appendChild(taskPill);
        });

        // Add "more" indicator if there are more than 3 tasks
        if (visibleTasks.length > 3) {
            const morePill = document.createElement('div');
            morePill.className = 'task-pill';
            morePill.style.background = '#374151';
            morePill.textContent = `+${visibleTasks.length - 3} more`;
            morePill.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showAllDayTasks(date, visibleTasks);
            });
            dayTasks.appendChild(morePill);
        }

        dayCell.appendChild(dayTasks);

        return dayCell;
    },

    openTaskModal(date) {
        const modal = document.getElementById('task-modal');
        const assignedDateInput = document.getElementById('task-assigned-date');
        const dueDateInput = document.getElementById('task-due-date');

        // Set assigned date to selected date
        if (assignedDateInput && date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            assignedDateInput.value = `${year}-${month}-${day}`;
        }

        // Optionally set due date to same date
        if (dueDateInput && date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            dueDateInput.value = `${year}-${month}-${day}`;
        }

        if (modal) {
            modal.classList.add('active');
            // FIX: Call NewApp.populateTaskDropdowns to ensure employees are listed
            if (typeof NewApp !== 'undefined' && NewApp.populateTaskDropdowns) {
                NewApp.populateTaskDropdowns().catch(console.error);
            }
        }
    },

    openEditTaskModal(task) {
        const modal = document.getElementById('edit-task-modal');

        // Populate form with task data
        document.getElementById('edit-task-id').value = task.id;
        document.getElementById('edit-task-title').value = task.title;
        document.getElementById('edit-task-type').value = task.stage;
        document.getElementById('edit-task-status').value = task.status;

        // Format dates for input fields
        const deadlineDate = new Date(task.deadline);
        const year = deadlineDate.getFullYear();
        const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
        const day = String(deadlineDate.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;

        document.getElementById('edit-task-assigned-date').value = formattedDate;
        document.getElementById('edit-task-due-date').value = formattedDate;

        if (modal) {
            modal.classList.add('active');
            // FIX: Call NewApp.populateTaskDropdowns to ensure employees are listed
            if (typeof NewApp !== 'undefined' && NewApp.populateTaskDropdowns) {
                NewApp.populateTaskDropdowns().catch(console.error);
            }
        }
    },

    showTaskDetails(task) {
        // You can implement a task details modal here
        console.log('Task details:', task);
    },

    renderDateView(date, tasks) {
        const mainView = document.getElementById('main-calendar-view');
        const dateView = document.getElementById('date-view');
        const dateTitle = document.getElementById('date-view-title');
        const tasksContainer = document.getElementById('date-view-tasks-container');
        const addTaskBtn = document.getElementById('add-task-date-view-btn');

        if (!mainView || !dateView || !dateTitle || !tasksContainer) return;

        // format date like "February 14, 2026"
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateTitle.textContent = date.toLocaleDateString('en-US', options);

        // Clear existing tasks
        tasksContainer.innerHTML = '';

        if (tasks.length === 0) {
            tasksContainer.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color);">No tasks scheduled for this day.</div>';
        } else {
            tasks.forEach(task => {
                const taskCard = document.createElement('div');
                taskCard.className = 'glass-panel';
                taskCard.style.padding = '1rem';
                taskCard.style.borderRadius = 'var(--radius-md)';
                taskCard.style.marginBottom = '0.5rem'; // Add margin for spacing
                taskCard.style.display = 'flex';
                taskCard.style.justifyContent = 'space-between';
                taskCard.style.alignItems = 'center';
                taskCard.style.cursor = 'pointer';
                taskCard.style.background = 'var(--bg-card)';
                taskCard.style.border = '1px solid var(--border-color)';
                taskCard.style.transition = 'var(--transition)';

                taskCard.onmouseenter = () => {
                    taskCard.style.borderColor = 'var(--border-hover)';
                    taskCard.style.transform = 'translateY(-2px)';
                };
                taskCard.onmouseleave = () => {
                    taskCard.style.borderColor = 'var(--border-color)';
                    taskCard.style.transform = 'translateY(0)';
                };

                const typeClass = task.stage ? task.stage.toLowerCase() : 'bg-gray-500';

                taskCard.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span class="task-pill ${typeClass}" style="min-width: 60px; text-align: center;">${task.stage}</span>
                        <div>
                            <h4 style="font-weight: 600; margin-bottom: 0.25rem; font-size: 1rem;">${task.title}</h4>
                            <p style="font-size: 0.8rem; color: var(--text-secondary);">${task.client_name || 'No Client'}</p>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                         <div style="text-align: right; margin-right: 1rem;">
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Deadline</div>
                            <div style="font-size: 0.85rem; font-weight: 500;">${new Date(task.deadline).toLocaleDateString()}</div>
                        </div>
                        <span class="status-badge" style="font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; background: var(--bg-elevated); border: 1px solid var(--border-color);">${task.status}</span>
                    </div>
                `;

                taskCard.addEventListener('click', () => {
                    this.openEditTaskModal(task);
                });

                tasksContainer.appendChild(taskCard);
            });
        }

        // Setup Add Task button for this date
        if (addTaskBtn) {
            const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
            const isAdmin = currentUser && currentUser.role === 'Admin';

            if (isAdmin) {
                addTaskBtn.style.display = 'block';
                addTaskBtn.onclick = () => {
                    this.openTaskModal(date);
                };
            } else {
                addTaskBtn.style.display = 'none';
            }
        }

        // Switch views
        mainView.style.display = 'none';
        dateView.style.display = 'block';
        this.selectedDate = date;
    },

    backToCalendar() {
        const mainView = document.getElementById('main-calendar-view');
        const dateView = document.getElementById('date-view');

        if (mainView && dateView) {
            dateView.style.display = 'none';
            mainView.style.display = 'block';
            this.renderCalendar();
        }
    },

    showAllDayTasks(date, tasks) {
        this.renderDateView(date, tasks);
    },

    previousMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.renderCalendar();
    },

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.renderCalendar();
    },

    goToToday() {
        this.currentDate = new Date();
        this.renderCalendar();
    },

    attachEventListeners() {
        const prevButton = document.getElementById('prev-month');
        const nextButton = document.getElementById('next-month');
        const todayButton = document.getElementById('today-btn');
        const backButton = document.getElementById('back-to-calendar-btn');
        const monthSelect = document.getElementById('calendar-month-select');
        const yearSelect = document.getElementById('calendar-year-select');

        if (prevButton) {
            prevButton.addEventListener('click', () => this.previousMonth());
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => this.nextMonth());
        }

        if (todayButton) {
            todayButton.addEventListener('click', () => this.goToToday());
        }

        if (backButton) {
            backButton.addEventListener('click', () => this.backToCalendar());
        }

        if (monthSelect) {
            monthSelect.addEventListener('change', (e) => this.changeMonth(e.target.value));
        }

        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => this.changeYear(e.target.value));
        }
    },

    refresh() {
        this.renderCalendar();
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NewCalendar.init());
} else {
    NewCalendar.init();
}
