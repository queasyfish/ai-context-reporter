// Claude Context Reporter - Background Service Worker
// Handles context menu, storage, and message routing

"use strict";

// Constants
const STORAGE_KEY = "reports";
const SETTINGS_KEY = "settings";
const MAX_REPORTS = 500; // Prevent unbounded storage growth
const CONTEXT_MENU_ID = "capture-for-ai";
const BASE_EXPORT_FOLDER = "ai-agent-reports";

// Valid message actions
const VALID_ACTIONS = new Set([
  "saveReport",
  "getReports",
  "deleteReport",
  "clearAllReports",
  "exportReports",
  "getProjectMappings",
  "saveProjectMappings",
  "getExportFolder"
]);

// Create context menu on install
browser.runtime.onInstalled.addListener(() => {
  // Remove existing menu items first to avoid duplicates
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Capture for AI Context",
      contexts: ["all"]
    });
  }).catch(err => {
    console.error("Failed to create context menu:", err);
  });
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  if (!tab?.id) {
    console.warn("No valid tab for context menu action");
    return;
  }

  try {
    await browser.tabs.sendMessage(tab.id, { action: "startPicker" });
  } catch (error) {
    // Content script may not be loaded yet - this is expected on some pages
    console.warn("Could not send message to tab:", error.message);
  }
});

// Handle messages from content script and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate message structure
  if (!message || typeof message !== "object") {
    sendResponse({ success: false, error: "Invalid message format" });
    return true;
  }

  const { action } = message;

  // Validate action
  if (!action || !VALID_ACTIONS.has(action)) {
    sendResponse({ success: false, error: `Unknown action: ${action}` });
    return true;
  }

  // Route to appropriate handler
  const handlers = {
    saveReport: () => saveReport(message.report),
    getReports: () => getReports(),
    deleteReport: () => deleteReport(message.id),
    clearAllReports: () => clearAllReports(),
    exportReports: () => exportReports(),
    getProjectMappings: () => getProjectMappings(),
    saveProjectMappings: () => saveProjectMappings(message.mappings),
    getExportFolder: () => getExportFolder(message.url)
  };

  handlers[action]()
    .then(sendResponse)
    .catch(error => {
      console.error(`Error handling ${action}:`, error);
      sendResponse({ success: false, error: error.message });
    });

  return true; // Keep message channel open for async response
});

// Validate report structure
function validateReport(report) {
  if (!report || typeof report !== "object") {
    throw new Error("Invalid report: must be an object");
  }

  // Required fields
  const requiredFields = ["tagName", "pageUrl"];
  for (const field of requiredFields) {
    if (!report[field]) {
      throw new Error(`Invalid report: missing ${field}`);
    }
  }

  // Sanitize string fields to prevent storage bloat
  const maxLengths = {
    selector: 1000,
    xpath: 1000,
    tagName: 50,
    id: 200,
    className: 500,
    textContent: 500,
    innerHTML: 1000,
    comment: 2000,
    pageUrl: 2000,
    pageTitle: 500
  };

  const sanitized = { ...report };
  for (const [field, maxLen] of Object.entries(maxLengths)) {
    if (typeof sanitized[field] === "string" && sanitized[field].length > maxLen) {
      sanitized[field] = sanitized[field].substring(0, maxLen) + "…";
    }
  }

  return sanitized;
}

// Storage helpers with error handling and validation
async function saveReport(report) {
  try {
    // Validate and sanitize report
    const sanitizedReport = validateReport(report);

    const { [STORAGE_KEY]: reports = [] } = await browser.storage.local.get(STORAGE_KEY);

    const newReport = {
      ...sanitizedReport,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    // Add to beginning of array
    reports.unshift(newReport);

    // Trim old reports if over limit
    if (reports.length > MAX_REPORTS) {
      reports.length = MAX_REPORTS;
      console.info(`Trimmed reports to ${MAX_REPORTS} items`);
    }

    await browser.storage.local.set({ [STORAGE_KEY]: reports });
    return { success: true, report: newReport };
  } catch (error) {
    console.error("Failed to save report:", error);
    return { success: false, error: error.message };
  }
}

async function getReports() {
  try {
    const { [STORAGE_KEY]: reports = [] } = await browser.storage.local.get(STORAGE_KEY);

    // Ensure reports is an array
    if (!Array.isArray(reports)) {
      console.warn("Reports data corrupted, resetting");
      await browser.storage.local.set({ [STORAGE_KEY]: [] });
      return { success: true, reports: [] };
    }

    return { success: true, reports };
  } catch (error) {
    console.error("Failed to get reports:", error);
    return { success: false, error: error.message, reports: [] };
  }
}

async function deleteReport(id) {
  try {
    if (!id || typeof id !== "string") {
      throw new Error("Invalid report ID");
    }

    const { [STORAGE_KEY]: reports = [] } = await browser.storage.local.get(STORAGE_KEY);
    const initialLength = reports.length;
    const filtered = reports.filter(r => r.id !== id);

    if (filtered.length === initialLength) {
      return { success: false, error: "Report not found" };
    }

    await browser.storage.local.set({ [STORAGE_KEY]: filtered });
    return { success: true };
  } catch (error) {
    console.error("Failed to delete report:", error);
    return { success: false, error: error.message };
  }
}

async function clearAllReports() {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: [] });
    return { success: true };
  } catch (error) {
    console.error("Failed to clear reports:", error);
    return { success: false, error: error.message };
  }
}

