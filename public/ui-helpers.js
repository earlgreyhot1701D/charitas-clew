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
