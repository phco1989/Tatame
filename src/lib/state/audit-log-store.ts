import { create } from "zustand";
import type { AuditLog, AuditAction, AuditTargetType, UserRole } from "@/types";

interface AuditLogState {
  logs: AuditLog[];
  addLog: (log: Omit<AuditLog, "id" | "timestamp">) => void;
  getLogs: () => AuditLog[];
  getLogsByAction: (action: AuditAction) => AuditLog[];
  getLogsByTarget: (targetType: AuditTargetType, targetId: string) => AuditLog[];
  getLogsByActor: (actorUserId: string) => AuditLog[];
}

// Helper function to create an audit log entry
export function createAuditEntry(
  actorUserId: string,
  actorName: string,
  actorRole: UserRole,
  action: AuditAction,
  targetType: AuditTargetType,
  targetId: string,
  notes?: string
): Omit<AuditLog, "id" | "timestamp"> {
  return {
    actorUserId,
    actorName,
    actorRole,
    action,
    targetType,
    targetId,
    notes,
    deviceInfo: "Vibecode Mobile App",
  };
}

export const useAuditLogStore = create<AuditLogState>((set, get) => ({
  logs: [],

  addLog: (logData) => {
    const newLog: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...logData,
    };

    set((state) => ({
      logs: [newLog, ...state.logs],
    }));

    // Log to console for debugging
    console.log("[AUDIT]", newLog.action, newLog.targetType, newLog.targetId, newLog.notes);
  },

  getLogs: () => {
    return get().logs;
  },

  getLogsByAction: (action) => {
    return get().logs.filter((log) => log.action === action);
  },

  getLogsByTarget: (targetType, targetId) => {
    return get().logs.filter(
      (log) => log.targetType === targetType && log.targetId === targetId
    );
  },

  getLogsByActor: (actorUserId) => {
    return get().logs.filter((log) => log.actorUserId === actorUserId);
  },
}));

// Action labels for display
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create_staff_user: "Created staff account",
  change_user_role: "Changed user role",
  reset_password: "Reset password",
  disable_user: "Disabled user account",
  enable_user: "Enabled user account",
  confirm_booking: "Confirmed booking",
  cancel_booking: "Cancelled booking",
  complete_booking: "Completed booking",
  assign_coach: "Assigned coach",
  create_availability: "Created availability block",
  edit_availability: "Edited availability block",
  delete_availability: "Deleted availability block",
  add_progress_result: "Added class result",
  edit_progress_result: "Edited class result",
  export_accounting: "Exported accounting data",
  mark_payout_paid: "Marked payout as paid",
  add_cost_item: "Added cost item",
  edit_cost_item: "Edited cost item",
  resolve_deletion_request: "Resolved deletion request",
  belt_promotion: "Belt promotion",
};
