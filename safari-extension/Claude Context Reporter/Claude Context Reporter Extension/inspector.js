// Deep Inspection Mode - Standalone Session Recording UI
// Works via message passing to content script (Safari and Chrome compatible)

"use strict";

// State
let isRecording = false;
let sessionData = null;
let durationInterval = null;
let statusPollInterval = null;
let startTime = null;
let timelineEvents = [];
let selectedTabId = null;

// DOM Elements
const tabSelect = document.getElementById("tab-select");
const tabRefreshBtn = document.getElementById("tab-refresh-btn");
const errorMessage = document.getElementById("error-message");
const recordingStatus = document.getElementById("recording-status");
const recordingDuration = document.getElementById("recording-duration");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const snapshotBtn = document.getElementById("snapshot-btn");
const statInteractions = document.getElementById("stat-interactions");
const statConsole = document.getElementById("stat-console");
const statNetwork = document.getElementById("stat-network");
const statSnapshots = document.getElementById("stat-snapshots");
const timeline = document.getElementById("timeline");
const timelineBadge = document.getElementById("timeline-badge");
const commentInput = document.getElementById("comment-input");
const exportMdBtn = document.getElementById("export-md-btn");
const copyBtn = document.getElementById("copy-btn");
const feedback = document.getElementById("feedback");
const snapshotDialog = document.getElementById("snapshot-dialog");
const snapshotForm = document.getElementById("snapshot-form");
const snapshotLabelInput = document.getElementById("snapshot-label");
const snapshotCancel = document.getElementById("snapshot-cancel");

// Load available tabs
async function loadTabs() {
  try {
    const tabs = await browser.tabs.query({ currentWindow: true });

    // Filter out extension pages and this inspector tab
    const targetTabs = tabs.filter(tab => {
      if (!tab.url) return false;
      if (tab.url.startsWith("safari-web-extension://")) return false;
      if (tab.url.startsWith("chrome-extension://")) return false;
      if (tab.url.startsWith("about:")) return false;
      if (tab.url.startsWith("chrome://")) return false;
      return true;
    });

    tabSelect.innerHTML = "";

    if (targetTabs.length === 0) {
      tabSelect.innerHTML = '<option value="">No available tabs</option>';
      startBtn.disabled = true;
      return;
    }

    targetTabs.forEach(tab => {
      const option = document.createElement("option");
      option.value = tab.id;
      option.textContent = truncate(tab.title || tab.url, 60);
      option.title = tab.url;
      tabSelect.appendChild(option);
    });

    // Select first tab by default
    if (targetTabs.length > 0) {
      selectedTabId = targetTabs[0].id;
      tabSelect.value = selectedTabId;
      startBtn.disabled = false;
    }

    hideError();
  } catch (error) {
    console.error("Failed to load tabs:", error);
    showError("Failed to load tabs: " + error.message);
  }
}

// Send message to content script in target tab
async function sendToTab(action, data = {}) {
  if (!selectedTabId) {
    throw new Error("No tab selected");
  }

  try {
    const response = await browser.tabs.sendMessage(selectedTabId, {
      action: action,
      ...data
    });
    return response;
  } catch (error) {
    console.error("Failed to send message to tab:", error);
    throw error;
  }
}

// Start recording session
async function startRecording() {
  if (!selectedTabId) {
    showError("Please select a tab first");
    return;
  }

  try {
    hideError();

    // Tell content script to inject and start session
    const response = await sendToTab("startSession");

    if (!response || !response.success) {
      throw new Error(response?.error || "Failed to start session");
    }

    isRecording = true;
    startTime = Date.now();
    timelineEvents = [];
    sessionData = null;

    updateUI();
    startDurationTimer();
    startStatusPolling();

    addTimelineEvent("start", "Recording Started", "Session: " + response.sessionId);
    showFeedback("Recording started", true);
  } catch (error) {
    console.error("Failed to start recording:", error);
    showError("Failed to start recording. Make sure the page is fully loaded and refresh the tab list.");
    showFeedback("Failed to start recording", false);
  }
}

