// ══════════════════════════════════════════════════════════════════
// 2D CROWD EVACUATION SIMULATOR  —  CrowdGuard
// Social-force stampede model with crushing, panic contagion, heatmap
// ══════════════════════════════════════════════════════════════════

const SIM = {
  canvas: null, ctx: null,
  exits: [], walls: [], agents: [],
  running: false, animFrame: null,
  evacuated: 0, injured: 0,
  dangerLevel: 0, peopleCount: 100,
  W: 0, H: 0,
  startTime: 0, elapsed: 0,
  timerInterval: null,
  mode: 'view',
  wallDrag: null,
  wallPreview: null,
  liveMode: false,       // true = synced to real stream
  lastLivePeople: 0,     // track changes to respawn agents
};

// ── Constants ──────────────────────────────────────────────────────
const R          = 4;      // agent radius px
const DESIRED_NORMAL  = 1.0;
const DESIRED_PANIC   = 2.5;
const REPULSE_RANGE   = 18;
const WALL_RANGE      = 22;
const CRUSH_RADIUS    = 15;
const CRUSH_NEIGHBORS = 5;
const PANIC_CONTAGION = 40;
const EXIT_W          = 28;
const EXIT_H          = 14;
const BOTTLENECK_R    = 30;
const BOTTLENECK_N    = 8;

