import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const build = process.env.SMARTCARE_TEST_BUILD;
function findGeneratedModule(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === name) return entryPath;
    if (entry.isDirectory()) {
      const result = findGeneratedModule(entryPath, name);
      if (result) return result;
    }
  }
  throw new Error(`Could not find compiled test module ${name}.`);
}
const loadModule = (name) =>
  import(pathToFileURL(findGeneratedModule(build, name)).href);
const [
  { reconcileEvidence },
  { evaluateExecution },
  { evaluateDependencies, validateDependencies, summarizeCarePlanHealth },
  {
    createEscalationCandidate,
    getEscalationRule,
    hasMatchingEscalation,
  },
  { generateOccurrences },
  { normalizeDeviceEvent },
  { confirmStructuredResponse, validateStructuredResponse },
  { createDocumentCandidate, reviewDocumentCandidate },
  { createAppointmentEvent },
  { evaluateScenarios },
  { sendNotification },
  { canAccessRolePath, dashboardPathForRole },
  { isEscalationRequest },
] = await Promise.all([
  loadModule("evidence-engine.js"),
  loadModule("execution-engine.js"),
  loadModule("dependency-engine.js"),
  loadModule("escalation-engine.js"),
  loadModule("recurrence-engine.js"),
  loadModule("iot-adapter.js"),
  loadModule("structured-response-adapter.js"),
  loadModule("document-processing-adapter.js"),
  loadModule("appointment-adapter.js"),
  loadModule("research-evaluation.js"),
  loadModule("notification-service.js"),
  loadModule("role-navigation.js"),
  loadModule("escalation-request.js"),
]);

const occurrence = {
  id: "occ-1",
  occurrence_date: "2026-01-15",
  allowed_start_time: "08:00",
  allowed_end_time: "10:00",
};
const task = { id: "task-1", verification_method: "patient" };

function event(source, value, time = "2026-01-15T09:00:00") {
  return {
    occurrence_id: occurrence.id,
    source,
    value,
    event_time: new Date(time).toISOString(),
  };
}

function runExecution({ events = [], documents = [], now }) {
  return evaluateExecution({
    task,
    occurrence,
    events,
    documents,
    now: new Date(now),
  });
}

test("classifies evidence within and outside the allowed time window", () => {
  assert.equal(
    runExecution({
      events: [event("PATIENT_REPORT", "completed")],
      now: "2026-01-15T11:00:00",
    }).state,
    "ON_TIME",
  );
  assert.equal(
    runExecution({
      events: [event("PATIENT_REPORT", "completed", "2026-01-15T10:30:00")],
      now: "2026-01-15T11:00:00",
    }).state,
    "LATE",
  );
  assert.equal(
    runExecution({
      events: [event("PATIENT_REPORT", "completed", "2026-01-15T07:30:00")],
      now: "2026-01-15T11:00:00",
    }).state,
    "BEFORE_WINDOW",
  );
});

test("does not classify an occurrence as missed before its deadline", () => {
  assert.equal(
    runExecution({ now: "2026-01-15T09:59:59" }).state,
    "PENDING",
  );
  assert.equal(
    runExecution({ now: "2026-01-15T10:00:00" }).state,
    "PENDING",
  );
  assert.equal(
    runExecution({ now: "2026-01-15T10:00:01" }).state,
    "MISSED",
  );
});

test("evaluates execution windows across time zones and rejects invalid DST wall times", () => {
  const newYorkOccurrence = {
    ...occurrence,
    occurrence_date: "2026-11-01",
    time_zone: "America/New_York",
    allowed_start_time: "01:15",
    allowed_end_time: "01:45",
  };
  const beforeDeadline = evaluateExecution({
    task,
    occurrence: newYorkOccurrence,
    events: [],
    documents: [],
    now: new Date("2026-11-01T05:30:00.000Z"),
  });
  const afterDeadline = evaluateExecution({
    task,
    occurrence: newYorkOccurrence,
    events: [],
    documents: [],
    now: new Date("2026-11-01T05:46:00.000Z"),
  });
  assert.equal(beforeDeadline.state, "PENDING");
  assert.equal(afterDeadline.state, "MISSED");

  const invalidDstTime = evaluateExecution({
    task,
    occurrence: {
      ...newYorkOccurrence,
      occurrence_date: "2026-03-08",
      allowed_end_time: "02:30",
    },
    events: [],
    documents: [],
    now: new Date("2026-03-08T08:00:00.000Z"),
  });
  assert.equal(invalidDstTime.state, "INSUFFICIENT_EVIDENCE");
});

