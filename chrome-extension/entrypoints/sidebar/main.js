// Sidebar script - handles element selection display and capture
import { getElementCaptureCode } from '../../lib/element-capture.js';
import { getFrameworkDetectorCode } from '../../lib/framework-detector.js';
import { getConsoleLogReaderCode } from '../../lib/console-capture.js';
import { getNetworkLogReaderCode } from '../../lib/network-capture.js';
import { saveReport, getReports, deleteReport, clearReports, getProjectMappings, saveProjectMappings } from '../../lib/storage.ts';
import { formatReportAsMarkdown } from '../../lib/markdown-formatter.js';

// Constants
var BASE_EXPORT_FOLDER = 'ai-agent-reports';

// Project mappings cache
var projectMappingsCache = [];

// State variable to track currently selected element data
var currentElementData = null;

// Details expanded state
var detailsExpanded = false;

// Generate smart filename from report
function generateFilename(report) {
  var parts = [];
  var date = new Date().toISOString().slice(0, 10);
  parts.push(date);
  var time = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  parts.push(time);
  try {
    var hostname = new URL(report.url).hostname
      .replace(/^www\./, '')
      .replace(/[^a-z0-9]/gi, '-')
      .slice(0, 30);
    parts.push(hostname);
  } catch (e) {
    parts.push('unknown');
  }
  var element = (report.element && report.element.tagName) || 'element';
  var id = (report.element && report.element.elementId)
    ? '-' + report.element.elementId.replace(/[^a-z0-9]/gi, '-').slice(0, 20)
    : '';
  parts.push(element + id);
  return parts.join('-') + '.md';
}

// Export all reports to files
async function exportAllReports() {
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'EXPORT_ALL_REPORTS'
    }, function(response) {
      if (response && response.success) {
        resolve(response.results);
      } else {
        reject(new Error(response ? response.error : 'Export failed'));
      }
    });
  });
}

// Capture comprehensive element data via eval in inspected page context
function captureElementData() {
  return new Promise(function(resolve) {
    chrome.devtools.inspectedWindow.eval(
      getElementCaptureCode(),
      function(result, isException) {
        if (isException || !result) {
          resolve(null);
        } else {
          resolve(result);
        }
      }
    );
  });
}

// Capture framework and component info via eval in inspected page context
function captureFrameworkData() {
  return new Promise(function(resolve) {
    chrome.devtools.inspectedWindow.eval(
      getFrameworkDetectorCode(),
      function(result, isException) {
        if (isException || !result) {
          resolve(null);
        } else {
          resolve(result);
        }
      }
    );
  });
}

// Capture console errors via eval in inspected page context
function captureConsoleErrors() {
  return new Promise(function(resolve) {
    chrome.devtools.inspectedWindow.eval(
      getConsoleLogReaderCode(),
      function(result, isException) {
        if (isException || !result) {
          resolve([]);
        } else {
          resolve(result);
        }
      }
    );
  });
}

// Capture network requests via eval in inspected page context
function captureNetworkRequests() {
  return new Promise(function(resolve) {
    chrome.devtools.inspectedWindow.eval(
      getNetworkLogReaderCode(),
      function(result, isException) {
        if (isException || !result) {
          resolve([]);
        } else {
          resolve(result);
        }
      }
    );
  });
}

