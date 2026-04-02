import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { ChevronLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTranslations } from "@/lib/i18n";
import { LanguagePill } from "@/components/LanguagePill";

const { width, height } = Dimensions.get("window");

type RoleSelection = null | "student" | "coach";

// Split a label like "Sou Professor" → ["Sou ", "Professor"]
const PREFIXES = ["I'm a ", "I'm an ", "Soy ", "Sou ", "I manage ", "Eu gerencio ", "Administro "];

function splitLabel(label: string): { prefix: string; main: string } {
  for (const p of PREFIXES) {
    if (label.startsWith(p)) {
      return { prefix: p, main: label.slice(p.length) };
    }
  }
  return { prefix: "", main: label };
}

// Premium frosted glass card button
interface RoleCardProps {
  label: string;
  description: string;
  onPress: () => void;
  primary?: boolean;
}

function RoleCard({ label, description, onPress, primary = false }: RoleCardProps) {
  const { prefix, main } = splitLabel(label);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.roleCard,
        primary && styles.roleCardPrimary,
        pressed && styles.roleCardPressed,
      ]}
      onPress={onPress}
    >
      <BlurView
        intensity={primary ? 30 : 18}
        tint="dark"
        style={styles.roleCardBlur}
      >
        <View style={styles.roleCardInner}>
          <Text style={[styles.roleCardLabel, primary && styles.roleCardLabelPrimary]} numberOfLines={1}>
            {prefix ? (
              <>
                <Text style={styles.roleCardLabelPrefix}>{prefix}</Text>
                {main}
              </>
            ) : label}
          </Text>
        </View>
      </BlurView>
    </Pressable>
  );
}

// Action button (join / sign in sub-screen)
interface ActionButtonProps {
  label: string;
  onPress: () => void;
}

