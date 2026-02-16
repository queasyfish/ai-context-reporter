// Sidebar script - handles element selection display and capture
import { getElementCaptureCode } from '../../lib/element-capture.js';
import { saveReport, getReports, deleteReport, clearReports, getProjectMappings, saveProjectMappings } from '../../lib/storage.ts';

// Constants
var BASE_EXPORT_FOLDER = 'ai-agent-reports';

// Project mappings cache
var projectMappingsCache = [];

// State variable to track currently selected element data
var currentElementData = null;

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

// Format report as Markdown for AI tools
function formatReportAsMarkdown(report) {
  var lines = [
    '# Element Context Report',
    '',
    '**Page URL:** ' + (report.url || ''),
    '**Captured:** ' + new Date().toLocaleString(),
    ''
  ];

  if (report.comment) {
    lines.push('## Comment');
    lines.push('');
    lines.push(report.comment);
    lines.push('');
  }

  if (report.element) {
    lines.push('## Element');
    lines.push('');
    if (report.element.tagName) lines.push('- **Tag:** `<' + report.element.tagName + '>`');
    if (report.element.elementId) lines.push('- **ID:** `' + report.element.elementId + '`');
    if (report.element.selector) lines.push('- **CSS Selector:** `' + report.element.selector + '`');
    if (report.element.xpath) lines.push('- **XPath:** `' + report.element.xpath + '`');
    lines.push('');

    if (report.element.textContent) {
      lines.push('## Text Content');
      lines.push('');
      lines.push('```');
      lines.push(report.element.textContent.substring(0, 500));
      lines.push('```');
      lines.push('');
    }

    if (report.element.computedStyles && Object.keys(report.element.computedStyles).length > 0) {
      lines.push('## Computed Styles');
      lines.push('');
      lines.push('```css');
      Object.keys(report.element.computedStyles).forEach(function(key) {
        lines.push(key + ': ' + report.element.computedStyles[key] + ';');
      });
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// Export a single report to file via background script
async function exportReportToFile(report) {
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'EXPORT_REPORT',
      report: report
    }, function(response) {
      if (response && response.success) {
        resolve();
      } else {
        reject(new Error(response ? response.error : 'Export failed'));
      }
    });
  });
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

// Update display with captured element data
function updateDisplay() {
  captureElementData().then(function(data) {
    // Store captured data for save functionality
    currentElementData = data;

    var urlEl = document.getElementById('url-value');
    var selectorEl = document.getElementById('selector-value');
    var xpathEl = document.getElementById('xpath-value');
    var stylesEl = document.getElementById('styles-value');

    if (!data) {
      urlEl.textContent = '-';
      selectorEl.textContent = 'No element selected';
      xpathEl.textContent = '-';
      stylesEl.textContent = '-';
      currentElementData = null;
      return;
    }

    // Display URL
    urlEl.textContent = data.url || '-';

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
          stylesText += key + ': ' + value + '\n';
        }
      }
      stylesEl.textContent = stylesText.trim() || '-';
    } else {
      stylesEl.textContent = '-';
    }
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
  feedbackEl.classList.remove('success');
  feedbackEl.classList.remove('error');
}

// Show feedback message
function showFeedback(message, isSuccess) {
  var feedbackEl = document.getElementById('save-feedback');
  feedbackEl.textContent = message;
  feedbackEl.classList.remove('success');
  feedbackEl.classList.remove('error');
  if (isSuccess) {
    feedbackEl.classList.add('success');
  } else {
    feedbackEl.classList.add('error');
  }
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

  // Re-capture element data for freshness
  var elementData = await captureElementData();

  if (!elementData) {
    showFeedback('Please select an element first', false);
    return;
  }

  // Build report object
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
    }
  };

  try {
    await saveReport(report);
    // Export via background script to get folder info
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
    var folderPath = '~/Downloads/' + response.folder + '/';
    var projectInfo = response.projectName ? ' (' + response.projectName + ')' : '';
    showFeedback('Saved to ' + folderPath + projectInfo, true);
  } catch (error) {
    console.error('Failed to save report:', error);
    showFeedback('Failed to save report', false);
  }
}

// Truncate text with ellipsis
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Switch between capture, reports, and settings views
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(function(v) {
    v.hidden = true;
  });
  document.getElementById(viewName + '-view').hidden = false;

  document.querySelectorAll('.tab-btn').forEach(function(t) {
    t.classList.remove('active');
  });
  document.querySelector('[data-view="' + viewName + '"]').classList.add('active');

  // Refresh content when switching views
  if (viewName === 'reports') {
    renderReportList();
  } else if (viewName === 'settings') {
    renderMappingsList();
  }
}

