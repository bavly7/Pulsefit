// workout.js — PulseFit AI Workout Trainer
// Hybrid: hammer_curl → MediaPipe (client), all others → YOLO (server)
// APIs: /api/workout/start  /api/workout/frame  /api/workout/stop  /api/history/save

// ══════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════
const FRAME_MS   = 120;
let REPS_PER_SET = 12;

const OK_WORDS   = ['good','great','perfect','squeeze','complete','well done','done'];
const WARN_WORDS = ['tuck','keep','relax','lock','lift','pin','step',"don't",'dont','all the way','full','cheat','back'];
const ERR_WORDS  = ["can't see","can't",'error','fail','unable','denied'];
const ICONS      = { ok:'✅', warn:'⚠️', err:'❌', info:'🤖' };

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
let selectedExercise = 'tricep_pushdown';
let activeFilter     = 'all';
let isRunning        = false;
let repCount         = 0;
let setCount         = 0;
let lastReps         = 0;
let lastFeedback     = '';
let elapsedSeconds   = 0;
let timerHandle      = null;
let frameHandle      = null;
let cameraStream     = null;
let sessionGen       = 0;
let isProcessingFrame = false;
let planData         = null;
let currentDayIdx    = 0;
let sessionLog       = {};
let completedDays    = JSON.parse(localStorage.getItem('pf_completed_days') || '{}');

// ====== متغيرات Hammer Curl ======
let hammerStage = "down";
let minAngleThisRep = 180.0;
let maxAngleThisRep = 0.0;

// ====== متغيرات الذكاء الصوتي ومنع التكرار ======
let lastRepTime = 0;          // لمنع تكرار العدة الوهمي في نفس الثانية
let lastSpeakTime = {};       // لمنع تكرار نفس الرسالة الصوتية ورا بعض (Cooldown)
let elbowErrorStart = 0;      // مهلة قبل ما يزعق لو الكوع اتحرك (Grace Period)
// Rest timer
let restTimerHandle = null;
let restTimeLeft    = 0;

// ══════════════════════════════════════════════════════════════
// DOM REFERENCES  (assigned after DOMContentLoaded)
// ══════════════════════════════════════════════════════════════
let videoEl, camOverlay, cameraCard, liveBadge, repOverlay, repBig;
let statReps, statSets, boxReps, boxSets, timerDisp;
let fbBubble, fbIcon, fbText, fbHistory;
let statusPill, statusLbl, btnStart, btnStop, setFlash;

