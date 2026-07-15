import type { ProcessingSummary } from './processor';

export type OperationWorkflow = 'combine' | 'data-processing';
export type OperationStatus = 'completed' | 'failed';

export interface OperationHistoryEntry {
  id: string;
  portfolioId: string;
  portfolioTitle: string;
  workflow: OperationWorkflow;
  status: OperationStatus;
  createdAt: string;
  durationSeconds: number;
  fileCount: number;
  message: string;
  summary: Pick<ProcessingSummary, 'processedFileCount' | 'populatedSheetCount' | 'sheetCount' | 'totalRows'> | null;
}

const HISTORY_STORAGE_KEY = 'actuarial-operation-history-v1';
const MAX_HISTORY_ENTRIES = 100;

export function readOperationHistory(): OperationHistoryEntry[] {
  try {
    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as OperationHistoryEntry[] : [];
  } catch {
    return [];
  }
}

export function addOperationHistory(entry: OperationHistoryEntry) {
  try {
    const nextEntries = [entry, ...readOperationHistory()].slice(0, MAX_HISTORY_ENTRIES);
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextEntries));
    window.dispatchEvent(new CustomEvent('actuarial-history-updated'));
  } catch {
    // History must never interrupt workbook processing.
  }
}
