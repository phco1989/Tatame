import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  X,
  Calendar,
  Clock,
  User,
  UserCheck,
  ChevronDown,
  CheckCircle,
  AlertCircle,
} from "lucide-react-native";
import { db, auth } from "@/lib/firebase-config";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import type { Booking } from "@/types";
import { scheduleLessonReminders } from "@/lib/notifications/lesson-notifications";

interface Coach {
  id: string;
  name: string;
  email: string;
  displayName?: string;
  role: string;
}

interface ConfirmLessonModalProps {
  visible: boolean;
  booking: Booking | null;
  schoolId: string;
  onClose: () => void;
  onConfirmed: () => void;
}

// Helper to format time from HH:MM to 12-hour format
function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function ConfirmLessonModal({
  visible,
  booking,
  schoolId,
  onClose,
  onConfirmed,
}: ConfirmLessonModalProps) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [showCoachPicker, setShowCoachPicker] = useState(false);

  // Fetch coaches when modal opens
  useEffect(() => {
    if (visible) {
      fetchCoaches();
    }
    if (!visible) {
      // Reset state when modal closes
      setSelectedCoachId(null);
      setShowCoachPicker(false);
      setCoachError(null);
    }
  }, [visible, schoolId, booking?.academyId]);

  const fetchCoaches = async () => {
    setLoadingCoaches(true);
    setCoachError(null);
    try {
      const usersRef = collection(db, "users");

      // Determine effective schoolId: prefer booking's academyId, then passed schoolId
      const effectiveSchoolId = booking?.academyId || schoolId;

      // Build query: always filter by role == "coach"
      // If effectiveSchoolId exists (not super manager), also filter by schoolId
      let q;
      if (effectiveSchoolId) {
        // Normal manager: filter by schoolId and role
        q = query(
          usersRef,
          where("role", "==", "coach"),
          where("schoolId", "==", effectiveSchoolId)
        );
      } else {
        // Super manager (no schoolId): list all coaches
        q = query(
          usersRef,
          where("role", "==", "coach")
        );
      }

      const snapshot = await getDocs(q);
      const fetchedCoaches: Coach[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Only include active coaches
        if (data.status !== "disabled" && data.active !== false) {
          fetchedCoaches.push({
            id: doc.id,
            name: data.displayName || data.name || data.email || "Unknown Coach",
            email: data.email || "",
            displayName: data.displayName,
            role: data.role,
          });
        }
      });
      setCoaches(fetchedCoaches);

      if (fetchedCoaches.length === 0) {
        setCoachError("No coaches available for this school. Please add coaches first.");
      }
    } catch (error: any) {
      console.error("[ConfirmLessonModal] Error fetching coaches:", error);
      if (error.code === "permission-denied") {
        setCoachError(
          "Coach list unavailable (permissions). Please update Firestore rules to allow manager to read coaches in the same school."
        );
      } else {
        setCoachError(`Failed to load coaches: ${error.message}`);
      }
    } finally {
      setLoadingCoaches(false);
    }
  };

  const handleConfirm = async () => {
    if (!booking || !selectedCoachId || !auth.currentUser) {
      Alert.alert("Error", "Please select a coach to confirm this lesson.");
      return;
    }

    setConfirming(true);
    try {
      const bookingRef = doc(db, "bookings", booking.id);
      // Only update the required fields to comply with Firestore rules
      // coachId must be the coach's user document id (auth uid), NOT email
      await updateDoc(bookingRef, {
        status: "confirmed",
        coachId: selectedCoachId,
        confirmedBy: auth.currentUser.uid,
        confirmedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Schedule lesson reminders (best-effort, non-blocking)
      // Only schedule if we have the required date/time fields
      if (booking.classDate && booking.classStartTime) {
        scheduleLessonReminders({
          bookingId: booking.id,
          lessonDate: booking.classDate,
          lessonStartTime: booking.classStartTime,
          customerName: booking.customerName,
        }).catch((err) => {
          // Don't block confirmation if notifications fail
          console.log("[ConfirmLessonModal] Failed to schedule reminders:", err);
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirmed();
      onClose();
    } catch (error: any) {
      console.error("[ConfirmLessonModal] Error confirming booking:", error);
      Alert.alert(
        "Error",
        `Failed to confirm lesson: ${error.message}`
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setConfirming(false);
    }
  };

  const selectedCoach = coaches.find((c) => c.id === selectedCoachId);

  if (!booking) return null;

  const lessonDate = new Date(booking.dateTime);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-end">
        <Animated.View
          entering={SlideInUp.springify().damping(20)}
          className="bg-white rounded-t-3xl max-h-[85%]"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
            <Text
              className="text-xl font-bold text-gray-900"
              style={{ fontFamily: "Poppins_600SemiBold" }}
            >
              Confirm Lesson
            </Text>
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
            >
              <X size={20} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false}>
            {/* Booking Details Card */}
            <Animated.View
              entering={FadeIn.delay(100)}
              className="bg-gray-50 rounded-2xl p-4 mb-4"
            >
              <Text
                className="text-sm text-gray-500 mb-2"
                style={{ fontFamily: "Outfit_400Regular" }}
              >
                Lesson Details
              </Text>

              {/* Student Name */}
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-xl bg-ocean/10 items-center justify-center mr-3">
                  <User size={20} color="#0070B8" />
                </View>
                <View>
                  <Text
                    className="text-base font-semibold text-gray-900"
                    style={{ fontFamily: "Outfit_600SemiBold" }}
                  >
                    {booking.customerName}
                  </Text>
                  <Text
                    className="text-sm text-gray-500"
                    style={{ fontFamily: "Outfit_400Regular" }}
                  >
                    {booking.level} - {booking.classType.replace("_", " ")}
                  </Text>
                </View>
              </View>

              {/* Date */}
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-xl bg-purple-100 items-center justify-center mr-3">
                  <Calendar size={20} color="#8B5CF6" />
                </View>
                <View>
                  <Text
                    className="text-base font-semibold text-gray-900"
                    style={{ fontFamily: "Outfit_600SemiBold" }}
                  >
                    {lessonDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                  <Text
                    className="text-sm text-gray-500"
                    style={{ fontFamily: "Outfit_400Regular" }}
                  >
                    {booking.classStartTime
                      ? `${formatTime(booking.classStartTime)} - ${formatTime(booking.classEndTime)}`
                      : "Time TBD"}
                  </Text>
                </View>
              </View>

              {/* Price */}
              <View className="flex-row items-center justify-between pt-3 border-t border-gray-200">
                <Text
                  className="text-gray-500"
                  style={{ fontFamily: "Outfit_400Regular" }}
                >
                  Total Price
                </Text>
                <Text
                  className="text-lg font-bold text-ocean"
                  style={{ fontFamily: "Poppins_700Bold" }}
                >
                  ${booking.totalPrice}
                </Text>
              </View>
            </Animated.View>

            {/* Coach Picker */}
            <Animated.View entering={FadeIn.delay(200)} className="mb-4">
              <Text
                className="text-sm text-gray-500 mb-2"
                style={{ fontFamily: "Outfit_400Regular" }}
              >
                Assign Coach
              </Text>

              {loadingCoaches ? (
                <View className="bg-gray-50 rounded-2xl p-6 items-center">
                  <ActivityIndicator size="small" color="#0070B8" />
                  <Text
                    className="text-gray-500 mt-2"
                    style={{ fontFamily: "Outfit_400Regular" }}
                  >
                    Loading coaches...
                  </Text>
                </View>
              ) : coachError ? (
                <View className="bg-red-50 rounded-2xl p-4">
                  <View className="flex-row items-start">
                    <AlertCircle size={20} color="#DC2626" />
                    <Text
                      className="text-red-700 ml-2 flex-1"
                      style={{ fontFamily: "Outfit_400Regular" }}
                    >
                      {coachError}
                    </Text>
                  </View>
                  <Pressable
                    onPress={fetchCoaches}
                    className="mt-3 bg-red-100 rounded-lg py-2 px-4 self-start"
                  >
                    <Text
                      className="text-red-700"
                      style={{ fontFamily: "Outfit_500Medium" }}
                    >
                      Retry
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Selected Coach Display / Picker Toggle */}
                  <Pressable
                    onPress={() => {
                      setShowCoachPicker(!showCoachPicker);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    className={`flex-row items-center justify-between p-4 rounded-2xl border-2 ${
                      selectedCoachId
                        ? "bg-green-50 border-green-200"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <View className="flex-row items-center flex-1">
                      <View
                        className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                          selectedCoachId ? "bg-green-100" : "bg-gray-100"
                        }`}
                      >
                        {selectedCoachId ? (
                          <UserCheck size={20} color="#059669" />
                        ) : (
                          <User size={20} color="#6B7280" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`font-medium ${
                            selectedCoachId ? "text-green-800" : "text-gray-500"
                          }`}
                          style={{ fontFamily: "Outfit_500Medium" }}
                        >
                          {selectedCoach?.name || "Select a coach"}
                        </Text>
                        {selectedCoach?.email && (
                          <Text
                            className="text-sm text-gray-400"
                            style={{ fontFamily: "Outfit_400Regular" }}
                          >
                            {selectedCoach.email}
                          </Text>
                        )}
                      </View>
                    </View>
                    <ChevronDown
                      size={20}
                      color={selectedCoachId ? "#059669" : "#6B7280"}
                      style={{
                        transform: [{ rotate: showCoachPicker ? "180deg" : "0deg" }],
                      }}
                    />
                  </Pressable>

                  {/* Coach List */}
                  {showCoachPicker && coaches.length > 0 && (
                    <Animated.View
                      entering={FadeIn}
                      className="mt-2 bg-white rounded-2xl border border-gray-200 overflow-hidden"
                    >
                      {coaches.map((coach, index) => (
                        <Pressable
                          key={coach.id}
                          onPress={() => {
                            setSelectedCoachId(coach.id);
                            setShowCoachPicker(false);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          className={`flex-row items-center p-4 ${
                            index < coaches.length - 1 ? "border-b border-gray-100" : ""
                          } ${selectedCoachId === coach.id ? "bg-ocean/5" : ""}`}
                        >
                          <View
                            className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                              selectedCoachId === coach.id
                                ? "bg-ocean"
                                : "bg-gray-100"
                            }`}
                          >
                            <Text
                              className={`font-bold ${
                                selectedCoachId === coach.id
                                  ? "text-white"
                                  : "text-gray-600"
                              }`}
                              style={{ fontFamily: "Outfit_600SemiBold" }}
                            >
                              {coach.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <Text
                              className="font-medium text-gray-900"
                              style={{ fontFamily: "Outfit_500Medium" }}
                            >
                              {coach.name}
                            </Text>
                            {coach.email && (
                              <Text
                                className="text-sm text-gray-400"
                                style={{ fontFamily: "Outfit_400Regular" }}
                              >
                                {coach.email}
                              </Text>
                            )}
                          </View>
                          {selectedCoachId === coach.id && (
                            <CheckCircle size={20} color="#0070B8" />
                          )}
                        </Pressable>
                      ))}
                    </Animated.View>
                  )}

                  {coaches.length === 0 && !coachError && (
                    <View className="bg-yellow-50 rounded-2xl p-4 mt-2">
                      <View className="flex-row items-start">
                        <AlertCircle size={20} color="#D97706" />
                        <Text
                          className="text-yellow-700 ml-2"
                          style={{ fontFamily: "Outfit_400Regular" }}
                        >
                          No coaches found for this school. Add coaches via invite codes first.
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
            </Animated.View>
          </ScrollView>

          {/* Action Buttons */}
          <View className="px-5 pb-8 pt-3 border-t border-gray-100">
            <View className="flex-row">
              <Pressable
                onPress={onClose}
                className="flex-1 bg-gray-100 rounded-xl py-4 mr-2"
              >
                <Text
                  className="text-gray-700 text-center font-medium"
                  style={{ fontFamily: "Outfit_600SemiBold" }}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={!selectedCoachId || confirming}
                className={`flex-1 rounded-xl py-4 ml-2 ${
                  selectedCoachId && !confirming
                    ? "bg-ocean"
                    : "bg-gray-300"
                }`}
              >
                {confirming ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    className={`text-center font-medium ${
                      selectedCoachId ? "text-white" : "text-gray-500"
                    }`}
                    style={{ fontFamily: "Outfit_600SemiBold" }}
                  >
                    Confirm Lesson
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