// Update display with captured element data
function updateDisplay() {
  // Capture all data in parallel
  Promise.all([
    captureElementData(),
    captureFrameworkData(),
    captureConsoleErrors(),
    captureNetworkRequests()
  ]).then(function(results) {
    var data = results[0];
    var frameworkData = results[1];
    var consoleErrors = results[2];
    var networkRequests = results[3];

    // Merge framework data into element data
    if (data && frameworkData) {
      data.framework = frameworkData.framework;
      data.component = frameworkData.component;
      data.dataAttributes = frameworkData.dataAttributes;
      data.eventListeners = frameworkData.eventListeners;
      data.developerContext = frameworkData.developerContext;
    }
    if (data) {
      data.consoleErrors = consoleErrors || [];
      data.networkRequests = networkRequests || [];
    }

    currentElementData = data;

    var placeholder = document.getElementById('element-placeholder');
    var elementInfo = document.getElementById('element-info');
    var elementTag = document.getElementById('element-tag');
    var elementIdentifiers = document.getElementById('element-identifiers');
    var elementUrl = document.getElementById('element-url');
    var selectorEl = document.getElementById('selector-value');
    var xpathEl = document.getElementById('xpath-value');
    var stylesEl = document.getElementById('styles-value');

    // Phase 1 elements
    var frameworkDetail = document.getElementById('framework-detail');
    var frameworkValue = document.getElementById('framework-value');
    var componentDetail = document.getElementById('component-detail');
    var componentValue = document.getElementById('component-value');
    var propsDetail = document.getElementById('props-detail');
    var propsValue = document.getElementById('props-value');
    var stateDetail = document.getElementById('state-detail');
    var stateValue = document.getElementById('state-value');
    var dataAttrsDetail = document.getElementById('data-attrs-detail');
    var dataAttrsValue = document.getElementById('data-attrs-value');
    var consoleErrorsDetail = document.getElementById('console-errors-detail');
    var consoleErrorsValue = document.getElementById('console-errors-value');
    var networkDetail = document.getElementById('network-detail');
    var networkValue = document.getElementById('network-value');

    if (!data) {
      placeholder.style.display = 'block';
      elementInfo.classList.remove('visible');
      selectorEl.textContent = '-';
      xpathEl.textContent = '-';
      stylesEl.textContent = '-';
      // Hide Phase 1 details
      frameworkDetail.style.display = 'none';
      componentDetail.style.display = 'none';
      propsDetail.style.display = 'none';
      stateDetail.style.display = 'none';
      dataAttrsDetail.style.display = 'none';
      consoleErrorsDetail.style.display = 'none';
      networkDetail.style.display = 'none';
      currentElementData = null;
      updateSaveButtonState();
      return;
    }

    // Show element info, hide placeholder
    placeholder.style.display = 'none';
    elementInfo.classList.add('visible');

    // Build tag display
    var tagName = data.tagName || 'element';
    elementTag.textContent = '<' + tagName + '>';

    // Build identifiers display
    var identifiers = [];
    if (data.elementId) {
      identifiers.push('<span class="element-id">#' + escapeHtml(data.elementId) + '</span>');
    }
    if (data.className) {
      var classes = data.className.split(' ').filter(function(c) { return c; }).slice(0, 3);
      classes.forEach(function(c) {
        identifiers.push('<span class="element-class">.' + escapeHtml(c) + '</span>');
      });
    }
    elementIdentifiers.innerHTML = identifiers.join(' ') || '<span style="opacity:0.5">No ID or classes</span>';

    // Display URL (truncated)
    try {
      var url = new URL(data.url);
      elementUrl.textContent = url.pathname.length > 40
        ? url.hostname + url.pathname.slice(0, 37) + '...'
        : url.hostname + url.pathname;
    } catch (e) {
      elementUrl.textContent = data.url || '-';
    }

    // Display Framework (Phase 1)
    if (data.framework && data.framework.name) {
      frameworkDetail.style.display = 'block';
      var frameworkStr = data.framework.name;
      if (data.framework.version) {
        frameworkStr += ' ' + data.framework.version;
      }
      frameworkValue.innerHTML = '<span class="framework-badge">' + escapeHtml(frameworkStr) + '</span>';
    } else {
      frameworkDetail.style.display = 'none';
    }

    // Display Component (Phase 1)
    if (data.component && data.component.name) {
      componentDetail.style.display = 'block';
      var componentHtml = '<span class="component-name">' + escapeHtml(data.component.name) + '</span>';
      if (data.component.file) {
        componentHtml += '<span class="component-file">' + escapeHtml(data.component.file) + '</span>';
      }
      componentValue.innerHTML = componentHtml;
    } else {
      componentDetail.style.display = 'none';
    }

    // Display Component Props (Phase 1)
    if (data.component && data.component.props && Object.keys(data.component.props).length > 0) {
      propsDetail.style.display = 'block';
      propsValue.textContent = JSON.stringify(data.component.props, null, 2);
    } else {
      propsDetail.style.display = 'none';
    }

    // Display Component State (Phase 1)
    if (data.component && data.component.state && Object.keys(data.component.state).length > 0) {
      stateDetail.style.display = 'block';
      stateValue.textContent = JSON.stringify(data.component.state, null, 2);
    } else {
      stateDetail.style.display = 'none';
    }

    // Display Data Attributes (Phase 1)
    if (data.dataAttributes && Object.keys(data.dataAttributes).length > 0) {
      dataAttrsDetail.style.display = 'block';
      var attrsText = Object.keys(data.dataAttributes).map(function(key) {
        return key + '="' + data.dataAttributes[key] + '"';
      }).join('\n');
      dataAttrsValue.textContent = attrsText;
    } else {
      dataAttrsDetail.style.display = 'none';
    }

    // Display CSS Selector
    selectorEl.textContent = data.selector || '-';

    // Display XPath
    xpathEl.textContent = data.xpath || '-';

    // Display Computed Styles
    if (data.computedStyles && Object.keys(data.computedStyles).length > 0) {
      var stylesText = '';
      var keys = Object.keys(data.computedStyles);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = data.computedStyles[key];
        if (value) {
          stylesText += key + ': ' + value + ';\n';
        }
      }
      stylesEl.textContent = stylesText.trim() || '-';
    } else {
      stylesEl.textContent = '-';
    }

    // Display Console Errors (Phase 1)
    if (data.consoleErrors && data.consoleErrors.length > 0) {
      consoleErrorsDetail.style.display = 'block';
      var errorsHtml = data.consoleErrors.slice(-5).map(function(entry) {
        var typeLabel = entry.type === 'error' ? 'ERROR' : 'WARN';
        var msg = entry.message.length > 200 ? entry.message.substring(0, 200) + '...' : entry.message;
        return '<div class="console-error-entry">' +
          '<span class="console-error-type">[' + typeLabel + ']</span>' +
          '<div class="console-error-msg">' + escapeHtml(msg) + '</div>' +
        '</div>';
      }).join('');
      consoleErrorsValue.innerHTML = errorsHtml;
    } else {
      consoleErrorsDetail.style.display = 'none';
    }

    // Display Network Activity (Phase 1)
    if (data.networkRequests && data.networkRequests.length > 0) {
      networkDetail.style.display = 'block';
      var networkHtml = data.networkRequests.slice(-10).map(function(req) {
        var url = req.url;
        try {
          var urlObj = new URL(req.url);
          url = urlObj.pathname.length > 30 ? urlObj.pathname.substring(0, 27) + '...' : urlObj.pathname;
        } catch (e) {}
        var statusClass = req.failed || req.status >= 400 ? 'failed' : '';
        return '<div class="network-entry">' +
          '<span class="network-method">' + (req.method || 'GET') + '</span>' +
          '<span class="network-url" title="' + escapeHtml(req.url) + '">' + escapeHtml(url) + '</span>' +
          '<span class="network-status ' + statusClass + '">' + (req.status || '-') + '</span>' +
          '<span class="network-duration">' + (req.duration ? req.duration + 'ms' : '-') + '</span>' +
        '</div>';
      }).join('');
      networkValue.innerHTML = networkHtml;
    } else {
      networkDetail.style.display = 'none';
    }

    updateSaveButtonState();
  });
}

