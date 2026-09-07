/**
 * Charitas Clew - Request Input Validators
 * Strict boundary validation for /api/deconstruct endpoint.
 */

export const ALLOWED_LANGUAGES = [
  'English',
  'Español (Spanish)',
  'Tiếng Việt (Vietnamese)',
  '中文 (Chinese)',
  'العربية (Arabic)',
  'Français (French)'
];

export const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf'
];

export const MAX_DECODED_FILE_SIZE = 7 * 1024 * 1024; // 7MB

/**
 * Validates the targetLanguage parameter.
 * @param {*} targetLanguage
 * @returns {{ valid: boolean, language?: string, error?: string }}
 */
export function validateLanguage(targetLanguage) {
  // If omitted or empty string, default to English
  if (targetLanguage === undefined || targetLanguage === null) {
    return { valid: true, language: 'English' };
  }

  if (typeof targetLanguage !== 'string') {
    return { valid: false, error: 'Unsupported target language.' };
  }

  const trimmed = targetLanguage.trim();
  if (trimmed === '') {
    return { valid: true, language: 'English' };
  }

  if (!ALLOWED_LANGUAGES.includes(trimmed)) {
    return { valid: false, error: 'Unsupported target language.' };
  }

  return { valid: true, language: trimmed };
}

/**
 * Checks whether buffer matches declared MIME magic bytes.
 * @param {Buffer} buf
 * @param {string} mimeType - Normalized lowercase MIME type
 * @returns {boolean}
 */
export function matchesFileSignature(buf, mimeType) {
  if (!buf || buf.length < 4) return false;

  switch (mimeType) {
    case 'image/jpeg':
      return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;

    case 'image/png':
      return buf.length >= 8 &&
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
        buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;

    case 'application/pdf':
      return buf.subarray(0, 4).toString('ascii') === '%PDF';

    case 'image/webp':
      return buf.length >= 12 &&
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP';

    case 'image/heic': {
      // ISOBMFF box check: bytes 4-8 'ftyp', bytes 8-12 compatible brand
      if (buf.length < 12) return false;
      const ftyp = buf.subarray(4, 8).toString('ascii');
      const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
      const recognizedBrands = ['heic', 'heix', 'heim', 'heis', 'hevc', 'mif1', 'msf1'];
      return ftyp === 'ftyp' && recognizedBrands.includes(brand);
    }

    default:
      return false;
  }
}

/**
 * Validates uploaded image payload: MIME allowlist, base64 formatting, decoded size, and magic bytes.
 * @param {*} image - Base64 string (optional data URL prefix)
 * @param {*} mimeType - Declared MIME type string
 * @returns {{ valid: boolean, inlineData?: { inlineData: { mimeType: string, data: string } }, error?: string }}
 */
export function validateUpload(image, mimeType) {
  if (typeof image !== 'string' || !image.trim()) {
    return { valid: false, error: 'Invalid image payload format.' };
  }

  if (typeof mimeType !== 'string' || !mimeType.trim()) {
    return { valid: false, error: 'Unsupported or missing file type.' };
  }

  const normalizedMime = mimeType.trim().toLowerCase();
  if (!ALLOWED_MIMES.includes(normalizedMime)) {
    return { valid: false, error: 'Unsupported or missing file type.' };
  }

  // Strip data URL prefix if present (e.g. data:image/png;base64,...)
  const base64Data = image.includes(',') ? image.slice(image.indexOf(',') + 1).trim() : image.trim();

  if (!base64Data || base64Data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
    return { valid: false, error: 'Invalid base64 payload format.' };
  }

  let decodedBuffer;
  try {
    decodedBuffer = Buffer.from(base64Data, 'base64');
  } catch {
    return { valid: false, error: 'Invalid base64 payload format.' };
  }

  if (!decodedBuffer || decodedBuffer.length === 0) {
    return { valid: false, error: 'Invalid base64 payload format.' };
  }

  if (decodedBuffer.length > MAX_DECODED_FILE_SIZE) {
    return { valid: false, error: 'Uploaded file size exceeds the 7MB limit.' };
  }

  if (!matchesFileSignature(decodedBuffer, normalizedMime)) {
    return { valid: false, error: 'File content does not match declared type.' };
  }

  return {
    valid: true,
    inlineData: {
      inlineData: {
        mimeType: normalizedMime,
        data: base64Data
      }
    }
  };
}
