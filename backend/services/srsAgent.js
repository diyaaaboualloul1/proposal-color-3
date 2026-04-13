const axios = require('axios');

// Uses OpenClaw's OpenAI-compatible endpoint: /v1/chat/completions
// Model: openclaw:srs-docs
async function callSrsAgent(prompt, maxTokens = 8000) {
  const url = `${process.env.OPENCLAW_GATEWAY_URL}/v1/chat/completions`;
  const model = process.env.SRS_AGENT_MODEL || 'openclaw:srs-docs';

  const response = await axios.post(
    url,
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENCLAW_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 600000 // 10 minutes
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('SRS agent returned no content');
  }

  return content;
}

function buildGenerationPrompt(questionnaireAnswers, projectName) {
  const today = new Date().toISOString().split('T')[0]; // e.g. 2026-03-28
  return `IMPORTANT: Return ONLY the raw Markdown SRS document. Do NOT write summaries, descriptions, file paths, or any explanation. Start directly with the document title (# SRS — ...) and end with the last section. No other text.
Today's date: ${today}. Use this as the document date.

**CRITICAL — Project Name:** You MUST use this exact project name in the document title and everywhere else in the document: "${projectName}". Do NOT rename it, do NOT add suffixes, do NOT translate it. Use it exactly as provided.

Generate a complete, world-class SRS document in Markdown following the EXACT approved Fifty Studios IEEE 830 / ISO/IEC/IEEE 29148 structure below.

════════════════════════════════════════
APPROVED DOCUMENT STRUCTURE (MANDATORY)
════════════════════════════════════════

# Software Requirements Specification
## [Project Name]

**Date:** ${today}
**Prepared by:** Fifty Studios Holding Company

---

# 1. Introduction
## 1.1 Purpose
## 1.2 Scope
  - **In Scope:** (bullet list — what the system WILL do)
  - **Out of Scope:** (mandatory bullet list — what the system will NOT do; if everything is in scope, write "None proposed at this time")
## 1.3 Definitions, Acronyms & Abbreviations
| Term | Definition |
|------|-----------|

---

# 2. Overall Description
## 2.1 Product Perspective
## 2.2 Product Functions
## 2.3 User Classes & Characteristics
| User Class | Description | Access Level |
|------------|-------------|-------------|
## 2.4 Operating Environment
## 2.5 Design & Implementation Constraints

---

# 3. Specific Requirements
## 3.1 Functional Requirements
  (Organize by role/dashboard using ### 3.1.1, ### 3.1.2 sub-sections)
  
  ### FR-001: [Name]
  - **Description:** The system SHALL...
  - **Inputs:** ...
  - **Outputs:** ...
  - **Priority:** High / Medium / Low
  - **Traceability:** UC-00x

## 3.2 Non-Functional Requirements
  ### NFR-001: [Name]
  - **Category:** Performance / Security / Scalability / Availability / Usability
  - **Description:** The system SHALL...
  - **Metric:** [quantified metric]

## 3.3 External Interface Requirements
  ### 3.3.1 User Interfaces
  ### 3.3.2 Software Interfaces
  | Interface | Purpose | Protocol |
  |-----------|---------|----------|

## 3.4 System Constraints

---

# 4. Use Cases
## UC-001: [Name]
| Field | Details |
|-------|---------|
| **Actor** | ... |
| **Preconditions** | ... |
| **Main Flow** | 1. ... 2. ... |
| **Alt Flow A** | ... |
| **Related FRs** | FR-00x, FR-00x |

---

# 5. Appendices
## Glossary
| Term | Definition |
|------|-----------|

════════════════════════════════════════
ABSOLUTE RULES — NEVER VIOLATE THESE
════════════════════════════════════════

FORMAT RULES:
✅ FR format: ALWAYS use the bullet list format above (Description, Inputs, Outputs, Priority, Traceability)
✅ NFR format: ALWAYS use the bullet list format above (Category, Description, Metric)
❌ NEVER use Attribute/Detail table format for FRs or NFRs
❌ NEVER use "Critical" as a priority — only High / Medium / Low are allowed
❌ NEVER include a Revision History table — it is permanently banned
❌ NEVER include these sections: References, Document Overview, Assumptions & Dependencies, Hardware Interfaces, Communication Interfaces, Postconditions in Use Cases, version numbers inside Scope text

WRITING RULES:
✅ Use SHALL for mandatory requirements, SHOULD for recommended
✅ Every requirement must be atomic, testable, unambiguous, and traceable
✅ Always quantify: response times, thresholds, sizes, counts — never vague language
✅ Organize FRs by user role / dashboard (e.g., 3.1.1 Customer App, 3.1.2 Admin Dashboard)
❌ Never write "the system should be fast" — always specify exact metrics
❌ HTML tag names mentioned in descriptions (e.g. <head>, <title>, <meta>, <body>, <div>) MUST be wrapped in backticks like `<head>` so they are treated as literal text, NOT as HTML elements. Failure to do this will corrupt the document.

🚫 CRITICAL SCOPE RULE — Out of Scope items are FORBIDDEN
❌ ANYTHING listed under "Out of Scope" in section 1.2 MUST NOT appear anywhere in the document as:
   - A Functional Requirement (FR-xxx)
   - A Use Case (UC-xxx)
   - A Use Case step or description
   - Any FR description or bullet
If section 1.2 lists X as Out of Scope, then X shall have ZERO requirement entries in the entire document.
Before saving any generated FR or UC, verify it does not contradict or overlap with the Out of Scope list.
This rule takes priority over all other rules.

CLIENT QUESTIONNAIRE ANSWERS:
${JSON.stringify(questionnaireAnswers, null, 2)}`;
}

