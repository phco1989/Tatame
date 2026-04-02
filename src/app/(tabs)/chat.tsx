import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Send,
  User,
  Sparkles,
  Info,
  HelpCircle,
  BookOpen,
  Award,
  Shield,
  Layers,
  Zap,
  Heart,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import Animated, { FadeInDown, FadeInUp, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/lib/state/auth-store";
import { useTranslations, useLanguageStore } from "@/lib/i18n";
import { buildAiCoachPrompt } from "@/lib/ai/aiCoachTemplates";
import { useTenantStore, selectIsPro } from "@/lib/state/tenant-store";
import { showProRequiredAlert } from "@/lib/premiumAccess";

type PageTab = "guide" | "coach";

interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const COACH_QUICK_TOPICS = [
  { label: "Guard", emoji: "🥋", prompt: "Explain the guard positions in BJJ" },
  { label: "Submissions", emoji: "🤜", prompt: "What are the most effective submission techniques in BJJ?" },
  { label: "Takedowns", emoji: "🤼", prompt: "What are the best takedown techniques for BJJ?" },
  { label: "Safety", emoji: "🛟", prompt: "What safety rules should every BJJ practitioner know?" },
  { label: "Escapes", emoji: "↩️", prompt: "How do I escape bad positions in BJJ?" },
  { label: "Equipment", emoji: "🥋", prompt: "What equipment do I need as a beginner BJJ practitioner?" },
];

interface BulletItemProps {
  text: string;
}

function BulletItem({ text }: BulletItemProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 8 }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: "#FBBF24",
          marginTop: 6,
          marginRight: 10,
          flexShrink: 0,
        }}
      />
      <Text
        style={{
          fontFamily: "Outfit_400Regular",
          color: "rgba(255,255,255,0.8)",
          fontSize: 14,
          lineHeight: 22,
          flex: 1,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

interface AccordionSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionSection({ icon, title, children, defaultOpen = false }: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsOpen((prev) => !prev);
  };

  return (
    <View
      style={{
        marginBottom: 12,
        borderRadius: 16,
        overflow: "hidden",
        borderLeftWidth: isOpen ? 3 : 0,
        borderLeftColor: "#FBBF24",
      }}
    >
      <Pressable
        onPress={handleToggle}
        style={{
          backgroundColor: isOpen ? "#1a2235" : "#111827",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 16,
        }}
      >
        <View
          style={{
            backgroundColor: isOpen ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.07)",
            borderRadius: 10,
            padding: 8,
            marginRight: 12,
          }}
        >
          {icon}
        </View>
        <Text
          style={{
            fontFamily: "Poppins_600SemiBold",
            color: isOpen ? "#FBBF24" : "#FFFFFF",
            fontSize: 15,
            flex: 1,
          }}
        >
          {title}
        </Text>
        {isOpen ? (
          <ChevronUp size={18} color="#FBBF24" />
        ) : (
          <ChevronDown size={18} color="rgba(255,255,255,0.5)" />
        )}
      </Pressable>

      {isOpen && (
        <View
          style={{
            backgroundColor: "#1F2937",
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 16,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

interface CoachMessageBubbleProps {
  message: CoachMessage;
}

function CoachMessageBubble({ message }: CoachMessageBubbleProps) {
  const isOwn = message.role === "user";

  return (
    <Animated.View
      entering={FadeInUp.springify()}
      style={{
        flexDirection: "row",
        marginBottom: 12,
        justifyContent: isOwn ? "flex-end" : "flex-start",
      }}
    >
      {!isOwn && (
        <View
          style={{
            backgroundColor: "rgba(16,185,129,0.15)",
            borderRadius: 999,
            padding: 8,
            marginRight: 8,
            alignSelf: "flex-end",
          }}
        >
          <Sparkles size={16} color="#059669" />
        </View>
      )}
      <View
        style={
          isOwn
            ? {
                maxWidth: "75%",
                backgroundColor: "#FBBF24",
                borderRadius: 16,
                borderBottomRightRadius: 4,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }
            : {
                maxWidth: "75%",
                backgroundColor: "#111827",
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.3)",
                borderRadius: 16,
                borderBottomLeftRadius: 4,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }
        }
      >
        <Text
          style={{
            fontFamily: "Outfit_400Regular",
            fontSize: 15,
            color: isOwn ? "#0B1220" : "#FFFFFF",
            lineHeight: 22,
          }}
        >
          {message.content}
        </Text>
        <Text
          style={{
            fontFamily: "Outfit_400Regular",
            fontSize: 11,
            marginTop: 4,
            color: isOwn ? "rgba(11,18,32,0.6)" : "rgba(255,255,255,0.45)",
          }}
        >
          {new Date(message.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      </View>
      {isOwn && (
        <View
          style={{
            backgroundColor: "rgba(251,191,36,0.15)",
            borderRadius: 999,
            padding: 8,
            marginLeft: 8,
            alignSelf: "flex-end",
          }}
        >
          <User size={16} color="#FBBF24" />
        </View>
      )}
    </Animated.View>
  );
}

export default function HelpScreen() {
  const { topic: topicParam } = useLocalSearchParams<{ topic?: string }>();
  const coachScrollRef = useRef<ScrollView>(null);
  const topicHandledRef = useRef<boolean>(false);
  const user = useAuthStore((s) => s.user);
  const tr = useTranslations();
  const locale = useLanguageStore((s) => s.locale);
  const router = useRouter();
  const isPro = useTenantStore(selectIsPro);

  const [activeTab, setActiveTab] = useState<PageTab>("guide");
  const [inputText, setInputText] = useState<string>("");

  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: tr.aiCoach.welcomeMessage,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [coachLoading, setCoachLoading] = useState<boolean>(false);

  const handleCoachMessage = async (messageText: string) => {
    if (!messageText.trim()) return;

    // Premium gate: block free users from sending chat messages
    if (!isPro) {
      showProRequiredAlert(router, "AI Coach Chat");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage: CoachMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText.trim(),
      timestamp: new Date().toISOString(),
    };

    setCoachMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setCoachLoading(true);

    let assistantContent: string | null = null;

    try {
      const backendUrl = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;

      if (!backendUrl) {
        console.log("[AI Coach] Missing EXPO_PUBLIC_VIBECODE_BACKEND_URL");
        assistantContent = tr.aiCoach.fallback;
      } else {
        const messages = buildAiCoachPrompt(
          messageText,
          locale,
          coachMessages.map((m) => ({ role: m.role, content: m.content }))
        );

        const response = await fetch(`${backendUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages,
            max_completion_tokens: 1000,
          }),
        });

        console.log("[AI Coach] Response status:", response.status);

        if (!response.ok) {
          let errorBody = "";
          try {
            errorBody = await response.text();
          } catch {}
          console.log("[AI Coach] Error response body:", errorBody);
          assistantContent = tr.aiCoach.error;
        } else {
          const data = await response.json();
          const content = data?.output_text;
          if (typeof content === "string" && content.trim().length > 0) {
            assistantContent = content.trim();
          } else {
            console.log("[AI Coach] Unexpected response shape:", JSON.stringify(data));
            assistantContent = tr.aiCoach.error;
          }
        }
      }
    } catch (error) {
      console.log("[AI Coach] Fetch error:", error);
      assistantContent = tr.aiCoach.error;
    } finally {
      setCoachLoading(false);
    }

    if (assistantContent) {
      const assistantMessage: CoachMessage = {
        id: `coach-${Date.now()}`,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date().toISOString(),
      };
      setCoachMessages((prev) => [...prev, assistantMessage]);
    }
  };

  useEffect(() => {
    if (topicParam && !topicHandledRef.current && coachMessages.length === 1 && !coachLoading) {
      topicHandledRef.current = true;
      setActiveTab("coach");
      setTimeout(() => {
        handleCoachMessage(topicParam);
      }, 300);
    }
  }, [topicParam, coachMessages.length, coachLoading]);

  useEffect(() => {
    if (activeTab === "coach") {
      setTimeout(() => {
        coachScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [coachMessages.length, activeTab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: "#0B1220" }}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <LinearGradient
          colors={["#111827", "#1F2937"]}
          style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 }}
        >
          <Animated.View entering={FadeIn.duration(400)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <View
              style={{
                backgroundColor: "rgba(251,191,36,0.15)",
                borderRadius: 12,
                padding: 8,
                marginRight: 12,
              }}
            >
              <HelpCircle size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text
                style={{
                  fontFamily: "Poppins_700Bold",
                  color: "#FFFFFF",
                  fontSize: 20,
                  lineHeight: 26,
                }}
              >
                {tr.chat.helpSupport}
              </Text>
              <Text
                style={{
                  fontFamily: "Outfit_400Regular",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12,
                }}
              >
                {tr.chat.helpSubtitle}
              </Text>
            </View>
          </Animated.View>

          {/* Tab Toggle */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 4,
              marginTop: 14,
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab("guide");
              }}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: activeTab === "guide" ? "rgba(251,191,36,0.2)" : "transparent",
              }}
            >
              <BookOpen
                size={15}
                color={activeTab === "guide" ? "#FBBF24" : "rgba(255,255,255,0.55)"}
              />
              <Text
                style={{
                  marginLeft: 6,
                  fontFamily: "Outfit_500Medium",
                  fontSize: 14,
                  color: activeTab === "guide" ? "#FBBF24" : "rgba(255,255,255,0.55)",
                }}
              >
                {tr.chat.bjjGuide}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab("coach");
              }}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: activeTab === "coach" ? "rgba(16,185,129,0.2)" : "transparent",
              }}
            >
              <Sparkles
                size={15}
                color={activeTab === "coach" ? "#10B981" : "rgba(255,255,255,0.55)"}
              />
              <Text
                style={{
                  marginLeft: 6,
                  fontFamily: "Outfit_500Medium",
                  fontSize: 14,
                  color: activeTab === "coach" ? "#10B981" : "rgba(255,255,255,0.55)",
                }}
              >
                {tr.chat.askCoachAi}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        {/* BJJ Guide Tab */}
        {activeTab === "guide" && (
          <ScrollView
            style={{ flex: 1, backgroundColor: "#0B1220" }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero Banner */}
            <Animated.View entering={FadeInDown.delay(50).springify()}>
              <LinearGradient
                colors={["#1a2a1a", "#111827"]}
                style={{
                  borderRadius: 20,
                  padding: 20,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.2)",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    backgroundColor: "rgba(16,185,129,0.15)",
                    borderRadius: 16,
                    padding: 14,
                    marginRight: 14,
                  }}
                >
                  <Award size={30} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Poppins_700Bold",
                      color: "#FFFFFF",
                      fontSize: 17,
                      marginBottom: 4,
                    }}
                  >
                    {tr.chat.journeyTitle}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Outfit_400Regular",
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 13,
                      lineHeight: 19,
                    }}
                  >
                    {tr.chat.journeySubtitle}
                  </Text>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* Accordion Sections */}
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <AccordionSection
                icon={<BookOpen size={18} color="#FBBF24" />}
                title={tr.chat.gettingStarted}
                defaultOpen={true}
              >
                <BulletItem text={tr.guide.whatToBring} />
                <BulletItem text={tr.guide.arriveEarly} />
                <BulletItem text={tr.guide.introduceYourself} />
                <BulletItem text={tr.guide.normalToFeel} />
                <BulletItem text={tr.guide.noExperience} />
              </AccordionSection>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(130).springify()}>
              <AccordionSection
                icon={<Award size={18} color="#FBBF24" />}
                title={tr.chat.beltSystem}
              >
                <BulletItem text={tr.guide.whiteBelt} />
                <BulletItem text={tr.guide.blueBelt} />
                <BulletItem text={tr.guide.purpleBelt} />
                <BulletItem text={tr.guide.brownBelt} />
                <BulletItem text={tr.guide.blackBelt} />
                <BulletItem text={tr.guide.fourStripes} />
                <BulletItem text={tr.guide.progressionBased} />
              </AccordionSection>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(160).springify()}>
              <AccordionSection
                icon={<Shield size={18} color="#FBBF24" />}
                title={tr.chat.trainingEtiquette}
              >
                <BulletItem text={tr.guide.alwaysTap} />
                <BulletItem text={tr.guide.keepNails} />
                <BulletItem text={tr.guide.washGi} />
                <BulletItem text={tr.guide.bowMat} />
                <BulletItem text={tr.guide.respectPartners} />
                <BulletItem text={tr.guide.higherBelts} />
                <BulletItem text={tr.guide.communicate} />
              </AccordionSection>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(190).springify()}>
              <AccordionSection
                icon={<Layers size={18} color="#FBBF24" />}
                title={tr.chat.fundamentalPositions}
              >
                <BulletItem text={tr.guide.mount} />
                <BulletItem text={tr.guide.guard} />
                <BulletItem text={tr.guide.sideControl} />
                <BulletItem text={tr.guide.backControl} />
                <BulletItem text={tr.guide.turtle} />
                <BulletItem text={tr.guide.halfGuard} />
              </AccordionSection>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(220).springify()}>
              <AccordionSection
                icon={<Zap size={18} color="#FBBF24" />}
                title={tr.chat.coreTechniques}
              >
                <BulletItem text={tr.guide.rnc} />
                <BulletItem text={tr.guide.armbar} />
                <BulletItem text={tr.guide.triangleChoke} />
                <BulletItem text={tr.guide.kimura} />
                <BulletItem text={tr.guide.guillotine} />
                <BulletItem text={tr.guide.omoplata} />
              </AccordionSection>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(250).springify()}>
              <AccordionSection
                icon={<Heart size={18} color="#FBBF24" />}
                title={tr.chat.injuryPrevention}
              >
                <BulletItem text={tr.guide.warmUp} />
                <BulletItem text={tr.guide.tapEarly} />
                <BulletItem text={tr.guide.communicateInjuries} />
                <BulletItem text={tr.guide.noOpenWounds} />
                <BulletItem text={tr.guide.hydrate} />
                <BulletItem text={tr.guide.rest} />
              </AccordionSection>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(280).springify()}>
              <AccordionSection
                icon={<HelpCircle size={18} color="#FBBF24" />}
                title={tr.chat.faq}
              >
                <BulletItem text={tr.guide.howOften} />
                <BulletItem text={tr.guide.needGi} />
                <BulletItem text={tr.guide.nextBelt} />
                <BulletItem text={tr.guide.compete} />
                <BulletItem text={tr.guide.isSafe} />
              </AccordionSection>
            </Animated.View>

            {/* Footer tip */}
            <Animated.View entering={FadeInDown.delay(310).springify()}>
              <View
                style={{
                  backgroundColor: "#111827",
                  borderRadius: 16,
                  padding: 16,
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: "rgba(6,182,212,0.2)",
                  flexDirection: "row",
                  alignItems: "flex-start",
                }}
              >
                <Info size={15} color="#06B6D4" style={{ marginTop: 1 }} />
                <Text
                  style={{
                    fontFamily: "Outfit_400Regular",
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 13,
                    flex: 1,
                    marginLeft: 10,
                    lineHeight: 19,
                  }}
                >
                  {tr.chat.footerTip}{" "}
                  <Text style={{ color: "#10B981", fontFamily: "Outfit_500Medium" }}>
                    {tr.chat.askCoachAi}
                  </Text>{" "}
                  {tr.chat.footerTipEnd}
                </Text>
              </View>
            </Animated.View>
          </ScrollView>
        )}

        {/* Ask Coach AI Tab */}
        {activeTab === "coach" && (
          <>
              <ScrollView
              ref={coachScrollRef}
              style={{ flex: 1, backgroundColor: "#0B1220" }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {coachMessages.map((message) => (
                <CoachMessageBubble key={message.id} message={message} />
              ))}

              {coachLoading && (
                <Animated.View
                  entering={FadeIn}
                  style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
                >
                  <View
                    style={{
                      backgroundColor: "rgba(16,185,129,0.15)",
                      borderRadius: 999,
                      padding: 8,
                      marginRight: 8,
                    }}
                  >
                    <Sparkles size={16} color="#059669" />
                  </View>
                  <View
                    style={{
                      backgroundColor: "#111827",
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.3)",
                      borderRadius: 16,
                      borderBottomLeftRadius: 4,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                  >
                    <ActivityIndicator size="small" color="#059669" />
                  </View>
                </Animated.View>
              )}

              {coachMessages.length <= 1 && (
                <View style={{ marginTop: 16 }}>
                  <Text
                    style={{
                      fontFamily: "Outfit_400Regular",
                      color: "rgba(255,255,255,0.45)",
                      fontSize: 13,
                      marginBottom: 12,
                    }}
                  >
                    {tr.chat.quickTopics}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {COACH_QUICK_TOPICS.map((topic, index) => (
                      <Animated.View
                        key={topic.label}
                        entering={FadeInDown.delay(index * 50).springify()}
                        style={{ marginRight: 8, marginBottom: 8 }}
                      >
                        <Pressable
                          onPress={() => handleCoachMessage(topic.prompt)}
                          disabled={coachLoading}
                          style={{
                            backgroundColor: "rgba(16,185,129,0.1)",
                            borderWidth: 1,
                            borderColor: "rgba(16,185,129,0.3)",
                            borderRadius: 999,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Outfit_500Medium",
                              color: "#10B981",
                              fontSize: 13,
                            }}
                          >
                            {topic.emoji} {topic.label}
                          </Text>
                        </Pressable>
                      </Animated.View>
                    ))}
                  </View>
                </View>
              )}

              <View
                style={{
                  backgroundColor: "#1F2937",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: 12,
                  marginTop: 16,
                  flexDirection: "row",
                  alignItems: "flex-start",
                }}
              >
                <Info size={14} color="#6B7280" />
                <Text
                  style={{
                    fontFamily: "Outfit_400Regular",
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 12,
                    flex: 1,
                    marginLeft: 8,
                    lineHeight: 18,
                  }}
                >
                  {tr.aiCoach.disclaimer}
                </Text>
              </View>
            </ScrollView>

            {/* Coach Input Area */}
            <View
              style={{
                backgroundColor: "#111827",
                borderTopWidth: 1,
                borderTopColor: "rgba(255,255,255,0.08)",
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 24,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={tr.aiCoach.placeholder}
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={{
                    flex: 1,
                    backgroundColor: "#1F2937",
                    borderRadius: 20,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    color: "#FFFFFF",
                    marginRight: 12,
                    fontFamily: "Outfit_400Regular",
                    fontSize: 15,
                  }}
                  multiline
                  maxLength={500}
                  editable={!coachLoading}
                />
                <Pressable
                  onPress={() => handleCoachMessage(inputText)}
                  disabled={!inputText.trim() || coachLoading}
                  style={{
                    backgroundColor:
                      inputText.trim() && !coachLoading ? "#10B981" : "#1F2937",
                    borderRadius: 999,
                    padding: 12,
                  }}
                >
                  {coachLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Send size={20} color={inputText.trim() ? "white" : "#6B7280"} />
                  )}
                </Pressable>
              </View>
            </View>
            </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
