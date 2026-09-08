/**
 * Charitas Clew - Frontend UI & Safety Helpers
 * Provides safe DOM construction for untrusted model output and error classification.
 */

export const SUNSET_DATE = new Date('2027-01-01');

/**
 * Checks whether the current date has passed the planned calendar sunset date.
 * @param {Date} [currentDate=new Date()]
 * @returns {boolean}
 */
export function isCalendarSunset(currentDate = new Date()) {
  return currentDate > SUNSET_DATE;
}

/**
 * Classifies an API or network failure into appropriate user-facing error state.
 * Transient server/network failures are marked retryable and do NOT trigger EOL shutdown.
 * @param {Object} params
 * @param {number} [params.status] - HTTP status code
 * @param {boolean} [params.isNetworkError] - True if fetch threw network error
 * @param {string} [params.errMessage] - Backend error message if available
 * @returns {{ isTransient: boolean, message: string }}
 */
export function classifyFrontendError({ status, isNetworkError, errMessage } = {}) {
  if (isNetworkError) {
    return {
      isTransient: true,
      message: "We couldn't reach the service. Check your connection and try again."
    };
  }
  if (typeof status === 'number' && status >= 500) {
    return {
      isTransient: true,
      message: "The service is temporarily unavailable. Please wait a moment and try again."
    };
  }
  return {
    isTransient: false,
    message: errMessage || (status ? `Server returned error status ${status}.` : "An unexpected error occurred.")
  };
}

/**
 * Safely renders action steps using explicit DOM nodes and .textContent.
 * Prevents untrusted model output containing HTML/script tags from being parsed as markup.
 * @param {HTMLElement} container - Target container element
 * @param {Array<{ title?: string, description?: string }>} actionSteps - Untrusted model data
 */
export function renderActionSteps(container, actionSteps) {
  if (!container) return;

  // Clear existing content safely
  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
  } else {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  if (!Array.isArray(actionSteps) || actionSteps.length === 0) {
    return;
  }

  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  actionSteps.forEach((step, idx) => {
    if (!step) return;

    const item = doc.createElement('div');
    item.className = 'step-item';

    const strong = doc.createElement('strong');
    strong.textContent = `Step ${idx + 1}: ${step.title || ''}`;

    const span = doc.createElement('span');
    span.textContent = step.description || '';

    item.appendChild(strong);
    item.appendChild(span);
    container.appendChild(item);
  });
}

/**
 * Explicit allowlist of permissible localStorage keys.
 * Notice content and generated output must NEVER be stored in persistent storage.
 */
export const ALLOWED_STORAGE_KEYS = new Set(['charitas_pref_lang']);

/**
 * Safely writes an allowlisted preference to persistent storage.
 * Rejects non-allowlisted keys or sensitive notice content.
 * @param {string} key
 * @param {string} value
 * @param {Storage|Object} [storage=localStorage]
 * @returns {boolean} True if written successfully
 */
export function setSafePreference(key, value, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage || !ALLOWED_STORAGE_KEYS.has(key)) return false;
  try {
    storage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely reads an allowlisted preference from persistent storage.
 * @param {string} key
 * @param {Storage|Object} [storage=localStorage]
 * @returns {string|null}
 */
export function getSafePreference(key, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage || !ALLOWED_STORAGE_KEYS.has(key)) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Purges legacy or sensitive keys from localStorage to prevent persistence leaks.
 * @param {Storage|Object} [storage=localStorage]
 */
export function purgeSensitiveStorage(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return;
  const legacyKeys = ['charitas_last_notice'];
  legacyKeys.forEach(k => {
    try {
      storage.removeItem(k);
    } catch {}
  });
}

