// auth.js - entry point: Firebase + emperor + start game
import "./utils.js";
import "./backend.js";
import "./game.js";
import "./ui.js";
const FM = (window.FastMath = window.FastMath || {});
const U = FM.utils;
const backend = FM.backend;

// DOM elements
const loginScreen = document.getElementById("login-screen");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const emperorScreen = document.getElementById("emperor-screen");
const emperorName = document.getElementById("emperorName");
const emperorScore = document.getElementById("emperorScore");
const playBtn = document.getElementById("playBtn");
// new: teacher-only data button
const dataBtn = document.getElementById("dataBtn");

const gameContainer = document.getElementById("game-container");
const endScreen = document.getElementById("end-screen");

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth, OAuthProvider, signInWithPopup,
  setPersistence, browserLocalPersistence, onAuthStateChanged,
  // added redirect helpers
  signInWithRedirect, getRedirectResult
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBUaOrUckCuTrc9MHB9jCF4TUsx-hWFC7g",
  authDomain: "ironmath-1263b.firebaseapp.com",
  projectId: "ironmath-1263b",
  storageBucket: "ironmath-1263b.firebasestorage.app",
  messagingSenderId: "729878130193",
  appId: "1:729878130193:web:f4d447b552e4f955f80bb0",
  measurementId: "G-0VCM7C1HPC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new OAuthProvider("microsoft.com");

// Make persistence non-blocking so module doesn't stall
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Could not set Firebase auth persistence; continuing without persistent session.", err);
});

// Encourage account selection (helps some edge cases / popup flows)
try {
  provider.setCustomParameters?.({ prompt: "select_account" });
} catch (e) {
  console.warn("Could not set provider parameters:", e);
}

// Process redirect result (in case signInWithRedirect was used)
getRedirectResult(auth).then((result) => {
  if (result && result.user) {
    console.log("Processed redirect sign-in result");
    handleSignedIn(result.user).catch(err => console.warn("handleSignedIn after redirect failed:", err));
  }
}).catch((err) => {
  console.warn("getRedirectResult error:", err);
});

FM.auth = {
  playerName: "Player",
  email: "",
  isTeacher: false,
  isStudent: false
};

async function handleSignedIn(user) {
  const email = user.email?.toLowerCase() || "";
  let isTeacher = false;
  let isStudent = false;

  if (email.endsWith("@fusionacademy.com")) {
    isTeacher = true;
    isStudent = false;
  } else if (email.endsWith("@fusionacademy.me")) {
    isStudent = true;
    isTeacher = false;
  }

  const playerName = user.displayName || (U && U.parseEmailToName ? U.parseEmailToName(user.email) : "Player");

  FM.auth.playerName = playerName;
  FM.auth.email = email;
  FM.auth.isTeacher = isTeacher;
  FM.auth.isStudent = isStudent;

  const userId = await backend.recordUserLogin(email, playerName);
  window.currentUserId = userId;

  if (loginScreen) loginScreen.style.display = "none";
  if (gameContainer) gameContainer.style.display = "none";
  if (endScreen) endScreen.style.display = "none";

  // show or hide Data button for teachers
  try {
    if (dataBtn) dataBtn.style.display = isTeacher ? "inline-block" : "none";
  } catch (e) { /* ignore timing */ }

  await backend.fetchAndCacheLeaderboard(true);
  showEmperor();
}

function showEmperor() {
  const top = backend.getEmperorTopStudent();
  if (top) {
    emperorName.textContent = top.playerName;
    emperorScore.textContent = `${top.questionsAnswered} Correct`;
  } else {
    emperorName.textContent = "—";
    emperorScore.textContent = "—";
  }

  emperorScreen.style.display = "block";
  if (gameContainer) gameContainer.style.display = "none";
}

// Expose UI helper for game restart
FM.ui = {
  showEmperor
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await handleSignedIn(user);
  } else {
    if (emperorScreen) emperorScreen.style.display = "none";
    if (gameContainer) gameContainer.style.display = "none";
    if (endScreen) endScreen.style.display = "none";
    if (loginScreen) loginScreen.style.display = "flex";
  }
});

if (loginBtn) {
  loginBtn.addEventListener("click", async ()=>{
    console.log("Login button clicked - attempting sign-in");
    try {
      const result = await signInWithPopup(auth, provider);
      if (result && result.user) {
        await handleSignedIn(result.user);
      }
    } catch(e) {
      console.error("Sign-in (popup) error:", e);
      const msg = (e && e.message) ? e.message.toLowerCase() : "";
      const code = e?.code || "";
      const popupBlocked = /popup/i.test(msg) || /popup/i.test(code) || code === "auth/popup-blocked" || code === "auth/cancelled-popup-request";
      // Fallback to redirect sign-in if popup blocked or similar
      if (popupBlocked) {
        try {
          if (loginStatus) loginStatus.textContent = "Popup blocked — redirecting to sign-in...";
          console.warn("Falling back to signInWithRedirect due to popup issue.");
          await signInWithRedirect(auth, provider);
          // Redirect will navigate away; getRedirectResult above will handle completion.
        } catch (re) {
          console.error("signInWithRedirect failed:", re);
          if (loginStatus) loginStatus.textContent = "Sign-in failed: " + (re?.message || re);
        }
      } else {
        if (loginStatus) loginStatus.textContent = "Sign-in failed: " + (e?.message || e);
      }
    }
  });
}

// new: Data button navigates to the data page (only visible to teachers)
if (dataBtn) {
  dataBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // open the standalone data page that will query the backend cache
    window.location.href = "data.html";
  });
}

if (playBtn) {
  playBtn.addEventListener("click", ()=>{
    emperorScreen.style.display = "none";
    FM.game.startGame();
  });
}
