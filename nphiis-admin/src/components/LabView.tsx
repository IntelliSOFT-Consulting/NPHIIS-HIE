'use client';

import { useState } from 'react';
import CsvUploadPanel from './lab/CsvUploadPanel';
import SingleResultForm from './lab/SingleResultForm';

type LabTab = 'single' | 'bulk';

export default function LabView() {
  const [tab, setTab] = useState<LabTab>('single');

  return (
    <div className="space-y-4">
      <div className="border-b border-nphi-100/60">
        <nav className="-mb-px flex space-x-6">
          <TabButton active={tab === 'single'} onClick={() => setTab('single')}>
            Single Result
          </TabButton>
          <TabButton active={tab === 'bulk'} onClick={() => setTab('bulk')}>
            Bulk Upload (CSV)
          </TabButton>
        </nav>
      </div>

      {tab === 'single' ? <SingleResultForm /> : <CsvUploadPanel />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
        active
          ? 'border-nphi-600 text-nphi-700'
          : 'border-transparent text-gray-500 hover:text-nphi-700 hover:border-nphi-300'
      }`}
    >
      {children}
    </button>
  );
}