// ── renderSimulator ────────────────────────────────────────────────
export function renderSimulator(container) {
  container.innerHTML = `
<div style="display:flex;flex-direction:column;height:calc(100vh - 60px);background:#040914;overflow:hidden">

  <!-- STAMPEDE WARNING BANNER -->
  <div id="simStampedeBanner" style="display:none;background:rgba(239,68,68,0.15);border-bottom:1px solid rgba(239,68,68,0.4);
    padding:.5rem 1.5rem;text-align:center;font-weight:700;font-size:.85rem;color:#ef4444;letter-spacing:.08em;
    animation:blink 1.2s infinite">
    ⚠ STAMPEDE DETECTED — CASUALTY RATE CRITICAL
  </div>

  <!-- BODY: sidebar + canvas -->
  <div style="display:flex;flex:1;overflow:hidden;gap:0">

    <!-- ── SIDEBAR ── -->
    <aside class="glass-panel animate-fade-in" style="width:240px;min-width:240px;display:flex;flex-direction:column;
      gap:1rem;padding:1.2rem 1rem;overflow-y:auto;border-radius:0;border-right:1px solid rgba(255,255,255,0.06)">

      <!-- Live detected count -->
      <div style="text-align:center;padding:.6rem;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:8px">
        <div style="font-size:.7rem;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:.2rem">Detected</div>
        <div id="simLiveCount" style="font-size:2rem;font-weight:800;color:#60a5fa;font-family:'Outfit',sans-serif;line-height:1">100</div>
        <div style="font-size:.7rem;color:var(--text-muted)">people (live stream)</div>
      </div>

      <!-- Crowd size -->
      <div>
        <label class="field-label" style="display:block;margin-bottom:.4rem">Crowd Size</label>
        <div style="display:flex;align-items:center;gap:.5rem">
          <input type="range" id="simCrowdSlider" min="10" max="500" value="100"
            style="flex:1;accent-color:#60a5fa;height:4px">
          <span id="simCrowdVal" style="font-weight:700;min-width:32px;text-align:right;font-size:.9rem">100</span>
        </div>
      </div>

      <!-- Panic level -->
      <div>
        <label class="field-label" style="display:block;margin-bottom:.4rem">Panic Level</label>
        <div style="display:flex;align-items:center;gap:.5rem">
          <input type="range" id="simPanicSlider" min="0" max="100" value="0"
            style="flex:1;accent-color:#f97316;height:4px">
          <span id="simPanicVal" style="font-weight:700;min-width:32px;text-align:right;font-size:.9rem;color:#f97316">0</span>
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;flex-direction:column;gap:.4rem">
        <button id="simExitBtn" class="btn btn-outline" style="font-size:.8rem;padding:.5rem .8rem;justify-content:flex-start;gap:.5rem">
          <i data-lucide="door-open" style="width:14px;height:14px"></i> Add Exit
        </button>
        <button id="simWallBtn" class="btn btn-outline" style="font-size:.8rem;padding:.5rem .8rem;justify-content:flex-start;gap:.5rem">
          <i data-lucide="minus" style="width:14px;height:14px"></i> Add Wall
        </button>
        <button id="simClearBtn" class="btn btn-outline" style="font-size:.8rem;padding:.5rem .8rem;justify-content:flex-start;gap:.5rem;color:#ef4444;border-color:rgba(239,68,68,0.3)">
          <i data-lucide="trash-2" style="width:14px;height:14px"></i> Clear
        </button>
      </div>

      <button id="simRunBtn" class="btn" style="font-size:.85rem;padding:.65rem">
        <i data-lucide="play-circle" style="width:15px;height:15px"></i> Run Simulation
      </button>

      <!-- Live Check button -->
      <button id="simLiveBtn" class="btn btn-outline" style="font-size:.85rem;padding:.65rem;border-color:rgba(16,185,129,0.4);color:#10b981;gap:.5rem">
        <i data-lucide="radio" style="width:15px;height:15px"></i> Live Check
      </button>
      <div id="simLiveStatus" style="display:none;text-align:center;font-size:.72rem;padding:.4rem .6rem;
        background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:6px;color:#10b981">
        <span id="simLiveStatusDot" style="display:inline-block;width:7px;height:7px;border-radius:50%;
          background:#10b981;margin-right:.4rem;animation:blink 1.2s infinite"></span>
        Live simulation active
      </div>

      <!-- Stats -->
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:.8rem">
        <div class="panel-title" style="margin-bottom:.6rem;font-size:.75rem">
          <i data-lucide="bar-chart-2" style="width:13px;height:13px"></i> Statistics
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.78rem">
          <div style="color:var(--text-muted)">Total</div>
          <div id="sTotal" style="text-align:right;font-weight:600">0</div>
          <div style="color:var(--text-muted)">Evacuated</div>
          <div id="sEvac" style="text-align:right;font-weight:600;color:#10b981">0</div>
          <div style="color:var(--text-muted)">Injured</div>
          <div id="sInjured" style="text-align:right;font-weight:600;color:#ef4444">0</div>
          <div style="color:var(--text-muted)">Remaining</div>
          <div id="sRemain" style="text-align:right;font-weight:600">0</div>
        </div>
      </div>

      <!-- Progress bar -->
      <div>
        <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-muted);margin-bottom:.3rem">
          <span>Evacuation</span>
          <span id="sEvacPct">0%</span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden">
          <div id="sEvacBar" style="height:100%;width:0%;background:#10b981;border-radius:3px;transition:width .3s"></div>
        </div>
      </div>

      <!-- Time + casualty rate -->
      <div style="font-size:.75rem;color:var(--text-muted);display:flex;flex-direction:column;gap:.25rem">
        <div>Time: <span id="sTime" style="color:var(--text-main);font-weight:600">0s</span></div>
        <div>Casualty rate: <span id="sCasRate" style="font-weight:600;color:#ef4444">0%</span></div>
      </div>

    </aside>

    <!-- ── CANVAS AREA ── -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
      <!-- toolbar -->
      <div style="height:36px;min-height:36px;display:flex;align-items:center;padding:0 1rem;gap:1rem;
        background:rgba(4,9,20,0.8);border-bottom:1px solid rgba(255,255,255,0.05)">
        <span id="simModeLabel" style="font-size:.72rem;font-weight:700;letter-spacing:.08em;color:#60a5fa">MODE: VIEW</span>
        <span id="simModeHint" style="font-size:.7rem;color:var(--text-muted)">Add exits, then run simulation</span>
      </div>
      <canvas id="simCanvas" style="flex:1;display:block;cursor:default"></canvas>
    </div>

  </div>
</div>`;

  lucide.createIcons();
  _initSim();
}

