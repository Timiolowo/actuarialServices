import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

interface RevisedCompositeProps {
  onBack: () => void;
}

type WizardStep = 'upload' | 'mapping' | 'processing' | 'result';
type SheetMapping = Record<string, string>;

const EXPECTED_SHEETS = [
  { id: 'osAll', label: 'Outstanding Claims All', regex: /^Outstanding Claims All$/i },
  { id: 'osAllSbu', label: 'Outstanding Claims All by SBUs', regex: /^Outstanding Claims All by SBUs$/i },
  { id: 'osFx', label: 'Outstanding Claims FX', regex: /^Outstanding Claims FX$/i },
  { id: 'osFxSbu', label: 'Outstanding Claims FX by SBUs', regex: /^Outstanding Claims FX by SBUs$/i },
  { id: 'cpMonth', label: 'Claims Paid Month only', regex: /^Claims Paid.*only$/i },
  { id: 'cpYtd', label: 'Claims paid YTD', regex: /^Claims paid YTD$/i }
];

export function RevisedComposite({ onBack }: RevisedCompositeProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ classSummary: { class: string; expected: number; outstanding: number; difference: number; }[] } | null>(null);

  // Exchange Rates state
  const [usdRate, setUsdRate] = useState<string>('1500');
  const [gbpRate, setGbpRate] = useState<string>('1900');
  const [eurRate, setEurRate] = useState<string>('1600');

  // Mapping state
  const [actualSheets, setActualSheets] = useState<string[]>([]);
  const [sheetMapping, setSheetMapping] = useState<SheetMapping>({});
  const [isReadingFile, setIsReadingFile] = useState(false);

  useEffect(() => {
    let interval: number;
    if (step === 'processing') {
      setProgress(0);
      interval = window.setInterval(() => {
        setProgress(p => Math.min(95, p + 5));
      }, 300);
    }
    return () => window.clearInterval(interval);
  }, [step]);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setIsReadingFile(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      // Read only sheet names, no need to parse rows yet
      const wb = XLSX.read(buffer, { type: 'array', sheetRows: 1 }); 

      const sheets = wb.SheetNames;
      setActualSheets(sheets);

      const initialMapping: SheetMapping = {};
      EXPECTED_SHEETS.forEach(reqSheet => {
        const matched = sheets.find(n => n.match(reqSheet.regex));
        initialMapping[reqSheet.id] = matched || '';
      });

      setSheetMapping(initialMapping);
      setIsReadingFile(false);
      setStep('mapping');

    } catch (err: any) {
      setError(err.message || 'Failed to read Excel file.');
      setIsReadingFile(false);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    
    // Validate mapping
    const missing = Object.values(sheetMapping).filter(v => !v);
    if (missing.length > 0) {
      setError('Please map all expected sheets before continuing.');
      return;
    }

    setStep('processing');
    setError(null);
    setSummary(null);

    try {
      let data = new FormData();
      data.append('file', file);
      data.append('usdRate', usdRate);
      data.append('gbpRate', gbpRate);
      data.append('eurRate', eurRate);
      data.append('sheetMapping', JSON.stringify(sheetMapping));

      const response = await fetch('/api/process/revised-composite', {
        method: 'POST',
        body: data,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate revised composite');
      }

      const result = await response.json();
      setSummary(result.summary);
      setDownloadUrl(`/api/process/download-composite/${result.downloadId}`);

      setProgress(100);
      setTimeout(() => {
        setStep('result');
      }, 500);

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setStep('mapping'); // Go back to mapping if backend fails
      setProgress(0);
    }
  };

  const getMissingCount = () => {
    return Object.values(sheetMapping).filter(v => !v).length;
  };

  return (
    <div className="container" style={{ animation: 'fadeIn 0.4s ease-out', paddingTop: '1.75rem' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <button className="btn-secondary" onClick={onBack} style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Analysis Hub
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>/</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text)' }}>Revised Composite Sheet</span>
      </div>

      <p style={{ fontFamily: 'monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
        Generate a revised composite sheet from base data
      </p>

      {step === 'processing' ? (
        <div className="glass-panel" style={{ padding: '5rem 2rem', textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="48" height="48" style={{ color: 'var(--primary)' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Generating Composite...</h2>
          <p style={{ color: 'var(--text-muted)' }}>Consolidating base data into the revised composite sheet.</p>
          <div style={{ marginTop: '1.5rem', fontFamily: 'monospace', fontSize: '1.5rem', color: 'var(--primary)', fontWeight: 'bold' }}>
            {progress}%
          </div>
          <div style={{ width: '100%', maxWidth: '300px', height: '4px', background: 'var(--border)', margin: '0.5rem auto 0 auto', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.15s linear' }} />
          </div>
        </div>
      ) : step === 'upload' ? (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto', fontSize: '0.85rem' }}>
              Configure the exchange rates and upload your FINCON report.
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            
            {/* Step 1: Rates Configuration */}
            <div style={{ background: 'var(--bg-body)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', borderRadius: '50%', fontSize: '0.8rem', fontWeight: 700 }}>1</span>
                Exchange Rates
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>$</div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.1rem' }}>USD Rate (NGN)</label>
                    <input 
                      type="number" 
                      value={usdRate} 
                      onChange={e => setUsdRate(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 500, width: '100%', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>£</div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.1rem' }}>GBP Rate (NGN)</label>
                    <input 
                      type="number" 
                      value={gbpRate} 
                      onChange={e => setGbpRate(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 500, width: '100%', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>€</div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.1rem' }}>EUR Rate (NGN)</label>
                    <input 
                      type="number" 
                      value={eurRate} 
                      onChange={e => setEurRate(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 500, width: '100%', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: FINCON Upload */}
            <div style={{ background: 'var(--bg-body)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', borderRadius: '50%', fontSize: '0.8rem', fontWeight: 700 }}>2</span>
                Upload FINCON Report
              </h4>
              <div className="upload-zone" style={{ flex: 1, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '140px', padding: '1rem', opacity: isReadingFile ? 0.5 : 1, pointerEvents: isReadingFile ? 'none' : 'auto' }}>
                <label className="upload-label" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%' }}>
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                    style={{ display: 'none' }}
                  />
                  <div className="upload-icon" style={{ marginBottom: '0.5rem' }}>
                    {isReadingFile ? (
                      <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="24" height="24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    )}
                  </div>
                  <div className="upload-text" style={{ fontSize: '0.85rem' }}>
                    {isReadingFile ? (
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Reading sheets...</span>
                    ) : file ? (
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{file.name} selected</span>
                    ) : (
                      <span><strong>Click to browse</strong> or drag file here</span>
                    )}
                  </div>
                  <div className="upload-hint" style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>Supports Excel files (.xlsx)</div>
                </label>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', textAlign: 'center', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}
        </div>
      ) : step === 'mapping' ? (
        <div className="glass-panel" style={{ padding: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ marginBottom: '0.25rem', fontSize: '1.2rem' }}>Sheet Mapping</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Review and map the expected sheets to your file's sheets.</p>
            </div>
            <button className="btn-secondary" onClick={() => setStep('upload')} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              Back
            </button>
          </div>

          {getMissingCount() > 0 && (
            <div style={{ color: 'var(--danger)', marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', fontSize: '0.85rem' }}>
              <strong>Action Required:</strong> {getMissingCount()} expected sheet(s) could not be automatically found. Please select them manually.
            </div>
          )}

          <div style={{ background: 'var(--bg-body)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            {EXPECTED_SHEETS.map((reqSheet, index) => {
              const currentMap = sheetMapping[reqSheet.id];
              const isMissing = !currentMap;

              return (
                <div key={reqSheet.id} style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1.5fr 2fr', 
                  gap: '1.5rem', 
                  padding: '1rem', 
                  borderBottom: index < EXPECTED_SHEETS.length - 1 ? '1px solid var(--border)' : 'none',
                  background: isMissing ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem', color: isMissing ? 'var(--danger)' : 'var(--text)' }}>
                      {reqSheet.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      Required Sheet
                    </div>
                  </div>

                  <div>
                    <select
                      value={currentMap || ''}
                      onChange={e => setSheetMapping(prev => ({ ...prev, [reqSheet.id]: e.target.value }))}
                      style={{ 
                        width: '100%', 
                        padding: '0.6rem 0.75rem', 
                        borderRadius: '6px', 
                        border: `1px solid ${isMissing ? 'var(--danger)' : 'var(--border)'}`, 
                        background: 'var(--bg-card)', 
                        color: 'var(--text)', 
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="" disabled>-- Select Matching Sheet --</option>
                      {actualSheets.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', marginTop: '1.5rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', textAlign: 'center', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              className="btn-primary" 
              onClick={handleProcess}
              disabled={getMissingCount() > 0}
              style={{ 
                padding: '0.75rem 2rem', 
                borderRadius: '50px',
                opacity: getMissingCount() > 0 ? 0.5 : 1
              }}
            >
              Confirm Mapping & Generate Composite
            </button>
          </div>

        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '2.5rem 1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', marginBottom: '1rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="32" height="32">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Composite Generated Successfully!</h2>
            <p style={{ color: 'var(--text-muted)' }}>The revised composite sheet has been processed and is ready for download.</p>
          </div>

          {summary && summary.classSummary && (
            <div style={{ marginTop: '2rem', marginBottom: '2.5rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'var(--bg-body)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <thead style={{ background: 'var(--bg-surface)' }}>
                  <tr>
                    <th style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem' }}>CLASS</th>
                    <th style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)', fontWeight: 600, textAlign: 'right', fontSize: '0.85rem' }}>Expected</th>
                    <th style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)', fontWeight: 600, textAlign: 'right', fontSize: '0.85rem' }}>Outstanding</th>
                    <th style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)', fontWeight: 600, textAlign: 'right', fontSize: '0.85rem' }}>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.classSummary.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}>{item.class}</td>
                      <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {item.expected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {item.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', color: item.difference !== 0 ? 'var(--danger)' : 'var(--text)', fontSize: '0.85rem' }}>
                        {item.difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ background: 'var(--bg-surface)', fontWeight: 600 }}>
                  <tr>
                    <td style={{ padding: '1rem' }}>TOTAL</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {summary.classSummary.reduce((acc, curr) => acc + curr.expected, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {summary.classSummary.reduce((acc, curr) => acc + curr.outstanding, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace', color: summary.classSummary.reduce((acc, curr) => acc + curr.difference, 0) !== 0 ? 'var(--danger)' : 'var(--text)' }}>
                      {summary.classSummary.reduce((acc, curr) => acc + curr.difference, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <button className="btn-secondary" onClick={() => setStep('upload')} style={{ padding: '0.75rem 2rem', borderRadius: '50px' }}>
              Process Another
            </button>
            {downloadUrl && (
              <a href={downloadUrl} className="btn-primary" style={{ padding: '0.75rem 2rem', borderRadius: '50px', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Composite
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
