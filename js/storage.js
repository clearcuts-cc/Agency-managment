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
        let clients = [];
        if (this.isSupabaseActive()) {
            try {
                clients = await SupabaseService.getClients();
            } catch (e) {
                console.error('Supabase Error:', e);
                clients = [];
            }
        } else {
            clients = this.getLocal(this.KEYS.CLIENTS) || [];
        }

        // Team Leader Scoping
        if (Auth.currentUser && (Auth.currentUser.role === 'Team Leader' || Auth.currentUser.role === 'TL')) {
            const tasks = await this.getTasks(); // This is already scoped for TLs
            const clientIdsWithTeamTasks = new Set(tasks.map(t => t.client_id || t.clientId));
            return clients.filter(c => clientIdsWithTeamTasks.has(c.id));
        }

        return clients;
    },

    // === User/Employee Operations ===
    async getEmployees() {
        let allUsers = [];

        // 1. Try Supabase
        if (this.isSupabaseActive()) {
            try {
                allUsers = await SupabaseService.getUsers();
            } catch (e) {
                console.error('Supabase getEmployees Error:', e);
                return [];
            }
        } else {
            // Fallback to local only if Supabase is NOT active (e.g. offline dev mode)
            allUsers = this.getLocal('contentflow_users') || [];
        }

        // Filter for Employees and Managers (Excluding Admins from the basic list as requested)
        return allUsers.filter(u => {
            // Team Leader Scoping
            if (Auth.currentUser && (Auth.currentUser.role === 'Team Leader' || Auth.currentUser.role === 'TL')) {
                // If TL has no team, they see nothing or everything? Plan says "Show only members where member.team === tl.team"
                if (!Auth.currentUser.team) return false; // Strict scoping
                if (u.team !== Auth.currentUser.team) return false;
            }

            // Default to 'employee' if role is missing (e.g. Supabase Schema issue)
            const r = (u.role || 'employee').toLowerCase();
            return r === 'employee' || r === 'manager' || r === 'team leader' || r === 'tl';
        });
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

    async deleteClient(id) {
        if (this.isSupabaseActive()) {
            try {
                await SupabaseService.deleteClient(id);
            } catch (e) {
                console.error('Supabase Delete Client Error:', e);
                // Continue to local deletion anyway
            }
        }

        const clients = await this.getClients();
        const filtered = clients.filter(c => c.id !== id);
        this.setLocal(this.KEYS.CLIENTS, filtered);
        return true;
    },

    async deleteEmployee(id) {
        if (this.isSupabaseActive()) {
            try {
                await SupabaseService.deleteUser(id);
            } catch (e) {
                console.error('Supabase Delete User Error:', e);
                // Continue to local deletion anyway
            }
        }

        // Always clean up local storage as well to prevent "ghost" records
        const employees = this.getLocal('contentflow_users') || [];
        const filtered = employees.filter(e => e.id !== id);
        this.setLocal('contentflow_users', filtered);
        return true;
    },

    async getClientById(id) {
        const clients = await this.getClients();
        return clients.find(c => c.id === id) || null;
    },

    // ===== Task Operations =====
    async getTasks() {
        let tasks = [];
        if (this.isSupabaseActive()) {
            try {
                tasks = await SupabaseService.getTasks();
            } catch (e) {
                console.error('Supabase Error:', e);
                tasks = [];
            }
        } else {
            tasks = this.getLocal(this.KEYS.TASKS) || [];
        }

        // Team Leader Scoping
        if (Auth.currentUser && (Auth.currentUser.role === 'Team Leader' || Auth.currentUser.role === 'TL')) {
            if (!Auth.currentUser.team) return []; // Strict scoping

            // Get team members (including self if in team)
            const teamMembers = await this.getEmployees();
            const teamMemberIds = teamMembers.map(u => u.id);

            // Also include tasks created by TL? (Optional, plan says "manage their own team's data")
            // Usually TL should see tasks assigned to team members.
            // And maybe tasks they created?
            // Let's stick to "assigned to team members". 
            // If TL assigns a task to someone outside, they lose visibility?
            // "Scoping: Restrict Team Leaders' access to only their team's data (employees, tasks, etc.)."
            // So if checks "assigned to team member", then yes.

            return tasks.filter(t => {
                // Task matches if assignee is in team ID list
                // OR if assignee is missing (unassigned) and TL created it? (Maybe)
                // Let's stick to assignee match.
                // Note: t.assigneeId might be string or number. IDs are usually strings here.
                return teamMemberIds.includes(t.assigneeId) || teamMemberIds.includes(t.assignee_id);
            });
        }

        return tasks;
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

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // ===== TEAM CRUD OPERATIONS =====
    // Storing teams locally as metadata since Supabase table might not exist
    async getTeams() {
        // 1. Try Supabase (if table exists - optional future proofing)
        // For now, use LocalStorage 'clearcut_teams'
        return this.getLocal('clearcut_teams') || [];
    },

    async addTeam(name, description) {
        const teams = await this.getTeams();
        const newTeam = {
            id: this.generateId(),
            name,
            description,
            createdAt: new Date().toISOString()
        };
        teams.push(newTeam);
        this.setLocal('clearcut_teams', teams);
        return newTeam;
    },

    async deleteTeam(id) {
        const teams = await this.getTeams();
        const filtered = teams.filter(t => t.id !== id);
        this.setLocal('clearcut_teams', filtered);
        return true;
    },

    async getTeamById(id) {
        const teams = await this.getTeams();
        return teams.find(t => t.id === id) || null;
    },

    // Aliases for Group nomenclature
    async getGroups() { return this.getTeams(); },
    async addGroup(name, description) { return this.addTeam(name, description); },
    async deleteGroup(id) { return this.deleteTeam(id); },
    async getGroupById(id) { return this.getTeamById(id); },

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

    // === SYNC ===
    async syncLocalToCloud() {
        if (!this.isSupabaseActive()) {
            console.warn('Cannot sync: Supabase not active.');
            return { success: false, message: 'Supabase not connected' };
        }

        console.log('Starting Sync: Local -> Cloud...');
        let successCount = 0;
        let failCount = 0;

        // 1. Sync Users
        const localUsers = this.getLocal('contentflow_users') || [];
        for (const user of localUsers) {
            try {
                // Ensure ID is UUID if possible, or let Supabase handle it?
                // Supabase users table might expect UUID for id.
                // If local ID is 'emp_123', upsert might fail if column is uuid.
                // But let's try.
                await SupabaseService.upsertUser(user);
                successCount++;
            } catch (error) {
                console.error(`Failed to sync user ${user.name}:`, error);
                failCount++;
            }
        }

        // 2. Sync Clients (Optional, but good for completeness)
        const localClients = this.getLocal(this.KEYS.CLIENTS) || [];
        for (const client of localClients) {
            try {
                // We use a custom upsert logic here or just try insert
                // Since addClient is insert-only, we might skip existing emails
                // But for now, let's focus on users as requested
            } catch (error) {
                // ignore
            }
        }

        return { success: true, synced: successCount, failed: failCount };
    },

    initializeSampleData() {
        // Ensure at least one Employee exists locally for fallback dropdowns
        const localUsers = this.getLocal('contentflow_users') || [];
        const hasEmployee = localUsers.some(u => u.role === 'Employee');

        if (!hasEmployee) {
            console.log('Seeding default employee for dropdown availability...');
            const defaultEmployee = {
                id: 'emp_' + Date.now(),
                name: 'Default Employee',
                email: 'employee@agency.com',
                password: 'password', // Demo purpose
                avatar: 'DE',
                role: 'Employee',
                joined: new Date().toISOString()
            };
            localUsers.push(defaultEmployee);
            this.setLocal('contentflow_users', localUsers);
        }

        // Only seed clients if in Local Mode
        if (this.isSupabaseActive()) return;

        if (this.getLocal(this.KEYS.CLIENTS)?.length === 0) {
            // Re-use logic from previous file if needed, but simplified here
            console.log('Initializing sample data...');
            this.addClient({
                name: 'Acme Corp',
                email: 'contact@acme.com',
                phone: '555-0123',
                address: '123 Tech Park',
                status: 'Approved'
            });
        }
    }
};

// Initialize
if (typeof window !== 'undefined') {
    Storage.initializeSampleData();
}