// ── updateSimLiveData ──────────────────────────────────────────────
export function updateSimLiveData(people, danger) {
  SIM.peopleCount = people;
  SIM.dangerLevel = danger;

  // Always update UI labels
  const liveEl   = document.getElementById('simLiveCount');
  const slider   = document.getElementById('simCrowdSlider');
  const crowdVal = document.getElementById('simCrowdVal');
  const panicSl  = document.getElementById('simPanicSlider');
  const panicVal = document.getElementById('simPanicVal');
  if (liveEl)   liveEl.textContent   = people;
  if (slider)   slider.value         = Math.min(people, 500);
  if (crowdVal) crowdVal.textContent = people;
  if (panicSl)  panicSl.value        = Math.min(danger, 100);
  if (panicVal) panicVal.textContent = Math.min(danger, 100);

  if (SIM.running) _applyPanicLevel();

  // ── LIVE MODE: drive simulation from stream ──────────────────
  if (!SIM.liveMode) return;

  // If people count changed significantly, add/remove agents to match
  const currentActive = SIM.agents.filter(a => a.state !== 'injured').length;
  const diff = people - currentActive;

  if (diff > 5) {
    // More people detected — spawn new agents at random positions
    for (let i = 0; i < diff; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = Math.random() * Math.min(SIM.W, SIM.H) * 0.35;
      SIM.agents.push({
        x: SIM.W / 2 + Math.cos(angle) * r,
        y: SIM.H / 2 + Math.sin(angle) * r,
        vx: 0, vy: 0,
        state: danger > 40 ? 'panic' : 'normal',
        mass: 0.8 + Math.random() * 0.4,
        radius: R,
      });
    }
  } else if (diff < -5) {
    // Fewer people — remove some normal agents (they left the scene)
    let toRemove = Math.abs(diff);
    SIM.agents = SIM.agents.filter(a => {
      if (toRemove > 0 && a.state === 'normal') { toRemove--; return false; }
      return true;
    });
  }

  // Start simulation automatically if exits are placed and not already running
  if (!SIM.running && SIM.exits.length > 0 && people > 0) {
    if (SIM.agents.length === 0) _spawnAgents();
    _startSim();
    _setRunBtn('stop');
  }
}

// ── cleanupSimulator ───────────────────────────────────────────────
export function cleanupSimulator() {
  _stopSim();
  SIM.liveMode = false;
  window.removeEventListener('resize', _resizeSim);
  // Remove stream bus listener
  if (window._crowdStreamBus) {
    window._crowdStreamBus.listeners = window._crowdStreamBus.listeners.filter(
      fn => fn.toString().indexOf('updateSimLiveData') === -1
    );
  }
}

// ── _toggleLiveMode ────────────────────────────────────────────────
function _toggleLiveMode() {
  SIM.liveMode = !SIM.liveMode;
  const btn    = document.getElementById('simLiveBtn');
  const status = document.getElementById('simLiveStatus');
  const runBtn = document.getElementById('simRunBtn');

  if (SIM.liveMode) {
    // Activate live mode
    btn.style.background    = 'rgba(16,185,129,0.15)';
    btn.style.borderColor   = '#10b981';
    btn.style.color         = '#10b981';
    btn.innerHTML = '<i data-lucide="radio" style="width:15px;height:15px"></i> Live: ON';
    status.style.display    = 'block';
    runBtn.style.opacity    = '0.4';
    runBtn.style.pointerEvents = 'none';
    lucide.createIcons();

    // If no exits placed, show hint
    if (SIM.exits.length === 0) {
      const hint = document.getElementById('simModeHint');
      if (hint) hint.textContent = '⚠ Place exits first, then start your video stream';
    }

    // If stream already has data, start immediately
    if (SIM.peopleCount > 0 && SIM.exits.length > 0) {
      if (!SIM.running) {
        _spawnAgents();
        _startSim();
        _setRunBtn('stop');
      }
    }
  } else {
    // Deactivate live mode
    btn.style.background    = '';
    btn.style.borderColor   = 'rgba(16,185,129,0.4)';
    btn.style.color         = '#10b981';
    btn.innerHTML = '<i data-lucide="radio" style="width:15px;height:15px"></i> Live Check';
    status.style.display    = 'none';
    runBtn.style.opacity    = '1';
    runBtn.style.pointerEvents = 'auto';
    lucide.createIcons();
    _stopSim();
    _setRunBtn('run');
  }
}

