/* ==========================================================
   Aryan Saxena · portfolio
   ========================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ==========================================================
   HAND MODEL: the 21 MediaPipe landmarks
   ========================================================== */
const BASE = [
  [0, 0],
  [-0.30, -0.20], [-0.50, -0.45], [-0.62, -0.70], [-0.72, -0.92],
  [-0.25, -0.80], [-0.32, -1.20], [-0.36, -1.46], [-0.39, -1.70],
  [0, -0.85], [0, -1.30], [0, -1.58], [0, -1.84],
  [0.23, -0.80], [0.28, -1.22], [0.31, -1.48], [0.34, -1.70],
  [0.43, -0.68], [0.53, -1.00], [0.59, -1.20], [0.64, -1.40],
];
const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];

const rot = ([x, y], [cx, cy], a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/* An idle, breathing hand pose. pinch 0..1 brings thumb and index together. */
function proceduralPose(t, pinch) {
  const p = BASE.map((q) => [...q]);
  FINGERS.forEach((chain, f) => {
    const a = Math.sin(t * 1.6 + f * 0.8) * 0.06;
    const pivot = p[chain[0]];
    for (let i = 1; i < chain.length; i++) p[chain[i]] = rot(p[chain[i]], pivot, a);
  });
  if (pinch > 0) {
    const mid = lerp2(p[4], p[8], 0.5);
    p[4] = lerp2(p[4], mid, pinch); p[8] = lerp2(p[8], mid, pinch);
    p[3] = lerp2(p[3], mid, pinch * 0.45); p[7] = lerp2(p[7], mid, pinch * 0.45);
  }
  const g = Math.sin(t * 0.8) * 0.05;
  return p.map((q) => rot(q, [0, 0], g));
}

function drawHand(ctx, pts, { lw = 2, r = 5, ink, joint, tip, fill }) {
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  BONES.forEach(([a, b]) => { ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); });
  ctx.stroke();
  pts.forEach(([x, y], i) => {
    const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    ctx.beginPath();
    ctx.arc(x, y, isTip ? r * 1.25 : r, 0, Math.PI * 2);
    ctx.fillStyle = i === 8 ? tip : fill;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = i === 8 ? tip : joint;
    ctx.stroke();
  });
}

function fitCanvas(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: width, h: height };
}

/* ==========================================================
   HERO: a hand that follows your cursor (or becomes your hand)
   ========================================================== */
const hero = {
  el: $('.hero'), canvas: $('#hero-canvas'), visible: true,
  target: null, pos: null, pinch: 0, pinchTarget: 0, trail: [],
};
new IntersectionObserver(([e]) => (hero.visible = e.isIntersecting)).observe(hero.el);
const HINT = matchMedia('(pointer: coarse)').matches
  ? 'Drag your finger across the top of the page and the hand follows.'
  : 'That hand follows your cursor. Hold the mouse button down to pinch.';
$('#hero-hint').textContent = HINT;

addEventListener('pointermove', (e) => {
  const r = hero.el.getBoundingClientRect();
  const inside = e.clientY >= r.top && e.clientY <= r.bottom;
  hero.target = inside ? [e.clientX - r.left, e.clientY - r.top] : null;
});
hero.el.addEventListener('pointerdown', () => (hero.pinchTarget = 1));
addEventListener('pointerup', () => (hero.pinchTarget = 0));