function buildChatEditPrompt(currentSrsMarkdown, userMessage, chatHistory = []) {
  // IMPORTANT: SRS documents are large. We need to preserve the full document so the AI
  // can apply edits correctly. Truncating causes section loss (see project #149 Stripe bug).
  // Only truncate if truly necessary (e.g. > 100K chars), and only from low-priority sections.
  // Strategy: if > 100K chars, truncate from the middle Use Cases and Appendices, keep intro + requirements.
  const MAX_DOCUMENT_CHARS = 100000;
  const TRUNCATE_THRESHOLD = 100000;
  
  if (currentSrsMarkdown.length > TRUNCATE_THRESHOLD) {
    // Calculate safe truncate point — keep first 60% and last 20%, cut middle 20%
    const keepStart = Math.floor(currentSrsMarkdown.length * 0.6);
    const keepEnd = Math.floor(currentSrsMarkdown.length * 0.8);
    const startSection = currentSrsMarkdown.substring(0, keepStart);
    const endSection = currentSrsMarkdown.substring(keepEnd);
    currentSrsMarkdown = startSection + 
      '\n\n[... middle sections truncated for length — apply changes to visible content ...]\n\n' + 
      endSection;
  }
  // Build conversation context from last 10 messages
  let contextBlock = '';
  if (chatHistory.length > 0) {
    contextBlock = '\n\nPREVIOUS CONVERSATION (for context):\n';
    chatHistory.forEach(msg => {
      const role = msg.role === 'user' ? 'Employee' : 'Srs AI';
      contextBlock += `${role}: ${msg.content}\n`;
    });
    contextBlock += '\n';
  }

  // Check if user confirmed a pending edit — be lenient, match any confirmation-seeking message
  const lastAiMsg = chatHistory.filter(m => m.role === 'assistant').pop();
  const lastAiContent = lastAiMsg?.content || '';
  // Match CONFIRM_EDIT: block OR any message ending with "reply **yes** to" (confirmation prompt)
  const isPendingConfirm = lastAiContent.includes('CONFIRM_EDIT:') ||
    /reply\s+\*?\*?yes\*?\*?\s+to/i.test(lastAiContent) ||
    (lastAiContent.toLowerCase().includes('confirm') && lastAiContent.toLowerCase().includes('yes'));
  const isUserConfirming = /^(yes|yeah|yep|ok|okay|confirm|proceed|go ahead|do it|start)$/i.test(userMessage.trim());
  const isUserRejecting = /^(no|nope|cancel|stop|abort|nevermind|never mind)$/i.test(userMessage.trim());

  // Chat command handling — inject special instruction
  const isCommand = userMessage.trim().startsWith('/');

  return `You are Srs, a smart SRS document editor for Fifty Studios.
You have a MULTI-STEP conversation flow. Follow the exact rules below.

════════════════════════════════════════
CONVERSATION FLOW RULES
════════════════════════════════════════

STEP 1 — ANALYZE the employee request:
  a) If it's a CHAT COMMAND (starts with /): Handle it (see commands section)
  b) If the request needs CLARIFICATION (vague, missing key details): Ask up to 3 questions (see clarify format)
  c) If request is CLEAR but needs SCOPE CHECK: Check if it fits the project, then show confirm plan
  d) If user just said YES/CONFIRM to a pending edit plan: Execute the edit and return full SRS

STEP 2 — CLARIFY (only if needed):
  - Ask UP TO 3 SHORT questions, numbered
  - Format:
    CLARIFY:
    I need a few details before I make this change:
    1. [question one]
    2. [question two]
    3. [question three]
  - Do NOT generate SRS when clarifying

STEP 3 — SCOPE CHECK + CONFIRM PLAN:
  - Once you have enough info (or request was clear), show a plan:
    CONFIRM_EDIT:
    ✅ In scope / ⚠️ Partially out of scope / ❌ Out of scope
    
    **Changes I will make:**
    • [change 1]
    • [change 2]
    • [change 3]
    
    Reply **yes** to create the new version, or **no** to cancel.
  - Do NOT generate SRS at this step

STEP 4 — GENERATE (only when user confirms with yes/ok/proceed):
  - Return the COMPLETE updated SRS markdown
  - Start with GENERATE: on first line, then the full markdown
  - Format: GENERATE:\n[full srs markdown here]

STEP 5 — DIFF SUMMARY (after generating):
  You will be called again to produce a diff — this is handled separately.

════════════════════════════════════════
COMMANDS (when user types /command)
════════════════════════════════════════
/status  → Reply with STATUS: then: current version, last edit summary, total requirements count
/undo    → Reply with UNDO: then confirm rollback message
/diff    → Reply with DIFF: then summarize what changed between last 2 versions based on chat history
/scope   → Reply with SCOPE: then summarize the project scope from the SRS introduction/overview

════════════════════════════════════════
CONTEXT AWARENESS
════════════════════════════════════════
${isPendingConfirm && isUserConfirming ? '⚡ USER CONFIRMED — Execute the pending edit now. Return GENERATE: then full SRS.' : ''}
${isPendingConfirm && isUserRejecting ? '❌ USER CANCELLED — Reply: "Cancelled. Let me know if you want to try a different edit."' : ''}

════════════════════════════════════════
SRS FORMAT RULES (when generating)
════════════════════════════════════════
✅ FR format: ALWAYS use bullet list — Description, Inputs, Outputs, Priority, Traceability
✅ NFR format: ALWAYS use bullet list — Category, Description, Metric
❌ NEVER use Attribute/Detail table format for FRs or NFRs
❌ Priority values: ONLY High / Medium / Low — NEVER use "Critical"
❌ NEVER include a Revision History table
❌ NEVER include: References, Document Overview, Assumptions & Dependencies, Hardware Interfaces, Communication Interfaces, Postconditions in Use Cases
✅ Use SHALL for mandatory, SHOULD for recommended
✅ Always quantify metrics
✅ Maintain structure: Introduction → Overall Description → Specific Requirements → Use Cases → Appendices
✅ Use Case tables — steps on own lines with <br/> between them
❌ HTML tag names in descriptions (e.g. <head>, <title>, <meta>, <body>) MUST be wrapped in backticks like `<head>` — raw HTML tags corrupt the PDF output

🚫 CRITICAL SCOPE RULE — Out of Scope items are FORBIDDEN
════════════════════════════════════════
❌ ANYTHING listed under "Out of Scope" in section 1.2 MUST NOT appear anywhere in the document as:
   - A Functional Requirement (FR-xxx)
   - A Use Case (UC-xxx)
   - A Use Case step or description
   - Any FR description or bullet
If section 1.2 lists X as Out of Scope, then X shall have ZERO requirement entries in the entire document.
Before saving any generated FR or UC, verify it does not contradict or overlap with the Out of Scope list.
This rule takes priority over all other rules.
════════════════════════════════════════
${contextBlock}
CURRENT SRS:
${currentSrsMarkdown}

EMPLOYEE REQUEST:
${userMessage}`;
}