// Stop recording session
async function stopRecording() {
  try {
    const response = await sendToTab("stopSession");

    if (response && response.success) {
      sessionData = response.session;

      // Get current URL and title
      const tab = await browser.tabs.get(selectedTabId);
      if (sessionData) {
        sessionData.url = tab.url;
        sessionData.title = tab.title;
      }
    }

    isRecording = false;
    stopDurationTimer();
    stopStatusPolling();

    addTimelineEvent("stop", "Recording Stopped", "Duration: " + formatDuration(sessionData?.duration || 0));
    updateUI();
    showFeedback("Recording stopped - ready to export", true);
  } catch (error) {
    console.error("Failed to stop recording:", error);
    isRecording = false;
    stopDurationTimer();
    stopStatusPolling();
    updateUI();
    showFeedback("Recording stopped with errors", false);
  }
}

// Take a snapshot
async function takeSnapshot(label) {
  if (!isRecording) return;

  try {
    const response = await sendToTab("takeSnapshot", { label: label || null });

    if (response && response.success && response.snapshot) {
      const snapshot = response.snapshot;
      addTimelineEvent("snapshot", "Snapshot: " + snapshot.label,
        "localStorage: " + Object.keys(snapshot.localStorage || {}).length + " keys");
    }
    showFeedback("Snapshot taken", true);
  } catch (error) {
    console.error("Failed to take snapshot:", error);
    showFeedback("Failed to take snapshot", false);
  }
}

// Poll session status for live updates
async function pollStatus() {
  if (!isRecording) return;

  try {
    const response = await sendToTab("getSessionStatus");

    if (response && response.success && response.status) {
      const status = response.status;
      statInteractions.textContent = status.interactionCount || 0;
      statConsole.textContent = status.consoleCount || 0;
      statNetwork.textContent = status.networkCount || 0;
      statSnapshots.textContent = status.snapshotCount || 0;
    }
  } catch (error) {
    // Ignore polling errors
  }
}

// Start duration timer
function startDurationTimer() {
  updateDuration();
  durationInterval = setInterval(updateDuration, 1000);
}

// Stop duration timer
function stopDurationTimer() {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
}

// Start status polling
function startStatusPolling() {
  pollStatus();
  statusPollInterval = setInterval(pollStatus, 1000);
}

// Stop status polling
function stopStatusPolling() {
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }
}

// Update duration display
function updateDuration() {
  if (!startTime) return;
  const elapsed = Date.now() - startTime;
  recordingDuration.textContent = formatDurationShort(elapsed);
}

