import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_LANGUAGES,
  ALLOWED_MIMES,
  validateLanguage,
  validateUpload,
  matchesFileSignature
} from '../validators.js';

describe('Input Validators Unit Suite', () => {

  // ==========================================
  // 1. Language Validator
  // ==========================================

  test('validateLanguage defaults omitted, null, or blank string to English', () => {
    assert.deepEqual(validateLanguage(undefined), { valid: true, language: 'English' });
    assert.deepEqual(validateLanguage(null), { valid: true, language: 'English' });
    assert.deepEqual(validateLanguage(''), { valid: true, language: 'English' });
    assert.deepEqual(validateLanguage('   '), { valid: true, language: 'English' });
  });

  test('validateLanguage accepts every allowed language exactly', () => {
    for (const lang of ALLOWED_LANGUAGES) {
      assert.deepEqual(validateLanguage(lang), { valid: true, language: lang });
    }
  });

  test('validateLanguage rejects unsupported string languages', () => {
    const invalidLangs = ['Klingon', 'Pig Latin', 'English; DROP TABLE', 'de', 'jp', 'Russian'];
    for (const lang of invalidLangs) {
      const res = validateLanguage(lang);
      assert.equal(res.valid, false);
      assert.equal(res.error, 'Unsupported target language.');
    }
  });

  test('validateLanguage normalizes ISO codes and case variants to display names', () => {
    assert.deepEqual(validateLanguage('en'), { valid: true, language: 'English' });
    assert.deepEqual(validateLanguage('EN'), { valid: true, language: 'English' });
    assert.deepEqual(validateLanguage('es'), { valid: true, language: 'Español (Spanish)' });
    assert.deepEqual(validateLanguage('ES'), { valid: true, language: 'Español (Spanish)' });
    assert.deepEqual(validateLanguage('vi'), { valid: true, language: 'Tiếng Việt (Vietnamese)' });
    assert.deepEqual(validateLanguage('zh'), { valid: true, language: '中文 (Chinese)' });
    assert.deepEqual(validateLanguage('ar'), { valid: true, language: 'العربية (Arabic)' });
    assert.deepEqual(validateLanguage('fr'), { valid: true, language: 'Français (French)' });
  });

  test('validateLanguage rejects non-string types', () => {
    const invalidTypes = [123, true, {}, [], () => {}];
    for (const item of invalidTypes) {
      const res = validateLanguage(item);
      assert.equal(res.valid, false);
      assert.equal(res.error, 'Unsupported target language.');
    }
  });

  // ==========================================
  // 2. File Signatures
  // ==========================================

  test('matchesFileSignature accurately identifies valid headers', () => {
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const pdf = Buffer.from('%PDF-1.7 header');
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const heic = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);

    assert.equal(matchesFileSignature(jpeg, 'image/jpeg'), true);
    assert.equal(matchesFileSignature(png, 'image/png'), true);
    assert.equal(matchesFileSignature(pdf, 'application/pdf'), true);
    assert.equal(matchesFileSignature(webp, 'image/webp'), true);
    assert.equal(matchesFileSignature(heic, 'image/heic'), true);
  });

  test('matchesFileSignature detects mismatches', () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    assert.equal(matchesFileSignature(png, 'image/jpeg'), false);
    assert.equal(matchesFileSignature(png, 'application/pdf'), false);
    assert.equal(matchesFileSignature(Buffer.from('short'), 'image/png'), false);
  });

  // ==========================================
  // 3. Upload Validator
  // ==========================================

  test('validateUpload requires non-empty string image and mimeType', () => {
    assert.equal(validateUpload(null, 'image/jpeg').valid, false);
    assert.equal(validateUpload('', 'image/jpeg').valid, false);
    assert.equal(validateUpload('dGVzdA==', null).valid, false);
    assert.equal(validateUpload('dGVzdA==', '').valid, false);
  });

  test('validateUpload rejects unsupported MIME types', () => {
    const pngBase64 = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]).toString('base64');
    const res = validateUpload(pngBase64, 'application/octet-stream');
    assert.equal(res.valid, false);
    assert.equal(res.error, 'Unsupported or missing file type.');
  });

  test('validateUpload rejects invalid base64 characters or padding', () => {
    const res1 = validateUpload('not_base64!@#$', 'image/png');
    assert.equal(res1.valid, false);
    assert.equal(res1.error, 'Invalid base64 payload format.');

    const res2 = validateUpload('AAAAA', 'image/png'); // impossible length 5
    assert.equal(res2.valid, false);
    assert.equal(res2.error, 'Invalid base64 payload format.');
  });

  test('validateUpload correctly strips data URL prefix', () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    const dataUrl = `data:image/png;base64,${validPng.toString('base64')}`;
    const res = validateUpload(dataUrl, 'image/png');
    assert.equal(res.valid, true);
    assert.equal(res.inlineData.inlineData.mimeType, 'image/png');
    assert.equal(res.inlineData.inlineData.data, validPng.toString('base64'));
  });

  test('validateUpload rejects decoded buffer > 7MB', () => {
    const bigBuf = Buffer.alloc(7.5 * 1024 * 1024, 0xFF);
    bigBuf[0] = 0xFF; bigBuf[1] = 0xD8; bigBuf[2] = 0xFF; bigBuf[3] = 0xE0;
    const res = validateUpload(bigBuf.toString('base64'), 'image/jpeg');
    assert.equal(res.valid, false);
    assert.equal(res.error, 'Uploaded file size exceeds the 7MB limit.');
  });
});
