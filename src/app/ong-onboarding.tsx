/**
 * ONG Onboarding Screen — v2
 *
 * Two entry paths:
 *  A) Invite code  → full registration form → account created immediately
 *  B) Email-only   → full registration form → submitted for admin review
 *
 * Form captures all required OMG fields:
 *   org name, modality, athlete count, description,
 *   city, state, manager name, email, WhatsApp
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  AlertCircle,
  CheckCircle,
  Building2,
  User,
  Mail,
  Hash,
  Phone,
  MapPin,
  Users,
  Dumbbell,
  FileText,
  Key,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  LogIn,
} from "lucide-react-native";
import Animated, { FadeInDown, FadeIn, FadeOut } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { signInAnonymously, signInWithCustomToken } from "firebase/auth";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { useTenantStore } from "@/lib/state/tenant-store";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG = "#0B1220";
const CARD = "#111827";
const BORDER = "rgba(255,255,255,0.10)";
const TEXT = "#FFFFFF";
const TEXT_SUB = "rgba(255,255,255,0.65)";
const TEXT_MUTED = "rgba(255,255,255,0.40)";
const ACCENT = "#10B981";
const ACCENT_BLUE = "#818CF8";
const ERROR_COLOR = "#FCA5A5";

type Step = "choose" | "code" | "form" | "submitted";
type Path = "code" | "email";

interface FormData {
  ongName: string;
  description: string;
  managerName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  athletes: string;
  modality: string;
  password: string; // email path only — never sent for code path
}

const BACKEND_URL = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL!;

// ─── Field component ──────────────────────────────────────────────────────────
function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "words",
  multiline = false,
  maxLength,
  editable = true,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  multiline?: boolean;
  maxLength?: number;
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.fieldRow,
          focused && styles.fieldRowFocused,
          multiline && { height: 88, alignItems: "flex-start", paddingVertical: 12 },
        ]}
      >
        {!!icon && (
          <View style={[styles.fieldIcon, multiline && { marginTop: 2 }]}>{icon}</View>
        )}
        <TextInput
          style={[styles.fieldInput, multiline && { textAlignVertical: "top" }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={TEXT_MUTED}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    </View>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ label, first = false }: { label: string; first?: boolean }) {
  return (
    <Text style={[styles.sectionLabel, !first && { marginTop: 8 }]}>{label}</Text>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function OngOnboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTenant = useTenantStore((s) => s.setTenant);

  const [step, setStep] = useState<Step>("choose");
  const [path, setPath] = useState<Path>("code");

  // Code step
  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [validatedCodeId, setValidatedCodeId] = useState<string | null>(null);

  // Form step
  const [form, setForm] = useState<FormData>({
    ongName: "",
    description: "",
    managerName: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    athletes: "",
    modality: "",
    password: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const setField = (key: keyof FormData) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  };

  // ── Choose path ─────────────────────────────────────────────────────────────
  const handleChoosePath = (chosen: Path) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPath(chosen);
    setStep(chosen === "code" ? "code" : "form");
  };

  // ── Back ────────────────────────────────────────────────────────────────────
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === "code") {
      setCode("");
      setCodeError(null);
      setStep("choose");
    } else if (step === "form") {
      if (path === "code") {
        setStep("code");
      } else {
        setStep("choose");
      }
      setFormError(null);
    } else {
      router.back();
    }
  };

  // ── Validate invite code ─────────────────────────────────────────────────────
  const handleValidateCode = async () => {
    setCodeError(null);
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setCodeError("Por favor, insira o código de acesso.");
      return;
    }

    setCodeLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const codeRef = doc(db, "omg_access_codes", clean);
      const codeSnap = await getDoc(codeRef);

      if (!codeSnap.exists()) {
        setCodeError("Código inválido. Verifique e tente novamente.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      const codeData = codeSnap.data();
      if (codeData.used === true) {
        setCodeError("Este código já foi utilizado.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      if (codeData.active === false) {
        setCodeError("Este código está desativado.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setValidatedCodeId(clean);
      setStep("form");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.error("[ong-onboarding] code error:", e);
      const msg = String(e?.message ?? "");
      if (msg.toLowerCase().includes("offline") || e?.code === "unavailable") {
        setCodeError("Sem conexão. Verifique sua internet.");
      } else {
        setCodeError("Não foi possível verificar o código. Tente novamente.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCodeLoading(false);
    }
  };

  // ── Form validation ──────────────────────────────────────────────────────────
  const validateForm = (): string | null => {
    if (!form.ongName.trim()) return "Informe o nome da ONG ou projeto.";
    if (!form.managerName.trim()) return "Informe o nome do responsável.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Informe um e-mail válido.";
    }
    // Password required only for email path (code path uses anonymous auth)
    if (path === "email") {
      if (!form.password || form.password.length < 6) {
        return "A senha deve ter pelo menos 6 caracteres.";
      }
    }
    return null;
  };

  // ── Submit form ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }

    setFormLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (path === "email") {
        // ── Email path: backend creates Auth user + Firestore docs ─────────
        // organizationType, featureFlags, and role are ALL hardcoded server-side.
        // The client cannot influence those values — monetization is protected.
        const res = await fetch(`${BACKEND_URL}/api/omg/register-direct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ongName: form.ongName.trim(),
            description: form.description.trim(),
            managerName: form.managerName.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
            phone: form.phone.trim(),
            city: form.city.trim(),
            state: form.state.trim().toUpperCase(),
            numberOfAthletes: parseInt(form.athletes) || 0,
            sportModality: form.modality.trim(),
          }),
        });

        const resBody = await res.json().catch(() => ({})) as {
          success?: boolean;
          customToken?: string;
          schoolId?: string;
          ongName?: string;
          error?: string;
          message?: string;
        };

        if (!res.ok) {
          if (res.status === 409) {
            setFormError("Este e-mail já está cadastrado. Use a opção de entrar na tela inicial.");
          } else {
            setFormError(resBody.message ?? "Erro ao criar conta. Tente novamente.");
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }

        if (!resBody.customToken || !resBody.schoolId) {
          setFormError("Resposta inválida do servidor. Tente novamente.");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }

        // Authenticate with the token issued by the backend
        await signInWithCustomToken(auth, resBody.customToken);
        await waitForAuthReady();

        // Hydrate tenant store so the app loads immediately
        setTenant({
          id: resBody.schoolId,
          name: form.ongName.trim(),
          primaryColor: "#10B981",
          secondaryColor: "#059669",
          accentColor: "#10B981",
          organizationType: "ngo",
          featureFlags: {
            payments: false,
            billing: false,
            coachPayouts: false,
            memberships: false,
            financialDashboard: false,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/ong-dashboard");
        return;
      }

      // ── Code path: create school + manager account immediately ─────────────
      await waitForAuthReady();
      if (!auth.currentUser) {
        await signInAnonymously(auth);
        await waitForAuthReady();
      }

      const uid = auth.currentUser!.uid;

      const schoolRef = doc(collection(db, "schools"));
      const schoolId = schoolRef.id;

      await setDoc(schoolRef, {
        name: form.ongName.trim(),
        description: form.description.trim(),
        createdBy: uid,
        setupComplete: true,
        organizationType: "ngo",
        featureFlags: {
          payments: false,
          billing: false,
          coachPayouts: false,
          memberships: false,
          financialDashboard: false,
        },
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        numberOfAthletes: parseInt(form.athletes) || 0,
        sportModality: form.modality.trim(),
        primaryColor: "#10B981",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          name: form.managerName.trim(),
          email: form.email.trim(),
          role: "manager",
          organizationType: "ngo",   // required by /api/omg/invite role check
          schoolId,
          status: "active",
          profileComplete: true,
          beltRank: "white",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Mark access code as used
      if (validatedCodeId) {
        try {
          await updateDoc(doc(db, "omg_access_codes", validatedCodeId), {
            used: true,
            usedBy: uid,
            usedAt: serverTimestamp(),
            schoolId,
          });
        } catch (e) {
          console.warn("[ong-onboarding] could not mark code as used:", e);
        }
      }

      // Audit trail
      try {
        await addDoc(collection(db, "omg_registrations"), {
          schoolId,
          ongName: form.ongName.trim(),
          description: form.description.trim(),
          managerName: form.managerName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          state: form.state.trim().toUpperCase(),
          numberOfAthletes: parseInt(form.athletes) || 0,
          sportModality: form.modality.trim(),
          accessCode: validatedCodeId,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn("[ong-onboarding] audit trail failed:", e);
      }

      setTenant({
        id: schoolId,
        name: form.ongName.trim(),
        primaryColor: "#10B981",
        secondaryColor: "#059669",
        accentColor: "#10B981",
        organizationType: "ngo",
        featureFlags: {
          payments: false,
          billing: false,
          coachPayouts: false,
          memberships: false,
          financialDashboard: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/ong-dashboard");
    } catch (e: any) {
      console.error("[ong-onboarding] submit error:", e);
      const msg = String(e?.message ?? "");
      if (e?.code === "permission-denied" || msg.includes("permissions")) {
        setFormError("Permissão negada. Tente novamente.");
      } else if (e?.code === "unavailable" || msg.toLowerCase().includes("offline")) {
        setFormError("Sem conexão. Verifique sua internet.");
      } else {
        setFormError("Erro ao enviar cadastro. Tente novamente.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setFormLoading(false);
    }
  };

  const isFormReady =
    form.ongName.trim().length > 0 &&
    form.managerName.trim().length > 0 &&
    form.email.trim().length > 0 &&
    (path === "code" || form.password.length >= 6) &&
    !formLoading;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["#0B1220", "#0D1F17"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          {step !== "submitted" && (
            <Pressable onPress={handleBack} style={styles.backButton}>
              <ChevronLeft size={22} color="rgba(255,255,255,0.8)" />
              <Text style={styles.backText}>Voltar</Text>
            </Pressable>
          )}

          {/* Header */}
          <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>ONG / Projeto Social</Text>
            </View>
            <Text style={styles.title}>
              {step === "choose" && "Como deseja acessar?"}
              {step === "code" && "Código de Acesso"}
              {step === "form" && "Cadastro da ONG"}
              {step === "submitted" && "Solicitação Enviada!"}
            </Text>
            <Text style={styles.subtitle}>
              {step === "choose" && "Use seu código de acesso para começar ou entre com sua conta existente."}
              {step === "code" && "Insira o código fornecido pelo OMG para ativar sua conta."}
              {step === "form" &&
                (path === "code"
                  ? "Complete as informações da sua organização."
                  : "Preencha os dados e crie sua conta ONG agora.")}
              {step === "submitted" && "Nossa equipe analisará sua solicitação em breve."}
            </Text>
          </Animated.View>

          {/* ── STEP: choose ── */}
          {step === "choose" && (
            <Animated.View entering={FadeInDown.delay(120).springify()} style={{ gap: 12 }}>
              {/* Card 1 — Code access (primary, routes to OMG code step) */}
              <Pressable
                style={({ pressed }) => [
                  styles.omgCard,
                  styles.omgCardPrimary,
                  pressed && { opacity: 0.78, transform: [{ scale: 0.985 }] },
                ]}
                onPress={() => handleChoosePath("code")}
              >
                <BlurView intensity={30} tint="dark" style={styles.omgCardBlur}>
                  <Text style={[styles.omgCardLabel, styles.omgCardLabelPrimary]}>
                    Tenho um código de acesso
                  </Text>
                  <Text style={styles.omgCardDesc}>
                    Use o código fornecido para iniciar seu cadastro.
                  </Text>
                </BlurView>
              </Pressable>

              {/* Card 2 — Sign in (routes to /signin → OMG users land on /ong-dashboard) */}
              <Pressable
                style={({ pressed }) => [
                  styles.omgCard,
                  pressed && { opacity: 0.78, transform: [{ scale: 0.985 }] },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/signin");
                }}
              >
                <BlurView intensity={18} tint="dark" style={styles.omgCardBlur}>
                  <Text style={styles.omgCardLabel}>Já tenho conta — Entrar</Text>
                  <Text style={styles.omgCardDesc}>Acesse com seu e-mail e senha.</Text>
                </BlurView>
              </Pressable>
            </Animated.View>
          )}

          {/* ── STEP: code ── */}
          {step === "code" && (
            <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.card}>
              <View style={styles.fieldWrapper}>
                <Text style={styles.fieldLabel}>Código de acesso</Text>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldIcon}>
                    <Hash size={18} color={ACCENT} />
                  </View>
                  <TextInput
                    style={[styles.fieldInput, { letterSpacing: 4, fontWeight: "700" }]}
                    value={code}
                    onChangeText={(v) => {
                      setCodeError(null);
                      setCode(v.toUpperCase());
                    }}
                    placeholder="CÓDIGO"
                    placeholderTextColor={TEXT_MUTED}
                    autoCapitalize="characters"
                    editable={!codeLoading}
                  />
                </View>
              </View>

              {!!codeError && (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  exiting={FadeOut.duration(150)}
                  style={styles.errorRow}
                >
                  <AlertCircle size={15} color={ERROR_COLOR} />
                  <Text style={styles.errorText}>{codeError}</Text>
                </Animated.View>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!code.trim() || codeLoading) && styles.primaryButtonDisabled,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
                onPress={handleValidateCode}
                disabled={!code.trim() || codeLoading}
              >
                {codeLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verificar Código</Text>
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* ── STEP: form ── */}
          {step === "form" && (
            <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.card}>
              {path === "code" && (
                <View style={styles.confirmedBanner}>
                  <CheckCircle size={16} color={ACCENT} />
                  <Text style={styles.confirmedText}>Código verificado com sucesso</Text>
                </View>
              )}

              {/* Organization */}
              <SectionLabel label="SOBRE A ORGANIZAÇÃO" first />
              <Field
                icon={<Building2 size={18} color={ACCENT} />}
                label="Nome da ONG / Projeto *"
                value={form.ongName}
                onChange={setField("ongName")}
                placeholder="Ex: Instituto Tatame Social"
                editable={!formLoading}
              />
              <Field
                icon={<Dumbbell size={18} color={TEXT_MUTED} />}
                label="Modalidade esportiva"
                value={form.modality}
                onChange={setField("modality")}
                placeholder="Ex: Jiu-Jitsu, Judô, MMA..."
                editable={!formLoading}
              />
              <Field
                icon={<Users size={18} color={TEXT_MUTED} />}
                label="Nº de atletas atendidos"
                value={form.athletes}
                onChange={setField("athletes")}
                placeholder="Ex: 30"
                keyboardType="numeric"
                autoCapitalize="none"
                editable={!formLoading}
              />
              <Field
                icon={<FileText size={18} color={TEXT_MUTED} />}
                label="Descrição / Missão (opcional)"
                value={form.description}
                onChange={setField("description")}
                placeholder="Breve descrição da missão da organização..."
                multiline
                autoCapitalize="sentences"
                editable={!formLoading}
              />

              {/* Location */}
              <SectionLabel label="LOCALIZAÇÃO" />
              <Field
                icon={<MapPin size={18} color={TEXT_MUTED} />}
                label="Cidade"
                value={form.city}
                onChange={setField("city")}
                placeholder="Ex: São Paulo"
                editable={!formLoading}
              />
              <Field
                icon={<MapPin size={18} color={TEXT_MUTED} />}
                label="Estado (UF)"
                value={form.state}
                onChange={setField("state")}
                placeholder="Ex: SP"
                autoCapitalize="characters"
                maxLength={2}
                editable={!formLoading}
              />

              {/* Manager */}
              <SectionLabel label="RESPONSÁVEL" />
              <Field
                icon={<User size={18} color={TEXT_MUTED} />}
                label="Nome do responsável *"
                value={form.managerName}
                onChange={setField("managerName")}
                placeholder="Ex: João Silva"
                editable={!formLoading}
              />
              <Field
                icon={<Mail size={18} color={TEXT_MUTED} />}
                label="E-mail *"
                value={form.email}
                onChange={setField("email")}
                placeholder="email@ong.org.br"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!formLoading}
              />
              <Field
                icon={<Phone size={18} color={TEXT_MUTED} />}
                label="WhatsApp (opcional)"
                value={form.phone}
                onChange={setField("phone")}
                placeholder="+55 11 99999-9999"
                keyboardType="phone-pad"
                autoCapitalize="none"
                editable={!formLoading}
              />

              {/* Password — only for email path (code path uses anonymous auth) */}
              {path === "email" && (
                <>
                  <SectionLabel label="ACESSO" />
                  <View style={styles.fieldWrapper}>
                    <Text style={styles.fieldLabel}>Senha *</Text>
                    <View style={styles.fieldRow}>
                      <View style={styles.fieldIcon}>
                        <Lock size={18} color={TEXT_MUTED} />
                      </View>
                      <TextInput
                        style={styles.fieldInput}
                        value={form.password}
                        onChangeText={setField("password")}
                        placeholder="Mínimo 6 caracteres"
                        placeholderTextColor={TEXT_MUTED}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        editable={!formLoading}
                      />
                      <Pressable
                        onPress={() => setShowPassword((v) => !v)}
                        hitSlop={8}
                        style={{ paddingLeft: 8 }}
                      >
                        {showPassword
                          ? <EyeOff size={18} color={TEXT_MUTED} />
                          : <Eye size={18} color={TEXT_MUTED} />
                        }
                      </Pressable>
                    </View>
                  </View>
                </>
              )}

              {!!formError && (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  exiting={FadeOut.duration(150)}
                  style={styles.errorRow}
                >
                  <AlertCircle size={15} color={ERROR_COLOR} />
                  <Text style={styles.errorText}>{formError}</Text>
                </Animated.View>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  !isFormReady && styles.primaryButtonDisabled,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
                onPress={handleSubmit}
                disabled={!isFormReady}
              >
                {formLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {path === "code" ? "Criar ONG e Entrar" : "Criar conta e Entrar"}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* ── STEP: submitted ── */}
          {step === "submitted" && (
            <Animated.View
              entering={FadeIn.delay(100).springify()}
              style={[styles.card, { alignItems: "center", gap: 20 }]}
            >
              <View style={styles.successIconWrap}>
                <CheckCircle size={52} color={ACCENT} />
              </View>

              <View style={{ gap: 8, alignItems: "center" }}>
                <Text style={styles.successTitle}>Solicitação enviada!</Text>
                <Text style={styles.successBody}>
                  Nossa equipe analisará seu cadastro e entrará em contato pelo e-mail{" "}
                  <Text style={{ color: ACCENT, fontWeight: "700" }}>{form.email}</Text> em até{" "}
                  <Text style={{ color: TEXT, fontWeight: "700" }}>2 dias úteis</Text>.
                </Text>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>
                  Enquanto isso, você pode explorar o app como visitante ou aguardar o e-mail de confirmação.
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  { width: "100%" },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => router.back()}
              >
                <Text style={styles.primaryButtonText}>Voltar ao início</Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 24, paddingTop: 8 },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 28,
    gap: 4,
  },
  backText: { color: "rgba(255,255,255,0.75)", fontSize: 16, fontWeight: "500" },
  header: { marginBottom: 28 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  badgeText: { color: ACCENT, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: { fontSize: 15, color: TEXT_SUB, lineHeight: 22 },

  // Path cards (choose step)
  pathCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  pathIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pathTitle: { color: TEXT, fontSize: 15, fontWeight: "700" },
  pathSubtitle: { color: TEXT_SUB, fontSize: 13, lineHeight: 18 },

  // OMG entry cards — frosted glass, matches welcome.tsx RoleCard style
  omgCard: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  omgCardPrimary: {
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  omgCardBlur: {
    paddingVertical: 18,
    paddingHorizontal: 22,
    gap: 5,
  },
  omgCardLabel: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: TEXT,
    letterSpacing: -0.2,
  },
  omgCardLabelPrimary: {
    fontSize: 19,
    fontWeight: "700" as const,
  },
  omgCardDesc: {
    fontSize: 13,
    fontWeight: "400" as const,
    color: TEXT_SUB,
    letterSpacing: 0.1,
    lineHeight: 19,
  },

  // Form card
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 14,
  },
  sectionLabel: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: -4,
  },
  confirmedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  confirmedText: { color: ACCENT, fontSize: 13, fontWeight: "600" },

  // Field
  fieldWrapper: { gap: 6 },
  fieldLabel: { color: TEXT_SUB, fontSize: 13, fontWeight: "600", letterSpacing: 0.1 },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  fieldRowFocused: {
    borderColor: "rgba(16,185,129,0.5)",
    backgroundColor: "rgba(16,185,129,0.05)",
  },
  fieldIcon: { marginRight: 10, width: 22, alignItems: "center" },
  fieldInput: { flex: 1, color: TEXT, fontSize: 16, fontWeight: "500" },

  // Error
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: ERROR_COLOR, fontSize: 13, flex: 1, lineHeight: 19 },

  // Button
  primaryButton: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
    marginTop: 4,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", letterSpacing: 0.1 },

  // Submitted screen
  successIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  successTitle: { fontSize: 24, fontWeight: "800", color: TEXT, letterSpacing: -0.5 },
  successBody: { fontSize: 15, color: TEXT_SUB, lineHeight: 23, textAlign: "center" },
  infoBox: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    width: "100%",
  },
  infoBoxText: { color: TEXT_MUTED, fontSize: 13, lineHeight: 20, textAlign: "center" },

  // Sign-in link (choose step footer)
  signInLink: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
  },
  signInLinkText: {
    color: TEXT_MUTED,
    fontSize: 14,
    fontWeight: "500" as const,
  },
});
