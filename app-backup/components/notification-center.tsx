"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SmartCareRole } from "@/lib/supabase/auth-context";
import { supabase } from "@/lib/supabase/client";

interface SmartCareNotification {
  id: string;
  escalation_id: string | null;
  channel: string;
  status: string;
  created_at: string;
}

export default function NotificationCenter({
  userId,
  role,
}: {
  userId: string;
  role: SmartCareRole;
}) {
  const [notifications, setNotifications] = useState<SmartCareNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("smartcare_notifications")
      .select("id,escalation_id,channel,status,created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (queryError) {
      setError("Notifications could not be loaded.");
      return;
    }

    setError("");
    setNotifications((data || []) as SmartCareNotification[]);
  }, [userId]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const queued = notifications.filter((item) =>
      ["CREATED", "QUEUED"].includes(item.status),
    );
    if (queued.length === 0) return;

    let active = true;
    void Promise.all(
      queued.map(async (item) => {
        const { error: updateError } = await supabase.rpc(
          "smartcare_mark_notification",
          { p_notification_id: item.id, p_status: "DELIVERED" },
        );
        if (updateError) throw updateError;
        return item.id;
      }),
    )
      .then((ids) => {
        if (!active) return;
        const deliveredIds = new Set(ids);
        setNotifications((current) =>
          current.map((item) =>
            deliveredIds.has(item.id)
              ? { ...item, status: "DELIVERED" }
              : item,
          ),
        );
        setError("");
      })
      .catch(() => {
        if (active) setError("Some notifications could not be marked as delivered.");
      });

    return () => {
      active = false;
    };
  }, [notifications, open]);

  async function acknowledge(notificationId: string) {
    const { error: updateError } = await supabase.rpc(
      "smartcare_mark_notification",
      { p_notification_id: notificationId, p_status: "ACKNOWLEDGED" },
    );
    if (updateError) {
      setError("Notification could not be acknowledged. Please retry.");
      return;
    }
    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? { ...item, status: "ACKNOWLEDGED" }
          : item,
      ),
    );
  }

  const unacknowledged = notifications.filter(
    (item) => item.status !== "ACKNOWLEDGED",
  ).length;
  const dashboardPath =
    role === "CAREGIVER" ? "/caregiver"
    : role === "CLINICIAN" ? "/clinical"
    : role === "PATIENT" ? "/patient"
    : "/admin";

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors"
        style={{ border: "1px solid var(--sc-border)", background: "var(--sc-surface)", color: "var(--sc-text)" }}
      >
        {unacknowledged > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[0.6rem] font-bold text-white" style={{ background: "var(--sc-danger)" }}>
            {unacknowledged > 9 ? "9+" : unacknowledged}
          </span>
        )}
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 01-2-2h4a2 2 0 01-2 2z" />
        </svg>
        <span>Alerts{unacknowledged > 0 ? ` (${unacknowledged})` : ""}</span>
      </button>
      {open && (
        <section
          aria-label="Notifications"
          className="sc-notification-panel absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl p-4 text-left text-sm"
          style={{ border: "1px solid var(--sc-border)", background: "var(--sc-surface)", boxShadow: "0 16px 40px rgb(25 52 38 / 12%)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: "var(--sc-text)" }}>Notifications</h2>
            <button type="button" onClick={() => void refresh()} className="text-xs font-medium" style={{ color: "var(--sc-primary)" }}>Refresh</button>
          </div>
          {error && <p role="alert" className="mt-3 text-xs sc-alert-error">{error}</p>}
          {notifications.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--sc-muted)" }}>No notifications.</p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto">
              {notifications.map((item) => (
                <li key={item.id} className="rounded-lg p-3" style={{ background: "var(--sc-surface-soft)", border: "1px solid var(--sc-border)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--sc-text)" }}>A care item needs review.</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--sc-muted)" }}>
                    {new Date(item.created_at).toLocaleString()} · {item.status}
                  </p>
                  {item.status !== "ACKNOWLEDGED" && (
                    <div className="mt-2 flex items-center gap-3">
                      <Link href={dashboardPath} className="text-xs font-medium" style={{ color: "var(--sc-primary)" }}>Open dashboard</Link>
                      {(item.status === "DELIVERED" || item.status === "SENT") && (
                        <button type="button" onClick={() => void acknowledge(item.id)} className="text-xs underline" style={{ color: "var(--sc-muted)" }}>Acknowledge</button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