// Format duration in MM:SS
function formatDurationShort(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

// Format duration for display
function formatDuration(ms) {
  if (ms < 1000) return ms + "ms";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + "s";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes + "m " + secs + "s";
}

// Update UI based on state
function updateUI() {
  // Recording status
  if (isRecording) {
    recordingStatus.classList.add("active");
    recordingStatus.querySelector(".recording-text").textContent = "Recording...";
    startBtn.disabled = true;
    stopBtn.disabled = false;
    snapshotBtn.disabled = false;
    tabSelect.disabled = true;
    tabRefreshBtn.disabled = true;
  } else {
    recordingStatus.classList.remove("active");
    recordingStatus.querySelector(".recording-text").textContent = sessionData ? "Session Captured" : "Not Recording";
    startBtn.disabled = !selectedTabId;
    stopBtn.disabled = true;
    snapshotBtn.disabled = true;
    tabSelect.disabled = false;
    tabRefreshBtn.disabled = false;
  }

  // Export buttons
  const hasSession = sessionData !== null;
  exportMdBtn.disabled = !hasSession;
  copyBtn.disabled = !hasSession;

  // Update stats from session data if stopped
  if (!isRecording && sessionData) {
    statInteractions.textContent = sessionData.interactions?.length || 0;
    statConsole.textContent = sessionData.consoleLog?.length || 0;
    statNetwork.textContent = sessionData.networkLog?.length || 0;
    statSnapshots.textContent = sessionData.snapshots?.length || 0;
  }
}

// Add event to timeline
function addTimelineEvent(type, label, detail) {
  const time = startTime ? Date.now() - startTime : 0;
  timelineEvents.push({ type, label, detail, time });
  renderTimeline();
}

// Render timeline
function renderTimeline() {
  if (timelineEvents.length === 0) {
    timeline.innerHTML = '<div class="timeline-empty">Select a tab and start recording to capture events</div>';
    timelineBadge.textContent = "0 events";
    return;
  }

  timelineBadge.textContent = timelineEvents.length + " events";

  timeline.innerHTML = timelineEvents.map(event => {
    const timeStr = formatDurationShort(event.time);
    const icon = getEventIcon(event.type);
    return `
      <div class="timeline-entry">
        <span class="timeline-time">${timeStr}</span>
        <svg class="timeline-icon ${event.type}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${icon}
        </svg>
        <div class="timeline-content">
          <div class="timeline-label">${escapeHtml(event.label)}</div>
          ${event.detail ? `<div class="timeline-detail">${escapeHtml(event.detail)}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");

  // Scroll to bottom
  timeline.scrollTop = timeline.scrollHeight;
}

// Get icon SVG for event type
function getEventIcon(type) {
  switch (type) {
    case "start":
      return '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>';
    case "stop":
      return '<rect x="6" y="6" width="12" height="12" rx="2"/>';
    case "click":
      return '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>';
    case "input":
      return '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="12" y2="15"/>';
    case "scroll":
      return '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>';
    case "navigation":
      return '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>';
    case "error":
      return '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
    case "network":
      return '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>';
    case "snapshot":
      return '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>';
    default:
      return '<circle cx="12" cy="12" r="10"/>';
  }
}

// Generate session Markdown
function generateSessionMarkdown(session, comment) {
  const lines = [
    "# Deep Inspection Session Report",
    "",
    `**URL:** ${session.url || "Unknown"}`,
    `**Title:** ${escapeMarkdown(session.title || "Untitled")}`,
    `**Duration:** ${formatDuration(session.duration || 0)}`,
    `**Recorded:** ${new Date(session.startTime).toLocaleString()}`,
    ""
  ];

  if (comment) {
    lines.push("## Session Notes");
    lines.push("");
    lines.push(comment);
    lines.push("");
  }

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Interactions:** ${session.interactions?.length || 0}`);
  lines.push(`- **Console Entries:** ${session.consoleLog?.length || 0}`);
  lines.push(`- **Network Requests:** ${session.networkLog?.length || 0}`);
  lines.push(`- **Snapshots:** ${session.snapshots?.length || 0}`);
  lines.push("");

  // Console Log
  if (session.consoleLog && session.consoleLog.length > 0) {
    lines.push("## Console Log");
    lines.push("");

    const errors = session.consoleLog.filter(e => e.type === "error");
    const warnings = session.consoleLog.filter(e => e.type === "warn");

    if (errors.length > 0) {
      lines.push("### Errors");
      lines.push("");
      errors.slice(0, 20).forEach(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        lines.push("```");
        lines.push(`[${time}] ${entry.message}`);
        if (entry.stack) {
          lines.push("");
          lines.push(entry.stack.split("\n").slice(0, 5).join("\n"));
        }
        lines.push("```");
        lines.push("");
      });
    }

    if (warnings.length > 0) {
      lines.push("### Warnings");
      lines.push("");
      warnings.slice(0, 10).forEach(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        lines.push("```");
        lines.push(`[${time}] ${entry.message}`);
        lines.push("```");
        lines.push("");
      });
    }
  }

  // Network Requests
  if (session.networkLog && session.networkLog.length > 0) {
    lines.push("## Network Activity");
    lines.push("");
    lines.push("| Time | Method | URL | Status | Duration |");
    lines.push("|------|--------|-----|--------|----------|");

    session.networkLog.slice(0, 30).forEach(req => {
      const time = new Date(req.timestamp).toLocaleTimeString();
      let url = req.url || "";
      if (url.length > 50) {
        url = url.substring(0, 47) + "...";
      }
      const status = req.failed ? `**${req.status || 0}**` : String(req.status || 0);
      const duration = req.duration ? `${req.duration}ms` : "-";
      lines.push(`| ${time} | ${req.method || "GET"} | \`${url}\` | ${status} | ${duration} |`);
    });
    lines.push("");

    // Failed requests detail
    const failed = session.networkLog.filter(r => r.failed);
    if (failed.length > 0) {
      lines.push("### Failed Requests");
      lines.push("");
      failed.slice(0, 10).forEach(req => {
        lines.push(`- **${req.method} ${req.url}** - Status ${req.status || 0}`);
        if (req.error) {
          lines.push(`  - Error: ${req.error}`);
        }
      });
      lines.push("");
    }
  }

  // Interactions
  if (session.interactions && session.interactions.length > 0) {
    lines.push("## User Interactions");
    lines.push("");
    lines.push("| Time | Type | Target |");
    lines.push("|------|------|--------|");

    session.interactions.slice(0, 50).forEach(int => {
      const time = new Date(int.timestamp).toLocaleTimeString();
      let target = int.target || "";
      if (target.length > 60) {
        target = target.substring(0, 57) + "...";
      }
      lines.push(`| ${time} | ${int.type} | \`${target}\` |`);
    });
    lines.push("");
  }

  // Snapshots
  if (session.snapshots && session.snapshots.length > 0) {
    lines.push("## Snapshots");
    lines.push("");

    session.snapshots.forEach((snapshot, i) => {
      const time = new Date(snapshot.timestamp).toLocaleTimeString();
      lines.push(`### ${snapshot.label || "Snapshot " + (i + 1)} (${time})`);
      lines.push("");
      lines.push(`**URL:** ${snapshot.url || "N/A"}`);
      lines.push("");

      if (snapshot.localStorage && Object.keys(snapshot.localStorage).length > 0) {
        lines.push("**localStorage:**");
        lines.push("```json");
        lines.push(JSON.stringify(snapshot.localStorage, null, 2));
        lines.push("```");
        lines.push("");
      }

      if (snapshot.sessionStorage && Object.keys(snapshot.sessionStorage).length > 0) {
        lines.push("**sessionStorage:**");
        lines.push("```json");
        lines.push(JSON.stringify(snapshot.sessionStorage, null, 2));
        lines.push("```");
        lines.push("");
      }
    });
  }

  return lines.join("\n");
}

