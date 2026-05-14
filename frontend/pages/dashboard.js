let ws = null;

// ── Chart history buffers ──────────────────────────────
const MAX_POINTS = 60;
const history = {
    frames: [],
    danger: [],
    people: [],
    speed: [],
    running: [],
    walking: [],
};

export function renderDashboard(container) {
    container.innerHTML = `
    <div class="db-root animate-fade-in">

        <!-- ═══ TOP STATUS BAR ═══ -->
        <div class="db-topbar">
            <div class="topbar-item">
                <span class="topbar-dot" id="statusDot"></span>
                <span id="statusMsg">Offline</span>
            </div>
            <div class="topbar-item">
                <i data-lucide="clock" style="width:14px;height:14px;color:var(--text-muted)"></i>
                <span id="sessionTimer">00:00</span>
            </div>
            <div class="topbar-item">
                <i data-lucide="film" style="width:14px;height:14px;color:var(--text-muted)"></i>
                <span id="frameCounter">Frame: 0</span>
            </div>
            <div class="topbar-item">
                <i data-lucide="cpu" style="width:14px;height:14px;color:var(--text-muted)"></i>
                <span id="fpsCounter">0 FPS</span>
            </div>
        </div>

        <!-- ═══ MAIN GRID ═══ -->
        <div class="db-grid">

            <!-- ── LEFT SIDEBAR ── -->
            <aside class="db-sidebar glass-panel">
                <div class="panel-title"><i data-lucide="sliders-horizontal"></i> Control Center</div>

                <label class="field-label">Model Source</label>
                <select class="db-select" style="margin-bottom:1rem">
                    <option>YOLOv8 + Optical Flow</option>
                    <option>Dense Crowd Baseline</option>
                </select>

                <!-- VIDEO UPLOAD -->
                <div class="upload-zone" id="uploadZone">
                    <i data-lucide="upload-cloud" style="width:36px;height:36px"></i>
                    <h4 style="font-size:.9rem">Upload MP4 Video</h4>
                    <p>Drag & drop or click to browse</p>
                    <input type="file" id="videoUpload" accept="video/mp4" style="display:none">
                </div>
                <div id="fileInfo" class="file-info" style="display:none">
                    <i data-lucide="file-video" style="width:14px;height:14px;color:var(--accent)"></i>
                    <span id="fileName" style="font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
                </div>

                <!-- DIVIDER -->
                <div style="display:flex;align-items:center;gap:.5rem;margin:.5rem 0">
                    <div style="flex:1;height:1px;background:var(--border)"></div>
                    <span style="font-size:.7rem;color:var(--text-muted)">OR</span>
                    <div style="flex:1;height:1px;background:var(--border)"></div>
                </div>

                <!-- LIVE STREAM INPUT -->
                <div style="margin-bottom:.5rem">
                    <label style="display:block;font-size:.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.4rem">
                        <i data-lucide="radio" style="width:11px;height:11px;vertical-align:middle;margin-right:.2rem"></i>
                        Live Stream / CCTV URL
                    </label>
                    <input id="liveUrlInput" type="text"
                        placeholder="YouTube, RTSP, HTTP stream..."
                        style="width:100%;padding:.55rem .7rem;background:rgba(0,0,0,.35);
                        border:1px solid var(--border);border-radius:8px;color:white;
                        font-size:.78rem;outline:none;box-sizing:border-box;margin-bottom:.4rem">
                    <button id="liveConnectBtn" style="width:100%;padding:.5rem;background:rgba(16,185,129,0.12);
                        border:1px solid rgba(16,185,129,0.35);border-radius:8px;color:#10b981;
                        font-size:.78rem;font-weight:600;cursor:pointer;display:flex;align-items:center;
                        justify-content:center;gap:.4rem">
                        <i data-lucide="link" style="width:13px;height:13px"></i> Connect Stream
                    </button>
                    <div id="liveStatus" style="display:none;margin-top:.4rem;font-size:.7rem;
                        padding:.35rem .6rem;background:rgba(16,185,129,0.08);
                        border:1px solid rgba(16,185,129,0.25);border-radius:6px;
                        color:#10b981;text-align:center">
                        ● Live stream ready
                    </div>
                </div>

                <button id="startStreamBtn" class="btn btn-start" disabled>
                    <i data-lucide="play-circle"></i> Start Analysis
                </button>
                <button id="stopStreamBtn" class="btn btn-stop" style="display:none">
                    <i data-lucide="stop-circle"></i> Stop
                </button>

                <!-- Mini stat pills -->
                <div class="mini-stats">
                    <div class="mini-stat">
                        <span class="mini-label">People</span>
                        <span class="mini-val" id="miniPeople">0</span>
                    </div>
                    <div class="mini-stat">
                        <span class="mini-label">Density</span>
                        <span class="mini-val warning" id="miniDensity">0.0</span>
                    </div>
                    <div class="mini-stat">
                        <span class="mini-label">Level</span>
                        <span class="mini-val success" id="miniDensityLabel">Low</span>
                    </div>
                    <div class="mini-stat">
                        <span class="mini-label">Speed Idx</span>
                        <span class="mini-val" id="miniSpeed">0.0</span>
                    </div>
                </div>

                <!-- Alert Log -->
                <div class="panel-title" style="margin-top:1.5rem"><i data-lucide="bell"></i> Alert Log</div>
                <div class="log-container" id="alertLog">
                    <div class="log-item"><span class="time">System</span><span>Monitoring offline</span></div>
                </div>
            </aside>

            <!-- ── CENTER FEEDS ── -->
            <main class="db-center">
                <!-- AI Rec Banner -->
                <div id="aiRecBox" class="ai-banner safe">
                    <div class="ai-banner-icon" id="aiBannerIcon">
                        <i data-lucide="shield-check" style="width:20px;height:20px"></i>
                    </div>
                    <div>
                        <div class="ai-banner-title" id="aiRecTitle">ALL CLEAR</div>
                        <div class="ai-banner-text" id="aiRecText">Awaiting stream...</div>
                    </div>
                    <div class="ai-banner-score">
                        <span id="bannerScore">0</span>
                        <span style="font-size:0.7rem;color:var(--text-muted)">RISK</span>
                    </div>
                </div>

                <!-- Video feeds row -->
                <div class="feeds-row">
                    <div class="video-wrapper">
                        <div class="feed-label label-primary"><i data-lucide="scan-eye"></i> Primary AI Feed</div>
                        <img id="primaryFeed" src="" alt="" style="opacity:0.15">
                        <div class="feed-overlay" id="feedOverlay">
                            <i data-lucide="video-off" style="width:40px;height:40px;opacity:0.3"></i>
                            <span style="color:var(--text-muted);font-size:0.85rem">Awaiting stream</span>
                        </div>
                    </div>
                    <div class="video-wrapper">
                        <div class="feed-label label-heatmap"><i data-lucide="flame"></i> Flow Heatmap</div>
                        <img id="heatmapFeed" src="" alt="" style="opacity:0.15">
                    </div>
                </div>

                <!-- Charts row -->
                <div class="charts-row">
                    <div class="chart-card glass-panel">
                        <div class="chart-title"><i data-lucide="trending-up"></i> Danger Level Timeline</div>
                        <div id="chartDanger" class="chart-area"></div>
                    </div>
                    <div class="chart-card glass-panel">
                        <div class="chart-title"><i data-lucide="users"></i> People Count Timeline</div>
                        <div id="chartPeople" class="chart-area"></div>
                    </div>
                </div>
            </main>

            <!-- ── RIGHT PANEL ── -->
            <aside class="db-right glass-panel">
                <div class="panel-title"><i data-lucide="bar-chart-2"></i> Analytics</div>

                <!-- Gauge -->
                <div id="gauge-container"></div>

                <!-- KPI cards -->
                <div class="kpi-grid">
                    <div class="kpi-card accent">
                        <div class="kpi-icon"><i data-lucide="users" style="width:18px;height:18px"></i></div>
                        <div class="kpi-val" id="valPeople">0</div>
                        <div class="kpi-label">Total People</div>
                    </div>
                    <div class="kpi-card warning">
                        <div class="kpi-icon"><i data-lucide="layers" style="width:18px;height:18px"></i></div>
                        <div class="kpi-val" id="valDensity">0.0</div>
                        <div class="kpi-label">Density /100px²</div>
                    </div>
                    <div class="kpi-card success">
                        <div class="kpi-icon"><i data-lucide="gauge" style="width:18px;height:18px"></i></div>
                        <div class="kpi-val" id="valDensityLabel" style="font-size:1rem">Low</div>
                        <div class="kpi-label">Density Level</div>
                    </div>
                    <div class="kpi-card muted">
                        <div class="kpi-icon"><i data-lucide="wind" style="width:18px;height:18px"></i></div>
                        <div class="kpi-val" id="valSpeed">0.0</div>
                        <div class="kpi-label">Speed Index</div>
                    </div>
                </div>

                <!-- Behaviour donut -->
                <div class="chart-title" style="margin-top:1rem"><i data-lucide="pie-chart"></i> Density Distribution</div>
                <div id="chartDonut" style="height:180px"></div>

                <!-- Speed sparkline -->
                <div class="chart-title" style="margin-top:0.5rem"><i data-lucide="activity"></i> Speed Index</div>
                <div id="chartSpeed" style="height:100px"></div>

                <!-- Peak stats -->
                <div class="peak-row">
                    <div class="peak-item">
                        <span class="peak-label">Peak People</span>
                        <span class="peak-val" id="peakPeople">0</span>
                    </div>
                    <div class="peak-item">
                        <span class="peak-label">Peak Danger</span>
                        <span class="peak-val danger" id="peakDanger">0%</span>
                    </div>
                    <div class="peak-item">
                        <span class="peak-label">Alerts Fired</span>
                        <span class="peak-val warning" id="alertCount">0</span>
                    </div>
                </div>
            </aside>
        </div>
    </div>
    `;

    lucide.createIcons();
    initDashboard();
}

