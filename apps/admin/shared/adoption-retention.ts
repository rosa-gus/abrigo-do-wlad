import { ADOPTION_EXPIRATION_DAYS, ADOPTION_DECISION_RETENTION_DAYS } from "../../../workers/shared/api/adoption/retention";

const DAY_MS = 86_400_000;
export type AdoptionStatus = "pending" | "approved" | "rejected";

export class AdoptionTransitionError extends Error {}

export function adoptionStatusUpdate(
  data: Record<string, unknown>,
  status: AdoptionStatus,
  now = new Date(),
): { status: AdoptionStatus; expiresAt: string; originalExpiresAt: string; decisionExpiresAt?: string } {
  const submittedAt = typeof data.submittedAt === "string" ? Date.parse(data.submittedAt) : NaN;
  const currentExpiry = typeof data.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN;
  if (!Number.isFinite(submittedAt) || !Number.isFinite(currentExpiry)) {
    throw new AdoptionTransitionError("A solicitação não possui datas válidas para alterar a análise.");
  }
  const savedOriginalExpiry = typeof data.originalExpiresAt === "string"
    ? Date.parse(data.originalExpiresAt) : currentExpiry;
  if (!Number.isFinite(savedOriginalExpiry)) {
    throw new AdoptionTransitionError("O prazo original da solicitação é inválido.");
  }
  const originalExpiry = Math.min(savedOriginalExpiry, submittedAt + ADOPTION_EXPIRATION_DAYS * DAY_MS);
  const originalExpiresAt = new Date(originalExpiry).toISOString();
  const hasDecision = data.status === "approved" || data.status === "rejected";
  // Legacy decisions may lack decisionExpiresAt; preserve their stored deadline.
  const previousDecisionExpiry = typeof data.decisionExpiresAt === "string"
    ? Date.parse(data.decisionExpiresAt) : hasDecision ? currentExpiry : Infinity;
  if (Number.isNaN(previousDecisionExpiry)) {
    throw new AdoptionTransitionError("O prazo da decisão anterior é inválido.");
  }
  const effectiveExpiry = Math.min(currentExpiry, originalExpiry, previousDecisionExpiry);
  if (effectiveExpiry <= now.getTime()) {
    throw new AdoptionTransitionError("O prazo desta solicitação expirou. Não é possível alterar a análise.");
  }
  if ((data.status ?? "pending") === status || status === "pending") {
    return {
      status,
      expiresAt: new Date(effectiveExpiry).toISOString(),
      originalExpiresAt,
      ...(Number.isFinite(previousDecisionExpiry)
        ? { decisionExpiresAt: new Date(Math.min(originalExpiry, previousDecisionExpiry)).toISOString() }
        : {}),
    };
  }
  if (hasDecision) {
    throw new AdoptionTransitionError("Reconsidere a decisão antes de aprovar ou reprovar novamente.");
  }

  // The cron runs daily at 03:00 UTC. Choose its last run within seven days,
  // rather than waiting for the run after the seven-day deadline.
  const deadline = new Date(now.getTime() + ADOPTION_DECISION_RETENTION_DAYS * DAY_MS);
  const scheduledExpiry = new Date(deadline);
  scheduledExpiry.setUTCHours(3, 0, 0, 0);
  if (scheduledExpiry.getTime() > deadline.getTime()) {
    scheduledExpiry.setUTCDate(scheduledExpiry.getUTCDate() - 1);
  }
  const expiresAt = new Date(Math.min(effectiveExpiry, scheduledExpiry.getTime())).toISOString();
  if (Date.parse(expiresAt) <= now.getTime()) {
    throw new AdoptionTransitionError("O prazo para concluir esta análise expirou.");
  }
  return { status, expiresAt, originalExpiresAt, decisionExpiresAt: expiresAt };
}