// Export session as Markdown file
async function exportSession() {
  if (!sessionData) return;

  const comment = commentInput.value.trim();
  const markdown = generateSessionMarkdown(sessionData, comment);

  try {
    // Generate filename
    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    const filename = `ai-agent-reports/session-${date}-${time}.md`;

    // Create blob and download
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    await browser.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: "uniquify"
    });

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showFeedback("Session exported to Downloads!", true);
  } catch (error) {
    console.error("Export failed:", error);
    showFeedback("Failed to export session", false);
  }
}

// Copy session to clipboard
async function copySession() {
  if (!sessionData) return;

  const comment = commentInput.value.trim();
  const markdown = generateSessionMarkdown(sessionData, comment);

  try {
    await navigator.clipboard.writeText(markdown);
    showFeedback("Copied to clipboard!", true);
  } catch (error) {
    console.error("Copy failed:", error);
    showFeedback("Failed to copy", false);
  }
}

// Show feedback message
function showFeedback(message, isSuccess) {
  feedback.textContent = message;
  feedback.classList.remove("success", "error");
  feedback.classList.add(isSuccess ? "success" : "error");
  setTimeout(() => {
    feedback.textContent = "";
    feedback.classList.remove("success", "error");
  }, 3000);
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}

// Hide error message
function hideError() {
  errorMessage.style.display = "none";
}

// Truncate string
function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str || "";
  return str.substring(0, maxLength) + "...";
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Escape markdown special characters
function escapeMarkdown(str) {
  if (!str) return "";
  return str.replace(/[*_`\[\]]/g, "\\$&");
}

// Open snapshot dialog
function openSnapshotDialog() {
  snapshotLabelInput.value = "";
  snapshotDialog.showModal();
}

// Event Listeners
tabSelect.addEventListener("change", (e) => {
  selectedTabId = parseInt(e.target.value, 10) || null;
  startBtn.disabled = !selectedTabId;
});

tabRefreshBtn.addEventListener("click", loadTabs);

startBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);
snapshotBtn.addEventListener("click", openSnapshotDialog);

snapshotForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const label = snapshotLabelInput.value.trim();
  snapshotDialog.close();
  takeSnapshot(label);
});

snapshotCancel.addEventListener("click", () => {
  snapshotDialog.close();
});

exportMdBtn.addEventListener("click", exportSession);
copyBtn.addEventListener("click", copySession);

// Initialize
loadTabs();
updateUI();
