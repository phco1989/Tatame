// Student and User Types
export type BJJExperience = "first_time" | "beginner" | "intermediate" | "advanced" | "competitor";
export type BeltRank = "white" | "blue" | "purple" | "brown" | "black";
export type BookingStatus = "requested" | "confirmed" | "in_progress" | "completed" | "cancelled";
export type UserRole = "student" | "coach" | "manager";
export type UserStatus = "active" | "disabled";
export type ClassType = "gi" | "nogi" | "private" | "seminar" | "open_mat";
export type ClassLevel = "fundamentals" | "intermediate" | "advanced" | "all_levels";
export type ConversationStatus = "new" | "in_progress" | "closed";
export type MessageSender = "bot" | "student" | "manager";
export type ConversationTopic = "booking" | "prices" | "schedule" | "reschedule" | "other";
export type TimeWindow = "morning" | "midday" | "afternoon" | "evening";
export type DataDeletionStatus = "pending" | "in_progress" | "completed" | "rejected";
export type InviteCodeRole = "student" | "coach";

// Permissions for each role
export type Permission =
  | "view_dashboard"
  | "manage_bookings"
  | "assign_coaches"
  | "view_chats"
  | "respond_chats"
  | "add_class_results"
  | "view_students"
  | "manage_students"
  | "view_finances"
  | "manage_finances"
  | "view_payouts"
  | "manage_payouts"
  | "view_staff"
  | "manage_staff"
  | "manage_data_deletion"
  | "export_data"
  | "manage_invite_codes"
  | "manage_posts";

// Role permission mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  student: [],
  coach: [
    "view_dashboard",
    "manage_bookings",
    "view_chats",
    "respond_chats",
    "add_class_results",
    "view_students",
  ],
  manager: [
    "view_dashboard",
    "manage_bookings",
    "assign_coaches",
    "view_chats",
    "respond_chats",
    "add_class_results",
    "view_students",
    "manage_students",
    "view_finances",
    "manage_finances",
    "view_payouts",
    "manage_payouts",
    "view_staff",
    "manage_staff",
    "manage_data_deletion",
    "export_data",
    "manage_invite_codes",
    "manage_posts",
  ],
};

export interface Student {
  id: string;
  fullName: string;
  age: number;
  email: string;
  phone: string;
  height: string; // e.g., "5'10\""
  weight: string; // e.g., "150 lbs"
  experience: BJJExperience;
  beltRank: BeltRank;
  stripes: number; // 0-4 stripes on belt
  injuries?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes?: string;
  preferredStyle: "gi" | "nogi" | "both";
  goals: string[]; // e.g., ["improve_guard", "competition_prep"]
  createdAt: string;
  promotionDate?: string; // Last belt promotion date
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  studentProfile?: Student;
  coachProfile?: CoachProfile;
  createdAt: string;
  lastLoginAt?: string;
  isActive: boolean;
  createdByManager?: boolean;
  forcePasswordReset?: boolean;
  coachId?: string; // Assigned coach ID for students
}

export interface CoachProfile {
  id: string;
  userId: string;
  displayName: string;
  bio?: string;
  beltRank: BeltRank;
  specialties: string[]; // e.g., ["guard_passing", "leg_locks", "takedowns"]
  hourlyRate: number; // Payout rate per hour
  classRate: number; // Flat rate per class (alternative to hourly)
  payoutMethod: "hourly" | "per_class";
  totalClasses: number;
  totalEarnings: number;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  hireDate: string;
  coachProfile?: CoachProfile;
  createdAt: string;
}

export interface DataDeletionRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: DataDeletionStatus;
  reason?: string;
  requestedAt: string;
  processedAt?: string;
  processedBy?: string;
  notes?: string;
}

