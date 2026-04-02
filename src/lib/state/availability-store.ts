import { create } from "zustand";
import type { TimeSlot, AvailabilityBlock } from "@/types";

// Lesson duration in minutes (90 minutes)
const LESSON_DURATION = 90;
// Buffer between lessons (15 minutes)
const BUFFER_MINUTES = 15;

interface AvailabilityState {
  availabilityBlocks: AvailabilityBlock[];
  bookedSlots: { date: string; startTime: string }[];
  setAvailabilityBlocks: (blocks: AvailabilityBlock[]) => void;
  addBookedSlot: (date: string, startTime: string) => void;
  removeBookedSlot: (date: string, startTime: string) => void;
  getAvailableSlotsForDate: (date: string) => TimeSlot[];
  isSlotAvailable: (date: string, startTime: string) => boolean;
}

// Sample availability data (admin would set this via Google Calendar)
// In production, this would be fetched from Google Calendar API
const sampleAvailabilityBlocks: AvailabilityBlock[] = [
  // Tomorrow - morning availability
  {
    id: "avail-1",
    date: getDateString(1),
    startTime: "07:00",
    endTime: "13:00",
    title: "AVAILABLE",
  },
  // Tomorrow - afternoon availability
  {
    id: "avail-2",
    date: getDateString(1),
    startTime: "14:00",
    endTime: "18:00",
    title: "AVAILABLE",
  },
  // Day after tomorrow - full day
  {
    id: "avail-3",
    date: getDateString(2),
    startTime: "07:00",
    endTime: "18:00",
    title: "AVAILABLE",
  },
  // 3 days out - morning only
  {
    id: "avail-4",
    date: getDateString(3),
    startTime: "07:00",
    endTime: "12:00",
    title: "AVAILABLE",
  },
  // 4 days out - afternoon only
  {
    id: "avail-5",
    date: getDateString(4),
    startTime: "13:00",
    endTime: "18:00",
    title: "AVAILABLE",
  },
  // 5 days out - full day
  {
    id: "avail-6",
    date: getDateString(5),
    startTime: "07:00",
    endTime: "18:00",
    title: "AVAILABLE",
  },
  // 6 days out - morning
  {
    id: "avail-7",
    date: getDateString(6),
    startTime: "08:00",
    endTime: "13:00",
    title: "AVAILABLE",
  },
  // 7 days out - full day
  {
    id: "avail-8",
    date: getDateString(7),
    startTime: "07:00",
    endTime: "18:00",
    title: "AVAILABLE",
  },
];

// Sample booked slots (simulating already booked times)
const sampleBookedSlots: { date: string; startTime: string }[] = [
  { date: getDateString(1), startTime: "08:45" },
  { date: getDateString(2), startTime: "07:00" },
  { date: getDateString(2), startTime: "10:30" },
];

// Helper to get date string for N days from now
function getDateString(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split("T")[0];
}

// Helper to convert time string (HH:MM) to minutes from midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Helper to convert minutes from midnight to time string (HH:MM)
function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

// Helper to format time for display (7:00 AM)
function formatTimeLabel(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

// Generate time slots from availability blocks
function generateTimeSlotsFromBlocks(
  blocks: AvailabilityBlock[],
  date: string,
  bookedSlots: { date: string; startTime: string }[]
): TimeSlot[] {
  const dateBlocks = blocks.filter((b) => b.date === date);
  if (dateBlocks.length === 0) return [];

  const slots: TimeSlot[] = [];
  const slotInterval = LESSON_DURATION + BUFFER_MINUTES; // 105 minutes between slot starts

  for (const block of dateBlocks) {
    const blockStart = timeToMinutes(block.startTime);
    const blockEnd = timeToMinutes(block.endTime);

    let currentStart = blockStart;

    while (currentStart + LESSON_DURATION <= blockEnd) {
      const startTime = minutesToTime(currentStart);
      const endTime = minutesToTime(currentStart + LESSON_DURATION);

      // Check if this slot is already booked
      const isBooked = bookedSlots.some(
        (s) => s.date === date && s.startTime === startTime
      );

      slots.push({
        id: `${date}-${startTime}`,
        startTime,
        endTime,
        label: `${formatTimeLabel(startTime)} - ${formatTimeLabel(endTime)}`,
        available: !isBooked,
      });

      currentStart += slotInterval;
    }
  }

  // Sort slots by start time
  return slots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

export const useAvailabilityStore = create<AvailabilityState>((set, get) => ({
  availabilityBlocks: sampleAvailabilityBlocks,
  bookedSlots: sampleBookedSlots,

  setAvailabilityBlocks: (blocks) => {
    set({ availabilityBlocks: blocks });
  },

  addBookedSlot: (date, startTime) => {
    set((state) => ({
      bookedSlots: [...state.bookedSlots, { date, startTime }],
    }));
  },

  removeBookedSlot: (date, startTime) => {
    set((state) => ({
      bookedSlots: state.bookedSlots.filter(
        (s) => !(s.date === date && s.startTime === startTime)
      ),
    }));
  },

  getAvailableSlotsForDate: (date) => {
    const { availabilityBlocks, bookedSlots } = get();
    return generateTimeSlotsFromBlocks(availabilityBlocks, date, bookedSlots);
  },

  isSlotAvailable: (date, startTime) => {
    const { bookedSlots, availabilityBlocks } = get();

    // Check if slot is within an availability block
    const dateBlocks = availabilityBlocks.filter((b) => b.date === date);
    const slotMinutes = timeToMinutes(startTime);

    const isInAvailableBlock = dateBlocks.some((block) => {
      const blockStart = timeToMinutes(block.startTime);
      const blockEnd = timeToMinutes(block.endTime);
      return slotMinutes >= blockStart && slotMinutes + LESSON_DURATION <= blockEnd;
    });

    if (!isInAvailableBlock) return false;

    // Check if slot is not already booked
    const isBooked = bookedSlots.some(
      (s) => s.date === date && s.startTime === startTime
    );

    return !isBooked;
  },
}));

// Export helpers for use elsewhere
export { formatTimeLabel, timeToMinutes, minutesToTime, LESSON_DURATION, BUFFER_MINUTES };
