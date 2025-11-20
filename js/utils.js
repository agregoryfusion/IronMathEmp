// utils.js - shared helpers & constants
const FM = (window.FastMath = window.FastMath || {});

FM.GAME_VERSION = "1.0.66";

function cap(s){
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function parseEmailToName(email){
  if(!email) return "Player";
  const local = email.split("@")[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  if(parts.length >= 2) return parts.map(cap).join(" ");
  return cap(local);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[m]));
}

// Build a session ID using MST time
function buildSessionID(playerName){
  const parts = (playerName || "Player").trim().split(/\s+/);
  const first = parts[0] || "Player";
  const last = parts[1] || "";

  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset()*60000;
  const mst = new Date(utcMs - 7*60*60000);

  const mm = String(mst.getMonth()+1).padStart(2,"0");
  const dd = String(mst.getDate()).padStart(2,"0");
  const yyyy = mst.getFullYear();
  const hh = String(mst.getHours()).padStart(2,"0");
  const min = String(mst.getMinutes()).padStart(2,"0");

  return `${first} ${last} ${mm}-${dd}-${yyyy} ${hh}:${min}`;
}

// Gaussian RNG
function randn(){
  let u=0,v=0;
  while(u===0)u=Math.random();
  while(v===0)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

// Sample truncated normal
function sampleTrunc(minV,maxV,mu,sigma){
  if(sigma<=0||!isFinite(sigma)) return Math.min(Math.max(mu,minV),maxV);
  for(let i=0;i<40;i++){
    const x=mu+sigma*randn();
    if(x>=minV && x<=maxV) return x;
  }
  return Math.min(Math.max(mu,minV),maxV);
}

FM.utils = {
  cap,
  parseEmailToName,
  escapeHtml,
  buildSessionID,
  randn,
  sampleTrunc
};

// Set version text
const versionElement = document.getElementById("version");
if (versionElement) {
  versionElement.textContent = `v${FM.GAME_VERSION}`;
}
