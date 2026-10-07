"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { generateOccurrences } from "@/lib/smartcare/recurrence-engine";

export default function NewTaskPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 p-8 text-white">
          Loading task form...
        </main>
      }
    >
      <NewTaskForm />
    </Suspense>
  );
}

function NewTaskForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const carePlanId = searchParams.get("carePlanId");

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setSubmitted(false);
    setErrorMessage("");

    if (!carePlanId) {
      setErrorMessage(
        "No care plan was selected. Please open Add Task from a care plan."
      );
      setLoading(false);
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const type = String(formData.get("type") || "");
    const name = String(formData.get("name") || "");
    const description = String(formData.get("description") || "");

    const startDate = String(formData.get("startDate") || "");
    const endDate = String(formData.get("endDate") || "");

    const allowedStartTime = String(
      formData.get("allowedStartTime") || ""
    );

    const allowedEndTime = String(
      formData.get("allowedEndTime") || ""
    );
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const frequency = String(formData.get("frequency") || "");
    const priority = String(formData.get("priority") || "");

    const completionCriteria = String(
      formData.get("completionCriteria") || ""
    );

    const verificationMethod = String(
      formData.get("verificationMethod") || ""
    );

    const dependencyType = String(
      formData.get("dependencyType") || "none"
    );
    const weekdays = formData
      .getAll("weekdays")
      .map((value) => Number(value));
    const excludedDate = String(formData.get("excludedDate") || "");
    const intervalDays = Number(formData.get("intervalDays") || 1);
    const secondStartTime = String(formData.get("secondStartTime") || "");
    const secondEndTime = String(formData.get("secondEndTime") || "");

    try {
      const recurrenceFrequency =
        frequency === "every_n_days"
          ? "EVERY_N_DAYS"
          : frequency === "selected_weekdays"
            ? "SELECTED_WEEKDAYS"
            : frequency === "daily"
              ? "DAILY"
              : frequency === "weekly"
                ? "WEEKLY"
                : "ONCE";
      const generatedOccurrences = generateOccurrences({
        startDate,
        endDate,
        frequency: recurrenceFrequency,
        intervalDays,
        weekdays,
        times: [
          {
            startTime: allowedStartTime || null,
            endTime: allowedEndTime || null,
          },
          ...(secondStartTime || secondEndTime
            ? [{ startTime: secondStartTime || null, endTime: secondEndTime || null }]
            : []),
        ],
        excludedDates: excludedDate ? [excludedDate] : [],
        maxOccurrences: 366,
      });

      if (generatedOccurrences.length === 0) {
        throw new Error("The selected schedule does not generate any occurrences.");
      }

      /*
       * ============================================================
       * 1. CREATE THE TASK
       * ============================================================
       */

      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          care_plan_id: carePlanId,
          type,
          name,
          description: description || null,

          start_date: startDate,
          end_date: endDate,

          allowed_start_time: allowedStartTime,
          allowed_end_time: allowedEndTime,

          frequency,
          priority,

          completion_criteria: completionCriteria,
          verification_method: verificationMethod,

          dependency_type: dependencyType,

          status: "PENDING",
        })
        .select("id")
        .single();

      if (taskError) {
        throw new Error(taskError.message);
      }

      if (!task) {
        throw new Error("Task was created but its ID could not be retrieved.");
      }

      /*
       * ============================================================
       * 3. SAVE ALL OCCURRENCES
       * ============================================================
       */

      if (generatedOccurrences.length > 0) {
        const { error: occurrenceError } = await supabase
          .from("task_occurrences")
          .insert(
            generatedOccurrences.map((occurrence) => ({
              task_id: task.id,
              ...occurrence,
              time_zone: timeZone,
              status: "PENDING",
            }))
          );

        if (occurrenceError) {
          const { error: rollbackError } = await supabase
            .from("tasks")
            .delete()
            .eq("id", task.id);

          throw new Error(
            rollbackError
              ? `Task was created but occurrences failed (${occurrenceError.message}); cleanup also failed (${rollbackError.message}).`
              : `Task and its occurrences were not saved: ${occurrenceError.message}`
          );
        }
      }

      /*
       * ============================================================
       * 4. SUCCESS
       * ============================================================
       */

      setSubmitted(true);

      form.reset();

      /*
       * Return to care plan
       */

      setTimeout(() => {
        router.push(`/care-plans/${carePlanId}`);
      }, 800);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating the task."
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
            Add Care Plan Task
          </p>
        </div>
      </header>

      {/* Content */}
      <section className="mx-auto max-w-5xl px-6 py-10">

        <div className="mb-8">

          <h2 className="text-3xl font-bold">
            Add Task
          </h2>

          <p className="mt-2 text-slate-400">
            Add an activity that is already part of the
            patient&apos;s prescribed care plan.
          </p>

          {carePlanId && (
            <p className="mt-3 text-xs text-slate-500">
              Care Plan: {carePlanId}
            </p>
          )}

        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8"
        >

          {/* ====================================================== */}
          {/* TASK INFORMATION */}
          {/* ====================================================== */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <h3 className="text-xl font-semibold">
              Task Information
            </h3>

            <div className="mt-6 space-y-5">

              {/* Task Type */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Task Type
                </label>

                <select
                  name="type"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                >
                  <option value="">
                    Select task type
                  </option>

                  <option value="medication">
                    Medication
                  </option>

                  <option value="lab_test">
                    Laboratory Test
                  </option>

                  <option value="appointment">
                    Appointment
                  </option>

                  <option value="exercise">
                    Exercise / Physiotherapy
                  </option>

                  <option value="measurement">
                    Health Measurement
                  </option>

                  <option value="wound_care">
                    Wound Care
                  </option>

                  <option value="document">
                    Document
                  </option>

                  <option value="questionnaire">
                    Questionnaire / Communication
                  </option>

                  <option value="other">
                    Other Activity
                  </option>
                </select>
              </div>

              {/* Task Name */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Task Name
                </label>

                <input
                  type="text"
                  name="name"
                  placeholder="Example: Morning medication"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Description
                </label>

                <textarea
                  name="description"
                  rows={4}
                  placeholder="Describe the prescribed activity or completion requirement."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

            </div>
          </section>

          {/* ====================================================== */}
          {/* SCHEDULE */}
          {/* ====================================================== */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <h3 className="text-xl font-semibold">
              Schedule
            </h3>

            <p className="mt-2 text-sm text-slate-400">
              Define when this task is valid for execution.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Scheduled times use the timezone of the device that creates the task.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">

              {/* Start Date */}
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

              {/* End Date */}
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

              {/* Allowed Start */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Allowed Start Time
                </label>

                <input
                  type="time"
                  name="allowedStartTime"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

              {/* Allowed End */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Allowed End Time
                </label>

                <input
                  type="time"
                  name="allowedEndTime"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

              {/* Frequency */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Frequency
                </label>

                <select
                  name="frequency"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                >
                  <option value="">
                    Select frequency
                  </option>

                  <option value="once">
                    Once
                  </option>

                  <option value="daily">
                    Daily
                  </option>

                  <option value="weekly">
                    Weekly
                  </option>

                  <option value="every_n_days">
                    Every N days
                  </option>

                  <option value="selected_weekdays">
                    Selected weekdays
                  </option>

                  <option value="custom">
                    Custom (treated as once)
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Repeat interval (for Every N days)
                </label>
                <input
                  type="number"
                  name="intervalDays"
                  min="1"
                  max="365"
                  defaultValue="1"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

              <fieldset className="md:col-span-2">
                <legend className="mb-2 block text-sm text-slate-300">
                  Weekdays (for Selected weekdays)
                </legend>
                <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                  {[
                    ["0", "Sun"],
                    ["1", "Mon"],
                    ["2", "Tue"],
                    ["3", "Wed"],
                    ["4", "Thu"],
                    ["5", "Fri"],
                    ["6", "Sat"],
                  ].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2">
                      <input type="checkbox" name="weekdays" value={value} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Exclude date (optional)
                </label>
                <input
                  type="date"
                  name="excludedDate"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Additional daily time window (optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    name="secondStartTime"
                    aria-label="Additional window start time"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-emerald-700"
                  />
                  <input
                    type="time"
                    name="secondEndTime"
                    aria-label="Additional window end time"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Priority
                </label>

                <select
                  name="priority"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                >
                  <option value="">
                    Select priority
                  </option>

                  <option value="low">
                    Low
                  </option>

                  <option value="normal">
                    Normal
                  </option>

                  <option value="high">
                    High
                  </option>

                  <option value="critical">
                    Critical
                  </option>
                </select>
              </div>

            </div>
          </section>

          {/* ====================================================== */}
          {/* COMPLETION CRITERIA */}
          {/* ====================================================== */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <h3 className="text-xl font-semibold">
              Completion Criteria
            </h3>

            <p className="mt-2 text-sm text-slate-400">
              Define what counts as completion of this task.
            </p>

            <div className="mt-6 space-y-5">

              {/* Completion Criteria */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Completion Criteria
                </label>

                <textarea
                  name="completionCriteria"
                  rows={3}
                  required
                  placeholder="Example: Patient confirms that the prescribed activity was completed."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </div>

              {/* Verification */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Verification Method
                </label>

                <select
                  name="verificationMethod"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
                >
                  <option value="">
                    Select verification method
                  </option>

                  <option value="patient_report">
                    Patient Report
                  </option>

                  <option value="document">
                    Document / Report
                  </option>

                  <option value="appointment">
                    Appointment Record
                  </option>

                  <option value="iot">
                    IoT / Device Event
                  </option>

                  <option value="multiple">
                    Multiple Evidence Sources
                  </option>
                </select>
              </div>

            </div>
          </section>

          {/* ====================================================== */}
          {/* DEPENDENCY */}
          {/* ====================================================== */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <h3 className="text-xl font-semibold">
              Dependency
            </h3>

            <p className="mt-2 text-sm text-slate-400">
              Dependencies will allow SmartCare to determine
              whether another task must be completed first.
            </p>

            <div className="mt-6">

              <label className="mb-2 block text-sm text-slate-300">
                Dependency Type
              </label>

              <select
                name="dependencyType"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-700"
              >
                <option value="none">
                  No Dependency
                </option>

                <option value="before">
                  Must occur before another task
                </option>

                <option value="required_before">
                  Required before this task
                </option>

                <option value="after">
                  Must occur after another task
                </option>
              </select>

            </div>
          </section>

          {/* ====================================================== */}
          {/* SAFETY */}
          {/* ====================================================== */}

          <section className="rounded-2xl border border-yellow-900 bg-yellow-950/30 p-6">

            <h3 className="font-semibold text-yellow-400">
              Important
            </h3>

            <p className="mt-2 text-sm leading-6 text-yellow-200/80">
              SmartCare records and monitors existing prescribed
              instructions. The system does not independently
              create medical treatment, diagnose conditions, or
              change prescribed treatment.
            </p>

          </section>

          {/* ====================================================== */}
          {/* ERROR */}
          {/* ====================================================== */}

          {errorMessage && (
            <div className="rounded-xl border border-red-800 bg-red-950/40 p-5">

              <h3 className="font-semibold text-red-400">
                Could not create task
              </h3>

              <p className="mt-2 text-sm text-red-200/80">
                {errorMessage}
              </p>

            </div>
          )}

          {/* ====================================================== */}
          {/* SUCCESS */}
          {/* ====================================================== */}

          {submitted && (
            <div className="rounded-xl border border-green-800 bg-green-950/40 p-5">

              <h3 className="font-semibold text-green-400">
                Task Created
              </h3>

              <p className="mt-2 text-sm text-green-200/80">
                The task and its occurrences were saved successfully.
                Returning to the care plan...
              </p>

            </div>
          )}

          {/* ====================================================== */}
          {/* SUBMIT */}
          {/* ====================================================== */}

          <div className="flex justify-end">

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-emerald-800 px-6 py-3 font-medium hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Saving..." : "Add Task"}
            </button>

          </div>

        </form>
      </section>
    </main>
  );
}