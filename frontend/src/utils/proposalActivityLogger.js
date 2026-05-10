/**
 * Proposal Builder Activity Logger
 * Logs all user actions and data transitions to a JSON file for debugging and review.
 * File: /srs-platform/frontend/src/utils/proposalActivityLogger.js
 */

// Simple timestamp without date-fns dependency

const LOG_FILE = 'proposal-builder-activity.log'
const MAX_LOG_ENTRIES = 500

// In-memory store for client-side logging
let entries = []

function timestamp() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

function log(level, category, message, data = {}) {
  const entry = {
    _t: timestamp(),
    level,      // INFO | WARN | ERROR | SUCCESS
    category,   // WIZARD | TEMPLATE | PROJECT | SRS | BLOCKS | SAVE | EXPORT | SYNC
    message,
    data
  }
  entries.push(entry)
  if (entries.length > MAX_LOG_ENTRIES) entries.shift()

  // Also console.log for immediate visibility
  const prefix = `[${entry._t}] [${category}] [${level}]`
  if (level === 'ERROR') console.error(prefix, message, data)
  else if (level === 'WARN') console.warn(prefix, message, data)
  else console.log(prefix, message, data)

  return entry
}

// --- User-Facing Step-by-Step Logging ---

export const logger = {
  // Step 1 — Create proposal
  wizardStarted(name) {
    log('INFO', 'WIZARD', `Proposal creation started: "${name}"`)
  },
  templateSelected(templateId, templateName) {
    log('INFO', 'TEMPLATE', `Template selected: ${templateName} (id: ${templateId})`)
  },
  // Step 3 — Project linked
  projectLinked(projectId, projectName) {
    log('INFO', 'PROJECT', `Project linked: ${projectName} (id: ${projectId})`)
  },
  projectUnlinked() {
    log('INFO', 'PROJECT', 'Project unlinked')
  },
  // Step 4 — SRS Version selected
  srsVersionSelected(versionId, versionLabel) {
    log('INFO', 'SRS', `SRS version selected: ${versionLabel} (id: ${versionId})`)
  },
  srsDataLoaded(versionLabel, scopeCount, techStackCount, overviewText) {
    log('SUCCESS', 'SRS', `SRS data loaded — scope: ${scopeCount} items, techStack: ${techStackCount} items, overview: ${overviewText ? 'yes' : 'no'}`)
  },
  srsDataFailed(error) {
    log('ERROR', 'SRS', `SRS data failed to load: ${error}`)
  },
  // Step 5 — SRS Panel shown / hidden
  srsPanelOpened(proposalId) {
    log('INFO', 'SRS', `SRS Data Panel opened for proposal ${proposalId}`)
  },
  srsPanelClosed() {
    log('INFO', 'SRS', 'SRS Data Panel closed')
  },
  // Blocks added from SRS
  allBlocksInserted(blockCount, scopeItems, techStackItems) {
    log('SUCCESS', 'BLOCKS', `Add All Blocks: ${blockCount} blocks inserted (scope: ${scopeItems}, techStack: ${techStackItems})`)
  },
  singleBlockInserted(blockType, itemCount) {
    log('INFO', 'BLOCKS', `Single block inserted: type=${blockType}, items=${itemCount}`)
  },
  blockDeleted(blockId, blockType) {
    log('INFO', 'BLOCKS', `Block deleted: ${blockType} (${blockId})`)
  },
  // Step 7 — Save version
  versionSaved(versionId, versionLabel, blocksCount) {
    log('SUCCESS', 'SAVE', `Version saved: #${versionId} "${versionLabel}" — ${blocksCount} blocks`)
  },
  // Step 6/8 — PDF export
  pdfGenerationStarted(blockCount) {
    log('INFO', 'EXPORT', `PDF generation started — ${blockCount} blocks`)
  },
  pdfGenerationComplete(fileName) {
    log('SUCCESS', 'EXPORT', `PDF generated: ${fileName}`)
  },
  pdfGenerationFailed(error) {
    log('ERROR', 'EXPORT', `PDF generation failed: ${error}`)
  },
  // Step 8 — Export matches builder
  exportMatchesBuilder(comparisonResult) {
    log('INFO', 'EXPORT', `Export vs Builder comparison: ${comparisonResult}`)
  },
  // Sync events
  syncEffectFired(prevId, nextId, prevLen, nextLen, action) {
    log('INFO', 'SYNC', `Sync effect — prevId: ${prevId} → nextId: ${nextId} | prevLen: ${prevLen} → nextLen: ${nextLen} | action: ${action}`)
  },
  syncSkipped(reason) {
    log('INFO', 'SYNC', `Sync suppressed: ${reason}`)
  },
  // API errors
  apiError(endpoint, method, error) {
    log('ERROR', 'API', `${method} ${endpoint} failed: ${error}`)
  },
  // Fetch proposal
  proposalLoaded(proposalId, blockCount, projectId) {
    log('INFO', 'WIZARD', `Proposal ${proposalId} loaded — ${blockCount} blocks, project_id: ${projectId}`)
  },

  // Get all log entries for display
  getEntries() {
    return [...entries]
  },

  // Export as formatted string for display
  getFormattedLog() {
    return entries.map(e => `[${e._t}] [${e.category}] [${e.level}] ${e.message}${e.data && Object.keys(e.data).length ? ' → ' + JSON.stringify(e.data) : ''}`).join('\n')
  },

  // Summary for a specific category
  getCategorySummary(category) {
    const filtered = entries.filter(e => e.category === category)
    return filtered.map(e => `[${e._t}] ${e.message}`).join('\n')
  }
}

export default logger