// ══════════════════════════════════════════════════════════════
// EXERCISE LIST
// ══════════════════════════════════════════════════════════════
const EXERCISES = [
  { key:"seated_db_shoulder_press",   name:"Seated DB Press",         icon:"🏋️", tag:"Machine",  muscle:"shoulders" },
  { key:"machine_shoulder_press",     name:"Machine Shoulder",        icon:"🏋️", tag:"Machine",  muscle:"shoulders" },
  { key:"overhead_press_barbell",     name:"OHP Barbell",             icon:"🏋️", tag:"Barbell",  muscle:"shoulders" },
  { key:"arnold_press",               name:"Arnold Press",            icon:"💪", tag:"Dumbbell", muscle:"shoulders" },
  { key:"machine_lateral_raise",      name:"Machine Lateral",         icon:"🦾", tag:"Machine",  muscle:"shoulders" },
  { key:"cable_lateral_raise",        name:"Cable Lateral",           icon:"🦾", tag:"Cable",    muscle:"shoulders" },
  { key:"db_lateral_raise",           name:"DB Lateral Raise",        icon:"🦾", tag:"Dumbbell", muscle:"shoulders" },
  { key:"landmine_lateral_raise",     name:"Landmine Lateral",        icon:"🏋️", tag:"Barbell",  muscle:"shoulders" },
  { key:"face_pull",                  name:"Face Pull",               icon:"🎯", tag:"Cable",    muscle:"shoulders" },
  { key:"rear_delt_cable_fly",        name:"Rear Delt Fly",           icon:"🪁", tag:"Cable",    muscle:"shoulders" },
  { key:"reverse_pec_deck",           name:"Reverse Pec Deck",        icon:"🦾", tag:"Machine",  muscle:"shoulders" },
  { key:"incline_dumbbell_press",     name:"Incline DB Press",        icon:"🏋️", tag:"Dumbbell", muscle:"chest" },
  { key:"incline_barbell_press",      name:"Incline BB Press",        icon:"🏋️", tag:"Barbell",  muscle:"chest" },
  { key:"cable_fly_low_to_high",      name:"Cable Fly L→H",           icon:"🪁", tag:"Cable",    muscle:"chest" },
  { key:"flat_dumbbell_press",        name:"Flat DB Press",           icon:"🏋️", tag:"Dumbbell", muscle:"chest" },
  { key:"flat_barbell_bench_press",   name:"Flat BB Press",           icon:"🏋️", tag:"Barbell",  muscle:"chest" },
  { key:"cable_fly_high_to_low",      name:"Cable Fly H→L",           icon:"🪁", tag:"Cable",    muscle:"chest" },
  { key:"machine_chest_press",        name:"Machine Chest",           icon:"🏋️", tag:"Machine",  muscle:"chest" },
  { key:"dumbbell_floor_press",       name:"DB Floor Press",          icon:"🏋️", tag:"Dumbbell", muscle:"chest" },
  { key:"chest_dips",                 name:"Chest Dips",              icon:"🤸", tag:"BW",       muscle:"chest" },
  { key:"lat_pulldown_wide",          name:"Lat Pulldown Wide",       icon:"🦾", tag:"Cable",    muscle:"back" },
  { key:"pull_up",                    name:"Pull-Up",                 icon:"🤸", tag:"BW",       muscle:"back" },
  { key:"lat_pulldown_underhand",     name:"Lat Pulldown Under",      icon:"🦾", tag:"Cable",    muscle:"back" },
  { key:"straight_arm_pulldown",      name:"Straight Arm PD",         icon:"🎯", tag:"Cable",    muscle:"back" },
  { key:"machine_assisted_pull_up",   name:"Assisted Pull-Up",        icon:"🏋️", tag:"Machine",  muscle:"back" },
  { key:"seated_cable_row",           name:"Seated Cable Row",        icon:"🎯", tag:"Cable",    muscle:"back" },
  { key:"single_arm_dumbbell_row",    name:"DB Row",                  icon:"🏋️", tag:"Dumbbell", muscle:"back" },
  { key:"chest_supported_row",        name:"Chest Sup Row",           icon:"🏋️", tag:"Machine",  muscle:"back" },
  { key:"barbell_row_pendlay",        name:"Pendlay Row",             icon:"🏋️", tag:"Barbell",  muscle:"back" },
  { key:"meadows_row",                name:"Meadows Row",             icon:"🏋️", tag:"Barbell",  muscle:"back" },
  { key:"conventional_deadlift",      name:"Conventional DL",         icon:"💀", tag:"Barbell",  muscle:"back" },
  { key:"preacher_curl",              name:"Preacher Curl",           icon:"💪", tag:"Machine",  muscle:"biceps" },
  { key:"hammer_curl",                name:"Hammer Curl",             icon:"🔨", tag:"Dumbbell", muscle:"biceps" },
  { key:"cable_curl_high",            name:"High Cable Curl",         icon:"🎯", tag:"Cable",    muscle:"biceps" },
  { key:"incline_db_curl",            name:"Incline DB Curl",         icon:"💪", tag:"Dumbbell", muscle:"biceps" },
  { key:"barbell_curl",               name:"Barbell Curl",            icon:"💪", tag:"Barbell",  muscle:"biceps" },
  { key:"spider_curl",                name:"Spider Curl",             icon:"🕷️", tag:"Dumbbell", muscle:"biceps" },
  { key:"chin_up",                    name:"Chin-Up",                 icon:"🤸", tag:"BW",       muscle:"biceps" },
  { key:"inverted_row",               name:"Inverted Row",            icon:"🤸", tag:"BW",       muscle:"biceps" },
  { key:"tricep_pushdown",            name:"Tricep Pushdown",         icon:"💪", tag:"Cable",    muscle:"triceps" },
  { key:"overhead_tricep_cable",      name:"OH Tricep Cable",         icon:"🎯", tag:"Cable",    muscle:"triceps" },
  { key:"tricep_pushdown_rope",       name:"Rope Pushdown",           icon:"🎯", tag:"Cable",    muscle:"triceps" },
  { key:"overhead_tricep_db",         name:"OH Tricep DB",            icon:"🏋️", tag:"Dumbbell", muscle:"triceps" },
  { key:"diamond_pushup",             name:"Diamond Push-Up",         icon:"🤸", tag:"BW",       muscle:"triceps" },
  { key:"skull_crusher",              name:"Skull Crusher",           icon:"💀", tag:"Barbell",  muscle:"triceps" },
  { key:"close_grip_bench",           name:"Close Grip Bench",        icon:"🏋️", tag:"Barbell",  muscle:"triceps" },
  { key:"tricep_dips_upright",        name:"Tricep Dips",             icon:"🤸", tag:"BW",       muscle:"triceps" },
  { key:"plank",                      name:"Plank",                   icon:"🧘", tag:"BW",       muscle:"core" },
  { key:"hanging_leg_raise",          name:"Hanging Leg Raise",       icon:"🤸", tag:"BW",       muscle:"core" },
  { key:"cable_crunch",               name:"Cable Crunch",            icon:"🎯", tag:"Cable",    muscle:"core" },
  { key:"ab_wheel_rollout",           name:"Ab Wheel Rollout",        icon:"🛞", tag:"BW",       muscle:"core" },
  { key:"barbell_back_squat",         name:"Barbell Squat",           icon:"🏋️", tag:"Barbell",  muscle:"legs" },
  { key:"bulgarian_split_squat",      name:"Bulgarian Split Squat",   icon:"🦵", tag:"Dumbbell", muscle:"legs" },
  { key:"goblet_squat",               name:"Goblet Squat",            icon:"🏋️", tag:"Dumbbell", muscle:"legs" },
  { key:"hack_squat",                 name:"Hack Squat",              icon:"🦾", tag:"Machine",  muscle:"legs" },
  { key:"leg_press",                  name:"Leg Press",               icon:"🦾", tag:"Machine",  muscle:"legs" },
  { key:"leg_extension",              name:"Leg Extension",           icon:"🦾", tag:"Machine",  muscle:"legs" },
  { key:"lying_leg_curl",             name:"Lying Leg Curl",          icon:"🦾", tag:"Machine",  muscle:"legs" },
  { key:"romanian_deadlift",          name:"Romanian Deadlift",       icon:"🏋️", tag:"Barbell",  muscle:"legs" },
  { key:"sumo_deadlift",              name:"Sumo Deadlift",           icon:"🏋️", tag:"Barbell",  muscle:"legs" },
  { key:"trap_bar_deadlift",          name:"Trap Bar Deadlift",       icon:"🏋️", tag:"Barbell",  muscle:"legs" },
  { key:"nordic_curl",                name:"Nordic Curl",             icon:"🤸", tag:"BW",       muscle:"legs" },
  { key:"walking_lunge",              name:"Walking Lunge",           icon:"🚶", tag:"Dumbbell", muscle:"legs" },
  { key:"hip_thrust",                 name:"Hip Thrust",              icon:"🏋️", tag:"Barbell",  muscle:"legs" },
  { key:"glute_kickback",             name:"Glute Kickback",          icon:"🎯", tag:"Cable",    muscle:"legs" },
  { key:"cable_pull_through",         name:"Cable Pull Through",      icon:"🎯", tag:"Cable",    muscle:"legs" },
  { key:"abductor_machine",           name:"Abductor Machine",        icon:"🦾", tag:"Machine",  muscle:"legs" },
  { key:"adductor_machine",           name:"Adductor Machine",        icon:"🦾", tag:"Machine",  muscle:"legs" },
  { key:"db_glute_bridge",            name:"DB Glute Bridge",         icon:"🏋️", tag:"Dumbbell", muscle:"legs" },
  { key:"single_leg_glute_bridge",    name:"Single Leg Glute Bridge", icon:"🤸", tag:"BW",       muscle:"legs" },
  { key:"single_leg_rdl",             name:"Single Leg RDL",          icon:"🏋️", tag:"Dumbbell", muscle:"legs" },
  { key:"seated_calf_raise",          name:"Seated Calf Raise",       icon:"🦾", tag:"Machine",  muscle:"legs" },
  { key:"donkey_calf_raise",          name:"Donkey Calf Raise",       icon:"🤸", tag:"BW",       muscle:"legs" },
  { key:"standing_calf_raise",        name:"Standing Calf Raise",     icon:"🦵", tag:"BW",       muscle:"legs" },
];

