"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  AdminProfile,
  AdminRole,
  adminLogin,
  adminLogout,
  getAdminMe,
} from "@/lib/admin/auth";

type AdminAuthContextType = {
  admin: AdminProfile | null;
  isAdminAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<AdminProfile>;
  logout: () => Promise<void>;
  refreshAdmin: () => Promise<AdminProfile | null>;
};

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  const verifySession = useCallback(async (): Promise<AdminProfile | null> => {
    try {
      console.log("[AdminAuth] Verifying admin session via /api/v1/admin/me...");
      const profile = await getAdminMe();
      console.log("[AdminAuth] Received profile:", profile);
      setAdmin(profile);
      return profile;
    } catch (err) {
      console.warn("[AdminAuth] Verification failed:", err);
      setAdmin(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      console.log("[AdminAuth] Initializing auth state. Pathname:", pathname);
      try {
        const profile = await verifySession();
        if (isMounted) {
          setAdmin(profile);
          console.log("[AdminAuth] Init complete. Admin:", profile, "isAuthenticated:", Boolean(profile));
        }
      } catch (err) {
        if (isMounted) {
          setAdmin(null);
          console.log("[AdminAuth] Init error:", err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          console.log("[AdminAuth] Loading set to false");
        }
      }
    }

    void init();

    return () => {
      isMounted = false;
    };
  }, [pathname, verifySession]);

  const login = async (email: string, password: string): Promise<AdminProfile> => {
    setLoading(true);
    console.log("[AdminAuth] Starting login for:", email);
    try {
      // 1. Call adminLogin()
      await adminLogin(email, password);
      // 2. Call getAdminMe()
      const profile = await getAdminMe();
      if (!profile) {
        throw new Error("Failed to fetch admin profile after login.");
      }
      // 3. Set admin & loading states
      setAdmin(profile);
      console.log("[AdminAuth] Login success. Admin:", profile, "isAuthenticated: true");
      return profile;
    } catch (err) {
      console.error("[AdminAuth] Login error:", err);
      setAdmin(null);
      throw err;
    } finally {
      setLoading(false);
      console.log("[AdminAuth] Login finished. Loading set to false");
    }
  };

  const logout = async () => {
    setLoading(true);
    console.log("[AdminAuth] Logging out...");
    try {
      await adminLogout();
    } finally {
      setAdmin(null);
      setLoading(false);
      console.log("[AdminAuth] Logout complete");
    }
  };

  const refreshAdmin = async () => {
    return verifySession();
  };

  const isAdminAuthenticated = Boolean(admin);

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        isAdminAuthenticated,
        loading,
        login,
        logout,
        refreshAdmin,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
