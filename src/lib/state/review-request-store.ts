import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReviewRequest, AnalyticsEvent, AnalyticsEventType, UserRole } from "@/types";

interface ReviewRequestState {
  reviewRequests: ReviewRequest[];
  analyticsEvents: AnalyticsEvent[];
}

interface ReviewRequestActions {
  // Review Request Management
  createReviewRequest: (tenantId: string, classId: string, studentId: string) => ReviewRequest;
  markAsShown: (classId: string, studentId: string) => void;
  markAsClicked: (classId: string, studentId: string) => void;
  markAsDismissed: (classId: string, studentId: string) => void;

  // Query helpers
  hasBeenShown: (classId: string, studentId: string) => boolean;
  getReviewRequest: (classId: string, studentId: string) => ReviewRequest | undefined;
  shouldShowReviewPrompt: (classId: string, studentId: string) => boolean;

  // Analytics
  trackEvent: (
    eventType: AnalyticsEventType,
    tenantId: string,
    userId: string,
    userRole: UserRole,
    classId?: string,
    targetType?: "academy" | "coach" | "student",
    metadata?: Record<string, string>
  ) => void;
  getEventsByType: (eventType: AnalyticsEventType) => AnalyticsEvent[];
  getEventsByClass: (classId: string) => AnalyticsEvent[];
}

export const useReviewRequestStore = create<ReviewRequestState & ReviewRequestActions>()(
  persist(
    (set, get) => ({
      reviewRequests: [],
      analyticsEvents: [],

      createReviewRequest: (tenantId, classId, studentId) => {
        const existingRequest = get().reviewRequests.find(
          (r) => r.classId === classId && r.studentId === studentId
        );

        if (existingRequest) {
          return existingRequest;
        }

        const newRequest: ReviewRequest = {
          id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          tenantId,
          classId,
          studentId,
          status: "pending",
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          reviewRequests: [...state.reviewRequests, newRequest],
        }));

        return newRequest;
      },

      markAsShown: (classId, studentId) => {
        set((state) => ({
          reviewRequests: state.reviewRequests.map((r) =>
            r.classId === classId && r.studentId === studentId
              ? { ...r, status: "shown" as const, shownAt: new Date().toISOString() }
              : r
          ),
        }));
      },

      markAsClicked: (classId, studentId) => {
        set((state) => ({
          reviewRequests: state.reviewRequests.map((r) =>
            r.classId === classId && r.studentId === studentId
              ? { ...r, status: "clicked" as const, clickedAt: new Date().toISOString() }
              : r
          ),
        }));
      },

      markAsDismissed: (classId, studentId) => {
        set((state) => ({
          reviewRequests: state.reviewRequests.map((r) =>
            r.classId === classId && r.studentId === studentId
              ? { ...r, status: "dismissed" as const, dismissedAt: new Date().toISOString() }
              : r
          ),
        }));
      },

      hasBeenShown: (classId, studentId) => {
        const request = get().reviewRequests.find(
          (r) => r.classId === classId && r.studentId === studentId
        );
        return request?.shownAt !== undefined;
      },

      getReviewRequest: (classId, studentId) => {
        return get().reviewRequests.find(
          (r) => r.classId === classId && r.studentId === studentId
        );
      },

      shouldShowReviewPrompt: (classId, studentId) => {
        const request = get().reviewRequests.find(
          (r) => r.classId === classId && r.studentId === studentId
        );
        // Show prompt only if request exists and hasn't been shown yet
        return request !== undefined && request.shownAt === undefined;
      },

      trackEvent: (eventType, tenantId, userId, userRole, classId, targetType, metadata) => {
        const event: AnalyticsEvent = {
          id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType,
          tenantId,
          userId,
          userRole,
          classId,
          targetType,
          timestamp: new Date().toISOString(),
          metadata,
        };

        set((state) => ({
          analyticsEvents: [...state.analyticsEvents, event],
        }));

        // Log for debugging
        console.log("[Analytics]", eventType, { tenantId, userId, userRole, classId, targetType });
      },

      getEventsByType: (eventType) => {
        return get().analyticsEvents.filter((e) => e.eventType === eventType);
      },

      getEventsByClass: (classId) => {
        return get().analyticsEvents.filter((e) => e.classId === classId);
      },
    }),
    {
      name: "ayon-flow-review-requests",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        reviewRequests: state.reviewRequests,
        analyticsEvents: state.analyticsEvents,
      }),
    }
  )
);

// Selector helpers
export const selectReviewRequests = (state: ReviewRequestState & ReviewRequestActions) =>
  state.reviewRequests;
export const selectAnalyticsEvents = (state: ReviewRequestState & ReviewRequestActions) =>
  state.analyticsEvents;
