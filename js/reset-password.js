// Reset Password Handler

function togglePasswordVisibility(inputId, toggleEl) {
    const input = document.getElementById(inputId);
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

function showMessage(message, type) {
    const messageBox = document.getElementById('message-box');
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = 'message-box message-' + type;
    messageBox.style.display = 'block';
}

async function handlePasswordReset(newPassword, confirmPassword) {
    // Validate passwords
    if (!newPassword || newPassword.length < 6) {
        showMessage('Password must be at least 6 characters long', 'error');
        return false;
    }

    if (newPassword !== confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return false;
    }

    try {
        if (!window.supabase) {
            showMessage('Unable to connect to authentication service', 'error');
            return false;
        }

        // Update the user's password
        const { error } = await window.supabase.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        // Show success message
        showMessage('✓ Password reset successfully!', 'success');

        // Redirect to login after 2 seconds
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);

        return true;
    } catch (error) {
        console.error('Password reset error:', error);
        showMessage(error.message || 'Failed to reset password. Please try again.', 'error');
        return false;
    }
}

// Form submission handler
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reset-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');

    // Check if we have a valid session from the email link
    if (window.supabase) {
        window.supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                showMessage('Invalid or expired reset link. Please request a new one.', 'error');
                setTimeout(() => {
                    window.location.href = 'forgot-password.html';
                }, 3000);
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newPassword = newPasswordInput.value.trim();
            const confirmPassword = confirmPasswordInput.value.trim();

            // Disable submit button during processing
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Resetting...';

            const success = await handlePasswordReset(newPassword, confirmPassword);

            // Re-enable button if failed
            if (!success) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }
});
