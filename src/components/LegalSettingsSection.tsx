import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import {
  FileText,
  Check,
  X,
  ChevronRight,
  Edit3,
  AlertTriangle,
  Globe,
  Shield,
} from "lucide-react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  useSchoolLegalStore,
  type SchoolLegalDocType,
} from "@/lib/legal/school-legal-store";
import {
  useLanguageStore,
  useTranslations,
  type Locale,
  LOCALE_NAMES,
  LOCALE_FLAGS,
  SUPPORTED_LOCALES,
} from "@/lib/i18n";

interface LegalSettingsSectionProps {
  schoolId: string;
}

export function LegalSettingsSection({ schoolId }: LegalSettingsSectionProps) {
  const t = useTranslations();
  const currentLocale = useLanguageStore((s) => s.locale);

  const documents = useSchoolLegalStore((s) => s.documents);
  const isLoading = useSchoolLegalStore((s) => s.isLoading);
  const loadSchoolLegal = useSchoolLegalStore((s) => s.loadSchoolLegal);
  const updateDocumentText = useSchoolLegalStore((s) => s.updateDocumentText);
  const toggleDocumentEnabled = useSchoolLegalStore((s) => s.toggleDocumentEnabled);
  const saveToFirestore = useSchoolLegalStore((s) => s.saveToFirestore);

  // Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<SchoolLegalDocType | null>(null);
  const [editingLocale, setEditingLocale] = useState<Locale>(currentLocale);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load school legal documents on mount
  useEffect(() => {
    loadSchoolLegal(schoolId);
  }, [schoolId, loadSchoolLegal]);

  const docTypeLabels: Record<SchoolLegalDocType, { title: string; description: string; required: boolean }> = {
    waiver: {
      title: t.manager.waiverRequired,
      description: "Students must accept before booking",
      required: true,
    },
    cancellation: {
      title: t.manager.editCancellation,
      description: "Cancellation terms and conditions",
      required: false,
    },
    refund: {
      title: t.manager.editRefund,
      description: "Refund policy details",
      required: false,
    },
  };

  const handleEditDocument = (docType: SchoolLegalDocType) => {
    if (!documents) return;

    setEditingDoc(docType);
    setEditingLocale(currentLocale);
    setEditText(documents[docType].text[currentLocale] || documents[docType].text.en || "");
    setShowEditModal(true);
    setSaveSuccess(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLocaleChange = (locale: Locale) => {
    if (!documents || !editingDoc) return;

    // Save current text before switching
    if (editText !== documents[editingDoc].text[editingLocale]) {
      updateDocumentText(editingDoc, editingLocale, editText);
    }

    setEditingLocale(locale);
    setEditText(documents[editingDoc].text[locale] || "");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async () => {
    if (!editingDoc) return;

    setIsSaving(true);

    // Save current text
    updateDocumentText(editingDoc, editingLocale, editText);

    // Save to Firestore
    await saveToFirestore();

    setIsSaving(false);
    setSaveSuccess(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Close modal after brief delay
    setTimeout(() => {
      setShowEditModal(false);
      setSaveSuccess(false);
    }, 1000);
  };

  const handleToggleEnabled = (docType: SchoolLegalDocType) => {
    toggleDocumentEnabled(docType);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  if (isLoading && !documents) {
    return (
      <View className="items-center justify-center py-12">
        <ActivityIndicator size="large" color="#0070B8" />
        <Text className="text-gray-500 mt-4" style={{ fontFamily: "Outfit_400Regular" }}>
          Loading legal documents...
        </Text>
      </View>
    );
  }

  if (!documents) {
    return (
      <View className="items-center justify-center py-12">
        <AlertTriangle size={40} color="#D97706" />
        <Text className="text-gray-600 mt-4 text-center" style={{ fontFamily: "Outfit_400Regular" }}>
          Could not load legal documents.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.springify()}>
        {/* Section Header */}
        <View className="flex-row items-center mb-4">
          <View className="w-10 h-10 rounded-xl bg-purple-100 items-center justify-center mr-3">
            <Shield size={22} color="#9333EA" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900" style={{ fontFamily: "Poppins_600SemiBold" }}>
              {t.manager.legalSettings}
            </Text>
            <Text className="text-gray-500 text-xs" style={{ fontFamily: "Outfit_400Regular" }}>
              Manage waiver and policies for your school
            </Text>
          </View>
        </View>

        {/* Document Cards */}
        {(["waiver", "cancellation", "refund"] as SchoolLegalDocType[]).map((docType, index) => {
          const doc = documents[docType];
          const info = docTypeLabels[docType];

          return (
            <Animated.View
              key={docType}
              entering={FadeInDown.delay(index * 100).springify()}
            >
              <View
                className="bg-white rounded-2xl p-4 mb-3"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center flex-1">
                    <FileText size={20} color={doc.enabled ? "#9333EA" : "#9CA3AF"} />
                    <View className="ml-3 flex-1">
                      <Text
                        className={`font-semibold ${doc.enabled ? "text-gray-900" : "text-gray-400"}`}
                        style={{ fontFamily: "Outfit_600SemiBold" }}
                      >
                        {info.title}
                      </Text>
                      <Text className="text-gray-500 text-xs" style={{ fontFamily: "Outfit_400Regular" }}>
                        {info.description}
                      </Text>
                    </View>
                  </View>

                  {/* Toggle (not for waiver) */}
                  {!info.required && (
                    <Pressable
                      onPress={() => handleToggleEnabled(docType)}
                      className={`w-12 h-7 rounded-full p-1 ${doc.enabled ? "bg-purple-500" : "bg-gray-300"}`}
                    >
                      <View
                        className={`w-5 h-5 rounded-full bg-white ${doc.enabled ? "ml-auto" : ""}`}
                        style={{
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.2,
                          shadowRadius: 2,
                          elevation: 2,
                        }}
                      />
                    </Pressable>
                  )}

                  {info.required && (
                    <View className="bg-purple-100 px-2 py-1 rounded-full">
                      <Text className="text-purple-700 text-xs font-medium" style={{ fontFamily: "Outfit_500Medium" }}>
                        {t.common.required}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Version info */}
                <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <Text className="text-gray-400 text-xs" style={{ fontFamily: "Outfit_400Regular" }}>
                    v{doc.version} • Updated {new Date(doc.updatedAt).toLocaleDateString()}
                  </Text>

                  <Pressable
                    onPress={() => handleEditDocument(docType)}
                    disabled={!doc.enabled && !info.required}
                    className={`flex-row items-center ${!doc.enabled && !info.required ? "opacity-50" : ""}`}
                  >
                    <Edit3 size={14} color="#9333EA" />
                    <Text className="text-purple-600 text-sm ml-1 font-medium" style={{ fontFamily: "Outfit_500Medium" }}>
                      {t.common.edit}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          );
        })}

        {/* Info Note */}
        <View className="bg-blue-50 rounded-xl p-4 mt-2 flex-row items-start border border-blue-200">
          <Globe size={18} color="#2563EB" />
          <Text className="text-blue-700 text-sm ml-3 flex-1" style={{ fontFamily: "Outfit_400Regular" }}>
            Edit documents in multiple languages (English, Spanish, Portuguese). Students will see the document in their preferred language.
          </Text>
        </View>
      </Animated.View>

      <View className="h-8" />

      {/* Edit Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <Animated.View
            entering={FadeIn}
            className="bg-white rounded-t-3xl"
            style={{ maxHeight: "90%" }}
          >
            {/* Modal Header */}
            <View className="flex-row items-center justify-between p-6 border-b border-gray-100">
              <View>
                <Text className="text-xl font-bold text-gray-900" style={{ fontFamily: "Poppins_600SemiBold" }}>
                  {editingDoc && docTypeLabels[editingDoc].title}
                </Text>
                <Text className="text-gray-500 text-sm" style={{ fontFamily: "Outfit_400Regular" }}>
                  Edit in {LOCALE_FLAGS[editingLocale]} {LOCALE_NAMES[editingLocale]}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowEditModal(false)}
                className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
              >
                <X size={20} color="#6B7280" />
              </Pressable>
            </View>

            {/* Language Selector */}
            <View className="flex-row px-6 py-3 border-b border-gray-100">
              {SUPPORTED_LOCALES.map((locale) => (
                <Pressable
                  key={locale}
                  onPress={() => handleLocaleChange(locale)}
                  className={`flex-row items-center px-4 py-2 rounded-full mr-2 ${
                    editingLocale === locale ? "bg-purple-100" : "bg-gray-100"
                  }`}
                >
                  <Text className="text-lg mr-1">{LOCALE_FLAGS[locale]}</Text>
                  <Text
                    className={`text-sm font-medium ${
                      editingLocale === locale ? "text-purple-700" : "text-gray-600"
                    }`}
                    style={{ fontFamily: "Outfit_500Medium" }}
                  >
                    {LOCALE_NAMES[locale]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Text Editor */}
            <ScrollView className="px-6 py-4" style={{ maxHeight: 400 }}>
              <TextInput
                value={editText}
                onChangeText={setEditText}
                placeholder="Enter document text..."
                multiline
                numberOfLines={20}
                className="bg-gray-50 rounded-xl p-4 text-base text-gray-900 border border-gray-200"
                style={{
                  fontFamily: "Outfit_400Regular",
                  textAlignVertical: "top",
                  minHeight: 300,
                }}
                placeholderTextColor="#9CA3AF"
              />
            </ScrollView>

            {/* Save Button */}
            <View className="p-6 border-t border-gray-100">
              {saveSuccess ? (
                <View className="bg-green-100 rounded-xl py-4 flex-row items-center justify-center">
                  <Check size={20} color="#059669" />
                  <Text className="text-green-700 font-semibold ml-2" style={{ fontFamily: "Outfit_600SemiBold" }}>
                    {t.manager.documentSaved}
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={handleSave}
                  disabled={isSaving}
                  className={`rounded-xl py-4 items-center ${isSaving ? "bg-gray-300" : "bg-purple-600"}`}
                >
                  {isSaving ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-semibold" style={{ fontFamily: "Outfit_600SemiBold" }}>
                      {t.manager.saveChanges}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </ScrollView>
  );
}
