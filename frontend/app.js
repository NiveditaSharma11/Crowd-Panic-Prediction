import { renderHome } from './pages/home.js?bust=1005';
import { renderLogin } from './pages/login.js?bust=1005';
import { renderDashboard, cleanupDashboard } from './pages/dashboard.js?bust=1005';
import { renderSimulator, cleanupSimulator, updateSimLiveData } from './pages/simulator.js?bust=1005';

// Global stream data bus — simulator listens to this even when on a different page
window._crowdStreamBus = { people: 0, danger: 0, listeners: [] };
window._crowdStreamBus.emit = function(people, danger) {
    this.people  = people;
    this.danger  = danger;
    this.listeners.forEach(fn => fn(people, danger));
};
window._crowdStreamBus.subscribe = function(fn) {
    this.listeners.push(fn);
};

// Persistent background WebSocket — survives page navigation
window._bgStream = {
    ws: null, filename: null, active: false,
    start(filename) {
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.filename = filename;
        this.active   = true;
        this._connect();
    },
    stop() {
        this.active = false;
        if (this.ws) { this.ws.close(); this.ws = null; }
    },
    _connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${proto}//${location.host}/ws/stream`);
        this.ws.onopen = () => {
            this.ws.send(JSON.stringify({ filename: this.filename }));
        };
        this.ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.ping) return;
                // Emit to bus so both dashboard and simulator receive it
                if (data.stats && !data.stats.error && !data.stats.status) {
                    window._crowdStreamBus.emit(data.stats.people_count, data.stats.danger_level);
                }
                // Also forward full payload to dashboard if it's active
                if (window._dashboardOnMessage) window._dashboardOnMessage(data);
            } catch(err) {}
        };
        this.ws.onclose = (e) => {
            if (!this.active) return;
            if (e.code !== 1000) setTimeout(() => this._connect(), 2000);
        };
        this.ws.onerror = () => {};
    }
};

// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// ⚠️ ACTION REQUIRED: PASTE FIREBASE CONFIG
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAiMwNx4JJwnAD_gx52Fapy-wQCct2pU3U",
    authDomain: "codepunk-19b61.firebaseapp.com",
    projectId: "codepunk-19b61",
    storageBucket: "codepunk-19b61.firebasestorage.app",
    messagingSenderId: "390248358504",
    appId: "1:390248358504:web:649360ffde6c427a4e91dd",
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const appDiv = document.getElementById('app');
let currentRoute = '';
export let currentUser = null;

// Routing Map
const routes = {
    '/': renderHome,
    '/login': renderLogin,
    '/dashboard': renderDashboard,
    '/simulator': renderSimulator,
};

// Simple Router
export function navigateTo(path) {
    if (path === currentRoute) return;

    // Cleanup previous route if needed
    if (currentRoute === '/dashboard') {
        // Going to simulator — keep stream alive, just unregister UI handler
        if (path === '/simulator') {
            window._dashboardOnMessage = null;
        } else {
            cleanupDashboard();
            window._bgStream.stop();
        }
    }
    if (currentRoute === '/simulator') {
        cleanupSimulator();
    }

    // Auth Guard
    if ((path === '/dashboard' || path === '/simulator') && !currentUser) {
        history.pushState(null, '', '/login');
        path = '/login';
    }

    history.pushState(null, '', path);
    currentRoute = path;

    renderAppLayout(path);
}

// Intercept link clicks
document.addEventListener('click', e => {
    const link = e.target.closest('a[data-link]');
    if (link) {
        e.preventDefault();
        navigateTo(link.getAttribute('href'));
    }
});

// Handle Back/Forward buttons
window.addEventListener('popstate', () => {
    currentRoute = window.location.pathname;
    renderAppLayout(currentRoute);
});

// Layout Container
function renderAppLayout(path) {
    appDiv.innerHTML = `
        <nav class="navbar">
            <a href="/" data-link class="logo">
                <i data-lucide="shield-alert"></i>
                CrowdGuard<span style="color: var(--accent)">AI</span>
            </a>
            <div class="nav-links">
                ${currentUser
            ? `<a href="/dashboard" data-link class="nav-link ${currentRoute === '/dashboard' ? 'nav-active' : ''}">Command Center</a>
                       <a href="/simulator" data-link class="nav-link ${currentRoute === '/simulator' ? 'nav-active' : ''}" style="display:flex;align-items:center;gap:.35rem">
                         <i data-lucide="map" style="width:14px;height:14px"></i> Simulator
                       </a>
                       <div style="display:flex; align-items:center; gap:1rem; margin-left:1rem; padding-left:1rem; border-left:1px solid var(--border);">
                         <span style="font-size: 0.9rem; font-weight: 500">${currentUser.name}</span>
                         <button id="logoutBtn" class="btn btn-outline" style="padding: 0.3rem 0.8rem; font-size:0.8rem">Sign Out</button>
                       </div>`
            : `<a href="/" data-link class="nav-link">About</a>
                       <a href="/login" data-link class="btn">Sign In</a>`
        }
            </div>
        </nav>
        <div id="page-content" style="flex: 1; display: flex; flex-direction: column;"></div>
    `;

    lucide.createIcons();

    const pageContent = document.getElementById('page-content');
    const renderFunc = routes[path] || routes['/'];
    renderFunc(pageContent);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                currentUser = null;
                navigateTo('/');
            } catch (err) {
                console.error("Sign out error", err);
            }
        });
    }
}

// Real Google Login API wrapper
export async function executeGoogleLogin() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Google Authentication Error:", error.message);
        throw error;
    }
}

// Email & Password Registration API wrapper
export async function registerWithEmail(email, password) {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        return result.user;
    } catch (error) {
        console.error("Registration Error:", error.message);
        throw error;
    }
}

// Email & Password Login API wrapper
export async function loginWithEmail(email, password) {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return result.user;
    } catch (error) {
        console.error("Email Login Error:", error.message);
        throw error;
    }
}

// Track Auth State globally to handle page refreshes
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = {
            name: user.displayName || 'Security Personnel',
            email: user.email
        };
        // If we are on login page, redirect to dashboard
        if (currentRoute === '/login') {
            navigateTo('/dashboard');
        } else {
            renderAppLayout(currentRoute);
        }
    } else {
        currentUser = null;
        if (currentRoute === '/dashboard') {
            navigateTo('/login');
        } else {
            renderAppLayout(currentRoute);
        }
    }
});

// Init
const initialPath = ['/login', '/dashboard', '/simulator'].includes(window.location.pathname)
    ? window.location.pathname
    : '/';
navigateTo(initialPath);

