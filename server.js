const http = require('node:http');
const { randomUUID } = require('node:crypto');

const PORT = getNumberEnv('PORT', 8765);
const API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-nano';
const API_KEY = process.env.OPENAI_API_KEY || '';
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || '*';
const DEFAULT_STYLE = process.env.DEFAULT_STYLE || 'prompt-professional';
const DEFAULT_TARGET_LANGUAGE = process.env.DEFAULT_TARGET_LANGUAGE || 'en';
const DEFAULT_MODE = process.env.DEFAULT_MODE || 'normal';
const REWRITE_TIMEOUT_MS = getNumberEnv('REWRITE_TIMEOUT_MS', 15000);
const MAX_INPUT_CHARS = getNumberEnv('MAX_INPUT_CHARS', 12000);
const MAX_OUTPUT_TOKENS = getNumberEnv('MAX_OUTPUT_TOKENS', 1200);
const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || 'low';
const OPENAI_STORE = getBooleanEnv('OPENAI_STORE', false);

const STYLE_HINTS = {
  'prompt-professional': 'Produce a clear, professional, AI-ready prompt with strong structure, precise wording, and only useful explicit constraints.',
  'role-first-initial': 'This is the first message in a GPT or Codex conversation for a complex task. Start the final prompt with the most appropriate role assignment inferred from the source text, then continue with the optimized prompt body.',
  'marked-segment-edit': 'Only rewrite explicitly marked segments using the %%segment%%(instruction) syntax. Unmarked text must remain unchanged in the final reconstructed prompt.',
  'professional-email': 'Produce professional email wording with natural tone, clear intent, and concise structure.',
  'short-concise': 'Produce the shortest natural version that still preserves all meaning and critical constraints.',
};

const MODE_HINTS = {
  'normal': 'Normal follow-up mode. Keep the current prompt optimization behavior. Do not add a new role assignment unless the source text explicitly asks for one.',
  'initial-role-first': 'Initial complex-task mode. This is likely the first prompt in a GPT or Codex conversation. The final prompt must begin with the exact words "You are a " followed by a corrected professional role phrase inferred from the source text. Never omit "You are a ". Correct obvious role typos, for example "frond end developer" must become "front end developer". Then present the rest of the optimized prompt.',
  'marked-segment-edit': 'Marked partial-edit mode. Only rewrite text wrapped as %%segment%%(suggestion). After reconstruction, all unmarked text must remain unchanged. Empty suggestion parentheses mean refine and rephrase.',
};

const DEFAULT_SYSTEM_PROMPT = `You are an expert prompt engineer.

Your task is to transform the user's source text into a clear, professional, and effective prompt for another AI model.

Primary goals:
1. Preserve the original intent exactly.
2. Improve clarity, precision, structure, and usefulness.
3. If the source text is not in English, translate it into natural, fluent English first, then optimize it.
4. Make the prompt concise but complete.

Rules:
- Do not change the meaning.
- Do not add unrelated assumptions, facts, examples, requirements, or context.
- Preserve all critical details from the source, especially names, URLs, code, markdown, numbers, units, JSON/schema requirements, quoted literals, and hard constraints.
- Remove ambiguity, redundancy, filler, and unnecessary wording.
- If the source is already a strong prompt, make only minimal edits.
- Use sections, bullet points, or numbered steps only when they improve readability or execution.
- Make instructions, constraints, expected output format, or acceptance criteria explicit only when they are already present in the source or are strongly implied by it.
- Do not invent output schemas or formatting requirements that the source does not justify.
- If the input includes protected placeholders, keep those placeholders exactly unchanged.
- Treat each protected placeholder as an exact stand-in for the original protected text.
- Do not duplicate, explain, restate, or parenthetically expand protected placeholders elsewhere in the output.
- Follow any mode-specific instruction provided with the request.
- Prefer direct, actionable wording over decorative phrasing.

Output rules:
- Return only the final rewritten prompt.
- Do not explain your changes.
- Do not include preambles, commentary, or markdown fences.
- Do not prepend labels such as "Optimized Prompt:" unless the source explicitly asks for them.`;

