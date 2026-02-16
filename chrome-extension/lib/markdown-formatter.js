/**
 * Markdown Formatter Module
 *
 * Consolidates all Markdown formatting functions for reports and sessions.
 * Used by background.js, sidebar/main.js, and session export.
 */

/**
 * Format a single element report as Markdown.
 *
 * @param {Object} report - The report object
 * @param {string} [projectName] - Optional project name to include
 * @returns {string} Markdown formatted report
 */
export function formatReportAsMarkdown(report, projectName) {
  const lines = [
    '# Element Context Report',
    ''
  ];

  if (projectName) {
    lines.push('**Project:** ' + projectName);
  }

  // Framework info
  if (report.framework && report.framework.name) {
    let frameworkStr = report.framework.name;
    if (report.framework.version) {
      frameworkStr += ' ' + report.framework.version;
    }
    lines.push('**Framework:** ' + frameworkStr);
  }

  // Component info
  if (report.component && report.component.name) {
    let componentStr = report.component.name;
    if (report.component.file) {
      componentStr += ' (' + report.component.file + ')';
    }
    lines.push('**Component:** ' + componentStr);
  }

  lines.push('**Page URL:** ' + (report.url || ''));
  lines.push('**Captured:** ' + new Date().toLocaleString());
  lines.push('');

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

  // Component Props
  if (report.component && report.component.props && Object.keys(report.component.props).length > 0) {
    lines.push('## Component Props');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.component.props, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Component State
  if (report.component && report.component.state && Object.keys(report.component.state).length > 0) {
    lines.push('## Component State');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.component.state, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Data Attributes
  if (report.dataAttributes && Object.keys(report.dataAttributes).length > 0) {
    lines.push('## Data Attributes');
    lines.push('');
    Object.keys(report.dataAttributes).forEach(function(key) {
      lines.push('- `' + key + '`: `' + report.dataAttributes[key] + '`');
    });
    lines.push('');
  }

  // Event Listeners
  if (report.eventListeners && report.eventListeners.length > 0) {
    lines.push('## Event Listeners');
    lines.push('');
    lines.push(report.eventListeners.map(function(e) { return '`' + e + '`'; }).join(', '));
    lines.push('');
  }

  // Console Errors
  if (report.consoleErrors && report.consoleErrors.length > 0) {
    lines.push('## Recent Console Errors');
    lines.push('');
    report.consoleErrors.forEach(function(entry) {
      const typeLabel = entry.type === 'error' ? 'ERROR' : 'WARN';
      const time = new Date(entry.timestamp).toLocaleTimeString();
      lines.push('```');
      lines.push('[' + typeLabel + ' ' + time + '] ' + entry.message);
      if (entry.stack) {
        lines.push('');
        const stackLines = entry.stack.split('\n').slice(0, 5);
        lines.push(stackLines.join('\n'));
      }
      lines.push('```');
      lines.push('');
    });
  }

  // Network Requests
  if (report.networkRequests && report.networkRequests.length > 0) {
    lines.push('## Recent Network Activity');
    lines.push('');
    lines.push('| Method | URL | Status | Duration |');
    lines.push('|--------|-----|--------|----------|');
    report.networkRequests.forEach(function(req) {
      let url = req.url;
      if (url.length > 60) {
        url = url.substring(0, 57) + '...';
      }
      const status = req.status || 0;
      const statusStr = req.failed ? '**' + status + '**' : String(status);
      const duration = req.duration ? req.duration + 'ms' : '-';
      lines.push('| ' + (req.method || 'GET') + ' | `' + url + '` | ' + statusStr + ' | ' + duration + ' |');
    });
    lines.push('');
  }

  // Developer Context
  if (report.developerContext) {
    lines.push('## Developer Context');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.developerContext, null, 2));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a session recording as Markdown.
 *
 * @param {Object} session - The session object
 * @param {string} [comment] - Optional user comment
 * @returns {string} Markdown formatted session
 */
export function formatSessionAsMarkdown(session, comment) {
  const lines = [
    '# Deep Inspection Session Report',
    '',
    '**Session ID:** ' + session.sessionId,
    '**URL:** ' + (session.url || 'Unknown'),
    '**Duration:** ' + formatDuration(session.duration),
    '**Recorded:** ' + new Date(session.startTime).toLocaleString(),
    ''
  ];

  if (comment) {
    lines.push('## Comment');
    lines.push('');
    lines.push(comment);
    lines.push('');
  }

  // Timeline summary
  lines.push('## Session Timeline');
  lines.push('');
  lines.push('```');

  const events = [];
  const startTime = session.startTime;

  // Add interactions to timeline
  if (session.interactions) {
    session.interactions.forEach(i => {
      events.push({
        time: i.timestamp,
        type: 'interaction',
        label: '[' + i.type + '] ' + i.target + (i.value ? ': ' + i.value.substring(0, 50) : '')
      });
    });
  }

  // Add console errors to timeline
  if (session.consoleLog) {
    session.consoleLog.filter(c => c.type === 'error').forEach(c => {
      events.push({
        time: c.timestamp,
        type: 'error',
        label: '[ERROR] ' + c.message.substring(0, 100)
      });
    });
  }

  // Add failed network requests to timeline
  if (session.networkLog) {
    session.networkLog.filter(n => n.failed).forEach(n => {
      events.push({
        time: n.timestamp,
        type: 'network',
        label: '[NETWORK FAIL] ' + n.method + ' ' + n.url.substring(0, 60) + ' -> ' + n.status
      });
    });
  }

  // Add snapshots to timeline
  if (session.snapshots) {
    session.snapshots.forEach(s => {
      events.push({
        time: s.timestamp,
        type: 'snapshot',
        label: '[SNAPSHOT] ' + s.label
      });
    });
  }

  // Sort by time and format
  events.sort((a, b) => a.time - b.time);

  events.forEach(e => {
    const offset = Math.round((e.time - startTime) / 1000);
    const timeStr = formatTimeOffset(offset);
    lines.push(timeStr + ' ' + e.label);
  });

  if (events.length === 0) {
    lines.push('(No significant events recorded)');
  }

  lines.push('```');
  lines.push('');

  // Interactions detail
  if (session.interactions && session.interactions.length > 0) {
    lines.push('## User Interactions');
    lines.push('');
    lines.push('| Time | Type | Target | Value |');
    lines.push('|------|------|--------|-------|');

    session.interactions.slice(0, 50).forEach(i => {
      const time = formatTimeOffset(Math.round((i.timestamp - startTime) / 1000));
      const value = i.value ? i.value.substring(0, 30) : '-';
      lines.push('| ' + time + ' | ' + i.type + ' | `' + i.target.substring(0, 40) + '` | ' + value + ' |');
    });

    if (session.interactions.length > 50) {
      lines.push('| ... | | (' + (session.interactions.length - 50) + ' more) | |');
    }
    lines.push('');
  }

  // Console errors
  if (session.consoleLog && session.consoleLog.length > 0) {
    const errors = session.consoleLog.filter(c => c.type === 'error' || c.type === 'warn');
    if (errors.length > 0) {
      lines.push('## Console Errors & Warnings');
      lines.push('');

      errors.slice(0, 20).forEach(entry => {
        const time = formatTimeOffset(Math.round((entry.timestamp - startTime) / 1000));
        const typeLabel = entry.type.toUpperCase();
        lines.push('### ' + time + ' [' + typeLabel + ']');
        lines.push('```');
        lines.push(entry.message);
        if (entry.stack) {
          lines.push('');
          lines.push(entry.stack.split('\n').slice(0, 5).join('\n'));
        }
        lines.push('```');
        lines.push('');
      });

      if (errors.length > 20) {
        lines.push('*...and ' + (errors.length - 20) + ' more errors/warnings*');
        lines.push('');
      }
    }
  }

  // Network requests
  if (session.networkLog && session.networkLog.length > 0) {
    lines.push('## Network Activity');
    lines.push('');
    lines.push('| Time | Method | URL | Status | Duration |');
    lines.push('|------|--------|-----|--------|----------|');

    session.networkLog.slice(0, 30).forEach(req => {
      const time = formatTimeOffset(Math.round((req.timestamp - startTime) / 1000));
      const url = req.url.length > 50 ? req.url.substring(0, 47) + '...' : req.url;
      const status = req.failed ? '**' + req.status + '**' : String(req.status);
      lines.push('| ' + time + ' | ' + req.method + ' | `' + url + '` | ' + status + ' | ' + req.duration + 'ms |');
    });

    if (session.networkLog.length > 30) {
      lines.push('| ... | | (' + (session.networkLog.length - 30) + ' more) | | |');
    }
    lines.push('');

    // Show failed request details
    const failed = session.networkLog.filter(n => n.failed);
    if (failed.length > 0) {
      lines.push('### Failed Requests');
      lines.push('');

      failed.slice(0, 5).forEach(req => {
        lines.push('**' + req.method + ' ' + req.url + '**');
        lines.push('- Status: ' + req.status);
        if (req.requestBody) {
          lines.push('- Request Body:');
          lines.push('```json');
          lines.push(req.requestBody.substring(0, 500));
          lines.push('```');
        }
        if (req.responseBody) {
          lines.push('- Response Body:');
          lines.push('```json');
          lines.push(req.responseBody.substring(0, 500));
          lines.push('```');
        }
        lines.push('');
      });
    }
  }

  // Snapshots
  if (session.snapshots && session.snapshots.length > 0) {
    lines.push('## Snapshots');
    lines.push('');

    session.snapshots.forEach(snap => {
      const time = formatTimeOffset(Math.round((snap.timestamp - startTime) / 1000));
      lines.push('### ' + time + ' - ' + snap.label);
      lines.push('');
      lines.push('**URL:** ' + snap.url);

      if (snap.localStorage && Object.keys(snap.localStorage).length > 0) {
        lines.push('');
        lines.push('**localStorage:**');
        lines.push('```json');
        lines.push(JSON.stringify(snap.localStorage, null, 2).substring(0, 1000));
        lines.push('```');
      }

      if (snap.sessionStorage && Object.keys(snap.sessionStorage).length > 0) {
        lines.push('');
        lines.push('**sessionStorage:**');
        lines.push('```json');
        lines.push(JSON.stringify(snap.sessionStorage, null, 2).substring(0, 1000));
        lines.push('```');
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Format duration in human readable form.
 * @private
 */
function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes + 'm ' + secs + 's';
}

/**
 * Format time offset for timeline.
 * @private
 */
function formatTimeOffset(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}