// ══════════════════════════════════════════════════════════════════
// INTERNAL — init
// ══════════════════════════════════════════════════════════════════
function _initSim() {
  SIM.canvas = document.getElementById('simCanvas');
  if (!SIM.canvas) return;
  SIM.ctx = SIM.canvas.getContext('2d');
  SIM.exits   = [];
  SIM.walls   = [];
  SIM.agents  = [];
  SIM.evacuated = 0;
  SIM.injured   = 0;
  SIM.elapsed   = 0;
  SIM.mode      = 'view';

  _resizeSim();
  window.addEventListener('resize', _resizeSim);

  // Subscribe to global stream bus from dashboard
  if (window._crowdStreamBus) {
    window._crowdStreamBus.subscribe((people, danger) => {
      updateSimLiveData(people, danger);
    });
  }

  // Sliders
  document.getElementById('simCrowdSlider').addEventListener('input', e => {
    SIM.peopleCount = +e.target.value;
    document.getElementById('simCrowdVal').textContent = SIM.peopleCount;
  });
  document.getElementById('simPanicSlider').addEventListener('input', e => {
    SIM.dangerLevel = +e.target.value;
    document.getElementById('simPanicVal').textContent = SIM.dangerLevel;
    if (SIM.running) _applyPanicLevel();
  });

  // Buttons
  document.getElementById('simExitBtn').addEventListener('click', () => _setMode('exit'));
  document.getElementById('simWallBtn').addEventListener('click', () => _setMode('wall'));
  document.getElementById('simClearBtn').addEventListener('click', _clearAll);
  document.getElementById('simRunBtn').addEventListener('click', _toggleSim);
  document.getElementById('simLiveBtn').addEventListener('click', _toggleLiveMode);

  // Canvas events
  SIM.canvas.addEventListener('click',     _onCanvasClick);
  SIM.canvas.addEventListener('mousedown', _onMouseDown);
  SIM.canvas.addEventListener('mousemove', _onMouseMove);
  SIM.canvas.addEventListener('mouseup',   _onMouseUp);

  _drawSim();
}

function _resizeSim() {
  if (!SIM.canvas) return;
  const wrap = SIM.canvas.parentElement;
  SIM.canvas.width  = wrap.clientWidth;
  SIM.canvas.height = wrap.clientHeight;
  SIM.W = SIM.canvas.width;
  SIM.H = SIM.canvas.height;
  _drawSim();
}

// ══════════════════════════════════════════════════════════════════
// MODE / INTERACTION
// ══════════════════════════════════════════════════════════════════
function _setMode(m) {
  SIM.mode = m;
  const label = document.getElementById('simModeLabel');
  const hint  = document.getElementById('simModeHint');
  const exitB = document.getElementById('simExitBtn');
  const wallB = document.getElementById('simWallBtn');
  if (!label) return;

  exitB.style.borderColor = m === 'exit' ? '#10b981' : '';
  exitB.style.color       = m === 'exit' ? '#10b981' : '';
  wallB.style.borderColor = m === 'wall' ? '#60a5fa' : '';
  wallB.style.color       = m === 'wall' ? '#60a5fa' : '';

  if (m === 'exit') {
    label.textContent = 'MODE: PLACE EXIT';
    label.style.color = '#10b981';
    hint.textContent  = 'Click on the canvas edge to place an exit';
    SIM.canvas.style.cursor = 'crosshair';
  } else if (m === 'wall') {
    label.textContent = 'MODE: DRAW WALL';
    label.style.color = '#60a5fa';
    hint.textContent  = 'Click and drag to draw a wall obstacle';
    SIM.canvas.style.cursor = 'crosshair';
  } else {
    label.textContent = 'MODE: VIEW';
    label.style.color = '#60a5fa';
    hint.textContent  = SIM.running ? 'Simulation running…' : 'Add exits, then run simulation';
    SIM.canvas.style.cursor = 'default';
  }
}