const DEFAULT_MARKED_SEGMENT_SYSTEM_PROMPT = `You are an expert prompt editor.

Your task is to rewrite only explicitly marked segments inside an existing prompt.

Rules:
- You will receive a full prompt template with placeholders and a numbered list of segments to rewrite.
- Rewrite only the listed segments.
- Do not rewrite, reorder, summarize, or mention any unmarked text.
- Each replacement must be a drop-in replacement for only that one marked segment.
- Do not repeat surrounding text from before or after the segment.
- Use the segment-specific suggestion if provided.
- If a segment's suggestion is "refine and rephrase", improve that segment while preserving the original meaning.
- Make each rewritten segment fit naturally into the surrounding prompt so the overall result is logical.
- Preserve names, URLs, code, markdown, numbers, units, quoted literals, JSON/schema requirements, and hard constraints unless the requested segment change clearly requires otherwise.
- If the input includes protected placeholders, keep those placeholders exactly unchanged.
- Treat each protected placeholder as an exact stand-in for the original protected text.
- Do not duplicate, explain, restate, or parenthetically expand protected placeholders elsewhere in the rewritten segment.

Example:
- Template: You are a [[SEGMENT_1]] building a dashboard.
- Segment 1 original text: frond end developer
- Segment 1 suggestion: correct the role and wording
- Good replacement: front-end developer
- Bad replacement: Act as a front-end developer building a dashboard.

Output rules:
- Return strict JSON only.
- Use this exact schema: {"replacements":[{"index":1,"text":"..."},{"index":2,"text":"..."}]}
- Return the same number of replacements as the number of input segments, in the same order.
- Each replacement must contain only the replacement text for that segment, with no markers, labels, explanations, or markdown fences.`;

function getNumberEnv(name, fallback) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function getBooleanEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue === '') {
    return fallback;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  return fallback;
}

function sendJSON(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function parseJSONSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error(`Request body exceeds ${maxBytes} bytes.`), { statusCode: 413 }));
        req.destroy();
        return;
      }

      body += chunk.toString('utf8');
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function createRequestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseProtectedSegments(text) {
  const sourceText = String(text || '');
  const pattern = /(?<!\*)\*([^*\n]+?)\*(?!\*)/g;
  const segments = [];
  let normalizedText = sourceText;
  let match;

  while ((match = pattern.exec(sourceText)) !== null) {
    segments.push({
      index: segments.length + 1,
      placeholder: `[[PROTECTED_SEGMENT_${segments.length + 1}]]`,
      originalText: match[1],
    });
  }

  for (const segment of segments) {
    normalizedText = normalizedText.replace(
      new RegExp(`(?<!\\*)\\*${escapeRegExp(segment.originalText)}\\*(?!\\*)`),
      segment.placeholder,
    );
  }

  return {
    text: normalizedText,
    segments,
  };
}

function formatProtectedSegments(protectedSegments) {
  if (!Array.isArray(protectedSegments) || protectedSegments.length === 0) {
    return '- None provided';
  }

  return protectedSegments
    .map((segment) => `- ${segment.placeholder}`)
    .join('\n');
}

function restoreProtectedSegments(text, protectedSegments) {
  let restored = String(text || '');

  for (const segment of protectedSegments || []) {
    restored = restored.split(segment.placeholder).join(segment.originalText);
  }

  return restored;
}

function parseMarkedSegmentEdits(text) {
  const pattern = /%%([\s\S]*?)%%\(([\s\S]*?)\)/g;
  const segments = [];
  const parts = [];
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const originalText = match[1];
    const suggestionText = match[2];
    const placeholder = `[[SEGMENT_${segments.length + 1}]]`;

    parts.push(text.slice(cursor, match.index));
    parts.push(placeholder);

    segments.push({
      index: segments.length + 1,
      placeholder,
      originalText,
      suggestion: suggestionText.trim() || 'refine and rephrase',
      prefixContext: text.slice(Math.max(0, match.index - 80), match.index),
      suffixContext: text.slice(match.index + fullMatch.length, Math.min(text.length, match.index + fullMatch.length + 80)),
    });

    cursor = match.index + fullMatch.length;
  }

  if (segments.length === 0) {
    throw createRequestError('marked-segment-edit mode requires at least one %%segment%%(suggestion) marker.');
  }

  parts.push(text.slice(cursor));
  const template = parts.join('');

  if (template.includes('%%')) {
    throw createRequestError('Invalid marked segment syntax. Use %%segment%%(suggestion) with parentheses immediately after the closing %%.');
  }

  return {
    template,
    segments,
  };
}

