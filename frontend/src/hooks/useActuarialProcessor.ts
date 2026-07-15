import { useEffect, useState } from 'react';
import type { ProcessingSummary } from '../utils/processor';
import { addOperationHistory } from '../utils/operationHistory';
import type { OperationWorkflow } from '../utils/operationHistory';
import { authFetch } from '../lib/authFetch';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const healthEndpoint = `${apiBaseUrl}/api/health`;

function backendUnavailableMessage() {
  if (import.meta.env.PROD && !apiBaseUrl) {
    return 'Processing service is not configured for this deployment. Set VITE_API_BASE_URL and redeploy the frontend.';
  }
  if (import.meta.env.PROD) {
    return 'The deployed processing service could not be reached. Confirm the backend is running and allows this site in APP_ORIGINS.';
  }
  return 'Processing backend is unavailable. Start the backend server on port 3001 and try again.';
}

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
  if (response.status === 413) {
    return 'A workbook is too large to upload. Each workbook must be 50 MB or smaller.';
  }
  if (response.status === 502 || response.status === 503) {
    return backendUnavailableMessage();
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => ({}));
    if (typeof body.error === 'string') return body.error;
  }
  return `Processing server returned status ${response.status}.`;
}

async function assertProcessingBackendAvailable() {
  if (import.meta.env.PROD && !apiBaseUrl) {
    throw new Error(backendUnavailableMessage());
  }

  try {
    const response = await fetch(healthEndpoint, { method: 'GET' });
    if (!response.ok) {
      throw new Error(backendUnavailableMessage());
    }
  } catch {
    throw new Error(backendUnavailableMessage());
  }
}

async function createProcessingUpload(body: Record<string, unknown>) {
  const response = await authFetch('/api/process/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<{ uploadId: string }>;
}

async function uploadProcessingFile(uploadId: string, file: File, fieldName: 'lobFiles' | 'reinsuranceFiles') {
  const formData = new FormData();
  formData.append(fieldName, file);
  const response = await authFetch(`/api/process/uploads/${uploadId}/files`, {
    method: 'POST',
    body: formData
  });
  if (!response.ok) throw new Error(await responseError(response));
}

async function startProcessingJob(uploadId: string) {
  const response = await authFetch(`/api/process/uploads/${uploadId}/start`, { method: 'POST' });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<{ jobId: string }>;
}

async function cancelProcessingUpload(uploadId: string) {
  await authFetch(`/api/process/uploads/${uploadId}`, { method: 'DELETE' });
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
    let stagedUploadId: string | null = null;

    try {
      setCurrentStatus('Uploading and consolidating workbooks...');
      addLog(`Preparing ${allFiles.length} workbook(s) for ${portfolioTitle}.`);
      addLog('Checking processing backend availability...');

      await assertProcessingBackendAvailable();

      setProgressPercent(8);
      setCurrentStatus('Preparing secure workbook upload...');
      const { uploadId } = await createProcessingUpload({
        expectedFileCount: allFiles.length,
        portfolioId,
        portfolioTitle,
        separateRi,
        modelInput,
        reserveData,
        grossMatches,
        riMatches
      });
      stagedUploadId = uploadId;

      const uploadFiles = [
        ...activeLobFiles.map(file => ({ file, fieldName: 'lobFiles' as const })),
        ...activeRiFiles.map(file => ({ file, fieldName: 'reinsuranceFiles' as const }))
      ];
      const totalUploadSize = uploadFiles.reduce((total, item) => total + item.file.size, 0);
      addLog(`Uploading ${uploadFiles.length} workbook(s) individually (${formatFileSize(totalUploadSize)} total).`);

      for (const [fileIndex, item] of uploadFiles.entries()) {
        const fileNumber = fileIndex + 1;
        setCurrentStatus(`Uploading workbook ${fileNumber}/${uploadFiles.length}: ${item.file.name}`);
        await uploadProcessingFile(uploadId, item.file, item.fieldName);
        setProgressPercent(8 + Math.round((fileNumber / uploadFiles.length) * 17));
        addLog(`Uploaded ${fileNumber}/${uploadFiles.length}: ${item.file.name} (${formatFileSize(item.file.size)}).`);
      }

      setCurrentStatus('Starting backend processing...');
      const { jobId } = await startProcessingJob(uploadId);
      stagedUploadId = null;
      addLog(`Backend job created: ${jobId.slice(0, 8)}...`);

      let status: ProcessingJobStatus | null = null;
      let processedLogIds = new Set<string>();

      while (true) {
        status = await fetchProcessingStatus(jobId);
        setCurrentStatus(status.currentStatus);
        setProgressPercent(25 + Math.round(status.progressPercent * 0.7));
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
      if (stagedUploadId) {
        await cancelProcessingUpload(stagedUploadId).catch(() => undefined);
      }
      const message = error instanceof TypeError
        ? backendUnavailableMessage()
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
