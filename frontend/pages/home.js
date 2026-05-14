export function renderHome(container) {
    container.innerHTML = `
        <div style="position: absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; z-index:0; pointer-events:none;">
            <div class="orb orb-1"></div>
            <div class="orb orb-2"></div>
            <div class="orb orb-3"></div>
        </div>
        
        <div class="hero-section animate-fade-in" style="position: relative; z-index: 10;">
            <div class="hero-glow"></div>
            <h1>Predict. Prevent. Protect.</h1>
            <p>Advanced AI-driven tracking to detect early signs of crowd panic, density anomalies, and sudden stampedes before they escalate.</p>
            <a href="/login" data-link class="btn" style="padding: 1rem 2rem; font-size: 1.1rem; border-radius: 50px;">
                Access Command Center
                <i data-lucide="arrow-right"></i>
            </a>
        </div>

        <div class="problem-statement animate-fade-in" style="animation-delay: 0.2s; padding-top: 2rem;">
            <div class="info-card glass-panel">
                <h3><i data-lucide="alert-triangle" style="color: var(--warning)"></i> The Problem</h3>
                <p>Large gatherings like concerts, sports events, and religious gatherings are prone to sudden panic or stampedes. Traditional reactive measures are often too slow to prevent catastrophes.</p>
            </div>
            <div class="info-card glass-panel">
                <h3><i data-lucide="eye-off" style="color: var(--danger)"></i> The Blindspot</h3>
                <p>Authorities frequently detect dangerous situations, bottlenecks, or aggressive sudden movements far too late, causing severe injuries and uncontrollable chaos in confined spaces.</p>
            </div>
            <div class="info-card glass-panel">
                <h3><i data-lucide="shield-check" style="color: var(--success)"></i> The Solution</h3>
                <p>CrowdGuard utilizes deep learning (YOLO) and optical flow baseline mapping to autonomously monitor real-time video feeds, instantly alerting security to anomaly spikes.</p>
            </div>
        </div>
    `;
    lucide.createIcons();
}
