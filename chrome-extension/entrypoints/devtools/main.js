// DevTools page entry point
// Creates the sidebar pane in the Elements panel and the Deep Inspection panel

// Sidebar pane for element context capture
chrome.devtools.panels.elements.createSidebarPane(
  "Context Report",
  function(sidebar) {
    sidebar.setPage("sidebar.html");
  }
);

// Deep Inspection panel for session recording
chrome.devtools.panels.create(
  "Deep Inspection",
  "",  // No icon (will use default)
  "inspector/index.html",
  function(panel) {
    // Panel created - optional callback for panel events
  }
);