export interface Booking {
  id: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  classType: ClassType;
  level: ClassLevel;
  dateTime: string;
  // New exact time fields
  classDate: string; // YYYY-MM-DD format
  classStartTime: string; // HH:MM format (e.g., "07:00")
  classEndTime: string; // HH:MM format (e.g., "08:30")
  durationMinutes: number; // 60-90 for standard classes
  calendarEventId?: string; // Reference to Google Calendar event
  // Legacy field - kept for backwards compatibility but optional
  timeWindow?: TimeWindow;
  numberOfStudents: number;
  status: BookingStatus;
  totalPrice: number;
  studentIds: string[];
  students: Student[];
  packageId?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  // Waiver acceptance record
  waiverAccepted?: boolean;
  waiverVersion?: string;
  waiverAcceptedAt?: string;
  // Coach assignment fields (set when manager confirms)
  academyId?: string;
  coachId?: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

// Time slot for booking
export interface TimeSlot {
  id: string;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  label: string; // "7:00 AM - 8:30 AM"
  available: boolean;
}

// Availability block from admin calendar
export interface AvailabilityBlock {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  title: string; // "AVAILABLE" or specific event
}

export interface Package {
  id: string;
  userId: string;
  studentId: string;
  level: ClassLevel;
  packageSize: 8 | 12 | "unlimited"; // number of classes or unlimited monthly
  classesUsed: number;
  classesRemaining: number | "unlimited";
  totalPrice: number;
  createdAt: string;
  expiresAt?: string;
}

export interface ClassResult {
  id: string;
  bookingId: string;
  studentId: string;
  coachId: string;
  coachName: string;
  coachNotes: string;
  ratings: {
    technique: number; // 1-5
    drilling: number; // 1-5
    sparring: number; // 1-5
    attitude: number; // 1-5
    cardio?: number; // 1-5 (optional)
  };
  techniquesLearned: string[]; // e.g., ["arm bar from guard", "scissor sweep"]
  nextClassFocus: string;
  media?: string[]; // URLs to photos/videos
  createdAt: string;
  classDate: string;
}

// Alias for backward compatibility
export type LessonResult = ClassResult;

export interface Conversation {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  topic: ConversationTopic;
  status: ConversationStatus;
  assignedManagerId?: string;
  assignedManagerName?: string;
  lastMessageAt: string;
  createdAt: string;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: MessageSender;
  senderName: string;
  text: string;
  timestamp: string;
  isRead: boolean;
}

// Service Pricing
export interface ServicePricing {
  dropIn: number; // Single class drop-in
  privateClass: number; // Private 1-on-1
  packages: {
    eightClasses: number; // 8-class package
    twelveClasses: number; // 12-class package
    monthlyUnlimited: number; // Monthly unlimited
  };
}

// Badge Types - BJJ achievements
export type BadgeType = "first_class" | "first_submission" | "competition_debut" | "hundred_classes" | "promotion";

export interface Badge {
  type: BadgeType;
  name: string;
  icon: string;
  earnedAt: string;
}

// Goal Types - BJJ specific
export const TRAINING_GOALS = [
  { id: "improve_guard", label: "Improve guard game" },
  { id: "guard_passing", label: "Better guard passing" },
  { id: "takedowns", label: "Develop takedowns" },
  { id: "submissions", label: "More submissions" },
  { id: "escapes", label: "Better escapes" },
  { id: "competition_prep", label: "Competition prep" },
  { id: "self_defense", label: "Self-defense" },
  { id: "fitness", label: "Fitness & conditioning" },
] as const;

// Alias for backward compatibility
export const LESSON_GOALS = TRAINING_GOALS;

// Service pricing constants
export const SERVICE_PRICES: ServicePricing = {
  dropIn: 35,
  privateClass: 100,
  packages: {
    eightClasses: 200,
    twelveClasses: 270,
    monthlyUnlimited: 150,
  },
};

// Audit Log Types
export type AuditAction =
  | "create_staff_user"
  | "change_user_role"
  | "reset_password"
  | "disable_user"
  | "enable_user"
  | "confirm_booking"
  | "cancel_booking"
  | "complete_booking"
  | "assign_coach"
  | "create_availability"
  | "edit_availability"
  | "delete_availability"
  | "add_progress_result"
  | "edit_progress_result"
  | "export_accounting"
  | "mark_payout_paid"
  | "add_cost_item"
  | "edit_cost_item"
  | "resolve_deletion_request"
  | "belt_promotion";

export type AuditTargetType =
  | "user"
  | "booking"
  | "payment"
  | "payout"
  | "export"
  | "availability"
  | "progress"
  | "cost"
  | "deletion_request"
  | "promotion";

export interface AuditLog {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  notes?: string;
  deviceInfo?: string;
}

// Deletion Request Types
export type DeletionRequestType = "delete_account" | "delete_chat" | "delete_all";
export type DeletionRequestStatus = "open" | "in_progress" | "completed" | "rejected";

export interface DeletionRequest {
  id: string;
  timestamp: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  requestType: DeletionRequestType;
  status: DeletionRequestStatus;
  handledBy?: string;
  handledByName?: string;
  handledAt?: string;
  notes?: string;
}

// Tenant (Academy) for multi-tenant RBAC
export interface TenantFeatureFlags {
  payments?: boolean;
  billing?: boolean;
  coachPayouts?: boolean;
  memberships?: boolean;
  financialDashboard?: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  whatsappPhone?: string; // E.164 format (e.g., +5511999999999)
  googleReviewUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  /** "ngo" for ONG/social project schools, undefined/null for standard academies */
  organizationType?: string;
  featureFlags?: TenantFeatureFlags;
}

// Review Request for tracking Google Review prompts
export type ReviewRequestStatus = "pending" | "shown" | "clicked" | "dismissed";

export interface ReviewRequest {
  id: string;
  tenantId: string;
  classId: string; // bookingId
  studentId: string;
  status: ReviewRequestStatus;
  shownAt?: string;
  clickedAt?: string;
  dismissedAt?: string;
  createdAt: string;
}

// Analytics Events for WhatsApp and Review tracking
export type AnalyticsEventType =
  | "whatsapp_click"
  | "review_prompt_shown"
  | "review_click"
  | "review_dismiss";

export interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  tenantId: string;
  userId: string;
  userRole: UserRole;
  classId?: string;
  targetType?: "academy" | "coach" | "student";
  timestamp: string;
  metadata?: Record<string, string>;
}

