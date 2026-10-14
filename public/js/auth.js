/**
 * Clerk Authentication and Utilities for Pet Grooming Studio
 */

const CLERK_PUBLISHABLE_KEY = 'pk_test_c3RpbGwtc3dhbi05NTc0LmNsZXJrLmFjY291bnRzLmRldiQ';
const CLERK_FRONTEND_API = 'still-swan-9574.clerk.accounts.dev';

let clerkPromise = null;

// Setup listeners to handle active sessions
function setupClerkListeners(clerk) {
  if (!clerk) return;
  if (clerk._petGroomingInitialized) return;
  clerk._petGroomingInitialized = true;

  // Listen to Clerk state updates
  if (typeof clerk.addListener === 'function') {
    clerk.addListener(() => {
      updateNav();
    });
  }
}

// Initialize Clerk SDK
function initClerk() {
  if (clerkPromise) return clerkPromise;

  clerkPromise = new Promise((resolve) => {
    // If Clerk is already available and loaded
    if (window.Clerk && window.Clerk.isReady && window.Clerk.isReady()) {
      setupClerkListeners(window.Clerk);
      return resolve(window.Clerk);
    }

    const checkClerkInterval = setInterval(async () => {
      if (window.Clerk) {
        clearInterval(checkClerkInterval);
        try {
          if (!window.Clerk.loaded) {
            await window.Clerk.load({
              appearance: {
                variables: {
                  colorPrimary: '#1c3d31',
                  colorText: '#141b18',
                  colorBackground: '#ffffff',
                  borderRadius: '14px',
                  fontFamily: '"Plus Jakarta Sans", sans-serif'
                },
                elements: {
                  card: {
                    boxShadow: '0 10px 30px -5px rgba(28, 61, 49, 0.08)',
                    borderRadius: '20px',
                    border: '1px solid rgba(20, 27, 24, 0.08)'
                  },
                  formButtonPrimary: {
                    backgroundColor: '#1c3d31',
                    borderRadius: '12px',
                    padding: '10px 18px',
                    fontWeight: '600'
                  }
                }
              }
            });
          }
          setupClerkListeners(window.Clerk);
          resolve(window.Clerk);
        } catch (e) {
          console.error('Error initializing Clerk:', e);
          if (window.Clerk) setupClerkListeners(window.Clerk);
          resolve(window.Clerk);
        }
      }
    }, 50);

    // Timeout fallback after 6s
    setTimeout(() => {
      clearInterval(checkClerkInterval);
      if (window.Clerk) setupClerkListeners(window.Clerk);
      resolve(window.Clerk || null);
    }, 6000);
  });

  return clerkPromise;
}

// Get active auth token (prioritize local token so saved credentials work reliably)
async function getAuthToken() {
  const localToken = localStorage.getItem('pet_grooming_token');
  if (localToken) {
    return localToken;
  }

  const clerk = await initClerk();
  if (clerk && clerk.session) {
    try {
      return await clerk.session.getToken();
    } catch (e) {
      console.warn('Could not retrieve Clerk token:', e);
    }
  }
  return null;
}

// Get active user object
async function getActiveUser() {
  const local = localStorage.getItem('pet_grooming_user');
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {}
  }

  const clerk = await initClerk();
  if (clerk && clerk.user) {
    return {
      id: clerk.user.id,
      name: clerk.user.fullName || clerk.user.firstName || 'Pet Parent',
      email: clerk.user.primaryEmailAddress ? clerk.user.primaryEmailAddress.emailAddress : '',
      imageUrl: clerk.user.imageUrl
    };
  }

  return null;
}

// Authenticated Fetch Wrapper
async function authFetch(url, options = {}) {
  const token = await getAuthToken();
  const user = await getActiveUser();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (user) {
    headers['x-user-email'] = user.email || '';
    headers['x-user-name'] = user.name || '';
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    const path = window.location.pathname.toLowerCase();
    // Do NOT redirect if on login or signup pages
    if (!path.includes('login') && !path.includes('signup') && !url.includes('/sync')) {
      localStorage.removeItem('pet_grooming_token');
      localStorage.removeItem('pet_grooming_user');
      window.location.replace('/login.html');
    }
  }

  return response;
}

// Direct Google SSO Sign-in / Sign-up Trigger
async function loginWithGoogle() {
  // Clear any existing local token so Google auth starts fresh
  localStorage.removeItem('pet_grooming_token');
  localStorage.removeItem('pet_grooming_user');

  const clerk = await initClerk();
  if (!clerk) {
    showToast('Authentication service is loading. Please try again.', 'info');
    return;
  }

  // Close any open modals immediately
  try {
    if (typeof clerk.closeSignIn === 'function') clerk.closeSignIn();
    if (typeof clerk.closeSignUp === 'function') clerk.closeSignUp();
  } catch (e) {}

  const origin = window.location.origin;
  const redirectUrl = `${origin}/sso-callback.html`;
  const redirectUrlComplete = `${origin}/dashboard.html`;

  showToast('Connecting to Google...', 'info');

  try {
    // Clear any active or stale Clerk session to ensure clean Google account picker
    if (clerk.session || (clerk.client && clerk.client.sessions && clerk.client.sessions.length > 0)) {
      try {
        if (typeof clerk.signOut === 'function') {
          await clerk.signOut();
        }
      } catch (soErr) {
        console.warn('Sign-out before OAuth notice:', soErr);
      }
    }

    // Direct Google OAuth redirect via Clerk client
    if (clerk.client?.signIn?.authenticateWithRedirect) {
      await clerk.client.signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: redirectUrl,
        redirectUrlComplete: redirectUrlComplete
      });
      return;
    }

    if (clerk.client?.signUp?.authenticateWithRedirect) {
      await clerk.client.signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: redirectUrl,
        redirectUrlComplete: redirectUrlComplete
      });
      return;
    }
  } catch (err) {
    console.warn('Google signIn attempt error:', err);

    // If session_exists or already signed in occurred, sign out and retry redirect once
    const errMsg = (err.message || (err.errors && err.errors[0]?.message) || '').toLowerCase();
    if (errMsg.includes('already signed in') || errMsg.includes('session_exists') || errMsg.includes('session exists')) {
      try {
        if (typeof clerk.signOut === 'function') await clerk.signOut();
        if (clerk.client?.signIn?.authenticateWithRedirect) {
          await clerk.client.signIn.authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: redirectUrl,
            redirectUrlComplete: redirectUrlComplete
          });
          return;
        }
      } catch (retryErr) {
        console.error('Retry after signout error:', retryErr);
      }
    }

    const displayMsg = (err.errors && err.errors[0]?.message) || err.message || 'Could not connect with Google.';
    showToast(displayMsg, 'error');
  }
}