test("reconciles conflicts, required verification, and document evidence", () => {
  assert.equal(
    runExecution({
      events: [
        event("PATIENT_REPORT", "completed"),
        event("IOT_SIMULATION", "not_detected"),
      ],
      now: "2026-01-15T11:00:00",
    }).state,
    "CONFLICTING",
  );

  assert.equal(
    evaluateExecution({
      task: { ...task, verification_method: "document" },
      occurrence,
      events: [event("PATIENT_REPORT", "completed")],
      documents: [],
      now: new Date("2026-01-15T09:30:00"),
    }).state,
    "UNCONFIRMED",
  );

  assert.equal(
    evaluateExecution({
      task: { ...task, verification_method: "iot" },
      occurrence,
      events: [
        event("PATIENT_REPORT", "completed"),
        event("IOT", "detected"),
      ],
      documents: [],
      now: new Date("2026-01-15T11:00:00"),
    }).state,
    "ON_TIME",
  );

  assert.equal(
    evaluateExecution({
      task: { ...task, verification_method: "iot" },
      occurrence,
      events: [event("PATIENT_REPORT", "completed")],
      documents: [],
      now: new Date("2026-01-15T11:00:00"),
    }).state,
    "UNCONFIRMED",
  );

  assert.equal(
    reconcileEvidence({
      task,
      occurrence,
      events: [],
      documents: [{
        occurrence_id: occurrence.id,
        uploaded_at: new Date("2026-01-15T09:30:00").toISOString(),
      }],
      now: new Date("2026-01-15T11:00:00"),
    }).state,
    "DOCUMENT_RECORDED",
  );

  const appointmentEvent = event("APPOINTMENT", "attended");
  assert.equal(
    evaluateExecution({
      task,
      occurrence,
      events: [appointmentEvent],
      documents: [],
      now: new Date("2026-01-15T11:00:00"),
    }).state,
    "ON_TIME",
  );

  assert.equal(
    evaluateExecution({
      task,
      occurrence,
      events: [
        {
          ...event("PATIENT_REPORT", "completed"),
          event_time: new Date("2026-01-15T10:30:00Z").toISOString(),
        },
      ],
      documents: [],
      now: new Date("2026-01-15T11:00:00Z"),
    }).state,
    "LATE",
  );
});

test("rejects future evidence from changing task execution state", () => {
  assert.equal(
    runExecution({
      events: [event("PATIENT_REPORT", "completed", "2026-01-15T12:00:00")],
      now: "2026-01-15T09:00:00",
    }).state,
    "INSUFFICIENT_EVIDENCE",
  );
});

test("accepts caregiver reports as distinct evidence without treating them as patient evidence", () => {
  const caregiverEvidence = evaluateExecution({
    task: { ...task, verification_method: "patient" },
    occurrence,
    events: [event("CAREGIVER_REPORT", "completed", "2026-01-15T09:30:00")],
    documents: [],
    now: new Date("2026-01-15T11:00:00Z"),
  });
  assert.equal(caregiverEvidence.state, "ON_TIME");

  const conflictingCaregiverIot = evaluateExecution({
    task: { ...task, verification_method: "iot" },
    occurrence,
    events: [
      event("CAREGIVER_REPORT", "completed", "2026-01-15T09:30:00"),
      event("IOT", "not_detected", "2026-01-15T09:35:00"),
    ],
    documents: [],
    now: new Date("2026-01-15T11:00:00Z"),
  });
  assert.equal(conflictingCaregiverIot.state, "CONFLICTING");
});

