import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useActuarialProcessor } from '../../hooks/useActuarialProcessor';
import type {
  DataProcessingProps,
  OpeningStrategy,
  ParsedModelInput,
  ReserveSplitData,
  UploadMatch,
  UploadSection
} from './types';
import {
  STEPS,
  SUPPORTED_UPLOAD_PATTERN,
  folderInputProps,
  MONO_STYLE,
  RESERVE_LOB_SHEETS
} from './types';
import {
  buildUploadMatches,
  buildVerificationRows,
  derivePeriodLabel,
  formatNumber,
  generateCsvTemplate,
  monthLabel,
  parseCsvVerification,
  parseModelInput,
  parseReserveSplit
} from './parsers';

function getDefaultValuationDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type ValidationToast = {
  type: 'error' | 'warning' | 'success';
  title: string;
  message: string;
};

export const DataProcessing: React.FC<DataProcessingProps> = ({ portfolioId: _portfolioId }) => {
  const [currentStep, setCurrentStep] = useState(1);

  const PORTFOLIO_TITLES: Record<string, string> = {
    'group-life': 'Group Life',
    'individual-life': 'Individual Life',
    'health': 'Health Care',
    'pc': 'Property & Casualty'
  };
  const portfolioTitle = PORTFOLIO_TITLES[_portfolioId] || _portfolioId;

  const {
    processingDuration,
    isProcessing,
    progressPercent,
    currentStatus,
    logs,
    processedData,
    downloadUrl,
    handleProcessFiles
  } = useActuarialProcessor();

  const logContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const [valuationDate, setValuationDate] = useState<string | null>(getDefaultValuationDate());
  const [openingStrategy, setOpeningStrategy] = useState<OpeningStrategy>('maintain');
  const [workbookFile, setWorkbookFile] = useState<File | null>(null);
  const [modelInput, setModelInput] = useState<ParsedModelInput | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  
  const [reserveData, setReserveData] = useState<ReserveSplitData | null>(null);
  const [reserveParseError, setReserveParseError] = useState<string | null>(null);
  const [toast, setToast] = useState<ValidationToast | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const lastProcessingErrorRef = useRef<string | null>(null);

  const [grossUploadFiles, setGrossUploadFiles] = useState<File[]>([]);
  const [riUploadFiles, setRiUploadFiles] = useState<File[]>([]);
  const [grossMatches, setGrossMatches] = useState<UploadMatch[]>([]);
  const [riMatches, setRiMatches] = useState<UploadMatch[]>([]);
  const [grossUploadError, setGrossUploadError] = useState<string | null>(null);
  const [riUploadError, setRiUploadError] = useState<string | null>(null);

  const [verificationData, setVerificationData] = useState<Map<string, Map<string, number>> | null>(null);
  const [verificationFile, setVerificationFile] = useState<File | null>(null);

  const [expandedLobs, setExpandedLobs] = useState<Set<string>>(new Set());
  const toggleLob = useCallback((lob: string) => {
    setExpandedLobs(prev => {
      const next = new Set(prev);
      if (next.has(lob)) next.delete(lob);
      else next.add(lob);
      return next;
    });
  }, []);

  const grossFileInputRef = useRef<HTMLInputElement>(null);
  const grossFolderInputRef = useRef<HTMLInputElement>(null);
  const riFileInputRef = useRef<HTMLInputElement>(null);
  const riFolderInputRef = useRef<HTMLInputElement>(null);

  const periodLabel = valuationDate ? derivePeriodLabel(valuationDate) : null;

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((nextToast: ValidationToast) => {
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    setToast(nextToast);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, nextToast.type === 'error' ? 9000 : 6000);
  }, []);

  useEffect(() => () => {
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
  }, []);

  useEffect(() => {
    const latestError = [...logs].reverse().find(log => log.type === 'error')?.text;
    if (!latestError || latestError === lastProcessingErrorRef.current) return;
    lastProcessingErrorRef.current = latestError;
    showToast({
      type: 'error',
      title: 'Processing failed',
      message: latestError.replace(/^\[[^\]]+\]\s*/, '')
    });
  }, [logs, showToast]);

  const canProceedStep1 =
    modelInput !== null && 
    reserveData !== null && 
    valuationDate !== null && 
    reserveData.missingSheets.length === 0 &&
    reserveData.errors.length === 0 &&
    reserveData.gross.every(lob => lob.dateMatches) &&
    reserveData.ri.every(lob => lob.dateMatches);
    
  const allUploadMatches = [...grossMatches, ...riMatches];
  const unmatchedUploadMatches = allUploadMatches.filter(match => match.section === 'Unmatched');
  const canProceedStep2 = allUploadMatches.length > 0 && allUploadMatches.every(match => match.section !== 'Unmatched');

  const grossMatchedCount = grossMatches.filter(m => m.section !== 'Unmatched').length;
  const riMatchedCount = riMatches.filter(m => m.section !== 'Unmatched').length;

  const verificationRows = useMemo(
    () => buildVerificationRows(reserveData, verificationData),
    [reserveData, verificationData]
  );

  const verificationPassCount = verificationRows.filter(r => r.matches === true).length;
  const verificationFailCount = verificationRows.filter(r => r.matches === false).length;

  const handleReset = useCallback(() => {
    setCurrentStep(1);
    setValuationDate(getDefaultValuationDate());
    setOpeningStrategy('maintain');
    setWorkbookFile(null);
    setModelInput(null);
    setParseError(null);
    setReserveData(null);
    setReserveParseError(null);
    setGrossUploadFiles([]);
    setRiUploadFiles([]);
    setGrossMatches([]);
    setRiMatches([]);
    setGrossUploadError(null);
    setRiUploadError(null);
    setVerificationData(null);
    setVerificationFile(null);
    lastProcessingErrorRef.current = null;
    dismissToast();
  }, [dismissToast]);

  const traverseFileTree = useCallback((item: FileSystemEntry, acc: File[]): Promise<void> => {
    return new Promise(resolve => {
      if (item.isFile) {
        (item as FileSystemFileEntry).file(f => { acc.push(f); resolve(); }, () => resolve());
      } else if (item.isDirectory) {
        const reader = (item as FileSystemDirectoryEntry).createReader();
        const readEntries = () => {
          reader.readEntries(async entries => {
            if (entries.length > 0) {
              await Promise.all(entries.map(e => traverseFileTree(e, acc)));
              readEntries();
            } else {
              resolve();
            }
          }, () => resolve());
        };
        readEntries();
      } else {
        resolve();
      }
    });
  }, []);

  const handleFileDrop = useCallback(
    async (event: React.DragEvent, handler: (files: File[]) => void) => {
      event.preventDefault();
      const items = event.dataTransfer.items;
      const acc: File[] = [];
      if (items) {
        const promises: Promise<void>[] = [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind !== 'file') continue;
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) promises.push(traverseFileTree(entry, acc));
        }
        await Promise.all(promises);
      }
      if (acc.length === 0) acc.push(...Array.from(event.dataTransfer.files));
      handler(acc);
    },
    [traverseFileTree]
  );

  const handleWorkbookUpload = useCallback(async (files: FileList | null, valuationDateOverride?: string) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const selectedValuationDate = valuationDateOverride || valuationDate;

    if (!/\.(xlsx|xls|xlsb|xlsm)$/i.test(file.name)) {
      const message = `"${file.name}" is not a supported Reserve Split Template. Use XLS, XLSX, XLSB, or XLSM.`;
      setParseError(message);
      showToast({ type: 'error', title: 'Unsupported template file', message });
      return;
    }

    setWorkbookFile(file);
    setParseError(null);
    setModelInput(null);
    setReserveParseError(null);
    setReserveData(null);

    if (!selectedValuationDate) {
      const message = 'Select a valuation year and month before uploading the Reserve Split Template.';
      setParseError(message);
      showToast({ type: 'error', title: 'Valuation date required', message });
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const validationMessages: string[] = [];

      const miResult = parseModelInput(workbook);
      if (!miResult) {
        const message = 'The workbook is not the expected Reserve Split Template: the "Modellinput" sheet is missing or has no readable header row.';
        setParseError(message);
        validationMessages.push(message);
      } else if (miResult.grossData.length === 0 && miResult.riData.length === 0) {
        const message = 'The "Modellinput" sheet was found, but it contains no Gross or RI data rows.';
        setParseError(message);
        validationMessages.push(message);
      } else {
        setModelInput(miResult);
      }

      const rsData = parseReserveSplit(workbook, selectedValuationDate);
      setReserveData(rsData);

      const reserveMessages: string[] = [];
      if (rsData.gross.length === 0 && rsData.ri.length === 0) {
        reserveMessages.push('No reserve data was found in the expected LOB sheets.');
      }
      if (rsData.missingSheets.length > 0) {
        reserveMessages.push(`Missing LOB sheet${rsData.missingSheets.length === 1 ? '' : 's'}: ${rsData.missingSheets.join(', ')}.`);
      }
      if (rsData.errors.length > 0) {
        reserveMessages.push(...rsData.errors);
      }

      if (reserveMessages.length > 0) {
        const inlineMessage = reserveMessages.join(' ');
        setReserveParseError(inlineMessage);
        validationMessages.push(...reserveMessages);
      }

      if (validationMessages.length > 0) {
        const shownMessages = validationMessages.slice(0, 3);
        const remainingCount = validationMessages.length - shownMessages.length;
        showToast({
          type: 'error',
          title: 'Template validation failed',
          message: `${shownMessages.join('\n')}${remainingCount > 0 ? `\nPlus ${remainingCount} more issue${remainingCount === 1 ? '' : 's'} shown below the upload.` : ''}`
        });
      } else {
        showToast({
          type: 'success',
          title: 'Template validated',
          message: `The Reserve Split Template matches ${monthLabel(selectedValuationDate)} and contains all expected LOB sheets.`
        });
      }
    } catch (error) {
      const message = `The workbook could not be read: ${error instanceof Error ? error.message : String(error)}`;
      setParseError(message);
      showToast({ type: 'error', title: 'Workbook could not be parsed', message });
    }
  }, [showToast, valuationDate]);

  const handleSectionUploads = useCallback(async (section: UploadSection, files: File[]) => {
    const sectionLabel = section === 'gross' ? 'Gross' : 'Reinsurance';
    if (!modelInput) {
      const msg = 'Upload and validate the Reserve Split Template before adding calculation-engine files.';
      if (section === 'gross') setGrossUploadError(msg);
      else setRiUploadError(msg);
      showToast({ type: 'error', title: 'Template required', message: msg });
      return;
    }

    const nextFiles = files.filter(f => SUPPORTED_UPLOAD_PATTERN.test(f.name));
    const rejectedFiles = files.filter(f => !SUPPORTED_UPLOAD_PATTERN.test(f.name));
    if (nextFiles.length === 0) {
      const rejectedNames = rejectedFiles.slice(0, 3).map(file => file.name).join(', ');
      const msg = `No supported ${sectionLabel} files were selected.${rejectedNames ? ` Unsupported: ${rejectedNames}.` : ''} Use XLS, XLSX, XLSB, or XLSM.`;
      if (section === 'gross') setGrossUploadError(msg);
      else setRiUploadError(msg);
      showToast({ type: 'error', title: `${sectionLabel} upload rejected`, message: msg });
      return;
    }

    const matches = buildUploadMatches(
      nextFiles,
      section === 'gross' ? modelInput.grossData : modelInput.riData,
      section === 'gross' ? modelInput.grossHeaders : modelInput.riHeaders,
      section === 'gross' ? 'Gross' : 'RI'
    );
    const unmatched = matches.filter(match => match.section === 'Unmatched');
    const matchError = unmatched.length > 0
      ? `${unmatched.length} ${sectionLabel} file${unmatched.length === 1 ? '' : 's'} could not be matched to Modellinput: ${unmatched.slice(0, 3).map(match => match.fileName).join(', ')}${unmatched.length > 3 ? `, plus ${unmatched.length - 3} more` : ''}. Check the LOB name in each filename.`
      : null;

    if (section === 'gross') {
      setGrossUploadFiles(nextFiles);
      setGrossMatches(matches);
      setGrossUploadError(matchError);
    } else {
      setRiUploadFiles(nextFiles);
      setRiMatches(matches);
      setRiUploadError(matchError);
    }

    if (matchError) {
      showToast({ type: 'error', title: `${sectionLabel} files did not match`, message: matchError });
    } else if (rejectedFiles.length > 0) {
      showToast({
        type: 'warning',
        title: 'Some files were ignored',
        message: `${nextFiles.length} supported file${nextFiles.length === 1 ? ' was' : 's were'} accepted. Ignored: ${rejectedFiles.slice(0, 3).map(file => file.name).join(', ')}${rejectedFiles.length > 3 ? `, plus ${rejectedFiles.length - 3} more` : ''}.`
      });
    } else {
      showToast({
        type: 'success',
        title: `${sectionLabel} files matched`,
        message: `${matches.length} file${matches.length === 1 ? ' was' : 's were'} matched successfully.`
      });
    }
  }, [modelInput, showToast]);

  const handleDownloadCsvTemplate = useCallback(() => {
    const csvContent = generateCsvTemplate(reserveData, modelInput);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `verification_template_${valuationDate || 'draft'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [reserveData, modelInput, valuationDate]);

  const handleCsvVerificationUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setVerificationFile(file);

    try {
      const text = await file.text();
      const parsedVerification = parseCsvVerification(text);
      if (parsedVerification.size === 0) {
        throw new Error('No verification rows were found. Confirm that the CSV contains a CLASS column and at least one completed data row.');
      }
      setVerificationData(parsedVerification);
      const comparisonRows = buildVerificationRows(reserveData, parsedVerification);
      const failedRows = comparisonRows.filter(row => row.matches === false);
      if (failedRows.length > 0) {
        showToast({
          type: 'warning',
          title: 'Verification differences found',
          message: `${failedRows.length} value${failedRows.length === 1 ? ' does' : 's do'} not match the extracted data. Review the highlighted rows in Data Summary.`
        });
      } else {
        showToast({
          type: 'success',
          title: 'Verification file accepted',
          message: `${comparisonRows.length} value${comparisonRows.length === 1 ? ' was' : 's were'} checked with no differences.`
        });
      }
    } catch (error) {
      setVerificationData(null);
      const message = error instanceof Error ? error.message : 'The verification CSV could not be read.';
      showToast({ type: 'error', title: 'Verification file rejected', message });
    }
  }, [reserveData, showToast]);

  const getStepState = (n: number) => n < currentStep ? 'completed' : n === currentStep ? 'active' : '';

  const handleParametersNext = () => {
    let message: string | null = null;
    if (!valuationDate) {
      message = 'Select both a valuation year and month.';
    } else if (!workbookFile) {
      message = 'Upload the Reserve Split Template before continuing.';
    } else if (parseError) {
      message = parseError;
    } else if (!modelInput) {
      message = 'The template must contain a readable "Modellinput" sheet with Gross or RI data.';
    } else if (!reserveData) {
      message = 'No reserve data could be extracted from the uploaded template.';
    } else if (reserveData.missingSheets.length > 0) {
      message = `Add the missing LOB sheet${reserveData.missingSheets.length === 1 ? '' : 's'}: ${reserveData.missingSheets.join(', ')}.`;
    } else if (reserveData.errors.length > 0) {
      message = reserveData.errors.slice(0, 2).join(' ');
    } else if (reserveParseError) {
      message = reserveParseError;
    }

    if (message || !canProceedStep1) {
      showToast({
        type: 'error',
        title: 'Parameters are not ready',
        message: message || 'Resolve the template validation errors shown above before continuing.'
      });
      return;
    }
    setCurrentStep(2);
  };

  const handleUploadsNext = () => {
    if (allUploadMatches.length === 0) {
      showToast({
        type: 'error',
        title: 'Calculation-engine files required',
        message: 'Upload at least one supported Gross or Reinsurance calculation-engine file before continuing.'
      });
      return;
    }

    const unmatched = allUploadMatches.filter(match => match.section === 'Unmatched');
    if (unmatched.length > 0) {
      showToast({
        type: 'error',
        title: 'Unmatched files must be resolved',
        message: `${unmatched.length} file${unmatched.length === 1 ? '' : 's'} did not match Modellinput: ${unmatched.slice(0, 4).map(match => match.fileName).join(', ')}${unmatched.length > 4 ? `, plus ${unmatched.length - 4} more` : ''}.`
      });
      return;
    }

    setCurrentStep(3);
  };

  const handleIgnoreUploadErrors = () => {
    if (allUploadMatches.length === 0) {
      showToast({
        type: 'error',
        title: 'No files to continue with',
        message: 'Upload at least one supported calculation-engine file before ignoring matching errors.'
      });
      return;
    }

    showToast({
      type: 'warning',
      title: 'Continuing with upload errors',
      message: `${unmatchedUploadMatches.length} unmatched file${unmatchedUploadMatches.length === 1 ? ' is' : 's are'} being carried forward. Review the warning in Data Summary before processing.`
    });
    setCurrentStep(3);
  };

  const renderErrorAlert = (message: string) => (
    <div className="validation-alert" role="alert">
      <span className="validation-alert-icon" aria-hidden="true">!</span>
      <div>
        <strong>Action required</strong>
        <p>{message}</p>
      </div>
    </div>
  );

  const renderUploadZone = (
    title: string,
    section: UploadSection,
    files: File[],
    error: string | null,
    fileRef: React.RefObject<HTMLInputElement | null>,
    folderRef: React.RefObject<HTMLInputElement | null>
  ) => (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div className="section-divider">{title}</div>
      <div
        className="upload-zone"
        onDrop={e => handleFileDrop(e, dropped => handleSectionUploads(section, dropped))}
        onDragOver={e => e.preventDefault()}
        onClick={() => folderRef.current?.click()}
        style={{ padding: files.length > 0 ? '0.75rem' : '1.5rem' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
        </svg>
        {files.length > 0 ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{files.length} file(s) selected</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Click or drop to replace</p>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Drop files or folder here</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Supports XLS, XLSX, XLSB, and XLSM</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.75rem' }}>
          <button type="button" className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', ...MONO_STYLE }} onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>Browse Files</button>
          <button type="button" className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', ...MONO_STYLE }} onClick={e => { e.stopPropagation(); folderRef.current?.click(); }}>Browse Folder</button>
        </div>
        <input type="file" ref={fileRef} accept=".xls,.xlsx,.xlsb,.xlsm" multiple style={{ display: 'none' }} onChange={e => { handleSectionUploads(section, Array.from(e.target.files || [])); e.target.value = ''; }} />
        <input type="file" ref={folderRef} accept=".xls,.xlsx,.xlsb,.xlsm" multiple style={{ display: 'none' }} {...folderInputProps} onChange={e => { handleSectionUploads(section, Array.from(e.target.files || [])); e.target.value = ''; }} />
      </div>
      {error && renderErrorAlert(error)}
    </div>
  );

  return (
    <div className="container">
      {toast && (
        <div className={`validation-toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live="assertive">
          <span className="validation-toast-icon" aria-hidden="true">
            {toast.type === 'error' ? '!' : toast.type === 'warning' ? '!' : '✓'}
          </span>
          <div className="validation-toast-content">
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button type="button" onClick={dismissToast} aria-label="Dismiss notification">×</button>
        </div>
      )}
      <div style={{ paddingTop: '1rem', marginBottom: '2rem' }}>
        <p style={{ ...MONO_STYLE, color: 'var(--text-muted)', lineHeight: '1.6' }}>
          Configure parameters, upload source data, and verify extracted numbers before processing.
        </p>
      </div>

      <div className="stepper">
        {STEPS.map((step, index) => (
          <React.Fragment key={step.number}>
            <div className={`stepper-step ${getStepState(step.number)}`}>
              <div className="stepper-number">{step.number < currentStep ? '✓' : step.number}</div>
              <span className="stepper-label">{step.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`stepper-line ${step.number < currentStep ? 'completed' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {currentStep === 1 && (
        <div className="step-panel">
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <div className="section-divider">Configuration</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '2rem', maxWidth: '100%' }}>
              <div className="form-group">
                <label className="form-label">Valuation Date</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="form-select"
                    value={valuationDate ? valuationDate.split('-')[0] : new Date().getFullYear().toString()}
                    onChange={e => {
                      const y = e.target.value;
                      const m = valuationDate ? valuationDate.split('-')[1] : '06';
                      if (y) {
                        const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
                        const snappedDate = `${y}-${m}-${lastDay.toString().padStart(2, '0')}`;
                        setValuationDate(snappedDate);
                        if (workbookFile) {
                          const fakeInput = new DataTransfer();
                          fakeInput.items.add(workbookFile);
                          void handleWorkbookUpload(fakeInput.files, snappedDate);
                        }
                      }
                    }}
                  >
                    {Array.from({ length: 9 }, (_, i) => new Date().getFullYear() - 3 + i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>

                  <select
                    className="form-select"
                    value={valuationDate ? parseInt(valuationDate.split('-')[1], 10) : ''}
                    onChange={e => {
                      const m = e.target.value;
                      const y = valuationDate ? valuationDate.split('-')[0] : new Date().getFullYear().toString();
                      if (m) {
                        const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
                        const snappedDate = `${y}-${m.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
                        setValuationDate(snappedDate);
                        if (workbookFile) {
                          const fakeInput = new DataTransfer();
                          fakeInput.items.add(workbookFile);
                          void handleWorkbookUpload(fakeInput.files, snappedDate);
                        }
                      } else {
                        setValuationDate(null);
                      }
                    }}
                  >
                    <option value="">Month</option>
                    <option value="3">March (Q1)</option>
                    <option value="6">June (HY)</option>
                    <option value="9">September (9M)</option>
                    <option value="12">December (FY)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Derived Period</label>
                <div style={{ padding: '0.6rem 0', ...MONO_STYLE, fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                  {periodLabel || '—'}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Opening Balance</label>
                <div className="toggle-group">
                  <button type="button" className={`toggle-btn ${openingStrategy === 'maintain' ? 'active' : ''}`} onClick={() => setOpeningStrategy('maintain')}>Maintain</button>
                  <button type="button" className={`toggle-btn ${openingStrategy === 'change' ? 'active' : ''}`} onClick={() => setOpeningStrategy('change')}>Change</button>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <div className="section-divider">Upload Reserve Split Template</div>
            <div
              className="upload-zone"
              onDrop={e => handleFileDrop(e, files => { const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); void handleWorkbookUpload(dt.files); })}
              onDragOver={e => e.preventDefault()}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.xlsx,.xls,.xlsb,.xlsm';
                input.style.display = 'none';
                document.body.appendChild(input);
                input.onchange = e => { void handleWorkbookUpload((e.target as HTMLInputElement).files); document.body.removeChild(input); };
                input.click();
              }}
              style={{ padding: workbookFile ? '0.75rem' : '1.5rem' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
              </svg>
              {workbookFile ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{workbookFile.name}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Click or drop to replace</p>
                </div>
              ) : (
                <p style={{ fontWeight: 500 }}>Drop your Reserve Split Template here or click to browse</p>
              )}
            </div>
            
            {parseError && renderErrorAlert(parseError)}
            {reserveParseError && renderErrorAlert(reserveParseError)}

            {modelInput && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <p style={{ color: 'var(--success)', fontSize: '0.85rem', margin: 0 }}>
                    ✓ Parsed {modelInput.grossData.length} Gross rows and {modelInput.riData.length} RI rows from Modellinput sheet.
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  {[ 
                    { title: 'Gross Model Input', headers: modelInput.grossHeaders, data: modelInput.grossData },
                    { title: 'Reinsurance Model Input', headers: modelInput.riHeaders, data: modelInput.riData }
                  ].map(({ title, headers, data }) => {
                    const lobCol = headers[0];
                    const numCols = headers.slice(1);
                    const parentGroups = ['Fire', 'GA', 'Motor'];
                    
                    const map = new Map<string, any>();
                    data.forEach(r => {
                      const lob = String(r[lobCol] || '').trim();
                      if (!lob) return;
                      map.set(lob, { ...r, _lob: lob });
                    });

                    const standaloneLobs = Array.from(map.values()).filter(r => !parentGroups.some(p => r._lob.startsWith(p + ' ')));
                    const groupedParents = parentGroups.map(p => {
                      const children = Array.from(map.values()).filter(r => r._lob.startsWith(p + ' '));
                      if (children.length === 0) return null;
                      
                      const parent: any = { _lob: p, isParent: true, children };
                      parent[lobCol] = p;
                      numCols.forEach(col => {
                        parent[col] = children.reduce((sum, child) => sum + (typeof child[col] === 'number' ? child[col] : 0), 0);
                      });
                      return parent;
                    }).filter(Boolean);

                    const allEntities = [...standaloneLobs, ...groupedParents].sort((a, b) => a._lob.localeCompare(b._lob));
                    const displayRows: any[] = [];
                    allEntities.forEach(item => {
                      displayRows.push({ ...item, isChild: false });
                      if (item.isParent && expandedLobs.has(item._lob)) {
                        item.children.forEach((child: any) => {
                          displayRows.push({ ...child, isChild: true });
                        });
                      }
                    });

                    return (
                      <div key={title}>
                        <div style={{ ...MONO_STYLE, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{title}</div>
                        <div className="table-wrapper" style={{ maxHeight: '350px' }}>
                          <table style={{ fontSize: '0.8rem', width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {headers.map(h => (
                                  <th key={h} style={{ padding: '0.5rem', textAlign: h === lobCol ? 'left' : 'right', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {displayRows.map((row, i) => (
                                <tr key={i} style={{ background: row.isParent ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                                  {headers.map((h, colIndex) => {
                                    if (colIndex === 0) {
                                      return (
                                        <td 
                                          key={h} 
                                          style={{ 
                                            padding: '0.5rem', 
                                            fontWeight: row.isParent ? 600 : 400, 
                                            paddingLeft: row.isChild ? '2rem' : '0.5rem', 
                                            cursor: row.isParent ? 'pointer' : 'default' 
                                          }} 
                                          onClick={() => row.isParent && toggleLob(row._lob)}
                                        >
                                          {row.isParent ? (expandedLobs.has(row._lob) ? '▼ ' : '▶ ') : ''}{row[h]}
                                        </td>
                                      );
                                    }
                                    const val = row[h];
                                    const display = typeof val === 'number' ? formatNumber(val) : String(val ?? '');
                                    return (
                                      <td key={h} style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                                        {display}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {reserveData && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                <p style={{ color: 'var(--success)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  ✓ Extracted data from {new Set(reserveData.gross.map(r => r.lobName)).size} LOB sheets.
                </p>
                
                {['gross', 'ri'].map((sectionType) => {
                  const sectionData = sectionType === 'gross' ? reserveData.gross : reserveData.ri;
                  if (sectionData.length === 0) return null;
                  return (
                    <div key={sectionType} style={{ marginBottom: '2rem' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>{sectionType} Extracted Data</div>
                      <div className="table-wrapper" style={{ maxHeight: '300px' }}>
                        <table style={{ fontSize: '0.8rem', width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ padding: '0.5rem', textAlign: 'left' }}>LOB</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>ATTR IBNR - PY</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>ATTR IBNR - CY</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>LARGE IBNR - PY</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>LARGE IBNR - CY</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>PY OCR</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>CY OCR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const map = new Map<string, { lob: string; attrPY: number; attrCY: number; largePY: number; largeCY: number; osPY: number; osCY: number; }>();
                              RESERVE_LOB_SHEETS.forEach(lob => map.set(lob, { lob, attrPY: 0, attrCY: 0, largePY: 0, largeCY: 0, osPY: 0, osCY: 0 }));
                              
                              sectionData.forEach(r => {
                                const item = map.get(r.lobName);
                                if (!item) return;
                                if (r.yearCategory === 'Prior Year') {
                                  item.attrPY += r.attrIBNR;
                                  item.largePY += r.largeIBNR;
                                  item.osPY += r.outstandingClaims;
                                } else {
                                  item.attrCY += r.attrIBNR;
                                  item.largeCY += r.largeIBNR;
                                  item.osCY += r.outstandingClaims;
                                }
                              });

                              const parentGroups = ['Fire', 'GA', 'Motor'];
                              const displayRows: any[] = [];
                              
                              const standaloneLobs = Array.from(map.values()).filter(r => !parentGroups.some(p => r.lob.startsWith(p + ' ')));
                              const groupedParents = parentGroups.map(p => {
                                const children = Array.from(map.values()).filter(r => r.lob.startsWith(p + ' '));
                                const parent = {
                                  lob: p,
                                  isParent: true,
                                  children,
                                  attrPY: children.reduce((a, b) => a + b.attrPY, 0),
                                  attrCY: children.reduce((a, b) => a + b.attrCY, 0),
                                  largePY: children.reduce((a, b) => a + b.largePY, 0),
                                  largeCY: children.reduce((a, b) => a + b.largeCY, 0),
                                  osPY: children.reduce((a, b) => a + b.osPY, 0),
                                  osCY: children.reduce((a, b) => a + b.osCY, 0)
                                };
                                return parent;
                              });

                              const allEntities = [...standaloneLobs, ...groupedParents].sort((a, b) => a.lob.localeCompare(b.lob));

                              allEntities.forEach(item => {
                                displayRows.push({ ...item, isChild: false });
                                if ((item as any).isParent && expandedLobs.has(item.lob)) {
                                  (item as any).children.forEach((child: any) => {
                                    displayRows.push({ ...child, isChild: true });
                                  });
                                }
                              });

                              return displayRows.map((r, i) => (
                                <tr key={r.lob + i} style={{ background: r.isParent ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                                  <td style={{ padding: '0.5rem', fontWeight: r.isParent ? 600 : 400, paddingLeft: r.isChild ? '2rem' : '0.5rem', cursor: r.isParent ? 'pointer' : 'default' }} onClick={() => r.isParent && toggleLob(r.lob)}>
                                    {r.isParent ? (expandedLobs.has(r.lob) ? '▼ ' : '▶ ') : ''}{r.lob}
                                  </td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.attrPY === 0 ? '-' : formatNumber(r.attrPY)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.attrCY === 0 ? '-' : formatNumber(r.attrCY)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.largePY === 0 ? '-' : formatNumber(r.largePY)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.largeCY === 0 ? '-' : formatNumber(r.largeCY)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.osPY === 0 ? '-' : formatNumber(r.osPY)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.osCY === 0 ? '-' : formatNumber(r.osCY)}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={handleReset}
              style={{ padding: '0.75rem 2.5rem', color: 'var(--error)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16" style={{ marginRight: '0.4rem', display: 'inline-block', verticalAlign: 'text-bottom' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Reset All
            </button>
            <button className="btn-primary" aria-disabled={!canProceedStep1} onClick={handleParametersNext} style={{ padding: '0.75rem 2.5rem' }}>
              Next →
            </button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="step-panel">
          <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Valuation:</span>
              <strong>{valuationDate ? monthLabel(valuationDate) : '—'}</strong>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Period:</span>
              <strong>{periodLabel || '—'}</strong>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Opening:</span>
              <strong style={{ textTransform: 'capitalize' }}>{openingStrategy}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {renderUploadZone('Upload Gross Calculation Engine Files', 'gross', grossUploadFiles, grossUploadError, grossFileInputRef, grossFolderInputRef)}
            {renderUploadZone('Upload RI Calculation Engine Files', 'ri', riUploadFiles, riUploadError, riFileInputRef, riFolderInputRef)}
          </div>

          {(grossMatches.length > 0 || riMatches.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {[
                { title: `Gross Match (${grossMatchedCount}/${grossMatches.length})`, matches: grossMatches },
                { title: `RI Match (${riMatchedCount}/${riMatches.length})`, matches: riMatches },
              ].map(({ title, matches }) => (
                <div key={title} className="glass-panel" style={{ padding: '1.5rem' }}>
                  <div className="section-divider">{title}</div>
                  {matches.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No files uploaded yet.</p>
                  ) : (
                    <div className="table-wrapper" style={{ maxHeight: '280px' }}>
                      <table style={{ fontSize: '0.8rem' }}>
                        <thead><tr><th style={{ padding: '0.5rem' }}>File</th><th style={{ padding: '0.5rem' }}>LOB</th><th style={{ padding: '0.5rem' }}>Status</th></tr></thead>
                        <tbody>
                          {matches.map(m => (
                            <tr key={m.id}>
                              <td style={{ padding: '0.5rem' }}>{m.fileName}</td>
                              <td style={{ padding: '0.5rem' }}>{m.lobName}</td>
                              <td style={{ padding: '0.5rem', color: m.section === 'Unmatched' ? 'var(--error)' : 'var(--success)' }}>{m.section === 'Unmatched' ? '✗' : '✓'} {m.section}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn-secondary" onClick={() => setCurrentStep(1)} style={{ padding: '0.75rem 2rem' }}>← Back</button>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {unmatchedUploadMatches.length > 0 && (
                <button className="btn-warning" onClick={handleIgnoreUploadErrors} style={{ padding: '0.75rem 1.25rem' }}>
                  Ignore errors and continue
                </button>
              )}
              <button className="btn-primary" aria-disabled={!canProceedStep2} onClick={handleUploadsNext} style={{ padding: '0.75rem 2.5rem' }}>Next →</button>
            </div>
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className="step-panel">
          {unmatchedUploadMatches.length > 0 && (
            <div className="ignored-errors-banner" role="status">
              <span aria-hidden="true">!</span>
              <div>
                <strong>Upload matching errors were ignored</strong>
                <p>{unmatchedUploadMatches.length} file{unmatchedUploadMatches.length === 1 ? ' is' : 's are'} not linked to Modellinput. Results may be incomplete until the filenames or Modellinput LOB labels are corrected.</p>
              </div>
            </div>
          )}
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <div className="section-divider">Data Verification (CSV)</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: '1.5' }}>
              Download the CSV verification template, fill in your expected numbers, then upload it back. The system will auto-compare your expected values against the extracted data.
            </p>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={handleDownloadCsvTemplate} style={{ padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download CSV Template
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.csv';
                    input.style.display = 'none';
                    document.body.appendChild(input);
                    input.onchange = e => { void handleCsvVerificationUpload((e.target as HTMLInputElement).files); document.body.removeChild(input); };
                    input.click();
                  }}
                  style={{ padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload Filled CSV
                </button>
              </div>

              {verificationFile && (
                <span style={{ ...MONO_STYLE, color: 'var(--success)' }}>
                  ✓ {verificationFile.name}
                </span>
              )}
            </div>

            {verificationData && verificationRows.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <div className="processing-summary" style={{ marginTop: 0, marginBottom: '1.25rem' }}>
                  <div><strong>{verificationPassCount}</strong><span>Matched</span></div>
                  <div><strong style={{ color: verificationFailCount > 0 ? 'var(--error)' : undefined }}>{verificationFailCount}</strong><span>Mismatched</span></div>
                  <div><strong>{verificationRows.filter(r => r.matches === null).length}</strong><span>Not verified</span></div>
                </div>

                <div className="table-wrapper" style={{ maxHeight: '400px' }}>
                  <table style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.5rem' }}>LOB</th>
                        <th style={{ padding: '0.5rem' }}>Metric</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Expected</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actual</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verificationRows.map((row, i) => (
                        <tr key={i} style={{ background: row.matches === false ? 'rgba(239, 68, 68, 0.08)' : undefined }}>
                          <td style={{ padding: '0.5rem', fontWeight: 500 }}>{row.lobName}</td>
                          <td style={{ padding: '0.5rem' }}>{row.metric}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                            {row.expected !== null ? formatNumber(row.expected) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                            {row.actual !== null ? formatNumber(row.actual) : '—'}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            {row.matches === null ? <span style={{ color: 'var(--text-muted)' }}>—</span> :
                             row.matches ? <span style={{ color: 'var(--success)' }}>✓</span> :
                             <span style={{ color: 'var(--error)', fontWeight: 600 }}>✗</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {reserveData && (
            <div className="glass-panel data-summary-card" style={{ marginBottom: '1.5rem' }}>
              <div className="data-summary-title">Gross Reserve Summary</div>
              {(() => {
                const map = new Map<string, { lob: string; attrPY: number; attrCY: number; largePY: number; largeCY: number; osPY: number; osCY: number }>();
                RESERVE_LOB_SHEETS.forEach(lob => {
                  map.set(lob, { lob, attrPY: 0, attrCY: 0, largePY: 0, largeCY: 0, osPY: 0, osCY: 0 });
                });
                reserveData.gross.forEach(row => {
                  const item = map.get(row.lobName);
                  if (!item) return;
                  if (row.yearCategory === 'Prior Year') {
                    item.attrPY += row.attrIBNR;
                    item.largePY += row.largeIBNR;
                    item.osPY += row.outstandingClaims;
                  } else {
                    item.attrCY += row.attrIBNR;
                    item.largeCY += row.largeIBNR;
                    item.osCY += row.outstandingClaims;
                  }
                });
                
                const parentGroups = ['Fire', 'GA', 'Motor'];
                const displayRows: any[] = [];
                
                const standaloneLobs = Array.from(map.values()).filter(r => !parentGroups.some(p => r.lob.startsWith(p + ' ')));
                const groupedParents = parentGroups.map(p => {
                  const children = Array.from(map.values()).filter(r => r.lob.startsWith(p + ' '));
                  return {
                    lob: p,
                    isParent: true,
                    children,
                    attrPY: children.reduce((a, b) => a + b.attrPY, 0),
                    attrCY: children.reduce((a, b) => a + b.attrCY, 0),
                    largePY: children.reduce((a, b) => a + b.largePY, 0),
                    largeCY: children.reduce((a, b) => a + b.largeCY, 0),
                    osPY: children.reduce((a, b) => a + b.osPY, 0),
                    osCY: children.reduce((a, b) => a + b.osCY, 0)
                  };
                });

                const allEntities = [...standaloneLobs, ...groupedParents].sort((a, b) => a.lob.localeCompare(b.lob));
                
                allEntities.forEach(item => {
                  displayRows.push({ ...item, isChild: false });
                  if ((item as any).isParent && expandedLobs.has(item.lob)) {
                    (item as any).children.forEach((child: any) => {
                      displayRows.push({ ...child, isChild: true });
                    });
                  }
                });

                const rows = Array.from(map.values());
                const totals = rows.reduce((acc, r) => ({
                  attrPY: acc.attrPY + r.attrPY,
                  attrCY: acc.attrCY + r.attrCY,
                  largePY: acc.largePY + r.largePY,
                  largeCY: acc.largeCY + r.largeCY
                }), { attrPY: 0, attrCY: 0, largePY: 0, largeCY: 0 });

                return (
                  <div className="data-summary-grid">
                    <div>
                      <div className="data-summary-section-title">Attritional IBNR</div>
                      <table className="data-summary-table">
                        <thead>
                          <tr>
                            <th style={{ padding: '0.25rem', textAlign: 'left' }}>LOB</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>PY IBNR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>CY IBNR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((r, i) => (
                            <tr key={r.lob + i} className={r.isParent ? 'data-summary-parent-row' : undefined}>
                              <td style={{ padding: '0.25rem', fontWeight: r.isParent ? 600 : 400, paddingLeft: r.isChild ? '2rem' : '0.25rem', cursor: r.isParent ? 'pointer' : 'default' }} onClick={() => r.isParent && toggleLob(r.lob)}>
                                {r.isParent ? (expandedLobs.has(r.lob) ? '▼ ' : '▶ ') : ''}{r.lob}
                              </td>
                              <td style={{ padding: '0.25rem', textAlign: 'right' }}>{r.attrPY === 0 ? '-' : formatNumber(r.attrPY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right' }}>{r.attrCY === 0 ? '-' : formatNumber(r.attrCY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}>{(r.attrPY + r.attrCY) === 0 ? '-' : formatNumber(r.attrPY + r.attrCY)}</td>
                            </tr>
                          ))}
                          <tr className="data-summary-total">
                            <td style={{ padding: '0.25rem', fontWeight: 600 }}>TOTAL</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}>{totals.attrPY === 0 ? '-' : formatNumber(totals.attrPY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}>{totals.attrCY === 0 ? '-' : formatNumber(totals.attrCY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}>{(totals.attrPY + totals.attrCY) === 0 ? '-' : formatNumber(totals.attrPY + totals.attrCY)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <div className="data-summary-section-title">Large Loss IBNR</div>
                      <table className="data-summary-table">
                        <thead>
                          <tr>
                            <th style={{ padding: '0.25rem', textAlign: 'left' }}>LOB</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>PY IBNR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>CY IBNR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((r, i) => (
                            <tr key={r.lob + i} className={r.isParent ? 'data-summary-parent-row' : undefined}>
                              <td style={{ padding: '0.25rem', fontWeight: r.isParent ? 600 : 400, paddingLeft: r.isChild ? '2rem' : '0.25rem', cursor: r.isParent ? 'pointer' : 'default' }} onClick={() => r.isParent && toggleLob(r.lob)}>
                                {r.isParent ? (expandedLobs.has(r.lob) ? '▼ ' : '▶ ') : ''}{r.lob}
                              </td>
                              <td style={{ padding: '0.25rem', textAlign: 'right' }}>{r.largePY === 0 ? '-' : formatNumber(r.largePY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right' }}>{r.largeCY === 0 ? '-' : formatNumber(r.largeCY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}>{(r.largePY + r.largeCY) === 0 ? '-' : formatNumber(r.largePY + r.largeCY)}</td>
                            </tr>
                          ))}
                          <tr className="data-summary-total">
                            <td style={{ padding: '0.25rem', fontWeight: 600 }}>TOTAL</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}>{totals.largePY === 0 ? '-' : formatNumber(totals.largePY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}>{totals.largeCY === 0 ? '-' : formatNumber(totals.largeCY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}>{(totals.largePY + totals.largeCY) === 0 ? '-' : formatNumber(totals.largePY + totals.largeCY)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <div className="data-summary-section-title">Outstanding Claims (OCR)</div>
                      <table className="data-summary-table">
                        <thead>
                          <tr>
                            <th style={{ padding: '0.25rem', textAlign: 'left' }}>LOB</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>PY OCR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>CY OCR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((r, i) => (
                            <tr key={r.lob + i} className={r.isParent ? 'data-summary-parent-row' : undefined}>
                              <td style={{ padding: '0.25rem', fontWeight: r.isParent ? 600 : 400, paddingLeft: r.isChild ? '2rem' : '0.25rem', cursor: r.isParent ? 'pointer' : 'default' }} onClick={() => r.isParent && toggleLob(r.lob)}>
                                {r.isParent ? (expandedLobs.has(r.lob) ? '▼ ' : '▶ ') : ''}{r.lob}
                              </td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.osPY === 0 ? '-' : formatNumber(r.osPY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.osCY === 0 ? '-' : formatNumber(r.osCY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(r.osPY + r.osCY)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="data-summary-total">
                            <td style={{ padding: '0.25rem' }}>TOTAL</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(rows.reduce((a, b) => a + b.osPY, 0))}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(rows.reduce((a, b) => a + b.osCY, 0))}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(rows.reduce((a, b) => a + b.osPY + b.osCY, 0))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {reserveData && (
            <div className="glass-panel data-summary-card" style={{ marginBottom: '1.5rem' }}>
              <div className="data-summary-title">Reinsurance Reserve Summary</div>
              {(() => {
                const map = new Map<string, { 
                  lob: string; 
                  attrPY: number; attrCY: number; largePY: number; largeCY: number; osPY: number; osCY: number;
                  treaties: Record<string, { attrPY: number; attrCY: number; largePY: number; largeCY: number; osPY: number; osCY: number }>;
                }>();
                
                RESERVE_LOB_SHEETS.forEach(lob => {
                  map.set(lob, { lob, attrPY: 0, attrCY: 0, largePY: 0, largeCY: 0, osPY: 0, osCY: 0, treaties: {} });
                });
                
                reserveData.ri.forEach(row => {
                  const item = map.get(row.lobName);
                  if (!item) return;
                  if (row.yearCategory === 'Prior Year') {
                    item.attrPY += row.attrIBNR;
                    item.largePY += row.largeIBNR;
                    item.osPY += row.outstandingClaims;
                    Object.entries(row.treaties || {}).forEach(([t, vals]) => {
                      if (!item.treaties[t]) item.treaties[t] = { attrPY: 0, attrCY: 0, largePY: 0, largeCY: 0, osPY: 0, osCY: 0 };
                      item.treaties[t].attrPY += vals.attrIBNR;
                      item.treaties[t].largePY += vals.largeIBNR;
                      item.treaties[t].osPY += vals.outstandingClaims;
                    });
                  } else {
                    item.attrCY += row.attrIBNR;
                    item.largeCY += row.largeIBNR;
                    item.osCY += row.outstandingClaims;
                    Object.entries(row.treaties || {}).forEach(([t, vals]) => {
                      if (!item.treaties[t]) item.treaties[t] = { attrPY: 0, attrCY: 0, largePY: 0, largeCY: 0, osPY: 0, osCY: 0 };
                      item.treaties[t].attrCY += vals.attrIBNR;
                      item.treaties[t].largeCY += vals.largeIBNR;
                      item.treaties[t].osCY += vals.outstandingClaims;
                    });
                  }
                });
                
                const parentGroups = ['Fire', 'GA', 'Motor'];
                const displayRows: any[] = [];
                
                const standaloneLobs = Array.from(map.values()).filter(r => !parentGroups.some(p => r.lob.startsWith(p + ' ')));
                const groupedParents = parentGroups.map(p => {
                  const children = Array.from(map.values()).filter(r => r.lob.startsWith(p + ' '));
                  return {
                    lob: p,
                    isParent: true,
                    children,
                    attrPY: children.reduce((a, b) => a + b.attrPY, 0),
                    attrCY: children.reduce((a, b) => a + b.attrCY, 0),
                    largePY: children.reduce((a, b) => a + b.largePY, 0),
                    largeCY: children.reduce((a, b) => a + b.largeCY, 0),
                    osPY: children.reduce((a, b) => a + b.osPY, 0),
                    osCY: children.reduce((a, b) => a + b.osCY, 0)
                  };
                });

                const allEntities = [...standaloneLobs, ...groupedParents].sort((a, b) => a.lob.localeCompare(b.lob));
                
                allEntities.forEach(item => {
                  displayRows.push({ ...item, isChild: false, isTreaty: false });
                  
                  if (!(item as any).isParent && expandedLobs.has(item.lob)) {
                    Object.entries((item as any).treaties || {}).forEach(([tName, tVals]: [string, any]) => {
                      displayRows.push({ ...tVals, lob: `↳ ${tName}`, isChild: true, isTreaty: true });
                    });
                  }

                  if ((item as any).isParent && expandedLobs.has(item.lob)) {
                    (item as any).children.forEach((child: any) => {
                      displayRows.push({ ...child, isChild: true, isTreaty: false });
                      if (expandedLobs.has(child.lob)) {
                        Object.entries(child.treaties || {}).forEach(([tName, tVals]: [string, any]) => {
                          displayRows.push({ ...tVals, lob: `↳ ${tName}`, isChild: true, isTreaty: true, isDeepChild: true });
                        });
                      }
                    });
                  }
                });

                const rows = Array.from(map.values());
                const totals = rows.reduce((acc, r) => ({
                  attrPY: acc.attrPY + r.attrPY,
                  attrCY: acc.attrCY + r.attrCY,
                  largePY: acc.largePY + r.largePY,
                  largeCY: acc.largeCY + r.largeCY,
                  osPY: acc.osPY + r.osPY,
                  osCY: acc.osCY + r.osCY
                }), { attrPY: 0, attrCY: 0, largePY: 0, largeCY: 0, osPY: 0, osCY: 0 });

                return (
                  <div className="data-summary-grid">
                    <div>
                      <div className="data-summary-section-title">Attritional IBNR</div>
                      <table className="data-summary-table">
                        <thead>
                          <tr>
                            <th style={{ padding: '0.25rem', textAlign: 'left' }}>LOB</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>PY IBNR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>CY IBNR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((r, i) => (
                            <tr key={r.lob + i} className={r.isParent ? 'data-summary-parent-row' : undefined} style={{ opacity: r.isTreaty ? 0.75 : 1 }}>
                              <td style={{ padding: '0.25rem', fontWeight: r.isParent ? 600 : 400, paddingLeft: r.isTreaty ? (r.isDeepChild ? '3.5rem' : '2rem') : (r.isChild ? '2rem' : '0.25rem'), cursor: (r.isParent || (!r.isTreaty && !r.isParent)) ? 'pointer' : 'default' }} onClick={() => !r.isTreaty && toggleLob(r.isDeepChild ? r.lob.replace('↳ ', '') : r.lob)}>
                                {!r.isTreaty ? (expandedLobs.has(r.lob) ? '▼ ' : '▶ ') : ''}{r.lob}
                              </td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.attrPY === 0 ? '-' : formatNumber(r.attrPY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.attrCY === 0 ? '-' : formatNumber(r.attrCY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{(r.attrPY + r.attrCY) === 0 ? '-' : formatNumber(r.attrPY + r.attrCY)}</td>
                            </tr>
                          ))}
                          <tr className="data-summary-total">
                            <td style={{ padding: '0.25rem', fontWeight: 600 }}>TOTAL</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{totals.attrPY === 0 ? '-' : formatNumber(totals.attrPY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{totals.attrCY === 0 ? '-' : formatNumber(totals.attrCY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{(totals.attrPY + totals.attrCY) === 0 ? '-' : formatNumber(totals.attrPY + totals.attrCY)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <div className="data-summary-section-title">Large Loss IBNR</div>
                      <table className="data-summary-table">
                        <thead>
                          <tr>
                            <th style={{ padding: '0.25rem', textAlign: 'left' }}>LOB</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>PY IBNR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>CY IBNR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((r, i) => (
                            <tr key={r.lob + i} className={r.isParent ? 'data-summary-parent-row' : undefined} style={{ opacity: r.isTreaty ? 0.75 : 1 }}>
                              <td style={{ padding: '0.25rem', fontWeight: r.isParent ? 600 : 400, paddingLeft: r.isTreaty ? (r.isDeepChild ? '3.5rem' : '2rem') : (r.isChild ? '2rem' : '0.25rem'), cursor: (r.isParent || (!r.isTreaty && !r.isParent)) ? 'pointer' : 'default' }} onClick={() => !r.isTreaty && toggleLob(r.isDeepChild ? r.lob.replace('↳ ', '') : r.lob)}>
                                {!r.isTreaty ? (expandedLobs.has(r.lob) ? '▼ ' : '▶ ') : ''}{r.lob}
                              </td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.largePY === 0 ? '-' : formatNumber(r.largePY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.largeCY === 0 ? '-' : formatNumber(r.largeCY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{(r.largePY + r.largeCY) === 0 ? '-' : formatNumber(r.largePY + r.largeCY)}</td>
                            </tr>
                          ))}
                          <tr className="data-summary-total">
                            <td style={{ padding: '0.25rem', fontWeight: 600 }}>TOTAL</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{totals.largePY === 0 ? '-' : formatNumber(totals.largePY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{totals.largeCY === 0 ? '-' : formatNumber(totals.largeCY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{(totals.largePY + totals.largeCY) === 0 ? '-' : formatNumber(totals.largePY + totals.largeCY)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <div className="data-summary-section-title">Outstanding Claims (OCR)</div>
                      <table className="data-summary-table">
                        <thead>
                          <tr>
                            <th style={{ padding: '0.25rem', textAlign: 'left' }}>LOB</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>PY OCR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>CY OCR</th>
                            <th style={{ padding: '0.25rem', textAlign: 'right' }}>TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((r, i) => (
                            <tr key={r.lob + i} className={r.isParent ? 'data-summary-parent-row' : undefined} style={{ opacity: r.isTreaty ? 0.75 : 1 }}>
                              <td style={{ padding: '0.25rem', fontWeight: r.isParent ? 600 : 400, paddingLeft: r.isTreaty ? (r.isDeepChild ? '3.5rem' : '2rem') : (r.isChild ? '2rem' : '0.25rem'), cursor: (r.isParent || (!r.isTreaty && !r.isParent)) ? 'pointer' : 'default' }} onClick={() => !r.isTreaty && toggleLob(r.isDeepChild ? r.lob.replace('↳ ', '') : r.lob)}>
                                {!r.isTreaty ? (expandedLobs.has(r.lob) ? '▼ ' : '▶ ') : ''}{r.lob}
                              </td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.osPY === 0 ? '-' : formatNumber(r.osPY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{r.osCY === 0 ? '-' : formatNumber(r.osCY)}</td>
                              <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(r.osPY + r.osCY)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="data-summary-total">
                            <td style={{ padding: '0.25rem' }}>TOTAL</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{totals.osPY === 0 ? '-' : formatNumber(totals.osPY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace' }}>{totals.osCY === 0 ? '-' : formatNumber(totals.osCY)}</td>
                            <td style={{ padding: '0.25rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(totals.osPY + totals.osCY)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {modelInput && (
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
              <div className="section-divider">Model Input Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <div style={{ ...MONO_STYLE, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Gross</div>
                  <div className="table-wrapper" style={{ maxHeight: '280px' }}>
                    <table style={{ fontSize: '0.8rem' }}>
                      <thead><tr>{modelInput.grossHeaders.map(h => <th key={h} style={{ padding: '0.4rem 0.6rem' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {modelInput.grossData.map((row, i) => (
                          <tr key={i}>{modelInput.grossHeaders.map(h => {
                            const val = row[h];
                            const display = typeof val === 'number' ? formatNumber(val) : String(val ?? '');
                            return <td key={h} style={{ padding: '0.4rem 0.6rem', textAlign: typeof val === 'number' ? 'right' : 'left', fontFamily: typeof val === 'number' ? 'monospace' : 'inherit' }}>{display}</td>;
                          })}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <div style={{ ...MONO_STYLE, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Reinsurance</div>
                  <div className="table-wrapper" style={{ maxHeight: '280px' }}>
                    <table style={{ fontSize: '0.8rem' }}>
                      <thead><tr>{modelInput.riHeaders.map(h => <th key={h} style={{ padding: '0.4rem 0.6rem' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {modelInput.riData.map((row, i) => (
                          <tr key={i}>{modelInput.riHeaders.map(h => {
                            const val = row[h];
                            const display = typeof val === 'number' ? formatNumber(val) : String(val ?? '');
                            return <td key={h} style={{ padding: '0.4rem 0.6rem', textAlign: typeof val === 'number' ? 'right' : 'left', fontFamily: typeof val === 'number' ? 'monospace' : 'inherit' }}>{display}</td>;
                          })}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn-secondary" onClick={() => setCurrentStep(2)} style={{ padding: '0.75rem 2rem' }}>← Back</button>
            <button className="btn-primary" onClick={() => setCurrentStep(4)} style={{ padding: '0.75rem 2.5rem' }}>Next →</button>
          </div>
        </div>
      )}

      {currentStep === 4 && (
        <div className="step-panel">
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <div className="section-divider">Configuration Recap</div>
            <div className="processing-summary" style={{ marginTop: 0 }}>
              <div><strong>{valuationDate ? monthLabel(valuationDate) : '—'}</strong><span>Valuation Date</span></div>
              <div><strong>{periodLabel || '—'}</strong><span>Period</span></div>
              <div><strong style={{ textTransform: 'capitalize' }}>{openingStrategy}</strong><span>Opening</span></div>
              <div><strong>{grossMatches.length}</strong><span>Gross Files</span></div>
              <div><strong>{riMatches.length}</strong><span>RI Files</span></div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <div className="section-divider">Match Summary</div>
            <div className="processing-summary" style={{ marginTop: 0 }}>
              <div><strong>{grossMatchedCount}</strong><span>Gross matched</span></div>
              <div><strong>{riMatchedCount}</strong><span>RI matched</span></div>
              <div><strong>{reserveData?.gross.filter(l => l.dateMatches).length ?? 0}/{reserveData?.gross.length ?? 0}</strong><span>Reserve dates valid</span></div>
              {verificationData && (
                <>
                  <div><strong style={{ color: verificationFailCount > 0 ? 'var(--error)' : 'var(--success)' }}>{verificationPassCount}/{verificationRows.length}</strong><span>Verified</span></div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '1rem' }}>
            <button className="btn-secondary" onClick={() => setCurrentStep(3)} style={{ padding: '0.75rem 2rem' }}>← Back</button>
            <button 
              className="btn-primary" 
              onClick={() => {
                setCurrentStep(5);
                handleProcessFiles(
                  portfolioTitle, 
                  _portfolioId, 
                  grossUploadFiles, 
                  riUploadFiles, 
                  true,
                  modelInput, 
                  reserveData, 
                  grossMatches, 
                  riMatches, 
                  'data-processing'
                );
              }} 
              style={{ padding: '0.75rem 2rem' }}
              disabled={isProcessing}
            >
              Start Data Transfer →
            </button>
          </div>
        </div>
      )}

      {currentStep === 5 && (
        <div className="step-panel">
          <div className="glass-panel status-panel" style={{ padding: '2.5rem 2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.925rem', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: '500', color: 'var(--text)' }}>{currentStatus}</span>
              <span style={{ color: 'var(--primary)', fontWeight: '600', fontFamily: 'monospace' }}>{progressPercent}%</span>
            </div>
            
            <div className="progress-bar-container" style={{ height: '6px', marginBottom: '1.25rem' }}>
              <div className="progress-bar-fill" style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--primary)', borderRadius: '9999px', transition: 'width 0.25s ease-out' }}></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.5rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <span>{isProcessing ? 'Elapsed time:' : 'Total process duration:'}</span>
              <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{processingDuration.toFixed(2)}s</span>
            </div>

            <div ref={logContainerRef} className="status-log" style={{ marginTop: '1.5rem' }}>
              {logs.map((log, i) => (
                <div key={i} className={`log-entry ${log.type}`} style={{ fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.35rem 0' }}>
                  {log.text}
                </div>
              ))}
            </div>

            {!isProcessing && processedData && (
              <div className="processing-summary" aria-label="Consolidation summary">
                <div><strong>{processedData.processedFileCount}</strong><span>Workbooks read</span></div>
                <div><strong>{processedData.populatedSheetCount}/{processedData.sheetCount}</strong><span>Sheets populated</span></div>
                <div><strong>{processedData.totalRows.toLocaleString()}</strong><span>Rows generated</span></div>
              </div>
            )}

            {!isProcessing && (
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download="processed_sheets.zip"
                    className="btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" width="16" height="16">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download Combined ZIP Package
                  </a>
                )}
                <button
                  className="btn-secondary"
                  onClick={() => setCurrentStep(4)}
                >
                  Back to Review
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