function _onCanvasClick(e) {
  if (SIM.mode !== 'exit') return;
  const rect = SIM.canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (SIM.W / rect.width);
  const y = (e.clientY - rect.top)  * (SIM.H / rect.height);
  SIM.exits.push({ x, y });
  _setMode('view');
  _drawSim();
}

function _onMouseDown(e) {
  if (SIM.mode !== 'wall') return;
  const rect = SIM.canvas.getBoundingClientRect();
  SIM.wallDrag = {
    x1: (e.clientX - rect.left) * (SIM.W / rect.width),
    y1: (e.clientY - rect.top)  * (SIM.H / rect.height),
  };
}

function _onMouseMove(e) {
  if (SIM.mode !== 'wall' || !SIM.wallDrag) return;
  const rect = SIM.canvas.getBoundingClientRect();
  SIM.wallPreview = {
    x2: (e.clientX - rect.left) * (SIM.W / rect.width),
    y2: (e.clientY - rect.top)  * (SIM.H / rect.height),
  };
  _drawSim();
}

function _onMouseUp(e) {
  if (SIM.mode !== 'wall' || !SIM.wallDrag) return;
  const rect = SIM.canvas.getBoundingClientRect();
  const x2 = (e.clientX - rect.left) * (SIM.W / rect.width);
  const y2 = (e.clientY - rect.top)  * (SIM.H / rect.height);
  SIM.walls.push({ x1: SIM.wallDrag.x1, y1: SIM.wallDrag.y1, x2, y2 });
  SIM.wallDrag    = null;
  SIM.wallPreview = null;
  _setMode('view');
  _drawSim();
}

// ══════════════════════════════════════════════════════════════════
// SIMULATION CONTROL
// ══════════════════════════════════════════════════════════════════
function _toggleSim() {
  if (SIM.running) {
    _stopSim();
    _setRunBtn('run');
  } else {
    _spawnAgents();
    _startSim();
    _setRunBtn('stop');
  }
}

function _setRunBtn(state) {
  const btn = document.getElementById('simRunBtn');
  if (!btn) return;
  if (state === 'run') {
    btn.innerHTML = '<i data-lucide="play-circle" style="width:15px;height:15px"></i> Run Simulation';
    btn.style.background = '';
  } else if (state === 'stop') {
    btn.innerHTML = '<i data-lucide="square" style="width:15px;height:15px"></i> Stop';
    btn.style.background = '#ef4444';
  } else {
    btn.innerHTML = '<i data-lucide="check-circle" style="width:15px;height:15px"></i> Complete';
    btn.style.background = '#10b981';
  }
  lucide.createIcons();
}

function _clearAll() {
  _stopSim();
  SIM.exits     = [];
  SIM.walls     = [];
  SIM.agents    = [];
  SIM.evacuated = 0;
  SIM.injured   = 0;
  SIM.elapsed   = 0;
  SIM.mode      = 'view';
  _setRunBtn('run');
  _updateStats();
  const banner = document.getElementById('simStampedeBanner');
  if (banner) banner.style.display = 'none';
  _drawSim();
}

function _startSim() {
  SIM.running   = true;
  SIM.startTime = performance.now();
  clearInterval(SIM.timerInterval);
  SIM.timerInterval = setInterval(() => {
    SIM.elapsed++;
    const el = document.getElementById('sTime');
    if (el) el.textContent = SIM.elapsed + 's';
  }, 1000);
  _setMode('view');
  _simLoop();
}

function _stopSim() {
  SIM.running = false;
  clearInterval(SIM.timerInterval);
  if (SIM.animFrame) { cancelAnimationFrame(SIM.animFrame); SIM.animFrame = null; }
}

function _simLoop() {
  if (!SIM.running) return;
  _stepPhysics();
  _drawSim();
  _updateStats();
  SIM.animFrame = requestAnimationFrame(_simLoop);
}

