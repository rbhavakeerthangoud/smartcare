"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { generateOccurrences } from "@/lib/smartcare/recurrence-engine";

export default function NewTaskPage() {
  return (
    <Suspense
      fallback={
        <main
          className="min-h-screen px-4 py-8 sm:px-6"
          style={{ background: "var(--sc-background)" }}
        >
          <div className="mx-auto max-w-2xl">
            <div className="sc-skeleton h-8 w-48 rounded" />
            <div className="mt-4 sc-skeleton h-64 rounded-xl" />
          </div>
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

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setErrorMessage("Authentication session required to create tasks.");
        setLoading(false);
        return;
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
    <main
      className="min-h-screen px-4 pb-16 pt-8 sm:px-6"
      style={{ background: "var(--sc-background)", color: "var(--sc-text)" }}
    >
      <div className="mx-auto max-w-2xl">

        {/* Breadcrumb */}
        {carePlanId && (
          <nav
            className="mb-6 flex items-center gap-2 text-xs"
            style={{ color: "var(--sc-muted)" }}
          >
            <a
              href={`/care-plans/${carePlanId}`}
              style={{ color: "var(--sc-primary)" }}
              className="hover:underline"
            >
              Care plan
            </a>
            <span>/</span>
            <span>Add task</span>
          </nav>
        )}

        {/* Page heading */}
        <div className="sc-animate-fade-up">
          <p className="sc-section-label">Task Creation</p>
          <h1 className="sc-page-title mt-2">Add a care plan task</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--sc-muted)" }}>
            Add an activity that is already part of the patient&apos;s prescribed care plan.
          </p>

        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 sc-animate-fade-up-delay-1">

          {/* ====================================================== */}
          {/* TASK INFORMATION */}
          {/* ====================================================== */}

          <section className="sc-card-lg">
            <h2 className="text-base font-semibold">Task Information</h2>

            <div className="mt-6 space-y-5">

              {/* Task Type */}
              <div>
                <label htmlFor="type" className="sc-form-label">
                  Task Type
                </label>

                <select
                  id="type"
                  name="type"
                  required
                  className="sc-select"
                >
                  <option value="">Select task type</option>
                  <option value="medication">Medication</option>
                  <option value="lab_test">Laboratory Test</option>
                  <option value="appointment">Appointment</option>
                  <option value="exercise">Exercise / Physiotherapy</option>
                  <option value="measurement">Health Measurement</option>
                  <option value="wound_care">Wound Care</option>
                  <option value="document">Document</option>
                  <option value="questionnaire">Questionnaire / Communication</option>
                  <option value="other">Other Activity</option>
                </select>
              </div>

              {/* Task Name */}
              <div>
                <label htmlFor="name" className="sc-form-label">
                  Task Name
                </label>

                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="Example: Morning medication"
                  required
                  className="sc-input"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="sc-form-label">
                  Description
                </label>

                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  placeholder="Describe the prescribed activity or completion requirement."
                  className="sc-input"
                />
              </div>

            </div>
          </section>

          {/* ====================================================== */}
          {/* SCHEDULE */}
          {/* ====================================================== */}

          <section className="sc-card-lg">
            <h2 className="text-base font-semibold">Schedule</h2>

            <p className="mt-2 text-sm" style={{ color: "var(--sc-muted)" }}>
              Define when this task is valid for execution.
            </p>
            <p className="mt-1 text-xs sc-form-hint">
              Scheduled times use the timezone of the device that creates the task.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">

              {/* Start Date */}
              <div>
                <label htmlFor="startDate" className="sc-form-label">
                  Start Date
                </label>

                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  required
                  className="sc-input"
                />
              </div>

              {/* End Date */}
              <div>
                <label htmlFor="endDate" className="sc-form-label">
                  End Date
                </label>

                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  required
                  className="sc-input"
                />
              </div>

              {/* Allowed Start Time */}
              <div>
                <label htmlFor="allowedStartTime" className="sc-form-label">
                  Allowed Start Time
                </label>

                <input
                  type="time"
                  id="allowedStartTime"
                  name="allowedStartTime"
                  required
                  className="sc-input"
                />
              </div>

              {/* Allowed End Time */}
              <div>
                <label htmlFor="allowedEndTime" className="sc-form-label">
                  Allowed End Time
                </label>

                <input
                  type="time"
                  id="allowedEndTime"
                  name="allowedEndTime"
                  required
                  className="sc-input"
                />
              </div>

              {/* Frequency */}
              <div>
                <label htmlFor="frequency" className="sc-form-label">
                  Frequency
                </label>

                <select
                  id="frequency"
                  name="frequency"
                  required
                  className="sc-select"
                >
                  <option value="">Select frequency</option>
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="every_n_days">Every N days</option>
                  <option value="selected_weekdays">Selected weekdays</option>
                  <option value="custom">Custom (treated as once)</option>
                </select>
              </div>

              {/* Interval Days */}
              <div>
                <label htmlFor="intervalDays" className="sc-form-label">
                  Repeat interval (for Every N days)
                </label>
                <input
                  type="number"
                  id="intervalDays"
                  name="intervalDays"
                  min="1"
                  max="365"
                  defaultValue="1"
                  className="sc-input"
                />
              </div>

              {/* Weekdays */}
              <fieldset className="md:col-span-2">
                <legend className="sc-form-label mb-2">
                  Weekdays (for Selected weekdays)
                </legend>
                <div
                  className="flex flex-wrap gap-4 text-sm"
                  style={{ color: "var(--sc-text)" }}
                >
                  {[
                    ["0", "Sun"],
                    ["1", "Mon"],
                    ["2", "Tue"],
                    ["3", "Wed"],
                    ["4", "Thu"],
                    ["5", "Fri"],
                    ["6", "Sat"],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-2"
                      style={{ color: "var(--sc-text)" }}
                    >
                      <input type="checkbox" name="weekdays" value={value} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Exclude Date */}
              <div>
                <label htmlFor="excludedDate" className="sc-form-label">
                  Exclude date (optional)
                </label>
                <input
                  type="date"
                  id="excludedDate"
                  name="excludedDate"
                  className="sc-input"
                />
              </div>

              {/* Additional Daily Time Window */}
              <div>
                <label className="sc-form-label">
                  Additional daily time window (optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    name="secondStartTime"
                    aria-label="Additional window start time"
                    className="sc-input"
                  />
                  <input
                    type="time"
                    name="secondEndTime"
                    aria-label="Additional window end time"
                    className="sc-input"
                  />
                </div>
              </div>

              {/* Priority */}
              <div>
                <label htmlFor="priority" className="sc-form-label">
                  Priority
                </label>

                <select
                  id="priority"
                  name="priority"
                  required
                  className="sc-select"
                >
                  <option value="">Select priority</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

            </div>
          </section>

          {/* ====================================================== */}
          {/* COMPLETION CRITERIA */}
          {/* ====================================================== */}

          <section className="sc-card-lg">
            <h2 className="text-base font-semibold">Completion Criteria</h2>

            <p className="mt-2 text-sm" style={{ color: "var(--sc-muted)" }}>
              Define what counts as completion of this task.
            </p>

            <div className="mt-6 space-y-5">

              {/* Completion Criteria */}
              <div>
                <label htmlFor="completionCriteria" className="sc-form-label">
                  Completion Criteria
                </label>

                <textarea
                  id="completionCriteria"
                  name="completionCriteria"
                  rows={3}
                  required
                  placeholder="Example: Patient confirms that the prescribed activity was completed."
                  className="sc-input"
                />
              </div>

              {/* Verification Method */}
              <div>
                <label htmlFor="verificationMethod" className="sc-form-label">
                  Verification Method
                </label>

                <select
                  id="verificationMethod"
                  name="verificationMethod"
                  required
                  className="sc-select"
                >
                  <option value="">Select verification method</option>
                  <option value="patient_report">Patient Report</option>
                  <option value="document">Document / Report</option>
                  <option value="appointment">Appointment Record</option>
                  <option value="iot">IoT / Device Event</option>
                  <option value="multiple">Multiple Evidence Sources</option>
                </select>
              </div>

            </div>
          </section>

          {/* ====================================================== */}
          {/* DEPENDENCY */}
          {/* ====================================================== */}

          <section className="sc-card-lg">
            <h2 className="text-base font-semibold">Dependency</h2>

            <p className="mt-2 text-sm" style={{ color: "var(--sc-muted)" }}>
              Dependencies will allow SmartCare to determine
              whether another task must be completed first.
            </p>

            <div className="mt-6">
              <label htmlFor="dependencyType" className="sc-form-label">
                Dependency Type
              </label>

              <select
                id="dependencyType"
                name="dependencyType"
                className="sc-select"
              >
                <option value="none">No Dependency</option>
                <option value="before">Must occur before another task</option>
                <option value="required_before">Required before this task</option>
                <option value="after">Must occur after another task</option>
              </select>
            </div>
          </section>

          {/* ====================================================== */}
          {/* IMPORTANT */}
          {/* ====================================================== */}

          <section className="sc-alert-warning">
            <h2 className="text-base font-semibold">Important</h2>

            <p className="mt-2 text-sm leading-6">
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
            <div className="sc-alert-error">
              <h3 className="font-semibold">Could not create task</h3>
              <p className="mt-2 text-sm">{errorMessage}</p>
            </div>
          )}

          {/* ====================================================== */}
          {/* SUCCESS */}
          {/* ====================================================== */}

          {submitted && (
            <div className="sc-alert-success">
              <h3 className="font-semibold">Task Created</h3>
              <p className="mt-2 text-sm">
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
              className="sc-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Saving..." : "Add Task"}
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}