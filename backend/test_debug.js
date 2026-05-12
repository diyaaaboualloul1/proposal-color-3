const fs = require('fs')
const { Pool } = require('pg')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'srs_platform_db',
  user: process.env.PGUSER || 'srs_user',
  password: process.env.PGPASSWORD || 'SrsPlatform2026!',
})

const DARK   = rgb(0.13, 0.14, 0.16)
const ORANGE = rgb(249/255, 115/255, 22/255)

function hexToRgb(hex) {
  if (!hex) return DARK
  if (typeof hex !== 'string') return hex
  const rgbMatch = hex.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (rgbMatch) return rgb(parseInt(rgbMatch[1])/255, parseInt(rgbMatch[2])/255, parseInt(rgbMatch[3])/255)
  if (hex.length < 7) return DARK
  try {
    return rgb(parseInt(hex.slice(1,3), 16)/255, parseInt(hex.slice(3,5), 16)/255, parseInt(hex.slice(5,7), 16)/255)
  } catch { return DARK }
}

async function run() {
  const result = await pool.query('SELECT blocks FROM builder_proposals WHERE id = $1', [192])
  const blocks = typeof result.rows[0].blocks === 'string' ? JSON.parse(result.rows[0].blocks) : result.rows[0].blocks
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold)
  const margin = 50, contentWidth = 495
  let y = 767.9

  const log = (msg) => fs.appendFileSync('/tmp/overview_debug.log', new Date().toISOString().slice(11,23) + ' ' + msg + '\n')

  for (const block of blocks) {
    if (block.type !== 'overview') continue
    const text = block.content.text || ''
    log('INPUT: ' + JSON.stringify(text))

    page.drawText('Overview', { x: margin, y, size: 14, font: helvB, color: ORANGE, width: contentWidth })
    y -= 24

    const segments = []
    const colorRe = /<span[^>]*style=["'][^"']*color:\s*(rgb\([^)]+\)|#[0-9a-fA-F]{6})[^"']*["'][^>]*>([^<]*)<\/span>/gi
    let lastIndex = 0, m
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

    log('SEGMENTS: ' + JSON.stringify(segments))
    log('MARGIN=' + margin + ' CW=' + contentWidth + ' helvW(h)= ' + helv.widthOfTextAtSize('h', 11).toFixed(2))

    let lineBuf = ''
    let xPos = margin
    for (const seg of segments) {
      const segColor = seg.color ? hexToRgb(seg.color) : DARK
      log('SEG xPos=' + xPos.toFixed(1) + ' ' + (seg.color?'CLR':'PLN') + ':' + JSON.stringify(seg.text))
      if (seg.color) {
        const w = helv.widthOfTextAtSize(seg.text, 11)
        log('  DRAW at x=' + xPos.toFixed(1) + ' w=' + w.toFixed(1) + ' segColor=' + JSON.stringify(seg.color))
        page.drawText(seg.text, { x: xPos, y, size: 11, font: helv, color: segColor, width: contentWidth })
        xPos += w + 6
        log('  xPos -> ' + xPos.toFixed(1) + ' limit=' + (margin + contentWidth - 20).toFixed(1))
        if (xPos > margin + contentWidth - 20) {
          y -= 16; xPos = margin; log('  WRAP')
        } else {
          xPos = margin; log('  RESET to margin')
        }
      } else {
        const words = seg.text.split(' ')
        for (const w of words) {
          if (!w) continue
          const test = lineBuf + (lineBuf ? ' ' : '') + w
          const avail = contentWidth - (xPos - margin)
          const needed = helv.widthOfTextAtSize(test, 11)
          const exceeds = needed > avail
          log('  WORD: ' + JSON.stringify(w) + ' need=' + needed.toFixed(1) + ' avail=' + avail.toFixed(1) + ' exceeds=' + exceeds)
          if (exceeds && lineBuf) {
            log('  FLUSH: ' + JSON.stringify(lineBuf.trim()) + ' at x=' + xPos.toFixed(1))
            page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: DARK, width: contentWidth })
            y -= 16; xPos = margin; lineBuf = ''
          }
          lineBuf += (lineBuf ? ' ' : '') + w
        }
      }
    }
    if (lineBuf.trim()) {
      log('FINAL: ' + JSON.stringify(lineBuf.trim()) + ' at x=' + xPos.toFixed(1))
      page.drawText(lineBuf.trim(), { x: xPos, y, size: 11, font: helv, color: DARK, width: contentWidth })
    }
  }

  const pdfBytes = await doc.save()
  fs.writeFileSync('/tmp/test_overview.pdf', pdfBytes)
  log('SAVED /tmp/test_overview.pdf')
}

run().catch(e => { fs.appendFileSync('/tmp/overview_debug.log', 'ERROR: ' + e.message + '\n' + e.stack + '\n') })