// Sign out
async function logout() {
  showToast('Signing out...', 'info');
  try {
    const clerk = await initClerk();
    if (clerk && typeof clerk.signOut === 'function') {
      await clerk.signOut();
    }
  } catch (e) {
    console.warn('Clerk sign out error:', e);
  }
  localStorage.removeItem('pet_grooming_token');
  localStorage.removeItem('pet_grooming_user');
  window.location.href = '/login.html';
}

// Route Guard for Protected Pages (e.g. Dashboard)
async function requireAuth() {
  // 1. Check local storage token first for immediate response
  const localToken = localStorage.getItem('pet_grooming_token');
  const cachedUserStr = localStorage.getItem('pet_grooming_user');

  if (localToken) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${localToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          localStorage.setItem('pet_grooming_user', JSON.stringify(data.user));
          return data.user;
        }
      } else if (res.status === 401) {
        localStorage.removeItem('pet_grooming_token');
        localStorage.removeItem('pet_grooming_user');
      }
    } catch (e) {
      console.warn('Local token verification notice:', e);
      if (cachedUserStr) {
        try { return JSON.parse(cachedUserStr); } catch (_) {}
      }
    }
  }

  // 2. Check Clerk SSO session if local token wasn't present
  try {
    const clerk = await initClerk();

    // If returning directly from OAuth redirect with Clerk parameters in URL
    if (clerk && (window.location.search.includes('__clerk') || window.location.hash.includes('__clerk') || window.location.search.includes('status='))) {
      try {
        if (typeof clerk.handleRedirectCallback === 'function') {
          await clerk.handleRedirectCallback({
            afterSignInUrl: '/dashboard.html',
            afterSignUpUrl: '/dashboard.html'
          }, async () => {});
        }
      } catch (cbErr) {
        console.warn('Redirect callback handling notice:', cbErr);
      }
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    if (clerk) {
      // Wait briefly for clerk user/session to populate
      for (let i = 0; i < 30; i++) {
        if (clerk.user || clerk.session || clerk.client?.sessions?.length > 0) break;
        await new Promise(r => setTimeout(r, 100));
      }

      const u = clerk.user || clerk.session?.user || clerk.client?.sessions?.[0]?.user;

      if (u) {
        const email = u.primaryEmailAddress?.emailAddress || u.emailAddresses?.[0]?.emailAddress || '';
        const name = u.fullName || u.firstName || 'Pet Parent';
        const clerkId = u.id;

        // Sync with MongoDB backend and obtain local JWT token
        if (email) {
          try {
            const ssoRes = await fetch('/api/auth/sso-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clerkId, name, email })
            });
            const ssoData = await ssoRes.json();
            if (ssoRes.ok && ssoData.success && ssoData.token) {
              localStorage.setItem('pet_grooming_token', ssoData.token);
              localStorage.setItem('pet_grooming_user', JSON.stringify(ssoData.user));
              return ssoData.user;
            }
          } catch (syncErr) {
            console.warn('SSO sync error in dashboard:', syncErr);
          }
        }

        return {
          id: u.id,
          name,
          email,
          imageUrl: u.imageUrl
        };
      }
    }
  } catch (err) {
    console.error('Clerk auth verification notice:', err);
  }

  // Not logged in -> redirect to login
  window.location.replace('/login.html');
  return null;
}

// Route Guard for Guest Pages (disabled to prevent redirect loops)
async function redirectIfAuthenticated() {
  // Intentionally no-op to allow users to sign in or create accounts without page bouncing
  return;
}

// Dynamic Navigation Bar
async function updateNav() {
  const navActions = document.getElementById('navActions');
  if (!navActions) return;

  const clerk = await initClerk();
  if (clerk && clerk.user) {
    navActions.innerHTML = `
      <a href="/dashboard.html" class="btn btn-outline btn-sm">🐾 Dashboard</a>
      <div id="clerkUserButton" style="display: inline-flex; align-items: center;"></div>
      <button onclick="logout()" class="btn btn-ghost btn-sm">Log Out</button>
    `;
    const userBtnContainer = document.getElementById('clerkUserButton');
    if (userBtnContainer && clerk.mountUserButton) {
      clerk.mountUserButton(userBtnContainer);
    }
  } else {
    navActions.innerHTML = `
      <a href="/login.html" class="btn btn-outline btn-sm">Log In</a>
      <a href="/signup.html" class="btn btn-primary btn-sm">Sign Up</a>
    `;
  }
}

// Toast Notifications System
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Auto-run navigation update on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initClerk().then(() => updateNav());
});
