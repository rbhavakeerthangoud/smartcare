import type {
  CarePlanHealthResult,
  CarePlanProgressMetrics,
  DependencyGraphNode,
  DependencyResult,
  DependencyState,
  DependencyValidationIssue,
  DependencyValidationResult,
  ExecutionState,
  TaskDependency,
} from "./types";

const COMPLETED_STATES = new Set<ExecutionState>([
  "ON_TIME",
  "DOCUMENT_RECORDED",
  "REPORTED",
  "ACTIVE",
  "PARTIAL",
]);
const AT_RISK_STATES = new Set<ExecutionState>([
  "LATE",
  "UNCONFIRMED",
  "CONFLICTING",
  "BEFORE_WINDOW",
  "INSUFFICIENT_EVIDENCE",
  "BLOCKED",
]);

function executionReadiness(state: ExecutionState | undefined): {
  state: DependencyState;
  reason: string;
} {
  if (!state || state === "PENDING") {
    return { state: "BLOCKED", reason: "The prerequisite has not been completed." };
  }
  if (COMPLETED_STATES.has(state)) {
    return { state: "READY", reason: "The prerequisite is complete." };
  }
  if (AT_RISK_STATES.has(state)) {
    return {
      state: "AT_RISK",
      reason: `The prerequisite execution state is ${state}.`,
    };
  }
  return {
    state: "BLOCKED",
    reason: `The prerequisite execution state is ${state}.`,
  };
}

function combine(
  left: DependencyState,
  right: DependencyState,
): DependencyState {
  if (left === "BLOCKED" || right === "BLOCKED") return "BLOCKED";
  if (left === "AT_RISK" || right === "AT_RISK") return "AT_RISK";
  if (left === "COMPLETED" || right === "COMPLETED") return "COMPLETED";
  if (left === "NOT_APPLICABLE" || right === "NOT_APPLICABLE") {
    return left === "NOT_APPLICABLE" ? right : left;
  }
  return "READY";
}

export function validateDependencies(input: {
  dependencies: TaskDependency[];
  taskIds: Iterable<string>;
  carePlanId?: string;
  taskCarePlanIds?: ReadonlyMap<string, string>;
}): DependencyValidationResult {
  const seen = new Set<string>();
  const issues: DependencyValidationIssue[] = [];
  const taskSet = new Set(input.taskIds);

  for (const dependency of input.dependencies) {
    const key = `${dependency.prerequisiteTaskId}->${dependency.dependentTaskId}`;
    if (dependency.prerequisiteTaskId === dependency.dependentTaskId) {
      issues.push({
        code: "SELF_DEPENDENCY",
        dependency,
        message: "A task cannot depend on itself.",
      });
    }
    if (seen.has(key)) {
      issues.push({
        code: "DUPLICATE_DEPENDENCY",
        dependency,
        message: "This dependency is already recorded.",
      });
    }
    if (!taskSet.has(dependency.prerequisiteTaskId)) {
      issues.push({
        code: "MISSING_TASK",
        dependency,
        message: `Prerequisite task ${dependency.prerequisiteTaskId} does not exist.`,
      });
    }
    if (!taskSet.has(dependency.dependentTaskId)) {
      issues.push({
        code: "MISSING_TASK",
        dependency,
        message: `Dependent task ${dependency.dependentTaskId} does not exist.`,
      });
    }
    if (
      input.carePlanId &&
      input.taskCarePlanIds &&
      input.taskCarePlanIds.get(dependency.prerequisiteTaskId) !== input.carePlanId &&
      input.taskCarePlanIds.get(dependency.dependentTaskId) !== input.carePlanId
    ) {
      issues.push({
        code: "CROSS_CARE_PLAN_DEPENDENCY",
        dependency,
        message: "Dependency crosses care-plan boundaries.",
      });
    }
    if (!["BEFORE", "REQUIRED_BEFORE", "AFTER"].includes(dependency.type)) {
      issues.push({
        code: "INVALID_DEPENDENCY_TYPE",
        dependency,
        message: `Unsupported dependency type: ${dependency.type}.`,
      });
    }
    seen.add(key);
  }

  const dependents = new Map<string, string[]>();
  for (const dependency of input.dependencies) {
    const list = dependents.get(dependency.prerequisiteTaskId) || [];
    list.push(dependency.dependentTaskId);
    dependents.set(dependency.prerequisiteTaskId, list);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  function markCycle(taskId: string): void {
    if (visiting.has(taskId)) {
      issues.push({
        code: "CIRCULAR_DEPENDENCY",
        dependency: {
          prerequisiteTaskId: taskId,
          dependentTaskId: taskId,
          type: "REQUIRED_BEFORE",
        },
        message: "A circular dependency was detected.",
      });
      return;
    }
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependent of dependents.get(taskId) || []) {
      markCycle(dependent);
    }
    visiting.delete(taskId);
    visited.add(taskId);
  }

  for (const taskId of taskSet) {
    markCycle(taskId);
  }

  const uniqueIssues = new Map<string, DependencyValidationIssue>();
  for (const issue of issues) {
    const key = `${issue.code}:${issue.dependency.prerequisiteTaskId}:${issue.dependency.dependentTaskId}`;
    if (!uniqueIssues.has(key)) uniqueIssues.set(key, issue);
  }

  return {
    valid: uniqueIssues.size === 0,
    issues: [...uniqueIssues.values()],
  };
}

