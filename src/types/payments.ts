import { Timestamp } from "firebase/firestore";

// ── Payment Settings ──────────────────────────────────────────────────────────
export interface PixSettings {
  enabled: boolean;
  keyType: "CPF" | "Email" | "Phone" | "Random" | "";
  keyValue: string;
  qrUrl: string;
}

export interface VenmoSettings {
  enabled: boolean;
  handle: string;
  qrUrl: string;
}

export interface ZelleSettings {
  enabled: boolean;
  recipientName: string;
  contact: string;
}

export interface StripeSettings {
  enabled: boolean;
  publicNote: string;
}

export interface PaymentSettings {
  pix: PixSettings;
  venmo: VenmoSettings;
  zelle: ZelleSettings;
  stripe: StripeSettings;
  updatedAt: Timestamp | null;
  updatedBy: string;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  pix: { enabled: false, keyType: "", keyValue: "", qrUrl: "" },
  venmo: { enabled: false, handle: "", qrUrl: "" },
  zelle: { enabled: false, recipientName: "", contact: "" },
  stripe: { enabled: false, publicNote: "" },
  updatedAt: null,
  updatedBy: "",
};

// ── Invoice ───────────────────────────────────────────────────────────────────
export type InvoiceStatus =
  | "pending"
  | "due"
  | "submitted"
  | "proof_uploaded"
  | "confirmed"
  | "paid"
  | "rejected"
  | "overdue"
  // legacy status kept for backwards compat
  | "pending_review";

export type PaymentMethod = "pix" | "venmo" | "zelle";

export interface Invoice {
  id: string; // local, from doc.id
  studentUid: string;
  amount: number;
  currency: string;
  description: string;
  dueAt: Timestamp;
  status: InvoiceStatus;
  // payment proof
  paid: boolean;
  proofUrl: string | null;
  proofNote: string;
  proofUploadedAt: Timestamp | null;
  // confirmation
  paidAt: Timestamp | null;
  confirmedBy: string | null;
  confirmedByName: string | null;
  // rejection
  rejectedReason: string | null;
  // method
  methodChosen: PaymentMethod | null;
  // audit
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  // legacy fields (kept for existing documents)
  submittedAt: Timestamp | null;
  approvedAt: Timestamp | null;
  approvedBy: string | null;
  // optional back-reference to the payment_request that spawned this invoice
  paymentRequestId?: string | null;
}

// ── Coach Payout Method ───────────────────────────────────────────────────────
export interface CoachPayoutMethod {
  venmo: { enabled: boolean; handle: string };
  zelle: { enabled: boolean; recipientName: string; contact: string };
  pix: { enabled: boolean; keyType: string; keyValue: string };
  updatedAt: Timestamp | null;
}

export const DEFAULT_COACH_PAYOUT_METHOD: CoachPayoutMethod = {
  venmo: { enabled: false, handle: "" },
  zelle: { enabled: false, recipientName: "", contact: "" },
  pix: { enabled: false, keyType: "", keyValue: "" },
  updatedAt: null,
};

// ── Coach Payout ──────────────────────────────────────────────────────────────
export type CoachPayoutStatus = "pending" | "paid";

export interface CoachPayout {
  id: string;
  coachUid: string;
  amount: number;
  currency: "USD" | "BRL";
  status: CoachPayoutStatus;
  note: string | null;
  period: string; // "YYYY-MM"
  createdAt: Timestamp;
  createdBy: string;
  paidAt: Timestamp | null;
}

// ── Student summary (local, resolved from users/) ─────────────────────────────
export interface StudentSummary {
  uid: string;
  name: string;
  photoURL?: string | null;
}
