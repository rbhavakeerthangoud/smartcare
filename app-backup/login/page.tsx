"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandMark from "@/app/components/brand-mark";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const formData = new FormData(event.currentTarget);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      if (loginError || !data.user) {
        throw new Error("Sign in failed. Check your credentials and try again.");
      }

      const { error: auditError } = await supabase
        .from("smartcare_audit_log")
        .insert({
          actor_id: data.user.id,
          action: "LOGIN",
          object_type: "user",
          object_id: data.user.id,
          metadata: {},
        });
      if (auditError) {
        await supabase.auth.signOut();
        throw new Error(
          "Sign-in could not be recorded. Access was closed; please contact the administrator.",
        );
      }
      let redirectUrl = "";
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const r = params.get("redirect");
        if (r && r.startsWith("/")) {
          redirectUrl = r;
        }
      }

      if (!redirectUrl) {
        const { data: roleRecord } = await supabase
          .from("smartcare_user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .maybeSingle();

        const role = roleRecord?.role;
        if (role === "PATIENT") redirectUrl = "/patient";
        else if (role === "CLINICIAN") redirectUrl = "/clinical";
        else if (role === "CAREGIVER") redirectUrl = "/caregiver";
        else if (role === "ADMIN") redirectUrl = "/admin";
        else redirectUrl = "/";
      }

      router.replace(redirectUrl);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Sign in failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(23,33,28,0.10)] lg:min-h-[610px] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="sc-login-hero relative isolate flex min-h-64 flex-col justify-between overflow-hidden bg-[linear-gradient(145deg,#174d39,#23684d_58%,#59836c)] p-7 text-white sm:p-10 lg:p-12">
          <div className="absolute -right-16 -top-16 -z-10 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -right-4 top-0 -z-10 h-52 w-52 rounded-full border border-white/10" />
          <div className="absolute bottom-20 right-14 -z-10 h-24 w-24 rounded-[2rem] border border-white/15 rotate-12" />
          <BrandMark />
          <div className="mt-14 max-w-lg lg:mt-auto lg:pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
              Care, connected
            </p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Post-discharge care, thoughtfully connected.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/80 sm:text-base">
              Keep care instructions, daily activities, and your authorized care team in one calm, clear workspace.
            </p>
          </div>
          <p className="mt-10 text-xs text-white/60 lg:mt-0">
            A care-plan support platform · Not a substitute for professional medical advice
          </p>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-sm">
            <p className="text-sm font-medium text-emerald-800">Welcome back</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Sign in to SmartCare
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use the account provided by your SmartCare administrator.
            </p>
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-800">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder:text-slate-400"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-800">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950"
                />
              </div>
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="min-h-12 w-full rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="mt-6 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
              Need an account? Contact your SmartCare administrator. Access to care information is limited by your assigned role and patient permissions.
            </p>
            <div className="mt-4 text-center">
              <Link
                href="/"
                className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 hover:underline"
              >
                ← Return to SmartCare Homepage
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
