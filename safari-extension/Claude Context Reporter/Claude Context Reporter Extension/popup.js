// AI Context Reporter - Safari Popup Script
// Manages the reports list, copy, delete, export, and drag-drop functionality

"use strict";

// Constants
const BASE_EXPORT_FOLDER = "ai-agent-reports";

document.addEventListener("DOMContentLoaded", () => {
  // DOM references
  const reportsList = document.getElementById("reports-list");
  const emptyState = document.getElementById("empty-state");
  const exportAllBtn = document.getElementById("export-all-btn");
  const clearBtn = document.getElementById("clear-btn");
  const template = document.getElementById("report-template");
  const dragHint = document.getElementById("drag-hint");
  const reportsView = document.getElementById("reports-view");
  const settingsView = document.getElementById("settings-view");
  const reportsBadge = document.getElementById("reports-badge");

  // Verify required elements exist
  if (!reportsList || !emptyState || !template) {
    console.error("Required DOM elements not found");
    return;
  }

  // Current reports cache for drag operations
  let reportsCache = [];
  // Project mappings cache
  let mappingsCache = [];

  // Load reports on popup open
  loadReports();

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach(tab => {
    tab.addEventListener("click", () => {
      const viewName = tab.dataset.view;

      // Handle Deep Inspection button - opens in new tab
      if (viewName === "inspect") {
        browser.tabs.create({
          url: browser.runtime.getURL("inspector.html")
        });
        window.close(); // Close the popup
        return;
      }

      switchView(viewName);
    });
  });

  function switchView(viewName) {
    // Update tab styles
    document.querySelectorAll(".tab-btn").forEach(t => {
      t.classList.toggle("active", t.dataset.view === viewName);
    });

    // Show/hide views
    if (reportsView) reportsView.classList.toggle("active", viewName === "reports");
    if (settingsView) settingsView.classList.toggle("active", viewName === "settings");

    // Load content for the view
    if (viewName === "reports") {
      loadReports();
    } else if (viewName === "settings") {
      loadMappings();
    }
  }

  // Update reports badge
  function updateReportsBadge(count) {
    if (reportsBadge) {
      reportsBadge.textContent = count;
      reportsBadge.style.display = count > 0 ? "inline-block" : "none";
    }
  }

  // Export all reports
  if (exportAllBtn) {
    exportAllBtn.addEventListener("click", handleExportAll);
  }

  // Clear all reports
  if (clearBtn) {
    clearBtn.addEventListener("click", handleClearAll);
  }

  async function handleExportAll() {
    if (reportsCache.length === 0) return;

    try {
      exportAllBtn.disabled = true;
      let exportedCount = 0;

      for (const report of reportsCache) {
        try {
          await exportReportToFile(report);
          exportedCount++;
        } catch (err) {
          console.warn("Failed to export report:", err);
        }
      }

      showToast(`Exported ${exportedCount} report${exportedCount !== 1 ? "s" : ""} to Downloads/${BASE_EXPORT_FOLDER}/`);
    } catch (error) {
      console.error("Export all error:", error);
      showToast("Export failed", true);
    } finally {
      exportAllBtn.disabled = false;
    }
  }

  async function handleClearAll() {
    if (!confirm("Delete all reports? This cannot be undone.")) {
      return;
    }

    try {
      clearBtn.disabled = true;
      await browser.runtime.sendMessage({ action: "clearAllReports" });
      await loadReports();
    } catch (error) {
      console.error("Clear all error:", error);
    } finally {
      clearBtn.disabled = false;
    }
  }

  // Load and display reports
  async function loadReports() {
    try {
      const response = await browser.runtime.sendMessage({ action: "getReports" });
      const reports = Array.isArray(response?.reports) ? response.reports : [];
      reportsCache = reports;

      // Update badge
      updateReportsBadge(reports.length);

      // Clear existing content
      reportsList.innerHTML = "";

      if (reports.length === 0) {
        emptyState.classList.remove("hidden");
        reportsList.classList.add("hidden");
        if (dragHint) dragHint.classList.add("hidden");
        return;
      }

      emptyState.classList.add("hidden");
      reportsList.classList.remove("hidden");
      if (dragHint) dragHint.classList.remove("hidden");

      // Use document fragment for better performance
      const fragment = document.createDocumentFragment();

      for (let i = 0; i < reports.length; i++) {
        try {
          const item = createReportItem(reports[i], i);
          if (item) {
            fragment.appendChild(item);
          }
        } catch (error) {
          console.warn("Failed to create report item:", error);
        }
      }

      reportsList.appendChild(fragment);
    } catch (error) {
      console.error("Failed to load reports:", error);
      emptyState.classList.remove("hidden");
      reportsList.classList.add("hidden");
    }
  }

  // Create report list item
  function createReportItem(report, index) {
    if (!report || !report.id) {
      console.warn("Invalid report data");
      return null;
    }

    const clone = template.content.cloneNode(true);
    const item = clone.querySelector(".report-item");

    if (!item) return null;

    // Store report index for drag operations
    item.dataset.reportIndex = index;

    // Element info
    const elementInfo = item.querySelector(".report-element");
    if (elementInfo) {
      elementInfo.textContent = formatElementName(report);
    }

    // Time
    const time = item.querySelector(".report-time");
    if (time) {
      time.textContent = formatTime(report.timestamp);
      time.title = report.timestamp ? new Date(report.timestamp).toLocaleString() : "";
    }

    // Comment
    const comment = item.querySelector(".report-comment");
    if (comment) {
      const commentText = report.comment?.trim() || "";
      comment.textContent = commentText;
      if (!commentText) {
        comment.style.display = "none";
      }
    }

    // URL
    const url = item.querySelector(".report-url");
    if (url) {
      url.textContent = formatUrl(report.pageUrl);
      url.title = report.pageUrl || "";
    }

    // Export button
    const exportBtn = item.querySelector(".export-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleExportSingle(report, exportBtn);
      });
    }

    // Copy button
    const copyBtn = item.querySelector(".copy-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyAsMarkdown(report, copyBtn);
      });
    }

    // Delete button
    const deleteBtn = item.querySelector(".delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleDelete(report.id);
      });
    }

    // Drag and drop handlers
    item.addEventListener("dragstart", (e) => handleDragStart(e, report));
    item.addEventListener("dragend", handleDragEnd);

    return item;
  }

  // Handle drag start
  function handleDragStart(e, report) {
    const item = e.currentTarget;
    item.classList.add("dragging");

    const markdown = generateMarkdown(report);

    // Set multiple data types for compatibility
    e.dataTransfer.setData("text/plain", markdown);
    e.dataTransfer.setData("text/markdown", markdown);

    // Set drag effect
    e.dataTransfer.effectAllowed = "copy";
  }

  // Handle drag end
  function handleDragEnd(e) {
    e.currentTarget.classList.remove("dragging");
  }

  // Export single report
  async function handleExportSingle(report, button) {
    try {
      button.disabled = true;
      const exportInfo = await exportReportToFile(report);

      button.classList.add("exported");
      const projectInfo = exportInfo.projectName ? ` (${exportInfo.projectName})` : "";
      showToast(`Exported to ~/Downloads/${exportInfo.folder}/${projectInfo}`);
      setTimeout(() => {
        button.classList.remove("exported");
        button.disabled = false;
      }, 1500);
    } catch (error) {
      console.error("Export error:", error);
      button.disabled = false;
      showToast("Export failed", true);
    }
  }

  // Get export folder for a URL
  async function getExportFolderForUrl(url) {
    try {
      const response = await browser.runtime.sendMessage({ action: "getExportFolder", url });
      if (response?.success) {
        return { folder: response.folder, projectName: response.projectName };
      }
    } catch (err) {
      console.warn("Failed to get export folder:", err);
    }
    // Fallback to domain-based folder
    return { folder: getDomainFolder(url), projectName: null };
  }

  // Get domain-based folder from URL
  function getDomainFolder(url) {
    try {
      const parsedUrl = new URL(url);
      const folder = parsedUrl.host
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 50);
      return `${BASE_EXPORT_FOLDER}/${folder || "unknown"}`;
    } catch {
      return `${BASE_EXPORT_FOLDER}/unknown`;
    }
  }

  // Export report to file in ai-agent-reports folder
  async function exportReportToFile(report) {
    const exportInfo = await getExportFolderForUrl(report.pageUrl);
    const markdown = generateMarkdown(report, exportInfo.projectName);
    const filename = generateFilename(report);
    const filepath = `${exportInfo.folder}/${filename}`;

    // Create blob URL
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    try {
      // Use downloads API to save to specific folder
      await browser.downloads.download({
        url: url,
        filename: filepath,
        saveAs: false,
        conflictAction: "uniquify"
      });
      return exportInfo;
    } finally {
      // Clean up blob URL
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  // Generate smart filename from report
  function generateFilename(report) {
    const parts = [];

    // Date prefix for sorting
    const date = report.timestamp
      ? new Date(report.timestamp).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    parts.push(date);

    // Time for uniqueness
    const time = report.timestamp
      ? new Date(report.timestamp).toISOString().slice(11, 19).replace(/:/g, "")
      : Date.now().toString().slice(-6);
    parts.push(time);

    // Hostname from URL
    try {
      const hostname = new URL(report.pageUrl).hostname
        .replace(/^www\./, "")
        .replace(/[^a-z0-9]/gi, "-")
        .slice(0, 30);
      parts.push(hostname);
    } catch {
      parts.push("unknown");
    }

    // Element identifier
    const element = report.tagName || "element";
    const id = report.id ? `-${sanitizeForFilename(report.id).slice(0, 20)}` : "";
    parts.push(`${element}${id}`);

    return parts.join("-") + ".md";
  }

  // Sanitize string for filename
  function sanitizeForFilename(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleDelete(id) {
    try {
      await browser.runtime.sendMessage({ action: "deleteReport", id });
      await loadReports();
    } catch (error) {
      console.error("Delete error:", error);
    }
  }

  // Format element name for display
  function formatElementName(report) {
    const tagName = report.tagName || "unknown";
    let name = `<${tagName}>`;

    if (report.id) {
      name += `#${truncate(report.id, 20)}`;
    } else if (report.className && typeof report.className === "string") {
      const firstClass = report.className.trim().split(/\s+/)[0];
      if (firstClass) {
        name += `.${truncate(firstClass, 20)}`;
      }
    }

    return name;
  }

  // Format URL for display
  function formatUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return parsed.hostname + parsed.pathname;
    } catch {
      return truncate(url, 50);
    }
  }

  // Format timestamp
  function formatTime(timestamp) {
    if (!timestamp) return "";

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return "";

      const now = new Date();
      const diff = now - date;

      if (diff < 0) return date.toLocaleDateString();
      if (diff < 60000) return "Just now";
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

      return date.toLocaleDateString();
    } catch {
      return "";
    }
  }

  // Truncate string
  function truncate(str, maxLength) {
    if (!str || str.length <= maxLength) return str || "";
    return str.substring(0, maxLength) + "...";
  }

  // Copy report as Markdown
  async function copyAsMarkdown(report, button) {
    const originalText = button.textContent;

    try {
      const markdown = generateMarkdown(report);
      await navigator.clipboard.writeText(markdown);

      button.textContent = "Copied!";
      button.classList.add("copied");

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove("copied");
      }, 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
      button.textContent = "Failed";
      setTimeout(() => {
        button.textContent = originalText;
      }, 1500);
    }
  }

  // Generate Markdown report
  function generateMarkdown(report, projectName = null) {
    const lines = [
      "# Element Context Report",
      ""
    ];

    if (projectName) {
      lines.push(`**Project:** ${escapeMarkdown(projectName)}`);
    }

    // Phase 1: Framework info
    if (report.framework && report.framework.name) {
      let frameworkStr = report.framework.name;
      if (report.framework.version) {
        frameworkStr += " " + report.framework.version;
      }
      lines.push(`**Framework:** ${frameworkStr}`);
    }

    // Phase 1: Component info
    if (report.component && report.component.name) {
      let componentStr = report.component.name;
      if (report.component.file) {
        componentStr += ` (${report.component.file})`;
      }
      lines.push(`**Component:** ${componentStr}`);
    }

    lines.push(`**Page:** ${escapeMarkdown(report.pageTitle || "Untitled")}`);
    lines.push(`**URL:** ${report.pageUrl || ""}`);
    lines.push(`**Captured:** ${formatTimestamp(report.timestamp)}`);
    lines.push("");

    if (report.comment?.trim()) {
      lines.push("## Comment");
      lines.push("");
      lines.push(report.comment.trim());
      lines.push("");
    }

    lines.push("## Element");
    lines.push("");
    lines.push(`- **Tag:** \`<${report.tagName || "unknown"}>\``);
    if (report.id) lines.push(`- **ID:** \`${report.id}\``);
    if (report.className) lines.push(`- **Class:** \`${report.className}\``);
    if (report.selector) lines.push(`- **CSS Selector:** \`${report.selector}\``);
    if (report.xpath) lines.push(`- **XPath:** \`${report.xpath}\``);
    lines.push("");

    if (report.textContent?.trim()) {
      lines.push("## Text Content");
      lines.push("");
      lines.push("```");
      lines.push(report.textContent.trim().substring(0, 500));
      lines.push("```");
      lines.push("");
    }

    if (report.attributes && Object.keys(report.attributes).length > 0) {
      lines.push("## Attributes");
      lines.push("");
      for (const [key, value] of Object.entries(report.attributes)) {
        lines.push(`- \`${key}\`: ${escapeMarkdown(String(value))}`);
      }
      lines.push("");
    }

    if (report.computedStyles && Object.keys(report.computedStyles).length > 0) {
      lines.push("## Computed Styles");
      lines.push("");
      lines.push("```css");
      for (const [key, value] of Object.entries(report.computedStyles)) {
        lines.push(`${key}: ${value};`);
      }
      lines.push("```");
      lines.push("");
    }

    if (report.boundingRect) {
      const r = report.boundingRect;
      lines.push("## Bounding Box");
      lines.push("");
      lines.push(`- **Position:** (${r.left ?? 0}, ${r.top ?? 0})`);
      lines.push(`- **Size:** ${r.width ?? 0} x ${r.height ?? 0}px`);
      lines.push("");
    }

    // Phase 1: Component Props
    if (report.component && report.component.props && Object.keys(report.component.props).length > 0) {
      lines.push("## Component Props");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(report.component.props, null, 2));
      lines.push("```");
      lines.push("");
    }

    // Phase 1: Component State
    if (report.component && report.component.state && Object.keys(report.component.state).length > 0) {
      lines.push("## Component State");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(report.component.state, null, 2));
      lines.push("```");
      lines.push("");
    }

    // Phase 1: Data Attributes
    if (report.dataAttributes && Object.keys(report.dataAttributes).length > 0) {
      lines.push("## Data Attributes");
      lines.push("");
      for (const [key, value] of Object.entries(report.dataAttributes)) {
        lines.push(`- \`${key}\`: \`${value}\``);
      }
      lines.push("");
    }

    // Phase 1: Console Errors
    if (report.consoleErrors && report.consoleErrors.length > 0) {
      lines.push("## Recent Console Errors");
      lines.push("");
      for (const entry of report.consoleErrors) {
        const typeLabel = entry.type === "error" ? "ERROR" : "WARN";
        const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "";
        lines.push("```");
        lines.push(`[${typeLabel} ${time}] ${entry.message}`);
        if (entry.stack) {
          lines.push("");
          const stackLines = entry.stack.split("\n").slice(0, 5);
          lines.push(stackLines.join("\n"));
        }
        lines.push("```");
        lines.push("");
      }
    }

    // Phase 1: Network Requests
    if (report.networkRequests && report.networkRequests.length > 0) {
      lines.push("## Recent Network Activity");
      lines.push("");
      lines.push("| Method | URL | Status | Duration |");
      lines.push("|--------|-----|--------|----------|");
      for (const req of report.networkRequests) {
        let url = req.url || "";
        if (url.length > 60) {
          url = url.substring(0, 57) + "...";
        }
        const status = req.status || 0;
        const statusStr = req.failed ? `**${status}**` : String(status);
        const duration = req.duration ? `${req.duration}ms` : "-";
        lines.push(`| ${req.method || "GET"} | \`${url}\` | ${statusStr} | ${duration} |`);
      }
      lines.push("");
    }

    // Phase 1: Developer Context
    if (report.developerContext) {
      lines.push("## Developer Context");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(report.developerContext, null, 2));
      lines.push("```");
      lines.push("");
    }

    return lines.join("\n");
  }

  // Format timestamp for markdown
  function formatTimestamp(timestamp) {
    if (!timestamp) return "Unknown";
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return "Unknown";
    }
  }

  // Escape markdown special characters
  function escapeMarkdown(str) {
    if (!str) return "";
    return str.replace(/[*_`\[\]]/g, "\\$&");
  }

  // Show toast notification
  function showToast(message, isError = false) {
    // Remove existing toasts
    document.querySelectorAll(".export-toast").forEach(t => t.remove());

    const toast = document.createElement("div");
    toast.className = "export-toast";
    if (isError) {
      toast.classList.add("error");
    }
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }

  // ============ Settings Management ============

  // Load project mappings
  async function loadMappings() {
    try {
      const response = await browser.runtime.sendMessage({ action: "getProjectMappings" });
      const mappings = Array.isArray(response?.mappings) ? response.mappings : [];
      mappingsCache = mappings;
      renderMappingsList(mappings);
    } catch (error) {
      console.error("Failed to load mappings:", error);
      renderMappingsList([]);
    }
  }

  // Render mappings list
  function renderMappingsList(mappings) {
    const container = document.getElementById("mappings-list");
    if (!container) return;

    if (mappings.length === 0) {
      container.innerHTML = '<p class="empty-state-small">No project mappings configured</p>';
      return;
    }

    container.innerHTML = mappings.map(mapping => {
      const patternsDisplay = mapping.patterns.slice(0, 3).join(", ");
      const moreCount = mapping.patterns.length > 3 ? ` +${mapping.patterns.length - 3} more` : "";
      return `
        <div class="mapping-item" data-id="${escapeHtml(mapping.id)}">
          <div class="mapping-header">
            <span class="mapping-name">${escapeHtml(mapping.name)}</span>
            <div class="mapping-actions">
              <button class="mapping-edit-btn" data-id="${escapeHtml(mapping.id)}">Edit</button>
              <button class="mapping-delete-btn" data-id="${escapeHtml(mapping.id)}">Delete</button>
            </div>
          </div>
          <span class="mapping-patterns">${escapeHtml(patternsDisplay)}${moreCount}</span>
          <span class="mapping-folder">-> ai-agent-reports/${escapeHtml(mapping.folder)}/</span>
        </div>
      `;
    }).join("");

    // Add event listeners for edit/delete buttons
    container.querySelectorAll(".mapping-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const mapping = mappingsCache.find(m => m.id === btn.dataset.id);
        if (mapping) openMappingDialog(mapping);
      });
    });

    container.querySelectorAll(".mapping-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => handleDeleteMapping(btn.dataset.id));
    });
  }

  // Escape HTML for safe rendering
  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Open mapping dialog
  function openMappingDialog(mapping = null) {
    const dialog = document.getElementById("mapping-dialog");
    const form = document.getElementById("mapping-form");
    const idInput = document.getElementById("mapping-id");
    const nameInput = document.getElementById("mapping-name");
    const patternsInput = document.getElementById("mapping-patterns");
    const folderInput = document.getElementById("mapping-folder");

    if (!dialog || !form) return;

    if (mapping) {
      idInput.value = mapping.id;
      nameInput.value = mapping.name;
      patternsInput.value = mapping.patterns.join("\n");
      folderInput.value = mapping.folder;
    } else {
      form.reset();
      idInput.value = "";
    }

    dialog.showModal();
  }

  // Handle mapping form submit
  async function handleMappingSubmit(e) {
    e.preventDefault();

    const idInput = document.getElementById("mapping-id");
    const nameInput = document.getElementById("mapping-name");
    const patternsInput = document.getElementById("mapping-patterns");
    const folderInput = document.getElementById("mapping-folder");

    const id = idInput.value;
    const name = nameInput.value.trim();
    const patterns = patternsInput.value.split("\n").map(p => p.trim()).filter(p => p);
    const folder = folderInput.value.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "-").replace(/-+/g, "-");

    if (!name || patterns.length === 0 || !folder) {
      showToast("Please fill all fields", true);
      return;
    }

    try {
      // Get current mappings
      const response = await browser.runtime.sendMessage({ action: "getProjectMappings" });
      let mappings = Array.isArray(response?.mappings) ? response.mappings : [];

      if (id) {
        // Update existing
        const index = mappings.findIndex(m => m.id === id);
        if (index !== -1) {
          mappings[index] = { id, name, patterns, folder };
        }
      } else {
        // Add new
        mappings.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name,
          patterns,
          folder
        });
      }

      await browser.runtime.sendMessage({ action: "saveProjectMappings", mappings });
      document.getElementById("mapping-dialog").close();
      await loadMappings();
      showToast("Project mapping saved");
    } catch (error) {
      console.error("Failed to save mapping:", error);
      showToast("Failed to save mapping", true);
    }
  }

  // Handle delete mapping
  async function handleDeleteMapping(mappingId) {
    try {
      const response = await browser.runtime.sendMessage({ action: "getProjectMappings" });
      let mappings = Array.isArray(response?.mappings) ? response.mappings : [];
      mappings = mappings.filter(m => m.id !== mappingId);
      await browser.runtime.sendMessage({ action: "saveProjectMappings", mappings });
      await loadMappings();
      showToast("Project mapping deleted");
    } catch (error) {
      console.error("Failed to delete mapping:", error);
      showToast("Failed to delete mapping", true);
    }
  }

  // Settings event listeners
  const addMappingBtn = document.getElementById("add-mapping-btn");
  if (addMappingBtn) {
    addMappingBtn.addEventListener("click", () => openMappingDialog());
  }

  const mappingForm = document.getElementById("mapping-form");
  if (mappingForm) {
    mappingForm.addEventListener("submit", handleMappingSubmit);
  }

  const mappingCancel = document.getElementById("mapping-cancel");
  if (mappingCancel) {
    mappingCancel.addEventListener("click", () => {
      document.getElementById("mapping-dialog").close();
    });
  }
});
