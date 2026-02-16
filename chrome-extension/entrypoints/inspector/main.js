// Deep Inspection Mode - Session Recording UI
import {
  getSessionRecorderInjectorCode,
  getStartSessionCode,
  getStopSessionCode,
  getTakeSnapshotCode,
  getSessionStatusCode
} from '../../lib/session-recorder.js';
import { getInteractionRecorderInjectorCode } from '../../lib/interaction-recorder.js';
import { formatSessionAsMarkdown } from '../../lib/markdown-formatter.js';

// State
let isRecording = false;
let sessionData = null;
let durationInterval = null;
let statusPollInterval = null;
let startTime = null;
let timelineEvents = [];

// DOM Elements
const recordingStatus = document.getElementById('recording-status');
const recordingDuration = document.getElementById('recording-duration');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const snapshotBtn = document.getElementById('snapshot-btn');
const statInteractions = document.getElementById('stat-interactions');
const statConsole = document.getElementById('stat-console');
const statNetwork = document.getElementById('stat-network');
const statSnapshots = document.getElementById('stat-snapshots');
const timeline = document.getElementById('timeline');
const timelineBadge = document.getElementById('timeline-badge');
const commentInput = document.getElementById('comment-input');
const exportMdBtn = document.getElementById('export-md-btn');
const copyBtn = document.getElementById('copy-btn');
const feedback = document.getElementById('feedback');
const snapshotDialog = document.getElementById('snapshot-dialog');
const snapshotForm = document.getElementById('snapshot-form');
const snapshotLabel = document.getElementById('snapshot-label');
const snapshotCancel = document.getElementById('snapshot-cancel');

// Inject recording scripts into the page
async function injectRecordingScripts() {
  return new Promise((resolve) => {
    // First inject session recorder
    chrome.devtools.inspectedWindow.eval(
      getSessionRecorderInjectorCode(),
      (result, isException) => {
        if (isException) {
          console.error('Failed to inject session recorder');
        }
        // Then inject interaction recorder
        chrome.devtools.inspectedWindow.eval(
          getInteractionRecorderInjectorCode(),
          (result2, isException2) => {
            if (isException2) {
              console.error('Failed to inject interaction recorder');
            }
            resolve();
          }
        );
      }
    );
  });
}

// Execute code in inspected page and return result
function evalInPage(code) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(code, (result, isException) => {
      if (isException) {
        reject(new Error('Eval failed'));
      } else {
        resolve(result);
      }
    });
  });
}

// Start recording session
async function startRecording() {
  try {
    await injectRecordingScripts();

    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    await evalInPage(getStartSessionCode(sessionId));

    isRecording = true;
    startTime = Date.now();
    timelineEvents = [];
    sessionData = null;

    updateUI();
    startDurationTimer();
    startStatusPolling();

    addTimelineEvent('start', 'Recording Started', 'Session: ' + sessionId);
    showFeedback('Recording started', true);
  } catch (error) {
    console.error('Failed to start recording:', error);
    showFeedback('Failed to start recording', false);
  }
}

// Stop recording session
async function stopRecording() {
  try {
    sessionData = await evalInPage(getStopSessionCode());

    // Get current URL and title
    const pageInfo = await evalInPage(`({ url: location.href, title: document.title })`);
    if (sessionData) {
      sessionData.url = pageInfo.url;
      sessionData.title = pageInfo.title;
    }

    isRecording = false;
    stopDurationTimer();
    stopStatusPolling();

    addTimelineEvent('stop', 'Recording Stopped', 'Duration: ' + formatDuration(sessionData?.duration || 0));
    updateUI();
    showFeedback('Recording stopped - ready to export', true);
  } catch (error) {
    console.error('Failed to stop recording:', error);
    isRecording = false;
    stopDurationTimer();
    stopStatusPolling();
    updateUI();
    showFeedback('Recording stopped with errors', false);
  }
}

