"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function NewCarePlanPage() {
  const router = useRouter();

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setSubmitted(false);
    setErrorMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);

    const patientName = String(formData.get("patientName") || "");
    const carePlanName = String(formData.get("carePlanName") || "");
    const description = String(formData.get("description") || "");
    const startDate = String(formData.get("startDate") || "");
    const endDate = String(formData.get("endDate") || "");
    const sourceType = String(formData.get("source") || "healthcare");

    try {
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
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <h1 className="text-2xl font-bold">SmartCare</h1>
          <p className="text-sm text-slate-400">
            Create a New Care Plan
          </p>
        </div>
      </header>

      {/* Form */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h2 className="text-3xl font-bold">
            Create Care Plan
          </h2>

          <p className="mt-2 text-slate-400">
            Create a personalized post-discharge care plan
            containing already-prescribed activities.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8"
        >
          {/* Patient Information */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">
              Patient Information
            </h3>

            <div className="mt-6 max-w-xl">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Patient Name
                </label>

                <input
                  type="text"
                  name="patientName"
                  placeholder="Enter patient name"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                SmartCare assigns an internal record identifier when the patient is saved.
              </p>
            </div>
          </section>

          {/* Care Plan Information */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">
              Care Plan Information
            </h3>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Care Plan Name
                </label>

                <input
                  type="text"
                  name="carePlanName"
                  placeholder="Example: Post-Discharge Recovery"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Description
                </label>

                <textarea
                  name="description"
                  placeholder="Describe the purpose of this care plan"
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Start Date
                  </label>

                  <input
                    type="date"
                    name="startDate"
                    required
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    End Date
                  </label>

                  <input
                    type="date"
                    name="endDate"
                    required
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Source */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">
              Care Plan Source
            </h3>

            <p className="mt-2 text-sm text-slate-400">
              Select how the existing care instructions were
              provided.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-5 hover:border-emerald-700">
                <input
                  type="radio"
                  name="source"
                  value="healthcare"
                  defaultChecked
                  className="mr-3"
                />

                <span className="font-medium">
                  Healthcare Professional
                </span>

                <p className="mt-2 text-sm text-slate-500">
                  Instructions provided by a doctor or healthcare
                  organization.
                </p>
              </label>

              <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-5 hover:border-emerald-700">
                <input
                  type="radio"
                  name="source"
                  value="patient"
                  className="mr-3"
                />

                <span className="font-medium">
                  Patient Controlled
                </span>

                <p className="mt-2 text-sm text-slate-500">
                  Patient enters or imports existing prescribed
                  instructions.
                </p>
              </label>
            </div>
          </section>

          {/* Safety Notice */}
          <section className="rounded-2xl border border-yellow-900 bg-yellow-950/30 p-6">
            <h3 className="font-semibold text-yellow-400">
              Important
            </h3>

            <p className="mt-2 text-sm leading-6 text-yellow-200/80">
              SmartCare organizes and monitors existing care
              instructions. It does not independently diagnose
              conditions, prescribe treatment, or change medication
              dosage.
            </p>
          </section>

          {/* Error */}
          {errorMessage && (
            <div className="rounded-xl border border-red-800 bg-red-950/40 p-5">
              <h3 className="font-semibold text-red-400">
                Could not create care plan
              </h3>

              <p className="mt-2 text-sm text-red-200/80">
                {errorMessage}
              </p>
            </div>
          )}

          {/* Success */}
          {submitted && (
            <div className="rounded-xl border border-green-800 bg-green-950/40 p-5">
              <h3 className="font-semibold text-green-400">
                Care Plan Created
              </h3>

              <p className="mt-2 text-sm text-green-200/80">
                Saved successfully. Opening the care plan...
              </p>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-emerald-800 px-6 py-3 font-medium hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Care Plan"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}