// Render report list from storage
async function renderReportList() {
  var reports = await getReports();
  var container = document.getElementById('report-list');

  if (reports.length === 0) {
    container.innerHTML = '<p class="empty-state">No reports saved yet.</p>';
    return;
  }

  container.innerHTML = reports.map(function(report, index) {
    // Build element identifier display
    var elemDisplay = '';
    if (report.element && report.element.elementId) {
      elemDisplay = report.element.elementId;
      if (report.element.textContent) {
        elemDisplay += ' "' + truncate(report.element.textContent, 20) + '"';
      }
    }

    return '<div class="report-item" draggable="true" data-id="' + escapeHtml(report.reportId) + '" data-index="' + index + '">' +
      '<div class="report-summary">' +
        '<span class="report-url">' + escapeHtml(truncate(report.url, 50)) + '</span>' +
        (elemDisplay ? '<span class="report-element">' + escapeHtml(elemDisplay) + '</span>' : '') +
        '<span class="report-comment">' + escapeHtml(truncate(report.comment, 60)) + '</span>' +
      '</div>' +
      '<div class="report-actions">' +
        '<button class="action-btn export-btn" data-id="' + escapeHtml(report.reportId) + '" title="Export to ai-agent-reports folder">↓</button>' +
        '<button class="action-btn copy-btn" data-id="' + escapeHtml(report.reportId) + '">Copy</button>' +
        '<button class="action-btn delete-btn" data-id="' + escapeHtml(report.reportId) + '">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Add drag event listeners
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

// Render project mappings list
async function renderMappingsList() {
  var mappings = await getProjectMappings();
  projectMappingsCache = mappings;
  var container = document.getElementById('mappings-list');

  if (mappings.length === 0) {
    container.innerHTML = '<p class="empty-state">No project mappings configured.</p>';
    return;
  }

  container.innerHTML = mappings.map(function(mapping) {
    var patternsDisplay = mapping.patterns.slice(0, 3).join(', ');
    if (mapping.patterns.length > 3) {
      patternsDisplay += ' +' + (mapping.patterns.length - 3) + ' more';
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
      '<span class="mapping-folder">→ ai-agent-reports/' + escapeHtml(mapping.folder) + '/</span>' +
    '</div>';
  }).join('');
}

// Open mapping dialog for add/edit
function openMappingDialog(mapping) {
  var dialog = document.getElementById('mapping-dialog');
  var form = document.getElementById('mapping-form');
  var idInput = document.getElementById('mapping-id');
  var nameInput = document.getElementById('mapping-name');
  var patternsInput = document.getElementById('mapping-patterns');
  var folderInput = document.getElementById('mapping-folder');

  if (mapping) {
    // Edit mode
    idInput.value = mapping.id;
    nameInput.value = mapping.name;
    patternsInput.value = mapping.patterns.join('\n');
    folderInput.value = mapping.folder;
  } else {
    // Add mode
    form.reset();
    idInput.value = '';
  }

  dialog.showModal();
}

// Handle mapping form submission
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
    // Update existing
    var index = mappings.findIndex(function(m) { return m.id === id; });
    if (index !== -1) {
      mappings[index] = { id: id, name: name, patterns: patterns, folder: folder };
    }
  } else {
    // Add new
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

// Handle mapping deletion
async function handleMappingDelete(mappingId) {
  var mappings = await getProjectMappings();
  var filtered = mappings.filter(function(m) { return m.id !== mappingId; });
  await saveProjectMappings(filtered);
  await renderMappingsList();
  showFeedback('Project mapping deleted', true);
}

// Copy report to clipboard as Markdown
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
    showFeedback('Copied to clipboard!', true);
  } catch (error) {
    console.error('Clipboard write failed:', error);
    showFeedback('Failed to copy', false);
  }
}

// Export a single report
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
    var folderPath = '~/Downloads/' + response.folder + '/';
    var projectInfo = response.projectName ? ' (' + response.projectName + ')' : '';
    showFeedback('Exported to ' + folderPath + projectInfo, true);
  } catch (error) {
    console.error('Export failed:', error);
    showFeedback('Failed to export', false);
  }
}

// Delete a single report
async function handleDeleteReport(reportId) {
  try {
    await deleteReport(reportId);
    await renderReportList();
    showFeedback('Report deleted', true);
  } catch (error) {
    console.error('Delete failed:', error);
    showFeedback('Failed to delete', false);
  }
}

// Export all reports
async function handleExportAll() {
  try {
    var results = await exportAllReports();
    var successCount = results.filter(function(r) { return r.success; }).length;
    showFeedback('Exported ' + successCount + ' report(s) to ~/Downloads/' + EXPORT_FOLDER + '/', true);
  } catch (error) {
    console.error('Export all failed:', error);
    showFeedback('Failed to export reports', false);
  }
}

// Clear all reports with confirmation
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
    showFeedback('Failed to clear reports', false);
  }
}

// Listen for selection changes
chrome.devtools.panels.elements.onSelectionChanged.addListener(function() {
  updateDisplay();
  updateSaveButtonState();
});

// Comment input event listener
document.getElementById('comment-input').addEventListener('input', updateSaveButtonState);

// Save button click event listener
document.getElementById('save-btn').addEventListener('click', handleSave);

// Tab navigation event listeners
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    switchView(btn.dataset.view);
  });
});

// Event delegation for report list actions
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

// Export all button listener
var exportAllBtn = document.getElementById('export-all-btn');
if (exportAllBtn) {
  exportAllBtn.addEventListener('click', handleExportAll);
}

// Clear all button listener
document.getElementById('clear-all-btn').addEventListener('click', handleClearAll);

// Settings: Add mapping button listener
document.getElementById('add-mapping-btn').addEventListener('click', function() {
  openMappingDialog(null);
});

// Settings: Mapping form submit listener
document.getElementById('mapping-form').addEventListener('submit', handleMappingSubmit);

// Settings: Mapping dialog cancel button
document.getElementById('mapping-cancel').addEventListener('click', function() {
  document.getElementById('mapping-dialog').close();
});

// Settings: Event delegation for mapping list actions
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

// Initial update
updateDisplay();
updateSaveButtonState();
