/**
 * Centralized post-login route resolver.
 *
 * Rules:
 *  - NGO manager  → /ong-dashboard   (dedicated NGO panel)
 *  - Non-NGO manager → /manager      (academy admin panel)
 *  - Everyone else (student, coach, NGO student/coach) → /(tabs)
 *
 * Having this in one place ensures every routing site (index, signin,
 * complete-profile, create-login, _post-login-router) behaves identically.
 */
export function resolvePostLoginRoute(isNgo: boolean, role: string | null): string {
  if (isNgo && role === "manager") return "/ong-dashboard";
  if (role === "manager") return "/manager";
  return "/(tabs)";
}