function buildUserPrompt({ text, style, targetLanguage, preserveTerms, mode, protectedSegments }) {
  const terms = Array.isArray(preserveTerms) && preserveTerms.length > 0
    ? preserveTerms.map((term) => `- ${String(term)}`).join('\n')
    : '- None provided';
  const styleHint = STYLE_HINTS[style] || 'Use the requested style while preserving meaning exactly.';
  const modeHint = MODE_HINTS[mode] || MODE_HINTS.normal;
  const protectedSegmentLines = formatProtectedSegments(protectedSegments);

  return [
    'Rewrite the following source text into an optimized prompt.',
    '',
    `Mode: ${mode}`,
    `Mode guidance: ${modeHint}`,
    `Target language: ${targetLanguage}`,
    `Requested style: ${style}`,
    `Style guidance: ${styleHint}`,
    'Preserve these terms exactly when present:',
    terms,
    'Protected placeholders that must remain unchanged:',
    protectedSegmentLines,
    '',
    'Source text:',
    '<<<BEGIN_SOURCE>>>',
    text,
    '<<<END_SOURCE>>>',
  ].join('\n');
}

function buildMarkedSegmentUserPrompt({ targetLanguage, markedEditContext, protectedSegments }) {
  const segmentLines = [];
  for (const segment of markedEditContext.segments) {
    segmentLines.push(`Segment ${segment.index}`);
    segmentLines.push(`Original text: ${segment.originalText}`);
    segmentLines.push(`Suggested modification: ${segment.suggestion}`);
    segmentLines.push(`Prefix context: ${segment.prefixContext || '(empty)'}`);
    segmentLines.push(`Suffix context: ${segment.suffixContext || '(empty)'}`);
    segmentLines.push('');
  }

  return [
    'Rewrite only the listed marked segments of the existing prompt.',
    '',
    `Target language: ${targetLanguage}`,
    'Protected placeholders that must remain unchanged:',
    formatProtectedSegments(protectedSegments),
    'The final prompt will be reconstructed by replacing placeholders with your returned segment replacements.',
    '',
    'Prompt template with placeholders:',
    '<<<BEGIN_TEMPLATE>>>',
    markedEditContext.template,
    '<<<END_TEMPLATE>>>',
    '',
    'Segments to rewrite:',
    segmentLines.join('\n').trim(),
  ].join('\n');
}

