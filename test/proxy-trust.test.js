import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTrustProxyFn, GOOGLE_PROXY_CIDRS } from '../proxy-trust.js';

describe('Proxy Trust Resolution Unit Suite (Phase 5B)', () => {
  const trustProxy = createTrustProxyFn();

  test('GOOGLE_PROXY_CIDRS contains loopback, linklocal, uniquelocal, and core GFE CIDRs', () => {
    assert.ok(GOOGLE_PROXY_CIDRS.includes('loopback'));
    assert.ok(GOOGLE_PROXY_CIDRS.includes('linklocal'));
    assert.ok(GOOGLE_PROXY_CIDRS.includes('uniquelocal'));
    assert.ok(GOOGLE_PROXY_CIDRS.includes('66.249.64.0/19'));
    assert.ok(GOOGLE_PROXY_CIDRS.includes('74.125.0.0/16'));
    assert.ok(GOOGLE_PROXY_CIDRS.includes('2001:4860::/32'));
  });

  test('hop 0 (socket container ingress) is always trusted for any internal interface', () => {
    assert.equal(trustProxy('127.0.0.1', 0), true);
    assert.equal(trustProxy('::1', 0), true);
    assert.equal(trustProxy('169.254.1.1', 0), true);
    assert.equal(trustProxy('10.0.0.1', 0), true);
  });

  test('hop 1 trusts authentic Google Front End / Firebase Hosting proxy egress IPs', () => {
    assert.equal(trustProxy('66.249.84.37', 1), true);
    assert.equal(trustProxy('66.249.84.106', 1), true);
    assert.equal(trustProxy('74.125.209.3', 1), true);
    assert.equal(trustProxy('74.125.209.161', 1), true);
    assert.equal(trustProxy('209.85.128.50', 1), true);
    assert.equal(trustProxy('142.250.100.1', 1), true);
  });

  test('hop 1 rejects arbitrary external client IPs (direct Cloud Run callers)', () => {
    assert.equal(trustProxy('203.0.113.195', 1), false);
    assert.equal(trustProxy('198.51.100.5', 1), false);
    assert.equal(trustProxy('1.1.1.1', 1), false);
    assert.equal(trustProxy('8.8.8.8', 1), false);
    assert.equal(trustProxy('98.150.20.10', 1), false);
  });

  test('hop >= 2 is strictly rejected even for Google IPs, enforcing the client boundary', () => {
    // Even if client is an employee or VM with a Google IP, hop 2 must NEVER be trusted
    assert.equal(trustProxy('66.249.84.37', 2), false);
    assert.equal(trustProxy('74.125.209.3', 2), false);
    assert.equal(trustProxy('127.0.0.1', 2), false);
    assert.equal(trustProxy('169.254.1.1', 3), false);
  });
});
