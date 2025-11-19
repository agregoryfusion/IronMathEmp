// backend.js - Supabase + leaderboard + caching
const FM = (window.FastMath = window.FastMath || {});
const U = FM.utils || {};

// Supabase config
const SUPABASE_URL = "https://jfjlznxvofhjjlommdrd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bSFpnR01TewY44SI8mLuLA_aX3bF3Lk";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM for leaderboard
const lbWrap = document.getElementById("leaderboardContainer");
const lbStatus = document.getElementById("leaderboardStatus");
const lbBody = document.querySelector("#leaderboardContainer tbody");
const viewAllBtn = document.getElementById("viewAllBtn");
const viewStudentsBtn = document.getElementById("viewStudentsBtn");
const viewTeachersBtn = document.getElementById("viewTeachersBtn");

// Caching
let cachedLeaderboardData = null;
let cachedEmperorData = null;
let lastLeaderboardFetchTime = 0;
const LEADERBOARD_CACHE_DURATION = 60000; // 60s

async function recordUserLogin(email, name) {
  const nowIso = new Date().toISOString();

  const { data: existingUser, error: findErr } = await supabase
    .from("users")
    .select("*")
    .eq("name", name)
    .maybeSingle();

  if (findErr) {
    console.error("User lookup error:", findErr);
  }

  let userId = null;

  if (existingUser) {
    userId = existingUser.user_id;
    const updatedEmail = existingUser.email || email;

    const { error: updateErr } = await supabase
      .from("users")
      .update({
        email: updatedEmail,
        last_login_at: nowIso
      })
      .eq("user_id", userId);

    if (updateErr) {
      console.error("User update failed:", updateErr);
    }
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("users")
      .insert({
        name,
        email,
        last_login_at: nowIso
      })
      .select()
      .single();

    if (insertErr) {
      console.error("User insert failed:", insertErr);
    } else {
      userId = inserted.user_id;
    }
  }

  if (userId !== null) {
    const { error: loginErr } = await supabase
      .from("logins")
      .insert({
        user_id: userId,
        name,
        login_at: nowIso
      });

    if (loginErr) {
      console.error("Login insert failed:", loginErr);
    }
  }

  return userId;
}

async function upsertLeaderboardEntry({
  playerName,
  questionsAnswered,
  totalTime,
  penaltyTime,
  stageReached,
  isTeacher,
  isStudent,
  versionNumber
}) {
  const nowIso = new Date().toISOString();

// Monthly key: YYYY-MM
const monthKey = new Date().toISOString().slice(0, 7);

const { data: existing, error: fetchErr } = await supabase
  .from("leaderboard")
  .select("*")
  .eq("player_name", playerName)
  .eq("month_key", monthKey)
  .maybeSingle();


  if (fetchErr) {
    console.error("Leaderboard fetch error:", fetchErr);
    return;
  }

  if (!existing) {
    const { error: insertErr } = await supabase
      .from("leaderboard")
      .insert({
        player_name: playerName,
        month_key: monthKey,
        stage_reached: stageReached,
        questions_answered: questionsAnswered,
        total_time_seconds: totalTime,
        penalty_time_seconds: penaltyTime,
        date_added: nowIso,
        is_teacher: isTeacher,
        is_student: isStudent,
        version_number: versionNumber
      });

    if (insertErr) console.error("Leaderboard insert failed:", insertErr);
    return;
  }

  const betterQuestions = questionsAnswered > existing.questions_answered;
  const sameQuestions = questionsAnswered === existing.questions_answered;
  const fasterTime = totalTime < existing.total_time_seconds;
  const shouldUpdate = betterQuestions || (sameQuestions && fasterTime);

  if (!shouldUpdate) {
    console.log("Leaderboard: new score is NOT better, skipping update.");
    return;
  }

  const { error: updateErr } = await supabase
    .from("leaderboard")
    .update({
      stage_reached: stageReached,
      month_key: monthKey,
      questions_answered: questionsAnswered,
      total_time_seconds: totalTime,
      penalty_time_seconds: penaltyTime,
      date_added: nowIso,
      version_number: versionNumber
    })
    .eq("leaderboard_id", existing.leaderboard_id);

  if (updateErr) console.error("Leaderboard update failed:", updateErr);
}

function updateCachedLeaderboardWithNewScore(newEntry) {
  if (!newEntry?.playerName) return;

  const key = (newEntry.playerName || "").trim().toLowerCase();
  if (!cachedLeaderboardData) cachedLeaderboardData = [];

  const existingIndex = cachedLeaderboardData.findIndex(
    d => (d.playerName || "").trim().toLowerCase() === key
  );

  if (existingIndex !== -1) {
    const old = cachedLeaderboardData[existingIndex];
    const isBetter =
      newEntry.questionsAnswered > (old.questionsAnswered ?? 0) ||
      (newEntry.questionsAnswered === old.questionsAnswered &&
        newEntry.totalTime < (old.totalTime ?? Infinity));

    if (isBetter) {
      cachedLeaderboardData[existingIndex] = newEntry;
    }
  } else {
    cachedLeaderboardData.push(newEntry);
  }

  cachedLeaderboardData.sort((a, b) => {
    if (b.questionsAnswered === a.questionsAnswered)
      return a.totalTime - b.totalTime;
    return b.questionsAnswered - a.questionsAnswered;
  });

  cachedEmperorData = cachedLeaderboardData.filter(d => d.isStudent === true);

  renderLeaderboard(applyLeaderboardFilter(cachedLeaderboardData, "all"));
}

