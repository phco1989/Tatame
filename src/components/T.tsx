/**
 * T — Typed translation component
 *
 * Usage:
 *   <T k="common.cancel" />
 *   <T k="aiCoach.placeholder" style={styles.label} />
 *   <T k="common.loading" style={styles.hint} numberOfLines={1} />
 *
 * Only renders user-visible text. Never use for IDs, codes, or emails.
 */

import React from "react";
import { Text, TextStyle, TextProps } from "react-native";
import { useTranslations } from "@/lib/i18n";

type TranslationKey = string;

interface TProps extends Omit<TextProps, "children"> {
  /** Dot-notation key: "section.key" e.g. "common.cancel" */
  k: TranslationKey;
  /** Optional style override merged on top of no default style */
  style?: TextStyle | TextStyle[];
}

/**
 * Resolves a dot-notation key like "aiCoach.placeholder" against
 * the translations object and renders it as a <Text> node.
 */
export function T({ k, style, ...rest }: TProps) {
  const tr = useTranslations();

  const value = resolveKey(tr, k);

  return (
    <Text style={style} {...rest}>
      {value}
    </Text>
  );
}

/** Resolves "section.key" path against a nested object, returns the string or the key itself as fallback. */
export function resolveKey(obj: unknown, path: string): string {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return path;
    current = current[part];
  }
  if (typeof current === "string") return current;
  return path; // fallback: show the key so missing translations are visible
}
