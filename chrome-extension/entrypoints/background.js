/**
 * Background Script - Message Bridge and Storage Handler
 *
 * Handles context menu, report saving, and file export operations.
 */

import {
  STORAGE_KEY_REPORTS,
  STORAGE_KEY_SETTINGS,
  BASE_EXPORT_FOLDER
} from '../lib/constants.js';
import { formatReportAsMarkdown } from '../lib/markdown-formatter.js';

export default defineBackground(() => {
  const STORAGE_KEY = STORAGE_KEY_REPORTS;
  const SETTINGS_KEY = STORAGE_KEY_SETTINGS;

  // Get project mappings from storage
  async function getProjectMappings() {
    var result = await chrome.storage.local.get([SETTINGS_KEY]);
    return (result[SETTINGS_KEY] && result[SETTINGS_KEY].projectMappings) || [];
  }

  // Match URL against project mappings
  function matchUrlToProject(url, mappings) {
    if (!url || mappings.length === 0) return null;

    var parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return null;
    }

    var urlHost = parsedUrl.host;
    var urlHostname = parsedUrl.hostname;

    for (var i = 0; i < mappings.length; i++) {
      var mapping = mappings[i];
      for (var j = 0; j < mapping.patterns.length; j++) {
        var pattern = mapping.patterns[j].trim().toLowerCase();
        if (!pattern) continue;

        if (pattern.startsWith('*.')) {
          var suffix = pattern.slice(2);
          if (urlHostname.toLowerCase() === suffix || urlHostname.toLowerCase().endsWith('.' + suffix)) {
            return mapping;
          }
        } else if (pattern.endsWith(':*')) {
          var prefix = pattern.slice(0, -2);
          if (urlHostname.toLowerCase() === prefix) {
            return mapping;
          }
        } else {
          if (urlHost.toLowerCase() === pattern || urlHostname.toLowerCase() === pattern) {
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
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'default';
  }

  // Get domain-based folder from URL
  function getDomainFolder(url) {
    try {
      var parsedUrl = new URL(url);
      return sanitizeFolderName(parsedUrl.host);
    } catch (e) {
      return 'unknown';
    }
  }

  // Get export folder for a URL (with project matching)
  async function getExportFolder(url) {
    var mappings = await getProjectMappings();
    var matchedProject = matchUrlToProject(url, mappings);

    if (matchedProject) {
      return {
        folder: BASE_EXPORT_FOLDER + '/' + sanitizeFolderName(matchedProject.folder),
        projectName: matchedProject.name
      };
    }

    var domainFolder = getDomainFolder(url);
    return {
      folder: BASE_EXPORT_FOLDER + '/' + domainFolder,
      projectName: null
    };
  }

  // Create context menu item
  chrome.runtime.onInstalled.addListener(function() {
    chrome.contextMenus.create({
      id: 'capture-element',
      title: 'AI Context Capture',
      contexts: ['all']
    });
  });

  // Handle context menu click
  chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === 'capture-element' && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'START_PICKER' }).catch(function() {
        // Content script not loaded
      });
    }
  });

  // Get all reports from storage
  async function getReports() {
    var result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || [];
  }

  // Save a report to storage
  async function saveReport(report) {
    var reports = await getReports();
    reports.push(report);
    await chrome.storage.local.set({ [STORAGE_KEY]: reports });
    return reports;
  }

  // Generate smart filename from report
  function generateFilename(report) {
    var parts = [];

    // Date prefix for sorting
    var date = new Date().toISOString().slice(0, 10);
    parts.push(date);

    // Time for uniqueness
    var time = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    parts.push(time);

    // Hostname from URL
    try {
      var hostname = new URL(report.url).hostname
        .replace(/^www\./, '')
        .replace(/[^a-z0-9]/gi, '-')
        .slice(0, 30);
      parts.push(hostname);
    } catch (e) {
      parts.push('unknown');
    }

    // Element identifier
    var element = (report.element && report.element.tagName) || 'element';
    var id = (report.element && report.element.elementId)
      ? '-' + report.element.elementId.replace(/[^a-z0-9]/gi, '-').slice(0, 20)
      : '';
    parts.push(element + id);

    return parts.join('-') + '.md';
  }

  // Export a single report to file
  async function exportReportToFile(report) {
    var exportInfo = await getExportFolder(report.url);
    var markdown = formatReportAsMarkdown(report, exportInfo.projectName);
    var filename = generateFilename(report);
    var filepath = exportInfo.folder + '/' + filename;

    // Use data URL for service worker compatibility
    var dataUrl = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(markdown)));

    return new Promise(function(resolve, reject) {
      chrome.downloads.download({
        url: dataUrl,
        filename: filepath,
        saveAs: false,
        conflictAction: 'uniquify'
      }, function(downloadId) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({ downloadId: downloadId, folder: exportInfo.folder, projectName: exportInfo.projectName });
        }
      });
    });
  }

  // Export all reports to files
  async function exportAllReports() {
    var reports = await getReports();
    var results = [];

    for (var i = 0; i < reports.length; i++) {
      try {
        await exportReportToFile(reports[i]);
        results.push({ success: true });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    return results;
  }

  // Handle messages from content scripts and devtools
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === 'SAVE_REPORT') {
      // Save report and export to file
      saveReport(message.report)
        .then(function() {
          return exportReportToFile(message.report);
        })
        .then(function(result) {
          sendResponse({ success: true, folder: result.folder, projectName: result.projectName });
        })
        .catch(function(error) {
          console.error('Failed to save report:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response
    }

    if (message.type === 'EXPORT_REPORT') {
      exportReportToFile(message.report)
        .then(function(result) {
          sendResponse({ success: true, folder: result.folder, projectName: result.projectName });
        })
        .catch(function(error) {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.type === 'EXPORT_ALL_REPORTS') {
      exportAllReports()
        .then(function(results) {
          sendResponse({ success: true, results: results });
        })
        .catch(function(error) {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.type === 'GET_PROJECT_MAPPINGS') {
      getProjectMappings()
        .then(function(mappings) {
          sendResponse({ success: true, mappings: mappings });
        })
        .catch(function(error) {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.type === 'SAVE_PROJECT_MAPPINGS') {
      chrome.storage.local.get([SETTINGS_KEY])
        .then(function(result) {
          var settings = result[SETTINGS_KEY] || {};
          settings.projectMappings = message.mappings;
          return chrome.storage.local.set({ [SETTINGS_KEY]: settings });
        })
        .then(function() {
          sendResponse({ success: true });
        })
        .catch(function(error) {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.type === 'GET_EXPORT_FOLDER') {
      getExportFolder(message.url)
        .then(function(result) {
          sendResponse({ success: true, folder: result.folder, projectName: result.projectName });
        })
        .catch(function(error) {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.type === 'SHOW_MODAL_IN_TAB') {
      // Forward to content script in the specified tab
      chrome.tabs.sendMessage(message.tabId, {
        type: 'SHOW_MODAL',
        elementData: message.elementData
      }).then(function(response) {
        sendResponse(response);
      }).catch(function() {
        // Content script not loaded - page needs refresh
        sendResponse({ success: false, error: 'Content script not loaded' });
      });
      return true; // Keep channel open for async response
    }

    // Phase 3: Deep Inspection Session Export
    if (message.type === 'EXPORT_SESSION') {
      exportSessionToFile(message.session, message.markdown, message.comment)
        .then(function(result) {
          sendResponse({ success: true, folder: result.folder, projectName: result.projectName });
        })
        .catch(function(error) {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
  });

  // Generate filename for session export
  function generateSessionFilename(session) {
    var parts = [];

    // Date prefix for sorting
    var date = new Date(session.startTime).toISOString().slice(0, 10);
    parts.push(date);

    // Time for uniqueness
    var time = new Date(session.startTime).toISOString().slice(11, 19).replace(/:/g, '');
    parts.push(time);

    // Hostname from URL
    try {
      var hostname = new URL(session.url).hostname
        .replace(/^www\./, '')
        .replace(/[^a-z0-9]/gi, '-')
        .slice(0, 30);
      parts.push(hostname);
    } catch (e) {
      parts.push('unknown');
    }

    parts.push('session');

    return parts.join('-') + '.md';
  }

  // Export a session to file
  async function exportSessionToFile(session, markdown, comment) {
    var exportInfo = await getExportFolder(session.url);
    var filename = generateSessionFilename(session);
    var filepath = exportInfo.folder + '/sessions/' + filename;

    // Use data URL for service worker compatibility
    var dataUrl = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(markdown)));

    return new Promise(function(resolve, reject) {
      chrome.downloads.download({
        url: dataUrl,
        filename: filepath,
        saveAs: false,
        conflictAction: 'uniquify'
      }, function(downloadId) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({ downloadId: downloadId, folder: exportInfo.folder, projectName: exportInfo.projectName });
        }
      });
    });
  }
});