// ══════════════════════════════════════════════════════════════
// MEDIAPIPE SETUP (Hammer Curl — client-side only)
// ══════════════════════════════════════════════════════════════
let poseInstance = null;

async function initMediaPipe() {
  if (poseInstance) return;
  console.log('[POSE] Initializing...');
  poseInstance = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`
  });
  poseInstance.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  poseInstance.onResults(onPoseResults);
  await poseInstance.initialize(); // دي أهم خطوة عشان نضمن إنه جاهز
  console.log('[POSE] Initialized successfully');
}

function calcAngle(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

function onPoseResults(results) {
    if (!isRunning || selectedExercise !== 'hammer_curl') return;
    if (!results.poseLandmarks) return;

    const lm = results.poseLandmarks;
    
    let s, e, w, h;
    if (lm[12].visibility > 0.4 && lm[14].visibility > 0.4) {
        [s, e, w, h] = [12, 14, 16, 24]; // يمين
    } else if (lm[11].visibility > 0.4 && lm[13].visibility > 0.4) {
        [s, e, w, h] = [11, 13, 15, 23]; // شمال
    } else {
        setFeedback('SHOW SIDE VIEW & ARM', 'err');
        return;
    }

    const angle    = calcAngle(lm[s], lm[e], lm[w]);
    const upperArm = calcAngle(lm[h], lm[s], lm[e]);
    const now = Date.now();
    const lang = document.getElementById('language-select').value;

    if (hammerStage === 'down') minAngleThisRep = Math.min(minAngleThisRep, angle);
    else                        maxAngleThisRep = Math.max(maxAngleThisRep, angle);

    // 🔴 1. حماية الكوع (Grace Period 800ms)
    if (upperArm > 30) {
        if (elbowErrorStart === 0) elbowErrorStart = now;
        if (now - elbowErrorStart > 800) { 
            setFeedback('KEEP ELBOW PINNED!', 'err');
            speakCoach(lang === 'ar' ? 'ثبت كوعك' : 'Keep elbow pinned', 'err');
        }
        return; // وقف حساب العدة طول ما الأداء غلط
    } else {
        elbowErrorStart = 0; // صفر العداد لو الأداء اتصلح
    }

    // 🟢 2. حساب العدات (مستحيل يحسب عدتين في أقل من ثانية)
    if (angle < 75) {
        if (hammerStage !== 'up') {
            if (now - lastRepTime > 1000) { // 1000ms = ثانية كاملة راحة
                hammerStage = 'up';
                setReps(repCount + 1);
                setFeedback('GOOD SQUEEZE!', 'ok');
                speakCoach(lang === 'ar' ? 'عاش يا وحش' : 'Good squeeze', 'ok');
                minAngleThisRep = 180.0;
                maxAngleThisRep = 0.0;
                lastRepTime = now;
            }
        }
    } else if (angle > 145) {
        if (hammerStage !== 'down') {
            hammerStage = 'down';
            setFeedback('GOOD STRETCH!', 'ok');
            speakCoach(lang === 'ar' ? 'أداء ممتاز' : 'Good stretch', 'ok');
            minAngleThisRep = 180.0;
            maxAngleThisRep = 0.0;
        }
    } else if (hammerStage === 'down') {
        if (angle - minAngleThisRep > 15) {
            setFeedback('CURL UP HIGH!', 'warn');
            speakCoach(lang === 'ar' ? 'ارفع لفوق' : 'Curl up high', 'warn');
        } else {
            setFeedback('CURLING...', 'info');
        }
    } else {
        if (maxAngleThisRep - angle > 15) {
            setFeedback('LOWER FOR FULL STRETCH!', 'warn');
            speakCoach(lang === 'ar' ? 'انزل للاخر' : 'Lower all the way', 'warn');
        } else {
            setFeedback('LOWERING...', 'info');
        }
    }
}
// ══════════════════════════════════════════════════════════════
// EXERCISE GRID
// ══════════════════════════════════════════════════════════════
function buildGrid(filter = 'all') {
  const grid = document.getElementById('exercise-grid');
  const list = filter === 'all' ? EXERCISES : EXERCISES.filter(e => e.muscle === filter);
  grid.innerHTML = list.map(e => `
    <button class="ex-btn${e.key === selectedExercise ? ' selected' : ''}" id="exbtn-${e.key}" onclick="selectExercise('${e.key}',this)">
      <div class="ex-icon">${e.icon}</div>
      <div class="ex-name">${e.name}</div>
      <div class="ex-tag">${e.tag}</div>
    </button>`).join('');
}

function filterMuscle(muscle, el) {
  activeFilter = muscle;
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  buildGrid(muscle);
}

function selectExercise(key, el) {
  if (isRunning) return;
  document.querySelectorAll('.ex-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedExercise = key;
  showLogPanelForExercise(key);
}

// ══════════════════════════════════════════════════════════════
// PLAN LOADING
// ══════════════════════════════════════════════════════════════
async function loadPlan() {
  try {
    const res  = await fetch('/api/get-plan');
    const data = await res.json();
    planData   = data.plan || null;
  } catch (e) {}

  if (!planData || !planData.ai_days || !planData.ai_days.length) {
    loadTodayPlanFallback(); return;
  }

  const splitBar = document.getElementById('split-bar');
  splitBar.style.display = 'flex';
  document.getElementById('split-name').textContent = planData.split || planData.title || 'Your Plan';

  const badges = document.getElementById('split-badges');
  [planData.level, planData.goal, (planData.days_per_week||'') + ' days'].filter(Boolean).forEach(b => {
    const el = document.createElement('span');
    el.className   = 'split-badge';
    el.textContent = b.charAt(0).toUpperCase() + b.slice(1).replace(/_/g,' ');
    badges.appendChild(el);
  });

  const tabsEl = document.getElementById('day-tabs');
  tabsEl.style.display = 'flex';
  planData.ai_days.forEach((day, i) => {
    const btn = document.createElement('button');
    btn.className   = 'day-tab' + (i===currentDayIdx?' active':'') + (completedDays[i]?' done':'');
    btn.textContent = `Day ${i+1}`;
    btn.title       = day.focus || day.day || '';
    btn.onclick     = () => switchDay(i);
    tabsEl.appendChild(btn);
  });

  showDayBanner(currentDayIdx);
}

function switchDay(idx) {
  currentDayIdx = idx;
  document.querySelectorAll('.day-tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  showDayBanner(idx);
}

function showDayBanner(idx) {
  if (!planData || !planData.ai_days) return;
  const day = planData.ai_days[idx];
  if (!day) return;
  document.getElementById('today-banner').style.display = 'flex';
  document.getElementById('today-focus').textContent    = day.focus || day.day || `Day ${idx+1}`;
  const exlist = document.getElementById('today-exlist');
  exlist.innerHTML = (day.exercises||[]).slice(0,8).map(ex => {
    const hasCam = ex.has_cam;
    return `<span class="today-tag${hasCam?' cam-badge':''}"
      onclick="${hasCam ? `quickSelect('${ex.cam_key}')` : 'void(0)'}"
      title="${ex.sets||3}×${ex.reps||'8-12'} · ${ex.rest||'—'}">${ex.name}</span>`;
  }).join('');
}

async function loadTodayPlanFallback() {
  try {
    const day = new Date().getDay();
    const res = await fetch(`/api/get-today-exercises?day=${day}`);
    const data = await res.json();
    if (!data.exercises || !data.exercises.length) return;
    document.getElementById('today-banner').style.display = 'flex';
    document.getElementById('today-focus').textContent    = data.focus || '';
    document.getElementById('today-exlist').innerHTML     = data.exercises.slice(0,6).map(ex =>
      `<span class="today-tag${ex.has_cam?' cam-badge':''}"
        onclick="${ex.has_cam ? `quickSelect('${ex.cam_key}')` : 'void(0)'}">${ex.name}</span>`
    ).join('');
  } catch (e) {}
}

function quickSelect(key) {
  if (isRunning) return;
  selectedExercise = key;
  const ex = EXERCISES.find(e => e.key===key);
  if (!ex) return;
  const tab = document.querySelector(`.mtab[onclick*="${ex.muscle}"]`) || document.querySelectorAll('.mtab')[0];
  filterMuscle(ex.muscle, tab);
  setTimeout(() => {
    const btn = document.getElementById(`exbtn-${key}`);
    if (btn) { document.querySelectorAll('.ex-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); }
    showLogPanelForExercise(key);
  }, 50);
}

// ══════════════════════════════════════════════════════════════
// LOG SETS PANEL
// ══════════════════════════════════════════════════════════════
function showLogPanelForExercise(key) {
  const panel = document.getElementById('log-panel');
  const exObj = EXERCISES.find(e => e.key===key) || { name:key, key };

  let sets=3, reps='8-12', rest='60s', loadGuidance='';

  if (planData && planData.ai_days && planData.ai_days[currentDayIdx]) {
    const day = planData.ai_days[currentDayIdx];
    const ex  = (day.exercises||[]).find(e => e.cam_key===key || dbNameToKey(e.name)===key);
    if (ex) { sets=ex.sets||3; reps=ex.reps||'8-12'; rest=ex.rest||'60s'; loadGuidance=ex.load_guidance||''; }
  }

  const targetReps = parseInt(String(reps).split('-').pop()) || 12;
  REPS_PER_SET = targetReps;

  document.getElementById('log-ex-name').textContent = exObj.name;
  document.getElementById('log-prescribed').innerHTML =
    `Target: <strong>${sets}×${reps}</strong> · Rest: <strong>${rest}</strong>` +
    (loadGuidance ? `<br><small style="color:var(--muted);font-size:.72rem">💡 ${loadGuidance}</small>` : '');

  const rows = document.getElementById('sets-rows');
  rows.innerHTML = '';
  for (let s=0; s<sets; s++) {
    const row = document.createElement('div');
    row.className = 'set-row'; row.id = `srow-${s}`;
    row.innerHTML = `
      <div class="set-num">${s+1}</div>
      <input type="number" class="set-input" id="inp-reps-${s}"   placeholder="${String(reps).split('-')[0]||8}" min="0" max="100">
      <input type="number" class="set-input" id="inp-weight-${s}" placeholder="kg" min="0" max="999" step="0.5">
      <button class="set-done-btn" id="sdone-${s}" onclick="toggleSetDone(${s})">✓</button>`;
    rows.appendChild(row);
  }

  const rpeInput = document.getElementById('inp-rpe');
  if (rpeInput) rpeInput.value = '';

  const skipContainer = document.getElementById('skip-reason-container');
  const skipInput     = document.getElementById('inp-skip-reason');
  if (skipContainer) skipContainer.style.display = 'none';
  if (skipInput)     skipInput.value = '';

  const saveBtn = document.getElementById('btn-save-ex');
  saveBtn.classList.remove('saved');
  saveBtn.textContent = '💾 Save Exercise';
  panel.style.display = 'block';
}

function dbNameToKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}

function toggleSetDone(s) {
  const btn = document.getElementById(`sdone-${s}`);
  btn.classList.toggle('done');
  if (btn.classList.contains('done')) startRestTimer(60);

  const rows = document.getElementById('sets-rows').children;
  let allDone = true;
  for (let i=0; i<rows.length; i++) {
    if (!document.getElementById(`sdone-${i}`).classList.contains('done')) { allDone=false; break; }
  }
  const container = document.getElementById('skip-reason-container');
  if (container && allDone) container.style.display = 'none';
}

function addSetRow() {
  const rows = document.getElementById('sets-rows');
  const s    = rows.children.length;
  const firstRepInput = document.getElementById('inp-reps-0');
  const defaultReps   = firstRepInput?.placeholder || REPS_PER_SET || 12;

  const row = document.createElement('div');
  row.className = 'set-row'; row.id = `srow-${s}`;
  row.innerHTML = `
    <div class="set-num">${s+1}</div>
    <input type="number" class="set-input" id="inp-reps-${s}"   placeholder="${defaultReps}" min="0" max="100">
    <input type="number" class="set-input" id="inp-weight-${s}" placeholder="kg" min="0" max="999" step="0.5">
    <button class="set-done-btn" id="sdone-${s}" onclick="toggleSetDone(${s})">✓</button>`;
  rows.appendChild(row);

  const container = document.getElementById('skip-reason-container');
  if (container) container.style.display = 'flex';
}

function removeSetRow() {
  const rows = document.getElementById('sets-rows');
  if (rows.children.length > 1) {
    rows.removeChild(rows.lastElementChild);
    let allDone = true;
    for (let i=0; i<rows.children.length; i++) {
      if (!document.getElementById(`sdone-${i}`).classList.contains('done')) { allDone=false; break; }
    }
    const container = document.getElementById('skip-reason-container');
    if (container && allDone) container.style.display = 'none';
  } else {
    showToast('You must have at least 1 set!', 'error');
  }
}

function saveExerciseLog() {
  const exName   = document.getElementById('log-ex-name').textContent;
  const rpeInput = document.getElementById('inp-rpe');
  const sessionRpe = parseInt(rpeInput?.value) || null;

  if (!sessionRpe) {
    showToast('Please enter a Session RPE (1-10) before saving!', 'warning');
    if (rpeInput) rpeInput.focus();
    return;
  }

  const rows = document.getElementById('sets-rows').children;

  // Auto-check sets with both reps + weight filled
  for (let i=0; i<rows.length; i++) {
    const repsVal   = document.getElementById(`inp-reps-${i}`)?.value;
    const weightVal = document.getElementById(`inp-weight-${i}`)?.value;
    const doneBtn   = document.getElementById(`sdone-${i}`);
    if (repsVal && weightVal && doneBtn && !doneBtn.classList.contains('done')) doneBtn.classList.add('done');
  }

  let allDone = true;
  for (let i=0; i<rows.length; i++) {
    if (!document.getElementById(`sdone-${i}`).classList.contains('done')) { allDone=false; break; }
  }

  const skipReasonElem = document.getElementById('inp-skip-reason');
  const skipReasonVal  = skipReasonElem ? skipReasonElem.value : '';

  if (!allDone && !skipReasonVal) {
    showToast('You left some sets unchecked! Please select a Skip Reason from the red menu.', 'warning');
    const container = document.getElementById('skip-reason-container');
    if (container) container.style.display = 'flex';
    return;
  }

  const sets = [];
  for (let s=0; s<rows.length; s++) {
    const reps      = document.getElementById(`inp-reps-${s}`)?.value;
    const weight    = document.getElementById(`inp-weight-${s}`)?.value;
    const doneBtn   = document.getElementById(`sdone-${s}`);
    const done      = doneBtn ? doneBtn.classList.contains('done') : false;
    const skip_reason = !done ? skipReasonVal : null;
    if (reps || done || skip_reason) {
      sets.push({ set:s+1, reps:parseInt(reps)||0, weight:parseFloat(weight)||0, completed:done?1:0, skip_reason });
    }
  }

  if (!sets.length) { showToast('Log at least one set!', 'error'); return; }

  sessionLog[exName] = { name:exName, sets, rpe:sessionRpe, skip_reason:skipReasonVal||null, saved:true };

  const btn = document.getElementById('btn-save-ex');
  if (btn) { btn.classList.add('saved'); btn.textContent = '✅ Saved!'; }

  updateSessionSummary();
}

function selectSkipReason(reason) {
  const exName = document.getElementById('skip-modal').dataset.exName;
  if (sessionLog[exName]) { sessionLog[exName].skip_reason = reason; sessionLog[exName].saved = true; }
  document.getElementById('skip-modal').hidden = true;
  const btn = document.getElementById('btn-save-ex');
  btn.classList.add('saved'); btn.textContent = '✅ Saved!';
  updateSessionSummary();
}

function updateSessionSummary() {
  const saved = Object.values(sessionLog).filter(e => e.saved);
  if (!saved.length) return;
  let totalSets=0, totalReps=0;
  saved.forEach(ex => { totalSets += ex.sets.length; ex.sets.forEach(s => totalReps += s.reps); });
  document.getElementById('sum-ex').textContent   = saved.length;
  document.getElementById('sum-sets').textContent = totalSets;
  document.getElementById('sum-reps').textContent = totalReps;
  document.getElementById('session-summary').style.display = 'block';
}

async function finishSession() {
  const btn = document.querySelector('.btn-finish');
  btn.disabled = true; btn.textContent = 'Saving...';

  const saved = Object.values(sessionLog).filter(e => e.saved);
  for (const ex of saved) {
    const totalReps = ex.sets.reduce((a,s) => a+s.reps, 0);
    await fetch('/api/history/save', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        exercise:    ex.name,
        reps:        totalReps,
        sets:        ex.sets.length,
        duration:    '—',
        weight_kg:   ex.sets[ex.sets.length-1]?.weight || null,
        rpe:         ex.rpe   || null,
        completed:   ex.sets.every(s => s.completed) ? 1 : 0,
        skip_reason: ex.skip_reason || null
      })
    }).catch(()=>{});
  }

  completedDays[currentDayIdx] = true;
  localStorage.setItem('pf_completed_days', JSON.stringify(completedDays));
  document.querySelectorAll('.day-tab').forEach((t,i) => { if (completedDays[i]) t.classList.add('done'); });
  btn.textContent = '✅ Session Saved!';
  setTimeout(() => { btn.disabled=false; btn.textContent='✅ Finish & Save Session'; }, 3000);
}

// ══════════════════════════════════════════════════════════════
// TIMER
// ══════════════════════════════════════════════════════════════
function startTimer() {
  elapsedSeconds = 0;
  timerDisp.classList.add('running');
  timerHandle = setInterval(() => {
    elapsedSeconds++;
    timerDisp.textContent = `${pad2(Math.floor(elapsedSeconds/60))}:${pad2(elapsedSeconds%60)}`;
  }, 1000);
}
function stopTimer() { clearInterval(timerHandle); timerHandle=null; timerDisp.classList.remove('running'); }
function pad2(n)       { return String(n).padStart(2,'0'); }
function formatTime(s) { return `${Math.floor(s/60)}:${pad2(s%60)}`; }

// ══════════════════════════════════════════════════════════════
// REST TIMER
// ══════════════════════════════════════════════════════════════
function startRestTimer(seconds=60) {
  const overlay = document.getElementById('rest-timer-overlay');
  if (overlay) overlay.style.display = 'flex';
  restTimeLeft = seconds;
  updateRestTimerDisplay();
  if (restTimerHandle) clearInterval(restTimerHandle);
  restTimerHandle = setInterval(() => {
    restTimeLeft--;
    updateRestTimerDisplay();
    if (restTimeLeft <= 0) { skipRestTimer(); showToast('Rest is over! Time for your next set.', 'info'); }
  }, 1000);
}
function updateRestTimerDisplay() {
  const min  = String(Math.floor(restTimeLeft/60)).padStart(2,'0');
  const sec  = String(restTimeLeft%60).padStart(2,'0');
  const disp = document.getElementById('rest-timer-value');
  if (disp) disp.textContent = `${min}:${sec}`;
}
function addRestTime(sec)  { restTimeLeft += sec; updateRestTimerDisplay(); }
function skipRestTimer() {
  if (restTimerHandle) clearInterval(restTimerHandle);
  const overlay = document.getElementById('rest-timer-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════════
function setStatus(state) {
  statusPill.className   = `status-pill ${state}`;
  statusLbl.textContent  = { idle:'Idle', running:'Live', done:'Done' }[state] || state;
}

function classifyFeedback(text) {
  const t = text.toLowerCase();
  if (ERR_WORDS.some(w  => t.includes(w))) return 'err';
  if (OK_WORDS.some(w   => t.includes(w))) return 'ok';
  if (WARN_WORDS.some(w => t.includes(w))) return 'warn';
  return 'warn';
}

function setFeedback(text, type='warn') {
  if (text === lastFeedback) return;
  lastFeedback       = text;
  fbText.textContent = text;
  fbIcon.textContent = ICONS[type] || '🤖';
  fbBubble.className = `feedback-bubble ${type}`;
  const li = document.createElement('li');
  li.textContent = text;
  fbHistory.prepend(li);
  if (fbHistory.children.length > 30) fbHistory.lastElementChild.remove();
}

function popEl(el) {
  el.classList.remove('pop'); void el.offsetWidth;
  el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 200);
}

function setReps(reps) {
  if (reps === repCount) return;
  repCount = reps; popEl(repBig); popEl(statReps);
  repBig.textContent   = reps;
  statReps.textContent = reps;

  if (reps > 0 && reps % REPS_PER_SET === 0 && reps !== lastReps) {
    setCount++; statSets.textContent = setCount; popEl(statSets);
    setFlash.classList.remove('show'); void setFlash.offsetWidth; setFlash.classList.add('show');
    boxSets.classList.add('highlight'); setTimeout(() => boxSets.classList.remove('highlight'), 1500);
    setFeedback(`Set ${setCount} complete — rest up! 🎉`, 'ok');

    // Auto-fill log row
    const inp   = document.getElementById(`inp-reps-${setCount-1}`);
    const sdone = document.getElementById(`sdone-${setCount-1}`);
    if (inp && !inp.value) inp.value = REPS_PER_SET;
    if (sdone) sdone.classList.add('done');

    startRestTimer(60);
  }

  lastReps = reps;
  boxReps.classList.add('highlight'); setTimeout(() => boxReps.classList.remove('highlight'), 600);
}


function speakCoach(text, type = 'warn') {
    if (!('speechSynthesis' in window)) return;

    const now = Date.now();
    // إعدادات الـ Cooldown بالملي ثانية (زي اللي في البايثون)
    const cooldowns = {
        err: 3000,   // الأخطاء نقدر نكررها كل 3 ثواني
        ok: 4000,    // التشجيع كل 4 ثواني
        warn: 5000,  // التنبيهات كل 5 ثواني
        info: 6000
    };
    const cooldown = cooldowns[type] || 4000;

    // لو لسه قايلين نفس الجملة من وقت أقل من الـ Cooldown، اعملها سكيب
    if (lastSpeakTime[text] && (now - lastSpeakTime[text] < cooldown)) {
        return;
    }

    lastSpeakTime[text] = now;

    // اقطع الكلام القديم (عشان تزعقله) *فقط* لو الرسالة إيرور (err)
    if (type === 'err') {
        window.speechSynthesis.cancel();
    }

    const msg = new SpeechSynthesisUtterance(text);
    const lang = document.getElementById('language-select').value;
    msg.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    
    // ممكن تعدل سرعة الكلام لو حاسس إنه بطيء (1.0 هو الطبيعي)
    msg.rate = 1.0; 
    
    window.speechSynthesis.speak(msg);
}


// function speakCoach(text, type = 'warn') {
//     const now = Date.now();
//     const cooldowns = { err: 3000, ok: 4000, warn: 5000, info: 6000 };
//     const cooldown = cooldowns[type] || 4000;
//     if (lastSpeakTime[text] && (now - lastSpeakTime[text] < cooldown)) return;
//     lastSpeakTime[text] = now;

//     // لو شغال جوا APK
//     if (window.Capacitor?.Plugins?.TextToSpeech) {
//         window.Capacitor.Plugins.TextToSpeech.speak({
//             text: text,
//             lang: document.getElementById('language-select').value === 'ar' ? 'ar-SA' : 'en-US',
//             rate: 1.0,
//             pitch: 1.0,
//             volume: 1.0
//         }).catch(e => console.warn('TTS:', e));
//         return;
//     }

//     // لو شغال في browser عادي
//     if (!('speechSynthesis' in window)) return;
//     if (type === 'err') window.speechSynthesis.cancel();
//     const msg = new SpeechSynthesisUtterance(text);
//     msg.lang = document.getElementById('language-select').value === 'ar' ? 'ar-SA' : 'en-US';
//     msg.rate = 1.0;
//     window.speechSynthesis.speak(msg);
// }


function showToast(message, type='info') {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = { error:'❌ ', success:'✅ ', warning:'⚠️ ' }[type] || '';
  const clean = message.replace(/^[⚠️❌✅ℹ️🤖]\s*/,'');
  toast.innerHTML = `<span>${icon}</span><span>${clean}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ══════════════════════════════════════════════════════════════
// CAMERA
// ══════════════════════════════════════════════════════════════
async function openCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width:{ideal:640}, height:{ideal:480}, facingMode:'user' }, audio:false
    });
    videoEl.srcObject = cameraStream;
    await videoEl.play();
    camOverlay.classList.add('hidden');
    cameraCard.classList.add('live');
    return true;
  } catch (err) {
    setFeedback(err.name==='NotAllowedError'
      ? 'Camera access denied — please allow camera permissions.'
      : "Could not access camera. Make sure it's connected.", 'err');
    return false;
  }
}

