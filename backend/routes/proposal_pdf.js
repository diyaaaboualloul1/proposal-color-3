const express = require('express')
const router = express.Router()
const { Pool } = require('pg')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'srs_platform_db',
  user: process.env.PGUSER || 'srs_user',
  password: process.env.PGPASSWORD || 'SrsPlatform2026!',
})

function hexToRgb(hex) {
  if (!hex || hex.length < 7) return rgb(0.15, 0.15, 0.2)
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return rgb(r, g, b)
  } catch { return rgb(0.15, 0.15, 0.2) }
}

async function renderBlock(page, doc, block, pageWidth, pageHeight, margin, y, fonts) {
  const { helv, helvB } = fonts
  const purple = rgb(0.486, 0.227, 0.929)
  const lightGray = rgb(0.564, 0.647, 0.706)
  const darkGray = rgb(0.149, 0.169, 0.227)
  const white = rgb(1, 1, 1)
  const contentWidth = pageWidth - margin * 2

  function newPageIfNeeded(needed) {
    if (y < needed) {
      page = doc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
    }
  }

  try {
    switch (block.type) {
      case 'cover': {
        y = pageHeight - margin - 40
        page.drawText(block.content.title || 'Proposal', { x: margin, y, size: 22, font: helvB, color: purple, width: contentWidth, align: 'center' })
        y -= 45
        if (block.content.client) {
          page.drawText(`Client: ${block.content.client}`, { x: margin, y, size: 13, font: helv, color: lightGray, width: contentWidth, align: 'center' })
          y -= 24
        }
        if (block.content.date) {
          page.drawText(`Date: ${block.content.date}`, { x: margin, y, size: 11, font: helv, color: lightGray, width: contentWidth, align: 'center' })
          y -= 20
        }
        if (block.content.preparedBy) {
          page.drawText(`Prepared by: ${block.content.preparedBy}`, { x: margin, y, size: 10, font: helv, color: lightGray, width: contentWidth, align: 'center' })
          y -= 18
        }
        y -= 15
        page.drawRectangle({ x: margin, y, width: contentWidth, height: 2, color: purple })
        y -= 30
        break
      }
      case 'text': {
        if (block.content.html) {
          const plain = block.content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          const words = plain.split(' ')
          let line = ''
          for (const word of words) {
            const test = line + (line ? ' ' : '') + word
            if (test.length > 82) {
              newPageIfNeeded(margin + 30)
              page.drawText(line.trim(), { x: margin, y, size: 11, font: helv, color: darkGray, width: contentWidth })
              y -= 16
              line = word
            } else { line = test }
          }
          if (line) {
            newPageIfNeeded(margin + 20)
            page.drawText(line.trim(), { x: margin, y, size: 11, font: helv, color: darkGray, width: contentWidth })
            y -= 16
          }
          y -= 6
        }
        break
      }
      case 'heading': {
        newPageIfNeeded(margin + 50)
        const sizes = { 1: 20, 2: 16, 3: 13 }
        const size = sizes[block.content.level] || 16
        page.drawText(block.content.text || '', { x: margin, y, size, font: helvB, color: darkGray, width: contentWidth })
        y -= size + 12
        break
      }
      case 'table': {
        const headers = block.content.headers || []
        const rows = block.content.rows || []
        if (headers.length === 0) break
        newPageIfNeeded(margin + 60)
        const colW = contentWidth / headers.length
        const rowH = 20
        let xOff = margin
        for (const h of headers) {
          page.drawRectangle({ x: xOff, y: y - rowH + 5, width: colW, height: rowH, color: purple })
          page.drawText(h || '', { x: xOff + 4, y: y - 14, size: 9, font: helvB, color: white, width: colW - 8 })
          xOff += colW
        }
        y -= rowH + 2
        for (const row of rows) {
          newPageIfNeeded(margin + 30)
          xOff = margin
          for (const cell of row) {
            page.drawRectangle({ x: xOff, y: y - rowH + 5, width: colW, height: rowH, borderColor: darkGray, borderWidth: 0.5 })
            page.drawText(String(cell || '').slice(0, 30), { x: xOff + 4, y: y - 14, size: 9, font: helv, color: darkGray, width: colW - 8 })
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
        page.drawText('Investment', { x: margin, y, size: 14, font: helvB, color: purple, width: contentWidth })
        y -= 24
        for (const item of items) {
          newPageIfNeeded(margin + 20)
          page.drawText(item.label || '', { x: margin, y, size: 11, font: helv, color: darkGray, width: contentWidth - 90 })
          page.drawText(`${block.content.currency || 'KWD'} ${(item.price || 0).toLocaleString()}`, { x: pageWidth - margin - 90, y, size: 11, font: helvB, color: purple, width: 90, align: 'right' })
          y -= 20
        }
        y -= 12
        break
      }
      case 'timeline': {
        const phases = block.content.phases || []
        newPageIfNeeded(margin + 50)
        page.drawText('Timeline', { x: margin, y, size: 14, font: helvB, color: purple, width: contentWidth })
        y -= 26
        for (let i = 0; i < phases.length; i++) {
          newPageIfNeeded(margin + 20)
          const p = phases[i]
          page.drawText(`#${i + 1}`, { x: margin, y: y - 8, size: 10, font: helvB, color: purple, width: 22 })
          page.drawText(p.name || `Phase ${i + 1}`, { x: margin + 26, y: y - 8, size: 11, font: helv, color: darkGray, width: contentWidth - 120 })
          if (p.duration) {
            page.drawText(p.duration, { x: pageWidth - margin - 70, y: y - 8, size: 10, font: helv, color: lightGray, width: 70, align: 'right' })
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
        for (const item of items) {
          newPageIfNeeded(margin + 20)
          const label = item.label || ''
          page.drawText(`• ${label}`.slice(0, 100), { x: margin, y, size: 11, font: helv, color: darkGray, width: contentWidth })
          y -= 17
        }
        y -= 6
        break
      }
      case 'techstack': {
        const items = block.content.items || []
        newPageIfNeeded(margin + 40)
        page.drawText('Tech Stack', { x: margin, y, size: 14, font: helvB, color: purple, width: contentWidth })
        y -= 24
        for (const item of items) {
          newPageIfNeeded(margin + 20)
          const label = item.label || item
          page.drawText(`• ${label}`.slice(0, 100), { x: margin, y, size: 11, font: helv, color: darkGray, width: contentWidth })
          y -= 17
        }
        y -= 6
        break
      }
      case 'overview': {
        const text = block.content.text || block.content.html || ''
        const plain = text.replace(/<[^>]+>/g, '').trim()
        if (plain) {
          newPageIfNeeded(margin + 50)
          page.drawText('Overview', { x: margin, y, size: 14, font: helvB, color: purple, width: contentWidth })
          y -= 24
          page.drawText(plain.slice(0, 200), { x: margin, y, size: 11, font: helv, color: darkGray, width: contentWidth })
          y -= 30
        }
        break
      }
      case 'table': {
        const headers = block.content.headers || []
        const rows = block.content.rows || []
        if (headers.length === 0) break
        newPageIfNeeded(margin + 60)
        const colW = contentWidth / headers.length
        const rowH = 20
        let xOff = margin
        for (const h of headers) {
          page.drawRectangle({ x: xOff, y: y - rowH + 5, width: colW, height: rowH, color: purple })
          page.drawText(h || '', { x: xOff + 4, y: y - 14, size: 9, font: helvB, color: white, width: colW - 8 })
          xOff += colW
        }
        y -= rowH + 2
        for (const row of rows) {
          newPageIfNeeded(margin + 30)
          xOff = margin
          for (const cell of row) {
            page.drawRectangle({ x: xOff, y: y - rowH + 5, width: colW, height: rowH, borderColor: darkGray, borderWidth: 0.5 })
            page.drawText(String(cell || '').slice(0, 30), { x: xOff + 4, y: y - 14, size: 9, font: helv, color: darkGray, width: colW - 8 })
            xOff += colW
          }
          y -= rowH
        }
        y -= 12
        break
      }
      case 'image': {
        if (block.content.alt) {
          newPageIfNeeded(margin + 40)
          page.drawText(`[Image: ${block.content.alt}]`, { x: margin, y, size: 10, font: helv, color: lightGray, width: contentWidth })
          y -= 20
        }
        break
      }
      case 'columns': {
        const cols = block.content.columns || []
        const colCount = Math.min(cols.length, 3)
        if (colCount === 0) break
        newPageIfNeeded(margin + 60)
        const colW = contentWidth / colCount
        for (let ci = 0; ci < colCount; ci++) {
          newPageIfNeeded(margin + 40)
          const colContent = cols[ci] || ''
          const plain = colContent.replace(/<[^>]+>/g, '').trim()
          page.drawText(plain.slice(0, 80), { x: margin + ci * colW, y, size: 10, font: helv, color: darkGray, width: colW - 8 })
          y -= 40
        }
        y -= 12
        break
      }
      case 'footer': {
        newPageIfNeeded(margin + 30)
        page.drawText('Proposal prepared by Fifty Studios', { x: margin, y, size: 9, font: helv, color: lightGray, width: contentWidth })
        y -= 20
        break
      }
      case 'list': {
        const items = block.content.items || []
        for (const item of items) {
          newPageIfNeeded(margin + 20)
          const label = item.label || item
          page.drawText(`• ${label}`.slice(0, 100), { x: margin, y, size: 11, font: helv, color: darkGray, width: contentWidth })
          y -= 17
        }
        y -= 6
        break
      }
      case 'divider': {
        const col = hexToRgb(block.content.color)
        page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: block.content.thickness || 1, color: col })
        y -= 20
        break
      }
      case 'pagebreak': {
        page = doc.addPage([pageWidth, pageHeight])
        y = pageHeight - margin
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

router.get('/:id/export-pdf', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM builder_proposals WHERE id = $1', [req.params.id])
    if (!result.rows[0]) return res.status(404).json({ error: 'Proposal not found' })

    const proposal = result.rows[0]
    const blocks = typeof proposal.blocks === 'string' ? JSON.parse(proposal.blocks) : (proposal.blocks || [])
    if (blocks.length === 0) return res.status(400).json({ error: 'No blocks to export' })

    const doc = await PDFDocument.create()
    doc.setTitle(proposal.name || 'Proposal')
    doc.setAuthor('Fifty Studios')
    doc.setCreationDate(new Date())

    const pageWidth = 595.28
    const pageHeight = 841.89
    const margin = 50
    const fonts = {
      helv: await doc.embedFont(StandardFonts.Helvetica),
      helvB: await doc.embedFont(StandardFonts.HelveticaBold),
    }
    const purple = rgb(0.486, 0.227, 0.929)
    const white = rgb(1, 1, 1)

    let page = doc.addPage()
    page.drawRectangle({ x: 0, y: pageHeight - 55, width: pageWidth, height: 55, color: purple })
    page.drawText('FIFTY STUDIOS', { x: margin, y: pageHeight - 32, size: 14, font: fonts.helvB, color: white, width: pageWidth - margin * 2 })
    page.drawText(proposal.name || 'Proposal', { x: margin, y: pageHeight - 46, size: 9, font: fonts.helv, color: white, width: pageWidth - margin * 2 })

    let y = pageHeight - 75
    for (const block of blocks) {
      const result = await renderBlock(page, doc, block, pageWidth, pageHeight, margin, y, fonts)
      page = result.page
      y = result.y
    }

    page.drawText('© Fifty Studios Holding Company — Confidential', { x: margin, y: margin - 5, size: 8, font: fonts.helv, color: rgb(0.564, 0.647, 0.706), width: pageWidth - margin * 2, align: 'center' })

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
