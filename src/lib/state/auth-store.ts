import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User, Permission } from "@/types";
import { ROLE_PERMISSIONS } from "@/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  isStaff: () => boolean;
  isManager: () => boolean;
  isCoach: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
    if (user) {
      AsyncStorage.setItem("user", JSON.stringify(user));
    } else {
      AsyncStorage.removeItem("user");
    }
  },

  login: async (email: string, password: string) => {
    // Mock login - in production, this would call an API
    // For demo purposes, create a mock user
    const mockUser: User = {
      id: "user-1",
      name: "John Doe",
      email: email,
      phone: "+1 (555) 123-4567",
      role: email.includes("manager") ? "manager" : email.includes("coach") ? "coach" : "student",
      status: "active",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      isActive: true,
    };

    set({ user: mockUser, isAuthenticated: true });
    await AsyncStorage.setItem("user", JSON.stringify(mockUser));
  },

  logout: async () => {
    set({ user: null, isAuthenticated: false });
    await AsyncStorage.removeItem("user");
  },

  loadUser: async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      if (userData) {
        const user = JSON.parse(userData) as User;
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error("Failed to load user:", error);
      set({ isLoading: false });
    }
  },

  // Permission checking helpers
  hasPermission: (permission: Permission) => {
    const user = get().user;
    if (!user) return false;
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes(permission);
  },

  hasAnyPermission: (permissions: Permission[]) => {
    const user = get().user;
    if (!user) return false;
    const userPermissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.some((p) => userPermissions.includes(p));
  },

  // Role checking helpers
  isStaff: () => {
    const user = get().user;
    return user?.role === "coach" || user?.role === "manager";
  },

  isManager: () => {
    const user = get().user;
    return user?.role === "manager";
  },

  isCoach: () => {
    const user = get().user;
    return user?.role === "coach" || user?.role === "manager";
  },
}));