// ── State ──────────────────────────────────────────────
let sessionStart = null;
let timerInterval = null;
let frameCount = 0;
let lastFrameTime = Date.now();
let fpsBuffer = [];
let peakPeople = 0;
let peakDanger = 0;
let alertsFired = 0;
let lastDangerLevel = 0;
let currentFilename = null;
let currentStreamUrl = null;
let primaryImgRef = null;
let heatmapImgRef = null;
let streamFinishedRef = false;

function initDashboard() {
    setupUpload();
    setupGauge();
    initCharts();
    // Expose updateStats globally
    window._dashboardUpdateStats = updateStats;

    // If stream is still active (returned from simulator), restore UI without restarting
    const streamActive = window._bgStream && window._bgStream.active && window._bgStream.filename;
    console.log('[Dashboard] initDashboard, streamActive=', streamActive, 'bgStream=', window._bgStream);
    if (streamActive) {
        setTimeout(() => {
            console.log('[Dashboard] Restoring stream UI');
            setStatus('live', 'Streaming Active');
            startTimer();
            const feedOverlay = document.getElementById('feedOverlay');
            if (feedOverlay) feedOverlay.style.display = 'none';
            const pImg = document.getElementById('primaryFeed');
            const hImg = document.getElementById('heatmapFeed');
            if (pImg) pImg.style.opacity = '1';
            if (hImg) hImg.style.opacity = '1';
            const startBtn = document.getElementById('startStreamBtn');
            const stopBtn  = document.getElementById('stopStreamBtn');
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn)  stopBtn.style.display  = 'flex';

            window._dashboardOnMessage = (data) => {
                try {
                    if (data.ping) return;
                    const pi = document.getElementById('primaryFeed');
                    const hi = document.getElementById('heatmapFeed');
                    if (data.annotated && pi) pi.src = data.annotated;
                    if (data.heatmap   && hi) hi.src = data.heatmap;
                    if (data.stats && !data.stats.error && !data.stats.status) {
                        updateStats(data.stats);
                    }
                    if (data.stats && data.stats.status === 'finished') {
                        setStatus('ready', 'Stream finished');
                        stopTimer();
                        if (document.getElementById('startStreamBtn')) {
                            document.getElementById('startStreamBtn').style.display = 'flex';
                            document.getElementById('stopStreamBtn').style.display = 'none';
                            document.getElementById('startStreamBtn').disabled = false;
                        }
                    }
                } catch(err) { console.error(err); }
            };
            addLog('Stream resumed');
        }, 100);
    }
}