// Update save button enabled state based on current conditions
function updateSaveButtonState() {
  var commentInput = document.getElementById('comment-input');
  var saveBtn = document.getElementById('save-btn');
  var comment = commentInput.value.trim();
  var hasComment = comment.length > 0;
  var hasElement = currentElementData !== null;
  saveBtn.disabled = !(hasComment && hasElement);
}

// Clear feedback message
function clearFeedback() {
  var feedbackEl = document.getElementById('save-feedback');
  feedbackEl.textContent = '';
  feedbackEl.classList.remove('success', 'error');
}

// Show feedback message
function showFeedback(message, isSuccess) {
  var feedbackEl = document.getElementById('save-feedback');
  feedbackEl.textContent = message;
  feedbackEl.classList.remove('success', 'error');
  feedbackEl.classList.add(isSuccess ? 'success' : 'error');
  setTimeout(clearFeedback, 3000);
}

// Handle save button click
async function handleSave() {
  var commentInput = document.getElementById('comment-input');
  var comment = commentInput.value.trim();

  if (!comment) {
    showFeedback('Please enter a comment', false);
    return;
  }

  // Use the already captured data from currentElementData
  if (!currentElementData) {
    showFeedback('Please select an element first', false);
    return;
  }

  var elementData = currentElementData;

  var report = {
    reportId: crypto.randomUUID(),
    url: elementData.url,
    comment: comment,
    timestamp: new Date().toISOString(),
    element: {
      selector: elementData.selector,
      xpath: elementData.xpath,
      computedStyles: elementData.computedStyles,
      tagName: elementData.tagName,
      elementId: elementData.elementId,
      textContent: elementData.textContent
    },
    // Phase 1 enhanced fields
    framework: elementData.framework,
    component: elementData.component,
    dataAttributes: elementData.dataAttributes,
    eventListeners: elementData.eventListeners,
    consoleErrors: elementData.consoleErrors ? elementData.consoleErrors.slice(-10) : [],
    networkRequests: elementData.networkRequests ? elementData.networkRequests.slice(-20) : [],
    developerContext: elementData.developerContext
  };

  try {
    await saveReport(report);
    var response = await new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({
        type: 'EXPORT_REPORT',
        report: report
      }, function(resp) {
        if (resp && resp.success) {
          resolve(resp);
        } else {
          reject(new Error(resp ? resp.error : 'Export failed'));
        }
      });
    });
    commentInput.value = '';
    updateSaveButtonState();
    updateReportsBadge();
    var projectInfo = response.projectName ? ' (' + response.projectName + ')' : '';
    showFeedback('Saved!' + projectInfo, true);
  } catch (error) {
    console.error('Failed to save report:', error);
    showFeedback('Failed to save report', false);
  }
}