// Invite Codes for academy invitations
export interface InviteCode {
  id: string;
  code: string;
  academyId: string;
  role: InviteCodeRole;
  active: boolean;
  createdAt: string;
  createdBy: string;
  expiresAt?: string;
  usedCount: number; // Track how many times the code has been used
  lastUsedAt?: string; // Track when the code was last used
  maxUses?: number; // limit usage count
}

// Academy Post for Academy News Feed
export interface SchoolPost {
  id: string;
  academyId: string;
  authorId: string;
  authorName: string;
  role: UserRole;
  text: string;
  imageUrl?: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  likedBy: string[]; // array of user IDs who liked
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  role: UserRole;
  text: string;
  createdAt: string;
}

// Academy Schedule Overview
export interface AcademySchedule {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  classes: {
    time: string;
    type: ClassType;
    level: ClassLevel;
    instructor: string;
  }[];
}

// Assignment Request for coach assignment workflow
export type AssignmentRequestStatus = "open" | "accepted" | "rejected" | "cancelled";

export interface AssignmentRequest {
  id: string;
  academyId: string;
  bookingId: string;
  studentId: string;
  requestedCoachId?: string; // Optional: specific coach requested
  status: AssignmentRequestStatus;
  createdBy: string; // Manager who created the request
  createdAt: string;
  acceptedBy?: string; // Coach who accepted
  acceptedAt?: string;
}

// Belt colors for display
export const BELT_COLORS: Record<BeltRank, string> = {
  white: "#FFFFFF",
  blue: "#1E40AF",
  purple: "#7C3AED",
  brown: "#8B4513",
  black: "#1A1A1A",
};

// Backward compatibility aliases
export type SurfExperience = BJJExperience;
export type Stance = "regular" | "goofy" | "not_sure";
export type LessonType = ClassType;
export type LessonLevel = ClassLevel;

// Backward compatibility - WindForecast (can be removed later)
export interface WindForecast {
  windSpeed: number;
  windDirection: string;
  windGust: number;
  tideStatus: string;
  timestamp: string;
  location?: string;
}
