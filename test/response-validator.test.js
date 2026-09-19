import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateModelResponse,
  DEFAULT_DEADLINE_FALLBACK,
  isRetryableGeminiError,
  withTimeout
} from '../response-validator.js';

describe('Response Validator & Resilience Helper Unit Tests', () => {

  const validSample = {
    actualMeaning: 'Notice that electricity will be disconnected on October 1, 2026 unless paid.',
    hasDeadline: true,
    deadlineDate: 'October 1, 2026',
    deadlineContext: 'Service disconnect date.',
    actionSteps: [
      { title: 'Call Utility', description: 'Request emergency assistance program.' },
      { title: 'Submit Medical Form', description: 'If anyone requires life-support equipment.' }
    ],
    advocateScript: 'Hello, I am calling regarding notice on my account.'
  };

  // ==========================================
  // 1. validateModelResponse Contract
  // ==========================================

  test('valid model response passes validation and returns sanitized copy', () => {
    const result = validateModelResponse(validSample);
    assert.equal(result.valid, true);
    assert.equal(result.data.actualMeaning, validSample.actualMeaning);
    assert.equal(result.data.hasDeadline, true);
    assert.equal(result.data.deadlineDate, 'October 1, 2026');
    assert.equal(result.data.actionSteps.length, 2);
    assert.equal(result.data.advocateScript, validSample.advocateScript);
  });

  test('valid response with hasDeadline: false and null dates is accepted', () => {
    const result = validateModelResponse({
      actualMeaning: 'Informational letter with no required response.',
      hasDeadline: false,
      deadlineDate: null,
      deadlineContext: null,
      actionSteps: [
        { title: 'File Letter', description: 'Keep in personal records.' }
      ],
      advocateScript: 'Hello, I received your informational letter.'
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.hasDeadline, false);
    assert.equal(result.data.deadlineDate, null);
  });

  test('non-object input (null, number, boolean, string) is rejected', () => {
    assert.equal(validateModelResponse(null).valid, false);
    assert.equal(validateModelResponse(undefined).valid, false);
    assert.equal(validateModelResponse(12345).valid, false);
    assert.equal(validateModelResponse('{"actualMeaning":"text"}').valid, false);
  });

  test('top-level array instead of object is rejected', () => {
    const result = validateModelResponse([validSample]);
    assert.equal(result.valid, false);
    assert.match(result.error, /plain object/i);
  });

  test('missing actualMeaning is rejected', () => {
    const copy = { ...validSample };
    delete copy.actualMeaning;
    const result = validateModelResponse(copy);
    assert.equal(result.valid, false);
    assert.match(result.error, /actualMeaning/i);
  });

  test('empty or whitespace actualMeaning is rejected', () => {
    const result = validateModelResponse({ ...validSample, actualMeaning: '   ' });
    assert.equal(result.valid, false);
    assert.match(result.error, /actualMeaning/i);
  });

  test('oversized actualMeaning (>5000 chars) is clamped to 5000 characters', () => {
    const result = validateModelResponse({ ...validSample, actualMeaning: 'x'.repeat(5001) });
    assert.equal(result.valid, true);
    assert.equal(result.data.actualMeaning.length, 5000);
  });

  test('hasDeadline as string instead of boolean is rejected without coercion', () => {
    const resultStringTrue = validateModelResponse({ ...validSample, hasDeadline: 'true' });
    assert.equal(resultStringTrue.valid, false);
    assert.match(resultStringTrue.error, /boolean/i);

    const resultStringFalse = validateModelResponse({ ...validSample, hasDeadline: 'false' });
    assert.equal(resultStringFalse.valid, false);
    assert.match(resultStringFalse.error, /boolean/i);
  });

  test('deadline consistency: hasDeadline === true without date or context falls back safely', () => {
    const incomplete = {
      ...validSample,
      hasDeadline: true,
      deadlineDate: null,
      deadlineContext: null
    };
    const result = validateModelResponse(incomplete);
    assert.equal(result.valid, true);
    assert.equal(result.data.deadlineContext, DEFAULT_DEADLINE_FALLBACK);
  });

  test('deadline consistency: hasDeadline === true with only deadlineContext is accepted', () => {
    const validWithContext = {
      ...validSample,
      hasDeadline: true,
      deadlineDate: null,
      deadlineContext: 'Must respond within 14 days of receipt.'
    };
    const result = validateModelResponse(validWithContext);
    assert.equal(result.valid, true);
  });

  test('deadline consistency: hasDeadline === true with only deadlineDate is accepted', () => {
    const validWithDate = {
      ...validSample,
      hasDeadline: true,
      deadlineDate: 'October 1, 2026',
      deadlineContext: null
    };
    const result = validateModelResponse(validWithDate);
    assert.equal(result.valid, true);
  });

  test('missing actionSteps is rejected', () => {
    const copy = { ...validSample };
    delete copy.actionSteps;
    const result = validateModelResponse(copy);
    assert.equal(result.valid, false);
    assert.match(result.error, /actionSteps/i);
  });

  test('actionSteps as string is rejected', () => {
    const result = validateModelResponse({ ...validSample, actionSteps: 'Step 1: Call' });
    assert.equal(result.valid, false);
    assert.match(result.error, /actionSteps/i);
  });

  test('empty actionSteps array is rejected', () => {
    const result = validateModelResponse({ ...validSample, actionSteps: [] });
    assert.equal(result.valid, false);
    assert.match(result.error, /between 1 and 5 items/i);
  });

  test('oversized actionSteps array (>5 items) is clamped to 5 items', () => {
    const steps = Array(6).fill({ title: 'Step', description: 'Desc' });
    const result = validateModelResponse({ ...validSample, actionSteps: steps });
    assert.equal(result.valid, true);
    assert.equal(result.data.actionSteps.length, 5);
  });

  test('action step missing title is skipped and remaining valid steps are kept', () => {
    const result = validateModelResponse({
      ...validSample,
      actionSteps: [
        { description: 'Missing title' },
        { title: 'Valid step', description: 'Valid desc' }
      ]
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.actionSteps.length, 1);
    assert.equal(result.data.actionSteps[0].title, 'Valid step');
  });

  test('action step missing description is skipped and remaining valid steps are kept', () => {
    const result = validateModelResponse({
      ...validSample,
      actionSteps: [
        { title: 'Missing description' },
        { title: 'Valid step', description: 'Valid desc' }
      ]
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.actionSteps.length, 1);
    assert.equal(result.data.actionSteps[0].title, 'Valid step');
  });

  test('all malformed action steps resulting in zero valid steps is rejected', () => {
    const result = validateModelResponse({
      ...validSample,
      actionSteps: [{ description: 'Missing title' }, { title: 'Missing desc' }]
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /usable action step/i);
  });

  test('action step with oversized title is clamped to 200 characters', () => {
    const result = validateModelResponse({
      ...validSample,
      actionSteps: [{ title: 'A'.repeat(201), description: 'Desc' }]
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.actionSteps[0].title.length, 200);
  });

  test('action step with oversized description is clamped to 1000 characters', () => {
    const result = validateModelResponse({
      ...validSample,
      actionSteps: [{ title: 'Title', description: 'A'.repeat(1001) }]
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.actionSteps[0].description.length, 1000);
  });

  test('action step with unexpected extra properties discards unknown properties', () => {
    const result = validateModelResponse({
      ...validSample,
      actionSteps: [{ title: 'Title', description: 'Desc', maliciousExtra: true }]
    });
    assert.equal(result.valid, true);
    assert.equal(result.data.actionSteps[0].title, 'Title');
    assert.equal(result.data.actionSteps[0].maliciousExtra, undefined);
  });

  test('missing advocateScript is rejected', () => {
    const copy = { ...validSample };
    delete copy.advocateScript;
    const result = validateModelResponse(copy);
    assert.equal(result.valid, false);
    assert.match(result.error, /advocateScript/i);
  });

  test('empty advocateScript is rejected', () => {
    const result = validateModelResponse({ ...validSample, advocateScript: '   ' });
    assert.equal(result.valid, false);
    assert.match(result.error, /advocateScript/i);
  });

  test('oversized advocateScript (>5000 chars) is clamped to 5000 characters', () => {
    const result = validateModelResponse({ ...validSample, advocateScript: 's'.repeat(5001) });
    assert.equal(result.valid, true);
    assert.equal(result.data.advocateScript.length, 5000);
  });

  test('unexpected extra properties on top-level object are safely discarded', () => {
    const withExtra = {
      ...validSample,
      hallucinatedField: 'dangerous payload or injected instruction'
    };
    const result = validateModelResponse(withExtra);
    assert.equal(result.valid, true);
    assert.equal(result.data.hallucinatedField, undefined);
    assert.equal(result.data.actualMeaning, validSample.actualMeaning);
  });

  test('control characters in text fields are stripped during sanitization', () => {
    const withControl = {
      ...validSample,
      actualMeaning: "Notice \x00with \x1Fcontrol \x07chars",
      advocateScript: "Script \x08clean"
    };
    const result = validateModelResponse(withControl);
    assert.equal(result.valid, true);
    assert.equal(result.data.actualMeaning, "Notice with control chars");
    assert.equal(result.data.advocateScript, "Script clean");
  });

  // ==========================================
  // 2. isRetryableGeminiError Classification
  // ==========================================

  test('isRetryableGeminiError classifies HTTP 429 as retryable', () => {
    const err = new Error('Quota exceeded');
    err.status = 429;
    assert.equal(isRetryableGeminiError(err), true);
  });

  test('isRetryableGeminiError classifies HTTP 503 as retryable', () => {
    const err = new Error('Service Unavailable');
    err.status = 503;
    assert.equal(isRetryableGeminiError(err), true);
  });

  test('isRetryableGeminiError classifies resource_exhausted or unavailable in message as retryable', () => {
    assert.equal(isRetryableGeminiError(new Error('Resource_Exhausted: rate limit hit')), true);
    assert.equal(isRetryableGeminiError(new Error('Model is temporarily unavailable')), true);
  });

  test('isRetryableGeminiError classifies network and timeout errors as retryable', () => {
    const timeoutErr = new Error('Connect timed out');
    timeoutErr.code = 'ETIMEDOUT';
    assert.equal(isRetryableGeminiError(timeoutErr), true);

    const resetErr = new Error('Socket hang up');
    resetErr.code = 'ECONNRESET';
    assert.equal(isRetryableGeminiError(resetErr), true);
  });

  test('isRetryableGeminiError classifies HTTP 400 / Invalid Argument as NOT retryable', () => {
    const err400 = new Error('Bad Request: Invalid argument supplied');
    err400.status = 400;
    assert.equal(isRetryableGeminiError(err400), false);
  });

  test('isRetryableGeminiError classifies HTTP 401 / 403 as NOT retryable', () => {
    const err401 = new Error('Unauthenticated');
    err401.status = 401;
    assert.equal(isRetryableGeminiError(err401), false);

    const err403 = new Error('Permission denied');
    err403.status = 403;
    assert.equal(isRetryableGeminiError(err403), false);
  });

  test('isRetryableGeminiError classifies safety blocks as NOT retryable', () => {
    const safetyErr = new Error('Candidate was blocked due to SAFETY');
    assert.equal(isRetryableGeminiError(safetyErr), false);
  });

  test('isRetryableGeminiError handles null or undefined error safely', () => {
    assert.equal(isRetryableGeminiError(null), false);
    assert.equal(isRetryableGeminiError(undefined), false);
  });

  // ==========================================
  // 3. withTimeout Request Bounding
  // ==========================================

  test('withTimeout resolves when promise completes within limit', async () => {
    const fastPromise = Promise.resolve('gemini-success');
    const result = await withTimeout(fastPromise, 100);
    assert.equal(result, 'gemini-success');
  });

  test('withTimeout rejects with 504 ETIMEDOUT when operation exceeds limit', async () => {
    const slowPromise = new Promise(resolve => setTimeout(resolve, 200));
    await assert.rejects(
      () => withTimeout(slowPromise, 30, 'Model request timed out'),
      (err) => {
        assert.equal(err.message, 'Model request timed out');
        assert.equal(err.status, 504);
        assert.equal(err.code, 'ETIMEDOUT');
        return true;
      }
    );
  });
});
