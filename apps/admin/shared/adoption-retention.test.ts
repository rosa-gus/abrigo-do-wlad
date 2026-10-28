import { describe, expect, test } from "vitest";
import { adoptionStatusUpdate } from "./adoption-retention";

const now = new Date("2026-10-10T12:00:00.000Z");
const application = {
  status: "pending",
  submittedAt: "2026-10-01T12:00:00.000Z",
  expiresAt: "2026-10-31T12:00:00.000Z",
};

describe("adoption decision retention", () => {
  test.each(["approved", "rejected"] as const)("schedules %s for the daily cron within seven days", (status) => {
    expect(adoptionStatusUpdate(application, status, now)).toEqual({
      status,
      expiresAt: "2026-10-17T03:00:00.000Z",
      originalExpiresAt: application.expiresAt,
      decisionExpiresAt: "2026-10-17T03:00:00.000Z",
    });
  });

  test("uses the preceding daily run when the seven-day deadline is before 03:00 UTC", () => {
    const update = adoptionStatusUpdate(application, "approved", new Date("2026-10-10T02:00:00.000Z"));
    expect(update.expiresAt).toBe("2026-10-16T03:00:00.000Z");
  });

  test("never extends the original thirty-day deadline", () => {
    expect(adoptionStatusUpdate(application, "approved", new Date("2026-10-29T12:00:00.000Z")).expiresAt)
      .toBe(application.expiresAt);
  });

  test("preserves the exact original expiry metadata when submittedAt was recorded later", () => {
    const original = { ...application, submittedAt: "2026-10-01T12:00:01.000Z" };
    const decided = { ...original, ...adoptionStatusUpdate(original, "approved", now) };
    expect(adoptionStatusUpdate(decided, "pending", now).originalExpiresAt).toBe(original.expiresAt);
  });

  test.each(["approved", "rejected"] as const)("reconsidering %s preserves the first decision window through subsequent reviews", (status) => {
    const decided = { ...application, ...adoptionStatusUpdate(application, status, now) };
    const update = adoptionStatusUpdate(decided, "pending", new Date("2026-10-11T12:00:00.000Z"));
    expect(update).toEqual({ status: "pending", expiresAt: decided.expiresAt, originalExpiresAt: application.expiresAt, decisionExpiresAt: decided.expiresAt });
    const reconsidered = { ...decided, ...update };
    const nextDecision = { ...reconsidered, ...adoptionStatusUpdate(reconsidered, status === "approved" ? "rejected" : "approved", new Date("2026-10-12T12:00:00.000Z")) };
    expect(nextDecision.expiresAt).toBe(decided.expiresAt);
    expect(adoptionStatusUpdate(nextDecision, "pending", new Date("2026-10-13T12:00:00.000Z")).expiresAt).toBe(decided.expiresAt);
  });

  test("preserves a legacy decision deadline when reconsidering", () => {
    const legacy = { ...application, status: "approved", expiresAt: "2026-10-15T03:00:00.000Z" };
    const reopened = adoptionStatusUpdate(legacy, "pending", now);
    expect(reopened.expiresAt).toBe(legacy.expiresAt);
    expect(reopened.decisionExpiresAt).toBe(legacy.expiresAt);
  });

  test("normalizes an earlier reopened pending application to its first decision deadline", () => {
    const reopened = { ...application, decisionExpiresAt: "2026-10-15T03:00:00.000Z" };
    expect(adoptionStatusUpdate(reopened, "pending", now).expiresAt).toBe(reopened.decisionExpiresAt);
  });

  test.each(["pending", "approved", "rejected"] as const)("rejects %s after a reconsidered application's first window expires", (status) => {
    const decided = { ...application, ...adoptionStatusUpdate(application, "approved", now) };
    const reopened = { ...decided, ...adoptionStatusUpdate(decided, "pending", now) };
    expect(() => adoptionStatusUpdate(reopened, status, new Date(decided.expiresAt))).toThrow(/expirou/);
  });

  test("repeated decisions do not postpone deletion", () => {
    const decided = { ...application, ...adoptionStatusUpdate(application, "approved", now) };
    expect(adoptionStatusUpdate(decided, "approved", new Date("2026-10-11T12:00:00.000Z")).expiresAt)
      .toBe(decided.expiresAt);
    expect(() => adoptionStatusUpdate(decided, "rejected", now)).toThrow(/Reconsidere/);
  });

  test("rejects reconsideration when the deletion deadline has arrived", () => {
    const decided = { ...application, ...adoptionStatusUpdate(application, "approved", now) };
    expect(() => adoptionStatusUpdate(decided, "pending", new Date(decided.expiresAt))).toThrow(/expirou/);
  });

  test("rejects decisions after an earlier decision window has expired", () => {
    const reopened = { ...application, decisionExpiresAt: "2026-10-09T03:00:00.000Z" };
    expect(() => adoptionStatusUpdate(reopened, "approved", now)).toThrow(/expirou/);
  });

  test("rejects invalid retention dates", () => {
    expect(() => adoptionStatusUpdate({ ...application, submittedAt: "invalid" }, "approved", now)).toThrow(/datas válidas/);
  });
});
