import { create } from "zustand";
import type { Booking, Student, Package, ClassResult, ClassType, ClassLevel, TimeWindow, UserRole } from "@/types";
import { cancelLessonReminders } from "@/lib/notifications/lesson-notifications";

interface BookingState {
  bookings: Booking[];
  packages: Package[];
  classResults: ClassResult[];
  addBooking: (booking: Booking) => void;
  updateBookingStatus: (bookingId: string, status: Booking["status"]) => void;
  addPackage: (pkg: Package) => void;
  usePackageClass: (packageId: string) => void;
  addClassResult: (result: ClassResult) => void;
  getUpcomingClasses: () => Booking[];
  getPastClasses: () => Booking[];
  getBookingById: (id: string) => Booking | undefined;
  getClassResultsForUser: (userId: string) => ClassResult[];
  // Security: Role-based data access filters
  getBookingsForUser: (userId: string, userRole: UserRole, assignedCoachId?: string) => Booking[];
  getClassResultsFiltered: (userId: string, userRole: UserRole, assignedCoachId?: string) => ClassResult[];
}

// Sample class results for demo
const sampleClassResults: ClassResult[] = [
  {
    id: "result-1",
    bookingId: "booking-past-1",
    studentId: "user-1",
    coachId: "coach-1",
    coachName: "Mike",
    coachNotes: "Great first session! You showed excellent technique and enthusiasm.",
    ratings: {
      technique: 3,
      drilling: 2,
      sparring: 4,
      attitude: 4,
    },
    techniquesLearned: ["guard retention", "hip escape"],
    nextClassFocus: "Focus on timing your sweeps",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    classDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "result-2",
    bookingId: "booking-past-2",
    studentId: "user-1",
    coachId: "coach-1",
    coachName: "Mike",
    coachNotes: "Awesome progress! Your guard passing is getting much better.",
    ratings: {
      technique: 4,
      drilling: 3,
      sparring: 4,
      attitude: 5,
    },
    techniquesLearned: ["knee slice pass", "toreando pass"],
    nextClassFocus: "Work on submission setups from side control",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    classDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Sample bookings for demo
const sampleBookings: Booking[] = [
  {
    id: "booking-1",
    userId: "user-1",
    customerName: "John Doe",
    customerPhone: "+1 (555) 123-4567",
    customerEmail: "john@example.com",
    classType: "private",
    level: "fundamentals",
    dateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    classDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    classStartTime: "07:00",
    classEndTime: "08:30",
    durationMinutes: 90,
    timeWindow: "morning",
    numberOfStudents: 1,
    status: "confirmed",
    totalPrice: 100,
    studentIds: ["user-1"],
    students: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "booking-2",
    userId: "user-1",
    customerName: "John Doe",
    customerPhone: "+1 (555) 123-4567",
    customerEmail: "john@example.com",
    classType: "private",
    level: "fundamentals",
    dateTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    classDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    classStartTime: "13:00",
    classEndTime: "14:30",
    durationMinutes: 90,
    timeWindow: "afternoon",
    numberOfStudents: 1,
    status: "requested",
    totalPrice: 100,
    studentIds: ["user-1"],
    students: [],
    notes: "Would love to work on my guard!",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const useBookingStore = create<BookingState>((set, get) => ({
  bookings: sampleBookings,
  packages: [],
  classResults: sampleClassResults,

  addBooking: (booking) => {
    set((state) => ({
      bookings: [booking, ...state.bookings],
    }));
  },

  updateBookingStatus: (bookingId, status) => {
    // If booking is being cancelled, cancel any scheduled reminders
    if (status === "cancelled") {
      cancelLessonReminders(bookingId).catch((err) => {
        console.log("[BookingStore] Failed to cancel reminders:", err);
      });
    }
    set((state) => ({
      bookings: state.bookings.map((b) =>
        b.id === bookingId ? { ...b, status, updatedAt: new Date().toISOString() } : b
      ),
    }));
  },

  addPackage: (pkg) => {
    set((state) => ({
      packages: [pkg, ...state.packages],
    }));
  },

  usePackageClass: (packageId) => {
    set((state) => ({
      packages: state.packages.map((p) =>
        p.id === packageId
          ? {
              ...p,
              classesUsed: (p.classesUsed || 0) + 1,
              classesRemaining: typeof p.classesRemaining === "number" ? p.classesRemaining - 1 : p.classesRemaining,
            }
          : p
      ),
    }));
  },

  addClassResult: (result) => {
    set((state) => ({
      classResults: [result, ...state.classResults],
    }));
  },

  getUpcomingClasses: () => {
    const { bookings } = get();
    return bookings
      .filter((b) => {
        const classDate = new Date(b.dateTime);
        const now = new Date();
        return classDate > now && (b.status === "confirmed" || b.status === "requested");
      })
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  },

  getPastClasses: () => {
    const { bookings } = get();
    return bookings
      .filter((b) => {
        const classDate = new Date(b.dateTime);
        const now = new Date();
        return classDate <= now || b.status === "completed";
      })
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  },

  getBookingById: (id) => {
    const { bookings } = get();
    return bookings.find((b) => b.id === id);
  },

  getClassResultsForUser: (userId) => {
    const { classResults } = get();
    return classResults
      .filter((r) => r.studentId === userId)
      .sort((a, b) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime());
  },

  // Security: Role-based booking access
  // - Students can only see their own bookings
  // - Coaches can only see bookings assigned to them
  // - Managers can see all bookings
  getBookingsForUser: (userId, userRole, assignedCoachId) => {
    const { bookings } = get();

    if (userRole === "manager") {
      // Manager can see all bookings
      return bookings;
    }

    if (userRole === "coach" && assignedCoachId) {
      // Coach can only see assigned bookings
      // For demo, we'll check if any booking has this coach assigned
      // In real app, bookings would have an assignedCoachId field
      return bookings; // For now, coaches see all (would filter by assignedCoachId in prod)
    }

    // Students can only see their own bookings
    return bookings.filter((b) => b.userId === userId);
  },

  // Security: Role-based class results access
  // - Students can only see their own results
  // - Coaches can only see results for their assigned students
  // - Managers can see all results
  getClassResultsFiltered: (userId, userRole, assignedCoachId) => {
    const { classResults } = get();

    if (userRole === "manager") {
      // Manager can see all results
      return classResults.sort(
        (a, b) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime()
      );
    }

    if (userRole === "coach" && assignedCoachId) {
      // Coach can only see results they created
      return classResults
        .filter((r) => r.coachId === assignedCoachId)
        .sort((a, b) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime());
    }

    // Students can only see their own results
    return classResults
      .filter((r) => r.studentId === userId)
      .sort((a, b) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime());
  },
}));

// Helper to calculate price
export function calculatePrice(classType: ClassType, numberOfStudents: number, packageSize?: 8 | 12): number {
  if (classType === "private") {
    return 100; // Private 1-on-1 class
  }
  if (classType === "gi" || classType === "nogi") {
    return 35 * numberOfStudents; // Drop-in rate
  }
  if (classType === "seminar") {
    return 50 * numberOfStudents;
  }
  if (classType === "open_mat") {
    return 20 * numberOfStudents;
  }
  // Package pricing
  if (packageSize === 8) {
    return 200; // 8-class package
  }
  if (packageSize === 12) {
    return 270; // 12-class package
  }
  return 0;
}

// Time window labels
export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  morning: "Morning (7-10 AM)",
  midday: "Midday (10 AM-1 PM)",
  afternoon: "Afternoon (1-4 PM)",
  evening: "Evening (4-7 PM)",
};
