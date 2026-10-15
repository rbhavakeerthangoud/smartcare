"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandMark from "@/app/components/brand-mark";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleUpdatePassword(e: FormEvent) {
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
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSuccess(true);
      setTimeout(() => {
        router.replace("/login");
      }, 2500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update password. Please request a new recovery link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <BrandMark />
        <h1 className="mt-6 text-2xl font-semibold text-slate-950">Set new password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter a strong, secure password for your SmartCare account.
        </p>

        {success ? (
          <div role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Password updated successfully. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4">
            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}

            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-slate-800">
                New password
              </label>
              <input
                id="new-password"
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
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-800">
                Confirm new password
              </label>
              <input
                id="confirm-password"
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
              {submitting ? "Updating password…" : "Save new password"}
            </button>

            <div className="pt-2 text-center">
              <Link href="/login" className="text-xs font-semibold text-[#601D49] hover:underline">
                ← Return to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
