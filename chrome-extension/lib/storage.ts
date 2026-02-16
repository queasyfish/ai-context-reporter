/**
 * Storage module for Claude Context Report Chrome Extension
 *
 * Provides typed CRUD operations for Report storage using chrome.storage.local.
 * This module isolates storage implementation from business logic.
 */

const STORAGE_KEY = 'claude-context-report';
const SETTINGS_KEY = 'claude-context-settings';

/**
 * Project mapping for URL-based folder routing
 */
export interface ProjectMapping {
  id: string;
  name: string;
  patterns: string[];  // URL patterns like "localhost:3000", "*.myapp.com"
  folder: string;      // Subfolder name within ai-agent-reports
}

/**
 * Report interface matching PROJECT.md schema.
 * Represents a captured element report with user comment.
 */
export interface Report {
  reportId: string;
  url: string;
  comment: string;
  element: {
    selector: string;
    xpath: string;
    computedStyles: Record<string, string>;
  };
}

/**
 * Get all reports from storage.
 * @returns Promise resolving to array of reports (empty array if none exist)
 */
export async function getReports(): Promise<Report[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] || [];
}

/**
 * Save a new report to storage.
 * Appends the report to the existing array.
 * @param report The report to save
 */
export async function saveReport(report: Report): Promise<void> {
  const reports = await getReports();
  reports.push(report);
  await chrome.storage.local.set({ [STORAGE_KEY]: reports });
}

/**
 * Delete a report by its ID.
 * @param reportId The ID of the report to delete
 */
export async function deleteReport(reportId: string): Promise<void> {
  const reports = await getReports();
  const filtered = reports.filter((r) => r.reportId !== reportId);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

/**
 * Clear all reports from storage.
 */
export async function clearReports(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * Get all project mappings from storage.
 */
export async function getProjectMappings(): Promise<ProjectMapping[]> {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  return result[SETTINGS_KEY]?.projectMappings || [];
}

/**
 * Save project mappings to storage.
 */
export async function saveProjectMappings(mappings: ProjectMapping[]): Promise<void> {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  const settings = result[SETTINGS_KEY] || {};
  settings.projectMappings = mappings;
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

/**
 * Add a new project mapping.
 */
export async function addProjectMapping(mapping: Omit<ProjectMapping, 'id'>): Promise<ProjectMapping> {
  const mappings = await getProjectMappings();
  const newMapping: ProjectMapping = {
    ...mapping,
    id: crypto.randomUUID()
  };
  mappings.push(newMapping);
  await saveProjectMappings(mappings);
  return newMapping;
}

/**
 * Update an existing project mapping.
 */
export async function updateProjectMapping(id: string, updates: Partial<Omit<ProjectMapping, 'id'>>): Promise<void> {
  const mappings = await getProjectMappings();
  const index = mappings.findIndex(m => m.id === id);
  if (index !== -1) {
    mappings[index] = { ...mappings[index], ...updates };
    await saveProjectMappings(mappings);
  }
}

/**
 * Delete a project mapping.
 */
export async function deleteProjectMapping(id: string): Promise<void> {
  const mappings = await getProjectMappings();
  const filtered = mappings.filter(m => m.id !== id);
  await saveProjectMappings(filtered);
}

/**
 * Match a URL against project mappings.
 * Returns the matching project or null if no match.
 */
export function matchUrlToProject(url: string, mappings: ProjectMapping[]): ProjectMapping | null {
  if (!url || mappings.length === 0) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const urlHost = parsedUrl.host; // includes port if present
  const urlHostname = parsedUrl.hostname;

  for (const mapping of mappings) {
    for (const pattern of mapping.patterns) {
      const trimmedPattern = pattern.trim().toLowerCase();
      if (!trimmedPattern) continue;

      // Check for wildcard patterns
      if (trimmedPattern.startsWith('*.')) {
        // *.example.com matches example.com and sub.example.com
        const suffix = trimmedPattern.slice(2);
        if (urlHostname.toLowerCase() === suffix || urlHostname.toLowerCase().endsWith('.' + suffix)) {
          return mapping;
        }
      } else if (trimmedPattern.endsWith(':*')) {
        // localhost:* matches localhost with any port
        const prefix = trimmedPattern.slice(0, -2);
        if (urlHostname.toLowerCase() === prefix) {
          return mapping;
        }
      } else {
        // Exact match on host (domain:port) or hostname
        if (urlHost.toLowerCase() === trimmedPattern || urlHostname.toLowerCase() === trimmedPattern) {
          return mapping;
        }
      }
    }
  }

  return null;
}

/**
 * Get the export folder for a given URL.
 * Uses project mapping if available, otherwise creates domain-based subfolder.
 */
export async function getExportFolder(url: string): Promise<{ folder: string; projectName: string | null }> {
  const mappings = await getProjectMappings();
  const matchedProject = matchUrlToProject(url, mappings);

  if (matchedProject) {
    return {
      folder: `ai-agent-reports/${sanitizeFolderName(matchedProject.folder)}`,
      projectName: matchedProject.name
    };
  }

  // Fall back to domain-based folder
  const domainFolder = getDomainFolder(url);
  return {
    folder: `ai-agent-reports/${domainFolder}`,
    projectName: null
  };
}

/**
 * Extract domain folder name from URL.
 */
function getDomainFolder(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Use host (includes port) for localhost, hostname for others
    let folder = parsedUrl.host;
    // Sanitize for filesystem
    return sanitizeFolderName(folder);
  } catch {
    return 'unknown';
  }
}

/**
 * Sanitize a string for use as a folder name.
 */
function sanitizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'default';
}
