/**
 * uiText — centralized common UI string keys
 *
 * Use these constants when building new screens to avoid re-typing key strings
 * and to ensure future screens automatically use existing translation keys.
 *
 * Import pattern:
 *   import { UI } from "@/lib/uiText";
 *   const t = useT();
 *   <Text>{t(UI.cancel)}</Text>
 */

export const UI = {
  // ── Common actions ──────────────────────────────────────────────────────────
  cancel:   "common.cancel",
  save:     "common.save",
  edit:     "common.edit",
  delete:   "common.delete",
  back:     "common.back",
  next:     "common.next",
  done:     "common.done",
  confirm:  "common.confirm",
  close:    "common.close",
  loading:  "common.loading",
  error:    "common.error",
  success:  "common.success",
  language: "common.language",
  required: "common.required",

  // ── Profile ─────────────────────────────────────────────────────────────────
  selectLanguage: "profile.selectLanguage",
  settings:       "profile.settings",
  logout:         "profile.logout",
  editProfile:    "profile.editProfile",

  // ── Manager ─────────────────────────────────────────────────────────────────
  saveChanges:      "manager.saveChanges",
  documentSaved:    "manager.documentSaved",
  legalSettings:    "manager.legalSettings",
  waiverRequired:   "manager.waiverRequired",
  editCancellation: "manager.editCancellation",
  editRefund:       "manager.editRefund",

  // ── AI Coach ─────────────────────────────────────────────────────────────────
  aiCoachName:        "aiCoach.name",
  aiCoachTitle:       "aiCoach.title",
  aiCoachPlaceholder: "aiCoach.placeholder",
  aiCoachSend:        "aiCoach.send",
  aiCoachTyping:      "aiCoach.typing",
  aiCoachError:       "aiCoach.error",
  aiCoachDisclaimer:  "aiCoach.disclaimer",
  aiCoachWelcome:     "aiCoach.welcomeMessage",
  aiCoachFallback:    "aiCoach.fallback",

  // ── Booking ──────────────────────────────────────────────────────────────────
  bookNow:          "booking.bookNow",
  confirmBooking:   "booking.confirmBooking",
  classDate:        "booking.classDate",
  classType:        "booking.classType",
  studentDetails:   "booking.studentDetails",
  waiverTitle:      "booking.waiverTitle",
  iAcceptWaiver:    "booking.iAcceptWaiver",
} as const;

export type UIKey = typeof UI[keyof typeof UI];

/**
 * getAppLanguage — read the current locale outside of React components.
 * Useful for non-component code like API calls, services, etc.
 */
export { useLanguageStore } from "@/lib/i18n";