function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream=null; }
  videoEl.srcObject = null;
  cameraCard.classList.remove('live');
}

// ══════════════════════════════════════════════════════════════
// FRAME CAPTURE & SEND  —  Hybrid Router
// ══════════════════════════════════════════════════════════════
function captureAndSend() {
  if (!isRunning || isProcessingFrame) return;

  // ── Hammer Curl → MediaPipe (client-side, no server call) ──
  if (selectedExercise === 'hammer_curl') {
    if (poseInstance) poseInstance.send({ image: videoEl }).catch(e => console.warn('[MediaPipe]', e));
    return;
  }

  // ── All other exercises → YOLO (server-side) ──
  const gen   = sessionGen;
  isProcessingFrame = true;

  const canvas = document.createElement('canvas');
  canvas.width  = 640; canvas.height = 480;
  const ctx = canvas.getContext('2d');
  ctx.translate(640, 0); ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, 640, 480);

  canvas.toBlob(async (blob) => {
    if (!blob || !isRunning || gen !== sessionGen) { isProcessingFrame=false; return; }
    const form = new FormData();
    form.append('frame', blob, 'frame.jpg');
    try {
      const res  = await fetch('/api/workout/frame', { method:'POST', body:form });
      if (!isRunning || gen !== sessionGen) { isProcessingFrame=false; return; }
      if (res.ok) {
        const data = await res.json();
        if (isRunning && gen === sessionGen) {
          setReps(data.reps ?? repCount);
          const fb = (data.feedback || '').trim();
          if (fb) setFeedback(fb, classifyFeedback(fb));
        }
      }
    } catch { console.warn('[YOLO] frame drop'); }
    finally {
      isProcessingFrame = false;
      if (isRunning && gen === sessionGen) requestAnimationFrame(captureAndSend);
    }
  }, 'image/jpeg', 0.75);
}

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════
async function startWorkout() {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
    }
  lastRepTime = 0;
