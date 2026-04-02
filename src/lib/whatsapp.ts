import { Linking, Alert, Platform } from "react-native";

/**
 * Formats a phone number to E.164 format without the + prefix
 * E.164 format: +[country code][subscriber number]
 * For wa.me links, we need the number without the + sign
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Remove the + prefix if present (wa.me doesn't need it)
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  return cleaned;
}

/**
 * Validates if a phone number is in E.164 format
 */
export function isValidE164(phone: string): boolean {
  // E.164 format: + followed by 1-15 digits
  const e164Regex = /^\+?[1-9]\d{6,14}$/;
  return e164Regex.test(phone.replace(/[^\d+]/g, ""));
}

/**
 * Encodes a message for URL
 */
export function encodeWhatsAppMessage(message: string): string {
  return encodeURIComponent(message);
}

/**
 * Generates a WhatsApp click-to-chat URL
 * @param phone Phone number in E.164 format (e.g., +5511999999999 or +15551234567)
 * @param message Pre-filled message (optional)
 * @returns WhatsApp URL or null if phone is invalid
 */
export function generateWhatsAppUrl(phone: string, message?: string): string | null {
  if (!phone || !isValidE164(phone)) {
    return null;
  }

  const formattedPhone = formatPhoneForWhatsApp(phone);
  let url = `https://wa.me/${formattedPhone}`;

  if (message) {
    url += `?text=${encodeWhatsAppMessage(message)}`;
  }

  return url;
}

/**
 * Opens WhatsApp with the specified phone number and optional pre-filled message
 * Shows appropriate error messages if phone is missing or WhatsApp is not available
 */
export async function openWhatsApp(
  phone: string | undefined,
  message?: string,
  fallbackMessage?: string
): Promise<boolean> {
  // Check if phone number is provided
  if (!phone) {
    Alert.alert(
      "WhatsApp Unavailable",
      fallbackMessage || "WhatsApp number not available. Please contact the school.",
      [{ text: "OK" }]
    );
    return false;
  }

  const url = generateWhatsAppUrl(phone, message);

  if (!url) {
    Alert.alert(
      "Invalid Phone Number",
      "The phone number format is not valid. Please contact support.",
      [{ text: "OK" }]
    );
    return false;
  }

  try {
    // Check if WhatsApp can be opened
    const canOpen = await Linking.canOpenURL(url);

    if (canOpen) {
      await Linking.openURL(url);
      return true;
    } else {
      // WhatsApp not installed - try opening in browser as fallback
      if (Platform.OS === "web") {
        await Linking.openURL(url);
        return true;
      } else {
        Alert.alert(
          "WhatsApp Not Installed",
          "WhatsApp is not installed on this device. Would you like to open the link in your browser instead?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open in Browser",
              onPress: async () => {
                try {
                  await Linking.openURL(url);
                } catch {
                  Alert.alert("Error", "Could not open the link.");
                }
              },
            },
          ]
        );
        return false;
      }
    }
  } catch (error) {
    console.error("Error opening WhatsApp:", error);
    Alert.alert(
      "Error",
      "Could not open WhatsApp. Please try again later.",
      [{ text: "OK" }]
    );
    return false;
  }
}

/**
 * Pre-defined message templates
 */
export const WhatsAppMessages = {
  // Student to School
  studentToSchool: (studentName?: string) =>
    studentName
      ? `Hi! I'm ${studentName} and I'd like more information about my next lesson 🤙`
      : "Hi! I'd like more information about my next lesson 🤙",

  // Student to Instructor
  studentToInstructor: (studentName?: string, coachName?: string) => {
    let message = "Hi";
    if (coachName) message += ` ${coachName}`;
    message += "! ";
    if (studentName) message += `I'm ${studentName}. `;
    message += "I'd like more information about my next lesson 🤙";
    return message;
  },

  // Coach to Student
  coachToStudent: (studentName?: string, coachName?: string) => {
    let message = "Hi";
    if (studentName) message += ` ${studentName}`;
    message += "! ";
    if (coachName) message += `This is ${coachName} from Tatame. `;
    message += "I wanted to reach out about your upcoming lesson 🏄";
    return message;
  },

  // Manager to Student
  managerToStudent: (studentName?: string, schoolName?: string) => {
    let message = "Hi";
    if (studentName) message += ` ${studentName}`;
    message += "! ";
    message += `This is ${schoolName || "Tatame"}. `;
    message += "We wanted to reach out regarding your Jiu-Jitsu sessions 🥋";
    return message;
  },

  // Keep adminToStudent as alias for backwards compatibility
  adminToStudent: (studentName?: string, schoolName?: string) => {
    let message = "Hi";
    if (studentName) message += ` ${studentName}`;
    message += "! ";
    message += `This is ${schoolName || "Tatame"}. `;
    message += "We wanted to reach out regarding your Jiu-Jitsu sessions 🥋";
    return message;
  },
};

/**
 * WhatsApp action types for tracking
 */
export type WhatsAppActionType =
  | "student_to_school"
  | "student_to_instructor"
  | "coach_to_student"
  | "admin_to_student"
  | "manager_to_student";