test("evaluates dependency readiness, chains, soft ordering, and cycles", () => {
  const dependencies = [
    { prerequisiteTaskId: "a", dependentTaskId: "b", type: "REQUIRED_BEFORE" },
    { prerequisiteTaskId: "b", dependentTaskId: "c", type: "REQUIRED_BEFORE" },
  ];
  const pending = evaluateDependencies({
    dependencies,
    executionStates: new Map([["a", "ON_TIME"], ["b", "PENDING"]]),
  });
  assert.equal(pending.get("b").state, "READY");
  assert.equal(pending.get("c").state, "BLOCKED");

  const soft = evaluateDependencies({
    dependencies: [
      { prerequisiteTaskId: "a", dependentTaskId: "b", type: "BEFORE" },
    ],
    executionStates: new Map([["a", "PENDING"]]),
  });
  assert.equal(soft.get("b").state, "AT_RISK");

  const cycle = evaluateDependencies({
    dependencies: [
      { prerequisiteTaskId: "a", dependentTaskId: "b", type: "BEFORE" },
      { prerequisiteTaskId: "b", dependentTaskId: "a", type: "BEFORE" },
    ],
    executionStates: new Map([["a", "ON_TIME"], ["b", "ON_TIME"]]),
  });
  assert.equal(cycle.get("a").state, "BLOCKED");
  assert.equal(cycle.get("b").state, "BLOCKED");
});

