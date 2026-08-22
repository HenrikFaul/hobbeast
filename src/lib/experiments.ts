export type ExperimentGuardrailDirection = 'maximum' | 'minimum';

export interface ExperimentGuardrail {
  metricKey: string;
  direction: ExperimentGuardrailDirection;
  threshold: number;
  minimumSampleSize: number;
  autoStop: boolean;
}

export interface ExperimentMetricSnapshot {
  metricKey: string;
  metricValue: number;
  sampleSize: number;
  windowEndedAt: string;
}

export interface ExperimentGuardrailBreach {
  metricKey: string;
  direction: ExperimentGuardrailDirection;
  threshold: number;
  metricValue: number;
  sampleSize: number;
}

export interface ExperimentGuardrailEvaluation {
  shouldAutoStop: boolean;
  breaches: ExperimentGuardrailBreach[];
  missingMetrics: string[];
}

export function evaluateExperimentGuardrails(
  guardrails: readonly ExperimentGuardrail[],
  snapshots: readonly ExperimentMetricSnapshot[],
): ExperimentGuardrailEvaluation {
  const latestByMetric = new Map<string, ExperimentMetricSnapshot>();
  for (const snapshot of snapshots) {
    if (!Number.isFinite(snapshot.metricValue) || !Number.isInteger(snapshot.sampleSize) || snapshot.sampleSize < 0) continue;
    if (Number.isNaN(Date.parse(snapshot.windowEndedAt))) continue;
    const current = latestByMetric.get(snapshot.metricKey);
    if (!current || Date.parse(snapshot.windowEndedAt) > Date.parse(current.windowEndedAt)) {
      latestByMetric.set(snapshot.metricKey, snapshot);
    }
  }

  const breaches: ExperimentGuardrailBreach[] = [];
  const missingMetrics: string[] = [];
  for (const guardrail of guardrails) {
    const snapshot = latestByMetric.get(guardrail.metricKey);
    if (!snapshot) {
      missingMetrics.push(guardrail.metricKey);
      continue;
    }
    if (!guardrail.autoStop || snapshot.sampleSize < guardrail.minimumSampleSize) continue;
    const breached = guardrail.direction === 'maximum'
      ? snapshot.metricValue > guardrail.threshold
      : snapshot.metricValue < guardrail.threshold;
    if (breached) {
      breaches.push({
        metricKey: guardrail.metricKey,
        direction: guardrail.direction,
        threshold: guardrail.threshold,
        metricValue: snapshot.metricValue,
        sampleSize: snapshot.sampleSize,
      });
    }
  }

  return {
    shouldAutoStop: breaches.length > 0,
    breaches: breaches.sort((left, right) => left.metricKey.localeCompare(right.metricKey)),
    missingMetrics: [...new Set(missingMetrics)].sort(),
  };
}