function renderHero(t) {
  if (!hero.visible) return;
  const { ctx, w, h } = fitCanvas(hero.canvas);
  ctx.clearRect(0, 0, w, h);
  const colors = { ink: css('--ink'), joint: css('--orange'), tip: css('--blue'), fill: css('--bg') };

  let pts, tipPt;
  if (gesture.running && gesture.lm) {
    // your real hand, mirrored, across the hero
    pts = gesture.lm.map((p) => [(1 - p.x) * w, p.y * h]);
    tipPt = pts[8];
  } else {
    hero.pinch += (hero.pinchTarget - hero.pinch) * 0.25;
    const S = clamp(Math.min(w, h) * 0.17, 70, 150);
    const home = [w * (w > 900 ? 0.78 : 0.72), h * 0.5 + Math.sin(t * 1.1) * 12];
    const goal = hero.target && !reduceMotion ? hero.target : home;
    hero.pos = hero.pos ? lerp2(hero.pos, goal, 0.14) : goal;
    const pose = proceduralPose(reduceMotion ? 0 : t, hero.pinch);
    const ox = hero.pos[0] - pose[8][0] * S, oy = hero.pos[1] - pose[8][1] * S;
    pts = pose.map(([x, y]) => [ox + x * S, oy + y * S]);
    tipPt = pts[8];
  }

  // fading light-trail from the index fingertip
  const now = performance.now();
  hero.trail.push([tipPt[0], tipPt[1], now]);
  while (hero.trail.length && now - hero.trail[0][2] > 900) hero.trail.shift();
  if (hero.trail.length > 1) {
    ctx.lineCap = 'round';
    for (let i = 1; i < hero.trail.length; i++) {
      const [x0, y0] = hero.trail[i - 1], [x1, y1, ts] = hero.trail[i];
      ctx.globalAlpha = 1 - (now - ts) / 900;
      ctx.strokeStyle = colors.tip;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawHand(ctx, pts, { lw: 2.2, r: 6, ...colors });
}

/* ==========================================================
   GESTURE ENGINE (MediaPipe Hands in the browser)
   ========================================================== */
const gesture = {
  running: false, starting: false, landmarker: null, stream: null, lastTime: -1,
  lm: null, x: innerWidth / 2, y: innerHeight / 2, label: '',
  pinched: false, press: null, hoverEl: null, wristHist: [], lastWave: 0,
};
const video = $('#cam');
const cursorEl = $('#hand-cursor');

async function startGesture() {
  if (gesture.running || gesture.starting) return;
  if (!navigator.mediaDevices?.getUserMedia) { toast('Your browser does not allow camera access here'); return; }
  gesture.starting = true;
  toast('Loading the hand-tracking model…', 8000);
  try {
    const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const { HandLandmarker, FilesetResolver } = await import(`${base}/vision_bundle.mjs`);
    if (!gesture.landmarker) {
      const files = await FilesetResolver.forVisionTasks(`${base}/wasm`);
      gesture.landmarker = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO', numHands: 1,
      });
    }
    gesture.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
    video.srcObject = gesture.stream;
    await video.play();
    gesture.running = true;
    $('#hud').hidden = false;
    cursorEl.hidden = false;
    $('#stage-off').classList.add('hidden');
    $('#gesture-toggle').setAttribute('aria-pressed', 'true');
    $('#hero-hint').textContent = "That's your hand now. Point to move, pinch to click.";
    toast('Gesture control is on. Raise your hand ✋');
  } catch (err) {
    console.warn(err);
    toast("Couldn't start the camera. Check the permission and try again.", 4000);
    stopGesture();
  } finally {
    gesture.starting = false;
  }
}

function stopGesture() {
  gesture.running = false;
  gesture.lm = null;
  gesture.stream?.getTracks().forEach((t) => t.stop());
  gesture.stream = null;
  $('#hud').hidden = true;
  cursorEl.hidden = true;
  $('#stage-off').classList.remove('hidden');
  $('#gesture-toggle').setAttribute('aria-pressed', 'false');
  $('#hero-hint').textContent = HINT;
  setHover(null);
  if (drag.el) dragEnd();
}

const toggleGesture = () => (gesture.running ? stopGesture() : startGesture());
$('#gesture-toggle').addEventListener('click', toggleGesture);
$('#hero-gesture').addEventListener('click', startGesture);
$('#stage-start').addEventListener('click', startGesture);
$('#hud-stop').addEventListener('click', stopGesture);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function classify(lm) {
  const up = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => lm[tip].y < lm[pip].y);
  const n = up.filter(Boolean).length;
  if (gesture.pinched) return 'pinch';
  if (n === 4) return 'open palm';
  if (n === 0) return 'fist';
  if (up[0] && n === 1) return 'pointing';
  if (up[0] && up[1] && n === 2) return 'two fingers';
  return 'hand';
}