export function buildDependencyGraph(
  dependencies: TaskDependency[],
  taskIds: Iterable<string>,
): Map<string, DependencyGraphNode> {
  const graph = new Map<string, DependencyGraphNode>();
  for (const taskId of taskIds) {
    graph.set(taskId, { taskId, prerequisites: [], dependents: [] });
  }

  for (const dependency of dependencies) {
    const prerequisites = graph.get(dependency.dependentTaskId)?.prerequisites || [];
    if (!prerequisites.includes(dependency.prerequisiteTaskId)) {
      prerequisites.push(dependency.prerequisiteTaskId);
    }
    const dependents = graph.get(dependency.prerequisiteTaskId)?.dependents || [];
    if (!dependents.includes(dependency.dependentTaskId)) {
      dependents.push(dependency.dependentTaskId);
    }
    graph.set(dependency.dependentTaskId, {
      taskId: dependency.dependentTaskId,
      prerequisites,
      dependents: graph.get(dependency.dependentTaskId)?.dependents || [],
    });
    graph.set(dependency.prerequisiteTaskId, {
      taskId: dependency.prerequisiteTaskId,
      prerequisites: graph.get(dependency.prerequisiteTaskId)?.prerequisites || [],
      dependents,
    });
  }

  return graph;
}

export function evaluateDependencies(input: {
  dependencies: TaskDependency[];
  executionStates: ReadonlyMap<string, ExecutionState>;
  taskIds?: Iterable<string>;
}): Map<string, DependencyResult> {
  const incoming = new Map<string, TaskDependency[]>();
  for (const dependency of input.dependencies) {
    const list = incoming.get(dependency.dependentTaskId) || [];
    list.push(dependency);
    incoming.set(dependency.dependentTaskId, list);
  }

  const allTaskIds = new Set(input.taskIds ? [...input.taskIds] : []);
  for (const dependency of input.dependencies) {
    allTaskIds.add(dependency.prerequisiteTaskId);
    allTaskIds.add(dependency.dependentTaskId);
  }

  function evaluateTask(taskId: string, path: string[]): {
    state: DependencyState;
    reasons: string[];
  } {
    if (path.includes(taskId)) {
      return {
        state: "BLOCKED",
        reasons: ["A dependency cycle exists; the task cannot be ordered safely."],
      };
    }

    const edges = incoming.get(taskId) || [];
    if (edges.length === 0) {
      return { state: "READY", reasons: [] };
    }

    let state: DependencyState = "READY";
    const reasons: string[] = [];

    for (const edge of edges) {
      const upstreamDependencies = evaluateTask(
        edge.prerequisiteTaskId,
        [...path, taskId],
      );
      const upstreamExecution = executionReadiness(
        input.executionStates.get(edge.prerequisiteTaskId),
      );
      const upstreamState = combine(
        upstreamDependencies.state,
        upstreamExecution.state,
      );
      const hasCycle = upstreamDependencies.reasons.some((reason) =>
        reason.includes("dependency cycle"),
      );
      let edgeState: DependencyState = upstreamState;

      if (
        edge.type !== "REQUIRED_BEFORE" &&
        upstreamState === "BLOCKED" &&
        !hasCycle
      ) {
        edgeState = "AT_RISK";
      }
      state = combine(state, edgeState);

      const relation =
        edge.type === "BEFORE"
          ? "must precede"
          : edge.type === "AFTER"
            ? "must be followed by"
            : "is required before";
      reasons.push(
        `Task ${edge.prerequisiteTaskId} ${relation} ${taskId}. ${upstreamExecution.reason}`,
      );
      reasons.push(...upstreamDependencies.reasons);
    }

    return { state, reasons: [...new Set(reasons)] };
  }

  const result = new Map<string, DependencyResult>();
  for (const taskId of allTaskIds) {
    const edges = incoming.get(taskId) || [];
    const evaluation = evaluateTask(taskId, []);
    result.set(taskId, {
      taskId,
      state: evaluation.state,
      reasons: evaluation.reasons,
      prerequisites: [...new Set(edges.map((edge) => edge.prerequisiteTaskId))],
    });
  }
  return result;
}

