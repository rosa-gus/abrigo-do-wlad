/** Strong opaque validators preserve Firestore timestamp precision verbatim. */
export const ABSENT_REVISION = "absent";

export class RevisionError extends Error {
  readonly status: 412 | 428;
  constructor(status: 412 | 428, message: string) {
    super(message);
    this.status = status;
    this.name = "RevisionError";
  }
}

export function revisionEtag(revision: string | undefined): string {
  return `"${revision ?? ABSENT_REVISION}"`;
}

export function expectedRevision(request: Request, legacy?: string): string {
  const header = request.headers.get("If-Match");
  if (header !== null) {
    // Reject wildcard, weak validators and lists: a specific observed version is required.
    const match = /^"([^"\r\n]+)"$/.exec(header);
    if (!match) throw new RevisionError(412, "A revisão é inválida. Recarregue e revise a alteração.");
    return match[1];
  }
  if (legacy) return legacy;
  throw new RevisionError(428, "Recarregue o registro antes de alterar ou excluir.");
}

export function assertRevision(expected: string, current: string | undefined): void {
  if (expected !== (current ?? ABSENT_REVISION)) {
    throw new RevisionError(412, "O registro mudou. Recarregue e revise antes de tentar novamente.");
  }
}

export function withRevision(response: Response, revision: string | undefined): Response {
  response.headers.set("ETag", revisionEtag(revision));
  return response;
}
