/**
 * Academy Theme System
 *
 * Each academy chooses ONE theme color from preset options.
 * This color applies across the entire app for all users of that academy.
 */

// Premium preset theme colors - BJJ inspired
export const THEME_PRESETS = [
  { id: "black", name: "Black Belt", primary: "#1A1A1A", secondary: "#2D2D2D" },
  { id: "navy", name: "Navy Blue", primary: "#1E3A5F", secondary: "#2D4A6F" },
  { id: "crimson", name: "Crimson", primary: "#DC2626", secondary: "#EF4444" },
  { id: "gold", name: "Gold", primary: "#B8860B", secondary: "#D4A017" },
  { id: "purple", name: "Purple Belt", primary: "#7C3AED", secondary: "#8B5CF6" },
  { id: "brown", name: "Brown Belt", primary: "#8B4513", secondary: "#A0522D" },
] as const;

export type ThemePresetId = typeof THEME_PRESETS[number]["id"];

// Default theme
export const DEFAULT_THEME = THEME_PRESETS[1]; // Navy Blue

/**
 * Get theme preset by ID
 */
export function getThemePreset(id?: string) {
  if (!id) return DEFAULT_THEME;
  return THEME_PRESETS.find((t) => t.id === id) || DEFAULT_THEME;
}

/**
 * Get theme colors from primary color hex
 * Maps a primary color to its full theme preset, or creates a fallback
 */
export function getThemeFromPrimaryColor(primaryColor?: string): {
  primary: string;
  secondary: string;
  gradient: readonly [string, string];
} {
  if (!primaryColor) {
    return {
      primary: DEFAULT_THEME.primary,
      secondary: DEFAULT_THEME.secondary,
      gradient: [DEFAULT_THEME.primary, DEFAULT_THEME.secondary] as const,
    };
  }

  // Find matching preset
  const preset = THEME_PRESETS.find(
    (t) => t.primary.toLowerCase() === primaryColor.toLowerCase()
  );

  if (preset) {
    return {
      primary: preset.primary,
      secondary: preset.secondary,
      gradient: [preset.primary, preset.secondary] as const,
    };
  }

  // Fallback: use the provided color with a lighter variant
  return {
    primary: primaryColor,
    secondary: lightenColor(primaryColor, 15),
    gradient: [primaryColor, lightenColor(primaryColor, 15)] as const,
  };
}

/**
 * Lighten a hex color by percentage
 */
function lightenColor(hex: string, percent: number): string {
  // Remove # if present
  const cleanHex = hex.replace("#", "");

  // Parse RGB
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Lighten
  const newR = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));

  // Convert back to hex
  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

/**
 * Get contrasting text color for a background
 */
export function getContrastColor(hexColor: string): "white" | "black" {
  const cleanHex = hexColor.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "black" : "white";
}
