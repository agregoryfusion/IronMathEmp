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

    // Build base query
    let query = supabase.from("leaderboard").select("*").limit(2000);

    // Scope filter
    if (scopeFilter === "students") {
      query = query.eq("is_student", true);
    } else if (scopeFilter === "teachers") {
      query = query.eq("is_teacher", true);
    }

    // TIME FILTER: monthly = calendar month/year; alltime = no date filter (we'll collapse to best-per-player)
    if (timeFilter === "monthly") {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      query = query.gte("date_added", startOfMonth).lt("date_added", startOfNextMonth);
      // order criteria for monthly view
      query = query.order("questions_answered", { ascending: false }).order("total_time_seconds", { ascending: true });
    } else {
      // all-time: fetch entries, then compute best-per-player client-side
      // keep an ordering to make pagination deterministic
      query = query.order("questions_answered", { ascending: false }).order("total_time_seconds", { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.error("loadLeaderboard query error:", error);
      if (lbStatus) lbStatus.textContent = "Error loading leaderboard";
      return { data: null, error };
    }

    let rows = Array.isArray(data) ? data : [];

    if (timeFilter === "alltime") {
      // Reduce to best row per player_name
      const bestByPlayer = new Map();
      for (const r of rows) {
        const name = r.player_name || r.playerName || "(unknown)";
        const qAns = Number(r.questions_answered ?? 0);
        const totTime = Number(r.total_time_seconds ?? Infinity);
        const existing = bestByPlayer.get(name);
        if (!existing) {
          bestByPlayer.set(name, r);
        } else {
          const exQ = Number(existing.questions_answered ?? 0);
          const exT = Number(existing.total_time_seconds ?? Infinity);
          // Prefer higher questions_answered; tie-breaker lower total_time_seconds; final tiebreak: newer date_added
          if (
            qAns > exQ ||
            (qAns === exQ && totTime < exT) ||
            (qAns === exQ && totTime === exT && new Date(r.date_added) > new Date(existing.date_added))
          ) {
            bestByPlayer.set(name, r);
          }
        }
      }
      rows = Array.from(bestByPlayer.values());
      // Sort best-per-player results for display
      rows.sort((a, b) => {
        const qa = Number(a.questions_answered ?? 0);
        const qb = Number(b.questions_answered ?? 0);
        if (qa !== qb) return qb - qa; // desc
        const ta = Number(a.total_time_seconds ?? Infinity);
        const tb = Number(b.total_time_seconds ?? Infinity);
        if (ta !== tb) return ta - tb; // asc
        return new Date(b.date_added) - new Date(a.date_added); // newest first
      });
    }

    // Render using existing renderer (assumes renderLeaderboard exists in this file)
    try {
      renderLeaderboard(rows);
      if (lbStatus) lbStatus.textContent = "";
    } catch (renderErr) {
      console.error("renderLeaderboard failed:", renderErr);
      if (lbStatus) lbStatus.textContent = "";
    }

    return { data: rows, error: null };
  } catch (e) {
    console.error("loadLeaderboard exception:", e);
    if (lbStatus) lbStatus.textContent = "Error loading leaderboard";
    return { data: null, error: e };
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
  getEmperorTopStudent,
  // new helpers
  insertSessionRow,
  insertQuestionRows,
  insertLeaderboardRow
};