function buildOpenAIRequest({ text, style, targetLanguage, preserveTerms, mode, markedEditContext, protectedSegments }) {
  const instructions = mode === 'marked-segment-edit'
    ? (process.env.MARKED_SEGMENT_SYSTEM_PROMPT || DEFAULT_MARKED_SEGMENT_SYSTEM_PROMPT)
    : (process.env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT);
  const userPrompt = mode === 'marked-segment-edit'
    ? buildMarkedSegmentUserPrompt({ targetLanguage, markedEditContext, protectedSegments })
    : buildUserPrompt({ text, style, targetLanguage, preserveTerms, mode, protectedSegments });

  const payload = {
    model: MODEL,
    store: OPENAI_STORE,
    instructions,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: userPrompt,
          },
        ],
      },
    ],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: {
      format: {
        type: 'text',
      },
    },
  };

  if (OPENAI_REASONING_EFFORT) {
    payload.reasoning = { effort: OPENAI_REASONING_EFFORT };
  }

  return payload;
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputItems = Array.isArray(payload?.output) ? payload.output : [];
  const chunks = [];

  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : [];
    for (const contentItem of contentItems) {
      if (contentItem?.type === 'output_text' && typeof contentItem.text === 'string' && contentItem.text.trim()) {
        chunks.push(contentItem.text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

function parseMarkedSegmentModelResponse(rawText, expectedCount) {
  const normalizedText = String(rawText || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');
  const parsed = parseJSONSafe(normalizedText);

  if (!parsed || !Array.isArray(parsed.replacements)) {
    throw new Error('Marked segment mode returned invalid JSON.');
  }

  if (parsed.replacements.length !== expectedCount) {
    throw new Error(`Marked segment mode returned ${parsed.replacements.length} replacements, expected ${expectedCount}.`);
  }

  return parsed.replacements.map((item, position) => {
    const expectedIndex = position + 1;
    if (!item || Number(item.index) !== expectedIndex || typeof item.text !== 'string') {
      throw new Error('Marked segment mode returned replacements with an invalid structure.');
    }

    return {
      index: expectedIndex,
      text: item.text.trim(),
    };
  });
}

function applyMarkedSegmentReplacements(markedEditContext, replacements) {
  let result = markedEditContext.template;

  for (const replacement of replacements) {
    const segment = markedEditContext.segments[replacement.index - 1];
    result = result.replace(segment.placeholder, replacement.text);
  }

  return result;
}

function lowercaseLeadingPhrase(text) {
  if (!text) {
    return text;
  }

  return text.charAt(0).toLowerCase() + text.slice(1);
}

function normalizeInitialRoleFirstOutput(text) {
  let normalized = String(text || '').trim();
  if (!normalized) {
    return normalized;
  }

  normalized = normalized
    .replace(/\bfrond(?=(\s|-)?end\s+developer\b)/gi, 'front')
    .replace(/^["'“”‘’\s]+/, '');

  if (/^you are a\b/i.test(normalized)) {
    return normalized.replace(/^you are a\b/i, 'You are a');
  }

  if (/^you are an\b/i.test(normalized)) {
    return normalized.replace(/^you are an\b/i, 'You are a');
  }

  if (/^you are\b/i.test(normalized)) {
    const remainder = normalized.replace(/^you are\b[\s:,-]*/i, '');
    return `You are a ${lowercaseLeadingPhrase(remainder)}`.trim();
  }

  return `You are a ${lowercaseLeadingPhrase(normalized)}`.trim();
}

async function rewriteText({ text, style, targetLanguage, preserveTerms, mode, markedEditContext, protectedSegments }) {
  if (!API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it before starting the server.');
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(new Error('Request timeout')), REWRITE_TIMEOUT_MS);
  const clientRequestId = typeof randomUUID === 'function'
    ? randomUUID()
    : `rewrite-${Date.now()}`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-Client-Request-Id': clientRequestId,
      },
      body: JSON.stringify(buildOpenAIRequest({
        text,
        style,
        targetLanguage,
        preserveTerms,
        mode,
        markedEditContext,
        protectedSegments,
      })),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI API returned ${response.status}: ${errorText || response.statusText}`);
    }

    const payload = await response.json();
    let rewrittenText = extractOutputText(payload);
    if (!rewrittenText) {
      throw new Error('OpenAI returned an empty rewritten result.');
    }

    if (mode === 'marked-segment-edit') {
      const replacements = parseMarkedSegmentModelResponse(rewrittenText, markedEditContext.segments.length);
      rewrittenText = applyMarkedSegmentReplacements(markedEditContext, replacements);
    } else if (mode === 'initial-role-first') {
      rewrittenText = normalizeInitialRoleFirstOutput(rewrittenText);
    }

    if (protectedSegments && protectedSegments.length > 0) {
      rewrittenText = restoreProtectedSegments(rewrittenText, protectedSegments);
    }

    return {
      text: rewrittenText,
      requestId: response.headers.get('x-request-id') || clientRequestId,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Rewrite request timed out after ${REWRITE_TIMEOUT_MS}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function shouldReturnJSON(req) {
  const acceptHeader = String(req.headers.accept || '');
  return acceptHeader.includes('application/json');
}

function getRoutes() {
  return ['/health', '/rewrite', '/v1/rewrite'];
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    sendJSON(res, 200, {
      ok: true,
      service: 'prompt-rewriter',
      configured: Boolean(API_KEY),
      model: MODEL,
      apiUrl: API_URL,
      routes: getRoutes(),
      defaultMode: DEFAULT_MODE,
    });
    return;
  }

  if (req.method !== 'POST' || (req.url !== '/rewrite' && req.url !== '/v1/rewrite')) {
    sendJSON(res, 404, {
      error: 'Not found. Use POST /v1/rewrite with { text, mode?, style?, targetLanguage?, preserveTerms? }',
    });
    return;
  }

  let body;
  try {
    body = await readRequestBody(req, MAX_INPUT_CHARS * 6);
  } catch (error) {
    const statusCode = error?.statusCode || 400;
    sendJSON(res, statusCode, { error: error.message || 'Failed to read request body.' });
    return;
  }

  const requestPayload = parseJSONSafe(body);
  if (!requestPayload || typeof requestPayload !== 'object') {
    sendJSON(res, 400, {
      error: 'Invalid JSON. Expected { "text": "...", "style"?: "...", "mode"?: "...", "targetLanguage"?: "en" }',
    });
    return;
  }

  const rawText = typeof requestPayload.text === 'string' ? requestPayload.text.trim() : '';
  const style = typeof requestPayload.style === 'string' && requestPayload.style.trim()
    ? requestPayload.style.trim()
    : DEFAULT_STYLE;
  const mode = typeof requestPayload.mode === 'string' && requestPayload.mode.trim()
    ? requestPayload.mode.trim()
    : DEFAULT_MODE;
  const targetLanguage = typeof requestPayload.targetLanguage === 'string' && requestPayload.targetLanguage.trim()
    ? requestPayload.targetLanguage.trim()
    : DEFAULT_TARGET_LANGUAGE;
  const preserveTerms = Array.isArray(requestPayload.preserveTerms)
    ? requestPayload.preserveTerms.slice(0, 50)
    : [];

  if (!rawText) {
    sendJSON(res, 400, { error: 'text is required.' });
    return;
  }

  if (rawText.length > MAX_INPUT_CHARS) {
    sendJSON(res, 413, { error: `text exceeds MAX_INPUT_CHARS (${MAX_INPUT_CHARS}).` });
    return;
  }

  const protectedSegmentContext = parseProtectedSegments(rawText);
  const text = protectedSegmentContext.text;

  let markedEditContext = null;
  if (mode === 'marked-segment-edit') {
    try {
      markedEditContext = parseMarkedSegmentEdits(text);
    } catch (error) {
      sendJSON(res, error?.statusCode || 400, { error: error.message || 'Invalid marked segment syntax.' });
      return;
    }
  }

  const startedAt = Date.now();

  try {
    const result = await rewriteText({
      text,
      style,
      targetLanguage,
      preserveTerms,
      mode,
      markedEditContext,
      protectedSegments: protectedSegmentContext.segments,
    });
    const responsePayload = {
      text: result.text,
      mode,
      targetLanguage,
      style,
      latencyMs: Date.now() - startedAt,
      provider: 'openai',
      model: MODEL,
      requestId: result.requestId,
    };

    if (shouldReturnJSON(req)) {
      sendJSON(res, 200, responsePayload);
      return;
    }

    sendText(res, 200, result.text);
  } catch (error) {
    if (getBooleanEnv('FALLBACK_ECHO', false)) {
      const fallbackPayload = {
        text: rawText.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '$1'),
        mode,
        targetLanguage,
        style,
        latencyMs: Date.now() - startedAt,
        provider: 'fallback',
        model: MODEL,
        fallbackUsed: true,
      };

      if (shouldReturnJSON(req)) {
        sendJSON(res, 200, fallbackPayload);
        return;
      }

      sendText(res, 200, text);
      return;
    }

    sendJSON(res, 502, {
      error: error?.message || 'Rewrite failed.',
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Rewrite server listening on http://127.0.0.1:${PORT}/v1/rewrite`);
  if (!API_KEY) {
    console.log('OPENAI_API_KEY is missing. Add it before sending real rewrite requests.');
  }
});
