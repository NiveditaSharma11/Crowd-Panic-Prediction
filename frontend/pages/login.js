import { executeGoogleLogin, loginWithEmail, registerWithEmail, navigateTo } from '../app.js';

export function renderLogin(container) {
    let isRegistering = false;

    const renderHTML = () => `
        <div class="login-container animate-fade-in">
            <div class="hero-glow"></div>
            <div class="login-box glass-panel" style="max-width: 450px;">
                <div style="margin-bottom: 1.5rem;">
                    <i data-lucide="shield-alert" style="width: 48px; height: 48px; color: var(--accent);"></i>
                </div>
                <h2 id="formTitle">${isRegistering ? 'Create Account' : 'Welcome Back'}</h2>
                <p id="formSub">${isRegistering ? 'Register to join the command center' : 'Sign in to access the CrowdGuard Center'}</p>
                
                <form id="emailAuthForm" style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; text-align: left;">
                    <div>
                        <label style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; display: block;">Email Address</label>
                        <input type="email" id="emailInput" required placeholder="tactical@guard.com" style="width: 100%; padding: 0.8rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: white; border-radius: var(--radius);">
                    </div>
                    <div>
                        <label style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; display: block;">Password</label>
                        <input type="password" id="passwordInput" required placeholder="••••••••" minlength="6" style="width: 100%; padding: 0.8rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: white; border-radius: var(--radius);">
                    </div>
                    <button type="submit" id="submitBtn" class="btn" style="width: 100%; justify-content: center; margin-top: 0.5rem;">
                        ${isRegistering ? 'Register' : 'Sign In'}
                    </button>
                    <div id="loginError" style="color: var(--danger); font-size: 0.85rem; min-height: 20px; text-align: center;"></div>
                </form>

                <div style="display: flex; align-items: center; margin: 1.5rem 0; color: var(--text-muted); font-size: 0.85rem;">
                    <div style="flex: 1; height: 1px; background: var(--border);"></div>
                    <span style="padding: 0 1rem;">OR</span>
                    <div style="flex: 1; height: 1px; background: var(--border);"></div>
                </div>

                <button id="googleSignInBtn" class="google-btn">
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style="width: 20px; height: 20px;">
                    Continue with Google
                </button>
                
                <div style="margin-top: 1.5rem; font-size: 0.9rem;">
                    <span style="color: var(--text-muted);">${isRegistering ? 'Already have an account?' : 'Need tactical access?'}</span>
                    <a href="#" id="toggleModeBtn" style="color: var(--accent); text-decoration: none; font-weight: 500; margin-left: 0.5rem;">
                        ${isRegistering ? 'Sign In Instead' : 'Register Now'}
                    </a>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = renderHTML();
    lucide.createIcons();
    attachListeners();

    function attachListeners() {
        const btn = document.getElementById('googleSignInBtn');
        const form = document.getElementById('emailAuthForm');
        const submitBtn = document.getElementById('submitBtn');
        const errorDiv = document.getElementById('loginError');
        const toggleModeBtn = document.getElementById('toggleModeBtn');
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');

        // Toggle Form Mode
        toggleModeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isRegistering = !isRegistering;
            container.innerHTML = renderHTML();
            lucide.createIcons();
            attachListeners();
        });

        // Email Form Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorDiv.innerText = '';
            
            const originalText = submitBtn.innerText;
            submitBtn.innerHTML = `<i data-lucide="loader-2" class="lucide-spin" style="animation: spin 2s linear infinite;"></i> Processing...`;
            lucide.createIcons();
            submitBtn.disabled = true;

            const email = emailInput.value;
            const password = passwordInput.value;

            try {
                if(isRegistering) {
                    await registerWithEmail(email, password);
                } else {
                    await loginWithEmail(email, password);
                }
                // Router auth listener automatically redirects
            } catch (err) {
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
                errorDiv.innerText = "Error: " + (err.message || "Failed.");
            }
        });

        // Google SignIn
        btn.addEventListener('click', async () => {
            btn.innerHTML = `<i data-lucide="loader-2" class="lucide-spin" style="animation: spin 2s linear infinite;"></i> Authenticating...`;
            lucide.createIcons();
            btn.style.opacity = '0.8';
            btn.disabled = true;
            errorDiv.innerText = '';
            
            try {
                await executeGoogleLogin();
                // Redirected by app.js listener
            } catch (err) {
                btn.innerHTML = `
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style="width: 20px; height: 20px;">
                    Continue with Google`;
                btn.style.opacity = '1';
                btn.disabled = false;
                errorDiv.innerText = "Firebase Error: " + (err.message || "Unknown error occurred.");
            }
        });
    }
}
