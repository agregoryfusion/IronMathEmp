import "./utils.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  OAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const FM = (window.FastMath = window.FastMath || {});
const U = FM.utils || {};

const loginScreen = document.getElementById("login-screen");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const homeScreen = document.getElementById("home-screen");
const userNameEl = document.getElementById("userName");
const userEmailEl = document.getElementById("userEmail");
const signOutBtn = document.getElementById("signOutBtn");

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
await setPersistence(auth, browserLocalPersistence);

function showHome(user) {
  const displayName = user?.displayName || (U.parseEmailToName ? U.parseEmailToName(user?.email) : "Player");
  if (userNameEl) userNameEl.textContent = "Welcome " + displayName || "Player";
  if (userEmailEl) userEmailEl.textContent = user?.email || "";

  if (loginScreen) loginScreen.style.display = "none";
  if (homeScreen) {
    homeScreen.style.display = "flex";
    homeScreen.style.opacity = "1";
  }
  if (loginStatus) loginStatus.textContent = "";
}

function showLogin(message = "") {
  if (homeScreen) {
    homeScreen.style.display = "none";
    homeScreen.style.opacity = "0";
  }
  if (loginScreen) loginScreen.style.display = "flex";
  if (loginStatus) loginStatus.textContent = message;
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    showHome(user);
  } else {
    showLogin();
  }
});

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      if (loginStatus) loginStatus.textContent = "Signing in...";
      const result = await signInWithPopup(auth, provider);
      showHome(result.user);
    } catch (e) {
      console.error("Sign-in error:", e);
      showLogin("Sign-in failed: " + (e?.message || e));
    }
  });
}

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showLogin();
    } catch (e) {
      console.error("Sign-out error:", e);
      if (loginStatus) loginStatus.textContent = "Sign-out failed: " + (e?.message || e);
    }
  });
}
