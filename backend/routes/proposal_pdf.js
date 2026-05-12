const express = require('express')
const router = express.Router()
const fs = require('fs')
const { logAction, logError, logDebug } = require('../utils/proposal_debug_logger')
const path = require('path')
const { Pool } = require('pg')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'srs_platform_db',
  user: process.env.PGUSER || 'srs_user',
  password: process.env.PGPASSWORD || 'SrsPlatform2026!',
})

// SRS brand colors
const ORANGE   = rgb(0.910, 0.314, 0.039)   // #E8500A
const DARK     = rgb(0.102, 0.102, 0.180)    // #1A1A2E
const GRAY     = rgb(0.420, 0.447, 0.498)    // #6B7280
const LGRAY    = rgb(0.953, 0.957, 0.965)    // #F3F4F6
const DIVIDER  = rgb(0.898, 0.906, 0.922)     // #E5E7EB
const WHITE    = rgb(1.0,   1.0,   1.0)

// Load and embed cover background image once at startup
const COVER_BG_PATH = path.join(__dirname, '50studios-cover-bg.jpg')
let _coverBgBytes = null
try {
  _coverBgBytes = fs.readFileSync(COVER_BG_PATH)
} catch {}

function hexToRgb(hex) {
  if (!hex) return DARK
  if (typeof hex !== 'string') return hex
  // Extract #hex or rgb() from CSS values like 'color:#ef4444' or 'rgb(255,0,0)'
  const hexMatch = hex.match(/#([0-9a-fA-F]{6})/)
  if (hexMatch) hex = '#' + hexMatch[1]
  else {
    const rgbMatch = hex.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
    if (rgbMatch) {
      return rgb(parseInt(rgbMatch[1]) / 255, parseInt(rgbMatch[2]) / 255, parseInt(rgbMatch[3]) / 255)
    }
    return DARK
  }
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return rgb(r, g, b)
  } catch { return DARK }
}

// ── Page constants ─────────────────────────────────────────────
const PAGE_W  = 595.28   // A4
const PAGE_H  = 841.89
const MARGIN  = 50
const CONTENT_W = PAGE_W - MARGIN * 2

// ── Header/footer helper ────────────────────────────────────────
function drawHeader(page, fonts, docTitle) {
  const { helv, helvB } = fonts
  // White bar at top — draw on the page directly
  page.drawRectangle({ x: 0, y: PAGE_H - 0.55 * 72, width: PAGE_W, height: 0.55 * 72, color: WHITE })
  // Orange underline
  page.drawLine({ start: { x: MARGIN, y: PAGE_H - 0.55 * 72 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 0.55 * 72 }, thickness: 1.5, color: ORANGE })
  // Company name left
  page.drawText('Fifty Studios Holding Company', { x: MARGIN, y: PAGE_H - 0.30 * 72, size: 9, font: helvB, color: DARK })
  // Title right — truncate if needed using font.widthOfTextAtSize
  let title = docTitle || ''
  const maxW = (PAGE_W - 2 * MARGIN) * 0.55
  while (title.length > 10 && helv.widthOfTextAtSize(title, 8) > maxW)
    title = title.slice(0, -2).trimEnd() + '…'
  page.drawText(title, { x: PAGE_W - MARGIN - helv.widthOfTextAtSize(title, 8), y: PAGE_H - 0.30 * 72, size: 8, font: helv, color: GRAY })
}

function drawFooter(page, fonts, pageNum) {
  const { helv } = fonts
  page.drawLine({ start: { x: MARGIN, y: 0.44 * 72 }, end: { x: PAGE_W - MARGIN, y: 0.44 * 72 }, thickness: 0.5, color: DIVIDER })
  page.drawText('Fifty Studios Holding Company  |  www.5ostudios.com', { x: MARGIN, y: 0.28 * 72, size: 7.5, font: helv, color: GRAY })
  page.drawText(`Page ${pageNum}`, { x: PAGE_W - MARGIN - helv.widthOfTextAtSize(`Page ${pageNum}`, 7.5), y: 0.28 * 72, size: 7.5, font: helv, color: GRAY })
}