function ActionButton({ label, onPress }: ActionButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.roleCard,
        pressed && styles.roleCardPressed,
      ]}
      onPress={onPress}
    >
      <BlurView intensity={18} tint="dark" style={styles.roleCardBlur}>
        <View style={styles.roleCardInner}>
          <Text style={styles.roleCardLabel}>{label}</Text>
        </View>
      </BlurView>
    </Pressable>
  );
}

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedRole, setSelectedRole] = useState<RoleSelection>(null);
  const t = useTranslations();

  // ── onPress handlers — NOT ALTERED ──────────────────────────────────────
  const handleStudent = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRole("student");
  };

  const handleCoach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRole("coach");
  };

  const handleManager = () => {
    router.push("/manager");
  };

  const handleOng = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/ong-onboarding");
  };

  const handleJoinWithInvite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    console.log("[welcome] Navigating to /join with role:", selectedRole || "student");
    router.push({ pathname: "/join", params: { role: selectedRole || "student" } });
  };

  const handleSignIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    console.log("[welcome] Navigating to /signin with role:", selectedRole || "student");
    router.push({ pathname: "/signin", params: { role: selectedRole || "student" } });
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRole(null);
  };
  // ────────────────────────────────────────────────────────────────────────

  // ── Sub-screen: role selected → join / sign-in ───────────────────────
  if (selectedRole) {
    const roleTitle = selectedRole === "coach" ? t.welcome.coach : t.welcome.student;

    return (
      <View style={styles.container}>
        <View style={styles.imageContainer} pointerEvents="none">
          <Image
            source={require("../../assets/images/bjj-hero-2.png")}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        <View style={styles.overlayContainer} pointerEvents="none">
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.88)"]}
            locations={[0, 0.45, 1]}
            style={styles.gradient}
          />
        </View>

        <View
          style={[
            styles.content,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
          ]}
        >
          <Pressable onPress={handleBack} style={styles.backButton}>
            <ChevronLeft size={22} color="rgba(255,255,255,0.9)" />
            <Text style={styles.backText}>{t.common.back}</Text>
          </Pressable>

          <View style={styles.heroSection}>
            <Text style={styles.title}>{roleTitle}</Text>
            <Text style={styles.positioning}>{t.welcome.howContinue}</Text>
          </View>

          <View style={styles.middleSpacer} />

          <View style={styles.buttonSection}>
            {/* onPress handlers unchanged */}
            <ActionButton label={t.welcome.joinInvite} onPress={handleJoinWithInvite} />
            <ActionButton label={t.welcome.signIn} onPress={handleSignIn} />
          </View>
        </View>
      </View>
    );
  }

  // ── Main landing page ─────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Background image — source unchanged */}
      <View style={styles.imageContainer} pointerEvents="none">
        <Image
          source={require("../../assets/images/bjj-hero.png")}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      </View>

      {/* Subtle dark gradient top + bottom for readability */}
      <View style={styles.overlayContainer} pointerEvents="none">
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.68)",
            "rgba(0,0,0,0.18)",
            "rgba(0,0,0,0.18)",
            "rgba(0,0,0,0.82)",
          ]}
          locations={[0, 0.28, 0.58, 1]}
          style={styles.gradient}
        />
      </View>

      {/* Language pill — top-right, minimal premium pill */}
      <View style={[styles.languagePillContainer, { top: insets.top + 14 }]}>
        <LanguagePill />
      </View>

      {/* Main content */}
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 20 },
        ]}
      >
        {/* Hero */}
        <View style={styles.heroSection}>
          <Text style={styles.title}>TATAME</Text>
          <View style={styles.wordmarkDivider} />
          <Text style={styles.positioning}>{t.welcome.positioning}</Text>

          <View style={styles.taglineSection}>
            <Text style={styles.tagline}>{t.welcome.tagline1}</Text>
            <Text style={styles.tagline}>{t.welcome.tagline2}</Text>
            <Text style={styles.tagline}>{t.welcome.tagline3}</Text>
            <Text style={styles.tagline}>{t.welcome.tagline4}</Text>
          </View>
        </View>

        <View style={styles.middleSpacer} />

        {/* Role cards — visual order: Manager (primary), Coach, Student */}
        {/* onPress handlers remain attached to their original role actions */}
        <View style={styles.buttonSection}>
          <RoleCard
            label={t.welcome.manager}
            description={t.welcome.managerDescription}
            onPress={handleManager}   /* handleManager → /manager */
            primary
          />
          <RoleCard
            label={t.welcome.coach}
            description={t.welcome.coachDescription}
            onPress={handleCoach}     /* handleCoach → setSelectedRole("coach") */
          />
          <RoleCard
            label={t.welcome.student}
            description={t.welcome.studentDescription}
            onPress={handleStudent}   /* handleStudent → setSelectedRole("student") */
          />
          <RoleCard
            label="ONG / Projeto Social"
            description="Acesso via código para organizações sociais"
            onPress={handleOng}
          />
        </View>

        {/* Trust line */}
        <Text style={styles.trustLine}>{t.welcome.trustLine}</Text>

        {/* Legal + footer */}
        <View style={styles.bottomSection}>
          <View style={styles.legalSection}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/legal/terms");
              }}
              style={({ pressed }) => [pressed && styles.legalLinkPressed]}
            >
              <Text style={styles.legalLink}>{t.welcome.termsLabel}</Text>
            </Pressable>
            <Text style={styles.legalDot}>•</Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/legal/privacy");
              }}
              style={({ pressed }) => [pressed && styles.legalLinkPressed]}
            >
              <Text style={styles.legalLink}>{t.welcome.privacyLabel}</Text>
            </Pressable>
          </View>

          <Text style={styles.brandingFooter}>{t.welcome.poweredBy}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  languagePillContainer: {
    position: "absolute",
    right: 20,
    zIndex: 10,
  },
  imageContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  backgroundImage: {
    width,
    height,
  },
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    zIndex: 2,
    paddingHorizontal: 28,
    justifyContent: "flex-start",
  },
  middleSpacer: {
    flex: 1,
  },
  // Back button (sub-screen)
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
    alignSelf: "flex-start",
  },
  backText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 2,
  },
  // Hero
  heroSection: {
    alignItems: "center",
  },
  title: {
    fontSize: 52,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 8,
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 14,
  },
  wordmarkDivider: {
    width: 120,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignSelf: "center",
    marginBottom: 14,
  },
  positioning: {
    fontSize: 19,
    fontWeight: "500",
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    letterSpacing: 0.1,
    marginBottom: 28,
  },
  taglineSection: {
    alignItems: "center",
    gap: 6,
  },
  tagline: {
    fontSize: 16,
    fontWeight: "400",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.1,
    lineHeight: 24,
    textAlign: "center",
  },
  // Buttons
  buttonSection: {
    gap: 12,
  },
  // Role card (frosted glass)
  roleCard: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  roleCardPrimary: {
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  roleCardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  roleCardBlur: {
    paddingVertical: 16,
    paddingHorizontal: 22,
  },
  roleCardInner: {
    gap: 3,
  },
  roleCardLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  roleCardLabelPrimary: {
    fontSize: 19,
    fontWeight: "700",
  },
  roleCardLabelPrefix: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.1,
  },
  roleCardDescription: {
    fontSize: 13,
    fontWeight: "400",
    color: "rgba(255,255,255,0.62)",
    letterSpacing: 0.1,
  },
  // Trust line
  trustLine: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    marginTop: 16,
    letterSpacing: 0.1,
  },
  // Bottom legal + branding
  bottomSection: {
    paddingTop: 18,
    paddingBottom: 4,
    alignItems: "center",
  },
  legalSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 14,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(255,255,255,0.55)",
    textDecorationLine: "underline",
  },
  legalLinkPressed: {
    opacity: 0.45,
  },
  legalDot: {
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
  },
  brandingFooter: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    letterSpacing: 5,
  },
});
