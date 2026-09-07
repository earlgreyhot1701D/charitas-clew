/**
 * Charitas Clew - Response Validator & Resilience Helpers
 * Validates untrusted Gemini output and classifies model error retryability.
 */

const ALLOWED_TOP_LEVEL_KEYS = [
  'actualMeaning',
  'hasDeadline',
  'deadlineDate',
  'deadlineContext',
  'actionSteps',
  'advocateScript'
];

const ALLOWED_STEP_KEYS = ['title', 'description'];

/**
 * Validates the parsed Gemini response against the required structural and semantic contract.
 * Rejects unexpected extra properties, invalid types, oversized values, and deadline inconsistencies.
 * @param {*} parsed
 * @returns {{ valid: boolean, data?: object, error?: string }}
 */
export function validateModelResponse(parsed) {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: 'Model response must be a plain object.' };
  }

  // Policy: Reject unexpected extra properties to prevent hallucinated/injected fields
  const extraKeys = Object.keys(parsed).filter(k => !ALLOWED_TOP_LEVEL_KEYS.includes(k));
  if (extraKeys.length > 0) {
    return { valid: false, error: `Unexpected extra properties in model response: ${extraKeys.join(', ')}` };
  }

  // 1. actualMeaning
  if (typeof parsed.actualMeaning !== 'string') {
    return { valid: false, error: 'actualMeaning must be a string.' };
  }
  const actualMeaning = parsed.actualMeaning.trim();
  if (actualMeaning.length === 0) {
    return { valid: false, error: 'actualMeaning cannot be empty.' };
  }
  if (actualMeaning.length > 5000) {
    return { valid: false, error: 'actualMeaning exceeds maximum allowed length of 5,000 characters.' };
  }

  // 2. hasDeadline (strict boolean check: no string coercion)
  if (typeof parsed.hasDeadline !== 'boolean') {
    return { valid: false, error: 'hasDeadline must be a boolean.' };
  }
  const hasDeadline = parsed.hasDeadline;

  // 3. deadlineDate (optional/nullable string)
  let deadlineDate = null;
  if (parsed.deadlineDate !== undefined && parsed.deadlineDate !== null) {
    if (typeof parsed.deadlineDate !== 'string') {
      return { valid: false, error: 'deadlineDate must be a string when provided.' };
    }
    if (parsed.deadlineDate.length > 200) {
      return { valid: false, error: 'deadlineDate exceeds maximum length of 200 characters.' };
    }
    deadlineDate = parsed.deadlineDate.trim();
  }

  // 4. deadlineContext (optional/nullable string)
  let deadlineContext = null;
  if (parsed.deadlineContext !== undefined && parsed.deadlineContext !== null) {
    if (typeof parsed.deadlineContext !== 'string') {
      return { valid: false, error: 'deadlineContext must be a string when provided.' };
    }
    if (parsed.deadlineContext.length > 1000) {
      return { valid: false, error: 'deadlineContext exceeds maximum length of 1,000 characters.' };
    }
    deadlineContext = parsed.deadlineContext.trim();
  }

  // Deadline consistency check:
  // If hasDeadline is true, require at least deadlineDate or deadlineContext to avoid empty deadline state
  if (hasDeadline) {
    const hasValidDate = deadlineDate && deadlineDate.length > 0;
    const hasValidContext = deadlineContext && deadlineContext.length > 0;
    if (!hasValidDate && !hasValidContext) {
      return { valid: false, error: 'hasDeadline is true but neither deadlineDate nor deadlineContext was provided.' };
    }
  }

  // 5. actionSteps
  if (!Array.isArray(parsed.actionSteps)) {
    return { valid: false, error: 'actionSteps must be an array.' };
  }
  if (parsed.actionSteps.length < 1 || parsed.actionSteps.length > 5) {
    return { valid: false, error: 'actionSteps must contain between 1 and 5 items.' };
  }

  const sanitizedSteps = [];
  for (let i = 0; i < parsed.actionSteps.length; i++) {
    const step = parsed.actionSteps[i];
    if (typeof step !== 'object' || step === null || Array.isArray(step)) {
      return { valid: false, error: `actionSteps[${i}] must be an object.` };
    }

    const stepExtraKeys = Object.keys(step).filter(k => !ALLOWED_STEP_KEYS.includes(k));
    if (stepExtraKeys.length > 0) {
      return { valid: false, error: `actionSteps[${i}] has unexpected properties: ${stepExtraKeys.join(', ')}` };
    }

    if (typeof step.title !== 'string' || step.title.trim().length === 0) {
      return { valid: false, error: `actionSteps[${i}].title must be a non-empty string.` };
    }
    if (step.title.length > 200) {
      return { valid: false, error: `actionSteps[${i}].title exceeds maximum length of 200 characters.` };
    }

    if (typeof step.description !== 'string' || step.description.trim().length === 0) {
      return { valid: false, error: `actionSteps[${i}].description must be a non-empty string.` };
    }
    if (step.description.length > 1000) {
      return { valid: false, error: `actionSteps[${i}].description exceeds maximum length of 1,000 characters.` };
    }

    sanitizedSteps.push({
      title: step.title.trim(),
      description: step.description.trim()
    });
  }

  // 6. advocateScript
  if (typeof parsed.advocateScript !== 'string') {
    return { valid: false, error: 'advocateScript must be a string.' };
  }
  const advocateScript = parsed.advocateScript.trim();
  if (advocateScript.length === 0) {
    return { valid: false, error: 'advocateScript cannot be empty.' };
  }
  if (advocateScript.length > 5000) {
    return { valid: false, error: 'advocateScript exceeds maximum allowed length of 5,000 characters.' };
  }

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
