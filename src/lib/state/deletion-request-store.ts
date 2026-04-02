import { create } from "zustand";
import type { DeletionRequest, DeletionRequestType, DeletionRequestStatus } from "@/types";

interface DeletionRequestState {
  requests: DeletionRequest[];
  addRequest: (request: Omit<DeletionRequest, "id" | "timestamp" | "status">) => DeletionRequest;
  updateRequestStatus: (
    requestId: string,
    status: DeletionRequestStatus,
    handledBy?: string,
    handledByName?: string,
    notes?: string
  ) => void;
  getRequests: () => DeletionRequest[];
  getOpenRequests: () => DeletionRequest[];
  getRequestsByUser: (userId: string) => DeletionRequest[];
  getRequestById: (requestId: string) => DeletionRequest | undefined;
}

export const useDeletionRequestStore = create<DeletionRequestState>((set, get) => ({
  requests: [],

  addRequest: (requestData) => {
    const newRequest: DeletionRequest = {
      id: `deletion-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      status: "open",
      ...requestData,
    };

    set((state) => ({
      requests: [newRequest, ...state.requests],
    }));

    console.log("[DELETION REQUEST]", newRequest.requestType, "from", newRequest.requesterName);

    return newRequest;
  },

  updateRequestStatus: (requestId, status, handledBy, handledByName, notes) => {
    set((state) => ({
      requests: state.requests.map((req) =>
        req.id === requestId
          ? {
              ...req,
              status,
              handledBy: handledBy ?? req.handledBy,
              handledByName: handledByName ?? req.handledByName,
              handledAt: new Date().toISOString(),
              notes: notes ?? req.notes,
            }
          : req
      ),
    }));
  },

  getRequests: () => {
    return get().requests;
  },

  getOpenRequests: () => {
    return get().requests.filter(
      (req) => req.status === "open" || req.status === "in_progress"
    );
  },

  getRequestsByUser: (userId) => {
    return get().requests.filter((req) => req.requesterUserId === userId);
  },

  getRequestById: (requestId) => {
    return get().requests.find((req) => req.id === requestId);
  },
}));

// Request type labels
export const DELETION_REQUEST_TYPE_LABELS: Record<DeletionRequestType, string> = {
  delete_account: "Delete Account",
  delete_chat: "Delete Chat History",
  delete_all: "Delete All Data",
};

// Status labels
export const DELETION_STATUS_LABELS: Record<DeletionRequestStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
};

// Status colors for UI
export const DELETION_STATUS_COLORS: Record<DeletionRequestStatus, { bg: string; text: string }> = {
  open: { bg: "bg-yellow-100", text: "text-yellow-700" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  rejected: { bg: "bg-gray-100", text: "text-gray-700" },
};
