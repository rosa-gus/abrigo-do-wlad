import { FirestoreRestError, type FirestoreDocument, type FirestoreRestClient } from "../_lib/firestore";

export const NOTIFICATION_LEASE_MS = 60_000;
export const NOTIFICATION_WARNING = "A candidatura foi salva, mas a notificação automática ainda não foi confirmada. Guarde o ID e entre em contato com o abrigo se necessário.";

type NotificationRepository = Pick<FirestoreRestClient, "updateDocument">;

/** An update-time precondition prevents two retries from claiming the same delivery. */
export async function deliverNotification(
  repository: NotificationRepository,
  document: FirestoreDocument<Record<string, unknown>>,
  send: () => Promise<boolean>,
  now: () => Date,
  ownedAttemptId?: string,
): Promise<boolean> {
  if (document.data.notificationStatus === "sent") return true;
  let version = document.updateTime;
  if (!version) return false;
  if (!ownedAttemptId || document.data.notificationAttemptId !== ownedAttemptId) {
    const lease = Date.parse(String(document.data.notificationLeaseUntil ?? ""));
    const attempts = Number(document.data.notificationAttempts ?? 0);
    if (!Number.isInteger(attempts) || attempts < 1 || !Number.isFinite(lease) || lease > now().getTime() || attempts >= 3) return false;
    try {
      const claim = await repository.updateDocument(document.name, {
        notificationStatus: "pending",
        notificationAttemptId: crypto.randomUUID(),
        notificationLeaseUntil: new Date(now().getTime() + NOTIFICATION_LEASE_MS),
        notificationAttempts: attempts + 1,
      }, { expectedUpdateTime: version });
      version = claim.updateTime;
      if (!version) return false;
    } catch (error) {
      if (!(error instanceof FirestoreRestError && [409, 412].includes(error.status))) {
        console.error(JSON.stringify({ event: "adoption.notification.claim.failed", id: document.id }));
      }
      return false;
    }
  }

  let sent = false;
  try {
    sent = await send();
  } catch {
    // Persistence has already succeeded; notification failures must not undo it.
  }
  try {
    await repository.updateDocument(document.name, {
      notificationStatus: sent ? "sent" : "failed",
      notificationEmailSent: sent,
      notificationLeaseUntil: new Date(now().getTime() + NOTIFICATION_LEASE_MS),
    }, { expectedUpdateTime: version });
  } catch {
    console.error(JSON.stringify({ event: "adoption.notification.status.failed", id: document.id }));
    return false;
  }
  return sent;
}
