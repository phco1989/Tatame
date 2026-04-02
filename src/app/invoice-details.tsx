import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ChevronLeft,
  Clock,
  CheckCircle,
  AlertCircle,
  Circle,
  Copy,
  ImagePlus,
  Send,
  ThumbsUp,
  XCircle,
  RotateCcw,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { db } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useFinanceGuard } from "@/lib/premiumAccess";
import type {
  Invoice,
  InvoiceStatus,
  PaymentSettings,
  PaymentMethod,
} from "@/types/payments";
import { DEFAULT_PAYMENT_SETTINGS } from "@/types/payments";
import { uploadInvoiceProof } from "@/lib/uploadInvoiceProof";
import { format } from "date-fns";

const C = {
  bg: "#070D1A",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(212,160,23,0.50)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.60)",
  textMuted: "rgba(255,255,255,0.35)",
  gold: "#D4A017",
  goldBg: "rgba(212,160,23,0.12)",
  success: "#34D399",
  successBg: "rgba(52,211,153,0.12)",
  danger: "#F87171",
  dangerBg: "rgba(248,113,113,0.12)",
  warning: "#FBBF24",
  warningBg: "rgba(251,191,36,0.12)",
  blue: "#60A5FA",
  blueBg: "rgba(96,165,250,0.12)",
  inputBg: "rgba(255,255,255,0.06)",
  modalBg: "#0A1628",
};

function statusColor(status: InvoiceStatus) {
  switch (status) {
    case "pending":
    case "due": return C.blue;
    case "submitted":
    case "proof_uploaded":
    case "pending_review": return C.warning;
    case "confirmed":
    case "paid": return C.success;
    case "rejected":
    case "overdue": return C.danger;
    default: return C.textMuted;
  }
}
function statusBg(status: InvoiceStatus) {
  switch (status) {
    case "pending":
    case "due": return C.blueBg;
    case "submitted":
    case "proof_uploaded":
    case "pending_review": return C.warningBg;
    case "confirmed":
    case "paid": return C.successBg;
    case "rejected":
    case "overdue": return C.dangerBg;
    default: return C.surface;
  }
}
function statusLabel(status: InvoiceStatus) {
  switch (status) {
    case "pending":
    case "due": return "Pending";
    case "submitted": return "Submitted";
    case "proof_uploaded":
    case "pending_review": return "Proof Uploaded";
    case "confirmed":
    case "paid": return "Paid";
    case "rejected": return "Rejected";
    case "overdue": return "Overdue";
    default: return status;
  }
}
function StatusIcon({ status, size = 16 }: { status: InvoiceStatus; size?: number }) {
  const color = statusColor(status);
  switch (status) {
    case "pending":
    case "due": return <Circle size={size} color={color} />;
    case "submitted":
    case "proof_uploaded":
    case "pending_review": return <Clock size={size} color={color} />;
    case "confirmed":
    case "paid": return <CheckCircle size={size} color={color} />;
    case "rejected":
    case "overdue": return <AlertCircle size={size} color={color} />;
    default: return <Circle size={size} color={color} />;
  }
}

