/**
 * Auth input normalization and validation helpers.
 * Use these before every Firebase auth call to prevent auth/invalid-credential.
 */

/** Trim + lowercase. Always apply to email before Firebase calls. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Trim only — do NOT lowercase passwords. */
export function normalizePassword(pw: string): string {
  return pw.trim();
}

/** Basic sanity check: must contain "@" and a "." after "@". */
export function validateEmailBasic(email: string): boolean {
  const at = email.indexOf("@");
  if (at < 1) return false;
  const dot = email.indexOf(".", at);
  return dot > at + 1;
}