// Truncate text with ellipsis
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 1) + '…';
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Update reports badge count
async function updateReportsBadge() {
  var reports = await getReports();
  var badge = document.getElementById('reports-badge');
  if (reports.length > 0) {
    badge.textContent = reports.length > 99 ? '99+' : reports.length;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

// Switch between capture, reports, and settings views
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(function(v) {
    v.classList.remove('active');
  });
  document.getElementById(viewName + '-view').classList.add('active');

  document.querySelectorAll('.tab-btn').forEach(function(t) {
    t.classList.remove('active');
  });
  document.querySelector('[data-view="' + viewName + '"]').classList.add('active');

  if (viewName === 'reports') {
    renderReportList();
  } else if (viewName === 'settings') {
    renderMappingsList();
  }
}

// Toggle details section
function toggleDetails() {
  detailsExpanded = !detailsExpanded;
  var toggle = document.getElementById('details-toggle');
  var content = document.getElementById('details-content');

  if (detailsExpanded) {
    toggle.classList.add('expanded');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg> Hide Details';
    content.classList.add('visible');
  } else {
    toggle.classList.remove('expanded');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg> Show Details';
    content.classList.remove('visible');
  }
}

// Render report list from storage
async function renderReportList() {
  var reports = await getReports();
  var container = document.getElementById('report-list');
  updateReportsBadge();

  if (reports.length === 0) {
    container.innerHTML = '<p class="empty-state">No reports saved yet</p>';
    return;
  }

  container.innerHTML = reports.map(function(report) {
    var tagName = (report.element && report.element.tagName) || 'element';
    var elemId = (report.element && report.element.elementId) ? '#' + report.element.elementId : '';
    var elemDisplay = '<' + tagName + '>' + elemId;

    var urlDisplay = '';
    try {
      var url = new URL(report.url);
      urlDisplay = url.hostname;
    } catch (e) {
      urlDisplay = truncate(report.url, 30);
    }

    return '<div class="report-item" draggable="true" data-id="' + escapeHtml(report.reportId) + '">' +
      '<div class="report-meta">' +
        '<span class="report-element">' + escapeHtml(elemDisplay) + '</span>' +
        '<span class="report-url">' + escapeHtml(urlDisplay) + '</span>' +
      '</div>' +
      '<p class="report-comment">' + escapeHtml(report.comment) + '</p>' +
      '<div class="report-actions">' +
        '<button class="action-btn copy-btn" data-id="' + escapeHtml(report.reportId) + '">Copy</button>' +
        '<button class="action-btn export-btn" data-id="' + escapeHtml(report.reportId) + '">Export</button>' +
        '<button class="action-btn delete-btn" data-id="' + escapeHtml(report.reportId) + '">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.report-item').forEach(function(item) {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
  });
}

// Handle drag start
async function handleDragStart(e) {
  var reportId = e.currentTarget.dataset.id;
  var reports = await getReports();
  var report = reports.find(function(r) { return r.reportId === reportId; });
  if (!report) return;

  e.currentTarget.classList.add('dragging');
  var markdown = formatReportAsMarkdown(report);
  e.dataTransfer.setData('text/plain', markdown);
  e.dataTransfer.setData('text/markdown', markdown);
  e.dataTransfer.effectAllowed = 'copy';
}

// Handle drag end
function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
}

// ============ Settings Management ============

async function renderMappingsList() {
  var mappings = await getProjectMappings();
  projectMappingsCache = mappings;
  var container = document.getElementById('mappings-list');

  if (mappings.length === 0) {
    container.innerHTML = '<p class="empty-state">No project mappings configured</p>';
    return;
  }

  container.innerHTML = mappings.map(function(mapping) {
    var patternsDisplay = mapping.patterns.slice(0, 2).join(', ');
    if (mapping.patterns.length > 2) {
      patternsDisplay += ' +' + (mapping.patterns.length - 2);
    }
    return '<div class="mapping-item" data-id="' + escapeHtml(mapping.id) + '">' +
      '<div class="mapping-header">' +
        '<span class="mapping-name">' + escapeHtml(mapping.name) + '</span>' +
        '<div class="mapping-actions">' +
          '<button class="mapping-edit-btn" data-id="' + escapeHtml(mapping.id) + '">Edit</button>' +
          '<button class="mapping-delete-btn" data-id="' + escapeHtml(mapping.id) + '">Delete</button>' +
        '</div>' +
      '</div>' +
      '<span class="mapping-patterns">' + escapeHtml(patternsDisplay) + '</span>' +
      '<span class="mapping-folder">→ ' + escapeHtml(mapping.folder) + '/</span>' +
    '</div>';
  }).join('');
}

function openMappingDialog(mapping) {
  var dialog = document.getElementById('mapping-dialog');
  var form = document.getElementById('mapping-form');
  var idInput = document.getElementById('mapping-id');
  var nameInput = document.getElementById('mapping-name');
  var patternsInput = document.getElementById('mapping-patterns');
  var folderInput = document.getElementById('mapping-folder');

  if (mapping) {
    idInput.value = mapping.id;
    nameInput.value = mapping.name;
    patternsInput.value = mapping.patterns.join('\n');
    folderInput.value = mapping.folder;
  } else {
    form.reset();
    idInput.value = '';
  }

  dialog.showModal();
}

async function handleMappingSubmit(e) {
  e.preventDefault();

  var idInput = document.getElementById('mapping-id');
  var nameInput = document.getElementById('mapping-name');
  var patternsInput = document.getElementById('mapping-patterns');
  var folderInput = document.getElementById('mapping-folder');

  var id = idInput.value;
  var name = nameInput.value.trim();
  var patterns = patternsInput.value.split('\n').map(function(p) { return p.trim(); }).filter(function(p) { return p; });
  var folder = folderInput.value.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-');

  if (!name || patterns.length === 0 || !folder) {
    showFeedback('Please fill all fields', false);
    return;
  }

  var mappings = await getProjectMappings();

  if (id) {
    var index = mappings.findIndex(function(m) { return m.id === id; });
    if (index !== -1) {
      mappings[index] = { id: id, name: name, patterns: patterns, folder: folder };
    }
  } else {
    mappings.push({
      id: crypto.randomUUID(),
      name: name,
      patterns: patterns,
      folder: folder
    });
  }

  await saveProjectMappings(mappings);
  document.getElementById('mapping-dialog').close();
  await renderMappingsList();
  showFeedback('Project mapping saved', true);
}

async function handleMappingDelete(mappingId) {
  var mappings = await getProjectMappings();
  var filtered = mappings.filter(function(m) { return m.id !== mappingId; });
  await saveProjectMappings(filtered);
  await renderMappingsList();
  showFeedback('Mapping deleted', true);
}

async function copyReportToClipboard(reportId) {
  var reports = await getReports();
  var report = reports.find(function(r) { return r.reportId === reportId; });

  if (!report) {
    showFeedback('Report not found', false);
    return;
  }

  var markdown = formatReportAsMarkdown(report);

  try {
    await navigator.clipboard.writeText(markdown);
    showFeedback('Copied!', true);
  } catch (error) {
    console.error('Clipboard write failed:', error);
    showFeedback('Failed to copy', false);
  }
}

async function handleExportReport(reportId) {
  var reports = await getReports();
  var report = reports.find(function(r) { return r.reportId === reportId; });

  if (!report) {
    showFeedback('Report not found', false);
    return;
  }

  try {
    var response = await new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({
        type: 'EXPORT_REPORT',
        report: report
      }, function(resp) {
        if (resp && resp.success) {
          resolve(resp);
        } else {
          reject(new Error(resp ? resp.error : 'Export failed'));
        }
      });
    });
    var projectInfo = response.projectName ? ' (' + response.projectName + ')' : '';
    showFeedback('Exported!' + projectInfo, true);
  } catch (error) {
    console.error('Export failed:', error);
    showFeedback('Failed to export', false);
  }
}

