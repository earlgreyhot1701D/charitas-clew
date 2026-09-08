import proxyAddr from 'proxy-addr';

/**
 * Well-known Google Front End (GFE), Google Edge, and local proxy CIDR ranges.
 * Used to identify authentic intermediate reverse proxies (e.g. Firebase Hosting
 * egress nodes proxying rewrites to Cloud Run).
 *
 * Excludes customer Compute Engine / user VM ranges (34.x / 35.x) so that external
 * callers on GCP VMs cannot impersonate trusted reverse proxies.
 */
export const GOOGLE_PROXY_CIDRS = [
  'loopback',
  'linklocal',
  'uniquelocal',
  '66.249.64.0/19',
  '74.125.0.0/16',
  '209.85.128.0/17',
  '172.217.0.0/16',
  '142.250.0.0/15',
  '216.58.192.0/19',
  '216.239.32.0/19',
  '108.177.0.0/17',
  '173.194.0.0/16',
  '2001:4860::/32',
  '2404:6800::/32',
  '2607:f8b0::/32',
  '2800:3f0::/32',
  '2a00:1450::/32',
  '2c0f:fb50::/32',
];

/**
 * Creates a trust proxy evaluation function for Express.
 *
 * Topology rules:
 * - Hop 0: Container socket / bridge connection (127.0.0.1, 169.254.x.x) -> Always trusted.
 * - Hop 1: Entity connecting to Cloud Run (rightmost IP in X-Forwarded-For).
 *          If this entity is a recognized Google Front End / Firebase Hosting proxy,
 *          we trust it, allowing Express to inspect hop 2 (the forwarded client IP).
 *          If this entity is NOT a recognized Google proxy (e.g. direct caller to Cloud Run),
 *          we do NOT trust it; Express stops at hop 1 and uses hop 1 as req.ip.
 * - Hop >= 2: Client IP boundary. NEVER trust beyond hop 1.
 *             Even if the client IP belongs to a Google subnet, trusting hop >= 2 would allow
 *             an attacker to prepend arbitrary spoofed IPs to X-Forwarded-For.
 *
 * @param {string[]} [trustedRanges=GOOGLE_PROXY_CIDRS]
 * @returns {(addr: string, hop: number) => boolean}
 */
export function createTrustProxyFn(trustedRanges = GOOGLE_PROXY_CIDRS) {
  const isTrustedHop = proxyAddr.compile(trustedRanges);

  return function trustProxy(addr, hop) {
    if (hop === 0) return true;
    if (hop === 1) return isTrustedHop(addr);
    return false;
  };
}