// ── Cover page (70/30 SRS layout) ────────────────────────────────
function drawCoverPage(page, fonts, block, embeddedBg) {
  const { helv, helvB } = fonts
  const c   = block.content
  const topH = PAGE_H * 0.70
  const botH = PAGE_H * 0.30

  // TOP 70% — Cover background image if available, else solid orange
  if (embeddedBg) {
    page.drawImage(embeddedBg, { x: 0, y: botH, width: PAGE_W, height: topH })
  } else {
    page.drawRectangle({ x: 0, y: botH, width: PAGE_W, height: topH, color: ORANGE })
  }

  // Company name text above title (centered, small)
  page.drawText('FIFTY STUDIOS', {
    x: MARGIN, y: botH + topH - 60,
    size: 10, font: helvB, color: WHITE, width: CONTENT_W, align: 'center',
    characterSpacing: 3,
  })

  // Title
  const title = c.title || 'Project Proposal'
  let titleSize = 22
  while (titleSize > 13 && helvB.widthOfTextAtSize(title, titleSize) > CONTENT_W)
    titleSize--
  page.drawText(title, {
    x: MARGIN, y: botH + topH - 130,
    size: titleSize, font: helvB, color: WHITE, width: CONTENT_W, align: 'center',
  })

  // Subtitle
  page.drawText(c.subtitle || 'Proposal', {
    x: MARGIN, y: botH + topH - 155,
    size: 11, font: helv, color: rgb(1, 1, 1, 0.75), width: CONTENT_W, align: 'center',
  })

  // Orange divider line
  page.drawRectangle({ x: MARGIN, y: botH + topH - 168, width: CONTENT_W, height: 2, color: ORANGE })

  // BOTTOM 30% — White info area
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: botH, color: WHITE })

  // 3-column address row
  const colW = CONTENT_W / 3
  const addressCols = [
    ['Address', ['Ahmed Al-Jaber St. Prime Tower', 'Capital, Sharq']],
    ['Contacts', ['Phone: +965 9879 9919', 'Email: info@5ostudios.com']],
    ['Online', ['Website: www.5ostudios.com', '']],
  ]
  let ay = botH - 20
  for (let i = 0; i < addressCols.length; i++) {
    const [lbl, lines] = addressCols[i]
    const ax = MARGIN + i * colW
    page.drawText(lbl.toUpperCase(), { x: ax, y: ay, size: 8, font: helvB, color: ORANGE })
    for (let j = 0; j < lines.length; j++) {
      if (!lines[j]) continue
      page.drawText(lines[j], { x: ax, y: ay - 11 - j * 11, size: 8, font: helv, color: DARK })
    }
  }

  ay -= 42
  // Divider
  page.drawRectangle({ x: MARGIN, y: ay, width: CONTENT_W, height: 0.5, color: DIVIDER })
  ay -= 14

  // Client name
  const clientName = c.client || ''
  if (clientName) {
    page.drawText(clientName, { x: MARGIN, y: ay, size: 13, font: helvB, color: DARK })
    ay -= 18
  }

  // Date + Prepared-by row (gray bg)
  const rowH = 18
  page.drawRectangle({ x: MARGIN, y: ay - rowH, width: CONTENT_W, height: rowH, color: LGRAY })
  page.drawRectangle({ x: MARGIN, y: ay - rowH, width: CONTENT_W, height: rowH, borderColor: DIVIDER, borderWidth: 0.4 })
  const today = c.date || ''
  page.drawText('DATE', { x: MARGIN + 6, y: ay - rowH + 5, size: 8, font: helvB, color: ORANGE })
  page.drawText(today, { x: MARGIN + 55, y: ay - rowH + 5, size: 8, font: helv, color: DARK })
  page.drawText('PREPARED BY', { x: MARGIN + CONTENT_W / 2 + 6, y: ay - rowH + 5, size: 8, font: helvB, color: ORANGE })
  page.drawText('Fifty Studios Holding Company', { x: MARGIN + CONTENT_W / 2 + 75, y: ay - rowH + 5, size: 8, font: helv, color: DARK })

  ay -= rowH + 10
  page.drawText('Private & Confidential — All rights reserved © Fifty Studios Holding Company', {
    x: MARGIN, y: ay, size: 7.5, font: helv, color: GRAY,
  })
}

