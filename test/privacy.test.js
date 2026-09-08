import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_STORAGE_KEYS,
  setSafePreference,
  getSafePreference,
  purgeSensitiveStorage
} from '../public/ui-helpers.js';

describe('Privacy and Client-Side Retention Hardening Suite (Phase 6)', () => {
  let mockStorage;

  beforeEach(() => {
    const store = new Map();
    mockStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
      get length() { return store.size; },
      has: (key) => store.has(key)
    };
  });

  // ==========================================
  // 1. Explicit Storage Allowlist Enforcement
  // ==========================================

  describe('Storage Allowlist & Safe Preference Helpers', () => {
    test('ALLOWED_STORAGE_KEYS strictly contains only harmless preferences', () => {
      assert.ok(ALLOWED_STORAGE_KEYS.has('charitas_pref_lang'));
      assert.equal(ALLOWED_STORAGE_KEYS.size, 1);
      assert.ok(!ALLOWED_STORAGE_KEYS.has('charitas_last_notice'));
      assert.ok(!ALLOWED_STORAGE_KEYS.has('noticeText'));
      assert.ok(!ALLOWED_STORAGE_KEYS.has('actualMeaning'));
    });

    test('setSafePreference allows writing allowlisted language preference', () => {
      const written = setSafePreference('charitas_pref_lang', 'es', mockStorage);
      assert.equal(written, true);
      assert.equal(mockStorage.getItem('charitas_pref_lang'), 'es');
    });

    test('getSafePreference retrieves allowlisted language preference', () => {
      mockStorage.setItem('charitas_pref_lang', 'vi');
      assert.equal(getSafePreference('charitas_pref_lang', mockStorage), 'vi');
    });

    test('setSafePreference strictly rejects sensitive notice content or summary keys', () => {
      const sensitiveKeys = [
        'charitas_last_notice',
        'actualMeaning',
        'deadlineDate',
        'actionSteps',
        'advocateScript',
        'selectedImageData',
        'noticeText'
      ];

      for (const key of sensitiveKeys) {
        const written = setSafePreference(key, 'sensitive text', mockStorage);
        assert.equal(written, false, `Must reject non-allowlisted key: ${key}`);
        assert.equal(mockStorage.getItem(key), null);
      }
    });

    test('getSafePreference returns null for any non-allowlisted key', () => {
      mockStorage.setItem('unauthorized_key', 'some_value');
      assert.equal(getSafePreference('unauthorized_key', mockStorage), null);
    });

    test('purgeSensitiveStorage purges legacy charitas_last_notice key', () => {
      mockStorage.setItem('charitas_last_notice', JSON.stringify({ actualMeaning: 'Eviction Notice' }));
      mockStorage.setItem('charitas_pref_lang', 'es');

      purgeSensitiveStorage(mockStorage);

      assert.equal(mockStorage.getItem('charitas_last_notice'), null, 'Sensitive notice key must be removed');
      assert.equal(mockStorage.getItem('charitas_pref_lang'), 'es', 'Safe preference must remain intact');
    });
  });

  // ==========================================
  // 2. Static Analysis of Frontend Source Code
  // ==========================================

  describe('Frontend Source Code Storage Audit (index.html)', () => {
    const indexHtmlPath = path.resolve('public/index.html');
    let indexHtmlContent;

    beforeEach(() => {
      indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
    });

    test('index.html contains NO localStorage.setItem calls storing notice content', () => {
      // Must not store charitas_last_notice or any notice payload
      assert.doesNotMatch(
        indexHtmlContent,
        /localStorage\.setItem\(\s*['"`]charitas_last_notice['"`]/,
        'Must NOT store charitas_last_notice in localStorage'
      );
      assert.doesNotMatch(
        indexHtmlContent,
        /localStorage\.setItem\([^,]+,\s*JSON\.stringify\(data\)\)/,
        'Must NOT serialize full result data to localStorage'
      );
    });

    test('index.html contains NO indexedDB or document.cookie persistence', () => {
      assert.doesNotMatch(indexHtmlContent, /indexedDB/i);
      assert.doesNotMatch(indexHtmlContent, /document\.cookie/);
      assert.doesNotMatch(indexHtmlContent, /sessionStorage\.setItem/);
    });

    test('index.html invokes purgeSensitiveStorage on initialization and clear', () => {
      assert.match(indexHtmlContent, /purgeSensitiveStorage\(\)/);
    });

    test('clearAllResults cancels speech synthesis and clears in-memory preview', () => {
      assert.match(indexHtmlContent, /window\.speechSynthesis\.cancel\(\)/);
      assert.match(indexHtmlContent, /filePreview\.classList\.remove\('active'\)/);
      assert.match(indexHtmlContent, /selectedImageData = null/);
    });

    test('clipboard writeText occurs strictly inside user click handler, not automatically', () => {
      const copyMatches = [...indexHtmlContent.matchAll(/navigator\.clipboard\.writeText/g)];
      assert.equal(copyMatches.length, 1, 'Must have exactly one explicit clipboard copy handler');

      // Ensure writeText is inside btn-copy onclick
      const btnCopyBlock = indexHtmlContent.substring(
        indexHtmlContent.indexOf("document.getElementById('btn-copy').onclick"),
        indexHtmlContent.indexOf("document.getElementById('btn-share').onclick")
      );
      assert.match(btnCopyBlock, /navigator\.clipboard\.writeText\(scriptText\)/);

      // Verify no clipboard readText is used
      assert.doesNotMatch(indexHtmlContent, /navigator\.clipboard\.readText/);
    });

    test('UI includes truthful Privacy & Data Retention notice distinguishments', () => {
      assert.match(indexHtmlContent, /class="privacy-box"/);
      assert.match(indexHtmlContent, /Privacy &amp; Data Retention|Privacy & Data Retention/);
      assert.match(indexHtmlContent, /processed in memory/);
      assert.match(indexHtmlContent, /not saved in browser persistent storage/);
      assert.match(indexHtmlContent, /Google Cloud Run and the Google Gemini API/);
    });
  });
});
