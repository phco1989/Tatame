import React from "react";
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Screen name="create-login" />
      <Stack.Screen name="ngo-student" />
      <Stack.Screen name="ngo-guardian" />
      <Stack.Screen name="ngo-pending" />
    </Stack>
  );
}
