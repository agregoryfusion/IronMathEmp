import "./utils.js";
import "./backend.js";

const FM = window.FastMath || {};
const backend = FM.backend || {};

// DOM
const playerSelect = document.getElementById("playerSelect");
const metricSelect = document.getElementById("metricSelect");
const allDatesChk = document.getElementById("allDates");
const dateSlider = document.getElementById("dateSlider");
const dateLabel = document.getElementById("dateLabel");
const refreshBtn = document.getElementById("refreshBtn");
const backBtn = document.getElementById("backBtn");
const gridEl = document.getElementById("grid");
const legendMax = document.getElementById("legendMax");
const statsEl = document.getElementById("stats");

const MAXN = 30;

let cachedQuestions = [];
let availableDates = []; // yyyy-mm-dd strings

async function loadQuestions(force = false) {
  if (!backend || typeof backend.fetchAndCacheQuestions !== "function") {
    throw new Error("Backend helper fetchAndCacheQuestions missing");
  }
  const rows = await backend.fetchAndCacheQuestions(force);
  cachedQuestions = rows || [];
  buildPlayers();
  rebuildAvailableDates();
  initDateSlider();
  render();
}

function buildPlayers() {
  const set = new Set();
  cachedQuestions.forEach(r => set.add(r.playerName || ""));
  const arr = Array.from(set).sort();
  playerSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "__ALL__"; allOpt.textContent = "All players";
  playerSelect.appendChild(allOpt);
  arr.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = p || "(unknown)";
    playerSelect.appendChild(opt);
  });
}

