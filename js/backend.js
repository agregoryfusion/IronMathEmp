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

// NEW: separate caches for all-time and monthly
let cachedAllTimeLeaderboard = null;
let cachedAllTimeFetchTime = 0;
let cachedMonthlyLeaderboard = null;
let cachedMonthlyFetchTime = 0;
// Track last requested timeFilter so view buttons can reuse the same cache
let lastLoadedTimeFilter = "monthly";

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
  // REPLACED: no upsert or month_key anymore — always insert a new leaderboard row
  const nowIso = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from("leaderboard")
      .insert({
        player_name: playerName,
        stage_reached: stageReached,
        questions_answered: questionsAnswered,
        total_time_seconds: totalTime,
        penalty_time_seconds: penaltyTime,
        date_added: nowIso,
        is_teacher: isTeacher,
        is_student: isStudent,
        version_number: versionNumber
      })
      .select()
      .single();

    if (error) {
      console.error("Leaderboard insert (upsert replacement) failed:", error);
      return { data: null, error };
    }
    return { data, error: null };
  } catch (e) {
    console.error("Leaderboard insert exception:", e);
    return { data: null, error: e };
  }
}

function updateCachedLeaderboardWithNewScore(newEntry) {
  if (!newEntry?.playerName) return;

  const key = (newEntry.playerName || "").trim().toLowerCase();

  // Update ALL-TIME cache (best-per-player)
  if (cachedAllTimeLeaderboard) {
    const idx = cachedAllTimeLeaderboard.findIndex(d => (d.playerName || "").trim().toLowerCase() === key);
    if (idx !== -1) {
      const old = cachedAllTimeLeaderboard[idx];
      const isBetter =
        newEntry.questionsAnswered > (old.questionsAnswered ?? 0) ||
        (newEntry.questionsAnswered === old.questionsAnswered && newEntry.totalTime < (old.totalTime ?? Infinity)) ||
        (newEntry.questionsAnswered === old.questionsAnswered && newEntry.totalTime === old.totalTime && (newEntry.dateAdded || 0) > (old.dateAdded || 0));
      if (isBetter) cachedAllTimeLeaderboard[idx] = newEntry;
    } else {
      // No existing best for this player — add
      cachedAllTimeLeaderboard.push(newEntry);
    }
    // sort best-per-player
    cachedAllTimeLeaderboard.sort((a, b) => {
      if (b.questionsAnswered === a.questionsAnswered) return a.totalTime - b.totalTime;
      return b.questionsAnswered - a.questionsAnswered;
    });
  }

  // Update MONTHLY cache (allow multiple entries per player)
  if (cachedMonthlyLeaderboard) {
    // Only add if the entry is in the current month (we assume dateAdded ms or fallback to now)
    const dateMs = newEntry.dateAdded || Date.now();
    const d = new Date(dateMs);
    const now = new Date();
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      cachedMonthlyLeaderboard.push(newEntry);
      // sort monthly
      cachedMonthlyLeaderboard.sort((a, b) => {
        if (b.questionsAnswered === a.questionsAnswered) return a.totalTime - b.totalTime;
        return b.questionsAnswered - a.questionsAnswered;
      });
    }
  }

  // If the currently displayed list is the one we updated, re-render filtered view
  const active = lastLoadedTimeFilter === "alltime" ? cachedAllTimeLeaderboard : cachedMonthlyLeaderboard;
  if (active) {
    // reuse existing applyLeaderboardFilter to apply student/teacher filtering
    const scope = (document.querySelector(".lb-scope-active")?.dataset?.scope) || "all";
    const filtered = applyLeaderboardFilter(active, scope);
    renderLeaderboard(filtered);
  }
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

  // Determine current player's normalized key (fall back to empty)
  const selfKey = (window.FastMath && window.FastMath.auth && window.FastMath.auth.playerName)
    ? (window.FastMath.auth.playerName || "").trim().toLowerCase()
    : "";

  for (const d of (data || []).slice(0, 100)) {
    const date = d.dateAdded ? new Date(d.dateAdded) : null;
    const mm = date ? String(date.getMonth() + 1).padStart(2, "0") : "--";
    const dd = date ? String(date.getDate()).padStart(2, "0") : "--";
    const yyyy = date ? date.getFullYear() : "----";

    const tr = document.createElement("tr");

    // If this row belongs to the currently signed-in player, add a marker class
    const rowKey = (d.playerName || "").trim().toLowerCase();
    if (selfKey && rowKey && rowKey === selfKey) {
      tr.classList.add("lb-row-self");
      // Optionally add .pulse to animate — remove/comment if undesired
      // tr.classList.add("pulse");
    }

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

async function fetchAllTimeLeaderboard(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedAllTimeLeaderboard && (now - cachedAllTimeFetchTime) < LEADERBOARD_CACHE_DURATION) return;
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .order("questions_answered", { ascending: false })
    .order("total_time_seconds", { ascending: true })
    .limit(5000);

  if (error) {
    console.error("All-time leaderboard fetch failed:", error);
    return;
  }

  const rows = (data || [])
    .filter(r => !!r.player_name)
    .map(r => ({
      playerName: r.player_name,
      questionsAnswered: Number(r.questions_answered ?? 0),
      totalTime: Number(r.total_time_seconds ?? 0),
      penaltyTime: Number(r.penalty_time_seconds ?? 0),
      dateAdded: r.date_added ? new Date(r.date_added).getTime() : null,
      isTeacher: r.is_teacher ?? false,
      isStudent: r.is_student ?? false,
      stageReached: r.stage_reached ?? null
    }));

  // reduce to best-per-player
  const bestByKey = new Map();
  for (const r of rows) {
    const k = (r.playerName || "").trim().toLowerCase();
    const existing = bestByKey.get(k);
    if (!existing) bestByKey.set(k, r);
    else {
      if (
        r.questionsAnswered > existing.questionsAnswered ||
        (r.questionsAnswered === existing.questionsAnswered && r.totalTime < existing.totalTime) ||
        (r.questionsAnswered === existing.questionsAnswered && r.totalTime === existing.totalTime && (r.dateAdded || 0) > (existing.dateAdded || 0))
      ) {
        bestByKey.set(k, r);
      }
    }
  }

  cachedAllTimeLeaderboard = Array.from(bestByKey.values());
  cachedAllTimeLeaderboard.sort((a, b) => {
    if (b.questionsAnswered === a.questionsAnswered) return a.totalTime - b.totalTime;
    return b.questionsAnswered - a.questionsAnswered;
  });
  cachedAllTimeFetchTime = now;
}

