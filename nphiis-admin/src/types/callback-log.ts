export interface CallbackLog {
  id: string;
  createdAt: string;
  route: string;
  resourceType: string;
  resourceId: string | null;
  httpStatus: number;
  outcome: 'success' | 'error' | 'skipped';
  errorMessage: string | null;
  detail: Record<string, unknown> | null;
  durationMs: number | null;
}

export interface CallbackLogsApiResponse {
  logs: CallbackLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  status: 'success' | 'error';
  error?: string;
}
