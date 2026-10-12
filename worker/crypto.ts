/**
 * Disalin dari assetweb (worker/crypto.ts), skema login yang sama dengan asset.inwebsite.online.
 *
 * Small Web Crypto helpers for the Worker (also run under Node in tests):
 * base64url, random tokens, SHA-256/512, and HMAC-signed values for cookies.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function base64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(value: string) {
  const s = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

export async function sha256Hex(value: string) {
  return [...(await sha256(value))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha512Hex(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-512", enc.encode(value)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** String comparison whose time does not depend on where the strings differ (for signatures). */
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** PKCE S256 challenge for a code verifier. */
export async function pkceChallenge(verifier: string) {
  return base64url(await sha256(verifier));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** `<base64url(json)>.<base64url(hmac)>`, with an expiry inside the payload. */
export async function signValue(payload: Record<string, unknown>, secret: string, maxAgeSeconds: number) {
  const body = base64url(enc.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${base64url(sig)}`;
}

/** The payload of a value made by signValue, or null when it is tampered with or expired. */
export async function verifyValue<T extends Record<string, unknown>>(value: string | undefined, secret: string): Promise<T | null> {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromBase64url(body))) as T & { exp?: number };
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Decodes a JWT payload without checking the signature (see verifyIdToken in auth.ts for why that is fine). */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    return JSON.parse(dec.decode(fromBase64url(jwt.split(".")[1] ?? "")));
  } catch {
    return null;
  }
}