async function fetchMonthlyLeaderboard(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedMonthlyLeaderboard && (now - cachedMonthlyFetchTime) < LEADERBOARD_CACHE_DURATION) return;

  // fetch only current calendar month server-side
  const nowDate = new Date();
  const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).toISOString();
  const startOfNextMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1).toISOString();

  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .gte("date_added", startOfMonth)
    .lt("date_added", startOfNextMonth)
    .order("questions_answered", { ascending: false })
    .order("total_time_seconds", { ascending: true })
    .limit(5000);

  if (error) {
    console.error("Monthly leaderboard fetch failed:", error);
    return;
  }

  cachedMonthlyLeaderboard = (data || [])
    .filter(r => !!r.player_name)
    .map(r => ({
      playerName: r.player_name,
      questionsAnswered: Number(r.questions_answered ?? 0),
      totalTime: Number(r.total_time_seconds ?? 0),
      penaltyTime: Number(r.penalty_time_seconds ?? 0),
      dateAdded: r.date_added ? new Date(r.date_added).getTime() : null,
      isTeacher: r.is_teacher ?? false,
      isStudent: r.is_student ?? false,
      stageReached: r.stage_reached ?? null
    }));

  // monthly should allow multiple entries per player — just sort
  cachedMonthlyLeaderboard.sort((a, b) => {
    if (b.questionsAnswered === a.questionsAnswered) return a.totalTime - b.totalTime;
    return b.questionsAnswered - a.questionsAnswered;
  });
  cachedMonthlyFetchTime = now;
}

