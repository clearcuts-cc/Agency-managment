// ===== New Calendar Module for ContentFlow UI =====

const NewCalendar = {
    currentDate: new Date(),
    selectedDate: new Date(),

    monthNames: [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ],

    init() {
        this.renderCalendar();
        this.attachEventListeners();
    },

    async renderCalendar() {
        const calendarGrid = document.getElementById('calendar-grid');
        const monthYearDisplay = document.getElementById('calendar-month-year');

        if (!calendarGrid || !monthYearDisplay) return;

        // Update month/year display
        monthYearDisplay.textContent = `${this.monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;

        // Clear existing calendar
        calendarGrid.innerHTML = '';

        // Fetch all tasks ONCE to avoid N+1 queries
        const allTasks = await Storage.getTasks();

        // Get first day of month and number of days
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        // Get previous month's last days
        const prevMonthLastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 0);
        const prevMonthDays = prevMonthLastDay.getDate();

        // Add previous month's trailing days
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            const dayElement = this.createDayElement(day, true, -1, allTasks);
            calendarGrid.appendChild(dayElement);
        }

        // Add current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = this.createDayElement(day, false, 0, allTasks);
            calendarGrid.appendChild(dayElement);
        }

        // Add next month's leading days
        const remainingCells = 42 - (startingDayOfWeek + daysInMonth);
        for (let day = 1; day <= remainingCells; day++) {
            const dayElement = this.createDayElement(day, true, 1, allTasks);
            calendarGrid.appendChild(dayElement);
        }
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
        } else {
            // Employee click on day shows tasks for that day
            dayCell.addEventListener('click', () => {
                const tasksOnDay = allTasks.filter(t => {
                    const taskDate = new Date(t.deadline || t.created_at).toDateString();
                    return taskDate === date.toDateString();
                });
                this.showAllDayTasks(date, tasksOnDay);
            });
        }

        // Filter tasks for this day from the passed allTasks
        const tasksOnDay = allTasks.filter(t => {
            const taskDate = new Date(t.deadline || t.created_at).toDateString();
            return taskDate === date.toDateString();
        });

        // For Employees, filter ONLY tasks assigned to them
        const visibleTasks = isAdmin ? tasksOnDay : tasksOnDay.filter(t => t.assigneeId === currentUser.id);

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
        }
    },

    showTaskDetails(task) {
        // You can implement a task details modal here
        console.log('Task details:', task);
    },

    showAllDayTasks(date, tasks) {
        // You can implement a modal showing all tasks for the day
        console.log('All tasks for', date, ':', tasks);
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

        if (prevButton) {
            prevButton.addEventListener('click', () => this.previousMonth());
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => this.nextMonth());
        }

        if (todayButton) {
            todayButton.addEventListener('click', () => this.goToToday());
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