function setHover(el) {
  if (gesture.hoverEl === el) return;
  gesture.hoverEl?.classList.remove('hand-hover');
  gesture.hoverEl = el;
  el?.classList.add('hand-hover');
}

function gestureTick() {
  if (!gesture.running || video.currentTime === gesture.lastTime) return;
  gesture.lastTime = video.currentTime;
  const res = gesture.landmarker.detectForVideo(video, performance.now());
  const lm = res.landmarks?.[0] || null;
  gesture.lm = lm;
  if (!lm) { gesture.label = 'looking for a hand…'; $('#hud-gesture').textContent = gesture.label; return; }

  // cursor: index fingertip, mirrored, with margins so the edges are reachable
  const map = (v) => clamp((v - 0.15) / 0.7, 0, 1);
  gesture.x += (map(1 - lm[8].x) * innerWidth - gesture.x) * 0.4;
  gesture.y += (map(lm[8].y) * innerHeight - gesture.y) * 0.4;
  cursorEl.style.transform = `translate(${gesture.x}px, ${gesture.y}px)`;

  // pinch with hysteresis so it doesn't flicker
  const ratio = dist(lm[4], lm[8]) / (dist(lm[0], lm[9]) || 0.1);
  const was = gesture.pinched;
  gesture.pinched = was ? ratio < 0.42 : ratio < 0.28;
  cursorEl.classList.toggle('pinch', gesture.pinched);

  const under = document.elementFromPoint(gesture.x, gesture.y);
  const hit = under?.closest('.tool, a, button, textarea');
  if (!gesture.pinched) setHover(hit && !hit.closest('.hud') ? hit : null);

  if (gesture.pinched && !was) onPinchStart(hit);
  else if (gesture.pinched) onPinchMove();
  else if (was) onPinchEnd();

  gesture.label = classify(lm);
  $('#hud-gesture').textContent = gesture.label;
  detectWave(lm);
}

function onPinchStart(hit) {
  if (hit?.classList.contains('tool')) {
    dragStart(hit, gesture.x, gesture.y);
    gesture.press = { mode: 'drag' };
    return;
  }
  gesture.press = { mode: 'pending', target: hit, x: gesture.x, y: gesture.y, scroll: scrollY };
}
function onPinchMove() {
  const p = gesture.press;
  if (!p) return;
  if (p.mode === 'drag') { dragMove(gesture.x, gesture.y); return; }
  if (p.mode === 'pending' && Math.hypot(gesture.x - p.x, gesture.y - p.y) > 30) p.mode = 'scroll';
  if (p.mode === 'scroll') scrollTo({ top: p.scroll - (gesture.y - p.y) * 2.5, behavior: 'instant' });
}
function onPinchEnd() {
  const p = gesture.press;
  gesture.press = null;
  if (!p) return;
  if (p.mode === 'drag') dragEnd();
  else if (p.mode === 'pending' && p.target && !p.target.closest('.hud')) {
    if (p.target.tagName === 'TEXTAREA') p.target.focus();
    else p.target.click();
  }
}

function detectWave(lm) {
  const now = performance.now();
  const h = gesture.wristHist;
  h.push([lm[9].x, now]);
  while (h.length && now - h[0][1] > 1300) h.shift();
  if (gesture.label !== 'open palm' || now - gesture.lastWave < 3500 || h.length < 8) return;
  let flips = 0, dir = 0, anchor = h[0][0];
  for (const [x] of h) {
    const d = x - anchor;
    if (Math.abs(d) > 0.035) {
      const nd = Math.sign(d);
      if (dir && nd !== dir) flips++;
      dir = nd; anchor = x;
    }
  }
  if (flips >= 3) {
    gesture.lastWave = now;
    toast('👋 Hey! Thanks for stopping by. Say hi back: aryansaxena093@gmail.com', 4000);
    const wh = $('.wave-hand');
    wh.classList.remove('waving'); void wh.offsetWidth; wh.classList.add('waving');
  }
}

