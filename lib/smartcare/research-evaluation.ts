import type { ExecutionState } from "./types";

const ESCALATION_STATES = new Set<ExecutionState>([
  "MISSED",
  "UNCONFIRMED",
  "CONFLICTING",
  "LATE",
]);

export interface EvaluationScenario {
  expectedState: ExecutionState;
  actualState: ExecutionState;
  expectedTemporalState?: ExecutionState;
  actualTemporalState?: ExecutionState;
  expectedEscalation?: boolean;
  actualEscalation?: boolean;
  escalationCount?: number;
  expectedAt?: string;
  escalatedAt?: string;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function evaluateScenarios(scenarios: EvaluationScenario[]) {
  if (scenarios.length === 0) {
    throw new Error("At least one controlled evaluation scenario is required.");
  }

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let duplicateScenarios = 0;
  let temporalMatches = 0;
  let temporalScenarioCount = 0;
  let escalationLatencyTotal = 0;
  let escalationLatencyCount = 0;

  for (const scenario of scenarios) {
    const expectedEscalation =
      scenario.expectedEscalation ??
      ESCALATION_STATES.has(scenario.expectedState);
    const actualEscalation =
      scenario.actualEscalation ??
      ESCALATION_STATES.has(scenario.actualState);

    if (expectedEscalation && actualEscalation) truePositive++;
    if (!expectedEscalation && actualEscalation) falsePositive++;
    if (expectedEscalation && !actualEscalation) falseNegative++;
    if (!expectedEscalation && !actualEscalation) trueNegative++;
    if ((scenario.escalationCount || 0) > 1) duplicateScenarios++;
    if (
      scenario.expectedTemporalState &&
      scenario.actualTemporalState
    ) {
      temporalScenarioCount++;
      if (
        scenario.expectedTemporalState === scenario.actualTemporalState
      ) {
        temporalMatches++;
      }
    }

    if (scenario.expectedAt && scenario.escalatedAt) {
      const latency =
        new Date(scenario.escalatedAt).getTime() -
        new Date(scenario.expectedAt).getTime();
      if (!Number.isFinite(latency) || latency < 0) {
        throw new Error("Evaluation timestamps must be valid and ordered.");
      }
      escalationLatencyTotal += latency;
      escalationLatencyCount++;
    }
  }

  const stateAccuracy =
    scenarios.filter(
      (scenario) => scenario.expectedState === scenario.actualState,
    ).length / scenarios.length;
  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);
  const f1 =
    precision === null ||
    recall === null ||
    precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  return {
    scenarioCount: scenarios.length,
    stateAccuracy,
    temporalClassificationAccuracy:
      temporalScenarioCount === 0
        ? null
        : temporalMatches / temporalScenarioCount,
    escalationPrecision: precision,
    escalationRecall: recall,
    escalationF1: f1,
    falseEscalationRate: ratio(falsePositive, falsePositive + trueNegative),
    missedEscalationRate: ratio(falseNegative, falseNegative + truePositive),
    duplicateEscalationRate: duplicateScenarios / scenarios.length,
    averageEscalationLatencyMilliseconds:
      escalationLatencyCount === 0
        ? null
        : escalationLatencyTotal / escalationLatencyCount,
  };
}
