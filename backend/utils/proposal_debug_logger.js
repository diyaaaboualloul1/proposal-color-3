const fs = require('fs')
const path = require('path')

const LOG_DIR = '/srs-platform/backend/logs'
const LOG_FILE = path.join(LOG_DIR, 'proposal_builder_debug.log')

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function log(level, context, message, data = {}) {
  ensureLogDir()
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] [${level}] [${context}] ${message} | data=${JSON.stringify(data)}\n`
  fs.appendFileSync(LOG_FILE, logLine)
  if (level === 'ERROR') console.error(`[PROPOSAL_DEBUG] ${message}`, data)
}

function logAction(context, message, data) { log('INFO', context, message, data) }
function logError(context, message, data) { log('ERROR', context, message, data) }
function logDebug(context, message, data) { log('DEBUG', context, message, data) }

module.exports = { logAction, logError, logDebug, LOG_FILE }
