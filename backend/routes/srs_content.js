const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')

// GET /api/srs-content?path=filepath — read and return SRS markdown content
router.get('/', (req, res) => {
  try {
    const filePath = req.query.path
    if (!filePath) return res.status(400).json({ error: 'path query required' })
    // Security: ensure path is within /srs-platform/projects
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith('/srs-platform/projects')) {
      return res.status(403).json({ error: 'Invalid path' })
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found' })
    }
    const content = fs.readFileSync(resolved, 'utf8')
    res.json({ content })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