function buildDiffPrompt(oldMarkdown, newMarkdown) {
  // Truncate for speed
  const oldTrunc = oldMarkdown.length > 8000 ? oldMarkdown.substring(0, 8000) + '...' : oldMarkdown;
  const newTrunc = newMarkdown.length > 8000 ? newMarkdown.substring(0, 8000) + '...' : newMarkdown;
  return `Compare these two SRS versions and provide a concise diff summary.
Return ONLY this exact format — nothing else:

DIFF_SUMMARY:
+ [what was added]
+ [what was added]
~ [what was changed]
~ [what was changed]
- [what was removed]
- [what was removed]

Be specific (mention FR/NFR numbers and section names). Max 8 lines total. No markdown, no headers.

OLD VERSION:
${oldTrunc}

NEW VERSION:
${newTrunc}`;
}

async function callSrsAgentWithRetry(prompt, maxTokens = 25000, retries = 3, delayMs = 15000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await callSrsAgent(prompt, maxTokens);
      // If OpenClaw gateway returns a rate limit message in the content, don't retry
      // (retrying would reset the 10-minute cooldown each time)
      if (result && result.includes('API rate limit reached')) {
        throw new Error('OpenClaw gateway cooldown active — do not retry');
      }
      return result;
    } catch (err) {
      // Only retry on actual Anthropic 429 HTTP errors, not OpenClaw gateway cooldowns
      const isAnthropicRateLimit = err.response?.status === 429;
      const isGatewayCooldown = err.message?.includes('cooldown') ||
        err.message?.includes('API rate limit reached');

      if (isAnthropicRateLimit && !isGatewayCooldown && attempt < retries) {
        console.log(`Anthropic rate limit hit, retrying in ${delayMs / 1000}s (attempt ${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

async function callSrsAgentStream(prompt, onChunk, maxTokens = 8000) {
  const url = `${process.env.OPENCLAW_GATEWAY_URL}/v1/chat/completions`;
  const model = process.env.SRS_AGENT_MODEL || 'openclaw:srs-docs';

  const response = await axios.post(url, {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    stream: true
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENCLAW_TOKEN}`,
      'Content-Type': 'application/json'
    },
    responseType: 'stream',
    timeout: 600000
  });

  let fullContent = '';

  await new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            onChunk(content);
          }
        } catch {}
      }
    });
    response.data.on('end', resolve);
    response.data.on('error', reject);
  });

  return fullContent;
}

