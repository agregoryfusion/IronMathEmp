// game.js - core game logic
const FM = (window.FastMath = window.FastMath || {});
const U = FM.utils || {};
const backend = FM.backend;

// DOM
const gameContainer = document.getElementById("game-container");
const endScreen = document.getElementById("end-screen");
const questionEl = document.getElementById("question");
const answerEl = document.getElementById("answer");
const stageInfo = document.getElementById("stage-info");
const timerFill = document.getElementById("timerFill");
const restartBtn = document.getElementById("restartBtn");
const lbWrap = document.getElementById("leaderboardContainer");
const lbStatus = document.getElementById("leaderboardStatus");

// Constants
const SIGMA_SCALE = 6;
const STRETCH_MULT = 0.5;
const WEIGHT_DECAY = 0.88;
const WEIGHT_STRENGTH = 4;
const START_STAGE = 8;
const TIMER_SECONDS = 10;
const DUPLICATE_PROTECTION = 25;
const PENALTY_MULT = 2;

// State
let sessionId = U.buildSessionID ? U.buildSessionID("Player") : "Session";
let stage = START_STAGE;
let questionCount = 0;
let correctCount = 0;
let totalTimeTrue = 0;
let penaltySeconds = 0;
let productWeights = {};
let recentAnswers = [];
let current = null;
let timeLeft = TIMER_SECONDS;
let rafId = 0;
let qStartTs = 0;
let runStartTs = 0;
let mistakesThisQuestion = 0;

let runData = { sessionID: "", results: [] };

function buildPairs(stage){
  const maxF = Math.floor(stage*(1+STRETCH_MULT));
  const out=[];
  for(let a=1;a<=maxF;a++){
    for(let b=1;b<=maxF;b++){
      if(a>stage && b>stage) continue;
      out.push([a,b]);
    }
  }
  return out;
}

function choosePair(pairs){
  let minP=Infinity,maxP=-Infinity;
  const prods=new Array(pairs.length);
  for(let i=0;i<pairs.length;i++){
    const p=pairs[i][0]*pairs[i][1];
    prods[i]=p;
    if(p<minP)minP=p;
    if(p>maxP)maxP=p;
  }
  const mu=(minP+maxP)/2;
  const sigma=Math.max(1e-6,(maxP-minP)/SIGMA_SCALE);
  const target=U.sampleTrunc ? U.sampleTrunc(minP,maxP,mu,sigma) : mu;

  let bestIdx=-1,bestScore=Infinity,safety=0;
  while(safety++<500){
    for(let i=0;i<pairs.length;i++){
      const p=prods[i];
      if(recentAnswers.includes(p)) continue;
      const dist=Math.abs(p-target);
      const w=(productWeights[p]||0);
      const score = dist * (1 + WEIGHT_STRENGTH*w);
      if(score<bestScore){ bestScore=score; bestIdx=i; }
    }
    if(bestIdx!==-1) break;
    recentAnswers.shift();
  }
let [a, b] = pairs[bestIdx];

// 50% chance to swap A and B
if (Math.random() < 0.5) {
  const tmp = a;
  a = b;
  b = tmp;
}

return { a, b, prod: a * b };
}

function decayWeightsAndBump(prod){
  for(const k in productWeights){
    productWeights[k]*=WEIGHT_DECAY;
    if(productWeights[k] < 1e-4) delete productWeights[k];
  }
  productWeights[prod]=(productWeights[prod]||0)+1;
}

function shake(el, mult=1){
  const urgency = 1 - (timeLeft/TIMER_SECONDS);
  const dur = 0.3 + 0.2*urgency;
  const base = 8;
  const mag = base * (1 + 2*urgency) * (1 + 0.3*(mult-1));
  const t0 = performance.now();
  (function step(){
    const dt = performance.now()-t0;
    if(dt < dur*1000){
      const k = 1 - dt/(dur*1000);
      const vertBias = 0.5 + 1.5*urgency;
      const dx=(Math.random()*2-1)*mag*k;
      const dy=(Math.random()*2-1)*mag*k*vertBias;
      el.style.transform=`translate(${dx}px,${dy}px)`;
      requestAnimationFrame(step);
    }else{
      el.style.transform='translate(0,0)';
    }
  })();
}

