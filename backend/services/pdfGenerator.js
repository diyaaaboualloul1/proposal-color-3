const { marked } = require('marked');
const path = require('path');
const fs = require('fs').promises;

const SRS_PDF_BUILDER = '/root/.openclaw/workspace-srs-docs/skills/pdf-export/srs_pdf_builder.py';

// Pre-process markdown: escape HTML tag names that appear WITHOUT backticks.
// This prevents raw HTML tags like <head> from corrupting the PDF HTML structure.
function preprocessMarkdown(md) {
  // Split by lines to process each line
  const lines = md.split('\n');
  const result = [];
  for (const line of lines) {
    let processed = '';
    let i = 0;
    while (i < line.length) {
      // Skip content inside backtick code spans
      if (line[i] === '`') {
        let j = i + 1;
        while (j < line.length && line[j] !== '`') j++;
        processed += line.substring(i, j + 1);
        i = j + 1;
        continue;
      }
      // If we see < followed by a letter, check if it's an HTML tag-like pattern
      if (line[i] === '<' && /[a-zA-Z]/.test(line[i + 1] || '')) {
        // Find the end of the tag
        let j = i + 1;
        while (j < line.length && line[j] !== '>') j++;
        if (j < line.length) {
          // Escape the tag
          const tag = line.substring(i, j + 1);
          processed += '&lt;' + line.substring(i + 1, j) + '&gt;';
          i = j + 1;
          continue;
        }
      }
      processed += line[i];
      i++;
    }
    result.push(processed);
  }
  return result.join('\n');
}

function extractProjectNameFromMarkdown(markdown) {
  // Try to extract from "## ProjectName" on line 2, or "# SRS — ProjectName"
  const lines = markdown.split('\n').slice(0, 10);
  for (const line of lines) {
    const match2 = line.match(/^##\s+(.+)/);
    if (match2) return match2[1].trim();
    const match1 = line.match(/^#\s+SRS\s+[—–-]+\s+(.+)/i);
    if (match1) return match1[1].trim();
  }
  return 'SRS Document';
}

async function generatePdfFromMarkdown(markdownContent, outputPath, projectName = null, version = '1.0', date = null, status = 'Draft') {
  // Auto-extract project name from markdown if not provided
  if (!projectName) {
    projectName = extractProjectNameFromMarkdown(markdownContent);
  }
  if (!date) {
    date = new Date().toISOString().split('T')[0];
  }
  // Try the Fifty Studios branded Python PDF builder first
  try {
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);

    // Write markdown to temp file
    const tmpMd = outputPath.replace('.pdf', '.tmp.md');
    await fs.writeFile(tmpMd, markdownContent, 'utf8');

    await execFileAsync('python3', [SRS_PDF_BUILDER, tmpMd, outputPath, projectName, version, date, status], {
      timeout: 60000
    });

    await fs.unlink(tmpMd).catch(() => {});
    return outputPath;
  } catch (pyErr) {
    console.warn('Python PDF builder failed, trying puppeteer:', pyErr.message);
  }

  // Fallback: puppeteer
  try {
    const puppeteer = require('puppeteer');
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #333; line-height: 1.6; }
  h1 { color: #1a237e; border-bottom: 2px solid #1a237e; padding-bottom: 8px; }
  h2 { color: #283593; border-bottom: 1px solid #c5cae9; padding-bottom: 4px; }
  h3 { color: #3949ab; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #e8eaf6; font-weight: bold; }
  tr:nth-child(even) { background: #f5f5f5; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 4px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #3949ab; margin: 0; padding-left: 16px; color: #555; }
  hr { border: none; border-top: 1px solid #ddd; }
</style>
</head>
<body>
${marked(preprocessMarkdown(markdownContent))}
</body>
</html>`;

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new'
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true
    });

    await browser.close();
    return outputPath;
  } catch (puppeteerErr) {
    console.warn('Puppeteer PDF generation failed, trying wkhtmltopdf:', puppeteerErr.message);

    // Last fallback: wkhtmltopdf
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;margin:40px;color:#333;line-height:1.6;}h1{color:#1a237e;}h2{color:#283593;}h3{color:#3949ab;}</style></head><body>${marked(preprocessMarkdown(markdownContent))}</body></html>`;

    const tmpHtml = outputPath.replace('.pdf', '.tmp.html');
    await fs.writeFile(tmpHtml, html, 'utf8');

    await execFileAsync('wkhtmltopdf', ['--quiet', tmpHtml, outputPath]);

    await fs.unlink(tmpHtml).catch(() => {});
    return outputPath;
  }
}

module.exports = { generatePdfFromMarkdown, extractProjectNameFromMarkdown };
