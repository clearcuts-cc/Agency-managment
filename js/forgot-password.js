// Forgot Password Handler

class ForgotPassword {
    static async handleForgotPassword(email) {
        const messageBox = document.getElementById('message-box');

        try {
            // Validate email
            if (!email || !email.includes('@')) {
                this.showMessage('Please enter a valid email address', 'error');
                return;
            }

            // Check if user exists and get their role
            const userRole = await this.checkUserRole(email);

            if (!userRole) {
                // For security, don't reveal if email exists or not
                this.showMessage(
                    'If this email is registered, you will receive further instructions.',
                    'info'
                );
                return;
            }

            // Admin: Send password reset email via Supabase
            if (userRole === 'Admin') {
                await this.sendAdminPasswordReset(email);
                this.showMessage(
                    '✓ Password reset email sent! Check your inbox for reset instructions.',
                    'success'
                );
            }
            // Employee: Create notification for admin
            else if (userRole === 'Employee') {
                await this.sendEmployeeResetRequest(email);
                this.showMessage(
                    '✓ Password reset request sent to admin. You will be contacted shortly.',
                    'success'
                );
            }
            // Client role - not allowed to reset password
            else {
                this.showMessage(
                    'Please contact your account administrator for password assistance.',
                    'info'
                );
            }

        } catch (error) {
            console.error('Forgot password error:', error);
            this.showMessage('An error occurred. Please try again later.', 'error');
        }
    }

    static async checkUserRole(email) {
        if (!window.supabase) return null;

        try {
            const { data, error } = await window.supabase
                .from('users')
                .select('role, id, name')
                .eq('email', email)
                .single();

            if (error || !data) return null;

            // Store user data for employee reset request
            this._tempUserData = data;
            return data.role;
        } catch (error) {
            console.error('Error checking user role:', error);
            return null;
        }
    }

    static async sendAdminPasswordReset(email) {
        if (!window.supabase) throw new Error('Supabase not initialized');

        // Get the redirect URL for password reset
        const redirectUrl = window.location.origin + '/Agency managment/login.html';

        const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });

        if (error) throw error;
    }

    static async sendEmployeeResetRequest(email) {
        if (!window.supabase) throw new Error('Supabase not initialized');

        const userData = this._tempUserData;
        if (!userData) throw new Error('User data not found');

        // Get all admin users
        const { data: admins, error: adminError } = await window.supabase
            .from('users')
            .select('id')
            .eq('role', 'Admin');

        if (adminError) throw adminError;

        if (!admins || admins.length === 0) {
            throw new Error('No administrators found');
        }

        // Create notification for each admin
        const notifications = admins.map(admin => ({
            user_id: admin.id,
            message: `Password reset request from ${userData.name} (${email})`,
            type: 'password_reset_request',
            related_id: userData.id,
            is_read: false
        }));

        const { error: notifError } = await window.supabase
            .from('notifications')
            .insert(notifications);

        if (notifError) throw notifError;
    }

    static showMessage(message, type) {
        const messageBox = document.getElementById('message-box');
        if (!messageBox) return;

        messageBox.textContent = message;
        messageBox.className = 'message-box message-' + type;
        messageBox.style.display = 'block';
    }
}

// Form submission handler
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgot-password-form');
    const emailInput = document.getElementById('email-input');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value.trim();

            // Disable submit button during processing
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';

            await ForgotPassword.handleForgotPassword(email);

            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });
    }
});