// ── Upload & Controls ──────────────────────────────────
function setupUpload() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput  = document.getElementById('videoUpload');
    const startBtn   = document.getElementById('startStreamBtn');
    const stopBtn    = document.getElementById('stopStreamBtn');

    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    document.getElementById('liveConnectBtn').addEventListener('click', async () => {
        const url = document.getElementById('liveUrlInput').value.trim();
        if (!url) return;
        const btn = document.getElementById('liveConnectBtn');
        btn.textContent = 'Connecting...';
        btn.style.opacity = '0.6';
        setStatus('connecting', 'Resolving stream...');
        try {
            const res = await fetch('/api/stream-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const result = await res.json();
            btn.textContent = 'Connect Stream';
            btn.style.opacity = '1';
            if (result.status === 'ok') {
                currentFilename = null;
                currentStreamUrl = result.url;  // use resolved URL
                document.getElementById('liveStatus').style.display = 'block';
                setStatus('ready', 'Stream ready — click Start Analysis');
                document.getElementById('startStreamBtn').disabled = false;
                addLog(`Live stream connected`);
            } else {
                setStatus('offline', `Error: ${result.error}`);
                addLog(`Stream error: ${result.error}`, 'danger');
            }
        } catch (err) {
            document.getElementById('liveConnectBtn').textContent = 'Connect Stream';
            setStatus('offline', 'Connection failed');
        }
    });

    startBtn.addEventListener('click', () => {
        if (currentFilename || currentStreamUrl) {
            startStream(currentFilename || currentStreamUrl);
            startBtn.style.display = 'none';
            stopBtn.style.display = 'flex';
        }
    });

    stopBtn.addEventListener('click', () => {
        window._bgStream.stop();
        if (ws) { ws.close(); ws = null; }
        stopBtn.style.display = 'none';
        startBtn.style.display = 'flex';
        startBtn.disabled = currentFilename || currentStreamUrl ? false : true;
        document.getElementById('liveStatus').style.display = 'none';
        currentStreamUrl = null;
        setStatus('offline', 'Stopped');
        stopTimer();
        window._dashboardOnMessage = null;
    });
}

