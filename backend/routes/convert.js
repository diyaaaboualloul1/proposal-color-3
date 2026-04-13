const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const authMiddleware = require('../middleware/auth');

const execFileAsync = promisify(execFile);

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/srs-platform/uploads';
const UPLOAD_MAX_MB = parseInt(process.env.UPLOAD_MAX_MB) || 20;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload-${unique}.pdf`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files allowed'));
    }
    cb(null, true);
  }
});

// POST /convert/pdf-to-md
router.post('/pdf-to-md', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'PDF file required' });
  }
  
  const filePath = req.file.path;
  
  try {
    let textContent;
    
    // Try pdftotext first (system command)
    try {
      const { stdout } = await execFileAsync('pdftotext', [filePath, '-'], { maxBuffer: 10 * 1024 * 1024 });
      textContent = stdout;
    } catch (cmdErr) {
      // Fallback to pdf-parse npm package
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        textContent = pdfData.text;
      } catch (parseErr) {
        throw new Error('PDF text extraction failed: ' + parseErr.message);
      }
    }
    
    const originalName = req.file.originalname.replace('.pdf', '');
    
    res.json({
      filename: originalName,
      content: textContent
    });
  } catch (err) {
    console.error('PDF conversion error:', err);
    res.status(500).json({ error: err.message || 'PDF conversion failed' });
  } finally {
    // Clean up uploaded file
    fs.unlink(filePath).catch(() => {});
  }
});

// Handle multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Max ${UPLOAD_MAX_MB}MB allowed.` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message === 'Only PDF files allowed') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