async function handleDeleteReport(reportId) {
  try {
    await deleteReport(reportId);
    await renderReportList();
    showFeedback('Deleted', true);
  } catch (error) {
    console.error('Delete failed:', error);
    showFeedback('Failed to delete', false);
  }
}

async function handleExportAll() {
  try {
    var results = await exportAllReports();
    var successCount = results.filter(function(r) { return r.success; }).length;
    showFeedback('Exported ' + successCount + ' reports', true);
  } catch (error) {
    console.error('Export all failed:', error);
    showFeedback('Failed to export', false);
  }
}

async function handleClearAll() {
  var dialog = document.getElementById('clear-confirm-dialog');

  var confirmed = await new Promise(function(resolve) {
    var handler = function() {
      dialog.removeEventListener('close', handler);
      resolve(dialog.returnValue === 'confirm');
    };
    dialog.addEventListener('close', handler);
    dialog.showModal();
  });

  if (!confirmed) return;

  try {
    await clearReports();
    await renderReportList();
    showFeedback('All reports cleared', true);
  } catch (error) {
    console.error('Clear all failed:', error);
    showFeedback('Failed to clear', false);
  }
}

// ============ Event Listeners ============

// Listen for selection changes
chrome.devtools.panels.elements.onSelectionChanged.addListener(function() {
  updateDisplay();
});

