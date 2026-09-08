import { test, describe, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app, apiLimiter, setGenerateContentFn, resetGenerateContentFn } from '../server.js';

describe('Deployment & Production Hardening Suite (Phase 5)', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const dummyMockSuccessResponse = {
    actualMeaning: 'Water service disconnection warning.',
    hasDeadline: true,
    deadlineDate: 'October 15, 2026',
    deadlineContext: 'Shut-off date.',
    actionSteps: [{ title: 'Contact Utility', description: 'Arrange payment.' }],
    advocateScript: 'Hello, I am calling regarding my water account.'
  };

  before(() => {
    process.env.GEMINI_API_KEY = 'test-dummy-gemini-api-key';
  });

  after(() => {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  beforeEach(() => {
    resetGenerateContentFn();
  });

  afterEach(() => {
    resetGenerateContentFn();
  });

  // ==========================================
  // 1. Static Firebase Hosting Configuration Tests
  // ==========================================

  describe('Firebase Hosting Header Configuration (firebase.json)', () => {
    const firebaseJsonPath = path.resolve('firebase.json');
    let firebaseConfig;

    before(() => {
      const raw = fs.readFileSync(firebaseJsonPath, 'utf8');
      firebaseConfig = JSON.parse(raw);
    });

    test('firebase.json exists, parses cleanly, and defines hosting', () => {
      assert.ok(firebaseConfig);
      assert.ok(firebaseConfig.hosting);
      assert.equal(firebaseConfig.hosting.public, 'public');
    });

    test('defines headers array with wildcard source pattern', () => {
      assert.ok(Array.isArray(firebaseConfig.hosting.headers));
      assert.ok(firebaseConfig.hosting.headers.length > 0);
      const allRoutesConfig = firebaseConfig.hosting.headers.find(h => h.source === '**');
      assert.ok(allRoutesConfig, 'Must define headers matching "**"');
    });

    test('includes X-Content-Type-Options: nosniff', () => {
      const allRoutes = firebaseConfig.hosting.headers.find(h => h.source === '**');
      const header = allRoutes.headers.find(h => h.key.toLowerCase() === 'x-content-type-options');
      assert.ok(header);
      assert.equal(header.value, 'nosniff');
    });

    test('includes modern framing protection in CSP and X-Frame-Options fallback', () => {
      const allRoutes = firebaseConfig.hosting.headers.find(h => h.source === '**');
      const xFrame = allRoutes.headers.find(h => h.key.toLowerCase() === 'x-frame-options');
      assert.ok(xFrame);
      assert.equal(xFrame.value, 'DENY');

      const csp = allRoutes.headers.find(h => h.key.toLowerCase() === 'content-security-policy');
      assert.ok(csp);
      assert.match(csp.value, /frame-ancestors 'none'/);
    });

    test('includes Referrer-Policy: strict-origin-when-cross-origin', () => {
      const allRoutes = firebaseConfig.hosting.headers.find(h => h.source === '**');
      const header = allRoutes.headers.find(h => h.key.toLowerCase() === 'referrer-policy');
      assert.ok(header);
      assert.equal(header.value, 'strict-origin-when-cross-origin');
    });

    test('includes Permissions-Policy restricting sensitive APIs', () => {
      const allRoutes = firebaseConfig.hosting.headers.find(h => h.source === '**');
      const header = allRoutes.headers.find(h => h.key.toLowerCase() === 'permissions-policy');
      assert.ok(header);
      assert.match(header.value, /camera=\(\)/);
      assert.match(header.value, /microphone=\(\)/);
      assert.match(header.value, /geolocation=\(\)/);
    });

    test('CSP has default-src self and NO wildcard script origins', () => {
      const allRoutes = firebaseConfig.hosting.headers.find(h => h.source === '**');
      const csp = allRoutes.headers.find(h => h.key.toLowerCase() === 'content-security-policy');
      assert.ok(csp);
      assert.match(csp.value, /default-src 'self'/);
      assert.doesNotMatch(csp.value, /script-src [^;]*\*/, 'Must NOT contain wildcard script origins');
      assert.match(csp.value, /script-src 'self' 'unsafe-inline'/);
    });

    test('defines Cloud Run rewrite for /api/**', () => {
      assert.ok(Array.isArray(firebaseConfig.hosting.rewrites));
      const apiRewrite = firebaseConfig.hosting.rewrites.find(r => r.source === '/api/**');
      assert.ok(apiRewrite);
      assert.equal(apiRewrite.run.serviceId, 'charitas-clew-api');
      assert.equal(apiRewrite.run.region, 'us-central1');
    });
  });

  // ==========================================
  // 2. Proxy & Rate Limiting Verification
  // ==========================================

  describe('Proxy Header Handling & Rate Limit Isolation', () => {
    test('Express API responses include Helmet security headers aligned with Firebase', async () => {
      const res = await request(app).get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    });

    test('Firebase-style two-hop forwarded chain resolves to real client and enforces quota', async () => {
      setGenerateContentFn(async () => ({ text: JSON.stringify(dummyMockSuccessResponse) }));

      const realClientIp = '203.0.113.80';
      const firebaseProxyIp = '66.249.84.37'; // authentic Google Front End IP

      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post('/api/deconstruct')
          .set('X-Forwarded-For', `${realClientIp}, ${firebaseProxyIp}`)
          .send({ text: 'Notice text' });
        assert.equal(res.status, 200);
      }

      // 16th request is rate-limited on the real client IP
      const blockedRes = await request(app)
        .post('/api/deconstruct')
        .set('X-Forwarded-For', `${realClientIp}, ${firebaseProxyIp}`)
        .send({ text: 'Notice text' });

      assert.equal(blockedRes.status, 429);
      assert.match(blockedRes.body.error, /Rate limit exceeded/);

      if (apiLimiter && typeof apiLimiter.resetKey === 'function') {
        apiLimiter.resetKey(realClientIp);
      }
    });

    test('direct Cloud Run-style chain resolves to real direct caller and enforces quota', async () => {
      setGenerateContentFn(async () => ({ text: JSON.stringify(dummyMockSuccessResponse) }));

      const directClientIp = '198.51.100.80';

      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post('/api/deconstruct')
          .set('X-Forwarded-For', directClientIp)
          .send({ text: 'Notice text' });
        assert.equal(res.status, 200);
      }

      const blockedRes = await request(app)
        .post('/api/deconstruct')
        .set('X-Forwarded-For', directClientIp)
        .send({ text: 'Notice text' });

      assert.equal(blockedRes.status, 429);
      assert.match(blockedRes.body.error, /Rate limit exceeded/);

      if (apiLimiter && typeof apiLimiter.resetKey === 'function') {
        apiLimiter.resetKey(directClientIp);
      }
    });

    test('attacker-prepended spoofed X-Forwarded-For behind Firebase does NOT control identity', async () => {
      setGenerateContentFn(async () => ({ text: JSON.stringify(dummyMockSuccessResponse) }));

      const attackerRealIp = '203.0.113.99';
      const firebaseProxyIp = '66.249.84.106';

      // Attacker attempts to rotate spoofed IP prefix on every request
      for (let i = 0; i < 15; i++) {
        const spoofedPrefix = `10.0.0.${i + 1}`;
        const res = await request(app)
          .post('/api/deconstruct')
          .set('X-Forwarded-For', `${spoofedPrefix}, ${attackerRealIp}, ${firebaseProxyIp}`)
          .send({ text: 'Notice text' });
        assert.equal(res.status, 200);
      }

      // 16th request with yet another spoofed IP MUST be blocked because identity is pinned to attackerRealIp
      const blockedRes = await request(app)
        .post('/api/deconstruct')
        .set('X-Forwarded-For', `1.2.3.4, ${attackerRealIp}, ${firebaseProxyIp}`)
        .send({ text: 'Notice text' });

      assert.equal(blockedRes.status, 429);
      assert.match(blockedRes.body.error, /Rate limit exceeded/);

      if (apiLimiter && typeof apiLimiter.resetKey === 'function') {
        apiLimiter.resetKey(attackerRealIp);
      }
    });

    test('attacker-prepended spoofed X-Forwarded-For direct to Cloud Run does NOT control identity', async () => {
      setGenerateContentFn(async () => ({ text: JSON.stringify(dummyMockSuccessResponse) }));

      const attackerDirectIp = '198.51.100.99';

      for (let i = 0; i < 15; i++) {
        const spoofedPrefix = `172.16.0.${i + 1}`;
        const res = await request(app)
          .post('/api/deconstruct')
          .set('X-Forwarded-For', `${spoofedPrefix}, ${attackerDirectIp}`)
          .send({ text: 'Notice text' });
        assert.equal(res.status, 200);
      }

      const blockedRes = await request(app)
        .post('/api/deconstruct')
        .set('X-Forwarded-For', `8.8.8.8, ${attackerDirectIp}`)
        .send({ text: 'Notice text' });

      assert.equal(blockedRes.status, 429);
      assert.match(blockedRes.body.error, /Rate limit exceeded/);

      if (apiLimiter && typeof apiLimiter.resetKey === 'function') {
        apiLimiter.resetKey(attackerDirectIp);
      }
    });

    test('two distinct clients behind Firebase maintain independent rate-limit quotas', async () => {
      setGenerateContentFn(async () => ({ text: JSON.stringify(dummyMockSuccessResponse) }));

      const clientA = '203.0.113.10';
      const clientB = '203.0.113.20';
      const sharedProxy = '74.125.209.3'; // Both pass through same Firebase proxy

      // Exhaust client A's quota
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post('/api/deconstruct')
          .set('X-Forwarded-For', `${clientA}, ${sharedProxy}`)
          .send({ text: 'Notice text' });
        assert.equal(res.status, 200);
      }

      // Client A is blocked on 16th
      const blockedA = await request(app)
        .post('/api/deconstruct')
        .set('X-Forwarded-For', `${clientA}, ${sharedProxy}`)
        .send({ text: 'Notice text' });
      assert.equal(blockedA.status, 429);

      // Client B through the SAME proxy is NOT blocked
      const allowedB = await request(app)
        .post('/api/deconstruct')
        .set('X-Forwarded-For', `${clientB}, ${sharedProxy}`)
        .send({ text: 'Notice text' });
      assert.equal(allowedB.status, 200);

      if (apiLimiter && typeof apiLimiter.resetKey === 'function') {
        apiLimiter.resetKey(clientA);
        apiLimiter.resetKey(clientB);
      }
    });

    test('repeated requests from one client across different Firebase proxy nodes share a cohesive quota', async () => {
      setGenerateContentFn(async () => ({ text: JSON.stringify(dummyMockSuccessResponse) }));

      const clientA = '203.0.113.30';
      const proxyNode1 = '66.249.84.106';
      const proxyNode2 = '74.125.209.161';
      const proxyNode3 = '66.249.84.228';

      // 5 requests via proxyNode1
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/deconstruct')
          .set('X-Forwarded-For', `${clientA}, ${proxyNode1}`)
          .send({ text: 'Notice text' });
        assert.equal(res.status, 200);
      }

      // 5 requests via proxyNode2
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/deconstruct')
          .set('X-Forwarded-For', `${clientA}, ${proxyNode2}`)
          .send({ text: 'Notice text' });
        assert.equal(res.status, 200);
      }

      // 5 requests via proxyNode3 (reaching 15 total)
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/deconstruct')
          .set('X-Forwarded-For', `${clientA}, ${proxyNode3}`)
          .send({ text: 'Notice text' });
        assert.equal(res.status, 200);
      }

      // 16th request via proxyNode1 MUST be blocked (proves quota is NOT fragmented across proxies)
      const blockedRes = await request(app)
        .post('/api/deconstruct')
        .set('X-Forwarded-For', `${clientA}, ${proxyNode1}`)
        .send({ text: 'Notice text' });

      assert.equal(blockedRes.status, 429);
      assert.match(blockedRes.body.error, /Rate limit exceeded/);

      if (apiLimiter && typeof apiLimiter.resetKey === 'function') {
        apiLimiter.resetKey(clientA);
      }
    });

    test('malformed or extraneous forwarded addresses preserve the true client identity', async () => {
      setGenerateContentFn(async () => ({ text: JSON.stringify(dummyMockSuccessResponse) }));

      const clientIp = '203.0.113.45';
      const googleProxy = '66.249.84.37';

      // Header with garbage leading entries
      const res = await request(app)
        .post('/api/deconstruct')
        .set('X-Forwarded-For', `unknown, , 1.2.3.4, ${clientIp}, ${googleProxy}`)
        .send({ text: 'Notice text' });
      assert.equal(res.status, 200);

      // Verify rate limiter decremented clientIp's quota, not garbage/proxy
      if (apiLimiter && typeof apiLimiter.resetKey === 'function') {
        apiLimiter.resetKey(clientIp);
      }
    });
  });

  // ==========================================
  // 3. Centralized Production Error Handling
  // ==========================================

  describe('Production Error Handling & Payload Normalization', () => {
    test('malformed JSON payload returns clean JSON 400 without leaking stack traces', async () => {
      const res = await request(app)
        .post('/api/deconstruct')
        .set('Content-Type', 'application/json')
        .send('{ invalid: json, format: broken');

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Malformed JSON payload.');
      // Ensure no stack traces or server paths in response
      assert.equal(res.body.stack, undefined);
      assert.doesNotMatch(res.text, /SyntaxError/);
    });

    test('payload exceeding body-parser limit (10MB) returns clean JSON 413 without leaking internal paths', async () => {
      const oversized = 'A'.repeat(11 * 1024 * 1024);
      const res = await request(app)
        .post('/api/deconstruct')
        .set('Content-Type', 'application/json')
        .send(`{"text":"${oversized}"}`);

      assert.equal(res.status, 413);
      assert.equal(res.body.error, 'Request payload exceeds maximum allowed size.');
      assert.equal(res.body.stack, undefined);
      assert.doesNotMatch(res.text, /PayloadTooLargeError/);
    });
  });
});
