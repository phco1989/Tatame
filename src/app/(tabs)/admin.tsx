import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { BeltBadge, type BeltRank } from "@/components/BeltBadge";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  Users,
  Settings,
  Plus,
  RefreshCw,
  Ticket,
  Calendar,
  BarChart3,
  Copy,
  Check,
  UserPlus,
  X,
  BookOpen,
  Pencil,
  Trash2,
  FileText,
  Trophy,
  Link,
  MapPin,
  Clock,
} from "lucide-react-native";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  updateDoc,
  setDoc,
  orderBy,
  Timestamp,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

import { db, auth, waitForAuthReady } from "@/lib/firebase-config";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { useTranslations } from "@/lib/i18n";
import { useLanguageStore } from "@/lib/i18n/language-store";
import { useTenantStore, selectIsPro, selectHasFinanceAccess } from "@/lib/state/tenant-store";
import { showProRequiredAlert, showStudentLimitAlert, showClassLimitAlert, FREE_STUDENT_LIMIT, canAddStudent, canAddClass } from "@/lib/premiumAccess";
import * as Clipboard from "expo-clipboard";
import DateTimePicker from "@react-native-community/datetimepicker";

// --------------------
// Types
// --------------------
type UserRole = "manager" | "coach" | "student" | string;
type TabSection = "staff" | "branding" | "payments" | "invites" | "reports" | "classes" | "competitions";

type PaymentMethodType = "pix" | "venmo" | "zelle" | "cash" | "other";

type PaymentMethod = {
  id: string;
  type: PaymentMethodType;
  label?: string;
  details: string;
  active: boolean;
  updatedAt?: Date;
};

type StaffMember = {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  status?: "active" | "inactive";
  beltRank?: string;
  stripes?: number;
};

type Invite = {
  id: string;
  code: string;
  role: string;
  active: boolean;
  usedCount: number;
  createdAt?: Date;
  createdBy?: string;
};

type Booking = {
  id: string;
  studentName?: string;
  studentId?: string;
  date?: string;
  time?: string;
  status?: string;
  coachId?: string;
  coachName?: string;
  price?: number;
  totalPrice?: number;
  createdAt?: Date;
  schoolId?: string;
};

type ClassLevel = "fundamentals" | "intermediate" | "advanced" | "all_levels";

type Lesson = {
  id: string;
  schoolId: string;
  startsAt: Date;
  endsAt: Date;
  level: ClassLevel;
  coachId?: string;
  createdBy: string;
  createdAt: Date;
};

type Competition = {
  id: string;
  schoolId: string;
  title: string;
  location: string;
  eventDate: Date;
  signupDeadline: Date;
  signupLink: string;
  notes: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
};

type CompetitionParticipant = {
  id: string;
  competitionId: string;
  schoolId: string;
  userId: string;
  userName: string;
  belt: string;
  confirmedAt: Date;
};

// --------------------
// Helpers
// --------------------
function normalizePaymentMethod(m: any): PaymentMethod {
  const updatedAt =
    m?.updatedAt instanceof Timestamp
      ? m.updatedAt.toDate()
      : m?.updatedAt instanceof Date
      ? m.updatedAt
      : undefined;

  return {
    id: String(m?.id ?? ""),
    type: (m?.type as PaymentMethodType) ?? "other",
    label: m?.label ? String(m.label) : undefined,
    details: String(m?.details ?? ""),
    active: Boolean(m?.active ?? true),
    updatedAt,
  };
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function normalizeInvite(docId: string, data: any): Invite {
  const createdAt =
    data?.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : data?.createdAt instanceof Date
      ? data.createdAt
      : undefined;

  return {
    id: docId,
    code: data?.code ?? docId,
    role: data?.role ?? "student",
    active: data?.active ?? true,
    usedCount: data?.usedCount ?? 0,
    createdAt,
    createdBy: data?.createdBy,
  };
}

function normalizeBooking(docId: string, data: any): Booking {
  const createdAt =
    data?.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : data?.createdAt instanceof Date
      ? data.createdAt
      : undefined;

  return {
    id: docId,
    studentName: data?.studentName ?? data?.userName ?? "Unknown",
    studentId: data?.studentId ?? data?.userId,
    date: data?.date,
    time: data?.time ?? data?.startTime,
    status: data?.status ?? "pending",
    coachId: data?.coachId,
    coachName: data?.coachName,
    price: data?.price ?? data?.totalPrice ?? 0,
    totalPrice: data?.totalPrice ?? data?.price ?? 0,
    createdAt,
    schoolId: data?.schoolId,
  };
}

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date();
}

function normalizeLesson(docId: string, data: any): Lesson {
  return {
    id: docId,
    schoolId: data?.schoolId ?? "",
    startsAt: toDate(data?.startsAt),
    endsAt: toDate(data?.endsAt),
    level: (data?.level as ClassLevel) ?? "all_levels",
    coachId: data?.coachId,
    createdBy: data?.createdBy ?? "",
    createdAt: toDate(data?.createdAt),
  };
}

function normalizeCompetition(docId: string, data: any): Competition {
  return {
    id: docId,
    schoolId: data?.schoolId ?? "",
    title: data?.title ?? "",
    location: data?.location ?? "",
    eventDate: toDate(data?.eventDate),
    signupDeadline: toDate(data?.signupDeadline),
    signupLink: data?.signupLink ?? "",
    notes: data?.notes ?? "",
    createdBy: data?.createdBy ?? "",
    createdAt: toDate(data?.createdAt),
    updatedAt: toDate(data?.updatedAt),
    isArchived: data?.isArchived ?? false,
  };
}