function resetRunState() {
  const auth = FM.auth || { playerName:"Player" };
  sessionId = U.buildSessionID ? U.buildSessionID(auth.playerName || "Player") : "Session";
  runData = { sessionID: sessionId, results: [] };
  stage = START_STAGE;
  questionCount = 0;
  correctCount = 0;
  totalTimeTrue = 0;
  penaltySeconds = 0;
  productWeights = {};
  recentAnswers = [];
  mistakesThisQuestion = 0;
  timeLeft = TIMER_SECONDS;
  cancelAnimationFrame(rafId);
}

function startGame(){
  if (!gameContainer) return;
  resetRunState();
  runStartTs = performance.now();
  gameContainer.style.display = "block";
  if (endScreen) endScreen.style.display = "none";
  nextQuestion();
}

function nextQuestion(){
  const pairs = buildPairs(stage);
  let q; let guard=0;
  do{
    q = choosePair(pairs);
    guard++; if(guard>1000) break;
  }while(recentAnswers.includes(q.prod));
  recentAnswers.push(q.prod);
  if(recentAnswers.length > DUPLICATE_PROTECTION) recentAnswers.shift();
  current = q;
  mistakesThisQuestion = 0;

  questionEl.textContent = `${q.a} × ${q.b}`;
  answerEl.value = "";
  answerEl.focus();
  stageInfo.textContent = `Stage ${stage}`;

  let penaltySecondsThisRound = 0;
  timeLeft = TIMER_SECONDS;
  qStartTs = performance.now();
  timerFill.style.width = "100%";
  cancelAnimationFrame(rafId);

  const tick = () => {
    const elapsed = (performance.now() - qStartTs) / 1000;
    const remaining = TIMER_SECONDS - elapsed - penaltySecondsThisRound;
    timeLeft = Math.max(0, remaining);

    const pct = Math.max(0, Math.min(1, timeLeft / TIMER_SECONDS));
    timerFill.style.width = (pct * 100) + "%";

    if (timeLeft <= 0) {
      const trueT = (performance.now() - qStartTs) / 1000;
      totalTimeTrue += trueT;
      runData.results.push({
        questionNumber: correctCount + 1,  // ⭐ NEWish but kinda old? but kinda new>?eeee
        a: current.a,
        b: current.b,
        stage,
        timeTaken: (performance.now() - qStartTs) / 1000,
        mistakes: mistakesThisQuestion,
        success: false
      });
      return gameOver();
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  answerEl.oninput = (e)=>{
    if(!current) return;
    const val = e.target.value.trim();
    if(val === "") return;
    const correctStr = String(current.prod);

    if(val === correctStr){
      const trueT = (performance.now()-qStartTs)/1000;
      totalTimeTrue += trueT;
      correctCount++;
      questionCount++;
      runData.results.push({
        a: current.a,
        b: current.b,
        stage,
        timeTaken: (performance.now() - qStartTs) / 1000,
        mistakes: mistakesThisQuestion,
        success: true
      });
      decayWeightsAndBump(current.prod);
      const stepSize = 2*stage - 1;
      if(questionCount >= stepSize*(stage-START_STAGE+1)) stage++;
      current = null;
      return nextQuestion();
    }

    if(!correctStr.startsWith(val)){
      const avgModifiedSoFar = (totalTimeTrue + penaltySeconds) / Math.max(correctCount, 1) || 2.0;
      const penalty = avgModifiedSoFar * Math.pow(PENALTY_MULT, mistakesThisQuestion);
      mistakesThisQuestion++;
      penaltySeconds += penalty;
      penaltySecondsThisRound += penalty;

      const remaining = TIMER_SECONDS - ((performance.now() - qStartTs) / 1000) - penaltySecondsThisRound;
      timeLeft = Math.max(0, remaining);
      const pct = Math.max(0, Math.min(1, timeLeft / TIMER_SECONDS));
      timerFill.style.width = (pct * 100) + "%";

      e.target.value = val.slice(0, -1);
      shake(questionEl, mistakesThisQuestion);

      if (remaining <= 0) {
        runData.results.push({
          questionNumber: correctCount + 1,  // ⭐ NEW
          a: current.a,
          b: current.b,
          stage,
          timeTaken: (performance.now() - qStartTs) / 1000,
          mistakes: mistakesThisQuestion,
          success: false
        });
        return gameOver();
      }
    }
  };
}

function gameOver(){
  cancelAnimationFrame(rafId);
  current = null;
  if (gameContainer) gameContainer.style.display = "none";
  if (endScreen) endScreen.style.display = "block";

  if (lbWrap) {
    lbWrap.style.display = "block";
    lbWrap.classList.add("show");
  }
  if (lbStatus) lbStatus.textContent = "Loading leaderboard...";
  backend.loadLeaderboard("all", true);

  const totalTrue = totalTimeTrue;
  const totalWithPen = totalTimeTrue + penaltySeconds;
  const avgTrue = totalTrue / Math.max(correctCount,1);
  const avgPen = totalWithPen / Math.max(correctCount,1);

  document.getElementById("end-questions").textContent =
    `Questions answered: ${correctCount}`;
  document.getElementById("end-penalty").textContent =
    `Total penalty time: ${penaltySeconds.toFixed(2)} s`;
  document.getElementById("end-total").innerHTML =
    `Total time: ${totalTrue.toFixed(2)} s (<span id="end-with-penalty">${totalWithPen.toFixed(2)}</span> s with penalties)`;
  document.getElementById("end-avg").innerHTML =
    `Avg time/question: ${avgTrue.toFixed(2)} s (<span id="end-avg-with-penalty">${avgPen.toFixed(2)}</span> s with penalties)`;

  uploadSession(totalTrue);
}

async function uploadSession(totalTrue){
  try{
    const now = new Date();
    const createdIso = now.toISOString();
    const totalWithPen = totalTrue + penaltySeconds;

    const auth = FM.auth || { playerName:"Player", isTeacher:false, isStudent:false };
    const playerName = auth.playerName || "Player";

    const { data: sessionRows, error: sessionError } = await backend.supabase
      .from("sessions")
      .insert({
        user_id: window.currentUserId || null,
        name: playerName,
        questions_answered: correctCount,
        true_time_seconds: totalTrue,
        penalty_time_seconds: penaltySeconds,
        total_time_seconds: totalWithPen,
        stage_reached: stage,
        created_at: createdIso,
        version_number: FM.GAME_VERSION
      })
      .select()
      .single();

    if (sessionError) throw sessionError;
    const sessionNumericId = sessionRows.session_id;

    const questionsPayload = runData.results.map(q => ({
      session_id: sessionNumericId,
      question_number: q.questionNumber,       // ⭐ NEW
      a: q.a,
      b: q.b,
      time_taken: q.timeTaken,
      mistakes: q.mistakes,
      success: q.success,
      date_added: createdIso,
      player_name: playerName,
      version_number: FM.GAME_VERSION
    }));

    if (questionsPayload.length > 0) {
      const { error: qError } = await backend.supabase
        .from("questions")
        .insert(questionsPayload);
      if (qError) console.error("Question insert error:", qError);
    }

    await backend.upsertLeaderboardEntry({
      playerName,
      questionsAnswered: correctCount,
      totalTime: totalWithPen,
      penaltyTime: penaltySeconds,
      stageReached: stage,
      isTeacher: !!auth.isTeacher,
      isStudent: !!auth.isStudent,
      versionNumber: FM.GAME_VERSION
    });

    const cacheEntry = {
      playerName,
      stageReached: stage,
      questionsAnswered: correctCount,
      totalTime: totalWithPen,
      penaltyTime: penaltySeconds,
      dateAdded: now.getTime(),
      isTeacher: !!auth.isTeacher,
      isStudent: !!auth.isStudent
    };
    backend.updateCachedLeaderboardWithNewScore(cacheEntry);
    const s = document.getElementById("saved-status");
    if (s) {
      s.textContent = "Saved ✓";
      s.style.color = "#7fdca2";
    }
  }catch(e){
    console.error("Upload failed", e);
    const s = document.getElementById("saved-status");
    if (s) {
      s.textContent = "Upload failed";
      s.style.color = "#ff8a8a";
    }
  }
}

if (restartBtn) {
  restartBtn.addEventListener("click", ()=>{
    if (endScreen) endScreen.style.display = "none";
    if (FM.ui && typeof FM.ui.showEmperor === "function") {
      backend.fetchAndCacheLeaderboard(true).then(()=>{
        FM.ui.showEmperor();
      });
    }
  });
}

// Expose
FM.game = {
  startGame
};
