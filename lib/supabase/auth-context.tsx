"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { ApplicationRole } from "@/lib/smartcare/role-navigation";
import { supabase } from "./client";

export type SmartCareRole = ApplicationRole;

interface AuthContextValue {
  session: Session | null;
  role: SmartCareRole | null;
  loading: boolean;
  roleLoading: boolean;
  roleError: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseRole(value: unknown): SmartCareRole | null {
  if (
    value === "PATIENT" ||
    value === "CAREGIVER" ||
    value === "CLINICIAN" ||
    value === "ADMIN"
  ) {
    return value;
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleResult, setRoleResult] = useState<{
    userId: string;
    role: SmartCareRole | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          return;
        }
        setSession(data.session);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    let active = true;

    if (!userId) {
      return;
    }

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("smartcare_user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        if (!active) return;
        if (error) {
          setRoleResult({ userId, role: null, error: true });
          return;
        }
        setRoleResult({
          userId,
          role: parseRole(data?.role),
          error: false,
        });
      } catch {
        if (active) {
          setRoleResult({ userId, role: null, error: true });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  const currentRoleResult =
    userId && roleResult?.userId === userId ? roleResult : null;

  const signOut = useCallback(async () => {
    const userId = session?.user.id;
    if (userId) {
      const { error: auditError } = await supabase
        .from("smartcare_audit_log")
        .insert({
          actor_id: userId,
          action: "LOGOUT",
          object_type: "user",
          object_id: userId,
          metadata: {},
        });
      if (auditError) {
        throw new Error("Logout could not be recorded. Please retry.");
      }
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      role: currentRoleResult?.role || null,
      loading,
      roleLoading: Boolean(userId && !currentRoleResult),
      roleError: Boolean(currentRoleResult?.error),
      signOut,
    }),
    [currentRoleResult, loading, session, signOut, userId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSmartCareAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useSmartCareAuth must be used within AuthProvider.");
  }
  return context;
}