export default function InvoiceDetailsScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const params = useLocalSearchParams<{ schoolId: string; invoiceId: string }>();
  const { schoolId: paramSchoolId, invoiceId } = params;

  const { uid, schoolId: userSchoolId, role, loading: userLoading } = useCurrentUser();
  const schoolId = paramSchoolId ?? userSchoolId ?? "";

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paySettings, setPaySettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [studentName, setStudentName] = useState("Student");
  const [confirmedByName, setConfirmedByName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Student payment state
  const [chosenMethod, setChosenMethod] = useState<PaymentMethod | null>(null);
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Manager/coach action state
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    if (!schoolId || !invoiceId) return;
    setLoading(true);
    try {
      const [invSnap, settingsSnap] = await Promise.all([
        getDoc(doc(db, "schools", schoolId, "invoices", invoiceId)),
        getDoc(doc(db, "schools", schoolId, "payment_settings", "main")),
      ]);

      if (invSnap.exists()) {
        const data = invSnap.data() as Omit<Invoice, "id">;
        setInvoice({ id: invSnap.id, ...data });
        setChosenMethod(data.methodChosen ?? null);
        setProofNote(data.proofNote ?? "");

        // Fetch student name
        try {
          const userSnap = await getDoc(doc(db, "users", data.studentUid));
          if (userSnap.exists()) {
            const ud = userSnap.data();
            setStudentName(ud.displayName ?? ud.name ?? ud.email ?? "Student");
          }
        } catch { /* silent */ }

        // Fetch confirmedBy name if present
        if (data.confirmedBy) {
          try {
            const confirmerSnap = await getDoc(doc(db, "users", data.confirmedBy));
            if (confirmerSnap.exists()) {
              const cd = confirmerSnap.data();
              setConfirmedByName(cd.displayName ?? cd.name ?? cd.email ?? null);
            }
          } catch { /* silent */ }
        }
      }

      if (settingsSnap.exists()) {
        setPaySettings({ ...DEFAULT_PAYMENT_SETTINGS, ...settingsSnap.data() });
      }
    } catch (e) {
      console.error("[InvoiceDetails] load error", e);
    } finally {
      setLoading(false);
    }
  }, [schoolId, invoiceId]);

  useEffect(() => {
    if (!userLoading) {
      load();
    }
  }, [userLoading, load]);

  // ── Student: pick proof ──────────────────────────────────────────────────────
  const pickProofImage = useCallback(async () => {
    Alert.alert("Upload Proof", "Choose a source", [
      {
        text: "Camera",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission needed", "Camera permission is required.");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setProofUri(result.assets[0].uri);
            console.log("[InvoiceDetails] proof image selected from camera");
          }
        },
      },
      {
        text: "Photo Library",
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission needed", "Photo library permission is required.");
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setProofUri(result.assets[0].uri);
            console.log("[InvoiceDetails] proof image selected from library");
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);

  // ── Student: submit proof ───────────────────────────────────────────────────
  const handleStudentSubmit = useCallback(async () => {
    if (!invoice || !schoolId || !uid) return;
    if (!chosenMethod) {
      Alert.alert("Select Method", "Please choose a payment method.");
      return;
    }
    if (!proofUri) {
      Alert.alert("Upload Proof", "Please upload a screenshot or proof of payment.");
      return;
    }

    console.log("[Submit] step1: submit started, invoiceId=", invoice.id, "schoolId=", schoolId, "uid=", uid);
    console.log("[Submit] step2: proofUri=", proofUri);

    setUploading(true);
    let downloadURL = "";
    try {
      console.log("[Submit] step3: calling uploadInvoiceProof");
      downloadURL = await uploadInvoiceProof(proofUri, schoolId, invoice.id);
      console.log("[Submit] step6-7: proof uploaded, downloadURL=", downloadURL);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error("[Submit] UPLOAD FAILED - code:", e?.code, "message:", e?.message, "full:", JSON.stringify(err));
      Alert.alert("Upload Failed", `Could not upload proof image.\nError: ${e?.code ?? e?.message ?? String(err)}`);
      setUploading(false);
      return;
    }
    setUploading(false);

    console.log("[Submit] step8: Firestore write started");
    setSubmitting(true);
    try {
      // Update the invoice (source of truth for proof)
      await updateDoc(doc(db, "schools", schoolId, "invoices", invoice.id), {
  methodChosen: chosenMethod,
  proofUrl: downloadURL,
  proofNote: proofNote.trim(),
  submittedAt: serverTimestamp(),
  status: "submitted",
  updatedAt: serverTimestamp(),
});
      console.log("[Submit] step9: invoice write success for invoice", invoice.id);

      // Also sync proof back to the linked payment_request so manager can see it
      const prId = invoice.paymentRequestId;
      if (prId) {
        try {
          await updateDoc(doc(db, "payment_requests", prId), {
            status: "submitted",
            proofUrl: downloadURL,
            proofUploadedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          console.log("[Submit] step10: payment_request synced", prId);
        } catch (syncErr) {
          // Non-fatal: invoice is already updated, manager can still approve via invoice-details
          console.warn("[Submit] payment_request sync failed (non-fatal):", syncErr);
        }
      }

      Alert.alert("Submitted!", "Your payment proof has been sent for review.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error("[Submit] FIRESTORE WRITE FAILED - code:", e?.code, "message:", e?.message);
      Alert.alert("Error", `Failed to submit.\nError: ${e?.code ?? e?.message ?? String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }, [invoice, schoolId, uid, chosenMethod, proofUri, proofNote, router]);

  // ── Manager/Coach: confirm payment ─────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!invoice || !schoolId || !uid) return;
    Alert.alert("Confirm Payment", "Mark this payment as confirmed and paid?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: "default",
        onPress: async () => {
          setActionLoading(true);
          try {
            // Resolve confirmer's display name
            let resolvedName = "Staff";
            try {
              const snap = await getDoc(doc(db, "users", uid));
              if (snap.exists()) {
                const d = snap.data();
                resolvedName = d.displayName ?? d.name ?? d.email ?? "Staff";
              }
            } catch { /* silent */ }

            await updateDoc(doc(db, "schools", schoolId, "invoices", invoice.id), {
              status: "confirmed",
              paid: true,
              paidAt: serverTimestamp(),
              confirmedBy: uid,
              confirmedByName: resolvedName,
              updatedAt: serverTimestamp(),
            });
            console.log("[InvoiceDetails] payment confirmed for invoice", invoice.id);
            await load();
          } catch {
            Alert.alert("Error", "Failed to confirm payment.");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }, [invoice, schoolId, uid, load]);

  // ── Manager/Coach: reject ──────────────────────────────────────────────────
  const handleRejectConfirm = useCallback(async () => {
    if (!invoice || !schoolId) return;
    setShowRejectModal(false);
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "schools", schoolId, "invoices", invoice.id), {
        status: "rejected",
        paid: false,
        rejectedReason: rejectReason.trim() || null,
        updatedAt: serverTimestamp(),
      });
      console.log("[InvoiceDetails] payment rejected for invoice", invoice.id);
      setRejectReason("");
      await load();
    } catch {
      Alert.alert("Error", "Failed to reject payment.");
    } finally {
      setActionLoading(false);
    }
  }, [invoice, schoolId, rejectReason, load]);

  // ── Manager/Coach: reset to pending ───────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (!invoice || !schoolId) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "schools", schoolId, "invoices", invoice.id), {
        status: "pending",
        paid: false,
        proofUrl: null,
        proofNote: "",
        proofUploadedAt: null,
        confirmedBy: null,
        confirmedByName: null,
        rejectedReason: null,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch {
      Alert.alert("Error", "Failed to reset.");
    } finally {
      setActionLoading(false);
    }
  }, [invoice, schoolId, load]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const copyText = (text: string, label: string) => {
    Clipboard.setStringAsync(text).then(() => {
      Alert.alert("Copied", `${label} copied to clipboard.`);
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (userLoading || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: C.textSub }}>Invoice not found.</Text>
      </View>
    );
  }

  const isManager = role === "manager";
  const isCoach = role === "coach";
  const isReviewer = isManager || isCoach;
  const isStudent = role === "student";
  const dueDate = invoice.dueAt?.toDate?.();
  const paidAt = invoice.paidAt?.toDate?.();
  const proofUploadedAt = invoice.proofUploadedAt?.toDate?.();

  // Also handle legacy approvedAt for old documents
  const legacyApprovedDate = (invoice as { approvedAt?: { toDate?: () => Date } }).approvedAt?.toDate?.();
  const displayPaidAt = paidAt ?? legacyApprovedDate;

  // Student can re-submit if rejected
  const canStudentSubmit =
    isStudent &&
    (invoice.status === "pending" ||
      invoice.status === "due" ||
      invoice.status === "rejected");

  // Enabled methods for student picker
  const enabledMethods: PaymentMethod[] = [
    ...(paySettings.pix.enabled ? (["pix"] as PaymentMethod[]) : []),
    ...(paySettings.venmo.enabled ? (["venmo"] as PaymentMethod[]) : []),
    ...(paySettings.zelle.enabled ? (["zelle"] as PaymentMethod[]) : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient
        colors={["#0A1628", "#070D1A"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              padding: 8,
              marginRight: 8,
              borderRadius: 12,
              backgroundColor: C.surface,
            })}
          >
            <ChevronLeft size={22} color={C.text} />
          </Pressable>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: "700", flex: 1 }}>
            Invoice
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 20,
              backgroundColor: statusBg(invoice.status),
            }}
          >
            <StatusIcon status={invoice.status} size={13} />
            <Text style={{ color: statusColor(invoice.status), fontSize: 12, fontWeight: "700" }}>
              {statusLabel(invoice.status)}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount hero */}
          <View
            style={{
              backgroundColor: C.surface,
              borderRadius: 20,
              padding: 24,
              borderWidth: 1,
              borderColor: C.border,
              marginBottom: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {isReviewer ? studentName : "Amount Due"}
            </Text>
            <Text
              style={{
                color: (invoice.status === "confirmed" || invoice.status === "paid") ? C.success : C.text,
                fontSize: 48,
                fontWeight: "800",
                letterSpacing: -1,
                marginTop: 4,
              }}
            >
              {invoice.currency} {invoice.amount.toFixed(2)}
            </Text>
            <Text style={{ color: C.textSub, fontSize: 15, marginTop: 4, textAlign: "center" }}>
              {invoice.description}
            </Text>
            {dueDate && (
              <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 8 }}>
                Due {format(dueDate, "MMMM d, yyyy")}
              </Text>
            )}
          </View>

          {/* ── STUDENT VIEW ──────────────────────────────────────────────── */}

          {/* Student: can submit (pending / due / rejected) */}
          {canStudentSubmit && (
            <>
              {/* Show rejection reason if rejected */}
              {invoice.status === "rejected" && invoice.rejectedReason && (
                <View
                  style={{
                    backgroundColor: C.dangerBg,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: "rgba(248,113,113,0.25)",
                    marginBottom: 16,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <XCircle size={16} color={C.danger} />
                    <Text style={{ color: C.danger, fontWeight: "700", fontSize: 14 }}>Proof Rejected</Text>
                  </View>
                  <Text style={{ color: C.textSub, fontSize: 14 }}>{invoice.rejectedReason}</Text>
                </View>
              )}
              {invoice.status === "rejected" && !invoice.rejectedReason && (
                <View
                  style={{
                    backgroundColor: C.dangerBg,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: "rgba(248,113,113,0.25)",
                    marginBottom: 16,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <XCircle size={16} color={C.danger} />
                    <Text style={{ color: C.danger, fontWeight: "700", fontSize: 14 }}>
                      Proof was rejected. Please resubmit.
                    </Text>
                  </View>
                </View>
              )}

              {enabledMethods.length === 0 ? (
                <InfoCard>
                  <Text style={{ color: C.textSub, textAlign: "center" }}>
                    No payment methods configured yet. Contact your academy manager.
                  </Text>
                </InfoCard>
              ) : (
                <>
                  <SectionHeading label="Choose Payment Method" />
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                    {enabledMethods.map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => setChosenMethod(m)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 14,
                          backgroundColor: chosenMethod === m ? C.goldBg : C.surface,
                          borderWidth: 1,
                          borderColor: chosenMethod === m ? C.gold : C.border,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: chosenMethod === m ? C.gold : C.textSub, fontWeight: "700", fontSize: 14 }}>
                          {m === "pix" ? "PIX" : m === "venmo" ? "Venmo" : "Zelle"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {chosenMethod === "pix" && (
                    <MethodInstructions>
                      <InfoRow label="Key Type" value={paySettings.pix.keyType} onCopy={() => copyText(paySettings.pix.keyType, "Key type")} />
                      <InfoRow label="Key Value" value={paySettings.pix.keyValue} onCopy={() => copyText(paySettings.pix.keyValue, "PIX key")} />
                      {paySettings.pix.qrUrl ? (
                        <View style={{ alignItems: "center", marginTop: 12 }}>
                          <Image source={{ uri: paySettings.pix.qrUrl }} style={{ width: 160, height: 160, borderRadius: 12 }} resizeMode="contain" />
                        </View>
                      ) : null}
                    </MethodInstructions>
                  )}
                  {chosenMethod === "venmo" && (
                    <MethodInstructions>
                      <InfoRow label="Venmo Handle" value={paySettings.venmo.handle} onCopy={() => copyText(paySettings.venmo.handle, "Venmo handle")} />
                      {paySettings.venmo.qrUrl ? (
                        <View style={{ alignItems: "center", marginTop: 12 }}>
                          <Image source={{ uri: paySettings.venmo.qrUrl }} style={{ width: 160, height: 160, borderRadius: 12 }} resizeMode="contain" />
                        </View>
                      ) : null}
                    </MethodInstructions>
                  )}
                  {chosenMethod === "zelle" && (
                    <MethodInstructions>
                      <InfoRow label="Recipient" value={paySettings.zelle.recipientName} onCopy={() => copyText(paySettings.zelle.recipientName, "Recipient name")} />
                      <InfoRow label="Email / Phone" value={paySettings.zelle.contact} onCopy={() => copyText(paySettings.zelle.contact, "Contact")} />
                    </MethodInstructions>
                  )}

                  <SectionHeading label="Upload Proof" />
                  <Pressable
                    onPress={pickProofImage}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? C.surfaceHover : C.surface,
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: proofUri ? C.borderActive : C.border,
                      borderStyle: proofUri ? "solid" : "dashed",
                      alignItems: "center",
                      marginBottom: 12,
                    })}
                  >
                    {proofUri ? (
                      <Image source={{ uri: proofUri }} style={{ width: "100%", height: 200, borderRadius: 12 }} resizeMode="cover" />
                    ) : (
                      <>
                        <ImagePlus size={28} color={C.gold} />
                        <Text style={{ color: C.textSub, fontSize: 14, marginTop: 8 }}>Tap to select screenshot</Text>
                      </>
                    )}
                  </Pressable>

                  <TextInput
                    value={proofNote}
                    onChangeText={setProofNote}
                    placeholder="Optional note (transaction ID, etc.)"
                    placeholderTextColor={C.textMuted}
                    multiline
                    numberOfLines={2}
                    style={{
                      backgroundColor: C.inputBg,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      color: C.text,
                      fontSize: 14,
                      borderWidth: 1,
                      borderColor: C.border,
                      minHeight: 60,
                      textAlignVertical: "top",
                      marginBottom: 20,
                    }}
                  />

                  <Pressable
                    onPress={handleStudentSubmit}
                    disabled={uploading || submitting}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? "rgba(212,160,23,0.8)" : C.gold,
                      borderRadius: 16,
                      paddingVertical: 16,
                      alignItems: "center",
                      opacity: uploading || submitting ? 0.6 : 1,
                    })}
                  >
                    {uploading || submitting ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ActivityIndicator color="#000" size="small" />
                        <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                          {uploading ? "Uploading..." : "Submitting..."}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Send size={18} color="#000" />
                        <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                          {invoice.status === "rejected" ? "Resubmit Payment Proof" : "Submit Payment Proof"}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </>
              )}
            </>
          )}

          {/* Student: proof submitted / waiting */}
          {isStudent && (invoice.status === "submitted" || invoice.status === "proof_uploaded" || invoice.status === "pending_review") && (
            <InfoCard>
              <Clock size={32} color={C.warning} />
              <Text style={{ color: C.text, fontSize: 18, fontWeight: "700", marginTop: 12, textAlign: "center" }}>
                Waiting for Approval
              </Text>
              <Text style={{ color: C.textSub, fontSize: 14, marginTop: 6, textAlign: "center" }}>
                Your payment proof has been submitted and is being reviewed.
              </Text>
            </InfoCard>
          )}

          {/* Student: confirmed / paid */}
          {isStudent && (invoice.status === "confirmed" || invoice.status === "paid") && (
            <View
              style={{
                backgroundColor: C.successBg,
                borderRadius: 20,
                padding: 24,
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.25)",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <CheckCircle size={40} color={C.success} />
              <Text style={{ color: C.success, fontSize: 22, fontWeight: "800", marginTop: 12 }}>
                Paid
              </Text>
              {(invoice.confirmedByName ?? confirmedByName) && (
                <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
                  Confirmed by {invoice.confirmedByName ?? confirmedByName}
                </Text>
              )}
              {displayPaidAt && (
                <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
                  {format(displayPaidAt, "MMMM d, yyyy")}
                </Text>
              )}
            </View>
          )}

          {/* Student: overdue */}
          {isStudent && invoice.status === "overdue" && (
            <InfoCard>
              <AlertCircle size={32} color={C.danger} />
              <Text style={{ color: C.danger, fontSize: 18, fontWeight: "700", marginTop: 12, textAlign: "center" }}>
                Payment Overdue
              </Text>
              <Text style={{ color: C.textSub, fontSize: 14, marginTop: 6, textAlign: "center" }}>
                Please contact your academy to resolve this invoice.
              </Text>
            </InfoCard>
          )}

          {/* ── MANAGER / COACH VIEW ──────────────────────────────────────── */}
          {isReviewer && (
            <>
              {/* Proof preview */}
              {invoice.proofUrl && (
                <>
                  <SectionHeading label="Payment Proof" />
                  <View
                    style={{
                      backgroundColor: C.surface,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: C.border,
                      overflow: "hidden",
                      marginBottom: 16,
                    }}
                  >
                    <Image source={{ uri: invoice.proofUrl }} style={{ width: "100%", height: 220 }} resizeMode="cover" />
                    {invoice.proofNote ? (
                      <View style={{ padding: 14 }}>
                        <Text style={{ color: C.textSub, fontSize: 13 }}>{invoice.proofNote}</Text>
                      </View>
                    ) : null}
                    {invoice.methodChosen && (
                      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                        <Text style={{ color: C.textMuted, fontSize: 12 }}>
                          Paid via <Text style={{ color: C.gold, fontWeight: "700" }}>{invoice.methodChosen.toUpperCase()}</Text>
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Timestamps */}
              {proofUploadedAt && (
                <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 4 }}>
                  Proof uploaded: {format(proofUploadedAt, "MMM d, yyyy 'at' h:mm a")}
                </Text>
              )}
              {displayPaidAt && (
                <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 4 }}>
                  Confirmed: {format(displayPaidAt, "MMM d, yyyy 'at' h:mm a")}
                </Text>
              )}
              {invoice.confirmedByName && (
                <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 16 }}>
                  Confirmed by: {invoice.confirmedByName}
                </Text>
              )}

              {/* Rejection reason (visible to reviewer) */}
              {invoice.status === "rejected" && invoice.rejectedReason && (
                <View
                  style={{
                    backgroundColor: C.dangerBg,
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: "rgba(248,113,113,0.25)",
                    marginBottom: 16,
                  }}
                >
                  <Text style={{ color: C.danger, fontWeight: "700", fontSize: 13, marginBottom: 4 }}>Rejection Reason</Text>
                  <Text style={{ color: C.textSub, fontSize: 14 }}>{invoice.rejectedReason}</Text>
                </View>
              )}

              {/* Confirmed state */}
              {(invoice.status === "confirmed" || invoice.status === "paid") && (
                <View
                  style={{
                    backgroundColor: C.successBg,
                    borderRadius: 20,
                    padding: 20,
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.25)",
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <CheckCircle size={32} color={C.success} />
                  <Text style={{ color: C.success, fontWeight: "700", fontSize: 18, marginTop: 10 }}>
                    Payment Confirmed
                  </Text>
                  {(invoice.confirmedByName ?? confirmedByName) && (
                    <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
                      by {invoice.confirmedByName ?? confirmedByName}
                    </Text>
                  )}
                  {displayPaidAt && (
                    <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
                      {format(displayPaidAt, "MMMM d, yyyy")}
                    </Text>
                  )}
                </View>
              )}

              {/* Actions: only when proof is available and not yet confirmed */}
              {(invoice.status === "submitted" || invoice.status === "proof_uploaded" || invoice.status === "pending_review") && (
                <View style={{ gap: 10, marginTop: 8 }}>
                  <Pressable
                    onPress={handleConfirm}
                    disabled={actionLoading}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? "rgba(52,211,153,0.8)" : C.success,
                      borderRadius: 16,
                      paddingVertical: 16,
                      alignItems: "center",
                      opacity: actionLoading ? 0.6 : 1,
                    })}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ThumbsUp size={18} color="#fff" />
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Confirm Payment</Text>
                      </View>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => setShowRejectModal(true)}
                    disabled={actionLoading}
                    style={({ pressed }) => ({
                      backgroundColor: C.surface,
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: pressed ? "rgba(248,113,113,0.5)" : "rgba(248,113,113,0.25)",
                      opacity: actionLoading ? 0.6 : 1,
                    })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <XCircle size={16} color={C.danger} />
                      <Text style={{ color: C.danger, fontWeight: "600", fontSize: 15 }}>Reject Proof</Text>
                    </View>
                  </Pressable>
                </View>
              )}

              {/* Reset button for manager on rejected/pending/due */}
              {isManager &&
                (invoice.status === "rejected" ||
                  invoice.status === "pending" ||
                  invoice.status === "due") && (
                  <Pressable
                    onPress={handleReset}
                    disabled={actionLoading}
                    style={({ pressed }) => ({
                      backgroundColor: C.surface,
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: C.border,
                      marginTop: 10,
                      opacity: actionLoading ? 0.6 : 1,
                    })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <RotateCcw size={16} color={C.textSub} />
                      <Text style={{ color: C.textSub, fontWeight: "600", fontSize: 15 }}>Reset to Pending</Text>
                    </View>
                  </Pressable>
                )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Reject Modal */}
      <Modal
        visible={showRejectModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRejectModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: C.modalBg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: C.border,
            }}
          >
            <Text style={{ color: C.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Reject Proof</Text>
            <Pressable onPress={() => setShowRejectModal(false)}>
              <Text style={{ color: C.gold, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
          <View style={{ padding: 20 }}>
            <Text style={{ color: C.textSub, fontSize: 14, marginBottom: 12 }}>
              Optionally explain why the proof is being rejected. The student will see this message and can resubmit.
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Wrong amount, unclear image..."
              placeholderTextColor={C.textMuted}
              multiline
              numberOfLines={4}
              style={{
                backgroundColor: C.inputBg,
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: C.text,
                fontSize: 15,
                borderWidth: 1,
                borderColor: C.border,
                minHeight: 100,
                textAlignVertical: "top",
                marginBottom: 20,
              }}
            />
            <Pressable
              onPress={handleRejectConfirm}
              style={({ pressed }) => ({
                backgroundColor: pressed ? "rgba(248,113,113,0.8)" : C.danger,
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: "center",
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <XCircle size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Reject & Notify Student</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function SectionHeading({ label }: { label: string }) {
  return (
    <Text
      style={{
        color: C.textMuted,
        fontSize: 11,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 10,
        marginTop: 4,
      }}
    >
      {label}
    </Text>
  );
}

function MethodInstructions({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 20,
      }}
    >
      {children}
    </View>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase" }}>
          {label}
        </Text>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: "500", marginTop: 2 }}>
          {value || "—"}
        </Text>
      </View>
      {!!value && (
        <Pressable
          onPress={onCopy}
          style={({ pressed }) => ({
            opacity: pressed ? 0.5 : 1,
            padding: 8,
            borderRadius: 10,
            backgroundColor: C.goldBg,
          })}
        >
          <Copy size={14} color={C.gold} />
        </Pressable>
      )}
    </View>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      {children}
    </View>
  );
}
