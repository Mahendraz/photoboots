/**
 * Where to send a visitor back after signing in: only a path on this site, never another host.
 * Shared by the Worker (/auth/login → /auth/callback) and the login page (after email sign-in).
 *
 * Browsers drop tabs and newlines inside URLs and read "\" as "/", so "/\t/evil.test" or "/\evil.test"
 * would become "//evil.test" (another host). Anything with a control character or a backslash is
 * refused outright, and the rest must still resolve to this origin.
 */
const BASE = "https://same-origin.invalid";

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  try {
    const url = new URL(value, BASE);
    // "/a/..//evil.test" resolves to the path "//evil.test", which a browser reads as another host.
    if (url.origin !== BASE || url.pathname.startsWith("//")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
