import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Calendar,
  Clock,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  RefreshCw,
} from "lucide-react-native";
import { useAssignmentRequestStore } from "@/lib/state/assignment-request-store";
import { db } from "@/lib/firebase-config";
import { doc, getDoc } from "firebase/firestore";
import type { AssignmentRequest, Booking } from "@/types";
import { TATAME } from "@/lib/design";

interface CoachAssignmentRequestsProps {
  schoolId: string;
  coachId: string;
}

// Helper to format time from HH:MM to 12-hour format
function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function CoachAssignmentRequests({ schoolId, coachId }: CoachAssignmentRequestsProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<Record<string, Partial<Booking>>>({});
  const [loadingBookings, setLoadingBookings] = useState(false);

  const requests = useAssignmentRequestStore((s) => s.requests);
  const loading = useAssignmentRequestStore((s) => s.loading);
  const fetchRequests = useAssignmentRequestStore((s) => s.fetchRequestsForSchool);
  const acceptRequest = useAssignmentRequestStore((s) => s.acceptRequest);
  const rejectRequest = useAssignmentRequestStore((s) => s.rejectRequest);

  // Filter for open requests in this school
  const openRequests = requests.filter(
    (r) => r.academyId === schoolId && r.status === "open"
  );

  // Load requests on mount
  useEffect(() => {
    if (schoolId) {
      fetchRequests(schoolId);
    }
  }, [schoolId]);

  // Fetch booking details for open requests
  useEffect(() => {
    const fetchBookingDetails = async () => {
      if (openRequests.length === 0) return;

      setLoadingBookings(true);
      const details: Record<string, Partial<Booking>> = {};

      for (const request of openRequests) {
        if (!bookingDetails[request.bookingId]) {
          try {
            const bookingDoc = await getDoc(doc(db, "bookings", request.bookingId));
            if (bookingDoc.exists()) {
              const data = bookingDoc.data();
              details[request.bookingId] = {
                id: bookingDoc.id,
                customerName: data.customerName,
                classDate: data.classDate,
                classStartTime: data.classStartTime,
                classEndTime: data.classEndTime,
                classType: data.classType,
                level: data.level,
                totalPrice: data.totalPrice,
                numberOfStudents: data.numberOfStudents,
              };
            }
          } catch (error) {
            console.error("[CoachAssignmentRequests] Error fetching booking:", error);
          }
        }
      }

      setBookingDetails((prev) => ({ ...prev, ...details }));
      setLoadingBookings(false);
    };

    fetchBookingDetails();
  }, [openRequests.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRequests(schoolId);
    setRefreshing(false);
  };

  const handleAccept = async (requestId: string) => {
    const success = await acceptRequest(requestId);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleReject = async (requestId: string) => {
    const success = await rejectRequest(requestId);
    if (success) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (loading && openRequests.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator size="large" color="#059669" />
        <Text className="text-gray-500 mt-3" style={{ fontFamily: "Outfit_400Regular" }}>
          Loading assignment requests...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#059669" />
      }
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <Send size={20} color="#059669" />
          <Text className="text-lg font-bold ml-2" style={{ fontFamily: "Poppins_600SemiBold", color: TATAME.text }}>
            Open Lesson Requests
          </Text>
        </View>
        <View className="bg-emerald-100 px-3 py-1 rounded-full">
          <Text className="text-emerald-700 font-medium" style={{ fontFamily: "Outfit_500Medium" }}>
            {openRequests.length}
          </Text>
        </View>
      </View>

      {openRequests.length === 0 ? (
        <Animated.View
          entering={FadeIn}
          className="rounded-2xl p-8 items-center"
          style={{ backgroundColor: TATAME.bgCard, borderWidth: 1, borderColor: TATAME.cardBorder }}
        >
          <AlertCircle size={48} color={TATAME.textMuted} />
          <Text className="mt-4 text-center" style={{ fontFamily: "Outfit_400Regular", color: TATAME.textMuted }}>
            No open lesson requests at this time.
          </Text>
          <Text className="mt-1 text-center text-sm" style={{ fontFamily: "Outfit_400Regular", color: TATAME.textMuted }}>
            New requests from managers will appear here.
          </Text>
        </Animated.View>
      ) : (
        openRequests.map((request, index) => {
          const booking = bookingDetails[request.bookingId];
          const classDate = booking?.classDate ? new Date(booking.classDate) : null;

          return (
            <Animated.View
              key={request.id}
              entering={FadeInDown.delay(index * 100).springify()}
              className="rounded-2xl p-4 mb-3"
              style={{
                backgroundColor: TATAME.bgCard,
                borderWidth: 1,
                borderColor: TATAME.cardBorder,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              {/* Request Badge */}
              <View className="flex-row items-center justify-between mb-3">
                <View className="bg-yellow-100 px-3 py-1 rounded-full">
                  <Text className="text-yellow-700 text-xs font-medium" style={{ fontFamily: "Outfit_500Medium" }}>
                    Open Request
                  </Text>
                </View>
                <Text className="text-gray-400 text-xs" style={{ fontFamily: "Outfit_400Regular" }}>
                  {new Date(request.createdAt).toLocaleDateString()}
                </Text>
              </View>

              {loadingBookings && !booking ? (
                <View className="py-4 items-center">
                  <ActivityIndicator size="small" color="#059669" />
                </View>
              ) : booking ? (
                <>
                  {/* Student Name */}
                  <View className="flex-row items-center mb-2">
                    <User size={16} color="#6B7280" />
                    <Text className="text-lg font-bold ml-2" style={{ fontFamily: "Poppins_600SemiBold", color: TATAME.text }}>
                      {booking.customerName || "Student"}
                    </Text>
                  </View>

                  {/* Date & Time */}
                  {classDate && (
                    <View className="flex-row items-center mb-2">
                      <Calendar size={14} color="#6B7280" />
                      <Text className="text-gray-600 text-sm ml-2" style={{ fontFamily: "Outfit_400Regular" }}>
                        {classDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        {booking.classStartTime && ` • ${formatTime(booking.classStartTime)}`}
                        {booking.classEndTime && ` - ${formatTime(booking.classEndTime)}`}
                      </Text>
                    </View>
                  )}

                  {/* Lesson Details */}
                  <View className="flex-row items-center mb-3">
                    <Text className="text-emerald-600 font-semibold" style={{ fontFamily: "Outfit_500Medium" }}>
                      ${booking.totalPrice || "—"}
                    </Text>
                    <Text className="text-gray-400 mx-2">|</Text>
                    <Text className="text-gray-600 text-sm" style={{ fontFamily: "Outfit_400Regular" }}>
                      {booking.level || "—"} - {booking.classType?.replace("_", " ") || "Class"}
                    </Text>
                    {(booking.numberOfStudents ?? 0) > 1 && (
                      <Text className="text-gray-500 text-sm ml-2" style={{ fontFamily: "Outfit_400Regular" }}>
                        ({booking.numberOfStudents} students)
                      </Text>
                    )}
                  </View>
                </>
              ) : (
                <Text className="text-gray-500 py-2" style={{ fontFamily: "Outfit_400Regular" }}>
                  Booking details unavailable
                </Text>
              )}

              {/* Action Buttons */}
              <View className="flex-row pt-3 border-t" style={{ borderColor: TATAME.cardBorder }}>
                <Pressable
                  onPress={() => handleAccept(request.id)}
                  className="flex-1 bg-emerald-100 rounded-lg py-3 mr-2 flex-row items-center justify-center active:opacity-80"
                >
                  <CheckCircle size={18} color="#059669" />
                  <Text className="text-emerald-700 font-medium ml-2" style={{ fontFamily: "Outfit_600SemiBold" }}>
                    Accept
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleReject(request.id)}
                  className="flex-1 bg-gray-100 rounded-lg py-3 ml-2 flex-row items-center justify-center active:opacity-80"
                >
                  <XCircle size={18} color="#6B7280" />
                  <Text className="text-gray-600 font-medium ml-2" style={{ fontFamily: "Outfit_500Medium" }}>
                    Decline
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          );
        })
      )}

      <View className="h-8" />
    </ScrollView>
  );
}