/* HUD preview (CSS mirrors it) */
function renderHud() {
  if (!gesture.running) return;
  const c = $('#hud-canvas'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(video, 0, 0, c.width, c.height);
  ctx.globalAlpha = 1;
  if (gesture.lm) {
    const pts = gesture.lm.map((p) => [p.x * c.width, p.y * c.height]);
    drawHand(ctx, pts, { lw: 1.5, r: 2.5, ink: '#fff', joint: css('--orange'), tip: css('--blue'), fill: '#fff' });
  }
}

/* Gesture OS demo stage: idle hand when off, your camera when on */
const stage = { canvas: $('#stage-canvas'), visible: false };
new IntersectionObserver(([e]) => (stage.visible = e.isIntersecting)).observe(stage.canvas);
function renderStage(t) {
  if (!stage.visible) return;
  const { ctx, w, h } = fitCanvas(stage.canvas);
  ctx.clearRect(0, 0, w, h);
  const colors = { ink: css('--ink'), joint: css('--orange'), tip: css('--blue'), fill: css('--bg') };
  if (gesture.running) {
    ctx.save();
    ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.globalAlpha = 0.5; ctx.drawImage(video, 0, 0, w, h); ctx.globalAlpha = 1;
    if (gesture.lm) drawHand(ctx, gesture.lm.map((p) => [p.x * w, p.y * h]), { lw: 2.5, r: 5, ...colors, fill: '#fff' });
    ctx.restore();
    ctx.font = '500 14px "DM Mono", monospace';
    const label = gesture.label || '…';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = colors.ink; ctx.beginPath(); ctx.roundRect(12, 12, tw + 20, 28, 14); ctx.fill();
    ctx.fillStyle = colors.fill; ctx.fillText(label, 22, 31);
  } else {
    const S = h * 0.24;
    const pinch = (Math.sin(t * 1.4) + 1) / 2 > 0.8 ? 1 : 0;
    stage.p = (stage.p || 0) + (pinch - (stage.p || 0)) * 0.2;
    const pose = proceduralPose(t, stage.p);
    const ox = w / 2, oy = h * 0.56;
    drawHand(ctx, pose.map(([x, y]) => [ox + x * S, oy + y * S]), { lw: 2, r: 5, ...colors });
  }
}

/* one loop for everything */
function frame(now) {
  const t = now / 1000;
  try { gestureTick(); } catch (e) { console.warn(e); }
  renderHero(t);
  renderHud();
  renderStage(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ==========================================================
   IRA: simulated walkthrough
   ========================================================== */
const IRA = [
  {
    q: 'Send Riya the Q3 review deck and find 30 minutes with her on Friday',
    steps: [
      ['orch', 'Orchestrator', 'plan → find file, send email, schedule meeting'],
      ['drive', 'Drive', 'search_files("Q3 review") → Q3_Review.pdf'],
      ['gmail', 'Gmail', 'send_email(to: Riya, attach: Q3_Review.pdf)'],
      ['cal', 'Calendar', 'find_free_slot(Fri, 30 min) → 3:00 PM'],
    ],
    cards: [
      `<div class="r-card"><div class="r-head"><i style="background:var(--orange)"></i>Gmail · sent</div>
        <p class="r-title">Q3 review deck</p><p>Hi Riya, here's the Q3 review deck. I've also sent an invite for Friday.</p>
        <span class="attach">Q3_Review.pdf</span></div>`,
      `<div class="r-card cal"><div class="r-head"><i style="background:var(--blue)"></i>Calendar · created</div>
        <p class="r-title">Q3 review · Riya</p><p>Friday · 3:00 – 3:30 PM</p></div>`,
    ],
  },
  {
    q: "What's on my calendar tomorrow? Email my team a summary",
    steps: [
      ['orch', 'Orchestrator', 'plan → read calendar, write summary, send'],
      ['cal', 'Calendar', 'list_events(tomorrow) → 3 events'],
      ['gmail', 'Gmail', 'send_email(to: team, body: summary)'],
    ],
    cards: [
      `<div class="r-card cal"><div class="r-head"><i style="background:var(--blue)"></i>Calendar · tomorrow</div>
        <p>10:00 Stand-up · 13:30 Design review · 16:00 1:1 with mentor</p></div>`,
      `<div class="r-card"><div class="r-head"><i style="background:var(--orange)"></i>Gmail · sent to team</div>
        <p class="r-title">Tomorrow at a glance</p><p>Three meetings: stand-up at 10, design review at 1:30, and my 1:1 at 4.</p></div>`,
    ],
  },
  {
    q: 'Find my internship offer letter and forward it to my mentor',
    steps: [
      ['orch', 'Orchestrator', 'plan → find document, forward it'],
      ['drive', 'Drive', 'search_files("offer letter") → Internship_Offer.pdf'],
      ['gmail', 'Gmail', 'send_email(to: mentor, attach: Internship_Offer.pdf)'],
    ],
    cards: [
      `<div class="r-card"><div class="r-head"><i style="background:var(--orange)"></i>Gmail · sent to mentor</div>
        <p class="r-title">Fwd: internship offer letter</p><p>Sharing my offer letter as discussed.</p>
        <span class="attach">Internship_Offer.pdf</span></div>`,
    ],
  },
];
let iraBusy = false;
const iraPrompts = $('#ira-prompts');
iraPrompts.innerHTML = IRA.map((s, i) => `<button data-i="${i}">“${s.q}”</button>`).join('');
iraPrompts.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) runIra(+b.dataset.i, b);
});

