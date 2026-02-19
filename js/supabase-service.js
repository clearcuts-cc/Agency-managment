// Use window.SupabaseService to ensure it's accessible globally across script tags
window.SupabaseService = {
    // Helper to get absolute path for password reset redirects
    _getPasswordResetUrl() {
        let url = window.location.href.split('?')[0].split('#')[0];
        if (url.endsWith('.html')) {
            url = url.substring(0, url.lastIndexOf('/'));
        } else if (url.endsWith('/')) {
            url = url.substring(0, url.length - 1);
        }
        return url + '/reset-password.html';
    },

    // Helper to get absolute path for signup email verification redirects
    _getSignupRedirectUrl() {
        let url = window.location.href.split('?')[0].split('#')[0];
        if (url.endsWith('.html')) {
            url = url.substring(0, url.lastIndexOf('/'));
        } else if (url.endsWith('/')) {
            url = url.substring(0, url.length - 1);
        }
        return url + '/index.html';
    },

    // === AUTH ===
    async signUp(email, password, name) {
        if (!window.supabase) {
            throw new Error('Supabase client not initialized. Check your configuration.');
        }
        const { data, error } = await window.supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: name, role: 'Admin' },
                emailRedirectTo: this._getRedirectUrl()
            }
        });
        if (error) throw error;

        // Upsert into public table immediately
        if (data && data.user) {
            await this.upsertUser({
                id: data.user.id,
                email: email,
                name: name,
                role: 'Admin'
            });
        }

        return data;
    },

    // Special method to create an employee WITHOUT logging out the current admin
    async createEmployee(email, password, name, team) {
        // LAN IP Warning for Mobile Links
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.warn('⚠️ MOBILE LINK WARNING: You are creating an invite from localhost. The email link will point to 127.0.0.1 and FAIL on mobile devices. To fix this, access the app via your PC\'s LAN IP (e.g., 192.168.1.5) before creating the employee.');
            alert('⚠️ Important: You are on localhost. Email links generated now will NOT work on mobile.\n\nPlease access the app using your PC\'s LAN IP (check ipconfig) to generate mobile-friendly links.');
        }


        const createClientFn = window.supabaseCreateClient ||
            (typeof createClient !== 'undefined' ? createClient : null) ||
            (window.supabase && window.supabase.createClient);

        if (!createClientFn) {
            throw new Error('Supabase SDK (createClient) not found. Cannot create employee via Supabase.');
        }

        const url = window.SUPABASE_URL || 'https://pbjvommralhvunymiqbf.supabase.co';
        const key = window.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBianZvbW1yYWxodnVueW1pcWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MTQwODksImV4cCI6MjA4NjI5MDA4OX0.xUDFZFuisfwkSzQkQje4XPK4WfB89fUo58863ITuL5k';

        const tempClient = createClientFn(url, key);

        const { data, error } = await tempClient.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: name, role: 'Employee', team: team },
                emailRedirectTo: this._getSignupRedirectUrl()
            }
        });

        if (error) throw error;

        // CRITICAL: Manually insert into public users table so they appear in the app
        if (data && data.user) {
            const { error: insertError } = await window.supabase
                .from('users')
                .insert([{
                    id: data.user.id,
                    email: email,
                    name: name,
                    role: 'Employee',
                    team: team
                }]);
            if (insertError) console.warn('Error inserting to public users table:', insertError);
        }

        return data;
    },

    async createClientUser(email, password, name) {
        const createClientFn = window.supabaseCreateClient ||
            (typeof createClient !== 'undefined' ? createClient : null) ||
            (window.supabase && window.supabase.createClient);

        if (!createClientFn) throw new Error('Supabase SDK not found');

        const url = window.SUPABASE_URL || 'https://pbjvommralhvunymiqbf.supabase.co';
        const key = window.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBianZvbW1yYWxodnVueW1pcWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MTQwODksImV4cCI6MjA4NjI5MDA4OX0.xUDFZFuisfwkSzQkQje4XPK4WfB89fUo58863ITuL5k';

        const tempClient = createClientFn(url, key);

        const { data, error } = await tempClient.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: name, role: 'Client' },
                emailRedirectTo: this._getSignupRedirectUrl()
            }
        });

        if (error) throw error;

        // CRITICAL: Manually insert into public users table
        if (data && data.user) {
            const { error: insertError } = await window.supabase
                .from('users')
                .insert([{
                    id: data.user.id,
                    email: email,
                    name: name,
                    role: 'Client'
                }]);
            if (insertError) console.warn('Error inserting client to public users table:', insertError);
        }

        return data;
    },

    async signIn(email, password) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { data, error } = await window.supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        return data.user;
    },

    async signOut() {
        if (!window.supabase) return;
        const { error } = await window.supabase.auth.signOut();
        if (error) throw error;
    },

    async getCurrentUser() {
        if (!window.supabase) return null;
        const { data: { user } } = await window.supabase.auth.getUser();
        return user;
    },

    async getUsers() {
        if (!window.supabase) return [];
        const { data, error } = await window.supabase
            .from('users')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return data;
    },

    // Manually insert/update user in public table (Backup if Triggers fail)
    async upsertUser(user) {
        if (!window.supabase) return;

        // Prepare data matching table schema
        const userData = {
            id: user.id,
            email: user.email,
            name: user.name || user.full_name,
            avatar: user.avatar,
            role: user.role || 'Employee',
            team: user.team // Add team field
        };

        const { data, error } = await window.supabase
            .from('users')
            .upsert([userData], { onConflict: 'email' })
            .select();

        if (error) {
            console.error('Error upserting user:', error);
            throw error;
        }
        return data;
    },

    // === CLIENTS ===
    async getClients() {
        if (!window.supabase) return [];
        const { data, error } = await window.supabase
            .from('clients')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async addClient(client) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { data: { user } } = await window.supabase.auth.getUser();

        let status = 'Approved';
        // You would typically check user role from metadata or profile table
        // For now, assuming if role is 'Employee' -> Pending
        if (user && user.user_metadata && user.user_metadata.role === 'Employee') {
            status = 'Pending';
        }

        const { data, error } = await window.supabase
            .from('clients')
            .insert([{
                ...client,
                user_id: user ? user.id : null,
                status: status
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async approveClient(clientId) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { data, error } = await window.supabase
            .from('clients')
            .update({ status: 'Approved' })
            .eq('id', clientId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateClient(clientId, updates) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { data, error } = await window.supabase
            .from('clients')
            .update(updates)
            .eq('id', clientId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // === TASKS ===
    async getTasks() {
        if (!window.supabase) return [];
        const { data, error } = await window.supabase
            .from('tasks')
            .select(`
                *,
                clients (name)
            `)
            .order('deadline', { ascending: true });

        if (error) throw error;

        // Map snake_case to camelCase for the app logic
        return data.map(task => ({
            ...task,
            clientId: task.client_id,
            assigneeId: task.assignee_id,
            userId: task.user_id,
            assignedDate: task.assigned_date,
            endDate: task.end_date,
            createdAt: task.created_at
        }));
    },

    async addTask(task) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { data: { user } } = await window.supabase.auth.getUser();

        // Convert camelCase from App logic to snake_case for PostgreSQL
        const taskData = {
            title: task.title,
            project: task.project || 'General Project',
            stage: task.stage,
            status: task.status,
            assignee: task.assignee,
            priority: task.priority || 'Medium',
            deadline: task.deadline,
            assigned_date: task.assignedDate,
            end_date: task.endDate,
            user_id: user ? user.id : null,
            client_id: task.clientId || null,
            assignee_id: task.assigneeId || null
        };

        const { data, error } = await window.supabase
            .from('tasks')
            .insert([taskData])
            .select()
            .single();

        if (error) throw error;

        // Create notification for the assigned employee if different from creator
        if (task.assigneeId && user && task.assigneeId !== user.id) {
            try {
                await window.supabase
                    .from('notifications')
                    .insert([{
                        user_id: task.assigneeId,
                        message: `New task assigned: ${task.title}`,
                        type: 'task_assigned',
                        related_id: data.id,
                        is_read: false
                    }]);
                console.log(`Notification sent to employee ${task.assigneeId} for task: ${task.title}`);
            } catch (notifError) {
                console.error('Error creating notification:', notifError);
                // Don't fail the task creation if notification fails
            }
        }

        // Map back to camelCase for the app
        return {
            ...data,
            clientId: data.client_id,
            assigneeId: data.assignee_id,
            userId: data.user_id,
            assignedDate: data.assigned_date,
            endDate: data.end_date,
            createdAt: data.created_at
        };
    },

    async updateTask(id, updates) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { data, error } = await window.supabase
            .from('tasks')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteTask(id) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { error } = await window.supabase
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    },

    async deleteUser(id) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { error } = await window.supabase
            .from('users')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    },

    async deleteClient(id) {
        if (!window.supabase) throw new Error('Supabase not initialized');
        const { error } = await window.supabase
            .from('clients')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    }
};