lastSpeakTime = {};
elbowErrorStart = 0;


  const lang = document.getElementById('language-select').value;
  let res, data;
  try {
    res  = await fetch('/api/workout/start', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ exercise:selectedExercise, language:lang })
    });
    data = await res.json();
  } catch { setFeedback('Could not reach the server.', 'err'); closeCamera(); return; }

  if (!res.ok) { setFeedback(data.error || 'Failed to start.', 'err'); closeCamera(); return; }

  // If Hammer Curl, init MediaPipe now (lazy load)
  if (selectedExercise === 'hammer_curl') {
      await initMediaPipe(); 
  }

  const camOk = await openCamera(); 
  if (!camOk) return;

  sessionGen++;
  isRunning = true; isProcessingFrame = false;
  repCount = setCount = lastReps = 0; lastFeedback = '';
  hammerStage='down'; minAngleThisRep=180.0; maxAngleThisRep=0.0;

  repBig.textContent = statReps.textContent = statSets.textContent = '0';
  fbHistory.innerHTML = '';

  liveBadge.classList.add('visible');
  repOverlay.classList.add('visible');
  btnStart.disabled = true; btnStop.disabled = false;
  document.querySelectorAll('.ex-btn').forEach(b => b.disabled = true);

  setStatus('running');
  startTimer();
  setFeedback('Get into position — session started!', 'info');

  // Single interval drives the loop; rAF inside captureAndSend handles YOLO pacing
  frameHandle = setInterval(captureAndSend, FRAME_MS);
}

