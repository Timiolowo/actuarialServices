import React, { useEffect, useMemo, useState } from 'react';
import { readOperationHistory } from '../utils/operationHistory';
import type { OperationHistoryEntry, OperationWorkflow } from '../utils/operationHistory';

interface HistoryProps {
  portfolioId: string;
}

type HistoryFilter = 'all' | OperationWorkflow;

const workflowLabels: Record<OperationWorkflow, string> = {
  combine: 'Combine Sheet',
  'data-processing': 'Data Processing'
};

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  if (seconds < 1) return '<1s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export const History: React.FC<HistoryProps> = ({ portfolioId }) => {
  const [entries, setEntries] = useState<OperationHistoryEntry[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');

  useEffect(() => {
    const refreshHistory = () => {
      setEntries(readOperationHistory().filter(entry => entry.portfolioId === portfolioId));
    };
    refreshHistory();
    window.addEventListener('actuarial-history-updated', refreshHistory);
    window.addEventListener('storage', refreshHistory);
    return () => {
      window.removeEventListener('actuarial-history-updated', refreshHistory);
      window.removeEventListener('storage', refreshHistory);
    };
  }, [portfolioId]);

  const filteredEntries = useMemo(
    () => filter === 'all' ? entries : entries.filter(entry => entry.workflow === filter),
    [entries, filter]
  );

  const counts = {
    all: entries.length,
    combine: entries.filter(entry => entry.workflow === 'combine').length,
    'data-processing': entries.filter(entry => entry.workflow === 'data-processing').length
  };

  return (
    <div className="container history-page">
      <div className="history-intro">
        <p>Completed and failed processing runs for this portfolio are stored in this browser.</p>
      </div>

      <div className="history-filters" role="tablist" aria-label="History workflow filter">
        {([
          ['all', 'All activity'],
          ['combine', 'Combine Sheet'],
          ['data-processing', 'Data Processing']
        ] as const).map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? 'active' : ''}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}<span>{counts[value]}</span>
          </button>
        ))}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="history-empty glass-panel">
          <div className="history-empty-icon" aria-hidden="true">↺</div>
          <h2>No {filter === 'all' ? '' : workflowLabels[filter]} history yet</h2>
          <p>Runs will appear here after you start Combine Sheet or Data Processing.</p>
        </div>
      ) : (
        <div className="history-list">
          {filteredEntries.map(entry => (
            <article className="history-entry glass-panel" key={entry.id}>
              <div className="history-entry-main">
                <div className={`history-workflow-icon ${entry.workflow}`} aria-hidden="true">
                  {entry.workflow === 'combine' ? 'C' : 'D'}
                </div>
                <div>
                  <div className="history-entry-heading">
                    <h2>{workflowLabels[entry.workflow]}</h2>
                    <span className={`history-status ${entry.status}`}>{entry.status}</span>
                  </div>
                  <p>{entry.message}</p>
                  <time dateTime={entry.createdAt}>{formatHistoryDate(entry.createdAt)}</time>
                </div>
              </div>

              <dl className="history-entry-metrics">
                <div><dt>Files</dt><dd>{entry.fileCount}</dd></div>
                <div><dt>Duration</dt><dd>{formatDuration(entry.durationSeconds)}</dd></div>
                <div><dt>Workbooks read</dt><dd>{entry.summary?.processedFileCount ?? '—'}</dd></div>
                <div><dt>Sheets populated</dt><dd>{entry.summary ? `${entry.summary.populatedSheetCount}/${entry.summary.sheetCount}` : '—'}</dd></div>
                <div><dt>Rows generated</dt><dd>{entry.summary?.totalRows.toLocaleString() ?? '—'}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
