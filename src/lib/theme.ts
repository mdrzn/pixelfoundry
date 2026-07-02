/**
 * Resolve the theme that should be applied on first paint given the persisted
 * preference (from localStorage) and the system color-scheme preference.
 */
export function resolveInitialTheme(
  stored: string | null,
  systemDark: boolean,
): "dark" | "light" {
  if (stored) {
    return stored === "dark" ? "dark" : "light";
  }
  return systemDark ? "dark" : "light";
}
