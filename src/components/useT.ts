/**
 * useT — typed translation helper hook
 *
 * Usage:
 *   const t = useT();
 *   <Text>{t("common.cancel")}</Text>
 *   const label = t("aiCoach.placeholder");
 *
 * Returns the translated string for a dot-notation key.
 * Falls back to the key itself if not found, so missing keys are visible.
 */

import { useTranslations } from "@/lib/i18n";
import { resolveKey } from "./T";

export function useT() {
  const tr = useTranslations();
  return (key: string): string => resolveKey(tr, key);
}
