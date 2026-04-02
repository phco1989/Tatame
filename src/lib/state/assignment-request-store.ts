import { create } from "zustand";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase-config";
import type { AssignmentRequest, AssignmentRequestStatus } from "@/types";

interface AssignmentRequestState {
  requests: AssignmentRequest[];
  loading: boolean;
  error: string | null;
  unsubscribe: Unsubscribe | null;

  // Actions
  fetchRequestsForSchool: (schoolId: string) => Promise<void>;
  subscribeToRequests: (schoolId: string) => void;
  unsubscribeFromRequests: () => void;
  createRequest: (params: {
    schoolId: string;
    bookingId: string;
    studentId: string;
    requestedCoachId?: string;
  }) => Promise<string | null>;
  acceptRequest: (requestId: string) => Promise<boolean>;
  rejectRequest: (requestId: string) => Promise<boolean>;
  cancelRequest: (requestId: string) => Promise<boolean>;
  getRequestForBooking: (bookingId: string) => AssignmentRequest | undefined;
  getOpenRequestsForSchool: (schoolId: string) => AssignmentRequest[];
  getAcceptedRequestForBooking: (bookingId: string) => AssignmentRequest | undefined;
}

export const useAssignmentRequestStore = create<AssignmentRequestState>((set, get) => ({
  requests: [],
  loading: false,
  error: null,
  unsubscribe: null,

  fetchRequestsForSchool: async (schoolId: string) => {
    set({ loading: true, error: null });
    try {
      const requestsRef = collection(db, "assignment_requests");
      const q = query(requestsRef, where("academyId", "==", schoolId));
      const snapshot = await getDocs(q);

      const requests: AssignmentRequest[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        requests.push({
          id: docSnap.id,
          academyId: data.academyId || data.schoolId,
          bookingId: data.bookingId,
          studentId: data.studentId,
          requestedCoachId: data.requestedCoachId,
          status: data.status,
          createdBy: data.createdBy,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          acceptedBy: data.acceptedBy,
          acceptedAt: data.acceptedAt?.toDate?.()?.toISOString() || data.acceptedAt,
        });
      });

      set({ requests, loading: false });
    } catch (error: any) {
      console.error("[AssignmentRequestStore] Error fetching requests:", error);
      set({ error: error.message, loading: false });
    }
  },

  subscribeToRequests: (schoolId: string) => {
    // Unsubscribe from previous listener if exists
    const { unsubscribe: prevUnsubscribe } = get();
    if (prevUnsubscribe) {
      prevUnsubscribe();
    }

    const requestsRef = collection(db, "assignment_requests");
    const q = query(requestsRef, where("academyId", "==", schoolId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const requests: AssignmentRequest[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          requests.push({
            id: docSnap.id,
            academyId: data.academyId || data.schoolId,
            bookingId: data.bookingId,
            studentId: data.studentId,
            requestedCoachId: data.requestedCoachId,
            status: data.status,
            createdBy: data.createdBy,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            acceptedBy: data.acceptedBy,
            acceptedAt: data.acceptedAt?.toDate?.()?.toISOString() || data.acceptedAt,
          });
        });
        set({ requests, loading: false });
      },
      (error) => {
        console.error("[AssignmentRequestStore] Subscription error:", error);
        set({ error: error.message, loading: false });
      }
    );

    set({ unsubscribe, loading: true });
  },

  unsubscribeFromRequests: () => {
    const { unsubscribe } = get();
    if (unsubscribe) {
      unsubscribe();
      set({ unsubscribe: null });
    }
  },

  createRequest: async ({ schoolId, bookingId, studentId, requestedCoachId }) => {
    if (!auth.currentUser) {
      set({ error: "Not authenticated" });
      return null;
    }

    try {
      const requestsRef = collection(db, "assignment_requests");
      const newRequest = {
        academyId: schoolId,
        bookingId,
        studentId,
        requestedCoachId: requestedCoachId || undefined,
        status: "open" as AssignmentRequestStatus,
        createdBy: auth.currentUser.uid,
        createdAt: Timestamp.now(),
      };

      const docRef = await addDoc(requestsRef, newRequest);

      // Add to local state
      const localRequest: AssignmentRequest = {
        id: docRef.id,
        academyId: schoolId,
        bookingId,
        studentId,
        requestedCoachId: requestedCoachId || undefined,
        status: "open" as AssignmentRequestStatus,
        createdBy: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        requests: [...state.requests, localRequest],
      }));

      return docRef.id;
    } catch (error: any) {
      console.error("[AssignmentRequestStore] Error creating request:", error);
      set({ error: error.message });
      return null;
    }
  },

  acceptRequest: async (requestId: string) => {
    if (!auth.currentUser) {
      set({ error: "Not authenticated" });
      return false;
    }

    try {
      const requestRef = doc(db, "assignment_requests", requestId);
      await updateDoc(requestRef, {
        status: "accepted",
        acceptedBy: auth.currentUser.uid,
        acceptedAt: Timestamp.now(),
      });

      // Update local state
      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: "accepted" as AssignmentRequestStatus,
                acceptedBy: auth.currentUser!.uid,
                acceptedAt: new Date().toISOString(),
              }
            : r
        ),
      }));

      return true;
    } catch (error: any) {
      console.error("[AssignmentRequestStore] Error accepting request:", error);
      set({ error: error.message });
      return false;
    }
  },

  rejectRequest: async (requestId: string) => {
    if (!auth.currentUser) {
      set({ error: "Not authenticated" });
      return false;
    }

    try {
      const requestRef = doc(db, "assignment_requests", requestId);
      await updateDoc(requestRef, {
        status: "rejected",
      });

      // Update local state
      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === requestId ? { ...r, status: "rejected" as AssignmentRequestStatus } : r
        ),
      }));

      return true;
    } catch (error: any) {
      console.error("[AssignmentRequestStore] Error rejecting request:", error);
      set({ error: error.message });
      return false;
    }
  },

  cancelRequest: async (requestId: string) => {
    if (!auth.currentUser) {
      set({ error: "Not authenticated" });
      return false;
    }

    try {
      const requestRef = doc(db, "assignment_requests", requestId);
      await updateDoc(requestRef, {
        status: "cancelled",
      });

      // Update local state
      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === requestId ? { ...r, status: "cancelled" as AssignmentRequestStatus } : r
        ),
      }));

      return true;
    } catch (error: any) {
      console.error("[AssignmentRequestStore] Error cancelling request:", error);
      set({ error: error.message });
      return false;
    }
  },

  getRequestForBooking: (bookingId: string) => {
    const { requests } = get();
    return requests.find((r) => r.bookingId === bookingId);
  },

  getOpenRequestsForSchool: (schoolId: string) => {
    const { requests } = get();
    return requests.filter((r) => r.academyId === schoolId && r.status === "open");
  },

  getAcceptedRequestForBooking: (bookingId: string) => {
    const { requests } = get();
    return requests.find((r) => r.bookingId === bookingId && r.status === "accepted");
  },
}));
