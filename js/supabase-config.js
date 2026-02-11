// ===== Supabase Configuration =====

const SUPABASE_URL = 'https://pbjvommralhvunymiqbf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBianZvbW1yYWxodnVueW1pcWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MTQwODksImV4cCI6MjA4NjI5MDA4OX0.xUDFZFuisfwkSzQkQje4XPK4WfB89fUo58863ITuL5k';

// Expose to window so other scripts (like supabase-service.js) can access them
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_KEY = SUPABASE_KEY;

// Preserve the library ref if it already exists from the CDN script
const supabaseLibrary = window.supabase;

// Determine valid createClient function (handle CDN vs Module differences)
let createClientFn = null;

if (typeof createClient !== 'undefined') {
    createClientFn = createClient;
} else if (supabaseLibrary && supabaseLibrary.createClient) {
    createClientFn = supabaseLibrary.createClient;
}

window.supabaseCreateClient = createClientFn;

// The global 'supabase' variable will now hold our ACTIVE CLIENT INSTANCE
// If it's already an instance (has .from), don't reset it to null unless we have a factory to rebuild it
if (!window.supabase || !window.supabase.from) {
    window.supabase = null;
}

if (createClientFn) {
    window.supabase = createClientFn(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase Initialized globally as window.supabase');

    // Safety Check for Project ID mismatch
    try {
        const urlId = SUPABASE_URL.split('//')[1].split('.')[0];
        const tokenPayload = JSON.parse(atob(SUPABASE_KEY.split('.')[1]));
        const tokenId = tokenPayload.ref;

        if (urlId !== tokenId) {
            console.error('CRITICAL SUPABASE CONFIG ERROR:');
            console.error(`Project URL ID: ${urlId}`);
            console.error(`API Key Project ID: ${tokenId}`);
            console.error('These IDs do not match! You are using an API Key from a DIFFERENT project than your URL.');
            console.error('Please go to the dashboard for project ' + urlId + ' and copy the key from THERE.');
        } else {
            console.log('Supabase Configuration Validated: URLs match.');
        }
    } catch (e) {
        console.warn('Could not validate Supabase IDs', e);
    }

} else {
    console.warn('Supabase SDK not loaded. Ensure script tag is present in HTML.');
}
