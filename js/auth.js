class Auth {
    static init() {
        this.users = JSON.parse(localStorage.getItem('contentflow_users')) || [];
        // Support legacy user object
        const legacyUser = JSON.parse(localStorage.getItem('contentflow_current_user'));
        if (legacyUser) this.currentUser = legacyUser;

        // Global Supabase Auth Listener for Auto-Login (Invites/Confirmations)
        if (typeof supabase !== 'undefined' && supabase) {
            supabase.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    const user = session.user;
                    console.log('Global Auth Event:', event, user.email);

                    // Quick sanity check: If we are "verifying", we should force update
                    const isVerifying = document.getElementById('auth-overlay');

                    // 1. Check if we already have this user logged in locally
                    const currentLocal = this.getCurrentUser();

                    // IF emails match AND we are not in a verification flow, we can skip
                    if (currentLocal && currentLocal.email === user.email && !isVerifying) {
                        return;
                    }

                    // 2. Sync Supabase Session to Local Storage
                    // We need to fetch the full profile if possible, or construct it
                    // Try to get from public users table first to get 'team', 'role' etc.
                    let appUser = {
                        id: user.id,
                        email: user.email,
                        name: user.user_metadata.full_name || user.email.split('@')[0],
                        avatar: this.getInitials(user.user_metadata.full_name || user.email),
                        role: user.user_metadata.role || 'Employee',
                        team: user.user_metadata.team || null
                    };

                    // Try to fetch latest from DB to be sure
                    try {
                        const { data: dbUser } = await supabase.from('users').select('*').eq('id', user.id).single();
                        if (dbUser) {
                            appUser = { ...appUser, ...dbUser }; // DB takes precedence
                        }
                    } catch (e) {
                        console.warn('Could not fetch public profile, using metadata', e);
                    }

                    this.currentUser = appUser;
                    localStorage.setItem('contentflow_current_user', JSON.stringify(appUser));

                    // 3. Update UI
                    // If we are on index.html, a reload ensures everything renders with the new user
                    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                        // Clear hash to look clean and remove overlay
                        history.replaceState(null, null, 'index.html');
                        window.location.reload();
                    } else if (window.location.pathname.endsWith('login.html')) {
                        window.location.href = 'index.html';
                    }
                } else if (event === 'SIGNED_OUT') {
                    // Handle global signapiout
                    if (this.currentUser) {
                        this.logout();
                    }
                }
            });

            // Realtime Listener for Account Deletion (Force Logout)
            supabase
                .channel('public:users')
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'users' }, (payload) => {
                    // Check if the deleted user is the current user
                    if (this.currentUser && payload.old && payload.old.id === this.currentUser.id) {
                        console.warn('Current user account was deleted. Forcing logout.');
                        alert('Your account has been deleted by an administrator.');
                        this.logout();
                    }
                })
                .subscribe();
        }
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