test("validates dependency structure and calculates care-plan health deterministically", () => {
  const invalid = validateDependencies({
    dependencies: [
      { prerequisiteTaskId: "a", dependentTaskId: "a", type: "REQUIRED_BEFORE" },
      { prerequisiteTaskId: "a", dependentTaskId: "b", type: "REQUIRED_BEFORE" },
      { prerequisiteTaskId: "b", dependentTaskId: "a", type: "REQUIRED_BEFORE" },
      { prerequisiteTaskId: "x", dependentTaskId: "b", type: "REQUIRED_BEFORE" },
      { prerequisiteTaskId: "b", dependentTaskId: "c", type: "REQUIRED_BEFORE" },
      { prerequisiteTaskId: "a", dependentTaskId: "b", type: "REQUIRED_BEFORE" },
    ],
    taskIds: ["a", "b", "c"],
    carePlanId: "plan-1",
    taskCarePlanIds: new Map([
      ["a", "plan-1"],
      ["b", "plan-1"],
      ["c", "plan-1"],
    ]),
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((issue) => issue.code === "SELF_DEPENDENCY"));
  assert.ok(invalid.issues.some((issue) => issue.code === "CIRCULAR_DEPENDENCY"));
  assert.ok(invalid.issues.some((issue) => issue.code === "MISSING_TASK"));
  assert.ok(invalid.issues.some((issue) => issue.code === "DUPLICATE_DEPENDENCY"));

  const dependencyResult = evaluateDependencies({
    dependencies: [
      { prerequisiteTaskId: "a", dependentTaskId: "b", type: "REQUIRED_BEFORE" },
      { prerequisiteTaskId: "b", dependentTaskId: "c", type: "REQUIRED_BEFORE" },
    ],
    executionStates: new Map([
      ["a", "ON_TIME"],
      ["b", "UNCONFIRMED"],
      ["c", "MISSED"],
    ]),
    taskIds: ["a", "b", "c"],
  });
  assert.equal(dependencyResult.get("c").state, "AT_RISK");

  const health = summarizeCarePlanHealth({
    dependencies: [
      { prerequisiteTaskId: "a", dependentTaskId: "b", type: "REQUIRED_BEFORE" },
      { prerequisiteTaskId: "b", dependentTaskId: "c", type: "REQUIRED_BEFORE" },
    ],
    executionStates: new Map([
      ["a", "ON_TIME"],
      ["b", "UNCONFIRMED"],
      ["c", "MISSED"],
    ]),
    escalations: [{ occurrence_id: "occ-1", trigger_state: "MISSED" }],
    taskIds: ["a", "b", "c"],
  });
  assert.equal(health.state, "ATTENTION_REQUIRED");
  assert.ok(health.reason.toLowerCase().includes("reconciliation"));
  assert.equal(health.metrics.missedOccurrences, 1);
  assert.equal(health.metrics.blockedOccurrences, 0);
  assert.equal(health.escalationCount, 1);
});

test("applies deterministic escalation rules and suppresses duplicate candidates", () => {
  assert.deepEqual(getEscalationRule("MISSED"), {
    triggerState: "MISSED",
    priority: "HIGH",
    recipientType: "CAREGIVER",
  });
  assert.deepEqual(getEscalationRule("CONFLICTING"), {
    triggerState: "CONFLICTING",
    priority: "HIGH",
    recipientType: "HEALTHCARE_PROFESSIONAL",
  });
  const candidate = createEscalationCandidate({
    occurrenceId: occurrence.id,
    taskId: task.id,
    carePlanId: "plan-1",
    taskName: "Follow-up",
    state: "MISSED",
  });
  assert.ok(candidate);
  assert.equal(
    hasMatchingEscalation(
      [{ occurrence_id: occurrence.id, trigger_state: "MISSED" }],
      candidate,
    ),
    true,
  );
});

test("generates bounded recurrence dates, exclusions, and multiple windows", () => {
  const generated = generateOccurrences({
    startDate: "2026-03-07",
    endDate: "2026-03-13",
    frequency: "SELECTED_WEEKDAYS",
    weekdays: [1, 3, 5],
    excludedDates: ["2026-03-09"],
    times: [
      { startTime: "08:00", endTime: "09:00" },
      { startTime: "17:00", endTime: "18:00" },
    ],
  });
  assert.deepEqual(
    generated.map((item) => item.occurrence_date),
    ["2026-03-11", "2026-03-11", "2026-03-13", "2026-03-13"],
  );
  assert.throws(
    () =>
      generateOccurrences({
        startDate: "2026-01-01",
        endDate: "2027-01-02",
        frequency: "DAILY",
      }),
    /more than 366 occurrences/,
  );
  assert.throws(
    () =>
      generateOccurrences({
        startDate: "2026-01-01",
        endDate: "2026-01-03",
        frequency: "SELECTED_WEEKDAYS",
      }),
    /Select at least one valid weekday/,
  );
});

test("supports once, weekly, and every-N-day recurrence", () => {
  assert.equal(
    generateOccurrences({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      frequency: "ONCE",
    }).length,
    1,
  );
  assert.deepEqual(
    generateOccurrences({
      startDate: "2026-01-01",
      endDate: "2026-01-15",
      frequency: "WEEKLY",
    }).map((item) => item.occurrence_date),
    ["2026-01-01", "2026-01-08", "2026-01-15"],
  );
  assert.deepEqual(
    generateOccurrences({
      startDate: "2026-01-01",
      endDate: "2026-01-08",
      frequency: "EVERY_N_DAYS",
      intervalDays: 3,
    }).map((item) => item.occurrence_date),
    ["2026-01-01", "2026-01-04", "2026-01-07"],
  );
});

test("validates IoT, appointment, document, and patient-confirmed structured input", () => {
  assert.equal(
    normalizeDeviceEvent({
      deviceId: "device-1",
      taskId: task.id,
      occurrenceId: occurrence.id,
      eventTime: "2026-01-15T09:00:00Z",
      value: "detected",
      confidence: 0.9,
    }).source,
    "IOT",
  );
  assert.equal(
    createAppointmentEvent({
      occurrenceId: occurrence.id,
      eventTime: "2026-01-15T09:00:00Z",
      value: "attended",
    }).source,
    "APPOINTMENT",
  );
  assert.throws(
    () =>
      confirmStructuredResponse(
        validateStructuredResponse({
          occurrenceId: occurrence.id,
          answer: "COMPLETED",
          capturedAt: "2026-01-15T09:00:00Z",
          confidence: 0.8,
        }),
        false,
      ),
    /must confirm/,
  );
  assert.equal(
    createDocumentCandidate({ documentId: "doc-1", text: "Existing instruction" })
      .status,
    "PENDING_REVIEW",
  );
  assert.equal(
    reviewDocumentCandidate({
      candidate: createDocumentCandidate({
        documentId: "doc-1",
        text: "Existing instruction",
      }),
      reviewerId: "clinician-1",
      reviewerRole: "CLINICIAN",
      approved: true,
    }).status,
    "APPROVED",
  );
});

test("computes research metrics from supplied scenarios, not fabricated totals", () => {
  const metrics = evaluateScenarios([
    {
      expectedState: "MISSED",
      actualState: "MISSED",
      expectedEscalation: true,
      actualEscalation: true,
      escalationCount: 1,
      expectedAt: "2026-01-15T10:00:00Z",
      escalatedAt: "2026-01-15T10:01:00Z",
    },
    {
      expectedState: "PENDING",
      actualState: "PENDING",
      expectedEscalation: false,
      actualEscalation: false,
      escalationCount: 0,
    },
  ]);
  assert.equal(metrics.stateAccuracy, 1);
  assert.equal(metrics.escalationPrecision, 1);
  assert.equal(metrics.escalationRecall, 1);
  assert.equal(metrics.falseEscalationRate, 0);
  assert.equal(metrics.averageEscalationLatencyMilliseconds, 60_000);
});

test("records notification lifecycle through the injected repository and adapter", async () => {
  const statuses = [];
  const result = await sendNotification({
    id: "notice-1",
    escalationId: "escalation-1",
    recipientId: "recipient-1",
    title: "Care-plan update",
    body: "There is a care-plan item that requires review.",
    adapter: { channel: "WEB", async deliver() { return "SENT"; } },
    repository: { async save(notification) { statuses.push(notification.status); } },
    now: new Date("2026-01-15T10:00:00Z"),
  });

  assert.deepEqual(statuses, ["CREATED", "QUEUED", "SENT"]);
  assert.equal(result.status, "SENT");
});

test("routes each role to its workspace and restricts role-specific pages", () => {
  assert.equal(dashboardPathForRole("PATIENT"), "/patient");
  assert.equal(dashboardPathForRole("CAREGIVER"), "/caregiver");
  assert.equal(dashboardPathForRole("CLINICIAN"), "/clinical");
  assert.equal(dashboardPathForRole("ADMIN"), "/admin");

  assert.equal(canAccessRolePath("PATIENT", "/care-plans/plan-1"), true);
  assert.equal(canAccessRolePath("PATIENT", "/tasks/new"), false);
  assert.equal(canAccessRolePath("PATIENT", "/patient"), true);
  assert.equal(canAccessRolePath("CAREGIVER", "/patient"), false);
  assert.equal(canAccessRolePath("CAREGIVER", "/clinical"), false);
  assert.equal(canAccessRolePath("CLINICIAN", "/patient"), false);
  assert.equal(canAccessRolePath("CLINICIAN", "/research"), true);
  assert.equal(canAccessRolePath("CLINICIAN", "/admin"), false);
  assert.equal(canAccessRolePath("ADMIN", "/patient"), true);
  assert.equal(canAccessRolePath("ADMIN", "/admin"), true);
  assert.equal(canAccessRolePath("ADMIN", "/tasks/new"), true);
});

test("validates escalation API identifiers and trigger states", () => {
  const validRequest = {
    carePlanId: "11111111-1111-4111-8111-111111111111",
    taskId: "22222222-2222-4222-8222-222222222222",
    occurrenceId: "33333333-3333-4333-8333-333333333333",
    triggerState: "CONFLICTING",
  };
  assert.equal(isEscalationRequest(validRequest), true);
  assert.equal(isEscalationRequest({ ...validRequest, taskId: "task-1" }), false);
  assert.equal(isEscalationRequest({ ...validRequest, triggerState: "ON_TIME" }), false);
  assert.equal(isEscalationRequest({ ...validRequest, occurrenceId: undefined }), false);
  assert.equal(isEscalationRequest(null), false);
});
