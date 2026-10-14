"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function NewCarePlanPage() {
  const router = useRouter();

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setIsDemo(true);
      }
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setSubmitted(false);
    setErrorMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);

    const patientName = String(formData.get("patientName") || "");
    const patientUserId = String(formData.get("patientUserId") || "").trim();
    const carePlanName = String(formData.get("carePlanName") || "");
    const description = String(formData.get("description") || "");
    const startDate = String(formData.get("startDate") || "");
    const endDate = String(formData.get("endDate") || "");
    const sourceType = String(formData.get("source") || "healthcare");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || isDemo) {
        setSubmitted(true);
        form.reset();
        setTimeout(() => {
          router.push("/care-plans/demo-care-plan-1");
        }, 1000);
        return;
      }

      // Create patient
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .insert({
          full_name: patientName,
        })
        .select("id")
        .single();

      if (patientError) {
        throw new Error(patientError.message);
      }

      // If a patient account User ID was provided, grant patient access
      if (patientUserId) {
        const { error: accessError } = await supabase
          .from("smartcare_patient_access")
          .insert({
            patient_id: patient.id,
            user_id: patientUserId,
            access_role: "PATIENT",
            active: true,
            granted_by: session.user.id,
          });

        if (accessError) {
          console.warn("Could not immediately link patient user access:", accessError.message);
        }
      }

      // Create care plan
      const { data: carePlan, error: carePlanError } = await supabase
        .from("care_plans")
        .insert({
          patient_id: patient.id,
          name: carePlanName,
          description: description || null,
          source_type: sourceType,
          start_date: startDate,
          end_date: endDate,
        })
        .select("id")
        .single();

      if (carePlanError) {
        throw new Error(carePlanError.message);
      }

      setSubmitted(true);

      form.reset();

      // Open the newly created care plan
      setTimeout(() => {
        router.push(`/care-plans/${carePlan.id}`);
      }, 1000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating the care plan."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen px-4 pb-16 pt-8 sm:px-6"
      style={{ background: "var(--sc-background)", color: "var(--sc-text)" }}
    >
      <div className="mx-auto max-w-2xl">
        {/* Breadcrumb */}
        <nav
          className="mb-6 flex items-center gap-2 text-xs"
          style={{ color: "var(--sc-muted)" }}
        >
          <a
            href="/clinical"
            style={{ color: "var(--sc-primary)" }}
            className="hover:underline"
          >
            Clinical workspace
          </a>
          <span>/</span>
          <span>Create care plan</span>
        </nav>

        {/* Page title */}
        <div className="sc-animate-fade-up">
          <p className="sc-section-label">Care Plan Creation</p>
          <h1 className="sc-page-title mt-2">Create a new care plan</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--sc-muted)" }}>
            Create a personalized post-discharge care plan containing
            already-prescribed activities.
          </p>

          {isDemo && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-300">
                DEMO PREVIEW
              </span>
              <span>
                Preview Mode — Submitting this form simulates plan generation and navigates to the sample care plan without writing to the database.
              </span>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-6 sc-animate-fade-up-delay-1"
        >
          {/* Patient Information */}
          <section className="sc-card-lg">
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--sc-text)" }}
            >
              Patient Information
            </h2>
            <div className="mt-4">
              <label className="sc-form-label" htmlFor="patientName">
                Patient full name
              </label>
              <input
                id="patientName"
                type="text"
                name="patientName"
                placeholder="Enter patient name"
                required
                className="sc-input"
              />
              <p className="sc-form-hint">
                SmartCare assigns an internal medical record identifier when the patient is saved.
              </p>
            </div>

            <div className="mt-4">
              <label className="sc-form-label" htmlFor="patientUserId">
                Patient Portal Account ID <span style={{ color: "var(--sc-muted)" }}>(Optional)</span>
              </label>
              <input
                id="patientUserId"
                type="text"
                name="patientUserId"
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className="sc-input font-mono text-xs"
              />
              <p className="sc-form-hint">
                Assigning the patient&apos;s authenticated User ID immediately grants them secure, read-only access to this care plan in their Patient Portal. Access can also be granted or revoked at any time.
              </p>
            </div>
          </section>

          {/* Care Plan Details */}
          <section className="sc-card-lg">
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--sc-text)" }}
            >
              Care plan details
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="sc-form-label" htmlFor="carePlanName">
                  Plan name
                </label>
                <input
                  id="carePlanName"
                  type="text"
                  name="carePlanName"
                  placeholder="Example: Post-Discharge Recovery"
                  required
                  className="sc-input"
                />
              </div>
              <div>
                <label className="sc-form-label" htmlFor="description">
                  Description{" "}
                  <span style={{ color: "var(--sc-muted)" }}>(optional)</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  placeholder="Describe the purpose of this care plan"
                  rows={3}
                  className="sc-input"
                  style={{ resize: "vertical" }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="sc-form-label" htmlFor="startDate">
                    Start date
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    name="startDate"
                    required
                    className="sc-input"
                  />
                </div>
                <div>
                  <label className="sc-form-label" htmlFor="endDate">
                    End date
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    name="endDate"
                    required
                    className="sc-input"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Care Plan Source */}
          <section className="sc-card-lg">
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--sc-text)" }}
            >
              Care plan source
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--sc-muted)" }}>
              Select how the existing care instructions were provided.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--sc-primary)]"
                style={{ border: "1px solid var(--sc-border)" }}
              >
                <input
                  type="radio"
                  name="source"
                  value="healthcare"
                  defaultChecked
                  className="mt-0.5 shrink-0 accent-[var(--sc-primary)]"
                />
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--sc-text)" }}
                  >
                    Healthcare professional
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--sc-muted)" }}
                  >
                    Instructions provided by a doctor or healthcare organization.
                  </p>
                </div>
              </label>
              <label
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--sc-primary)]"
                style={{ border: "1px solid var(--sc-border)" }}
              >
                <input
                  type="radio"
                  name="source"
                  value="patient"
                  className="mt-0.5 shrink-0 accent-[var(--sc-primary)]"
                />
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--sc-text)" }}
                  >
                    Patient controlled
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--sc-muted)" }}
                  >
                    Patient enters or imports existing prescribed instructions.
                  </p>
                </div>
              </label>
            </div>
          </section>

          {/* Safety notice */}
          <div className="sc-alert-warning">
            <p className="text-sm font-semibold">Important</p>
            <p className="mt-1 text-sm">
              SmartCare organizes and monitors existing care instructions. It
              does not independently diagnose conditions, prescribe treatment, or
              change medication dosage.
            </p>
          </div>

          {/* Error */}
          {errorMessage && (
            <div className="sc-alert-error" role="alert">
              <p className="font-semibold">Could not create care plan</p>
              <p className="mt-1 text-sm">{errorMessage}</p>
            </div>
          )}

          {/* Success */}
          {submitted && (
            <div className="sc-alert-success" role="status">
              <p className="font-semibold">Care plan created</p>
              <p className="mt-1 text-sm">
                Saved successfully. Opening the care plan…
              </p>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <button
              type="submit"
              disabled={loading}
              className="sc-btn-primary"
            >
              {loading ? "Creating…" : "Create care plan"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}