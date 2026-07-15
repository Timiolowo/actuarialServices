import { useEffect, useState } from 'react';
import type { ProcessingSummary } from '../utils/processor';
import { addOperationHistory } from '../utils/operationHistory';
import type { OperationWorkflow } from '../utils/operationHistory';
import { authFetch } from '../lib/authFetch';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const healthEndpoint = `${apiBaseUrl}/api/health`;

interface ProcessingLogEntry {
  id: string;
  type: 'info' | 'success' | 'error';
  message: string;
  timestamp: string;
}

interface ProcessingJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  currentStatus: string;
  progressPercent: number;
  processedFileCount: number;
  uploadedFileCount: number;
  logs: ProcessingLogEntry[];
  summary: ProcessingSummary | null;
  error: string | null;
}

function decodeSummary(encodedSummary: string | null): ProcessingSummary | null {
  if (!encodedSummary) return null;

  try {
    const base64 = encodedSummary.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as ProcessingSummary;
  } catch {
    return null;
  }
}

async function responseError(response: Response): Promise<string> {
  if (response.status === 502 || response.status === 503) {
    return 'Processing backend is unavailable. Start the backend server on port 3001 and try again.';
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => ({}));
    if (typeof body.error === 'string') return body.error;
  }
  return `Processing server returned status ${response.status}.`;
}

async function assertProcessingBackendAvailable() {
  try {
    const response = await fetch(healthEndpoint, { method: 'GET' });
    if (!response.ok) {
      throw new Error('Processing backend is unavailable. Start the backend server on port 3001 and try again.');
    }
  } catch {
    throw new Error('Processing backend is unavailable. Start the backend server on port 3001 and try again.');
  }
}

async function createProcessingJob(formData: FormData) {
  const response = await authFetch('/api/process', { method: 'POST', body: formData });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<{ jobId: string }>;
}

async function fetchProcessingStatus(jobId: string) {
  const response = await authFetch(`/api/process/${jobId}/status`, { method: 'GET' });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<ProcessingJobStatus>;
}

async function delay(ms: number) {
  await new Promise(resolve => window.setTimeout(resolve, ms));
}

