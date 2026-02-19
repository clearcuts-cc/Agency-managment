class Auth {
    static init() {
        this.users = JSON.parse(localStorage.getItem('contentflow_users')) || [];
        // Support legacy user object
        const legacyUser = JSON.parse(localStorage.getItem('contentflow_current_user'));
        if (legacyUser) this.currentUser = legacyUser;
    }

    static async signup(name, email, password) {
        // STRICT SUPABASE MODE: Local Storage fallback is disabled to prevent "ghost" errors.
        if (window.SupabaseService && window.supabase) {
            console.log('Finalizing Supabase Signup...');
            try {
                const { user, session } = await window.SupabaseService.signUp(email, password, name);

                if (session) {
                    await window.SupabaseService.signOut();
                    return {
                        success: true,
                        message: 'Account created! Please enable "Confirm Email" in your Supabase Dashboard to send verification emails.'
                    };
                }

                if (user) {
                    return { success: true, message: 'Signup successful! Please check your email to verify your account.' };
                }

                return { success: true };
            } catch (error) {
                return { success: false, message: error.message };
            }
        } else {
            return {
                success: false,
                message: 'Supabase is not connected. Please check your internet or configuration.'
            };
        }
    }

    static async createEmployee(name, email, password, team) {
        // ALWAYS prioritize Supabase Mode if available
        if (window.SupabaseService && window.supabase) {
            try {
                await window.SupabaseService.createEmployee(email, password, name, team);
                return { success: true, message: 'Employee added! Verification email sent.' };
            } catch (error) {
                return { success: false, message: error.message };
            }
        }

        // Check if user exists
        if (this.users.find(u => u.email === email)) {
            return { success: false, message: 'Email already registered' };
        }

        const newUser = {
            id: Date.now().toString(),
            name,
            email,
            password, // In a real app, this should be hashed!
            avatar: this.getInitials(name),
            joined: new Date().toISOString(),
            role: 'Employee', // Explicit role
            team: team || null
        };

        this.users.push(newUser);
        this.saveUsers();

        return { success: true };
    }

    static async createClient(name, email, password) {
        // ALWAYS prioritize Supabase Mode if available
        if (window.SupabaseService && window.supabase) {
            try {
                await window.SupabaseService.createClientUser(email, password, name);
                return { success: true, message: 'Client added! Verification email sent.' };
            } catch (error) {
                return { success: false, message: error.message };
            }
        }

        // Check if user exists (Local Mode Fallback)
        if (this.users.find(u => u.email === email)) {
            return { success: false, message: 'Email already registered' };
        }

        const newUser = {
            id: Date.now().toString(),
            name,
            email,
            password,
            avatar: this.getInitials(name),
            joined: new Date().toISOString(),
            role: 'Client'
        };

        this.users.push(newUser);
        this.saveUsers();

        return { success: true };
    }

    static async login(email, password) {
        // Supabase Mode
        if (window.SupabaseService && window.supabase) {
            try {
                const user = await window.SupabaseService.signIn(email, password);

                // CHECK VERIFICATION: Block login if email is not confirmed
                if (!user.email_confirmed_at) {
                    await window.SupabaseService.signOut();
                    return { success: false, message: 'Your email address is not verified. Please check your inbox for the verification link.' };
                }

                // Map Supabase user to our App user structure
                const appUser = {
                    id: user.id,
                    email: user.email,
                    name: user.user_metadata.full_name || email.split('@')[0],
                    avatar: this.getInitials(user.user_metadata.full_name || email),
                    role: user.user_metadata.role || 'Admin',
                    team: user.user_metadata.team || null
                };

                this.currentUser = appUser;
                localStorage.setItem('contentflow_current_user', JSON.stringify(appUser));
                return { success: true };
            } catch (error) {
                return { success: false, message: error.message };
            }
        }

        // Local Mode
        const user = this.users.find(u => u.email === email && u.password === password);

        if (user) {
            this.currentUser = user;
            localStorage.setItem('contentflow_current_user', JSON.stringify(user));
            return { success: true };
        }

        return { success: false, message: 'Invalid email or password' };
    }

    static async logout() {
        if (window.SupabaseService && window.supabase) {
            try {
                await window.SupabaseService.signOut();
            } catch (error) {
                console.warn('Supabase logout error (ignoring to allow local logout):', error);
            }
        }
        this.currentUser = null;
        localStorage.removeItem('contentflow_current_user');
        window.location.href = 'login.html';
    }

    static checkAuth() {
        const user = JSON.parse(localStorage.getItem('contentflow_current_user'));
        if (!user) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    static getCurrentUser() {
        return JSON.parse(localStorage.getItem('contentflow_current_user'));
    }

    static saveUsers() {
        localStorage.setItem('contentflow_users', JSON.stringify(this.users));
    }

    static getInitials(name) {
        if (!name) return '??';
        return name
            .split(' ')
            .filter(word => word.length > 0)
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }
}

// Initialize on load
Auth.init();