// ══════════════════════════════════════════════════════════════
// STOP
// ══════════════════════════════════════════════════════════════
async function stopWorkout() {
  isRunning = false; sessionGen++; isProcessingFrame = false;
  clearInterval(frameHandle); frameHandle = null;
  stopTimer(); closeCamera();

  liveBadge.classList.remove('visible');
  repOverlay.classList.remove('visible');
  camOverlay.classList.remove('hidden');

  btnStart.disabled = false; btnStop.disabled = true;
  document.querySelectorAll('.ex-btn').forEach(b => b.disabled = false);

  setStatus('done');
  setFeedback('Session complete — well done! 💪', 'ok');

  // Save camera-based reps (background)
  fetch('/api/workout/stop', { method:'POST' })
    .then(r => r.json())
    .then(d => { if (d.summary) saveToHistory(d.summary); })
    .catch(() => saveToHistory(null));

  showModal({ exercise:selectedExercise, reps:repCount });
}

async function saveToHistory(summary) {
  try {
    await fetch('/api/history/save', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        exercise: summary?.exercise || selectedExercise,
        reps:     summary?.reps    ?? repCount,
        sets:     setCount,
        duration: formatTime(elapsedSeconds)
      })
    });
  } catch { console.warn('[PulseFit] History save failed.'); }
}