async function exportReports() {
  try {
    const { [STORAGE_KEY]: reports = [] } = await browser.storage.local.get(STORAGE_KEY);

    // Ensure valid array
    if (!Array.isArray(reports)) {
      return { success: true, data: "[]" };
    }

    return {
      success: true,
      data: JSON.stringify(reports, null, 2),
      count: reports.length
    };
  } catch (error) {
    console.error("Failed to export reports:", error);
    return { success: false, error: error.message };
  }
}

// ============ Project Mappings ============

async function getProjectMappings() {
  try {
    const { [SETTINGS_KEY]: settings = {} } = await browser.storage.local.get(SETTINGS_KEY);
    return { success: true, mappings: settings.projectMappings || [] };
  } catch (error) {
    console.error("Failed to get project mappings:", error);
    return { success: false, error: error.message, mappings: [] };
  }
}

async function saveProjectMappings(mappings) {
  try {
    const { [SETTINGS_KEY]: settings = {} } = await browser.storage.local.get(SETTINGS_KEY);
    settings.projectMappings = mappings;
    await browser.storage.local.set({ [SETTINGS_KEY]: settings });
    return { success: true };
  } catch (error) {
    console.error("Failed to save project mappings:", error);
    return { success: false, error: error.message };
  }
}

// Match URL against project mappings
function matchUrlToProject(url, mappings) {
  if (!url || mappings.length === 0) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    return null;
  }

  const urlHost = parsedUrl.host;
  const urlHostname = parsedUrl.hostname;

  for (const mapping of mappings) {
    for (const pattern of mapping.patterns) {
      const trimmedPattern = pattern.trim().toLowerCase();
      if (!trimmedPattern) continue;

      if (trimmedPattern.startsWith("*.")) {
        const suffix = trimmedPattern.slice(2);
        if (urlHostname.toLowerCase() === suffix || urlHostname.toLowerCase().endsWith("." + suffix)) {
          return mapping;
        }
      } else if (trimmedPattern.endsWith(":*")) {
        const prefix = trimmedPattern.slice(0, -2);
        if (urlHostname.toLowerCase() === prefix) {
          return mapping;
        }
      } else {
        if (urlHost.toLowerCase() === trimmedPattern || urlHostname.toLowerCase() === trimmedPattern) {
          return mapping;
        }
      }
    }
  }
  return null;
}

// Sanitize folder name for filesystem
function sanitizeFolderName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "default";
}

// Get domain-based folder from URL
function getDomainFolder(url) {
  try {
    const parsedUrl = new URL(url);
    return sanitizeFolderName(parsedUrl.host);
  } catch (e) {
    return "unknown";
  }
}

// Get export folder for a URL
async function getExportFolder(url) {
  try {
    const { [SETTINGS_KEY]: settings = {} } = await browser.storage.local.get(SETTINGS_KEY);
    const mappings = settings.projectMappings || [];
    const matchedProject = matchUrlToProject(url, mappings);

    if (matchedProject) {
      return {
        success: true,
        folder: BASE_EXPORT_FOLDER + "/" + sanitizeFolderName(matchedProject.folder),
        projectName: matchedProject.name
      };
    }

    const domainFolder = getDomainFolder(url);
    return {
      success: true,
      folder: BASE_EXPORT_FOLDER + "/" + domainFolder,
      projectName: null
    };
  } catch (error) {
    console.error("Failed to get export folder:", error);
    return { success: false, error: error.message, folder: BASE_EXPORT_FOLDER, projectName: null };
  }
}

// Log startup
console.info("Claude Context Reporter background script loaded");