function ymdFromMs(ms) {
  if (!ms) return null;
  const d = new Date(Number(ms));
  if (!isFinite(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

function rebuildAvailableDates() {
  const sel = playerSelect.value;
  const set = new Set();
  for (const r of cachedQuestions) {
    if (!r.dateMs) continue;
    if (sel !== "__ALL__" && r.playerName !== sel) continue;
    const d = ymdFromMs(r.dateMs);
    if (d) set.add(d);
  }
  availableDates = Array.from(set).sort();
}

function initDateSlider() {
  if (availableDates.length === 0) {
    dateSlider.disabled = true;
    dateSlider.min = 0; dateSlider.max = 0; dateSlider.value = 0;
    dateLabel.textContent = "—";
    allDatesChk.checked = true;
  } else {
    dateSlider.disabled = false;
    dateSlider.min = 0;
    dateSlider.max = Math.max(0, availableDates.length-1);
    dateSlider.value = String(availableDates.length-1);
    updateDateLabel();
  }
}

function currentDate() {
  if (availableDates.length === 0) return '';
  const idx = Math.max(0, Math.min(availableDates.length-1, parseInt(dateSlider.value,10) || 0));
  return availableDates[idx];
}

function updateDateLabel(){
  dateLabel.textContent = allDatesChk.checked ? "All dates" : (currentDate() || '—');
}

function buildMatrices() {
  const attempts = Array.from({length:MAXN+1}, ()=>Array(MAXN+1).fill(0));
  const mistakeCount = Array.from({length:MAXN+1}, ()=>Array(MAXN+1).fill(0));
  const incorrectCount = Array.from({length:MAXN+1}, ()=>Array(MAXN+1).fill(0));
  const timeSum = Array.from({length:MAXN+1}, ()=>Array(MAXN+1).fill(0));
  const timeObs = Array.from({length:MAXN+1}, ()=>Array(MAXN+1).fill(0));

  const selected = playerSelect.value;
  const filterAll = allDatesChk.checked;
  const chosenDay = currentDate();

  for (const r of cachedQuestions) {
    const a = Number(r.a), b = Number(r.b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a < 1 || a > MAXN || b < 1 || b > MAXN) continue;
    if (selected !== "__ALL__" && r.playerName !== selected) continue;
    if (!filterAll) {
      if (!r.dateMs) continue;
      if (ymdFromMs(r.dateMs) !== chosenDay) continue;
    }
    attempts[a][b] += 1;
    mistakeCount[a][b] += (Number(r.mistakes) > 0 ? 1 : 0);
    incorrectCount[a][b] += (r.success ? 0 : 1);
    if (r.timeTaken != null && Number.isFinite(r.timeTaken)) {
      timeSum[a][b] += Number(r.timeTaken);
      timeObs[a][b] += 1;
    }
  }
  return {attempts, mistakeCount, incorrectCount, timeSum, timeObs};
}

function render() {
  updateDateLabel();
  const {attempts, mistakeCount, incorrectCount, timeSum, timeObs} = buildMatrices();
  const metric = metricSelect.value;

  const values = Array.from({length:MAXN+1}, ()=>Array(MAXN+1).fill(0));
  let maxVal = 0;
  for (let a=1;a<=MAXN;a++){
    for (let b=1;b<=MAXN;b++){
      let v = 0;
      switch(metric){
        case 'mistake_count': v = mistakeCount[a][b]; break;
        case 'incorrect_count': v = incorrectCount[a][b]; break;
        case 'attempts': v = attempts[a][b]; break;
        case 'mistake_rate':
          v = attempts[a][b] ? (100 * mistakeCount[a][b] / attempts[a][b]) : 0; break;
        case 'avg_time':
          v = timeObs[a][b] ? (timeSum[a][b] / timeObs[a][b]) : 0; break;
        case 'total_time':
          v = timeSum[a][b]; break;
      }
      values[a][b] = v;
      if (v > maxVal) maxVal = v;
    }
  }

  legendMax.textContent = metric === 'mistake_rate' ? `Max: ${maxVal.toFixed(1)}%` :
    (metric === 'avg_time' || metric === 'total_time' ? `Max: ${maxVal.toFixed(3)} s` : `Max: ${maxVal}`);

  // build table
  gridEl.innerHTML = '';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(document.createElement('th'));
  for (let b=1;b<=MAXN;b++){
    const th = document.createElement('th'); th.textContent = b;
    hr.appendChild(th);
  }
  thead.appendChild(hr); gridEl.appendChild(thead);

  const tbody = document.createElement('tbody');
  let totalAttempts = 0, cellsWithAttempts = 0, totalMistakeCells = 0, totalIncorrectCells = 0, totalTime=0, totalTimeObs=0;
  for (let a=1;a<=MAXN;a++){
    const tr = document.createElement('tr');
    const rhead = document.createElement('th'); rhead.textContent = a; tr.appendChild(rhead);
    for (let b=1;b<=MAXN;b++){
      const td = document.createElement('td'); td.className = 'cell';
      const v = values[a][b];
      const att = attempts[a][b];
      const m = mistakeCount[a][b];
      const inc = incorrectCount[a][b];
      const tSum = timeSum[a][b];
      const tN = timeObs[a][b];
      const tAvg = tN ? (tSum / tN) : 0;
      td.style.background = colorFor(v, maxVal);
      td.title = `a=${a}, b=${b}\n${att} attempt(s)\nmistake count: ${m}\nincorrect count: ${inc}\nmistake rate: ${att ? (100*m/att).toFixed(1) : 0}%\navg time: ${tAvg.toFixed(3)} s\ntotal time: ${tSum.toFixed(3)} s`;
      td.addEventListener('click', ()=> alert(td.title));
      tr.appendChild(td);

      totalAttempts += att;
      totalTime += tSum;
      totalTimeObs += tN;
      if (m>0) totalMistakeCells++;
      if (inc>0) totalIncorrectCells++;
      if (att>0) cellsWithAttempts++;
    }
    tbody.appendChild(tr);
  }
  gridEl.appendChild(tbody);

  // stats
  statsEl.innerHTML = `
    Cells with attempts: ${cellsWithAttempts.toLocaleString()} • Total attempts: ${totalAttempts.toLocaleString()} •
    Cells with mistakes≥1: ${totalMistakeCells.toLocaleString()} • Cells with incorrect≥1: ${totalIncorrectCells.toLocaleString()} •
    Avg time (overall): ${totalTimeObs ? (totalTime/totalTimeObs).toFixed(3)+' s' : '—'} • Total time (overall): ${totalTime.toFixed(3)} s
  `;
}

// simple color ramp
function colorFor(v, vmax){
  if (vmax <= 0) return '#101015';
  const t = Math.max(0, Math.min(1, v / vmax));
  if (t < 0.5){
    const u = t/0.5;
    return lerpColor('#101015', '#ffd2d2', u);
  } else {
    const u = (t-0.5)/0.5;
    return lerpColor('#ffd2d2', '#ff3b30', u);
  }
}
function hexToRgb(h){ const s=h.replace('#',''); const bi=parseInt(s,16); return {r:(bi>>16)&255,g:(bi>>8)&255,b:bi&255}; }
function rgbToHex({r,g,b}){ const toHex=(n)=>n.toString(16).padStart(2,'0'); return '#'+toHex(r)+toHex(g)+toHex(b); }
function lerp(a,b,t){ return a + (b-a)*t; }
function lerpColor(h1,h2,t){ const c1=hexToRgb(h1), c2=hexToRgb(h2); return rgbToHex({ r:Math.round(lerp(c1.r,c2.r,t)), g:Math.round(lerp(c1.g,c2.g,t)), b:Math.round(lerp(c1.b,c2.b,t)) }); }

// event wiring
playerSelect.addEventListener('change', ()=>{
  rebuildAvailableDates();
  initDateSlider();
  render();
});
metricSelect.addEventListener('change', render);
allDatesChk.addEventListener('change', ()=> { initDateSlider(); render(); });
dateSlider.addEventListener('input', ()=> { allDatesChk.checked = false; updateDateLabel(); render(); });
refreshBtn.addEventListener('click', ()=> loadQuestions(true));
backBtn.addEventListener('click', ()=> { window.location.href = './'; });

// initial load
loadQuestions().catch(err=>{
  console.error("Failed to load questions:", err);
  statsEl.textContent = "Failed to load data. See console.";
});
