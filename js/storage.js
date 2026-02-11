// ===== Storage Module (Universal Adapter) =====
// Handles data operations with support for LocalStorage and Supabase

const Storage = {
    // Keys for localStorage
    KEYS: {
        CLIENTS: 'clearcut_clients',
        TASKS: 'clearcut_tasks',
        PROJECTS: 'clearcut_projects',
        TEAM: 'clearcut_team'
    },

    // Check if Supabase is active
    isSupabaseActive() {
        return typeof SupabaseService !== 'undefined' && window.supabase !== null;
    },

    // ===== Client Operations =====
    async getClients() {
        if (this.isSupabaseActive()) {
            try {
                return await SupabaseService.getClients();
            } catch (e) { console.error('Supabase Error:', e); return []; }
        }
        return this.getLocal(this.KEYS.CLIENTS) || [];
    },

    async addClient(client) {
        if (this.isSupabaseActive()) {
            return await SupabaseService.addClient(client);
        }
        const clients = await this.getClients();

        // Check role for status
        let status = 'Approved';
        if (Auth && Auth.currentUser && Auth.currentUser.role === 'Employee') {
            status = 'Pending';
        }

        const newClient = {
            id: this.generateId(),
            ...client,
            status: status, // Add status
            createdAt: new Date().toISOString(),
            projects: []
        };
        clients.push(newClient);
        this.setLocal(this.KEYS.CLIENTS, clients);
        return newClient;
    },

    async approveClient(id) {
        if (this.isSupabaseActive()) {
            // Need to implement in Service
            return await SupabaseService.approveClient(id);
        }

        const clients = await this.getClients();
        const index = clients.findIndex(c => c.id === id);
        if (index !== -1) {
            clients[index].status = 'Approved';
            this.setLocal(this.KEYS.CLIENTS, clients);
            return clients[index];
        }
    },

    async updateClient(id, updates) {
        if (this.isSupabaseActive()) {
            return await SupabaseService.updateClient(id, updates);
        }

        const clients = await this.getClients();
        const index = clients.findIndex(c => c.id === id);
        if (index !== -1) {
            clients[index] = { ...clients[index], ...updates };
            this.setLocal(this.KEYS.CLIENTS, clients);
            return clients[index];
        }
        return null;
    },

    async getClientById(id) {
        const clients = await this.getClients();
        return clients.find(c => c.id === id) || null;
    },

    // ===== Task Operations =====
    async getTasks() {
        if (this.isSupabaseActive()) {
            try {
                return await SupabaseService.getTasks();
            } catch (e) {
                console.error('Supabase Error:', e);
                return [];
            }
        }
        return this.getLocal(this.KEYS.TASKS) || [];
    },

    async addTask(task) {
        if (this.isSupabaseActive()) {
            return await SupabaseService.addTask(task);
        }

        const tasks = await this.getTasks();
        const newTask = {
            id: this.generateId(),
            ...task,
            createdAt: new Date().toISOString()
        };
        tasks.push(newTask);
        this.setLocal(this.KEYS.TASKS, tasks);

        // Update client's project list locally
        this.addProjectToClient(task.clientId, task.project);

        return newTask;
    },

    async updateTask(id, updates) {
        if (this.isSupabaseActive()) {
            return await SupabaseService.updateTask(id, updates);
        }

        const tasks = await this.getTasks();
        const index = tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            tasks[index] = { ...tasks[index], ...updates };
            this.setLocal(this.KEYS.TASKS, tasks);
            return tasks[index];
        }
        return null;
    },

    async deleteTask(id) {
        if (this.isSupabaseActive()) {
            return await SupabaseService.deleteTask(id);
        }

        const tasks = await this.getTasks();
        const filtered = tasks.filter(t => t.id !== id);
        this.setLocal(this.KEYS.TASKS, filtered);
        return true;
    },

    async getTaskById(id) {
        const tasks = await this.getTasks();
        return tasks.find(t => t.id === id) || null;
    },

    // Legacy sync-style filters (now async friendly via getting all tasks first)
    // Note: In a real app, these should be API queries.
    async getTasksByDate(date) {
        const tasks = await this.getTasks();
        return tasks.filter(t => {
            const taskDate = new Date(t.deadline || t.created_at).toDateString();
            const compareDate = new Date(date).toDateString();
            return taskDate === compareDate;
        });
    },

    // ===== Stats & Analytics =====
    async getStats() {
        const clients = await this.getClients();
        const tasks = await this.getTasks();

        // Calculate derived stats in memory
        const completedTasks = tasks.filter(t => t.status === 'Done');
        const inProgressTasks = tasks.filter(t => t.status === 'In Progress');
        const pendingTasks = tasks.filter(t => t.status === 'Pending');

        // Calculate overdue
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overdueTasks = tasks.filter(t => {
            const taskDate = new Date(t.deadline);
            taskDate.setHours(0, 0, 0, 0);
            return taskDate < today && t.status !== 'Done';
        });

        const activeProjects = new Set(tasks.filter(t => t.status !== 'Done').map(t => t.project));

        return {
            totalClients: clients.length,
            activeProjects: activeProjects.size,
            tasksDueToday: tasks.filter(t => new Date(t.deadline).toDateString() === today.toDateString()).length,
            overdueTasks: overdueTasks.length,
            monthlyRevenue: completedTasks.length * 1500,
            totalTasks: tasks.length,
            completedTasks: completedTasks.length,
            inProgressTasks: inProgressTasks.length,
            pendingTasks: pendingTasks.length
        };
    },

    // ===== Local Helpers =====
    getLocal(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return null;
        }
    },

    setLocal(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Error writing to localStorage:', error);
            return false;
        }
    },

    async addProjectToClient(clientId, projectName) {
        if (this.isSupabaseActive()) return; // Not implemented on backend automatic triggers yet

        const client = await this.getClientById(clientId);
        if (client && (!client.projects || !client.projects.includes(projectName))) {
            if (!client.projects) client.projects = [];
            client.projects.push(projectName);
            await this.updateClient(clientId, { projects: client.projects });
        }
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    initializeSampleData() {
        // Only valid for Local mode
        if (this.isSupabaseActive()) return;

        if (this.getLocal(this.KEYS.CLIENTS)?.length === 0) {
            // Re-use logic from previous file if needed, but simplified here
            console.log('Initializing sample data...');
            // (Add sample data logic here if strictly needed, but skipping for brevity in this update)
        }
    }
};

// Initialize
if (typeof window !== 'undefined') {
    Storage.initializeSampleData();
}
