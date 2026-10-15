"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandMark from "@/app/components/brand-mark";
import { supabase } from "@/lib/supabase/client";

export default function InviteActivationPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email);
      }
    });
  }, []);

  async function handleActivateAccount(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters in length.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError || !data.user) {
        throw new Error(updateError?.message || "Could not activate account.");
      }

      await supabase.from("smartcare_audit_log").insert({
        actor_id: data.user.id,
        action: "INVITATION_ACTIVATED",
        object_type: "user",
        object_id: data.user.id,
        metadata: {},
      });

      setSuccess(true);
      setTimeout(() => {
        router.replace("/login");
      }, 2500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Account activation failed. Please contact your hospital administrator for a new invitation link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <BrandMark />
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#BD5579]">
          Account Activation
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Activate your SmartCare account</h1>
        <p className="mt-2 text-sm text-slate-600">
          {userEmail
            ? `Set your password to activate account for ${userEmail}.`
            : "Complete your account registration by choosing a secure password."}
        </p>

        {success ? (
          <div role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Account activated successfully! Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleActivateAccount} className="mt-6 space-y-4">
            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}

            <div>
              <label htmlFor="invite-password" className="block text-sm font-medium text-slate-800">
                Choose password
              </label>
              <input
                id="invite-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="invite-confirm" className="block text-sm font-medium text-slate-800">
                Confirm password
              </label>
              <input
                id="invite-confirm"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 min-h-11 w-full rounded-lg bg-[#BD5579] px-4 font-semibold text-white transition hover:bg-[#9e3e5f] disabled:opacity-60"
            >
              {submitting ? "Activating account…" : "Activate account"}
            </button>

            <div className="pt-2 text-center">
              <Link href="/login" className="text-xs font-semibold text-[#601D49] hover:underline">
                ← Already activated? Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