async function handleFile(file) {
    setStatus('connecting', `Uploading ${file.name}...`);
    document.getElementById('fileInfo').style.display = 'flex';
    document.getElementById('fileName').textContent = file.name;

    const formData = new FormData();
    formData.append('file', file);

    const API_BASE = "https://crowd-panic-prediction.onrender.com";

    try {
        const res = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
        }

        const result = await res.json();

        if (result.status === 'success') {
            currentFilename = result.filename;
            setStatus('ready', 'Ready — click Start Analysis');
            document.getElementById('startStreamBtn').disabled = false;
            addLog(`Loaded: ${file.name}`);
        } else {
            setStatus('offline', 'Upload failed');
        }

    } catch (err) {
        console.error(err);
        setStatus('offline', 'Upload failed');
    }
}

// ── Gauge ──────────────────────────────────────────────
function setupGauge() {
    Plotly.newPlot('gauge-container', [{
        type: 'indicator', mode: 'gauge+number',
        value: 0,
        title: { text: 'AI DANGER LEVEL', font: { size: 12, color: '#94a3b8' } },
        number: { font: { color: '#f8fafc', size: 36 }, suffix: '%' },
        gauge: {
            axis: { range: [0, 100], tickwidth: 1, tickcolor: '#334155', tickfont: { color: '#64748b', size: 10 } },
            bar: { color: 'rgba(255,255,255,0.15)', thickness: 0.25 },
            bgcolor: 'rgba(0,0,0,0)', borderwidth: 0,
            steps: [
                { range: [0, 30],  color: 'rgba(16,185,129,0.3)' },
                { range: [30, 70], color: 'rgba(245,158,11,0.3)' },
                { range: [70, 100],color: 'rgba(239,68,68,0.3)'  },
            ],
            threshold: { line: { color: '#ef4444', width: 3 }, thickness: 0.75, value: 70 }
        }
    }], {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 25, b: 10, l: 20, r: 20 },
        font: { family: 'Outfit, sans-serif' },
        height: 180
    }, { displayModeBar: false, responsive: true });
}