// Take a snapshot
async function takeSnapshot(label) {
  if (!isRecording) return;

  try {
    const snapshot = await evalInPage(getTakeSnapshotCode(label || null));
    if (snapshot) {
      addTimelineEvent('snapshot', 'Snapshot: ' + snapshot.label, 'localStorage: ' + Object.keys(snapshot.localStorage || {}).length + ' keys');
    }
    showFeedback('Snapshot taken', true);
  } catch (error) {
    console.error('Failed to take snapshot:', error);
    showFeedback('Failed to take snapshot', false);
  }
}

// Poll session status for live updates
async function pollStatus() {
  if (!isRecording) return;

  try {
    const status = await evalInPage(getSessionStatusCode());
    if (status) {
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

// Format duration in HH:MM:SS
function formatDurationShort(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

// Format duration for display
function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes + 'm ' + secs + 's';
}

// Update UI based on state
function updateUI() {
  // Recording status
  if (isRecording) {
    recordingStatus.classList.add('active');
    recordingStatus.querySelector('.recording-text').textContent = 'Recording...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    snapshotBtn.disabled = false;
  } else {
    recordingStatus.classList.remove('active');
    recordingStatus.querySelector('.recording-text').textContent = sessionData ? 'Session Captured' : 'Not Recording';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    snapshotBtn.disabled = true;
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
    timeline.innerHTML = '<div class="timeline-empty">Start recording to capture events</div>';
    timelineBadge.textContent = '0 events';
    return;
  }

  timelineBadge.textContent = timelineEvents.length + ' events';

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
          ${event.detail ? `<div class="timeline-detail">${escapeHtml(event.detail)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  timeline.scrollTop = timeline.scrollHeight;
}

// Get icon SVG for event type
function getEventIcon(type) {
  switch (type) {
    case 'start':
      return '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>';
    case 'stop':
      return '<rect x="6" y="6" width="12" height="12" rx="2"/>';
    case 'click':
      return '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>';
    case 'input':
      return '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="12" y2="15"/>';
    case 'scroll':
      return '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>';
    case 'navigation':
      return '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>';
    case 'error':
      return '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
    case 'network':
      return '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>';
    case 'snapshot':
      return '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>';
    default:
      return '<circle cx="12" cy="12" r="10"/>';
  }
}

// Export session as Markdown
async function exportSession() {
  if (!sessionData) return;

  const comment = commentInput.value.trim();
  const markdown = formatSessionAsMarkdown(sessionData, comment);

  try {
    // Send to background for file export
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'EXPORT_SESSION',
        session: sessionData,
        markdown: markdown,
        comment: comment
      }, (resp) => {
        if (resp && resp.success) {
          resolve(resp);
        } else {
          reject(new Error(resp?.error || 'Export failed'));
        }
      });
    });

    showFeedback('Session exported!', true);
  } catch (error) {
    console.error('Export failed:', error);
    showFeedback('Failed to export session', false);
  }
}

// Copy session to clipboard
async function copySession() {
  if (!sessionData) return;

  const comment = commentInput.value.trim();
  const markdown = formatSessionAsMarkdown(sessionData, comment);

  try {
    await navigator.clipboard.writeText(markdown);
    showFeedback('Copied to clipboard!', true);
  } catch (error) {
    console.error('Copy failed:', error);
    showFeedback('Failed to copy', false);
  }
}

// Show feedback message
function showFeedback(message, isSuccess) {
  feedback.textContent = message;
  feedback.classList.remove('success', 'error');
  feedback.classList.add(isSuccess ? 'success' : 'error');
  setTimeout(() => {
    feedback.textContent = '';
    feedback.classList.remove('success', 'error');
  }, 3000);
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Open snapshot dialog
function openSnapshotDialog() {
  snapshotLabel.value = '';
  snapshotDialog.showModal();
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
snapshotBtn.addEventListener('click', openSnapshotDialog);

snapshotForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const label = snapshotLabel.value.trim();
  snapshotDialog.close();
  takeSnapshot(label);
});

snapshotCancel.addEventListener('click', () => {
  snapshotDialog.close();
});

exportMdBtn.addEventListener('click', exportSession);
copyBtn.addEventListener('click', copySession);

// Initialize
updateUI();