// ══════════════════════════════════════════════════════════════════
// AGENT SPAWNING
// ══════════════════════════════════════════════════════════════════
function _spawnAgents() {
  SIM.agents    = [];
  SIM.evacuated = 0;
  SIM.injured   = 0;
  const n = Math.min(SIM.peopleCount, 450);
  const cx = SIM.W / 2, cy = SIM.H / 2;
  const maxR = Math.min(SIM.W, SIM.H) * 0.38;

  for (let i = 0; i < n; i++) {
    // Distribute in a rough crowd cluster near center
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.sqrt(Math.random()) * maxR;
    const panic = SIM.dangerLevel > 40;
    SIM.agents.push({
      x:     cx + Math.cos(angle) * dist,
      y:     cy + Math.sin(angle) * dist,
      vx:    0, vy: 0,
      state: panic ? 'panic' : 'normal',  // 'normal' | 'panic' | 'injured'
      mass:  0.8 + Math.random() * 0.4,
      radius: R,
    });
  }
}

function _applyPanicLevel() {
  const threshold = 40;
  for (const a of SIM.agents) {
    if (a.state === 'injured') continue;
    if (SIM.dangerLevel > threshold && a.state === 'normal') {
      if (Math.random() < 0.02) a.state = 'panic';
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// PHYSICS — Social Force Model
// ══════════════════════════════════════════════════════════════════
function _stepPhysics() {
  const agents = SIM.agents;
  const exits  = SIM.exits;
  if (exits.length === 0) return;

  // 1. Panic contagion
  if (SIM.dangerLevel > 60) {
    for (const a of agents) {
      if (a.state !== 'panic') continue;
      for (const b of agents) {
        if (b.state !== 'normal') continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < PANIC_CONTAGION && Math.random() < 0.004) b.state = 'panic';
      }
    }
  }

  // 2. Compute forces
  for (const a of agents) {
    if (a.state === 'injured') { a.vx = 0; a.vy = 0; continue; }

    const desiredSpeed = a.state === 'panic' ? DESIRED_PANIC : DESIRED_NORMAL;

    // --- Exit attraction (nearest exit) ---
    let nearestExit = null, minExitD = Infinity;
    for (const ex of exits) {
      const d = Math.hypot(a.x - ex.x, a.y - ex.y);
      if (d < minExitD) { minExitD = d; nearestExit = ex; }
    }

    let fx = 0, fy = 0;
    if (nearestExit) {
      const dx = nearestExit.x - a.x;
      const dy = nearestExit.y - a.y;
      const d  = Math.hypot(dx, dy) || 1;
      // Slow down near exit due to crowding (bottleneck)
      const crowdNearExit = agents.filter(b =>
        b !== a && b.state !== 'injured' &&
        Math.hypot(b.x - nearestExit.x, b.y - nearestExit.y) < BOTTLENECK_R
      ).length;
      const bottleneckFactor = crowdNearExit > BOTTLENECK_N
        ? 0.4 + 0.6 * (BOTTLENECK_N / crowdNearExit)
        : 1.0;
      fx += (dx / d) * desiredSpeed * bottleneckFactor;
      fy += (dy / d) * desiredSpeed * bottleneckFactor;
    }

    // --- Agent repulsion ---
    let neighborCount = 0;
    for (const b of agents) {
      if (b === a) continue;
      const rx = a.x - b.x, ry = a.y - b.y;
      const rd = Math.hypot(rx, ry) || 0.01;
      if (rd < CRUSH_RADIUS) neighborCount++;
      if (rd < REPULSE_RANGE) {
        const overlap = REPULSE_RANGE - rd;
        const force   = (overlap / REPULSE_RANGE) * 1.8 / a.mass;
        fx += (rx / rd) * force;
        fy += (ry / rd) * force;
        // Severe overlap → injury
        if (rd < R * 1.5 && b.state !== 'injured' && Math.random() < 0.001) {
          b.state = 'injured';
          SIM.injured++;
        }
      }
    }

    // --- Crushing mechanic ---
    if (neighborCount >= CRUSH_NEIGHBORS && Math.random() < 0.008) {
      a.state = 'injured';
      SIM.injured++;
      a.vx = 0; a.vy = 0;
      continue;
    }

    // --- Wall repulsion ---
    for (const w of SIM.walls) {
      const cp = _closestOnSegment(a.x, a.y, w.x1, w.y1, w.x2, w.y2);
      const wd = Math.hypot(a.x - cp.x, a.y - cp.y) || 0.01;
      if (wd < WALL_RANGE) {
        const f = ((WALL_RANGE - wd) / WALL_RANGE) * 2.5;
        fx += ((a.x - cp.x) / wd) * f;
        fy += ((a.y - cp.y) / wd) * f;
      }
    }

    // --- Boundary repulsion ---
    const margin = 20;
    if (a.x < margin)       fx += (margin - a.x) * 0.3;
    if (a.x > SIM.W - margin) fx -= (a.x - (SIM.W - margin)) * 0.3;
    if (a.y < margin)       fy += (margin - a.y) * 0.3;
    if (a.y > SIM.H - margin) fy -= (a.y - (SIM.H - margin)) * 0.3;

    // --- Erratic jitter when panic > 70 ---
    if (SIM.dangerLevel > 70 && a.state === 'panic') {
      fx += (Math.random() - 0.5) * 1.8;
      fy += (Math.random() - 0.5) * 1.8;
    }

    // Clamp velocity
    const speed = Math.hypot(fx, fy);
    const maxV  = desiredSpeed * 1.6;
    if (speed > maxV) { fx = (fx / speed) * maxV; fy = (fy / speed) * maxV; }

    a.vx = fx;
    a.vy = fy;
  }

  // 3. Integrate positions + check evacuation
  for (const a of agents) {
    if (a.state === 'injured') continue;
    a.x = Math.max(R, Math.min(SIM.W - R, a.x + a.vx));
    a.y = Math.max(R, Math.min(SIM.H - R, a.y + a.vy));

    // Check if reached an exit
    for (const ex of exits) {
      if (Math.hypot(a.x - ex.x, a.y - ex.y) < EXIT_W) {
        a.state = 'evacuated';
        SIM.evacuated++;
        break;
      }
    }
  }

  // Remove evacuated
  SIM.agents = agents.filter(a => a.state !== 'evacuated');

  // Check completion
  const remaining = SIM.agents.filter(a => a.state !== 'injured').length;
  if (remaining === 0 && SIM.running) {
    _stopSim();
    _setRunBtn('complete');
  }
}

function _closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { x: ax + t * dx, y: ay + t * dy };
}

// ══════════════════════════════════════════════════════════════════
// STATS UPDATE
// ══════════════════════════════════════════════════════════════════
function _updateStats() {
  const total     = SIM.peopleCount;
  const evacuated = SIM.evacuated;
  const injured   = SIM.agents.filter(a => a.state === 'injured').length;
  const remaining = SIM.agents.filter(a => a.state !== 'injured').length;
  const pct       = total > 0 ? Math.round((evacuated / total) * 100) : 0;
  const casRate   = total > 0 ? Math.round((injured / total) * 100) : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('sTotal',   total);
  set('sEvac',    evacuated);
  set('sInjured', injured);
  set('sRemain',  remaining);
  set('sEvacPct', pct + '%');
  set('sCasRate', casRate + '%');

  const bar = document.getElementById('sEvacBar');
  if (bar) bar.style.width = pct + '%';

  // Stampede banner
  const banner = document.getElementById('simStampedeBanner');
  if (banner) banner.style.display = casRate > 20 ? 'block' : 'none';
}

// ══════════════════════════════════════════════════════════════════
// RENDERING
// ══════════════════════════════════════════════════════════════════
function _drawSim() {
  if (!SIM.ctx) return;
  const ctx = SIM.ctx, W = SIM.W, H = SIM.H;

  // ── Background ──
  ctx.fillStyle = '#040914';
  ctx.fillRect(0, 0, W, H);

  // ── Subtle grid ──
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ── Density heatmap ──
  const active = SIM.agents.filter(a => a.state === 'normal' || a.state === 'panic');
  for (let i = 0; i < active.length; i += 3) {
    const a = active[i];
    const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 30);
    g.addColorStop(0, a.state === 'panic' ? 'rgba(249,115,22,0.09)' : 'rgba(239,68,68,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(a.x, a.y, 30, 0, Math.PI * 2); ctx.fill();
  }

  // ── Walls ──
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 7;
  for (const w of SIM.walls) {
    ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
  }
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth = 3;
  for (const w of SIM.walls) {
    ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
  }

  // Wall preview while dragging
  if (SIM.wallDrag && SIM.wallPreview) {
    ctx.strokeStyle = 'rgba(96,165,250,0.5)';
    ctx.lineWidth = 5;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(SIM.wallDrag.x1, SIM.wallDrag.y1);
    ctx.lineTo(SIM.wallPreview.x2, SIM.wallPreview.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Exits ──
  for (let i = 0; i < SIM.exits.length; i++) {
    const ex = SIM.exits[i];

    // Count agents near this exit for bottleneck detection
    const nearCount = SIM.agents.filter(a =>
      Math.hypot(a.x - ex.x, a.y - ex.y) < BOTTLENECK_R
    ).length;
    const isBottleneck = nearCount > BOTTLENECK_N;

    // Outer glow
    const glowColor = isBottleneck ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.25)';
    const glowEdge  = isBottleneck ? 'rgba(239,68,68,0)'   : 'rgba(16,185,129,0)';
    const glow = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, 50);
    glow.addColorStop(0, glowColor);
    glow.addColorStop(1, glowEdge);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(ex.x, ex.y, 50, 0, Math.PI * 2); ctx.fill();

    // Exit rectangle
    const ew = EXIT_W * 2, eh = EXIT_H * 2;
    ctx.save();
    ctx.translate(ex.x, ex.y);
    ctx.fillStyle   = isBottleneck ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)';
    ctx.strokeStyle = isBottleneck ? '#ef4444' : '#10b981';
    ctx.lineWidth   = 2;
    ctx.shadowColor = isBottleneck ? '#ef4444' : '#10b981';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.roundRect(-ew / 2, -eh / 2, ew, eh, 4);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = isBottleneck ? '#ef4444' : '#10b981';
    ctx.font      = 'bold 9px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`EXIT ${i + 1}`, 0, 0);

    // Bottleneck label
    if (isBottleneck) {
      ctx.fillStyle = '#ef4444';
      ctx.font      = 'bold 8px Inter';
      ctx.fillText('BOTTLENECK', 0, eh / 2 + 10);
    }
    ctx.restore();
  }

  // ── Agents ──
  for (const a of SIM.agents) {
    ctx.save();
    ctx.translate(a.x, a.y);

    if (a.state === 'injured') {
      // Red circle with X
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = 'rgba(239,68,68,0.25)';
      ctx.beginPath(); ctx.arc(0, 0, R + 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      // X mark
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth   = 1.2;
      ctx.beginPath(); ctx.moveTo(-2.5, -2.5); ctx.lineTo(2.5, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2.5, -2.5);  ctx.lineTo(-2.5, 2.5); ctx.stroke();

    } else if (a.state === 'panic') {
      // Orange glow
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur  = 8;
      ctx.fillStyle   = '#f97316';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(249,115,22,0.3)';
      ctx.beginPath(); ctx.arc(0, 0, R + 3, 0, Math.PI * 2); ctx.fill();

    } else {
      // Normal — blue glow
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur  = 5;
      ctx.fillStyle   = '#60a5fa';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(96,165,250,0.2)';
      ctx.beginPath(); ctx.arc(0, 0, R + 2, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  // ── Empty state hint ──
  if (SIM.agents.length === 0 && !SIM.running) {
    ctx.fillStyle    = 'rgba(148,163,184,0.3)';
    ctx.font         = '13px Inter';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    if (SIM.exits.length === 0) {
      ctx.fillText('1. Click "Add Exit" and place exits on the canvas', W / 2, H / 2 - 18);
      ctx.fillText('2. Adjust crowd size and panic level', W / 2, H / 2 + 4);
      ctx.fillText('3. Click "Run Simulation"', W / 2, H / 2 + 26);
    } else {
      ctx.fillText(`${SIM.exits.length} exit(s) placed — click "Run Simulation"`, W / 2, H / 2);
    }
  }
}
