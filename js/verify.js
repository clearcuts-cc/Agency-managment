document.addEventListener('DOMContentLoaded', async () => {
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusMessage = document.getElementById('status-message');
    const actionBtn = document.getElementById('action-btn');

    // Helper to update UI
    function updateStatus(type, title, message, showButton = false) {
        statusIcon.className = `status-icon status-${type}`;

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        } else {
            iconSvg = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>`;
        }

        statusIcon.innerHTML = iconSvg;
        statusTitle.textContent = title;
        statusMessage.textContent = message;

        if (showButton) {
            actionBtn.style.display = 'block';
            actionBtn.classList.add('fade-up');
        }
    }

    // Check if Supabase is available
    if (typeof supabase === 'undefined' || !supabase) {
        updateStatus('error', 'Configuration Error', 'Supabase client not initialized. check supabase-config.js');
        return;
    }

    console.log('Verify Page: Listening to Supabase Auth...');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Verify Page Auth Event:', event);

        // Handle specific event types
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            if (session) {
                const user = session.user;

                // Case 1: Email is confirmed
                if (user.email_confirmed_at) {
                    updateStatus('success', 'Email Verified!', 'Your email address has been successfully verified. You can now log in to your account.', true);

                    // Optional: Sign out so they have to log in manually with their password for security
                    // OR keep them logged in? The user requested "verify... confirm... in that html page".
                    // Usually safer to ask for login.
                    await supabase.auth.signOut();
                } else {
                    // Case 2: Signed in but email NOT confirmed? (Shouldn't happen on verify link)
                    updateStatus('error', 'Verification Incomplete', 'We could not verify your email address. Please try clicking the link again.');
                }
            }
        }
        else if (event === 'SIGNED_OUT') {
            // Ignore sign out events
        }
    });

    // Check for hash errors (e.g. link expired)
    const hash = window.location.hash;
    if (hash && hash.includes('error_description')) {
        const params = new URLSearchParams(hash.substring(1)); // remove #
        const errorDescription = params.get('error_description');
        const errorCode = params.get('error_code');

        console.error('Auth Hash Error:', errorCode, errorDescription);

        updateStatus('error', 'Verification Failed',
            decodeURIComponent(errorDescription || 'The verification link is invalid or has expired.').replace(/\+/g, ' ')
        );
    }
    else if (!hash && !window.location.search) {
        // No tokens found?
        // Maybe they just navigated here directly.
        updateStatus('error', 'Invalid Link', 'No verification token found. Please click the link sent to your email.');
    }
});