export function summarizeCarePlanHealth(input: {
  dependencies: TaskDependency[];
  executionStates: ReadonlyMap<string, ExecutionState>;
  escalations: Array<{ occurrence_id?: string | null; trigger_state?: string | null }>;
  taskIds?: Iterable<string>;
  carePlanStatus?: string;
}): CarePlanHealthResult {
  const results = evaluateDependencies({
    dependencies: input.dependencies,
    executionStates: input.executionStates,
    taskIds: input.taskIds,
  });

  const blockedTaskIds = [...results.entries()]
    .filter(([, result]) => result.state === "BLOCKED")
    .map(([taskId]) => taskId);
  const affectedTaskIds = [...results.entries()]
    .filter(([, result]) => result.state === "AT_RISK" || result.state === "BLOCKED")
    .map(([taskId]) => taskId);

  const metrics: CarePlanProgressMetrics = {
    totalActiveOccurrences: Math.max(0, input.executionStates.size),
    completedOccurrences: [...input.executionStates.values()].filter((state) =>
      ["ON_TIME", "DOCUMENT_RECORDED", "REPORTED"].includes(state),
    ).length,
    onTimeOccurrences: [...input.executionStates.values()].filter((state) => state === "ON_TIME").length,
    lateOccurrences: [...input.executionStates.values()].filter((state) => state === "LATE").length,
    missedOccurrences: [...input.executionStates.values()].filter((state) => state === "MISSED").length,
    unconfirmedOccurrences: [...input.executionStates.values()].filter((state) => state === "UNCONFIRMED").length,
    conflictingOccurrences: [...input.executionStates.values()].filter((state) => state === "CONFLICTING").length,
    blockedOccurrences: blockedTaskIds.length,
    onTimeRate: 0,
    completionRate: 0,
  };

  if (metrics.totalActiveOccurrences > 0) {
    metrics.onTimeRate = (metrics.onTimeOccurrences / metrics.totalActiveOccurrences) * 100;
    metrics.completionRate = (metrics.completedOccurrences / metrics.totalActiveOccurrences) * 100;
  }

  const escalationCount = input.escalations.filter((escalation) => {
    const triggerState = escalation.trigger_state || "";
    return ["MISSED", "LATE", "UNCONFIRMED", "CONFLICTING"].includes(triggerState);
  }).length;

  let state: CarePlanHealthResult["state"] = "HEALTHY";
  let reason = "All active tasks are progressing without dependency or evidence issues.";

  if ((input.carePlanStatus || "ACTIVE").toUpperCase() === "INACTIVE") {
    state = "INACTIVE";
    reason = "The care plan is inactive and not being evaluated in active workflows.";
  } else if (blockedTaskIds.length > 0) {
    state = "BLOCKED";
    reason = `${blockedTaskIds.length} dependent task(s) are blocked by incomplete prerequisites.`;
  } else if (metrics.unconfirmedOccurrences > 0 || metrics.conflictingOccurrences > 0) {
    state = "ATTENTION_REQUIRED";
    reason = "Task evidence still requires reconciliation before the care plan can be considered fully healthy.";
  } else if (metrics.lateOccurrences > 0 || affectedTaskIds.length > 0) {
    state = "AT_RISK";
    reason = `${metrics.lateOccurrences} active task(s) are late or at risk of becoming blocked.`;
  } else if (metrics.missedOccurrences > 0) {
    state = "AT_RISK";
    reason = `${metrics.missedOccurrences} task(s) have missed their deadline.`;
  }

  return {
    state,
    reason,
    metrics,
    blockedTaskIds,
    affectedTaskIds,
    escalationCount,
  };
}