async function runIra(i, btn) {
  if (iraBusy) return;
  iraBusy = true;
  const s = IRA[i];
  $$('button', iraPrompts).forEach((b) => { b.classList.toggle('active', b === btn); b.disabled = true; });
  const log = $('#ira-log'), out = $('#ira-results');
  log.innerHTML = ''; out.innerHTML = '';
  const nodes = $$('.ira-flow .fn');
  const node = (n) => nodes.find((g) => g.dataset.n === n);
  nodes.forEach((g) => g.classList.remove('on', 'done'));
  const pace = reduceMotion ? 0 : 650;

  node('you').classList.add('on');
  await sleep(pace / 2);
  for (const [n, who, text] of s.steps) {
    nodes.forEach((g) => g.classList.contains('on') && g.classList.replace('on', 'done'));
    node(n).classList.add('on');
    if (n !== 'orch') node('mcp').classList.add('on');
    const li = document.createElement('li');
    li.innerHTML = `<b>${who}</b> ${text}`;
    log.appendChild(li);
    await sleep(pace);
    node('mcp').classList.remove('on');
  }
  nodes.forEach((g) => g.classList.contains('on') && g.classList.replace('on', 'done'));
  for (const c of s.cards) { out.insertAdjacentHTML('beforeend', c); await sleep(pace / 2); }
  $$('button', iraPrompts).forEach((b) => (b.disabled = false));
  iraBusy = false;
}

/* ==========================================================
   RESUME MATCHER: keyword version, pointed at my resume
   ========================================================== */
