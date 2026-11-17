export class ApplicationError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApplicationError";
    this.status = status;
  }
}
export function documentId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new ApplicationError(400, "Invalid document ID.");
  return value;
}
export function selectFields(
  data: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(data, field))
      .map((field) => [field, data[field]]),
  );
}
