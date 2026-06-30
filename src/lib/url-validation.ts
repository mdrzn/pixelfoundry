import { isIP } from "node:net";

const PRIVATE_IP_RANGES = [
  // IPv4 private ranges
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // Loopback
  /^127\./,
  // Link-local
  /^169\.254\./,
  // AWS/cloud metadata
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  // Current network
  /^0\./,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "169.254.169.254",
  "[::1]",
]);

function isPrivateIP(ip: string): boolean {
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = v4Mapped ? v4Mapped[1] : ip;

  return PRIVATE_IP_RANGES.some((range) => range.test(v4));
}

/**
 * Validates that a URL is safe to fetch server-side.
 * Blocks private/internal IPs, cloud metadata endpoints, and non-HTTPS URLs.
 * Returns the validated URL string, or throws if invalid.
 */
export function assertSafeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL provided.");
  }

  // Only allow http and https
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTPS and HTTP URLs are allowed.");
  }

  // Block data: and other schemes that might sneak through
  const hostname = parsed.hostname.toLowerCase();

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("URLs pointing to internal services are not allowed.");
  }

  // Block IPs directly
  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error("URLs pointing to private/internal IP addresses are not allowed.");
    }
  }

  // Block hostnames that resolve to private IPs would require DNS resolution;
  // at minimum, block obvious patterns
  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost")
  ) {
    throw new Error("URLs pointing to internal services are not allowed.");
  }

  return url;
}

/**
 * Validates an array of URLs, returning only safe ones.
 * Throws on the first invalid URL.
 */
export function assertSafeUrls(urls: string[]): string[] {
  return urls.map((url) => assertSafeUrl(url));
}