// ── Charts ─────────────────────────────────────────────
function initCharts() {
    const transparent = 'rgba(0,0,0,0)';
    const baseLayout = {
        paper_bgcolor: transparent, plot_bgcolor: transparent,
        margin: { t: 5, b: 25, l: 35, r: 10 },
        font: { family: 'Outfit, sans-serif', color: '#64748b', size: 10 },
        xaxis: { showgrid: false, zeroline: false, tickfont: { size: 9 } },
        yaxis: { showgrid: true, gridcolor: 'rgba(255,255,255,0.05)', zeroline: false },
        showlegend: false,
    };

    // Danger timeline
    Plotly.newPlot('chartDanger', [{
        x: [], y: [], type: 'scatter', mode: 'lines',
        fill: 'tozeroy',
        line: { color: '#ef4444', width: 2, shape: 'spline' },
        fillcolor: 'rgba(239,68,68,0.15)',
        name: 'Danger'
    }], { ...baseLayout, yaxis: { ...baseLayout.yaxis, range: [0, 100] }, height: 120 },
    { displayModeBar: false, responsive: true });

    // People timeline
    Plotly.newPlot('chartPeople', [{
        x: [], y: [], type: 'scatter', mode: 'lines',
        fill: 'tozeroy',
        line: { color: '#3b82f6', width: 2, shape: 'spline' },
        fillcolor: 'rgba(59,130,246,0.15)',
        name: 'People'
    }], { ...baseLayout, height: 120 },
    { displayModeBar: false, responsive: true });

    // Donut - density levels
    Plotly.newPlot('chartDonut', [{
        type: 'pie', values: [1, 0, 0, 0],
        labels: ['Low', 'Moderate', 'High', 'Critical'],
        hole: 0.6,
        marker: { colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'] },
        textinfo: 'none',
        hoverinfo: 'label+percent',
    }], {
        paper_bgcolor: transparent, plot_bgcolor: transparent,
        margin: { t: 5, b: 5, l: 5, r: 5 },
        showlegend: true,
        legend: { font: { size: 10, color: '#94a3b8' }, orientation: 'h', x: 0, y: -0.1 },
        height: 180,
        font: { family: 'Outfit, sans-serif' }
    }, { displayModeBar: false, responsive: true });

    // Speed sparkline
    Plotly.newPlot('chartSpeed', [{
        x: [], y: [], type: 'scatter', mode: 'lines',
        line: { color: '#a78bfa', width: 2, shape: 'spline' },
        fill: 'tozeroy', fillcolor: 'rgba(167,139,250,0.1)',
        name: 'Speed'
    }], { ...baseLayout, height: 100 },
    { displayModeBar: false, responsive: true });
}

function pushChartData(stats) {
    const t = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    history.frames.push(t);
    history.danger.push(stats.danger_level);
    history.people.push(stats.people_count);
    history.speed.push(stats.speed_index);
    history.running.push(stats.density || 0);
    history.walking.push(0);

    if (history.frames.length > MAX_POINTS) {
        Object.keys(history).forEach(k => history[k].shift());
    }

    Plotly.update('chartDanger', { x: [history.frames], y: [history.danger] }, {}, [0]);
    Plotly.update('chartPeople', { x: [history.frames], y: [history.people] }, {}, [0]);
    Plotly.update('chartSpeed',  { x: [history.frames], y: [history.speed]  }, {}, [0]);

    // Donut: density levels (Low/Moderate/High/Critical)
    const d = stats.density || 0;
    const low      = d < 0.5  ? 1 : 0;
    const moderate = d >= 0.5 && d < 1.5 ? 1 : 0;
    const high     = d >= 1.5 && d < 3.0 ? 1 : 0;
    const critical = d >= 3.0 ? 1 : 0;
    Plotly.update('chartDonut', { values: [[low, moderate, high, critical]] }, {}, [0]);
}

// ── Stream ─────────────────────────────────────────────
function startStream(filename) {
    if (ws) { ws.close(); ws = null; }

    // Reset history and stats
    Object.keys(history).forEach(k => history[k] = []);
    peakPeople = 0; peakDanger = 0; alertsFired = 0; lastDangerLevel = 0;
    frameCount = 0; fpsBuffer = []; streamFinishedRef = false;
    document.getElementById('peakPeople').textContent = '0';
    document.getElementById('peakDanger').textContent = '0%';
    document.getElementById('alertCount').textContent = '0';

    // Start persistent background stream (survives navigation to simulator)
    window._bgStream.start(filename);

    // Register this dashboard as the UI handler for full payloads
    window._dashboardOnMessage = (data) => {
        try {
            if (data.ping) return;
            // Always use getElementById so it works after re-renders
            const pImg = document.getElementById('primaryFeed');
            const hImg = document.getElementById('heatmapFeed');
            if (data.annotated && pImg) pImg.src = data.annotated;
            if (data.heatmap   && hImg) hImg.src = data.heatmap;
            if (data.stats) {
                if (data.stats.status === 'finished') {
                    streamFinishedRef = true;
                    setStatus('ready', 'Stream finished');
                    stopTimer();
                    document.getElementById('startStreamBtn').style.display = 'flex';
                    document.getElementById('stopStreamBtn').style.display = 'none';
                    document.getElementById('startStreamBtn').disabled = false;
                    addLog('Stream completed');
                } else if (data.stats.error) {
                    setStatus('offline', `Error: ${data.stats.error}`);
                    addLog(`Error: ${data.stats.error}`, 'danger');
                } else {
                    updateStats(data.stats);
                }
            }
        } catch(err) { console.error(err); }
    };

    setStatus('live', 'Streaming Active');
    startTimer();
    const feedOverlay = document.getElementById('feedOverlay');
    if (feedOverlay) feedOverlay.style.display = 'none';
    primaryImgRef = document.getElementById('primaryFeed');
    heatmapImgRef = document.getElementById('heatmapFeed');
    if (primaryImgRef) primaryImgRef.style.opacity = '1';
    if (heatmapImgRef) heatmapImgRef.style.opacity = '1';
    addLog('Inference stream started');
}

// ── Stats update ───────────────────────────────────────
function updateStats(stats) {
    // KPI cards
    document.getElementById('valPeople').textContent       = stats.people_count;
    document.getElementById('valDensity').textContent      = (stats.density || 0).toFixed(2);
    document.getElementById('valDensityLabel').textContent = stats.density_label || 'Low';
    document.getElementById('valSpeed').textContent        = (stats.speed_index || 0).toFixed(1);

    // Color density label
    const labelEl = document.getElementById('valDensityLabel');
    const labelColors = { Low: 'var(--success)', Moderate: 'var(--accent)', High: 'var(--warning)', Critical: 'var(--danger)' };
    labelEl.style.color = labelColors[stats.density_label] || 'var(--success)';

    // Mini sidebar pills
    document.getElementById('miniPeople').textContent       = stats.people_count;
    document.getElementById('miniDensity').textContent      = (stats.density || 0).toFixed(2);
    document.getElementById('miniDensityLabel').textContent = stats.density_label || 'Low';
    document.getElementById('miniSpeed').textContent        = (stats.speed_index || 0).toFixed(1);

    // Frame / FPS
    frameCount++;
    document.getElementById('frameCounter').textContent = `Frame: ${stats.frame || frameCount}`;
    const now = Date.now();
    fpsBuffer.push(now);
    fpsBuffer = fpsBuffer.filter(t => now - t < 1000);
    document.getElementById('fpsCounter').textContent = `${fpsBuffer.length} FPS`;

    // Gauge
    Plotly.update('gauge-container', { value: [stats.danger_level] }, {}, [0]);
    document.getElementById('bannerScore').textContent = stats.danger_level;

    // Charts
    pushChartData(stats);

    // Broadcast to global stream bus (feeds simulator page)
    if (window._crowdStreamBus) {
        window._crowdStreamBus.emit(stats.people_count, stats.danger_level);
    }

    // Peaks
    if (stats.people_count > peakPeople) {
        peakPeople = stats.people_count;
        document.getElementById('peakPeople').textContent = peakPeople;
    }
    if (stats.danger_level > peakDanger) {
        peakDanger = stats.danger_level;
        document.getElementById('peakDanger').textContent = peakDanger + '%';
    }

    // AI Banner
    updateBanner(stats);

    // Alerts
    if (stats.danger_level > 70 && lastDangerLevel <= 70) {
        alertsFired++;
        document.getElementById('alertCount').textContent = alertsFired;
        addLog('CRITICAL: Panic signature detected!', 'danger');
    } else if (stats.danger_level > 40 && lastDangerLevel <= 40) {
        alertsFired++;
        document.getElementById('alertCount').textContent = alertsFired;
        addLog('Warning: Elevated crowd movement', 'warning');
    }
    lastDangerLevel = stats.danger_level;
}

function updateBanner(stats) {
    const box   = document.getElementById('aiRecBox');
    const icon  = document.getElementById('aiBannerIcon');
    const title = document.getElementById('aiRecTitle');
    const text  = document.getElementById('aiRecText');

    let cls, ico, ttl, msg;
    if (stats.danger_level > 70) {
        cls = 'danger'; ico = 'alert-octagon'; ttl = 'CRITICAL ALERT';
        msg = 'EXTREME PANIC DETECTED — Dispatch response unit. Open auxiliary gates immediately.';
    } else if (stats.danger_level > 40) {
        cls = 'warning'; ico = 'alert-triangle'; ttl = 'ELEVATED RISK';
        msg = 'Anomalous movement detected. Position security at choke points.';
    } else if (stats.people_count > 0) {
        cls = 'safe'; ico = 'shield-check'; ttl = 'ALL CLEAR';
        msg = 'Crowd flowing normally. No anomalies detected.';
    } else {
        cls = 'idle'; ico = 'scan'; ttl = 'SCANNING';
        msg = 'Awaiting crowd detection...';
    }

    box.className = `ai-banner ${cls}`;
    icon.innerHTML = `<i data-lucide="${ico}" style="width:20px;height:20px"></i>`;
    title.textContent = ttl;
    text.textContent  = msg;
    lucide.createIcons();
}

// ── Helpers ────────────────────────────────────────────
function setStatus(state, msg) {
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusMsg');
    dot.className = `topbar-dot ${state}`;
    txt.textContent = msg;
}

function startTimer() {
    sessionStart = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const s = Math.floor((Date.now() - sessionStart) / 1000);
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        document.getElementById('sessionTimer').textContent = `${m}:${sec}`;
    }, 1000);
}

function stopTimer() { clearInterval(timerInterval); }

function addLog(msg, type = '') {
    const log = document.getElementById('alertLog');
    if (!log) return;
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-item animate-fade-in ${type}`;
    div.innerHTML = `<span class="time">${time}</span><span>${msg}</span>`;
    log.prepend(div);
    // Keep max 30 entries
    while (log.children.length > 30) log.removeChild(log.lastChild);
}

export function cleanupDashboard() {
    if (ws) { ws.close(); ws = null; }
    stopTimer();
}
