import { ABSENT_REVISION, RevisionError } from "../application/revision";
export { ABSENT_REVISION, RevisionError, assertRevision } from "../application/revision";

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

export function withRevision(response: Response, revision: string | undefined): Response {
  response.headers.set("ETag", revisionEtag(revision));
  return response;
}