export function useActuarialProcessor() {
  const [step, setStep] = useState<1 | 2>(1);
  const [processingDuration, setProcessingDuration] = useState(0);
  const [lobFiles, setLobFiles] = useState<File[]>([]);
  const [reinsuranceFiles, setReinsuranceFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('Ready to process files.');
  const [logs, setLogs] = useState<{ text: string; type: 'info' | 'success' | 'error' }[]>([]);
  const [processedData, setProcessedData] = useState<ProcessingSummary | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(previous => [...previous, { text: `[${time}] ${message}`, type }]);
  };

  const handleClear = () => {
    setLobFiles([]);
    setReinsuranceFiles([]);
    setLogs([]);
    setProcessedData(null);
    setDownloadUrl(null);
    setProgressPercent(0);
    setProcessingDuration(0);
    setStep(1);
    setCurrentStatus('Selections cleared. Ready to process files.');
  };

  const handleProcessFiles = async (
    portfolioTitle: string,
    portfolioId: string,
    customLobFiles?: File[],
    customRiFiles?: File[],
    separateRi: boolean = false,
    modelInput?: any,
    reserveData?: any,
    grossMatches?: any,
    riMatches?: any,
    workflow: OperationWorkflow = 'combine'
  ) => {
    const activeLobFiles = customLobFiles || lobFiles;
    const activeRiFiles = customRiFiles || reinsuranceFiles;
    const allFiles = [...activeLobFiles, ...activeRiFiles];
    if (allFiles.length === 0) return;

    setStep(2);
    setIsProcessing(true);
    setProcessedData(null);
    setDownloadUrl(null);
    setProgressPercent(10);
    setLogs([]);
    setProcessingDuration(0);

    const startTime = Date.now();
    const timer = window.setInterval(() => {
      setProcessingDuration((Date.now() - startTime) / 1000);
    }, 100);

    try {
      setCurrentStatus('Uploading and consolidating workbooks...');
      addLog(`Preparing ${allFiles.length} workbook(s) for ${portfolioTitle}.`);
      addLog('Checking processing backend availability...');

      await assertProcessingBackendAvailable();

      const formData = new FormData();
      formData.append('portfolioId', portfolioId);
      formData.append('portfolioTitle', portfolioTitle);
      formData.append('separateRi', separateRi ? 'true' : 'false');
      
      if (modelInput) formData.append('modelInput', JSON.stringify(modelInput));
      if (reserveData) formData.append('reserveData', JSON.stringify(reserveData));
      if (grossMatches) formData.append('grossMatches', JSON.stringify(grossMatches));
      if (riMatches) formData.append('riMatches', JSON.stringify(riMatches));
      
      activeLobFiles.forEach(file => formData.append('lobFiles', file));
      activeRiFiles.forEach(file => formData.append('reinsuranceFiles', file));

      setProgressPercent(8);
      setCurrentStatus('Submitting processing job...');
      const { jobId } = await createProcessingJob(formData);
      addLog(`Backend job created: ${jobId.slice(0, 8)}...`);

      let status: ProcessingJobStatus | null = null;
      let processedLogIds = new Set<string>();

      while (true) {
        status = await fetchProcessingStatus(jobId);
        setCurrentStatus(status.currentStatus);
        setProgressPercent(status.progressPercent);
        if (status.summary) setProcessedData(status.summary);

        for (const log of status.logs) {
          if (processedLogIds.has(log.id)) continue;
          processedLogIds.add(log.id);
          addLog(log.message, log.type);
        }

        if (status.status === 'completed') break;
        if (status.status === 'failed') {
          throw new Error(status.error || 'Backend processing failed.');
        }

        await delay(1000);
      }

      setCurrentStatus('Downloading completed ZIP package...');
      setProgressPercent(96);
      const response = await authFetch(`/api/process/${jobId}/download`, { method: 'GET' });
      if (!response.ok) throw new Error(await responseError(response));

      const zipBlob = await response.blob();
      if (zipBlob.size === 0) throw new Error('The processing server returned an empty ZIP file.');

      const summary = status?.summary || decodeSummary(response.headers.get('X-Processing-Summary'));
      const url = URL.createObjectURL(zipBlob);
      setDownloadUrl(url);
      setProcessedData(summary);

      setProgressPercent(100);
      setCurrentStatus('Consolidation completed successfully.');
      addLog('━━━━━━━━━━━━ ✓ PROCESS COMPLETED SUCCESSFULLY ━━━━━━━━━━━━', 'success');
      addOperationHistory({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        portfolioId,
        portfolioTitle,
        workflow,
        status: 'completed',
        createdAt: new Date().toISOString(),
        durationSeconds: (Date.now() - startTime) / 1000,
        fileCount: allFiles.length,
        message: 'Processing completed successfully.',
        summary: summary ? {
          processedFileCount: summary.processedFileCount,
          populatedSheetCount: summary.populatedSheetCount,
          sheetCount: summary.sheetCount,
          totalRows: summary.totalRows
        } : null
      });
    } catch (error) {
      const message = error instanceof TypeError
        ? 'Processing backend is unavailable. Start the backend server on port 3001 and try again.'
        : error instanceof Error
          ? error.message
          : 'Unknown processing error';
      console.error(error);
      setProgressPercent(0);
      setCurrentStatus(`Unable to consolidate files: ${message}`);
      addLog(`Failed: ${message}`, 'error');
      addOperationHistory({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        portfolioId,
        portfolioTitle,
        workflow,
        status: 'failed',
        createdAt: new Date().toISOString(),
        durationSeconds: (Date.now() - startTime) / 1000,
        fileCount: allFiles.length,
        message,
        summary: null
      });
    } finally {
      window.clearInterval(timer);
      setProcessingDuration((Date.now() - startTime) / 1000);
      setIsProcessing(false);
    }
  };

  return {
    step,
    setStep,
    processingDuration,
    lobFiles,
    setLobFiles,
    reinsuranceFiles,
    setReinsuranceFiles,
    isProcessing,
    progressPercent,
    currentStatus,
    logs,
    processedData,
    downloadUrl,
    handleClear,
    handleProcessFiles
  };
}