const SKILLS = {
  // skills on my resume
  Python: [/\bpython\b/], Java: [/\bjava\b(?!script)/], 'C++': [/c\+\+/], C: [/\bc\b(?![+#])/], JavaScript: [/javascript|\bjs\b/],
  LangChain: [/langchain/], LangGraph: [/langgraph/], RAG: [/\brag\b|retrieval[- ]augmented/], LLMs: [/\bllms?\b|large language model/],
  'AI agents': [/\bagents?\b|agentic/], MCP: [/\bmcp\b|model context protocol/], 'Gemini API': [/gemini/], 'Hugging Face': [/hugging ?face/],
  'Prompt engineering': [/prompt/], 'Generative AI': [/generative ai|gen ?ai/], NLP: [/\bnlp\b|natural language/],
  'Vector search': [/vector (db|database|store|search)|embedding/],
  FastAPI: [/fastapi/], 'REST APIs': [/\brest(ful)?\b|\bapis?\b/], React: [/\breact(\.js)?\b/], HTML: [/\bhtml/], CSS: [/\bcss\b/],
  PostgreSQL: [/postgres/], MySQL: [/mysql/], MongoDB: [/mongo/], SQL: [/\bsql\b/],
  Git: [/\bgit\b|github/], Docker: [/docker|container/], Postman: [/postman/], Linux: [/linux|unix/],
  'Data structures & algorithms': [/data structures|algorithms|\bdsa\b/], OOP: [/\boop\b|object[- ]oriented/],
  'Computer vision': [/computer vision|opencv|mediapipe/], Blockchain: [/blockchain|solidity|smart contract/],
  // skills I don't have yet
  Kubernetes: [/kubernetes|\bk8s\b/], AWS: [/\baws\b|amazon web services/], Azure: [/\bazure\b/], GCP: [/\bgcp\b|google cloud/],
  TypeScript: [/typescript|\bts\b/], 'Node.js': [/node(\.js|js)?\b/], Go: [/\bgolang\b|\bgo\b(?= |,)/], Rust: [/\brust\b/],
  Kafka: [/kafka/], Redis: [/redis/], GraphQL: [/graphql/], 'Next.js': [/next\.?js/], PyTorch: [/pytorch/], TensorFlow: [/tensorflow/],
  'scikit-learn': [/scikit|sklearn/], 'CI/CD': [/ci\/cd|continuous integration|github actions|jenkins/], Terraform: [/terraform/],
  'Spring Boot': [/spring/], Microservices: [/microservice/], Django: [/django/], Flask: [/flask/], 'Fine-tuning': [/fine[- ]?tun/],
  MLOps: [/mlops/], Spark: [/\bspark\b/],
};
const MINE = new Set(['Python', 'Java', 'C++', 'C', 'JavaScript', 'LangChain', 'LangGraph', 'RAG', 'LLMs', 'AI agents', 'MCP', 'Gemini API',
  'Hugging Face', 'Prompt engineering', 'Generative AI', 'NLP', 'Vector search', 'FastAPI', 'REST APIs', 'React', 'HTML', 'CSS',
  'PostgreSQL', 'MySQL', 'MongoDB', 'SQL', 'Git', 'Docker', 'Postman', 'Linux', 'Data structures & algorithms', 'OOP',
  'Computer vision', 'Blockchain']);

const PRESETS = {
  'AI Engineer': 'Looking for an AI Engineer comfortable with Python, LLMs, LangChain and RAG pipelines, vector databases, building AI agents, prompt engineering, FastAPI services, Docker, PyTorch and AWS.',
  'Backend SDE': 'Backend SDE: strong data structures and algorithms, Java or Python, REST APIs, SQL and PostgreSQL, Redis, Docker, Kubernetes, microservices, CI/CD and Git.',
  'Full-stack': 'Full-stack developer: JavaScript and TypeScript, React, Next.js, Node.js, HTML/CSS, MongoDB, REST APIs and Git.',
};
const presetBox = $('#jd-presets');
const jd = $('#jd-input');
presetBox.innerHTML = Object.keys(PRESETS).map((k) => `<button data-k="${k}">${k}</button>`).join('');
presetBox.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('button', presetBox).forEach((x) => x.classList.toggle('active', x === b));
  jd.value = PRESETS[b.dataset.k];
  analyze();
});
let jdTimer;
jd.addEventListener('input', () => {
  $$('button', presetBox).forEach((x) => x.classList.remove('active'));
  clearTimeout(jdTimer);
  jdTimer = setTimeout(analyze, 250);
});

function analyze() {
  const text = jd.value.toLowerCase();
  const found = Object.entries(SKILLS).filter(([, res]) => res.some((re) => re.test(text))).map(([k]) => k);
  const have = found.filter((k) => MINE.has(k));
  const gap = found.filter((k) => !MINE.has(k));
  const ring = $('#ring-fg');
  if (!found.length) {
    $('#match-pct').textContent = '–';
    ring.style.strokeDashoffset = 264;
    $('#match-title').textContent = text.trim() ? "I couldn't find any skills I recognise in that text." : 'Pick a role or paste a JD.';
    $('#match-have').innerHTML = $('#match-gap').innerHTML = '';
    return;
  }
  const pct = Math.round((have.length / found.length) * 100);
  $('#match-pct').textContent = `${pct}%`;
  ring.style.strokeDashoffset = 264 - (264 * pct) / 100;
  $('#match-title').textContent =
    pct >= 75 ? 'Strong match. Let\'s talk.' : pct >= 50 ? 'Good match, with a few things for me to pick up.' : 'Partial match, but I learn fast.';
  $('#match-have').innerHTML = have.map((k) => `<span>✓ ${k}</span>`).join('');
  $('#match-gap').innerHTML = gap.map((k) => `<span>${k}</span>`).join('');
}

/* ==========================================================
   SMALLER PROJECTS
   ========================================================== */
const SMALLER = [
  ['CWT-agent', 'The agent project I\'m building right now.', 'Python · 2026'],
  ['expense-tracker-mcp', 'A remote MCP server that lets AI assistants log and query expenses.', 'Python · 2026'],
  ['Healthcare_appointment', 'Appointment booking app for a healthcare setting.', 'TypeScript · 2026'],
  ['chandra-car-care', 'Website for a car-care business.', 'CSS · 2026'],
  ['expense-tracker', 'A small web app for keeping track of expenses.', 'HTML · 2026'],
  ['CTF-', 'Login-page challenge built for a capture-the-flag event.', 'JavaScript · 2025'],
  ['multifactorauthenticate', 'A multi-factor authentication flow.', 'TypeScript · 2025'],
  ['solidity-blockchain-beginner', 'My first smart contracts, from a Metacrafters course.', 'Solidity · 2023'],
];
$('#smaller-grid').innerHTML = SMALLER.map(([n, d, m]) => `
  <a class="mini" href="https://github.com/aryansaxena04/${n}" target="_blank" rel="noopener">
    <b>${n} ↗</b><p>${d}</p><small>${m}</small>
  </a>`).join('');

/* ==========================================================
   TOOLBOX: draggable chips (mouse, touch or pinch)
   ========================================================== */
const GROUPS = [
  ['Languages', 'var(--orange-soft)', ['Python', 'Java', 'C++', 'C', 'JavaScript']],
  ['AI', 'var(--blue-soft)', ['LangChain', 'LangGraph', 'RAG', 'MCP', 'FastMCP', 'Gemini API', 'Hugging Face', 'AI agents', 'Prompt engineering']],
  ['Backend & web', 'var(--green-soft)', ['FastAPI', 'REST APIs', 'React', 'HTML', 'CSS']],
  ['Data', 'var(--yellow-soft)', ['PostgreSQL', 'MySQL', 'MongoDB']],
  ['Vision', 'var(--pink-soft)', ['OpenCV', 'MediaPipe', 'PyAutoGUI']],
  ['Tools', 'var(--purple-soft)', ['Git', 'Docker', 'Postman', 'Linux', 'VS Code']],
  ['Foundations', 'var(--surface)', ['DSA', 'OOP', 'SQL', 'Blockchain']],
];
const area = $('#toolbox-area');
area.innerHTML = GROUPS.flatMap(([, color, items]) =>
  items.map((it) => `<div class="tool" style="background:${color}">${it}</div>`)).join('');
$('#toolbox-legend').innerHTML = GROUPS.map(([g, c]) => `<span><i style="background:${c}"></i>${g}</span>`).join('');

function setTool(el, x, y, r = +el.dataset.r || 0) {
  el.dataset.x = x; el.dataset.y = y;
  el.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg)`;
}
function layoutTools() {
  const W = area.clientWidth, H = area.clientHeight;
  const placed = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  $$('.tool', area).forEach((el) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = 0, y = 0;
    for (let tries = 0; tries < 60; tries++) {
      x = 12 + rnd() * Math.max(1, W - w - 24);
      y = 12 + rnd() * Math.max(1, H - h - 24);
      if (!placed.some((p) => x < p.x + p.w + 8 && x + w + 8 > p.x && y < p.y + p.h + 8 && y + h + 8 > p.y)) break;
    }
    placed.push({ x, y, w, h });
    el.dataset.r = ((rnd() - 0.5) * 12).toFixed(1);
    setTool(el, x, y);
  });
}
const drag = { el: null, dx: 0, dy: 0 };
function dragStart(el, cx, cy) {
  const box = area.getBoundingClientRect();
  drag.el = el;
  drag.dx = cx - box.left - +el.dataset.x;
  drag.dy = cy - box.top - +el.dataset.y;
  el.classList.add('dragging');
  area.appendChild(el); // bring to front
}
function dragMove(cx, cy) {
  if (!drag.el) return;
  const box = area.getBoundingClientRect(), el = drag.el;
  const x = clamp(cx - box.left - drag.dx, 0, box.width - el.offsetWidth);
  const y = clamp(cy - box.top - drag.dy, 0, box.height - el.offsetHeight);
  setTool(el, x, y, 0);
}
function dragEnd() {
  if (!drag.el) return;
  drag.el.dataset.r = ((Math.random() - 0.5) * 12).toFixed(1);
  setTool(drag.el, +drag.el.dataset.x, +drag.el.dataset.y);
  drag.el.classList.remove('dragging');
  drag.el = null;
}
area.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.tool');
  if (!el) return;
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  dragStart(el, e.clientX, e.clientY);
});
area.addEventListener('pointermove', (e) => drag.el && !gesture.press && dragMove(e.clientX, e.clientY));
area.addEventListener('pointerup', () => !gesture.press && dragEnd());
area.addEventListener('pointercancel', () => !gesture.press && dragEnd());
document.fonts?.ready.then(layoutTools);
layoutTools();
let lastW = area.clientWidth;
addEventListener('resize', () => { if (Math.abs(area.clientWidth - lastW) > 40) { lastW = area.clientWidth; layoutTools(); } });

/* ==========================================================
   PATH: timeline that fills as you scroll
   ========================================================== */
const STOPS = [
  ['2020', 'Class X, St. Anselm Sr. Sec. School', 'Finished with 82.8%.'],
  ['2022', 'Class XII, same school', 'Finished with 83.4% and picked computer science.'],
  ['2023', 'Started at VIT Vellore', 'B.Tech in CSE, specialising in Blockchain Technology.', true],
  ['Oct 2023', 'Wrote my first smart contracts', 'Solidity, for a Metacrafters course. That was my first real code on GitHub.'],
  ['At VIT', 'Off-keyboard', 'Coordinated the Rajasthan team for Aikya, helped run Capture The Cube (a cryptography puzzle event) at Gravitas, and served as an NCC cadet.'],
  ['May 2026', 'AI Engineering Intern at Pratham Software', 'Built agent workflows, backend modules and prototypes in Jaipur.', true],
  ['Jun 2026', 'Built Gesture OS', 'Hand tracking, computer control, and a lot of tuning for jitter.'],
  ['Aug 2026', 'Built IRA', 'A multi-agent assistant for Gmail, Drive and Calendar.'],
  ['Now', 'Final year', 'Building CWT-agent and looking for SDE / AI engineering roles from 2027.', true],
];
$('#path-list').innerHTML = STOPS.map(([when, title, text, big]) => `
  <li class="stop${big ? ' big-stop' : ''}">
    <div class="stop-when">${when}</div>
    <div><h3>${title}</h3><p>${text}</p></div>
  </li>`).join('');

const pathEl = $('.path'), pathFill = $('#path-fill'), stops = $$('.stop');
function onScroll() {
  const mid = innerHeight * 0.6;
  const r = pathEl.getBoundingClientRect();
  pathFill.style.height = `${clamp((mid - r.top) / r.height, 0, 1) * 100}%`;
  stops.forEach((s) => s.classList.toggle('seen', s.getBoundingClientRect().top < mid));
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

console.log('%cHi, curious one. There\'s a puzzle hidden in the page source.', 'font: 600 14px sans-serif; color: #ff5b24');