// Comment input
document.getElementById('comment-input').addEventListener('input', updateSaveButtonState);

// Save button
document.getElementById('save-btn').addEventListener('click', handleSave);

// Details toggle
document.getElementById('details-toggle').addEventListener('click', toggleDetails);

// Tab navigation
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    if (btn.dataset.view) {
      switchView(btn.dataset.view);
    }
  });
});

// Report list actions
document.getElementById('report-list').addEventListener('click', async function(e) {
  var button = e.target.closest('button');
  if (!button) return;

  var reportId = button.dataset.id;
  if (!reportId) return;

  if (button.classList.contains('copy-btn')) {
    await copyReportToClipboard(reportId);
  } else if (button.classList.contains('delete-btn')) {
    await handleDeleteReport(reportId);
  } else if (button.classList.contains('export-btn')) {
    await handleExportReport(reportId);
  }
});

// Export all button
document.getElementById('export-all-btn').addEventListener('click', handleExportAll);

// Clear all button
document.getElementById('clear-all-btn').addEventListener('click', handleClearAll);

// Settings: Add mapping
document.getElementById('add-mapping-btn').addEventListener('click', function() {
  openMappingDialog(null);
});

// Settings: Mapping form submit
document.getElementById('mapping-form').addEventListener('submit', handleMappingSubmit);

// Settings: Mapping dialog cancel
document.getElementById('mapping-cancel').addEventListener('click', function() {
  document.getElementById('mapping-dialog').close();
});

// Settings: Mapping list actions
document.getElementById('mappings-list').addEventListener('click', async function(e) {
  var button = e.target.closest('button');
  if (!button) return;

  var mappingId = button.dataset.id;
  if (!mappingId) return;

  if (button.classList.contains('mapping-edit-btn')) {
    var mapping = projectMappingsCache.find(function(m) { return m.id === mappingId; });
    if (mapping) {
      openMappingDialog(mapping);
    }
  } else if (button.classList.contains('mapping-delete-btn')) {
    await handleMappingDelete(mappingId);
  }
});

// ============ Initialize ============

updateDisplay();
updateSaveButtonState();
updateReportsBadge();
