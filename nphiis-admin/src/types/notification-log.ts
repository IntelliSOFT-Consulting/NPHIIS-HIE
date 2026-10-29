export type NotificationLogStatus = 'PENDING' | 'SENT' | 'FAILED';
export type NotificationLogType = 'AFP_FOLLOW_UP' | 'CASE_SUBMISSION';

export interface NotificationLog {
  id: string;
  practitionerId: string;
  encounterId: string;
  type: NotificationLogType;
  investigationDate: string | null;
  dueDate: string;
  title: string;
  body: string;
  status: NotificationLogStatus;
  failureReason: string | null;
  caseSubmissionEmailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationLogsApiResponse {
  notifications: NotificationLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  status: 'success' | 'error';
  error?: string;
}

export interface EpidRetryResult {
  encounterId: string;
  ok: boolean;
  error?: string;
}

export interface EpidRetryBatchResponse {
  results: EpidRetryResult[];
  orderedEncounterIds?: string[];
}

export interface MissingEpidEncounter {
  encounterId: string;
  patientId: string;
  createdAt: string | null;
  conditionCode: string | null;
  conditionLabel: string | null;
  patientName?: string | null;
}

export interface MissingEpidEncountersResponse {
  encounters: MissingEpidEncounter[];
  nextCursor: string | null;
  hasMore: boolean;
  status: 'success' | 'error';
  error?: string;
}