/**
 * Post-process SRS markdown to enforce format rules the AI may have missed.
 * Runs after every generation and chat edit before saving to disk.
 *
 * Rules enforced:
 * 1. Use Case table cells (Main Flow / Alt Flow) — numbered steps on separate lines using <br/>
 */
function postProcessSrs(markdown) {
  // ═══ CRITICAL FIX FOR PDF RENDERING (2026-04-09) ═══
  // 1. Split inline numbered steps into separate lines with <br/>
  // 2. Ensure every sentence ends with a full stop (period)
  let result = markdown;

  // ── FIX 1: Split inline numbered steps in Use Case table cells ──
  // Match any table cell containing '1. text 2. text 3. ...' inline
  result = result.replace(
    /(\| \*\*(?:Main Flow[^|]*|Alt Flow[^|]*)\*\* \| )([\s\S]*?)(?=\|)/g,
    (match, prefix, cellContent) => {
      const cell = cellContent.trim();
      // Skip if already properly uses <br/>
      if ((cell.match(/<br\s*\/>\s*\d+\./g) || []).length >= cell.match(/\d+\.\s/g)?.length) return match;
      
      // Clean up any broken <br> tags (without slashes) plus any periods attached
      // Pattern: <br> or <br>. or <br> . or <br>. <br/> etc. — normalize to space
      let cleanedCell = cell.replace(/<br\s*>/g, ' ')  // <br> → space
                            .replace(/\s+\.\s*/g, ' ') // any space-period-space → single space
                            .replace(/<br\s*\/?>/g, ''); // any <br> or <br/> → remove (will re-add)
      
      // Count numbered items
      const numberedCount = (cleanedCell.match(/\d+\.\s/g) || []).length;
      if (numberedCount < 2) return match;

      // Split on step boundaries
      const steps = cleanedCell.split(/\s+(?=\d+\.\s)/).map(s => s.trim()).filter(s => s.length > 0);
      
      if (steps.length <= 1) return match;

      // Renumber and ensure full stops
      const renumbered = steps.map((step, i) => {
        const clean = step.replace(/^\d+\.\s*/, '').trim();
        // Ensure step ends with full stop (but don't double-add)
        if (!/[.!?]$/.test(clean)) {
          return (i + 1) + '. ' + clean + '.';
        }
        return (i + 1) + '. ' + clean;
      });

      // The lookahead (?=\|) doesn't consume the closing |, so it remains in the original string
      // Don't add another | — just return prefix + processed content
      return prefix + renumbered.join(' <br/> ');
    }
  );

  // ── FIX 2: Ensure FR/NFR descriptions end with full stop ──
  // Pattern: - **Description:** text NOT ending with .!? → append .
  result = result.replace(
    /(-\s*\*\*Description:\*\*\s+.+?)(?=(\n-|##|###|\n\n|$))/g,
    (match, desc) => {
      // Only add period if sentence doesn't already end with .!?
      if (!/[.!?]$/.test(desc.trim())) {
        return desc.trim() + '.';
      }
      return desc;
    }
  );

  // ── FIX 3: Ensure requirement sentences end with full stop ──
  // Pattern: bullet points under FR-### or NFR-### that don't end with .!?
  result = result.replace(
    /(-\s+The system (?:SHALL|SHOULD) .+?)(?=(\n-|##|###|\n\n|$))/g,
    (match, req) => {
      // Only add period if sentence doesn't already end with .!?
      if (!/[.!?]$/.test(req.trim())) {
        return req.trim() + '.';
      }
      return req;
    }
  );

  // ── FIX 4: Ensure bullet points/notes end with full stop (but not headings) ──
  // Pattern: plain bullet lines (not bold/italic) under sections
  result = result.replace(
    /(-\s+(?!\[.*?\])(?!\*\*).+?)(?=(\n-|^## |^### |\n\n|$))/gm,
    (match, bullet) => {
      // Skip empty bullets, checkboxes, and already-ended sentences
      const trimmed = bullet.trim();
      if (!/[.!?]$/.test(trimmed) && !trimmed.match(/^-[\s]*$/) && !trimmed.match(/^\*\*/)) {
        return trimmed + '.';
      }
      return match;
    }
  );

  return result;
}

module.exports = { callSrsAgent, callSrsAgentWithRetry, callSrsAgentStream, buildGenerationPrompt, buildChatEditPrompt, buildDiffPrompt, postProcessSrs };
