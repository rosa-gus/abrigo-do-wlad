export const ABSENT_REVISION = "absent";

export class RevisionError extends Error {
  readonly status: 412 | 428;
  constructor(status: 412 | 428, message: string) {
    super(message);
    this.status = status;
    this.name = "RevisionError";
  }
}

export function assertRevision(
  expected: string,
  current: string | undefined,
): void {
  if (expected !== (current ?? ABSENT_REVISION)) {
    throw new RevisionError(
      412,
      "O registro mudou. Recarregue e revise antes de tentar novamente.",
    );
  }
}
