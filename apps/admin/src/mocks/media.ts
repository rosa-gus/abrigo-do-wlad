const MOCK_MEDIA_ORIGIN = "https://mock-media.invalid";
const objectUrls = new Map<string, string>();

export function createMockMediaUrl(file: File): string {
  const url = `${MOCK_MEDIA_ORIGIN}/${crypto.randomUUID()}`;
  objectUrls.set(url, URL.createObjectURL(file));
  return url;
}

export function resolveMockMediaUrl(url: string): string {
  return objectUrls.get(url) ?? url;
}

export function deleteMockMediaUrl(url: string): void {
  const objectUrl = objectUrls.get(url);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrls.delete(url);
}

export function resetMockMedia(): void {
  for (const url of objectUrls.keys()) deleteMockMediaUrl(url);
}