async function loadLeaderboard(scopeFilter = "all", timeFilter = "monthly", forceRefresh = false) {
  // Backwards-compat
  if (typeof timeFilter === "boolean") {
    forceRefresh = timeFilter;
    timeFilter = "monthly";
  }
  // Normalize
  if (typeof timeFilter === "string") {
    timeFilter = timeFilter.trim().toLowerCase();
    if (timeFilter === "all" || timeFilter === "alltime" || timeFilter === "all-time") timeFilter = "alltime";
    else timeFilter = "monthly";
  } else timeFilter = "monthly";

  lastLoadedTimeFilter = timeFilter;

  // Show loading status immediately
  //if (lbStatus) lbStatus.textContent = "Loading leaderboard...";

  // fetch appropriate cache
  if (timeFilter === "alltime") {
    await fetchAllTimeLeaderboard(!!forceRefresh);
    const filtered = applyLeaderboardFilter(cachedAllTimeLeaderboard || [], scopeFilter);
    cachedLeaderboardData = filtered;
    cachedEmperorData = (cachedAllTimeLeaderboard || []).filter(d => d.isStudent === true);
    renderLeaderboard(filtered);
    if (lbStatus) lbStatus.textContent = "";
    return { data: filtered, error: null };
  } else {
    await fetchMonthlyLeaderboard(!!forceRefresh);
    const filtered = applyLeaderboardFilter(cachedMonthlyLeaderboard || [], scopeFilter);
    cachedLeaderboardData = filtered;
    cachedEmperorData = (cachedMonthlyLeaderboard || []).filter(d => d.isStudent === true);
    renderLeaderboard(filtered);
    if (lbStatus) lbStatus.textContent = "";
    return { data: filtered, error: null };
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

// Replace generic fallback helpers with direct inserts matching recordUserLogin's pattern

async function insertSessionRow(sessionObj) {
  try {
    // Insert and return the created session row (select().single() like users insert)
    const { data, error } = await supabase
      .from("sessions")
      .insert(sessionObj)
      .select()
      .single();

    if (error) {
      console.error("Session insert failed:", error);
      return { data: null, error };
    }
    return { data, error: null };
  } catch (e) {
    console.error("Session insert exception:", e);
    return { data: null, error: e };
  }
}

async function insertQuestionRows(questionRows) {
  try {
    // Insert multiple question rows; return inserted array
    const { data, error } = await supabase
      .from("questions")
      .insert(questionRows)
      .select();

    if (error) {
      console.error("Questions insert failed:", error);
      return { data: null, error };
    }
    return { data, error: null };
  } catch (e) {
    console.error("Questions insert exception:", e);
    return { data: null, error: e };
  }
}

async function insertLeaderboardRow(lbRow) {
  try {
    // Insert leaderboard row and return it
    const { data, error } = await supabase
      .from("leaderboard")
      .insert(lbRow)
      .select()
      .single();

    if (error) {
      console.error("Leaderboard insert failed:", error);
      return { data: null, error };
    }
    return { data, error: null };
  } catch (e) {
    console.error("Leaderboard insert exception:", e);
    return { data: null, error: e };
  }
}

// Button wiring (student/teacher buttons should only filter the currently loaded cache)
if (viewAllBtn) {
  viewAllBtn.addEventListener("click", () => {
    // do not force a re-fetch; reuse currently cached timeFilter (hotswap)
    loadLeaderboard("all", lastLoadedTimeFilter, false);
  });
}
if (viewStudentsBtn) {
  viewStudentsBtn.addEventListener("click", () => {
    loadLeaderboard("students", lastLoadedTimeFilter, false);
  });
}
if (viewTeachersBtn) {
  viewTeachersBtn.addEventListener("click", () => {
    loadLeaderboard("teachers", lastLoadedTimeFilter, false);
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
  getEmperorTopStudent,
  // new helpers
  insertSessionRow,
  insertQuestionRows,
  insertLeaderboardRow
};