// ── Block renderer ───────────────────────────────────────────────
async function renderBlock(page, doc, block, pageWidth, pageHeight, margin, y, fonts, pageCallback) {
  const { helv, helvB } = fonts
  const contentWidth = pageWidth - margin * 2

  function newPageIfNeeded(needed) {
    if (y < needed) {
      page = doc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
      if (pageCallback) pageCallback(page)
    }
  }

  try {
    switch (block.type) {
      case 'cover': {
        drawCoverPage(page, fonts, block, embeddedBg)
        // Always start new page after cover so content has clean start
        page = doc.addPage([pageWidth, pageHeight])
        y = pageHeight - margin
        if (pageCallback) pageCallback(page)
        break
      }
      case 'pagebreak': {
        page = doc.addPage([pageWidth, pageHeight])
        y = pageHeight - margin
        if (pageCallback) pageCallback(page)
        // Add top margin when starting new content page
        y -= 30
        break
      }
      case 'pagebreak': {
        page = doc.addPage([pageWidth, pageHeight])
        y = pageHeight - margin
        if (pageCallback) pageCallback(page)
        break
      }
      case 'text': {
        if (block.content.html) {
          const plain = block.content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          const words = plain.split(' ')
          let line = ''
          for (const word of words) {
            const test = line + (line ? ' ' : '') + word
            // Wrap when pixel width exceeds available content width
            if (helv.widthOfTextAtSize(test, 11) > contentWidth) {
              newPageIfNeeded(margin + 30)
              page.drawText(line.trim(), { x: margin, y, size: 11, font: helv, color: DARK, width: contentWidth })
              y -= 16
              line = word
            } else { line = test }
          }
          if (line) {
            newPageIfNeeded(margin + 20)
            page.drawText(line.trim(), { x: margin, y, size: 11, font: helv, color: DARK, width: contentWidth })
            y -= 16
          }
          y -= 6
        }
        break
      }
      case 'heading': {
        newPageIfNeeded(margin + 50)
        const sizes = { 1: 20, 2: 16, 3: 13 }
        let size = sizes[block.content.level] || 16
        const rawText = block.content.text || ''
        while (size > 9 && helvB.widthOfTextAtSize(rawText, size) > contentWidth)
          size--
        page.drawText(rawText, { x: margin, y, size, font: helvB, color: DARK, width: contentWidth })
        y -= size + 12
        break
      }
      case 'table': {
        const headers = block.content.headers || []
        const rows = block.content.rows || []
        if (block.content.sectionTitle) {
          newPageIfNeeded(margin + 50)
          page.drawText(block.content.sectionTitle, { x: margin, y, size: 14, font: helvB, color: ORANGE, width: contentWidth })
          y -= 24
        }
        if (!headers.length) { y -= 6; break }
        newPageIfNeeded(margin + 60)
        const colW = contentWidth / headers.length
        const rowH = 20
        let xOff = margin
        for (const h of headers) {
          page.drawRectangle({ x: xOff, y: y - rowH + 5, width: colW, height: rowH, color: ORANGE })
          page.drawText(h || '', { x: xOff + 4, y: y - 14, size: 9, font: helvB, color: WHITE, width: colW - 8 })
          xOff += colW
        }
        y -= rowH + 2
        for (const row of rows) {
          newPageIfNeeded(margin + 30)
          xOff = margin
          for (const cell of row) {
            page.drawRectangle({ x: xOff, y: y - rowH + 5, width: colW, height: rowH, borderColor: DIVIDER, borderWidth: 0.5 })
            // Strip HTML, then render word-by-word with per-word colors
            const cellHtml = String(cell || '')
            const plain = cellHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            const words = plain.split(' ').filter(w => w)
            // Quick single-color fallback for short cells
            if (words.length <= 2) {
              page.drawText(plain.slice(0, 30), { x: xOff + 4, y: y - 14, size: 9, font: helv, color: DARK, width: colW - 8 })
            } else {
              // Multi-word: draw at cell start, truncate if too wide
              const cellText = words.join(' ')
              let short = cellText
              while (short.length > 28 && short.length > 0) {
                const test = short.slice(0, 30)
                if (helv.widthOfTextAtSize(test, 9) <= colW - 8) break
                short = short.slice(0, -1)
              }
              page.drawText(short || plain.slice(0, 28), { x: xOff + 4, y: y - 14, size: 9, font: helv, color: DARK, width: colW - 8 })
            }
            xOff += colW
          }
          y -= rowH
        }
        y -= 12
        break
      }
      case 'pricing': {
        const items = block.content.items || []
        newPageIfNeeded(margin + 50)
        if (block.content.sectionTitle) {
          page.drawText(block.content.sectionTitle, { x: margin, y, size: 14, font: helvB, color: ORANGE, width: contentWidth })
          y -= 24
        }
        for (const item of items) {
          newPageIfNeeded(margin + 20)
          page.drawText(item.label || '', { x: margin, y, size: 11, font: helv, color: DARK, width: contentWidth - 90 })
          page.drawText(`${block.content.currency || 'KWD'} ${(item.price || 0).toLocaleString()}`, { x: pageWidth - margin - 90, y, size: 11, font: helvB, color: ORANGE, width: 90, align: 'right' })
          y -= 20
        }
        y -= 12
        break
      }
      case 'timeline': {
        const phases = block.content.phases || []
        newPageIfNeeded(margin + 50)
        page.drawText('Timeline', { x: margin, y, size: 14, font: helvB, color: ORANGE, width: contentWidth })
        y -= 26
        for (let i = 0; i < phases.length; i++) {
          newPageIfNeeded(margin + 20)
          const p = phases[i]
          page.drawText(`#${i + 1}`, { x: margin, y: y - 8, size: 10, font: helvB, color: ORANGE, width: 22 })
          page.drawText(p.name || `Phase ${i + 1}`, { x: margin + 26, y: y - 8, size: 11, font: helv, color: DARK, width: contentWidth - 120 })
          if (p.duration) {
            page.drawText(p.duration, { x: pageWidth - margin - 70, y: y - 8, size: 10, font: helv, color: GRAY, width: 70, align: 'right' })
          }
          y -= 26
        }
        y -= 12
        break
      }
      case 'callout': {
        newPageIfNeeded(margin + 50)
        const bgColor = hexToRgb(block.content.bgColor)
        const textColor = hexToRgb(block.content.textColor)
        page.drawRectangle({ x: margin, y: y - 45, width: contentWidth, height: 45, color: bgColor })
        page.drawText((block.content.text || '').slice(0, 120), { x: margin + 10, y: y - 26, size: 11, font: helv, color: textColor, width: contentWidth - 20 })
        y -= 55
        break
      }
            case 'scope': {
        const items = block.content.items || []
        if (block.content.marginTop) { y -= parseInt(block.content.marginTop) || 0 }
        if (block.content.sectionTitle) {
          newPageIfNeeded(margin + 50)
          page.drawText(block.content.sectionTitle, { x: margin, y, size: 14, font: helvB, color: ORANGE, width: contentWidth })
          y -= 24
        }
        for (const item of items) {
          if (!item) continue
          newPageIfNeeded(margin + 30)
          page.drawText('•', { x: margin, y, size: 11, font: helv, color: DARK, width: 20 })
          const label = item.label || item.text || ''
          const labelColor = item.color ? hexToRgb(item.color) : DARK
          const restText = item.text ? label.replace(item.label || '', '') : ''
          const labelText = item.label || label
          // Parse HTML color spans in label text (same as overview and list blocks)
          const colorRe = /<span[^>]*style=["'][^"']*color:\s*(rgb\([^)]+\)|#[0-9a-fA-F]{6})[^"']*["'][^>]*>([^<]*)<\/span>/gi
          const segs = []
          let lastIdx = 0
          let m
          while ((m = colorRe.exec(labelText)) !== null) {
            if (m.index > lastIdx) {
              const plain = labelText.slice(lastIdx, m.index).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
              for (const w of plain.split(' ')) { if (w) segs.push({ text: w, color: null }) }
            }
            for (const w of m[2].trim().split(' ')) { if (w) segs.push({ text: w, color: m[1] }) }
            lastIdx = colorRe.lastIndex
          }
          if (lastIdx < labelText.length) {
            const plain = labelText.slice(lastIdx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            for (const w of plain.split(' ')) { if (w) segs.push({ text: w, color: null }) }
          }
          if (!segs.length) {
            for (const w of labelText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ')) {
              if (w) segs.push({ text: w, color: null })
            }
          }
          let xPos = margin + 15
          let lineBuf = ''
          let lineColor = labelColor
          for (const seg of segs) {
            const segColor = seg.color ? hexToRgb(seg.color) : labelColor
            if (!seg.color) {
              // Plain word: accumulate with word-wrap
              const test = lineBuf + (lineBuf ? ' ' : '') + seg.text
              if (helv.widthOfTextAtSize(test, 11) > contentWidth - 15 && lineBuf) {
                newPageIfNeeded(margin + 20)
                page.drawText(lineBuf.trim(), { x: margin + 15, y, size: 11, font: helv, color: lineColor, width: contentWidth - 15 })
                y -= 16
                xPos = margin + 15
                lineBuf = ''
              }
              lineBuf += (lineBuf ? ' ' : '') + seg.text
            } else {
              // Colored word: flush plain buffer at xPos before colored word
              if (lineBuf.trim()) {
                newPageIfNeeded(margin + 20)
                page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: lineColor, width: contentWidth - 15 })
                xPos += helv.widthOfTextAtSize(lineBuf.trim(), 11) + 6
                lineBuf = ''
              }
              // Draw colored word at current xPos
              newPageIfNeeded(margin + 20)
              page.drawText(seg.text, { x: xPos, y, size: 11, font: helv, color: segColor, width: contentWidth - 15 })
              xPos += helv.widthOfTextAtSize(seg.text, 11) + 6
              // After colored word: move to next line, reset xPos to start of line
              // Remaining plain words continue from margin on the next line
              y -= 16
              xPos = margin + 15
              lineColor = labelColor
            }
          }
          if (lineBuf.trim()) {
            newPageIfNeeded(margin + 20)
            page.drawText(lineBuf.trim(), { x: margin + 15, y, size: 11, font: helv, color: lineColor, width: contentWidth - 15 })
            y -= 16
          }
        }
        y -= 6
        if (block.content.marginBottom) { y -= parseInt(block.content.marginBottom) || 0 }
        break
      }case 'techstack': {
        const items = block.content.items || []
        newPageIfNeeded(margin + 40)
        page.drawText('Tech Stack', { x: margin, y, size: 14, font: helvB, color: ORANGE, width: contentWidth })
        y -= 24
        for (const item of items) {
          newPageIfNeeded(margin + 20)
          page.drawText(`• ${(item.label || item || '').slice(0, 100)}`, { x: margin, y, size: 11, font: helv, color: DARK, width: contentWidth })
          y -= 17
        }
        y -= 6
        break
      }
      case 'overview': {
        const text = block.content.text || block.content.html || ''
        if (!text.trim()) { if (block.content.marginBottom) y -= parseInt(block.content.marginBottom) || 0; break }
        newPageIfNeeded(margin + 50)
        page.drawText('Overview', { x: margin, y, size: 14, font: helvB, color: ORANGE, width: contentWidth })
        y -= 24
        // Parse colored spans: plain segments + colored words
        const segments = []
        const colorRe = /<span[^>]*style=["'][^"']*color:\s*(rgb\([^)]+\)|#[0-9a-fA-F]{6})[^"']*["'][^>]*>([^<]*)<\/span>/gi
        let lastIndex = 0
        let m
        while ((m = colorRe.exec(text)) !== null) {
          if (m.index > lastIndex) {
            const chunk = text.slice(lastIndex, m.index).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            if (chunk) segments.push({ text: chunk, color: null })
          }
          segments.push({ text: m[2], color: m[1] })
          lastIndex = colorRe.lastIndex
        }
        if (lastIndex < text.length) {
          const remainder = text.slice(lastIndex).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          if (remainder) segments.push({ text: remainder, color: null })
        }
        if (!segments.length) segments.push({ text: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), color: null })
        // Segments: plain segments + colored words, all inline on same y
        let lineBuf = ''
        let xPos = margin
        let skipFirstWord = false  // Skip first word of plain segment if it was replaced by colored word
        for (const seg of segments) {
          newPageIfNeeded(margin + 20)
          const segColor = seg.color ? hexToRgb(seg.color) : DARK
          if (seg.color) {
            // Draw any pending plain text, then colored word — all on same y
            if (lineBuf.trim()) {
              page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: DARK, width: contentWidth })
              xPos += helv.widthOfTextAtSize(lineBuf.trim(), 11) + 6
              lineBuf = ''
            }
            page.drawText(seg.text, { x: xPos, y, size: 11, font: helv, color: segColor, width: contentWidth })
            xPos += helv.widthOfTextAtSize(seg.text, 11) + 6
            // After colored word: keep xPos where we left off (don't reset to margin yet)
            // Plain text continuing this segment will accumulate from xPos
            skipFirstWord = true
          } else {
            // Plain text: accumulate from current xPos with word-wrap
            const words = seg.text.split(' ')
            for (let wi = 0; wi < words.length; wi++) {
              const w = words[wi]
              if (!w) continue
              // First word of plain segment — skip if it was replaced by colored word
              if (skipFirstWord && wi === 0) {
                skipFirstWord = false
                continue
              }
              const test = lineBuf + (lineBuf ? ' ' : '') + w
              const exceeds = helv.widthOfTextAtSize(test, 11) > contentWidth - (xPos - margin)
              if (exceeds && lineBuf) {
                page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: DARK, width: contentWidth })
                y -= 16
                xPos = margin
                lineBuf = ''
              }
              lineBuf += (lineBuf ? ' ' : '') + w
            }
          }
        }
        if (lineBuf.trim()) {
          page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: DARK, width: contentWidth })
          y -= 16
        }
        if (block.content.marginBottom)
        if (block.content.marginBottom) { const mb = parseInt(block.content.marginBottom) || 0; y -= mb }
        break
      }
      case 'image': {
        if (block.content.alt) {
          newPageIfNeeded(margin + 40)
          page.drawText(`[Image: ${block.content.alt}]`, { x: margin, y, size: 10, font: helv, color: GRAY, width: contentWidth })
          y -= 20
        }
        break
      }
      case 'columns': {
        const cols = block.content.columns || []
        const colCount = Math.min(cols.length, 3)
        if (!colCount) break
        newPageIfNeeded(margin + 60)
        const colW = contentWidth / colCount
        for (let ci = 0; ci < colCount; ci++) {
          newPageIfNeeded(margin + 40)
          const colContent = cols[ci] || ''
          const plain = colContent.replace(/<[^>]+>/g, '').trim()
          page.drawText(plain.slice(0, 80), { x: margin + ci * colW, y, size: 10, font: helv, color: DARK, width: colW - 8 })
          y -= 40
        }
        y -= 12
        break
      }
      case 'footer': {
        newPageIfNeeded(margin + 30)
        page.drawText('Proposal prepared by Fifty Studios', { x: margin, y, size: 9, font: helv, color: GRAY, width: contentWidth })
        y -= 20
        break
      }
      case 'list': {
        const items = block.content.items || []
        if (block.content.sectionTitle) {
          newPageIfNeeded(margin + 50)
          page.drawText(block.content.sectionTitle, { x: margin, y, size: 14, font: helvB, color: ORANGE, width: contentWidth })
          y -= 24
        }
        items.forEach((item, idx) => {
          const prefix = block.content.ordered ? `${idx + 1}. ` : '• '
          page.drawText(prefix, { x: margin, y, size: 11, font: helv, color: DARK, width: 20 })
          let xPos = margin + 15
          const labelHtml = item.label || item.text || ''
          const words = []
          let lineBuf = ''
          let lineColor = DARK
          let skipNextWord = false
          const colorRe = /<span[^>]*style=["'][^"']*color:\s*(rgb\([^)]+\)|#[0-9a-fA-F]{6})[^"']*["'][^>]*>([^<]*)<\/span>/gi
          let lastIdx = 0, m
          while ((m = colorRe.exec(labelHtml)) !== null) {
            if (m.index > lastIdx) {
              const plain = labelHtml.slice(lastIdx, m.index).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
              for (const w of plain.split(' ')) { if (w) words.push({ text: w, color: null }) }
            }
            for (const w of m[2].trim().split(' ')) { if (w) words.push({ text: w, color: m[1] }) }
            lastIdx = colorRe.lastIndex
          }
          if (lastIdx < labelHtml.length) {
            const plain = labelHtml.slice(lastIdx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            for (const w of plain.split(' ')) { if (w) words.push({ text: w, color: null }) }
          }
          if (!words.length) {
            const plain = labelHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            for (const w of plain.split(' ')) { if (w) words.push({ text: w, color: null }) }
          }
          for (let wi = 0; wi < words.length; wi++) {
            const w = words[wi]
            const wColor = w.color ? hexToRgb(w.color) : DARK
            newPageIfNeeded(margin + 20)
            if (!w.color) {
              if (skipNextWord) { skipNextWord = false; continue }
              const test = lineBuf + (lineBuf ? ' ' : '') + w.text
              if (helv.widthOfTextAtSize(test, 11) > contentWidth - (xPos - margin) && lineBuf) {
                page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: lineColor, width: contentWidth })
                y -= 16; xPos = margin + 15; lineBuf = ''
              }
              lineBuf += (lineBuf ? ' ' : '') + w.text; lineColor = DARK
            } else {
              if (lineBuf.trim()) {
                page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: lineColor, width: contentWidth })
                xPos += helv.widthOfTextAtSize(lineBuf.trim(), 11) + 6; lineBuf = ''
              }
              page.drawText(w.text, { x: xPos, y, size: 11, font: helv, color: wColor, width: contentWidth })
              xPos += helv.widthOfTextAtSize(w.text, 11) + 6; lineBuf = ''; lineColor = DARK; skipNextWord = true
            }
          }
          if (lineBuf.trim()) {
            newPageIfNeeded(margin + 20)
            page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: lineColor, width: contentWidth })
            y -= 16
          }
        })
        y -= 6
        if (block.content.marginBottom) { y -= parseInt(block.content.marginBottom) || 0 }
        break
      }
      case 'divider': {
        const col = hexToRgb(block.content.color)
        page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: block.content.thickness || 1, color: col })
        y -= 20
        break
      }
      default:
        break
    }
  } catch (e) {
    console.error('Block render error:', block.type, e.message)
  }
  return { page, y }
}

