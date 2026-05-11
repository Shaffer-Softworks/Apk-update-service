"use strict";

const apiBase = (() => {
  const here = window.location.pathname.replace(/\/+$/, "");
  return `${here}/api/admin`;
})();

const publicApiBase = (() => {
  const here = window.location.pathname.replace(/\/+$/, "");
  return `${here}/api`;
})();

const $ = (id) => document.getElementById(id);
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch (_e) {
    return iso;
  }
};
const truncate = (s, n = 12) => (s && s.length > n ? `${s.slice(0, n)}…` : s || "");

function setStatus({ connected, authenticated, subscribed, lastError }) {
  const dot = $("statusDot");
  const text = $("statusText");
  if (!connected) {
    dot.className = "dot err";
    text.textContent = `webhookrelay: disconnected${lastError ? ` (${lastError})` : ""}`;
    return;
  }
  if (!authenticated) {
    dot.className = "dot warn";
    text.textContent = "webhookrelay: connecting…";
    return;
  }
  if (!subscribed) {
    dot.className = "dot warn";
    text.textContent = "webhookrelay: subscribing…";
    return;
  }
  dot.className = "dot ok";
  text.textContent = "webhookrelay: connected & subscribed";
}

function renderFlavors({ flavors, state }) {
  const tbody = document.querySelector("#flavors tbody");
  tbody.innerHTML = "";
  if (!flavors.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="empty">No flavors configured</td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const f of flavors) {
    const fs = (state.flavors || {})[f.id] || {};
    const tr = document.createElement("tr");
    const latestUrl = `${window.location.origin}${publicApiBase}/latest.json?flavor=${encodeURIComponent(f.id)}`;
    tr.innerHTML = `
      <td><code>${f.id}</code></td>
      <td><code>${f.filename_pattern}</code></td>
      <td>${fs.file ? `<code>${fs.file}</code>` : '<span class="empty">—</span>'}</td>
      <td class="sha mono">${fs.sha256 ? truncate(fs.sha256, 16) : "—"}</td>
      <td>${fmtDate(fs.downloadedAt)}</td>
      <td>
        <button class="copy-btn" data-copy="${latestUrl}" type="button">Copy URL</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function loadState() {
  try {
    const res = await fetch(apiBase + "/state", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setStatus(data.webhookrelay || {});
    $("versionCode").textContent = data.state?.versionCode ?? "—";
    $("versionName").textContent = data.state?.versionName ?? "—";
    $("lastEvent").textContent = fmtDate(data.state?.lastEventAt);
    renderFlavors({ flavors: data.flavors || [], state: data.state || {} });
  } catch (err) {
    $("statusText").textContent = `Error: ${err.message}`;
    $("statusDot").className = "dot err";
  }
}

async function reconnect() {
  try {
    await fetch(apiBase + "/refresh", { method: "POST" });
    setTimeout(loadState, 750);
  } catch (err) {
    alert(`Reconnect failed: ${err.message}`);
  }
}

document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.matches("[data-copy]")) {
    const v = t.getAttribute("data-copy");
    navigator.clipboard?.writeText(v).then(() => {
      const orig = t.textContent;
      t.textContent = "Copied!";
      setTimeout(() => (t.textContent = orig), 1200);
    });
  }
});

$("refreshBtn").addEventListener("click", loadState);
$("reconnectBtn").addEventListener("click", reconnect);

loadState();
setInterval(loadState, 10_000);
