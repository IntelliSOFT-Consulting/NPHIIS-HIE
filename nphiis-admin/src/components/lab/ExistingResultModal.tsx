'use client';

import { AlertTriangle, XClose } from '@untitled-ui/icons-react';

interface ExistingResultModalProps {
  /** Human label of the form being recorded, e.g. "Measles - Lab Information". */
  formTitle: string;
  /** How many results the case already has on file. */
  count: number;
  /** ISO timestamp of the most recent existing result, if known. */
  latest?: string;
  /** Optional EPID / patient label shown for context. */
  subject?: string;
  onProceed: () => void;
  onCancel: () => void;
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Advisory warning shown when a lab result is about to be recorded for a case
 * that already has one for the same form. The user can proceed anyway.
 */
export default function ExistingResultModal({
  formTitle,
  count,
  latest,
  subject,
  onProceed,
  onCancel,
}: ExistingResultModalProps) {
  const when = formatDate(latest);
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full mx-auto">
        <div className="bg-amber-500 rounded-t-lg px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-white bg-opacity-20 rounded-full p-2">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Result already on file
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors"
            aria-label="Close"
          >
            <XClose className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            This case already has{' '}
            <strong>
              {count} {formTitle} result{count === 1 ? '' : 's'}
            </strong>{' '}
            recorded{when ? ` (most recent ${when})` : ''}
            {subject ? (
              <>
                {' '}for <span className="font-mono">{subject}</span>
              </>
            ) : null}
            . Recording another will add a separate result rather than replace
            the existing one.
          </p>

          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onProceed}
              className="inline-flex items-center px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors"
            >
              Record anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