// ── Route ──────────────────────────────────────────────────────
router.get('/:id/export-pdf', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM builder_proposals WHERE id = $1', [req.params.id])
    if (!result.rows[0]) return res.status(404).json({ error: 'Proposal not found' })

    const proposal = result.rows[0]
    const blocks  = typeof proposal.blocks === 'string' ? JSON.parse(proposal.blocks) : (proposal.blocks || [])
    if (blocks.length === 0) return res.status(400).json({ error: 'No blocks to export' })

    logAction('PDF_EXPORT', `Starting PDF export for proposal id=${req.params.id}`, {
      name: proposal.name,
      blocks_count: blocks.length,
      block_types: blocks.map(b => b.type),
      project_id: proposal.project_id,
      srs_version: proposal.srs_version
    })

    const doc = await PDFDocument.create()
    doc.setTitle(proposal.name || 'Proposal')
    doc.setAuthor('Fifty Studios Holding Company')
    doc.setCreationDate(new Date())

    const fonts = {
      helv:  await doc.embedFont(StandardFonts.Helvetica),
      helvB: await doc.embedFont(StandardFonts.HelveticaBold),
    }

    // Pre-embed the cover background image once per doc (pdf-lib requirement)
    let embeddedBg = null
    if (_coverBgBytes) {
      embeddedBg = await doc.embedJpg(_coverBgBytes)
    }

    const docTitle = proposal.name || 'Proposal'
    let pageNum = 0

    function onBodyPage(page) {
      pageNum++
      drawHeader(page, fonts, docTitle)
      drawFooter(page, fonts, pageNum)
    }

    let page = doc.addPage()
    let y    = PAGE_H - MARGIN

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      // Cover page — draw with special layout, no header/footer
      if (block.type === 'cover') {
        drawCoverPage(page, fonts, block, embeddedBg)
        y = PAGE_H - MARGIN
        page = doc.addPage()
        onBodyPage(page)
        y = PAGE_H - MARGIN
        continue
      }

      const result = await renderBlock(page, doc, block, PAGE_W, PAGE_H, MARGIN, y, fonts, onBodyPage)
      page = result.page
      y    = result.y
    }

    // Footer on last page
    pageNum++
    drawFooter(page, fonts, pageNum)

    const pdfBytes = await doc.save()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${(proposal.name || 'Proposal').replace(/[^a-zA-Z0-9 ]/g, '')}.pdf"`)
    res.send(Buffer.from(pdfBytes))
  } catch (err) {
    console.error('PDF export error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
