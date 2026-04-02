import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Lesson Notifications Helper
 *
 * NOTE: This uses AsyncStorage-based reminders that are checked when the app opens.
 * For push notifications when the app is closed, expo-notifications with native
 * setup would be required (which needs to be installed via `npx expo install expo-notifications`).
 *
 * This implementation stores reminder data and provides helpers to check if
 * reminders should be shown when the user opens the app.
 */

interface ScheduleLessonRemindersParams {
  bookingId: string;
  lessonDate: string; // YYYY-MM-DD format
  lessonStartTime: string; // HH:MM format
  customerName?: string;
}

interface StoredReminder {
  bookingId: string;
  lessonDateTime: string; // ISO string
  reminders: {
    hoursBeforeLabel: string;
    triggerAt: string; // ISO string
    shown: boolean;
  }[];
  createdAt: string;
}

interface PendingReminder {
  bookingId: string;
  hoursBeforeLabel: string;
  lessonDateTime: Date;
}

const STORAGE_KEY_PREFIX = "lesson_notifs_";
const ALL_REMINDERS_KEY = "all_lesson_reminders";

// Reminder intervals in hours before the lesson
const REMINDER_INTERVALS = [
  { hours: 24, label: "24 hours" },
  { hours: 3, label: "3 hours" },
  { hours: 1, label: "1 hour" },
];

/**
 * Parse date and time strings into a Date object
 */
function parseLessonDateTime(lessonDate: string, lessonStartTime: string): Date {
  // lessonDate is YYYY-MM-DD, lessonStartTime is HH:MM
  const [year, month, day] = lessonDate.split("-").map(Number);
  const [hours, minutes] = lessonStartTime.split(":").map(Number);

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * Schedule lesson reminder data to be checked when app opens
 * Stores reminder times at 24h, 3h, and 1h before the lesson
 * Skips any times that are already in the past
 */
export async function scheduleLessonReminders(
  params: ScheduleLessonRemindersParams
): Promise<void> {
  const { bookingId, lessonDate, lessonStartTime, customerName } = params;

  try {
    // Cancel any existing reminders for this booking first
    await cancelLessonReminders(bookingId);

    const lessonDateTime = parseLessonDateTime(lessonDate, lessonStartTime);
    const now = new Date();

    const reminders: StoredReminder["reminders"] = [];

    for (const interval of REMINDER_INTERVALS) {
      const triggerDate = new Date(lessonDateTime.getTime() - interval.hours * 60 * 60 * 1000);

      // Skip if the trigger time is already in the past
      if (triggerDate <= now) {
        console.log(`[LessonNotifications] Skipping ${interval.label} reminder (already past)`);
        continue;
      }

      reminders.push({
        hoursBeforeLabel: interval.label,
        triggerAt: triggerDate.toISOString(),
        shown: false,
      });

      console.log(
        `[LessonNotifications] Scheduled ${interval.label} reminder for booking ${bookingId}, ` +
        `triggers at ${triggerDate.toISOString()}`
      );
    }

    if (reminders.length === 0) {
      console.log(`[LessonNotifications] No future reminders to schedule for booking ${bookingId}`);
      return;
    }

    // Store the reminder data
    const storedReminder: StoredReminder = {
      bookingId,
      lessonDateTime: lessonDateTime.toISOString(),
      reminders,
      createdAt: new Date().toISOString(),
    };

    const storageKey = `${STORAGE_KEY_PREFIX}${bookingId}`;
    await AsyncStorage.setItem(storageKey, JSON.stringify(storedReminder));

    // Also add to the list of all reminders for easy lookup
    await addToRemindersList(bookingId);

    console.log(`[LessonNotifications] Stored ${reminders.length} reminders for booking ${bookingId}`);
  } catch (error) {
    // Best-effort: don't crash if storage fails
    console.log("[LessonNotifications] Error scheduling reminders:", error);
  }
}

/**
 * Cancel all reminders for a booking
 */
export async function cancelLessonReminders(bookingId: string): Promise<void> {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${bookingId}`;
    await AsyncStorage.removeItem(storageKey);
    await removeFromRemindersList(bookingId);
    console.log(`[LessonNotifications] Cancelled reminders for booking ${bookingId}`);
  } catch (error) {
    console.log("[LessonNotifications] Error cancelling reminders:", error);
  }
}

/**
 * Get all pending reminders that should be shown now
 * Call this when the app opens to check for due reminders
 */
export async function getPendingReminders(): Promise<PendingReminder[]> {
  try {
    const allBookingIds = await getRemindersList();
    const now = new Date();
    const pendingReminders: PendingReminder[] = [];

    for (const bookingId of allBookingIds) {
      const storageKey = `${STORAGE_KEY_PREFIX}${bookingId}`;
      const stored = await AsyncStorage.getItem(storageKey);

      if (!stored) continue;

      const reminder: StoredReminder = JSON.parse(stored);
      const lessonDateTime = new Date(reminder.lessonDateTime);

      // Skip if lesson has already passed
      if (lessonDateTime < now) {
        // Clean up old reminders
        await cancelLessonReminders(bookingId);
        continue;
      }

      let hasUpdates = false;

      for (const r of reminder.reminders) {
        const triggerAt = new Date(r.triggerAt);

        // Check if this reminder is due and hasn't been shown
        if (triggerAt <= now && !r.shown) {
          pendingReminders.push({
            bookingId,
            hoursBeforeLabel: r.hoursBeforeLabel,
            lessonDateTime,
          });
          r.shown = true;
          hasUpdates = true;
        }
      }

      // Save updates if any reminders were marked as shown
      if (hasUpdates) {
        await AsyncStorage.setItem(storageKey, JSON.stringify(reminder));
      }
    }

    return pendingReminders;
  } catch (error) {
    console.log("[LessonNotifications] Error getting pending reminders:", error);
    return [];
  }
}

/**
 * Get stored reminder data for a booking
 */
export async function getScheduledReminders(bookingId: string): Promise<StoredReminder | null> {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${bookingId}`;
    const stored = await AsyncStorage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    return JSON.parse(stored);
  } catch (error) {
    console.log("[LessonNotifications] Error getting scheduled reminders:", error);
    return null;
  }
}

// Helper to maintain a list of all booking IDs with reminders
async function getRemindersList(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(ALL_REMINDERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

async function addToRemindersList(bookingId: string): Promise<void> {
  try {
    const list = await getRemindersList();
    if (!list.includes(bookingId)) {
      list.push(bookingId);
      await AsyncStorage.setItem(ALL_REMINDERS_KEY, JSON.stringify(list));
    }
  } catch (error) {
    console.log("[LessonNotifications] Error adding to reminders list:", error);
  }
}

async function removeFromRemindersList(bookingId: string): Promise<void> {
  try {
    const list = await getRemindersList();
    const filtered = list.filter((id) => id !== bookingId);
    await AsyncStorage.setItem(ALL_REMINDERS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.log("[LessonNotifications] Error removing from reminders list:", error);
  }
}
