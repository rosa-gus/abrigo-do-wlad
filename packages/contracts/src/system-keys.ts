export interface SystemKeyMetadata {
  id: string;
  version: string;
  createdAt: string;
  author: string | null;
  counter: number;
  active: boolean;
}

export interface RotatedSystemKey {
  id: string;
  version: string;
}

export type SystemKey = SystemKeyMetadata;