export default function AdminScreen() {
  const tr = useTranslations();
  useLanguageStore((s) => s.locale);

  const router = useRouter();
  const isPro = useTenantStore(selectIsPro);
  const hasFinance = useTenantStore(selectHasFinanceAccess);

  // Auth + Role
  const { role, schoolId: schoolIdFromHook, loading: roleLoading } = useUserRole();

  // Get UID from Firebase auth
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    waitForAuthReady().then(() => {
      setUid(auth.currentUser?.uid ?? null);
    });
  }, []);

  // --------------------
  // SchoolId Bootstrap
  // --------------------
  const [schoolIdFromDoc, setSchoolIdFromDoc] = useState<string | null>(null);
  const [schoolIdLoading, setSchoolIdLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setSchoolIdLoading(false);
      setSchoolIdFromDoc(null);
      return;
    }

    setSchoolIdLoading(true);
    const ref = doc(db, "users", uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data: any = snap.data();
        setSchoolIdFromDoc(data?.schoolId ?? null);
        setSchoolIdLoading(false);
      },
      (err) => {
        console.log("[Admin] users/{uid} watch error:", err);
        setSchoolIdFromDoc(null);
        setSchoolIdLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  // ONLY trust users/{uid}.schoolId
  const effectiveSchoolId = useMemo(() => schoolIdFromDoc, [schoolIdFromDoc]);

  const hasFirebaseStaffAccess = role === "manager";
  const [isGuardChecking, setIsGuardChecking] = useState(true);

  // Sections state - now 6 tabs
  const [activeSection, setActiveSection] = useState<TabSection>("staff");

  // Branding state
  const [brandingPrimaryColor, setBrandingPrimaryColor] = useState("#0070B8");
  const [brandingLogoUrl, setBrandingLogoUrl] = useState("");
  const [brandingWebsite, setBrandingWebsite] = useState("");
  const [brandingGoogleReview, setBrandingGoogleReview] = useState("");
  const [brandingInstagram, setBrandingInstagram] = useState("");
  const [brandingFacebook, setBrandingFacebook] = useState("");
  const [waiverText, setWaiverText] = useState("");

  // Staff state
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  // Payments state
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Invites state
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesList, setInvitesList] = useState<Invite[]>([]);
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [newInviteRole, setNewInviteRole] = useState<"coach" | "student" | "manager">("student");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Bookings state
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsList, setBookingsList] = useState<Booking[]>([]);
  const [showAssignCoach, setShowAssignCoach] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [coachesList, setCoachesList] = useState<StaffMember[]>([]);

  // Reports state
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportData, setReportData] = useState({
    totalBookings: 0,
    confirmedBookings: 0,
    totalRevenue: 0,
  });
  // Financial dashboard state
  const [finPeriod, setFinPeriod] = useState<"month" | "all">("month");
  const [finLoading, setFinLoading] = useState(false);
  const [finData, setFinData] = useState({
    totalRevenue: 0,
    outstanding: 0,
    paidInvoices: 0,
    pendingPayouts: 0,
    paidPayouts: 0,
    recentInvoices: [] as Array<{ id: string; amount: number; currency: string; status: string; studentName: string; createdAt: Timestamp | null }>,
    recentPayouts: [] as Array<{ id: string; amount: number; currency: string; status: string; coachName: string; period: string }>,
  });

  // Classes (lessons) state
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsList, setLessonsList] = useState<Lesson[]>([]);
  const [showCreateLesson, setShowCreateLesson] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [newLessonLevel, setNewLessonLevel] = useState<ClassLevel>("fundamentals");
  const [newLessonStartsAt, setNewLessonStartsAt] = useState<Date>(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d;
  });
  const [newLessonEndsAt, setNewLessonEndsAt] = useState<Date>(() => {
    const d = new Date(); d.setHours(d.getHours() + 2, 0, 0, 0); return d;
  });
  const [showLessonStartPicker, setShowLessonStartPicker] = useState<"date" | "time" | null>(null);
  const [showLessonEndPicker, setShowLessonEndPicker] = useState<"date" | "time" | null>(null);
  const [creatingLesson, setCreatingLesson] = useState(false);

  // Competitions state
  const [competitionsLoading, setCompetitionsLoading] = useState(false);
  const [competitionsList, setCompetitionsList] = useState<Competition[]>([]);
  const [showCreateCompetition, setShowCreateCompetition] = useState(false);
  const [editingCompetitionId, setEditingCompetitionId] = useState<string | null>(null);
  const [savingCompetition, setSavingCompetition] = useState(false);
  const [compTitle, setCompTitle] = useState("");
  const [compLocation, setCompLocation] = useState("");
  const [compEventDate, setCompEventDate] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 30); d.setHours(9, 0, 0, 0); return d; });
  const [compSignupDeadline, setCompSignupDeadline] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 20); d.setHours(23, 59, 0, 0); return d; });
  const [compSignupLink, setCompSignupLink] = useState("");
  const [compNotes, setCompNotes] = useState("");
  const [showCompEventDatePicker, setShowCompEventDatePicker] = useState<"date" | "time" | null>(null);
  const [showCompDeadlinePicker, setShowCompDeadlinePicker] = useState<"date" | "time" | null>(null);
  const [competitionParticipants, setCompetitionParticipants] = useState<Record<string, CompetitionParticipant[]>>({});

  // Belt edit state (manager-only)
  const [beltEditMember, setBeltEditMember] = useState<StaffMember | null>(null);
  const [beltEditRank, setBeltEditRank] = useState<BeltRank>("white");
  const [beltEditStripes, setBeltEditStripes] = useState(0);
  const [beltEditSaving, setBeltEditSaving] = useState(false);

  const BELT_OPTIONS: BeltRank[] = ["white", "blue", "purple", "brown", "black"];

  const openBeltEdit = (member: StaffMember) => {
    // Belt promotion gate: Pro only
    if (!isPro) {
      showProRequiredAlert(router, "Belt Promotions");
      return;
    }
    setBeltEditMember(member);
    const rank = member.beltRank as BeltRank;
    setBeltEditRank(BELT_OPTIONS.includes(rank) ? rank : "white");
    setBeltEditStripes(member.stripes ?? 0);
  };

  const saveBeltEdit = async () => {
    if (!beltEditMember || !effectiveSchoolId) return;
    setBeltEditSaving(true);
    try {
      await updateDoc(doc(db, "users", beltEditMember.id), {
        beltRank: beltEditRank,
        stripes: beltEditStripes,
        beltUpdatedAt: serverTimestamp(),
      });
      // Update local state immediately for instant feedback
      setStaffList((prev) =>
        prev.map((m) =>
          m.id === beltEditMember.id
            ? { ...m, beltRank: beltEditRank, stripes: beltEditStripes }
            : m
        )
      );
      setBeltEditMember(null);
    } catch (err) {
      console.error("[Admin] Belt update error:", err);
      Alert.alert("Error", "Could not update belt. Please try again.");
    } finally {
      setBeltEditSaving(false);
    }
  };

  // --------------------
  // Guard
  // --------------------
  useEffect(() => {
    if (roleLoading || schoolIdLoading) return;

    if (!effectiveSchoolId) {
      setIsGuardChecking(false);
      return;
    }

    if (!hasFirebaseStaffAccess) {
      router.replace("/(tabs)");
      return;
    }

    setIsGuardChecking(false);
  }, [roleLoading, schoolIdLoading, effectiveSchoolId, hasFirebaseStaffAccess, router]);

  // --------------------
  // Fetchers
  // --------------------
  const fetchBranding = useCallback(async () => {
    if (!effectiveSchoolId || role !== "manager") return;

    try {
      const schoolRef = doc(db, "schools", effectiveSchoolId);
      const snap = await getDoc(schoolRef);
      if (!snap.exists()) return;

      const data: any = snap.data();

      if (data.branding) {
        setBrandingPrimaryColor(data.branding.primaryColor || "#0070B8");
        setBrandingLogoUrl(data.branding.logoUrl || "");
        setBrandingWebsite(data.branding.website || "");
        setBrandingGoogleReview(data.branding.googleReview || "");
        setBrandingInstagram(data.branding.instagram || "");
        setBrandingFacebook(data.branding.facebook || "");
      }
      if (typeof data.waiverText === "string") {
        setWaiverText(data.waiverText);
      }
    } catch (error) {
      console.log("[Admin] Error fetching branding:", error);
    }
  }, [effectiveSchoolId, role]);

  const fetchStaff = useCallback(async () => {
    if (!effectiveSchoolId || role !== "manager") return;

    setStaffLoading(true);
    try {
      // Query users by schoolId first (primary filter), then filter by role client-side
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("schoolId", "==", effectiveSchoolId)
      );
      const snapshot = await getDocs(q);

      const allSchoolUsers: StaffMember[] = [];
      snapshot.forEach((docSnap) => {
        const data: any = docSnap.data();
        allSchoolUsers.push({
          id: docSnap.id,
          name: data.displayName || data.name || data.email || "Unknown",
          role: data.role as UserRole,
          email: data.email || "",
          status: data.status === "inactive" ? "inactive" : "active",
          beltRank: data.beltRank || "white",
          stripes: typeof data.stripes === "number" ? data.stripes : 0,
        });
      });

      // Filter client-side: staffList shows coaches and students, coachesList shows only coaches
      const staffMembers = allSchoolUsers.filter(
        (u) => u.role === "coach" || u.role === "student"
      );
      const coaches = allSchoolUsers.filter(
        (u) => u.role === "coach" && u.status !== "inactive"
      );

      setStaffList(staffMembers);
      setCoachesList(coaches);
    } catch (error: any) {
      console.error("[Admin] Error fetching staff:", error);
    } finally {
      setStaffLoading(false);
    }
  }, [effectiveSchoolId, role]);

  const fetchPaymentMethods = useCallback(async () => {
    if (!effectiveSchoolId || role !== "manager") return;

    setPaymentLoading(true);
    try {
      const schoolRef = doc(db, "schools", effectiveSchoolId);
      const snap = await getDoc(schoolRef);
      if (!snap.exists()) return;

      const data: any = snap.data();
      if (Array.isArray(data.paymentMethods)) {
        setPaymentMethods(data.paymentMethods.map(normalizePaymentMethod));
      } else {
        setPaymentMethods([]);
      }
    } catch (error) {
      console.log("[Admin] Error fetching payment methods:", error);
    } finally {
      setPaymentLoading(false);
    }
  }, [effectiveSchoolId, role]);

  const fetchInvites = useCallback(async () => {
    if (!effectiveSchoolId || role !== "manager") return;

    setInvitesLoading(true);
    try {
      const invitesRef = collection(db, "school_invites");
      // Try with orderBy first, fallback without
      let q;
      try {
        q = query(
          invitesRef,
          where("schoolId", "==", effectiveSchoolId),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const fetchedInvites: Invite[] = [];
        snapshot.forEach((docSnap) => {
          fetchedInvites.push(normalizeInvite(docSnap.id, docSnap.data()));
        });
        setInvitesList(fetchedInvites);
      } catch (orderError) {
        // Fallback without ordering
        q = query(invitesRef, where("schoolId", "==", effectiveSchoolId));
        const snapshot = await getDocs(q);
        const fetchedInvites: Invite[] = [];
        snapshot.forEach((docSnap) => {
          fetchedInvites.push(normalizeInvite(docSnap.id, docSnap.data()));
        });
        // Sort locally
        fetchedInvites.sort((a, b) => {
          if (!a.createdAt && !b.createdAt) return 0;
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
        setInvitesList(fetchedInvites);
      }
    } catch (error: any) {
      console.log("[Admin] Error fetching invites:", error);
      setInvitesList([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [effectiveSchoolId, role]);

  const fetchBookings = useCallback(async () => {
    if (!effectiveSchoolId || role !== "manager") return;

    setBookingsLoading(true);
    try {
      const bookingsRef = collection(db, "bookings");
      let q;
      try {
        q = query(
          bookingsRef,
          where("schoolId", "==", effectiveSchoolId),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const fetchedBookings: Booking[] = [];
        snapshot.forEach((docSnap) => {
          fetchedBookings.push(normalizeBooking(docSnap.id, docSnap.data()));
        });
        setBookingsList(fetchedBookings);
      } catch (orderError) {
        // Fallback without ordering
        q = query(bookingsRef, where("schoolId", "==", effectiveSchoolId));
        const snapshot = await getDocs(q);
        const fetchedBookings: Booking[] = [];
        snapshot.forEach((docSnap) => {
          fetchedBookings.push(normalizeBooking(docSnap.id, docSnap.data()));
        });
        // Sort locally
        fetchedBookings.sort((a, b) => {
          if (!a.createdAt && !b.createdAt) return 0;
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
        setBookingsList(fetchedBookings);
      }
    } catch (error: any) {
      console.log("[Admin] Error fetching bookings:", error);
      setBookingsList([]);
    } finally {
      setBookingsLoading(false);
    }
  }, [effectiveSchoolId, role]);

  const computeReports = useCallback(() => {
    setReportsLoading(true);
    const totalBookings = bookingsList.length;
    const confirmedBookings = bookingsList.filter(
      (b) => b.status === "confirmed" || b.status === "completed"
    ).length;
    const totalRevenue = bookingsList.reduce((sum, b) => {
      const price = b.totalPrice ?? b.price ?? 0;
      return sum + price;
    }, 0);

    setReportData({ totalBookings, confirmedBookings, totalRevenue });
    setReportsLoading(false);
  }, [bookingsList]);

  const fetchFinancialData = useCallback(async (period: "month" | "all") => {
    if (!effectiveSchoolId) return;
    setFinLoading(true);
    try {
      const now = new Date();
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Fetch invoices
      const invoiceSnap = await getDocs(
        query(collection(db, "schools", effectiveSchoolId, "invoices"), orderBy("createdAt", "desc"))
      );
      const allInvoices = invoiceSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

      const filteredInvoices = period === "month"
        ? allInvoices.filter((inv: any) => {
            const ts = inv.createdAt?.toDate?.();
            return ts && ts >= monthStart;
          })
        : allInvoices;

      const totalRevenue = filteredInvoices
        .filter((inv: any) => inv.status === "paid")
        .reduce((sum: number, inv: any) => sum + (inv.amount ?? 0), 0);

      const outstanding = filteredInvoices
        .filter((inv: any) => ["due", "pending_review", "overdue"].includes(inv.status))
        .reduce((sum: number, inv: any) => sum + (inv.amount ?? 0), 0);

      const paidInvoices = filteredInvoices.filter((inv: any) => inv.status === "paid").length;

      // Fetch student names for recent invoices
      const recentRaw = allInvoices.slice(0, 5);
      const studentUids = [...new Set(recentRaw.map((i: any) => i.studentUid))];
      const studentNames: Record<string, string> = {};
      await Promise.all(
        (studentUids as string[]).map(async (u) => {
          try {
            const us = await getDoc(doc(db, "users", u));
            if (us.exists()) {
              const d = us.data();
              studentNames[u] = d.displayName ?? d.name ?? d.email ?? "Unknown";
            }
          } catch { /* ignore */ }
        })
      );
      const recentInvoices = recentRaw.map((inv: any) => ({
        id: inv.id,
        amount: inv.amount ?? 0,
        currency: inv.currency ?? "USD",
        status: inv.status ?? "due",
        studentName: studentNames[inv.studentUid] ?? "Unknown",
        createdAt: inv.createdAt ?? null,
      }));

      // Fetch payouts
      const payoutSnap = await getDocs(
        query(collection(db, "schools", effectiveSchoolId, "coach_payouts"), orderBy("createdAt", "desc"))
      );
      const allPayouts = payoutSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

      const filteredPayouts = period === "month"
        ? allPayouts.filter((p: any) => p.period === currentPeriod)
        : allPayouts;

      const pendingPayouts = filteredPayouts
        .filter((p: any) => p.status === "pending")
        .reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);

      const paidPayouts = filteredPayouts
        .filter((p: any) => p.status === "paid")
        .reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);

      // Fetch coach names for recent payouts
      const recentPayoutsRaw = allPayouts.slice(0, 5);
      const coachUids = [...new Set(recentPayoutsRaw.map((p: any) => p.coachUid))];
      const coachNames: Record<string, string> = {};
      await Promise.all(
        (coachUids as string[]).map(async (u) => {
          try {
            const us = await getDoc(doc(db, "users", u));
            if (us.exists()) {
              const d = us.data();
              coachNames[u] = d.displayName ?? d.name ?? d.email ?? "Unknown";
            }
          } catch { /* ignore */ }
        })
      );
      const recentPayouts = recentPayoutsRaw.map((p: any) => ({
        id: p.id,
        amount: p.amount ?? 0,
        currency: p.currency ?? "USD",
        status: p.status ?? "pending",
        coachName: coachNames[p.coachUid] ?? "Unknown",
        period: p.period ?? "",
      }));

      setFinData({ totalRevenue, outstanding, paidInvoices, pendingPayouts, paidPayouts, recentInvoices, recentPayouts });
    } catch (e) {
      console.error("[Reports] fetchFinancialData error", e);
    } finally {
      setFinLoading(false);
    }
  }, [effectiveSchoolId]);

  const fetchLessons = useCallback(() => {
    if (!effectiveSchoolId || role !== "manager") return () => {};
    setLessonsLoading(true);
    let q;
    try {
      q = query(
        collection(db, "lessons"),
        where("schoolId", "==", effectiveSchoolId),
        orderBy("startsAt", "asc")
      );
    } catch {
      q = query(collection(db, "lessons"), where("schoolId", "==", effectiveSchoolId));
    }
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Lesson[] = [];
        snap.forEach((d) => list.push(normalizeLesson(d.id, d.data())));
        list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        setLessonsList(list);
        setLessonsLoading(false);
      },
      (e) => {
        console.log("[Admin] fetchLessons snapshot error:", e);
        setLessonsList([]);
        setLessonsLoading(false);
      }
    );
    return unsub;
  }, [effectiveSchoolId, role]);

  const fetchCompetitions = useCallback(() => {
    if (!effectiveSchoolId || role !== "manager") return () => {};
    setCompetitionsLoading(true);
    const q = query(
      collection(db, "competitions"),
      where("schoolId", "==", effectiveSchoolId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Competition[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data?.isArchived !== true) {
            list.push(normalizeCompetition(d.id, data));
          }
        });
        list.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
        setCompetitionsList(list);
        setCompetitionsLoading(false);
        // Fetch participants for each competition
        list.forEach((comp) => {
          getDocs(query(collection(db, "competitionParticipants"), where("competitionId", "==", comp.id)))
            .then((pSnap) => {
              const participants: CompetitionParticipant[] = [];
              pSnap.forEach((pd) => {
                const pdata = pd.data();
                participants.push({
                  id: pd.id,
                  competitionId: pdata.competitionId ?? comp.id,
                  schoolId: pdata.schoolId ?? "",
                  userId: pdata.userId ?? "",
                  userName: pdata.userName ?? "",
                  belt: pdata.belt ?? "",
                  confirmedAt: toDate(pdata.confirmedAt),
                });
              });
              setCompetitionParticipants((prev) => ({ ...prev, [comp.id]: participants }));
            })
            .catch(() => {});
        });
      },
      (e) => {
        console.log("[Admin] fetchCompetitions snapshot error:", e);
        setCompetitionsList([]);
        setCompetitionsLoading(false);
      }
    );
    return unsub;
  }, [effectiveSchoolId, role]);

  const openCreateCompetition = () => {
    setEditingCompetitionId(null);
    setCompTitle("");
    setCompLocation("");
    const ed = new Date(); ed.setDate(ed.getDate() + 30); ed.setHours(9, 0, 0, 0);
    setCompEventDate(ed);
    const sd = new Date(); sd.setDate(sd.getDate() + 20); sd.setHours(23, 59, 0, 0);
    setCompSignupDeadline(sd);
    setCompSignupLink("");
    setCompNotes("");
    setShowCreateCompetition(true);
  };

  const openEditCompetition = (comp: Competition) => {
    setEditingCompetitionId(comp.id);
    setCompTitle(comp.title);
    setCompLocation(comp.location);
    setCompEventDate(comp.eventDate);
    setCompSignupDeadline(comp.signupDeadline);
    setCompSignupLink(comp.signupLink);
    setCompNotes(comp.notes);
    setShowCreateCompetition(true);
  };

  const saveCompetition = async () => {
    if (!effectiveSchoolId || !uid) return;
    if (!compTitle.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }
    setSavingCompetition(true);
    try {
      await waitForAuthReady();
      const payload: any = {
        schoolId: effectiveSchoolId,
        title: compTitle.trim(),
        location: compLocation.trim(),
        eventDate: compEventDate,
        signupDeadline: compSignupDeadline,
        signupLink: compSignupLink.trim(),
        notes: compNotes.trim(),
        isArchived: false,
        updatedAt: serverTimestamp(),
      };
      if (editingCompetitionId) {
        await updateDoc(doc(db, "competitions", editingCompetitionId), payload);
      } else {
        await addDoc(collection(db, "competitions"), {
          ...payload,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
      }
      setShowCreateCompetition(false);
      setEditingCompetitionId(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save competition.");
    } finally {
      setSavingCompetition(false);
    }
  };

  const deleteCompetition = (competitionId: string) => {
    Alert.alert(
      "Delete Competition",
      "Are you sure you want to delete this competition? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "competitions", competitionId), { isArchived: true, updatedAt: serverTimestamp() });
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete competition.");
            }
          },
        },
      ]
    );
  };

  const handleEditLesson = (lesson: Lesson) => {    setEditingLessonId(lesson.id);
    setNewLessonLevel(lesson.level);
    setNewLessonStartsAt(lesson.startsAt);
    setNewLessonEndsAt(lesson.endsAt);
    setShowCreateLesson(true);
  };

  const handleDeleteLesson = (lessonId: string) => {
    Alert.alert(
      "Delete Class",
      "Are you sure you want to delete this class? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "lessons", lessonId));
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete class.");
            }
          },
        },
      ]
    );
  };

  const saveLesson = async () => {
    if (!effectiveSchoolId || !uid) {
      console.warn("[Admin] saveLesson: missing effectiveSchoolId or uid", { effectiveSchoolId, uid });
      return;
    }

    // Class limit gate: free users can only create up to FREE_CLASS_LIMIT classes
    if (!editingLessonId && !canAddClass(lessonsList.length, isPro)) {
      showClassLimitAlert(router);
      return;
    }

    if (newLessonEndsAt <= newLessonStartsAt) {
      Alert.alert("Invalid time", "End time must be after start time.");
      return;
    }
    setCreatingLesson(true);
    const payload = {
      schoolId: effectiveSchoolId,
      startsAt: newLessonStartsAt,
      endsAt: newLessonEndsAt,
      level: newLessonLevel,
    };
    console.log("[Admin] saveLesson: submit start", { editingLessonId, payload, uid });
    try {
      await waitForAuthReady();
      if (editingLessonId) {
        await updateDoc(doc(db, "lessons", editingLessonId), payload);
        console.log("[Admin] saveLesson: updated lesson", editingLessonId);
      } else {
        const docRef = await addDoc(collection(db, "lessons"), {
          ...payload,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        console.log("[Admin] saveLesson: created lesson", docRef.id);
      }
      setShowCreateLesson(false);
      setEditingLessonId(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.error("[Admin] saveLesson: write failure", e);
      Alert.alert("Error", e?.message ?? "Failed to save class.");
    } finally {
      setCreatingLesson(false);
    }
  };

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchBranding(),
      fetchStaff(),
      fetchPaymentMethods(),
      fetchInvites(),
      fetchBookings(),
    ]);
  }, [fetchBranding, fetchStaff, fetchPaymentMethods, fetchInvites, fetchBookings]);

  useEffect(() => {
    if (isGuardChecking) return;
    if (!effectiveSchoolId) return;
    refreshAll();
  }, [isGuardChecking, effectiveSchoolId, refreshAll]);

  // Live lessons subscription — separate from refreshAll
  useEffect(() => {
    if (isGuardChecking) return;
    if (!effectiveSchoolId || role !== "manager") return;
    const unsub = fetchLessons();
    return () => unsub();
  }, [isGuardChecking, effectiveSchoolId, role, fetchLessons]);

  // Live competitions subscription
  useEffect(() => {
    if (isGuardChecking) return;
    if (!effectiveSchoolId || role !== "manager") return;
    const unsub = fetchCompetitions();
    return () => unsub();
  }, [isGuardChecking, effectiveSchoolId, role, fetchCompetitions]);

  useEffect(() => {
    if (activeSection === "reports" && hasFinance && bookingsList.length >= 0) {
      computeReports();
      fetchFinancialData(finPeriod);
    }
  }, [activeSection, hasFinance, bookingsList, computeReports, fetchFinancialData, finPeriod]);

  // --------------------
  // Mutations
  // --------------------
  const savePaymentMethods = async (next: PaymentMethod[]) => {
    if (!effectiveSchoolId) return;

    try {
      const schoolRef = doc(db, "schools", effectiveSchoolId);
      const payload = next.map((m) => ({ ...m, updatedAt: new Date() }));
      await updateDoc(schoolRef, { paymentMethods: payload });
      setPaymentMethods(next);
      Alert.alert("Saved", "Payment methods updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save payment methods.");
    }
  };

  const saveBranding = async () => {
    if (!effectiveSchoolId) return;

    try {
      const schoolRef = doc(db, "schools", effectiveSchoolId);
      await updateDoc(schoolRef, {
        branding: {
          primaryColor: brandingPrimaryColor,
          logoUrl: brandingLogoUrl,
          website: brandingWebsite,
          googleReview: brandingGoogleReview,
          instagram: brandingInstagram,
          facebook: brandingFacebook,
        },
        waiverText,
      });
      Alert.alert("Saved", "Branding updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save branding.");
    }
  };

  const createInvite = async () => {
    if (!effectiveSchoolId || !uid) return;

    // Student limit gate: free users can only have up to FREE_STUDENT_LIMIT students
    if (newInviteRole === "student" && !isPro) {
      const studentCount = staffList.filter((m) => m.role === "student").length;
      if (!canAddStudent(studentCount, false)) {
        showStudentLimitAlert(router);
        return;
      }
    }

    const code = generateInviteCode();
    try {
      const inviteRef = doc(db, "school_invites", code);
      await setDoc(inviteRef, {
        active: true,
        code: code,
        createdAt: serverTimestamp(),
        createdBy: uid,
        role: newInviteRole,
        schoolId: effectiveSchoolId,
        usedCount: 0,
      });
      setCreatedCode(code);
      setShowCreateInvite(false);
      fetchInvites();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create invite.");
    }
  };

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const assignCoach = async (coach: StaffMember) => {
    if (!selectedBooking) return;

    // Explicit role check - only managers can assign coaches
    if (role !== "manager") {
      Alert.alert("Access Denied", "Only managers can assign coaches to bookings.");
      return;
    }

    try {
      const bookingRef = doc(db, "bookings", selectedBooking.id);
      await updateDoc(bookingRef, {
        coachId: coach.id,
        coachName: coach.name,
        status: "confirmed",
        updatedAt: serverTimestamp(),
      });
      setShowAssignCoach(false);
      setSelectedBooking(null);
      fetchBookings();
      Alert.alert("Success", `Coach ${coach.name} assigned.`);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to assign coach.");
    }
  };

  // --------------------
  // Tab Button Component
  // --------------------
  const TabButton = ({
    id,
    label,
    icon,
  }: {
    id: TabSection;
    label: string;
    icon: React.ReactNode;
  }) => (
    <Pressable
      onPress={() => {
        if (id === "reports" && !isPro) {
          showProRequiredAlert(router, "Reports");
          return;
        }
        setActiveSection(id);
      }}
      style={{
        width: 64,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: activeSection === id ? "rgba(255,255,255,0.15)" : "transparent",
        alignItems: "center",
      }}
    >
      <View style={{ marginBottom: 2 }}>{icon}</View>
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: activeSection === id ? "#FBBF24" : "rgba(255,255,255,0.9)",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );

  // --------------------
  // UI
  // --------------------
  if (roleLoading || schoolIdLoading || isGuardChecking) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#FBBF24" size="large" />
          <Text style={{ marginTop: 12, color: "white", fontSize: 16 }}>{tr.admin.checkingAccess}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!effectiveSchoolId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
        <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
          <View
            style={{
              backgroundColor: "rgba(8,145,178,0.1)",
              borderRadius: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: "rgba(8,145,178,0.3)",
            }}
          >
            <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>
              {tr.admin.noSchool}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 10, lineHeight: 22 }}>
              Your account is missing a schoolId. Make sure users/{"{uid}"}.schoolId is set in
              Firestore.
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.5)", marginTop: 12, fontSize: 13 }}>
              UID: {uid || "—"}
            </Text>
            <Pressable
              onPress={() => router.replace("/(tabs)")}
              style={{
                marginTop: 20,
                backgroundColor: "#FBBF24",
                paddingVertical: 14,
                borderRadius: 16,
              }}
            >
              <Text style={{ color: "#0B1220", textAlign: "center", fontWeight: "700", fontSize: 16 }}>
                {tr.admin.goBack}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // NoAccess: if role is not manager, show access denied and do not query Firestore
  if (role !== "manager") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
        <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
          <View
            style={{
              backgroundColor: "rgba(239,68,68,0.1)",
              borderRadius: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: "rgba(239,68,68,0.3)",
            }}
          >
            <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>
              {tr.admin.accessDenied}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 10, lineHeight: 22 }}>
              {tr.admin.accessDeniedBody}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.5)", marginTop: 12, fontSize: 13 }}>
              Role: {role || "none"}
            </Text>
            <Pressable
              onPress={() => router.replace("/(tabs)")}
              style={{
                marginTop: 20,
                backgroundColor: "#FBBF24",
                paddingVertical: 14,
                borderRadius: 16,
              }}
            >
              <Text style={{ color: "#0B1220", textAlign: "center", fontWeight: "700", fontSize: 16 }}>
                {tr.admin.goBack}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
        {/* Header */}
        <LinearGradient
          colors={["#111827", "#1F2937"]}
          style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "500" }}>
                {tr.admin.premium}
              </Text>
              <Text style={{ color: "white", fontSize: 24, fontWeight: "800" }}>{tr.admin.managerPanel}</Text>
            </View>

            <Pressable
              onPress={refreshAll}
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <RefreshCw size={16} color="white" />
              <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>{tr.admin.refresh}</Text>
            </Pressable>
          </View>

          {/* 7 Tabs — horizontal scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 12 }}
            contentContainerStyle={{
              flexDirection: "row",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: 4,
              gap: 2,
            }}
          >
            <TabButton
              id="staff"
              label={tr.admin.team}
              icon={<Users size={16} color={activeSection === "staff" ? "#FBBF24" : "white"} />}
            />
            <TabButton
              id="invites"
              label={tr.admin.invites}
              icon={<Ticket size={16} color={activeSection === "invites" ? "#FBBF24" : "white"} />}
            />
            {hasFinance && (
              <TabButton
                id="reports"
                label={tr.admin.reports}
                icon={<BarChart3 size={16} color={activeSection === "reports" ? "#FBBF24" : "white"} />}
              />
            )}
            <TabButton
              id="branding"
              label={tr.admin.branding}
              icon={<Settings size={16} color={activeSection === "branding" ? "#FBBF24" : "white"} />}
            />
            {hasFinance && (
              <TabButton
                id="payments"
                label={tr.admin.payments}
                icon={<Plus size={16} color={activeSection === "payments" ? "#FBBF24" : "white"} />}
              />
            )}
            <TabButton
              id="classes"
              label={tr.admin.classes}
              icon={<BookOpen size={16} color={activeSection === "classes" ? "#FBBF24" : "white"} />}
            />
            <TabButton
              id="competitions"
              label={tr.admin.events}
              icon={<Trophy size={16} color={activeSection === "competitions" ? "#FBBF24" : "white"} />}
            />
          </ScrollView>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* STAFF TAB */}
          {activeSection === "staff" && (
            <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      backgroundColor: "rgba(6,182,212,0.15)",
                      padding: 8,
                      borderRadius: 10,
                    }}
                  >
                    <Users size={18} color="#06B6D4" />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#FFFFFF" }}>{tr.admin.team}</Text>
                </View>
                <Pressable
                  onPress={fetchStaff}
                  style={{
                    backgroundColor: "#1F2937",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {staffLoading ? (
                    <ActivityIndicator size="small" color="#06B6D4" />
                  ) : (
                    <RefreshCw size={14} color="rgba(255,255,255,0.5)" />
                  )}
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "600", fontSize: 13 }}>{tr.admin.refresh}</Text>
                </Pressable>
              </View>

              <View style={{ marginTop: 16 }}>
                {staffList.length === 0 && !staffLoading ? (
                  <View
                    style={{
                      backgroundColor: "#1F2937",
                      padding: 20,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                  >
                    <Users size={32} color="rgba(255,255,255,0.2)" />
                    <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center" }}>
                      {tr.admin.noTeamMembers}
                    </Text>
                  </View>
                ) : (
                  staffList.map((m) => (
                    <View
                      key={m.id}
                      style={{
                        backgroundColor: "#1F2937",
                        padding: 14,
                        borderRadius: 14,
                        marginBottom: 10,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", color: "#FFFFFF", fontSize: 15 }}>
                          {m.name}
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 }}>
                          {m.email || "—"}
                        </Text>
                        {/* Belt badge */}
                        <View style={{ marginTop: 6 }}>
                          <BeltBadge beltRank={m.beltRank} stripes={m.stripes} size="sm" />
                        </View>
                      </View>
                      <View style={{ flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                          <View
                            style={{
                              backgroundColor: m.role === "coach" ? "rgba(6,182,212,0.15)" : "rgba(167,139,250,0.15)",
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 20,
                            }}
                          >
                            <Text
                              style={{
                                fontWeight: "700",
                                fontSize: 11,
                                color: m.role === "coach" ? "#06B6D4" : "#A78BFA",
                                textTransform: "capitalize",
                              }}
                            >
                              {m.role}
                            </Text>
                          </View>
                          <View
                            style={{
                              backgroundColor: m.status === "inactive" ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)",
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 20,
                            }}
                          >
                            <Text
                              style={{
                                fontWeight: "700",
                                fontSize: 12,
                                color: m.status === "inactive" ? "#EF4444" : "#10B981",
                              }}
                            >
                              {m.status === "inactive" ? tr.admin.inactive : tr.admin.active}
                            </Text>
                          </View>
                        </View>
                        {/* Manager-only belt edit button */}
                        <Pressable
                          onPress={() => openBeltEdit(m)}
                          style={({ pressed }) => ({
                            backgroundColor: pressed ? "#374151" : "#1F2937",
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.08)",
                          })}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.7)" }}>
                            {tr.admin.editBelt}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* INVITES TAB */}
          {activeSection === "invites" && (
            <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ backgroundColor: "rgba(251,191,36,0.15)", padding: 8, borderRadius: 10 }}>
                    <Ticket size={18} color="#FBBF24" />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#FFFFFF" }}>
                    {tr.admin.inviteCodes}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowCreateInvite(true)}
                  style={{
                    backgroundColor: "#FBBF24",
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Plus size={16} color="#0B1220" />
                  <Text style={{ color: "#0B1220", fontWeight: "700", fontSize: 13 }}>{tr.admin.create}</Text>
                </Pressable>
              </View>

              {/* Created code display */}
              {createdCode && (
                <View
                  style={{
                    marginTop: 16,
                    backgroundColor: "rgba(16,185,129,0.15)",
                    padding: 16,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#10B981", fontWeight: "600", marginBottom: 8 }}>
                    {tr.admin.inviteCodeCreated}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: "#FFFFFF", letterSpacing: 4 }}>
                      {createdCode}
                    </Text>
                    <Pressable
                      onPress={() => copyCode(createdCode)}
                      style={{
                        backgroundColor: codeCopied ? "#10B981" : "#FBBF24",
                        padding: 10,
                        borderRadius: 8,
                      }}
                    >
                      {codeCopied ? <Check size={18} color="white" /> : <Copy size={18} color="#0B1220" />}
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => setCreatedCode(null)}
                    style={{ marginTop: 12 }}
                  >
                    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{tr.admin.dismiss}</Text>
                  </Pressable>
                </View>
              )}

              <View style={{ marginTop: 16 }}>
                {invitesLoading ? (
                  <ActivityIndicator style={{ marginVertical: 20 }} color="#FBBF24" />
                ) : invitesList.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: "#1F2937",
                      padding: 20,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                  >
                    <Ticket size={32} color="rgba(255,255,255,0.2)" />
                    <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center" }}>
                      {tr.admin.noInvites}
                    </Text>
                  </View>
                ) : (
                  invitesList.map((invite) => (
                    <View
                      key={invite.id}
                      style={{
                        backgroundColor: "#1F2937",
                        padding: 14,
                        borderRadius: 14,
                        marginBottom: 10,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Text style={{ fontSize: 18, fontWeight: "800", color: "#FFFFFF", letterSpacing: 2 }}>
                            {invite.code}
                          </Text>
                          <Pressable
                            onPress={() => copyCode(invite.code)}
                            style={{ padding: 6 }}
                          >
                            <Copy size={14} color="rgba(255,255,255,0.5)" />
                          </Pressable>
                        </View>
                        <View
                          style={{
                            backgroundColor: invite.active ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 12,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "700",
                              color: invite.active ? "#10B981" : "#EF4444",
                            }}
                          >
                            {invite.active ? tr.admin.active : tr.admin.inactive}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                          {tr.admin.roleLabel} <Text style={{ fontWeight: "600", color: "#FFFFFF" }}>{invite.role}</Text>
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                          {tr.admin.usedLabel} <Text style={{ fontWeight: "600", color: "#FFFFFF" }}>{invite.usedCount}x</Text>
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* REPORTS TAB */}
          {activeSection === "reports" && hasFinance && (
            <View style={{ gap: 16 }}>
              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 22, fontWeight: "800", letterSpacing: -0.3 }}>
                  {tr.admin.financialCenter}
                </Text>
                {/* Period toggle */}
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: 3,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  {(["month", "all"] as const).map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => {
                        setFinPeriod(p);
                        fetchFinancialData(p);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: finPeriod === p ? "#D4A017" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          color: finPeriod === p ? "#000" : "rgba(255,255,255,0.60)",
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {p === "month" ? tr.admin.thisMonth : tr.admin.allTime}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {finLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <ActivityIndicator color="#D4A017" />
                </View>
              ) : (
                <>
                  {/* KPI Grid */}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <LinearGradient
                      colors={["rgba(212,160,23,0.18)", "rgba(212,160,23,0.06)"]}
                      style={{
                        flex: 1,
                        borderRadius: 18,
                        padding: 18,
                        borderWidth: 1,
                        borderColor: "rgba(212,160,23,0.25)",
                      }}
                    >
                      <Text style={{ color: "rgba(255,255,255,0.60)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {tr.admin.revenue}
                      </Text>
                      <Text style={{ color: "#D4A017", fontSize: 26, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 }}>
                        ${finData.totalRevenue.toFixed(0)}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.40)", fontSize: 11, marginTop: 2 }}>
                        {finData.paidInvoices !== 1
                          ? tr.admin.fromPaidInvoicesPlural.replace("{count}", String(finData.paidInvoices))
                          : tr.admin.fromPaidInvoices.replace("{count}", String(finData.paidInvoices))}
                      </Text>
                    </LinearGradient>

                    <LinearGradient
                      colors={["rgba(251,191,36,0.18)", "rgba(251,191,36,0.04)"]}
                      style={{
                        flex: 1,
                        borderRadius: 18,
                        padding: 18,
                        borderWidth: 1,
                        borderColor: "rgba(251,191,36,0.25)",
                      }}
                    >
                      <Text style={{ color: "rgba(255,255,255,0.60)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {tr.admin.outstanding}
                      </Text>
                      <Text style={{ color: "#FBBF24", fontSize: 26, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 }}>
                        ${finData.outstanding.toFixed(0)}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.40)", fontSize: 11, marginTop: 2 }}>
                        {tr.admin.dueOverdue}
                      </Text>
                    </LinearGradient>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <LinearGradient
                      colors={["rgba(248,113,113,0.18)", "rgba(248,113,113,0.04)"]}
                      style={{
                        flex: 1,
                        borderRadius: 18,
                        padding: 18,
                        borderWidth: 1,
                        borderColor: "rgba(248,113,113,0.25)",
                      }}
                    >
                      <Text style={{ color: "rgba(255,255,255,0.60)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {tr.admin.pendingPayouts}
                      </Text>
                      <Text style={{ color: "#F87171", fontSize: 26, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 }}>
                        ${finData.pendingPayouts.toFixed(0)}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.40)", fontSize: 11, marginTop: 2 }}>
                        {tr.admin.toCoaches}
                      </Text>
                    </LinearGradient>

                    <LinearGradient
                      colors={["rgba(52,211,153,0.18)", "rgba(52,211,153,0.04)"]}
                      style={{
                        flex: 1,
                        borderRadius: 18,
                        padding: 18,
                        borderWidth: 1,
                        borderColor: "rgba(52,211,153,0.25)",
                      }}
                    >
                      <Text style={{ color: "rgba(255,255,255,0.60)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {tr.admin.paidPayouts}
                      </Text>
                      <Text style={{ color: "#34D399", fontSize: 26, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 }}>
                        ${finData.paidPayouts.toFixed(0)}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.40)", fontSize: 11, marginTop: 2 }}>
                        {tr.admin.toCoaches}
                      </Text>
                    </LinearGradient>
                  </View>

                  {/* Recent Invoices */}
                  {finData.recentInvoices.length > 0 && (
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
                          {tr.admin.recentInvoices}
                        </Text>
                        <Pressable onPress={() => router.push("/invoices")}>
                          <Text style={{ color: "#D4A017", fontSize: 12, fontWeight: "600" }}>{tr.admin.seeAll}</Text>
                        </Pressable>
                      </View>
                      <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        {finData.recentInvoices.map((inv, idx) => {
                          const statusColors: Record<string, string> = {
                            paid: "#34D399",
                            due: "#60A5FA",
                            pending_review: "#FBBF24",
                            overdue: "#F87171",
                          };
                          const sc = statusColors[inv.status] ?? "#60A5FA";
                          return (
                            <View key={inv.id}>
                              {idx > 0 && <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginHorizontal: 16 }} />}
                              <Pressable
                                onPress={() => router.push({ pathname: "/invoice-details", params: { schoolId: effectiveSchoolId!, invoiceId: inv.id } })}
                                style={({ pressed }) => ({
                                  flexDirection: "row",
                                  alignItems: "center",
                                  padding: 14,
                                  backgroundColor: pressed ? "rgba(255,255,255,0.04)" : "transparent",
                                })}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                                    {inv.studentName}
                                  </Text>
                                  <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 1, textTransform: "capitalize" }}>
                                    {inv.status.replace("_", " ")}
                                  </Text>
                                </View>
                                <Text style={{ color: sc, fontSize: 15, fontWeight: "700" }}>
                                  {inv.currency} {inv.amount.toFixed(2)}
                                </Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Recent Payouts */}
                  {finData.recentPayouts.length > 0 && (
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
                          {tr.admin.coachPayouts}
                        </Text>
                        <Pressable onPress={() => router.push("/coach-payouts")}>
                          <Text style={{ color: "#D4A017", fontSize: 12, fontWeight: "600" }}>{tr.admin.seeAll}</Text>
                        </Pressable>
                      </View>
                      <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        {finData.recentPayouts.map((p, idx) => (
                          <View key={p.id}>
                            {idx > 0 && <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginHorizontal: 16 }} />}
                            <View style={{ flexDirection: "row", alignItems: "center", padding: 14 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                                  {p.coachName}
                                </Text>
                                <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 1 }}>
                                  {p.period} · {p.status === "paid" ? tr.admin.paid : tr.admin.pending}
                                </Text>
                              </View>
                              <Text style={{ color: p.status === "paid" ? "#34D399" : "#FBBF24", fontSize: 15, fontWeight: "700" }}>
                                {p.currency} {p.amount.toFixed(2)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                </>
              )}
            </View>
          )}

          {/* BRANDING TAB */}
          {activeSection === "branding" && (
            <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ backgroundColor: "rgba(6,182,212,0.15)", padding: 8, borderRadius: 10 }}>
                  <Settings size={18} color="#06B6D4" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#FFFFFF" }}>{tr.admin.branding}</Text>
              </View>

              <View style={{ marginTop: 16, gap: 12 }}>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 6, fontWeight: "500" }}>
                    {tr.admin.primaryColor}
                  </Text>
                  <TextInput
                    value={brandingPrimaryColor}
                    onChangeText={setBrandingPrimaryColor}
                    placeholder="#0070B8"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      backgroundColor: "#1F2937",
                      color: "#FFFFFF",
                    }}
                  />
                </View>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 6, fontWeight: "500" }}>
                    {tr.admin.logoUrl}
                  </Text>
                  <TextInput
                    value={brandingLogoUrl}
                    onChangeText={setBrandingLogoUrl}
                    placeholder="https://..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      backgroundColor: "#1F2937",
                      color: "#FFFFFF",
                    }}
                  />
                </View>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 6, fontWeight: "500" }}>
                    {tr.admin.website}
                  </Text>
                  <TextInput
                    value={brandingWebsite}
                    onChangeText={setBrandingWebsite}
                    placeholder="https://yourschool.com"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      backgroundColor: "#1F2937",
                      color: "#FFFFFF",
                    }}
                  />
                </View>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 6, fontWeight: "500" }}>
                    {tr.admin.googleReviewLink}
                  </Text>
                  <TextInput
                    value={brandingGoogleReview}
                    onChangeText={setBrandingGoogleReview}
                    placeholder="Google Review URL"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      backgroundColor: "#1F2937",
                      color: "#FFFFFF",
                    }}
                  />
                </View>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 6, fontWeight: "500" }}>
                    {tr.admin.instagram}
                  </Text>
                  <TextInput
                    value={brandingInstagram}
                    onChangeText={setBrandingInstagram}
                    placeholder="@yourschool"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      backgroundColor: "#1F2937",
                      color: "#FFFFFF",
                    }}
                  />
                </View>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 6, fontWeight: "500" }}>
                    {tr.admin.facebook}
                  </Text>
                  <TextInput
                    value={brandingFacebook}
                    onChangeText={setBrandingFacebook}
                    placeholder="Facebook page"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      backgroundColor: "#1F2937",
                      color: "#FFFFFF",
                    }}
                  />
                </View>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 6, fontWeight: "500" }}>
                    {tr.admin.waiverText}
                  </Text>
                  <TextInput
                    value={waiverText}
                    onChangeText={setWaiverText}
                    placeholder={tr.admin.enterWaiverText}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      backgroundColor: "#1F2937",
                      color: "#FFFFFF",
                      minHeight: 120,
                      textAlignVertical: "top",
                    }}
                  />
                </View>

                <Pressable
                  onPress={saveBranding}
                  style={{
                    backgroundColor: "#FBBF24",
                    paddingVertical: 14,
                    borderRadius: 16,
                    marginTop: 4,
                  }}
                >
                  <Text style={{ color: "#0B1220", textAlign: "center", fontWeight: "700", fontSize: 16 }}>
                    {tr.admin.saveBranding}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* PAYMENTS TAB */}
          {activeSection === "payments" && hasFinance && (
            <View style={{ gap: 10 }}>
              <Text
                style={{
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 11,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 4,
                  paddingHorizontal: 4,
                }}
              >
                {tr.admin.financialCenter}
              </Text>

              {/* Payment Methods */}
              <Pressable
                onPress={() => router.push("/payment-settings")}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ backgroundColor: "rgba(212,160,23,0.15)", borderRadius: 12, padding: 10 }}>
                    <Settings size={20} color="#D4A017" />
                  </View>
                  <View>
                    <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 16, fontWeight: "700" }}>
                      {tr.admin.paymentMethods}
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 }}>
                      {tr.admin.configurePayments}
                    </Text>
                  </View>
                </View>
                <Ticket size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>

              {/* Payment Requests (legacy) */}
              <Pressable
                onPress={() => router.push("/manager-payment-requests")}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ backgroundColor: "rgba(52,211,153,0.15)", borderRadius: 12, padding: 10 }}>
                    <FileText size={20} color="#34D399" />
                  </View>
                  <View>
                    <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 16, fontWeight: "700" }}>
                      {tr.paymentRequests.title}
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 }}>
                      {tr.paymentRequests.managerPaymentRequests}
                    </Text>
                  </View>
                </View>
                <Ticket size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>

              {/* Review Payment Proofs (invoice-linked) */}
              <Pressable
                onPress={() => router.push("/payment-requests")}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: "rgba(251,191,36,0.20)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ backgroundColor: "rgba(251,191,36,0.15)", borderRadius: 12, padding: 10 }}>
                    <Check size={20} color="#FBBF24" />
                  </View>
                  <View>
                    <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 16, fontWeight: "700" }}>
                      Review Payment Proofs
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 }}>
                      Approve or reject submitted proofs
                    </Text>
                  </View>
                </View>
                <Ticket size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>

              {/* Invoices */}
              <Pressable
                onPress={() => router.push("/invoices")}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ backgroundColor: "rgba(96,165,250,0.15)", borderRadius: 12, padding: 10 }}>
                    <BookOpen size={20} color="#60A5FA" />
                  </View>
                  <View>
                    <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 16, fontWeight: "700" }}>
                      {tr.admin.invoices}
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 }}>
                      {tr.admin.manageInvoices}
                    </Text>
                  </View>
                </View>
                <Ticket size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>

              {/* Coach Payouts */}
              <Pressable
                onPress={() => router.push("/coach-payouts")}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ backgroundColor: "rgba(52,211,153,0.15)", borderRadius: 12, padding: 10 }}>
                    <Plus size={20} color="#34D399" />
                  </View>
                  <View>
                    <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 16, fontWeight: "700" }}>
                      {tr.admin.coachPayoutsLabel}
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 }}>
                      {tr.admin.trackCoachPayments}
                    </Text>
                  </View>
                </View>
                <Ticket size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>
            </View>
          )}

          {/* CLASSES TAB */}
          {activeSection === "classes" && (
            <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ backgroundColor: "rgba(6,182,212,0.15)", padding: 8, borderRadius: 10 }}>
                    <BookOpen size={18} color="#06B6D4" />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#FFFFFF" }}>{tr.admin.classes}</Text>
                </View>
                <Pressable
                  onPress={() => setShowCreateLesson(true)}
                  style={{ backgroundColor: "#FBBF24", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Plus size={16} color="#0B1220" />
                  <Text style={{ color: "#0B1220", fontWeight: "700", fontSize: 13 }}>{tr.admin.create}</Text>
                </Pressable>
              </View>

              <View style={{ marginTop: 16 }}>
                {lessonsLoading ? (
                  <ActivityIndicator style={{ marginVertical: 20 }} color="#06B6D4" />
                ) : lessonsList.length === 0 ? (
                  <View style={{ backgroundColor: "#1F2937", padding: 20, borderRadius: 12, alignItems: "center" }}>
                    <BookOpen size={32} color="rgba(255,255,255,0.2)" />
                    <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center" }}>{tr.admin.noClassesYet}</Text>
                  </View>
                ) : (
                  lessonsList.map((lesson) => {
                    const levelColors: Record<string, { bg: string; color: string }> = {
                      fundamentals: { bg: "rgba(6,182,212,0.15)", color: "#06B6D4" },
                      intermediate: { bg: "rgba(124,58,237,0.15)", color: "#A78BFA" },
                      advanced: { bg: "rgba(239,68,68,0.15)", color: "#EF4444" },
                      all_levels: { bg: "rgba(16,185,129,0.15)", color: "#10B981" },
                    };
                    const lc = levelColors[lesson.level] ?? levelColors.all_levels;
                    return (
                      <View key={lesson.id} style={{ backgroundColor: "#1F2937", padding: 14, borderRadius: 14, marginBottom: 10 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View style={{ backgroundColor: lc.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                            <Text style={{ color: lc.color, fontWeight: "700", fontSize: 12, textTransform: "capitalize" }}>
                              {lesson.level.replace("_", " ")}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <Pressable
                              onPress={() => handleEditLesson(lesson)}
                              style={{ padding: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" }}
                            >
                              <Pencil size={15} color="#A78BFA" />
                            </Pressable>
                            <Pressable
                              onPress={() => handleDeleteLesson(lesson.id)}
                              style={{ padding: 6, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.1)" }}
                            >
                              <Trash2 size={15} color="#EF4444" />
                            </Pressable>
                          </View>
                        </View>
                        <Text style={{ fontWeight: "700", color: "#FFFFFF", fontSize: 15, marginTop: 8 }}>
                          {lesson.startsAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 }}>
                          {lesson.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                          {" – "}
                          {lesson.endsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {/* COMPETITIONS TAB */}
          {activeSection === "competitions" && (
            <View style={{ backgroundColor: "#111827", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ backgroundColor: "rgba(251,191,36,0.15)", padding: 8, borderRadius: 10 }}>
                    <Trophy size={18} color="#FBBF24" />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#FFFFFF" }}>Competitions</Text>
                </View>
                <Pressable
                  onPress={openCreateCompetition}
                  style={{ backgroundColor: "#FBBF24", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Plus size={16} color="#0B1220" />
                  <Text style={{ color: "#0B1220", fontWeight: "700", fontSize: 13 }}>Create</Text>
                </Pressable>
              </View>

              <View style={{ marginTop: 16 }}>
                {competitionsLoading ? (
                  <ActivityIndicator style={{ marginVertical: 20 }} color="#FBBF24" />
                ) : competitionsList.length === 0 ? (
                  <View style={{ backgroundColor: "#1F2937", padding: 20, borderRadius: 12, alignItems: "center" }}>
                    <Trophy size={32} color="rgba(255,255,255,0.2)" />
                    <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center" }}>No competitions yet. Tap Create to add one.</Text>
                  </View>
                ) : (
                  competitionsList.map((comp) => {
                    const participants = competitionParticipants[comp.id] ?? [];
                    const isPastDeadline = comp.signupDeadline < new Date();
                    return (
                      <View key={comp.id} style={{ backgroundColor: "#1F2937", padding: 14, borderRadius: 14, marginBottom: 10 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontWeight: "800", color: "#FFFFFF", fontSize: 15 }}>{comp.title}</Text>
                            {comp.location ? (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                                <MapPin size={12} color="rgba(255,255,255,0.45)" />
                                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{comp.location}</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <Pressable
                              onPress={() => openEditCompetition(comp)}
                              style={{ padding: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" }}
                            >
                              <Pencil size={15} color="#A78BFA" />
                            </Pressable>
                            <Pressable
                              onPress={() => deleteCompetition(comp.id)}
                              style={{ padding: 6, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.1)" }}
                            >
                              <Trash2 size={15} color="#EF4444" />
                            </Pressable>
                          </View>
                        </View>

                        <View style={{ flexDirection: "row", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Calendar size={12} color="#FBBF24" />
                            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
                              {comp.eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Clock size={12} color={isPastDeadline ? "#F87171" : "#34D399"} />
                            <Text style={{ color: isPastDeadline ? "#F87171" : "rgba(255,255,255,0.7)", fontSize: 12 }}>
                              Deadline: {comp.signupDeadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Users size={12} color="#06B6D4" />
                            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>{participants.length} confirmed</Text>
                          </View>
                        </View>

                        {comp.signupLink ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                            <Link size={12} color="rgba(255,255,255,0.35)" />
                            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }} numberOfLines={1}>{comp.signupLink}</Text>
                          </View>
                        ) : null}

                        {participants.length > 0 && (
                          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 10 }}>
                            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Participants</Text>
                            {participants.map((p) => (
                              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
                                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>{p.userName || "—"}</Text>
                                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, textTransform: "capitalize" }}>{p.belt || "—"}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* Create Invite Modal */}
      <Modal
        visible={showCreateInvite}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateInvite(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
              borderTopWidth: 1,
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFFFFF" }}>
                {tr.admin.createInviteCode}
              </Text>
              <Pressable onPress={() => setShowCreateInvite(false)}>
                <X size={24} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>

            <Text style={{ color: "rgba(255,255,255,0.5)", marginBottom: 12, fontWeight: "500" }}>
              {tr.admin.selectRole}
            </Text>

            <View style={{ gap: 10 }}>
              {(["student", "coach", "manager"] as const).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setNewInviteRole(r)}
                  style={{
                    backgroundColor: newInviteRole === r ? "rgba(6,182,212,0.15)" : "#1F2937",
                    borderWidth: 2,
                    borderColor: newInviteRole === r ? "#06B6D4" : "rgba(255,255,255,0.08)",
                    padding: 16,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      color: newInviteRole === r ? "#06B6D4" : "#FFFFFF",
                      textTransform: "capitalize",
                    }}
                  >
                    {r}
                  </Text>
                  {newInviteRole === r && (
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: "#06B6D4",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={14} color="white" />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={createInvite}
              style={{
                backgroundColor: "#FBBF24",
                paddingVertical: 16,
                borderRadius: 16,
                marginTop: 24,
              }}
            >
              <Text style={{ color: "#0B1220", textAlign: "center", fontWeight: "700", fontSize: 16 }}>
                {tr.admin.generateCode}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Assign Coach Modal */}
      <Modal
        visible={showAssignCoach}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowAssignCoach(false);
          setSelectedBooking(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
              maxHeight: "70%",
              borderTopWidth: 1,
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFFFFF" }}>{tr.admin.assignCoach}</Text>
              <Pressable
                onPress={() => {
                  setShowAssignCoach(false);
                  setSelectedBooking(null);
                }}
              >
                <X size={24} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>

            {selectedBooking && (
              <View
                style={{
                  backgroundColor: "#1F2937",
                  padding: 14,
                  borderRadius: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontWeight: "600", color: "#FFFFFF" }}>
                  {tr.admin.booking} {selectedBooking.studentName}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 4 }}>
                  {selectedBooking.date} {selectedBooking.time ? `at ${selectedBooking.time}` : ""}
                </Text>
              </View>
            )}

            <Text style={{ color: "rgba(255,255,255,0.5)", marginBottom: 12, fontWeight: "500" }}>
              {tr.admin.selectCoach}
            </Text>

            {coachesList.length === 0 ? (
              <View
                style={{
                  backgroundColor: "#1F2937",
                  padding: 20,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Users size={32} color="rgba(255,255,255,0.2)" />
                <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center" }}>
                  {tr.admin.noCoaches}
                </Text>
              </View>
            ) : (
              <FlatList
                data={coachesList}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => assignCoach(item)}
                    style={{
                      backgroundColor: "#1F2937",
                      padding: 16,
                      borderRadius: 12,
                      marginBottom: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View>
                      <Text style={{ fontWeight: "700", color: "#FFFFFF", fontSize: 15 }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 }}>
                        {item.email || "—"}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: "#FBBF24",
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ color: "#0B1220", fontWeight: "600", fontSize: 13 }}>{tr.admin.selectLabel}</Text>
                    </View>
                  </Pressable>
                )}
                style={{ maxHeight: 300 }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Create Lesson Modal */}
      <Modal visible={showCreateLesson} animationType="slide" transparent onRequestClose={() => setShowCreateLesson(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFFFFF" }}>{editingLessonId ? tr.admin.editClass : tr.admin.createClass}</Text>
              <Pressable onPress={() => { setShowCreateLesson(false); setEditingLessonId(null); }}>
                <X size={24} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>

            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{tr.admin.levelLabel}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {(["fundamentals", "intermediate", "advanced", "all_levels"] as ClassLevel[]).map((lv) => {
                const labels: Record<ClassLevel, string> = { fundamentals: "Fundamentals", intermediate: "Intermediate", advanced: "Advanced", all_levels: "All Levels" };
                const colors: Record<ClassLevel, { color: string; bg: string }> = {
                  fundamentals: { color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
                  intermediate: { color: "#A78BFA", bg: "rgba(124,58,237,0.15)" },
                  advanced: { color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
                  all_levels: { color: "#10B981", bg: "rgba(16,185,129,0.15)" },
                };
                const c = colors[lv];
                return (
                  <Pressable
                    key={lv}
                    onPress={() => setNewLessonLevel(lv)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 2, borderColor: newLessonLevel === lv ? c.color : "rgba(255,255,255,0.08)", backgroundColor: newLessonLevel === lv ? c.bg : "#1F2937" }}
                  >
                    <Text style={{ color: newLessonLevel === lv ? c.color : "rgba(255,255,255,0.5)", fontWeight: "700", fontSize: 13 }}>{labels[lv]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{tr.admin.startsAt}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <Pressable onPress={() => setShowLessonStartPicker("date")} style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1F2937" }}>
                <Calendar size={16} color="#06B6D4" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{newLessonStartsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Text>
              </Pressable>
              <Pressable onPress={() => setShowLessonStartPicker("time")} style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1F2937" }}>
                <BarChart3 size={16} color="#06B6D4" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{newLessonStartsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</Text>
              </Pressable>
            </View>
            {showLessonStartPicker && (
              <DateTimePicker value={newLessonStartsAt} mode={showLessonStartPicker} display="spinner" onChange={(_, d) => { setShowLessonStartPicker(null); if (d) setNewLessonStartsAt(d); }} />
            )}

            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{tr.admin.endsAt}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
              <Pressable onPress={() => setShowLessonEndPicker("date")} style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1F2937" }}>
                <Calendar size={16} color="#06B6D4" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{newLessonEndsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Text>
              </Pressable>
              <Pressable onPress={() => setShowLessonEndPicker("time")} style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1F2937" }}>
                <BarChart3 size={16} color="#06B6D4" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{newLessonEndsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</Text>
              </Pressable>
            </View>
            {showLessonEndPicker && (
              <DateTimePicker value={newLessonEndsAt} mode={showLessonEndPicker} display="spinner" onChange={(_, d) => { setShowLessonEndPicker(null); if (d) setNewLessonEndsAt(d); }} />
            )}

            <Pressable
              onPress={saveLesson}
              disabled={creatingLesson}
              style={{ backgroundColor: creatingLesson ? "rgba(255,255,255,0.2)" : "#FBBF24", paddingVertical: 16, borderRadius: 16, alignItems: "center" }}
            >
              {creatingLesson ? <ActivityIndicator color="white" /> : <Text style={{ color: "#0B1220", fontWeight: "800", fontSize: 16 }}>{editingLessonId ? tr.lessons.saveChanges : tr.admin.createClass}</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Create/Edit Competition Modal */}
      <Modal visible={showCreateCompetition} animationType="slide" transparent onRequestClose={() => { setShowCreateCompetition(false); setEditingCompetitionId(null); }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <ScrollView
            style={{ backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}
            contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFFFFF" }}>
                {editingCompetitionId ? "Edit Competition" : "New Competition"}
              </Text>
              <Pressable onPress={() => { setShowCreateCompetition(false); setEditingCompetitionId(null); }}>
                <X size={24} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>

            {/* Title */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Title *</Text>
            <TextInput
              value={compTitle}
              onChangeText={setCompTitle}
              placeholder="e.g. Spring Open 2025"
              placeholderTextColor="rgba(255,255,255,0.25)"
              style={{ backgroundColor: "#1F2937", color: "#FFFFFF", borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 16 }}
            />

            {/* Location */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Location</Text>
            <TextInput
              value={compLocation}
              onChangeText={setCompLocation}
              placeholder="e.g. Convention Center, City"
              placeholderTextColor="rgba(255,255,255,0.25)"
              style={{ backgroundColor: "#1F2937", color: "#FFFFFF", borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 16 }}
            />

            {/* Event Date */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Event Date</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <Pressable
                onPress={() => setShowCompEventDatePicker("date")}
                style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1F2937" }}
              >
                <Calendar size={16} color="#FBBF24" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                  {compEventDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowCompEventDatePicker("time")}
                style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1F2937" }}
              >
                <Clock size={16} color="#FBBF24" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                  {compEventDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </Text>
              </Pressable>
            </View>
            {showCompEventDatePicker && (
              <DateTimePicker
                value={compEventDate}
                mode={showCompEventDatePicker}
                display="spinner"
                onChange={(_, d) => { setShowCompEventDatePicker(null); if (d) setCompEventDate(d); }}
              />
            )}

            {/* Signup Deadline */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Signup Deadline</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <Pressable
                onPress={() => setShowCompDeadlinePicker("date")}
                style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1F2937" }}
              >
                <Calendar size={16} color="#34D399" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                  {compSignupDeadline.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowCompDeadlinePicker("time")}
                style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1F2937" }}
              >
                <Clock size={16} color="#34D399" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                  {compSignupDeadline.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </Text>
              </Pressable>
            </View>
            {showCompDeadlinePicker && (
              <DateTimePicker
                value={compSignupDeadline}
                mode={showCompDeadlinePicker}
                display="spinner"
                onChange={(_, d) => { setShowCompDeadlinePicker(null); if (d) setCompSignupDeadline(d); }}
              />
            )}

            {/* Signup Link */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Signup Link</Text>
            <TextInput
              value={compSignupLink}
              onChangeText={setCompSignupLink}
              placeholder="https://smoothcomp.com/..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              autoCapitalize="none"
              keyboardType="url"
              style={{ backgroundColor: "#1F2937", color: "#FFFFFF", borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 16 }}
            />

            {/* Notes */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Notes</Text>
            <TextInput
              value={compNotes}
              onChangeText={setCompNotes}
              placeholder="Weight classes, rules, what to bring..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              numberOfLines={4}
              style={{ backgroundColor: "#1F2937", color: "#FFFFFF", borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 24, textAlignVertical: "top", minHeight: 90 }}
            />

            <Pressable
              onPress={saveCompetition}
              disabled={savingCompetition}
              style={{ backgroundColor: savingCompetition ? "rgba(255,255,255,0.2)" : "#FBBF24", paddingVertical: 16, borderRadius: 16, alignItems: "center" }}
            >
              {savingCompetition
                ? <ActivityIndicator color="white" />
                : <Text style={{ color: "#0B1220", fontWeight: "800", fontSize: 16 }}>{editingCompetitionId ? "Save Changes" : "Create Competition"}</Text>
              }
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Belt Edit Modal — manager-only */}
      <Modal visible={!!beltEditMember} animationType="slide" transparent>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}
          onPress={() => setBeltEditMember(null)}
        >
          <Pressable onPress={() => {}} style={{ backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
            {/* Header */}
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#FFFFFF", marginBottom: 4 }}>
              {tr.admin.editBelt}
            </Text>
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
              {beltEditMember?.name}
            </Text>

            {/* Belt rank picker */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {tr.admin.beltRankLabel}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {BELT_OPTIONS.map((rank) => {
                const selected = beltEditRank === rank;
                const colors: Record<BeltRank, string> = {
                  white: "#E2E8F0",
                  blue: "#1E40AF",
                  purple: "#6D28D9",
                  brown: "#7C2D12",
                  black: "#0F172A",
                };
                const textColors: Record<BeltRank, string> = {
                  white: "#1E293B",
                  blue: "#FFFFFF",
                  purple: "#FFFFFF",
                  brown: "#FFFFFF",
                  black: "#FFFFFF",
                };
                return (
                  <Pressable
                    key={rank}
                    onPress={() => setBeltEditRank(rank)}
                    style={{
                      backgroundColor: selected ? colors[rank] : "#1F2937",
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? colors[rank] : "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text style={{ color: selected ? textColors[rank] : "rgba(255,255,255,0.5)", fontWeight: "600", fontSize: 14, textTransform: "capitalize" }}>
                      {tr.belts[rank]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Stripes stepper */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {tr.admin.stripesLabel}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 28 }}>
              <Pressable
                onPress={() => setBeltEditStripes(Math.max(0, beltEditStripes - 1))}
                style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#1F2937", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
              >
                <Text style={{ fontSize: 22, color: "#FFFFFF", fontWeight: "400", lineHeight: 28 }}>−</Text>
              </Pressable>
              <Text style={{ fontSize: 24, fontWeight: "700", color: "#FFFFFF", minWidth: 28, textAlign: "center" }}>
                {beltEditStripes}
              </Text>
              <Pressable
                onPress={() => setBeltEditStripes(Math.min(4, beltEditStripes + 1))}
                style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#1F2937", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
              >
                <Text style={{ fontSize: 22, color: "#FFFFFF", fontWeight: "400", lineHeight: 28 }}>+</Text>
              </Pressable>
              {/* Live preview */}
              <View style={{ marginLeft: 8 }}>
                <BeltBadge beltRank={beltEditRank} stripes={beltEditStripes} size="md" />
              </View>
            </View>

            {/* Save & Cancel */}
            <Pressable
              onPress={saveBeltEdit}
              disabled={beltEditSaving}
              style={({ pressed }) => ({
                backgroundColor: pressed || beltEditSaving ? "#D4A017" : "#FBBF24",
                paddingVertical: 14,
                borderRadius: 16,
                alignItems: "center",
                marginBottom: 12,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>
                {beltEditSaving ? tr.admin.savingBelt : tr.admin.saveBelt}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setBeltEditMember(null)}
              style={{ paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "500", fontSize: 14 }}>{tr.common.cancel}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
