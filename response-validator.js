/**
 * Charitas Clew - Response Validator & Resilience Helpers
 * Validates untrusted Gemini output, sanitizes resiliently, and classifies model error retryability.
 */

export const DEFAULT_DEADLINE_FALLBACK = 'See notice text for response instructions and timeframes.';

/**
 * Strips ASCII control characters except newline (\n), carriage return (\r), and tab (\t).
 * @param {string} str
 * @returns {string}
 */
function stripControlChars(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Validates the parsed Gemini response against the required structural and semantic contract.
 * Unknown fields are discarded, control characters are removed, strings and arrays are clamped,
 * malformed action steps are skipped, and safe deadline fallback text is provided when needed.
 * Required semantic fields fail closed.
 * @param {*} parsed
 * @returns {{ valid: boolean, data?: object, error?: string }}
 */
export function validateModelResponse(parsed) {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: 'Model response must be a plain object.' };
  }

  // 1. actualMeaning (required semantic field)
  if (typeof parsed.actualMeaning !== 'string') {
    return { valid: false, error: 'actualMeaning must be a string.' };
  }
  const cleanActualMeaning = stripControlChars(parsed.actualMeaning).trim();
  if (cleanActualMeaning.length === 0) {
    return { valid: false, error: 'actualMeaning cannot be empty.' };
  }
  const actualMeaning = cleanActualMeaning.length > 5000
    ? cleanActualMeaning.slice(0, 5000)
    : cleanActualMeaning;

  // 2. hasDeadline (strict boolean check: no string coercion)
  if (typeof parsed.hasDeadline !== 'boolean') {
    return { valid: false, error: 'hasDeadline must be a boolean.' };
  }
  const hasDeadline = parsed.hasDeadline;

  // 3. deadlineDate (optional/nullable string)
  let deadlineDate = null;
  if (parsed.deadlineDate !== undefined && parsed.deadlineDate !== null) {
    if (typeof parsed.deadlineDate === 'string') {
      const cleanDate = stripControlChars(parsed.deadlineDate).trim();
      if (cleanDate.length > 0) {
        deadlineDate = cleanDate.length > 200 ? cleanDate.slice(0, 200) : cleanDate;
      }
    }
  }

  // 4. deadlineContext (optional/nullable string)
  let deadlineContext = null;
  if (parsed.deadlineContext !== undefined && parsed.deadlineContext !== null) {
    if (typeof parsed.deadlineContext === 'string') {
      const cleanCtx = stripControlChars(parsed.deadlineContext).trim();
      if (cleanCtx.length > 1000) {
        deadlineContext = cleanCtx.length > 1000 ? cleanCtx.slice(0, 1000) : cleanCtx;
      } else if (cleanCtx.length > 0) {
        deadlineContext = cleanCtx;
      }
    }
  }

  // Safe deadline fallback: If deadline is flagged but neither date nor context was provided,
  // supply neutral fallback text instead of failing with a 502 error
  if (hasDeadline && !deadlineDate && !deadlineContext) {
    deadlineContext = DEFAULT_DEADLINE_FALLBACK;
  }

  // 5. actionSteps (required semantic field)
  if (!Array.isArray(parsed.actionSteps)) {
    return { valid: false, error: 'actionSteps must be an array.' };
  }
  if (parsed.actionSteps.length === 0) {
    return { valid: false, error: 'actionSteps must contain between 1 and 5 items.' };
  }

  const sanitizedSteps = [];
  const rawSteps = parsed.actionSteps.slice(0, 5); // Clamp to at most 5 items
  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    if (typeof step !== 'object' || step === null || Array.isArray(step)) {
      continue; // Skip malformed non-object steps
    }

    if (typeof step.title !== 'string' || typeof step.description !== 'string') {
      continue; // Skip malformed steps missing title or description
    }

    const cleanTitle = stripControlChars(step.title).trim();
    const cleanDesc = stripControlChars(step.description).trim();
    if (cleanTitle.length === 0 || cleanDesc.length === 0) {
      continue; // Skip steps with empty content
    }

    sanitizedSteps.push({
      title: cleanTitle.length > 200 ? cleanTitle.slice(0, 200) : cleanTitle,
      description: cleanDesc.length > 1000 ? cleanDesc.slice(0, 1000) : cleanDesc
    });
  }

  if (sanitizedSteps.length === 0) {
    return { valid: false, error: 'actionSteps must contain at least one usable action step.' };
  }

  // 6. advocateScript (required semantic field)
  if (typeof parsed.advocateScript !== 'string') {
    return { valid: false, error: 'advocateScript must be a string.' };
  }
  const cleanScript = stripControlChars(parsed.advocateScript).trim();
  if (cleanScript.length === 0) {
    return { valid: false, error: 'advocateScript cannot be empty.' };
  }
  const advocateScript = cleanScript.length > 5000
    ? cleanScript.slice(0, 5000)
    : cleanScript;

  return {
    valid: true,
    data: {
      actualMeaning,
      hasDeadline,
      deadlineDate,
      deadlineContext,
      actionSteps: sanitizedSteps,
      advocateScript
    }
  };
}

/**
 * Determines whether an error from the Gemini provider is retryable.
 * Only transient rate limits (429), temporary service outages (503), or network timeouts are retryable.
 * Client errors (400), auth errors, and safety blocks are NOT retryable.
 * @param {Error|Object} error
 * @returns {boolean}
 */
export function isRetryableGeminiError(error) {
  if (!error) return false;

  const status = error.status || error.statusCode || (error.response && error.response.status);
  // Client errors (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found) are never retryable
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
    return false;
  }

  const msg = String(error.message || '').toLowerCase();
  // Safety blocks, prompt blocks, content moderation or invalid arguments must never be retried
  if (
    msg.includes('safety') ||
    msg.includes('blocked') ||
    msg.includes('block_reason') ||
    msg.includes('invalid argument') ||
    msg.includes('permission_denied') ||
    msg.includes('unauthenticated')
  ) {
    return false;
  }

  // HTTP 429 (Rate Limit / Quota) or HTTP 503 (Service Unavailable)
  if (status === 429 || status === 503) {
    return true;
  }

  if (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('resource_exhausted') ||
    msg.includes('unavailable')
  ) {
    return true;
  }

  // Network and timeout errors
  if (
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNRESET' ||
    error.code === 'EAI_AGAIN' ||
    error.code === 'ENOTFOUND' ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  ) {
    return true;
  }

  return false;
}

/**
 * Wraps a promise in an explicit timeout.
 * @param {Promise} promise
 * @param {number} [ms=15000] - Timeout in milliseconds
 * @param {string} [msg='Model request timed out']
 * @returns {Promise}
 */
export async function withTimeout(promise, ms = 15000, msg = 'Model request timed out') {
  let timeoutId;
  const timer = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(msg);
      err.status = 504;
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);
  });

  try {
    return await Promise.race([promise, timer]);
  } finally {
    clearTimeout(timeoutId);
  }
}
