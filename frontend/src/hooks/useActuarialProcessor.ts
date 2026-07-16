import { useEffect, useState } from 'react';
import type { ProcessingSummary } from '../utils/processor';
import { addOperationHistory } from '../utils/operationHistory';
import type { OperationWorkflow } from '../utils/operationHistory';
import type { ParsedModelInput, ReserveSplitData, UploadMatch } from '../components/DataProcessing/types';

interface LocalProgressMessage {
  type: 'progress';
  status: string;
  progressPercent: number;
  log?: string;
  logType?: 'info' | 'success' | 'error';
}

interface LocalCompleteMessage {
  type: 'complete';
  zipBlob: Blob;
  summary: ProcessingSummary;
}

interface LocalErrorMessage {
  type: 'error';
  message: string;
}

type LocalWorkerMessage = LocalProgressMessage | LocalCompleteMessage | LocalErrorMessage;

function processCombineLocally(
  files: { file: File; fieldName: 'lobFiles' | 'reinsuranceFiles' }[],
  separateRi: boolean,
  portfolioId: string,
  onProgress: (message: LocalProgressMessage) => void
) {
  return new Promise<{ zipBlob: Blob; summary: ProcessingSummary }>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/combine.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<LocalWorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress(message);
        return;
      }
      worker.terminate();
      if (message.type === 'complete') {
        resolve({ zipBlob: message.zipBlob, summary: message.summary });
      } else {
        reject(new Error(message.message));
      }
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'The local workbook processor stopped unexpectedly.'));
    };

    worker.postMessage({ type: 'start', files, separateRi, portfolioId });
  });
}

function processTransferLocally(
  files: { file: File; fieldName: 'lobFiles' | 'reinsuranceFiles' }[],
  modelInput: ParsedModelInput,
  reserveData: ReserveSplitData,
  grossMatches: UploadMatch[],
  riMatches: UploadMatch[],
  onProgress: (message: LocalProgressMessage) => void
) {
  return new Promise<{ zipBlob: Blob; summary: ProcessingSummary }>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/transfer.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<LocalWorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress(message);
        return;
      }
      worker.terminate();
      if (message.type === 'complete') {
        resolve({ zipBlob: message.zipBlob, summary: message.summary });
      } else {
        reject(new Error(message.message));
      }
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'The local data processor stopped unexpectedly.'));
    };

    worker.postMessage({ type: 'start', files, modelInput, reserveData, grossMatches, riMatches });
  });
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
    modelInput?: ParsedModelInput | null,
    reserveData?: ReserveSplitData | null,
    grossMatches?: UploadMatch[],
    riMatches?: UploadMatch[],
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
    const processingFiles = [
      ...activeLobFiles.map(file => ({ file, fieldName: 'lobFiles' as const })),
      ...activeRiFiles.map(file => ({ file, fieldName: 'reinsuranceFiles' as const }))
    ];

    const completeProcessing = (zipBlob: Blob, summary: ProcessingSummary | null) => {
      if (zipBlob.size === 0) throw new Error('Processing produced an empty ZIP file.');
      const url = URL.createObjectURL(zipBlob);
      setDownloadUrl(url);
      setProcessedData(summary);
      setProgressPercent(100);
      const completionLabel = workflow === 'combine' ? 'Consolidation' : 'Data transfer';
      setCurrentStatus(`${completionLabel} completed successfully.`);
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
    };

    try {
      addLog(`Preparing ${allFiles.length} workbook(s) for ${portfolioTitle}.`);

      if (workflow === 'combine') {
        const totalSize = processingFiles.reduce((total, item) => total + item.file.size, 0);
        setProgressPercent(3);
        setCurrentStatus('Preparing local workbook processing...');
        addLog(`Processing ${formatFileSize(totalSize)} locally. Workbooks will not be uploaded.`, 'success');
        const result = await processCombineLocally(processingFiles, separateRi, portfolioId, message => {
          setCurrentStatus(message.status);
          setProgressPercent(message.progressPercent);
          if (message.log) addLog(message.log, message.logType || 'info');
        });
        completeProcessing(result.zipBlob, result.summary);
        return;
      }

      if (!modelInput || !reserveData || !Array.isArray(grossMatches) || !Array.isArray(riMatches)) {
        throw new Error('Validated model input, reserve data, and workbook matches are required for data transfer.');
      }

      const totalSize = processingFiles.reduce((total, item) => total + item.file.size, 0);
      setProgressPercent(3);
      setCurrentStatus('Preparing local data transfer...');
      addLog(`Processing ${formatFileSize(totalSize)} locally. Workbooks will not be uploaded.`, 'success');
      const result = await processTransferLocally(
        processingFiles,
        modelInput,
        reserveData,
        grossMatches,
        riMatches,
        message => {
          setCurrentStatus(message.status);
          setProgressPercent(message.progressPercent);
          if (message.log) addLog(message.log, message.logType || 'info');
        }
      );
      completeProcessing(result.zipBlob, result.summary);
    } catch (error) {
      const message = error instanceof Error
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