async function fetchAndCacheLeaderboard(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh &&
      cachedLeaderboardData &&
      (now - lastLeaderboardFetchTime < LEADERBOARD_CACHE_DURATION)) {
    return;
  }

  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .order("questions_answered", { ascending: false })
    .order("total_time_seconds", { ascending: true })
    .limit(500);

  if (error) {
    console.error("Leaderboard fetch failed:", error);
    return;
  }

  const rows = data || [];
  const normalized = rows
    .filter(r => !!r.player_name)
    .map(r => ({
      playerName: r.player_name,
      questionsAnswered: r.questions_answered ?? 0,
      totalTime: r.total_time_seconds ?? 0,
      penaltyTime: r.penalty_time_seconds ?? 0,
      dateAdded: r.date_added ? new Date(r.date_added).getTime() : null,
      isTeacher: r.is_teacher ?? false,
      isStudent: r.is_student ?? false,
      stageReached: r.stage_reached ?? null
    }));

  const grouped = {};
  for (const d of normalized) {
    const key = (d.playerName || "").trim().toLowerCase();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  }

  const best = Object.values(grouped).map(list =>
    list.sort((a, b) => {
      if (b.questionsAnswered === a.questionsAnswered)
        return a.totalTime - b.totalTime;
      return b.questionsAnswered - a.questionsAnswered;
    })[0]
  );

  best.sort((a, b) => {
    if (b.questionsAnswered === a.questionsAnswered)
      return a.totalTime - b.totalTime;
    return b.questionsAnswered - a.questionsAnswered;
  });

  cachedLeaderboardData = best;
  cachedEmperorData = best.filter(d => d.isStudent === true);
  lastLeaderboardFetchTime = now;
}

function applyLeaderboardFilter(data, filterType) {
  if (filterType === "students") {
    return data.filter(d => d.isStudent === true);
  } else if (filterType === "teachers") {
    return data.filter(d => d.isTeacher === true);
  }
  return data;
}

function renderLeaderboard(data) {
  if (!lbBody) return;
  lbBody.innerHTML = "";
  let rank = 1;
  for (const d of (data || []).slice(0, 100)) {
    const date = d.dateAdded ? new Date(d.dateAdded) : null;
    const mm = date ? String(date.getMonth() + 1).padStart(2, "0") : "--";
    const dd = date ? String(date.getDate()).padStart(2, "0") : "--";
    const yyyy = date ? date.getFullYear() : "----";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${rank++}</td>
      <td>${U.escapeHtml ? U.escapeHtml(d.playerName || "???") : (d.playerName || "???")}</td>
      <td>${d.questionsAnswered ?? "?"}</td>
      <td>${(d.totalTime ?? 0).toFixed(2)}</td>
      <td>${mm}/${dd}/${yyyy}</td>
    `;
    lbBody.appendChild(tr);
  }
}

async function loadLeaderboard(scopeFilter = "all", timeFilter = "monthly", forceRefresh = false) {
  try {
    if (lbStatus) lbStatus.textContent = "Loading leaderboard...";

    let query = supabase.from("leaderboard").select("*");

    // --- TIME FILTER ---
    if (timeFilter === "monthly") {
      const monthKey = new Date().toISOString().slice(0, 7);
      query = query.eq("month_key", monthKey);
    }

    // --- ORDERING ---
    query = query
      .order("questions_answered", { ascending: false })
      .order("total_time_seconds", { ascending: true })
      .limit(500);

    const { data, error } = await query;

    if (error) {
      console.error("Leaderboard fetch failed:", error);
      if (lbStatus) lbStatus.textContent = "Failed to load leaderboard";
      return;
    }

    const normalized = (data || []).map(row => ({
      playerName: row.player_name,
      questionsAnswered: row.questions_answered,
      totalTime: row.total_time_seconds,
      dateAdded: row.date_added ? new Date(row.date_added).getTime() : null,
      isTeacher: row.is_teacher,
      isStudent: row.is_student
    }));

    const filtered = applyLeaderboardFilter(normalized, scopeFilter);
    renderLeaderboard(filtered);

    if (lbStatus) lbStatus.textContent = "";
  } 
  catch (e) {
    console.error(e);
    if (lbStatus) lbStatus.textContent = "Failed";
  }
}


function toggleLeaderboard(filterType = "all") {
  if (!lbWrap) return;
  const showing = lbWrap.classList.toggle("show");
  lbWrap.style.display = showing ? "block" : "none";
  if (showing) loadLeaderboard(filterType);
}

function getEmperorTopStudent() {
  return cachedEmperorData?.[0] || null;
}

// Button wiring
if (viewAllBtn) {
  viewAllBtn.addEventListener("click", () => {
    renderLeaderboard(applyLeaderboardFilter(cachedLeaderboardData || [], "all"));
  });
}
if (viewStudentsBtn) {
  viewStudentsBtn.addEventListener("click", () => {
    renderLeaderboard(applyLeaderboardFilter(cachedLeaderboardData || [], "students"));
  });
}
if (viewTeachersBtn) {
  viewTeachersBtn.addEventListener("click", () => {
    renderLeaderboard(applyLeaderboardFilter(cachedLeaderboardData || [], "teachers"));
  });
}

// Expose in namespace
FM.backend = {
  supabase,
  recordUserLogin,
  upsertLeaderboardEntry,
  updateCachedLeaderboardWithNewScore,
  fetchAndCacheLeaderboard,
  loadLeaderboard,
  toggleLeaderboard,
  getEmperorTopStudent
};