// ══════════════════════════════════════════════════════════════
// RESET
// ══════════════════════════════════════════════════════════════
function resetSession() {
  if (isRunning) return;
  repCount = setCount = elapsedSeconds = 0; lastFeedback = '';
  hammerStage='down'; minAngleThisRep=180.0; maxAngleThisRep=0.0;

  repBig.textContent = statReps.textContent = statSets.textContent = '0';
  lastRepTime = 0;
lastSpeakTime = {};
elbowErrorStart = 0;
  timerDisp.textContent = '00:00';
  fbHistory.innerHTML   = '';
  fbText.textContent    = 'Select an exercise and press Start to begin.';
  fbIcon.textContent    = '🤖';
  fbBubble.className    = 'feedback-bubble';
  camOverlay.classList.remove('hidden');
  boxReps.classList.remove('highlight');
  boxSets.classList.remove('highlight');
  setStatus('idle');
}

// ══════════════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════════════
function showModal(summary) {
  const name = (summary?.exercise || selectedExercise)
    .replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  document.getElementById('modal-exercise-name').textContent = name;
  document.getElementById('modal-reps').textContent          = summary?.reps ?? repCount;
  document.getElementById('modal-sets').textContent          = setCount;
  document.getElementById('modal-duration').textContent      = formatTime(elapsedSeconds);
  document.getElementById('modal-backdrop').hidden           = false;
}
function closeModal() { document.getElementById('modal-backdrop').hidden = true; resetSession(); }

// ══════════════════════════════════════════════════════════════
// INIT  (runs after DOM is ready)
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Assign DOM refs
  videoEl    = document.getElementById('webcam-view');
  camOverlay = document.getElementById('cam-overlay');
  cameraCard = document.getElementById('camera-card');
  liveBadge  = document.getElementById('live-badge');
  repOverlay = document.getElementById('rep-overlay');
  repBig     = document.getElementById('rep-count-big');
  statReps   = document.getElementById('stat-reps');
  statSets   = document.getElementById('stat-sets');
  boxReps    = document.getElementById('box-reps');
  boxSets    = document.getElementById('box-sets');
  timerDisp  = document.getElementById('timer-display');
  fbBubble   = document.getElementById('feedback-bubble');
  fbIcon     = document.getElementById('fb-icon');
  fbText     = document.getElementById('feedback-text');
  fbHistory  = document.getElementById('feedback-history');
  statusPill = document.getElementById('status-pill');
  statusLbl  = document.getElementById('status-label');
  btnStart   = document.getElementById('btn-start');
  btnStop    = document.getElementById('btn-stop');
  setFlash   = document.getElementById('set-flash');

  buildGrid();
  loadPlan();
  setTimeout(() => initMediaPipe(), 2000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);

  }

});