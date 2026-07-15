import React, { useEffect, useRef, useState } from 'react';
import type { ProcessingSummary } from '../utils/processor';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isSupportedWorkbook(file: File) {
  return /\.(xlsx|xlsb)$/i.test(file.name);
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface CombineSheetProps {
  portfolioTitle: string;
  step: 1 | 2;
  setStep: React.Dispatch<React.SetStateAction<1 | 2>>;
  processingDuration: number;
  lobFiles: File[];
  setLobFiles: React.Dispatch<React.SetStateAction<File[]>>;
  reinsuranceFiles: File[];
  setReinsuranceFiles: React.Dispatch<React.SetStateAction<File[]>>;
  isProcessing: boolean;
  progressPercent: number;
  currentStatus: string;
  logs: { text: string; type: 'info' | 'success' | 'error' }[];
  processingSummary: ProcessingSummary | null;
  downloadUrl: string | null;
  handleProcessFiles: () => Promise<void>;
  handleClear: () => void;
}

export const CombineSheet: React.FC<CombineSheetProps> = ({
  portfolioTitle,
  step = 1,
  setStep = () => {},
  processingDuration = 0,
  lobFiles,
  setLobFiles,
  reinsuranceFiles,
  setReinsuranceFiles,
  isProcessing,
  progressPercent,
  currentStatus,
  logs,
  processingSummary,
  downloadUrl,
  handleProcessFiles,
  handleClear
}) => {
  const [dragActiveLOB, setDragActiveLOB] = useState(false);
  const [dragActiveRI, setDragActiveRI] = useState(false);
  const [selectionError, setSelectionError] = useState('');

  const fileInputLOBRef = useRef<HTMLInputElement>(null);
  const fileInputRIRef = useRef<HTMLInputElement>(null);
  const folderInputLOBRef = useRef<HTMLInputElement>(null);
  const folderInputRIRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lobFiles.length === 0 && reinsuranceFiles.length === 0) setSelectionError('');
  }, [lobFiles.length, reinsuranceFiles.length]);

  useEffect(() => {
    if (!logContainerRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs]);

  const addFiles = (files: File[], type: 'LOB' | 'RI') => {
    const unsupported = files.filter(file => !isSupportedWorkbook(file));
    const oversized = files.filter(file => isSupportedWorkbook(file) && file.size > MAX_FILE_SIZE);
    const existingKeys = new Set([...lobFiles, ...reinsuranceFiles].map(fileKey));
    const accepted = files.filter(file => isSupportedWorkbook(file) && file.size <= MAX_FILE_SIZE && !existingKeys.has(fileKey(file)));

    if (type === 'LOB') setLobFiles(previous => [...previous, ...accepted]);
    else setReinsuranceFiles(previous => [...previous, ...accepted]);

    const messages = [];
    if (unsupported.length > 0) messages.push(`${unsupported.length} unsupported file(s)`);
    if (oversized.length > 0) messages.push(`${oversized.length} file(s) over 50 MB`);
    const duplicateCount = files.length - unsupported.length - oversized.length - accepted.length;
    if (duplicateCount > 0) messages.push(`${duplicateCount} duplicate file(s)`);
    setSelectionError(messages.length > 0 ? `Skipped ${messages.join(', ')}.` : '');
  };

  const handleLOBFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files), 'LOB');
    e.target.value = '';
  };

  const handleRIFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files), 'RI');
    e.target.value = '';
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent, type: 'LOB' | 'RI', active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'LOB') setDragActiveLOB(active);
    else setDragActiveRI(active);
  };

  const traverseFileTree = (item: FileSystemEntry, filesAccumulator: File[]): Promise<void> => {
    return new Promise((resolve) => {
      if (item.isFile) {
        (item as FileSystemFileEntry).file((file: File) => {
          filesAccumulator.push(file);
          resolve();
        }, () => resolve());
      } else if (item.isDirectory) {
        const dirReader = (item as FileSystemDirectoryEntry).createReader();
        const readEntries = () => {
          dirReader.readEntries(async (entries: FileSystemEntry[]) => {
            if (entries.length > 0) {
              const promises = entries.map(entry => traverseFileTree(entry, filesAccumulator));
              await Promise.all(promises);
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
  };

  const handleDrop = async (e: React.DragEvent, type: 'LOB' | 'RI') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (type === 'LOB') setDragActiveLOB(false);
    else setDragActiveRI(false);

    const items = e.dataTransfer.items;
    if (!items) return;

    const filesAccumulator: File[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          promises.push(traverseFileTree(entry, filesAccumulator));
        }
      }
    }

    await Promise.all(promises);

    if (filesAccumulator.length === 0) filesAccumulator.push(...Array.from(e.dataTransfer.files));
    addFiles(filesAccumulator, type);
  };

  const removeFile = (key: string, type: 'LOB' | 'RI') => {
    if (type === 'LOB') {
      setLobFiles(previous => previous.filter(file => fileKey(file) !== key));
    } else {
      setReinsuranceFiles(previous => previous.filter(file => fileKey(file) !== key));
    }
  };

  return (
    <div className="container" style={{ paddingTop: '1.75rem' }}>
      <p style={{ fontFamily: 'monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
        Upload and consolidate Line of Business (LOB) and Reinsurance spreadsheets for <strong style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{portfolioTitle}</strong>
      </p>

      {selectionError && <div className="selection-warning" role="status">{selectionError}</div>}

      {/* Step Indicator Header */}
      <div className="step-indicator" style={{ display: 'flex', gap: '2.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', opacity: step === 1 ? 1 : 0.5, transition: 'opacity 0.25s' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: step === 1 ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: step === 1 ? '#000' : 'var(--text-muted)', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: step === 1 ? '600' : '400', color: step === 1 ? 'var(--text)' : 'var(--text-muted)' }}>Upload Files & Folders</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', opacity: step === 2 ? 1 : 0.5, transition: 'opacity 0.25s' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: step === 2 ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: step === 2 ? '#000' : 'var(--text-muted)', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: step === 2 ? '600' : '400', color: step === 2 ? 'var(--text)' : 'var(--text-muted)' }}>Consolidation Status</span>
        </div>
      </div>

      {step === 1 ? (
        <>
          {/* Upload Grid */}
          <div className="upload-grid">
            {/* LOB Upload */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text)' }}>Line of Business (LOB) Files</h3>
              <div
                className={`upload-zone ${dragActiveLOB ? 'drag-active' : ''}`}
                onDragOver={(e) => handleDrag(e, 'LOB', true)}
                onDragLeave={(e) => handleDrag(e, 'LOB', false)}
                onDrop={(e) => handleDrop(e, 'LOB')}
                onClick={() => folderInputLOBRef.current?.click()}
                style={{ cursor: 'pointer' }}
              >
                <div className="upload-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="40" height="40">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Click to select a folder containing sheets</p>
                  
                  {/* Select Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      onClick={(e) => { e.stopPropagation(); fileInputLOBRef.current?.click(); }}
                    >
                      Browse Files
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      onClick={(e) => { e.stopPropagation(); folderInputLOBRef.current?.click(); }}
                    >
                      Browse Folder
                    </button>
                  </div>
                </div>

                <input
                  type="file"
                  ref={fileInputLOBRef}
                  onChange={handleLOBFileChange}
                  style={{ display: 'none' }}
                  multiple
                  accept=".xlsx,.xlsb"
                />
                <input
                  type="file"
                  ref={folderInputLOBRef}
                  onChange={handleLOBFileChange}
                  style={{ display: 'none' }}
                  multiple
                  {...({ webkitdirectory: "", directory: "" } as any)}
                />
              </div>

              <div className="file-list">
                {lobFiles.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', margin: 'auto' }}>No files uploaded</p>
                ) : (
                  lobFiles.map(file => (
                    <div className="file-item" key={fileKey(file)}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }} title={file.name}>
                        {file.name} <small>{formatFileSize(file.size)}</small>
                      </span>
                      <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(fileKey(file), 'LOB')}>&times;</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Reinsurance Upload */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text)' }}>Reinsurance Files</h3>
              <div
                className={`upload-zone ${dragActiveRI ? 'drag-active' : ''}`}
                onDragOver={(e) => handleDrag(e, 'RI', true)}
                onDragLeave={(e) => handleDrag(e, 'RI', false)}
                onDrop={(e) => handleDrop(e, 'RI')}
                onClick={() => folderInputRIRef.current?.click()}
                style={{ cursor: 'pointer' }}
              >
                <div className="upload-icon" style={{ color: 'var(--secondary)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="40" height="40">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Click to select a folder containing sheets</p>
                  
                  {/* Select Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      onClick={(e) => { e.stopPropagation(); fileInputRIRef.current?.click(); }}
                    >
                      Browse Files
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      onClick={(e) => { e.stopPropagation(); folderInputRIRef.current?.click(); }}
                    >
                      Browse Folder
                    </button>
                  </div>
                </div>

                <input
                  type="file"
                  ref={fileInputRIRef}
                  onChange={handleRIFileChange}
                  style={{ display: 'none' }}
                  multiple
                  accept=".xlsx,.xlsb"
                />
                <input
                  type="file"
                  ref={folderInputRIRef}
                  onChange={handleRIFileChange}
                  style={{ display: 'none' }}
                  multiple
                  {...({ webkitdirectory: "", directory: "" } as any)}
                />
              </div>

              <div className="file-list">
                {reinsuranceFiles.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', margin: 'auto' }}>No files uploaded</p>
                ) : (
                  reinsuranceFiles.map(file => (
                    <div className="file-item" key={fileKey(file)}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }} title={file.name}>
                        {file.name} <small>{formatFileSize(file.size)}</small>
                      </span>
                      <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(fileKey(file), 'RI')}>&times;</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="glass-panel action-bar">
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                className="btn-primary"
                onClick={handleProcessFiles}
                disabled={isProcessing || (lobFiles.length === 0 && reinsuranceFiles.length === 0)}
              >
                Generate Consolidated Sheets
              </button>
              <button
                className="btn-secondary"
                onClick={handleClear}
                disabled={lobFiles.length === 0 && reinsuranceFiles.length === 0}
              >
                Clear Selection
              </button>
            </div>
          </div>
        </>
      ) : (
        /* Step 2: Processing Status & Download Container */
        <div className="glass-panel status-panel" style={{ padding: '2.5rem 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.925rem', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: '500', color: 'var(--text)' }}>{currentStatus}</span>
            <span style={{ color: 'var(--primary)', fontWeight: '600', fontFamily: 'monospace' }}>{progressPercent}%</span>
          </div>
          
          <div className="progress-bar-container" style={{ height: '6px', marginBottom: '1.25rem' }}>
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--primary)', borderRadius: '9999px', transition: 'width 0.25s ease-out' }}></div>
          </div>

          {/* Running Clock Timer Ticker */}
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

          {!isProcessing && processingSummary && (
            <div className="processing-summary" aria-label="Consolidation summary">
              <div><strong>{processingSummary.processedFileCount}</strong><span>Workbooks read</span></div>
              <div><strong>{processingSummary.populatedSheetCount}/{processingSummary.sheetCount}</strong><span>Sheets populated</span></div>
              <div><strong>{processingSummary.totalRows.toLocaleString()}</strong><span>Rows generated</span></div>
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
                onClick={() => setStep(1)}
              >
                Back to Upload
              </button>
              <button
                className="btn-secondary"
                onClick={handleClear}
                style={{ color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
              >
                Reset & Clear Files
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
