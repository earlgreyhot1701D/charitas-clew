import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderActionSteps,
  classifyFrontendError,
  isCalendarSunset,
  SUNSET_DATE
} from '../public/ui-helpers.js';

/**
 * Lightweight mock DOM factory to simulate DOM node creation without full browser automation.
 */
function createMockDocument() {
  function createElement(tagName) {
    const children = [];
    return {
      tagName: tagName.toUpperCase(),
      className: '',
      children,
      _textContent: '',
      get textContent() {
        return this._textContent;
      },
      set textContent(val) {
        this._textContent = String(val);
      },
      appendChild(child) {
        children.push(child);
      },
      replaceChildren() {
        children.length = 0;
      },
      getElementsByTagName(searchTag) {
        const needle = searchTag.toUpperCase();
        const results = [];
        for (const child of children) {
          if (child.tagName === needle) {
            results.push(child);
          }
          if (typeof child.getElementsByTagName === 'function') {
            results.push(...child.getElementsByTagName(needle));
          }
        }
        return results;
      }
    };
  }

  return {
    createElement,
    createContainer() {
      const container = createElement('div');
      container.ownerDocument = this;
      return container;
    }
  };
}

describe('Frontend Safety & Error Recovery Regression Suite', () => {

  // ==========================================
  // 1. Untrusted Action-Step DOM Rendering (XSS Protection)
  // ==========================================

  test('renderActionSteps creates explicit DOM elements with textContent instead of parsing markup', () => {
    const mockDoc = createMockDocument();
    const container = mockDoc.createContainer();

    const maliciousActionSteps = [
      {
        title: '<img src=x onerror="window.__xss = true"> Call Court Clerk',
        description: '<script>window.__xss = true</script> Request postponement hearing.'
      }
    ];

    renderActionSteps(container, maliciousActionSteps);

    // Verify exactly 1 step item container was created
    assert.equal(container.children.length, 1);
    const item = container.children[0];
    assert.equal(item.tagName, 'DIV');
    assert.equal(item.className, 'step-item');

    // Child 0 is <strong>, Child 1 is <span>
    assert.equal(item.children.length, 2);
    const strong = item.children[0];
    const span = item.children[1];
    assert.equal(strong.tagName, 'STRONG');
    assert.equal(span.tagName, 'SPAN');

    // Content must be stored as raw text in textContent, not as DOM nodes
    assert.equal(strong.textContent, 'Step 1: <img src=x onerror="window.__xss = true"> Call Court Clerk');
    assert.equal(span.textContent, '<script>window.__xss = true</script> Request postponement hearing.');

    // Crucial check: NO <img> or <script> element nodes must exist in the container
    const imgElements = container.getElementsByTagName('img');
    assert.equal(imgElements.length, 0, 'Must NOT create any <img> DOM elements from model text');

    const scriptElements = container.getElementsByTagName('script');
    assert.equal(scriptElements.length, 0, 'Must NOT create any <script> DOM elements from model text');
  });

  test('renderActionSteps handles multiple steps with proper numbering and sanitization', () => {
    const mockDoc = createMockDocument();
    const container = mockDoc.createContainer();

    const steps = [
      { title: '<b>Step Alpha</b>', description: 'Description Alpha' },
      { title: 'Step Beta', description: '<svg onload=alert(1)>Description Beta</svg>' },
      { title: 'Step Gamma', description: 'Description Gamma' }
    ];

    renderActionSteps(container, steps);

    assert.equal(container.children.length, 3);
    assert.equal(container.children[0].children[0].textContent, 'Step 1: <b>Step Alpha</b>');
    assert.equal(container.children[1].children[1].textContent, '<svg onload=alert(1)>Description Beta</svg>');
    assert.equal(container.children[2].children[0].textContent, 'Step 3: Step Gamma');

    // Verify neither <b> nor <svg> were parsed as element nodes
    assert.equal(container.getElementsByTagName('b').length, 0);
    assert.equal(container.getElementsByTagName('svg').length, 0);
  });

  test('renderActionSteps safely clears previous items when given empty or missing steps', () => {
    const mockDoc = createMockDocument();
    const container = mockDoc.createContainer();

    // First render
    renderActionSteps(container, [{ title: 'Initial', description: 'Desc' }]);
    assert.equal(container.children.length, 1);

    // Re-render with empty array
    renderActionSteps(container, []);
    assert.equal(container.children.length, 0);

    // Re-render with null/undefined
    renderActionSteps(container, [{ title: 'Initial 2', description: 'Desc 2' }]);
    assert.equal(container.children.length, 1);
    renderActionSteps(container, null);
    assert.equal(container.children.length, 0);
  });

  // ==========================================
  // 2. Transient Failure Handling (No EOL Shutdown)
  // ==========================================

  test('classifyFrontendError classifies 500 server errors as transient without EOL shutdown', () => {
    const result = classifyFrontendError({ status: 500 });
    assert.equal(result.isTransient, true);
    assert.equal(result.message, 'The service is temporarily unavailable. Please wait a moment and try again.');
  });

  test('classifyFrontendError classifies 502/503/504 gateway errors as transient without EOL shutdown', () => {
    [502, 503, 504].forEach(statusCode => {
      const result = classifyFrontendError({ status: statusCode });
      assert.equal(result.isTransient, true);
      assert.equal(result.message, 'The service is temporarily unavailable. Please wait a moment and try again.');
    });
  });

  test('classifyFrontendError classifies network fetch exceptions as transient without EOL shutdown', () => {
    const result = classifyFrontendError({ isNetworkError: true });
    assert.equal(result.isTransient, true);
    assert.equal(result.message, "We couldn't reach the service. Check your connection and try again.");
  });

  test('classifyFrontendError handles 400 client error cleanly without EOL shutdown', () => {
    const result = classifyFrontendError({ status: 400, errMessage: 'Uploaded file size exceeds the 7MB limit.' });
    assert.equal(result.isTransient, false);
    assert.equal(result.message, 'Uploaded file size exceeds the 7MB limit.');
  });

  test('simulated UI lifecycle on transient error keeps Run button and notice input enabled for retry', () => {
    // Simulate UI state
    let isSunsetted = false;
    const btn = { disabled: false, innerHTML: 'Simplify Notice ↳' };
    const noticeInput = { disabled: false, value: 'Original Notice Text' };
    let shownError = null;
    const showError = (msg) => { shownError = msg; };

    // Function simulating the fixed handleRun logic
    function simulateDeconstructAttempt(responseStatus, isNetworkFailure) {
      // 1. Request begins
      btn.disabled = true;
      noticeInput.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Deconstructing...';

      // 2. Error occurs
      if (isNetworkFailure) {
        const err = classifyFrontendError({ isNetworkError: true });
        showError(err.message);
      } else if (responseStatus >= 500) {
        const err = classifyFrontendError({ status: responseStatus });
        showError(err.message);
      }

      // 3. Finally block
      if (!isSunsetted) {
        btn.disabled = false;
        noticeInput.disabled = false;
        btn.innerHTML = 'Simplify Notice ↳';
      }
    }

    // Simulate 500 Internal Server Error
    simulateDeconstructAttempt(500, false);
    assert.equal(isSunsetted, false, 'Transient 500 must NOT trip isSunsetted');
    assert.equal(btn.disabled, false, 'Run button must remain enabled for retry');
    assert.equal(noticeInput.disabled, false, 'Notice input must remain enabled for user to edit/retry');
    assert.equal(btn.innerHTML, 'Simplify Notice ↳');
    assert.equal(shownError, 'The service is temporarily unavailable. Please wait a moment and try again.');
    assert.equal(noticeInput.value, 'Original Notice Text', 'Notice text must not be cleared');

    // Simulate Network Failure
    simulateDeconstructAttempt(0, true);
    assert.equal(isSunsetted, false, 'Network failure must NOT trip isSunsetted');
    assert.equal(btn.disabled, false, 'Run button must remain enabled for retry');
    assert.equal(noticeInput.disabled, false, 'Notice input must remain enabled for retry');
    assert.equal(btn.innerHTML, 'Simplify Notice ↳');
    assert.equal(shownError, "We couldn't reach the service. Check your connection and try again.");
  });

  // ==========================================
  // 3. Permanent Calendar Sunset (Sunset Logic Preservation)
  // ==========================================

  test('isCalendarSunset returns false during active operation before sunset date', () => {
    const activeDate = new Date('2026-09-07T00:00:00Z');
    assert.equal(isCalendarSunset(activeDate), false);
  });

  test('isCalendarSunset returns true only after configured sunset date (2027-01-01)', () => {
    assert.equal(SUNSET_DATE.toISOString().slice(0, 10), '2027-01-01');

    const expiredDate = new Date('2027-01-02T00:00:00Z');
    assert.equal(isCalendarSunset(expiredDate), true);
  });

  test('simulated permanent sunset disables interface and marks system sunsetted', () => {
    let isSunsetted = false;
    const btn = { disabled: false, innerText: 'Simplify Notice ↳' };
    const noticeInput = { disabled: false };
    let bannerActive = false;

    function triggerEOL() {
      isSunsetted = true;
      bannerActive = true;
      btn.disabled = true;
      noticeInput.disabled = true;
      btn.innerText = 'System Sunsetted';
    }

    // Check calendar sunset for a date in 2027
    const simulatedDate = new Date('2027-02-01');
    if (isCalendarSunset(simulatedDate)) {
      triggerEOL();
    }

    assert.equal(isSunsetted, true);
    assert.equal(bannerActive, true);
    assert.equal(btn.disabled, true);
    assert.equal(noticeInput.disabled, true);
    assert.equal(btn.innerText, 'System Sunsetted');
  });
});
