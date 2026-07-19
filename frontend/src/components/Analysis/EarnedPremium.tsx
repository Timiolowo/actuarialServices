import { useState, useEffect, useRef, useMemo } from 'react';
import EpWorker from '../../workers/earnedPremium.worker?worker';

interface EarnedPremiumProps {
  onBack: () => void;
}

interface ProcessingAudit {
  totalRows: number;
  calculatedRows: number;
  reviewRows: number;
  previewRows: number;
  previewLimit: number;
  reasons: Record<string, number>;
}

type ViewTab = 'summary' | 'detail';
type DateFilterField = 'regDate' | 'startDate' | 'endDate';

const DETAIL_COLUMNS = [
  { key: 'policyKey', label: 'Policy Key' },
  { key: 'custName', label: 'Customer Name' },
  { key: 'class', label: 'Class' },
  { key: 'startDate', label: 'Start Date' },
  { key: 'endDate', label: 'End Date' },
  { key: 'premium', label: 'Premium', numeric: true },
  { key: 'commission', label: 'Commission', numeric: true },
  { key: 'regDate', label: 'Reg Date' },
  { key: 'duration', label: 'Duration', numeric: true },
  { key: 'exposedDays', label: 'Exposed Days', numeric: true },
  { key: 'earnedFrac', label: 'Earned Frac', numeric: true },
  { key: 'earnedPremium', label: 'Earned Premium', numeric: true },
  { key: 'unePeriod', label: 'UNE Period', numeric: true },
  { key: 'unearnedPremium', label: 'Unearned Premium', numeric: true },
  { key: 'dac', label: 'DAC', numeric: true },
  { key: 'gwpYtd', label: 'GWP YTD', numeric: true },
];

const ROWS_PER_PAGE = 50;

function formatNum(v: any): string {
  const n = Number(v);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInt(v: any): string {
  const n = Number(v);
  if (isNaN(n)) return '0';
  return Math.round(n).toLocaleString();
}

export function EarnedPremium({ onBack }: EarnedPremiumProps) {
  const now = new Date();
  const defStart = `${now.getFullYear()}-01-01`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const defEnd = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${String(lastMonth.getDate()).padStart(2, '0')}`;

  const [files, setFiles] = useState<File[]>([]);
  const [valStart, setValStart] = useState(defStart);
  const [valEnd, setValEnd] = useState(defEnd);

  const [isProcessing, setIsProcessing] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [summaryWorkbook, setSummaryWorkbook] = useState<Blob | null>(null);
  const [calculationFile, setCalculationFile] = useState<File | null>(null);
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [audit, setAudit] = useState<ProcessingAudit | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // View state
  const [activeTab, setActiveTab] = useState<ViewTab>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [dateFilterField, setDateFilterField] = useState<DateFilterField>('regDate');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  // Summary filters
  const [summaryClassFilter, setSummaryClassFilter] = useState<string>('All');
  const [summaryTopBottom, setSummaryTopBottom] = useState<'All' | 'Top 10' | 'Bottom 10' | 'Top 5' | 'Bottom 5'>('All');
  const [summarySortMetric, setSummarySortMetric] = useState<'earnedPremium' | 'unearnedPremium' | 'dac' | 'gwpYtd'>('earnedPremium');
  // Drag state
  const [dragActive, setDragActive] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const workspaceRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
      const workspaceName = workspaceRef.current;
      if (workspaceName) {
        navigator.storage.getDirectory()
          .then(root => root.removeEntry(workspaceName, { recursive: true }))
          .catch(() => undefined);
      }
    };
  }, []);

  const clearDownloadedFiles = () => {
    const workspaceName = workspaceRef.current;
    workspaceRef.current = null;
    if (workspaceName) {
      navigator.storage.getDirectory()
        .then(root => root.removeEntry(workspaceName, { recursive: true }))
        .catch(() => undefined);
    }
    setSummaryWorkbook(null);
    setCalculationFile(null);
  };

  const handleDrag = (e: React.DragEvent, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(active);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
      setHasResults(false);
      setErrorMsg('');
    }
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    setStatusMsg('Loading template...');
    setErrorMsg('');
    clearDownloadedFiles();
    setAudit(null);

    try {
      const templateUrl = `${import.meta.env.BASE_URL}templates/Earned%20Premium%20Template.xlsx`;
      const templateRes = await fetch(templateUrl);
      if (!templateRes.ok) throw new Error('Could not load the local Excel template.');
      const templateBuffer = await templateRes.arrayBuffer();

      workerRef.current = new EpWorker();
      workerRef.current.onmessage = (e) => {
        const data = e.data;
        if (data.type === 'progress') {
          setProgress(data.progressPercent);
          setStatusMsg(data.status);
        } else if (data.type === 'complete') {
          setIsProcessing(false);
          setHasResults(true);
          setSummaryWorkbook(data.summaryWorkbook);
          setCalculationFile(data.calculationFile);
          workspaceRef.current = data.workspaceName;
          setFiles([]);
          if (data.summary) setSummaryData(data.summary);
          if (data.detailRows) setDetailRows(data.detailRows);
          if (data.audit) setAudit(data.audit);
          setCurrentPage(0);
          setSearchQuery('');
          setColumnFilters({});
          setDateFrom('');
          setDateTo('');
          setSortConfig(null);
          setSummaryClassFilter('All');
          setSummaryTopBottom('All');
          setSummarySortMetric('earnedPremium');
          setActiveTab('summary');
          workerRef.current?.terminate();
        } else if (data.type === 'error') {
          setIsProcessing(false);
          setErrorMsg(data.message);
          workerRef.current?.terminate();
        }
      };

      workerRef.current.postMessage({
        type: 'start',
        files,
        valStartStr: valStart,
        valEndStr: valEnd,
        templateBuffer
      }, [templateBuffer]);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMsg(err.message || 'An error occurred');
    }
  };

  const downloadAsset = (asset: Blob | null, filename: string) => {
    if (!asset) return;
    const url = URL.createObjectURL(asset);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---- Filtered and sorted summary data ----
  const processedSummary = useMemo(() => {
    let result = [...summaryData];

    if (summaryClassFilter !== 'All') {
      result = result.filter(r => r.class === summaryClassFilter);
    }

    if (summaryTopBottom !== 'All') {
      // sort descending by the selected metric
      result.sort((a, b) => b[summarySortMetric] - a[summarySortMetric]);
      
      const count = summaryTopBottom.includes('10') ? 10 : 5;
      
      if (summaryTopBottom.startsWith('Bottom')) {
        // we want the lowest, so we take from the end and reverse so lowest is top
        result = result.slice(-count).reverse();
      } else {
        result = result.slice(0, count);
      }
    }

    return result;
  }, [summaryData, summaryClassFilter, summaryTopBottom, summarySortMetric]);

  const uniqueClasses = useMemo(() => Array.from(new Set(summaryData.map(r => r.class))).sort(), [summaryData]);

  // ---- Filtered and paginated detail data ----
  const filteredDetail = useMemo(() => {
    let data = detailRows;

    // Global search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(row =>
        DETAIL_COLUMNS.some(col => {
          const v = row[col.key];
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }

    // Per-column filters
    for (const [colKey, filterVal] of Object.entries(columnFilters)) {
      if (!filterVal.trim()) continue;
      const fv = filterVal.toLowerCase();
      data = data.filter(row => {
        const v = row[colKey];
        return v != null && String(v).toLowerCase().includes(fv);
      });
    }

    if (dateFrom || dateTo) {
      data = data.filter(row => {
        const value = String(row[dateFilterField] || '');
        if (!value) return false;
        return (!dateFrom || value >= dateFrom) && (!dateTo || value <= dateTo);
      });
    }

    if (sortConfig) {
      data = [...data].sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        
        // Handle null/undefined
        if (valA == null && valB != null) return sortConfig.direction === 'asc' ? 1 : -1;
        if (valA != null && valB == null) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA == null && valB == null) return 0;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [detailRows, searchQuery, columnFilters, dateFilterField, dateFrom, dateTo, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredDetail.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages - 1);
  const pageRows = filteredDetail.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);

  const setColumnFilter = (key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(0);
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
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text)' }}>Earned Premium Calculator</span>
      </div>

      <p style={{ fontFamily: 'monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
        Configure valuation dates and upload production data to generate the <strong style={{ color: 'var(--primary)', fontWeight: 'bold' }}>P&C Earned Premium</strong> report.
      </p>

      {errorMsg && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span><strong>Error:</strong> {errorMsg}</span>
        </div>
      )}

      {isProcessing ? (
        <div className="glass-panel" style={{ padding: '5rem 2rem', textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
          <style>{`
            @keyframes slideUpFade {
              0% { transform: translateY(10px); opacity: 0; }
              100% { transform: translateY(0); opacity: 1; }
            }
          `}</style>
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="48" height="48" style={{ color: 'var(--primary)' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Calculating Earned Premium...</h2>
          
          <div style={{ height: '24px', overflow: 'hidden', position: 'relative', margin: '0.5rem 0' }}>
            <p 
              key={statusMsg} 
              style={{ 
                margin: 0,
                color: 'var(--text-muted)', 
                animation: 'slideUpFade 0.3s ease-out forwards',
                position: 'absolute',
                width: '100%',
                textAlign: 'center'
              }}
            >
              {statusMsg || 'Applying actuarial methodologies...'}
            </p>
          </div>

          <div style={{ marginTop: '1.5rem', fontFamily: 'monospace', fontSize: '1.5rem', color: 'var(--primary)', fontWeight: 'bold' }}>
            {Math.round(progress)}%
          </div>
          <div style={{ width: '100%', maxWidth: '300px', height: '4px', background: 'var(--border)', margin: '0.5rem auto 0 auto', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.15s linear' }} />
          </div>
        </div>
      ) : !hasResults ? (
        <>
          <div className="glass-panel" style={{ padding: '2.5rem' }}>
            {/* Parameters Section */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--primary)" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Valuation Parameters
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Start</label>
                    <input type="date" value={valStart} onChange={e => setValStart(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none', transition: 'border-color 0.2s' }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>End</label>
                    <input type="date" value={valEnd} onChange={e => setValEnd(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none', transition: 'border-color 0.2s' }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'} />
                  </div>
                </div>
              </div>
            </div>

            {/* Upload Section */}
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--primary)" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Production Data
              </h3>
              <div className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
                onDragOver={(e) => handleDrag(e, true)}
                onDragLeave={(e) => handleDrag(e, false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: 'pointer', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <input type="file" ref={fileInputRef} accept=".csv,.parquet,.xlsx,.xls" multiple
                  onChange={(e) => { if (e.target.files && e.target.files.length > 0) { setFiles(Array.from(e.target.files)); setHasResults(false); setErrorMsg(''); } e.target.value = ''; }}
                  style={{ display: 'none' }} />
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--primary)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="22" height="22">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                </div>
                {files.length > 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                        {files.length === 1 ? files[0].name : `${files.length} files selected`}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} MB total
                      </div>
                    </div>
                    <button type="button" className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }} onClick={(e) => { e.stopPropagation(); setFiles([]); }}>Remove All</button>
                  </div>
                ) : (
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--text)' }}><strong>Click to browse</strong> or drag files here</p>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Supports .parquet, .csv, and .xlsx. Select or drag multiple files at once.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="glass-panel action-bar">
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600 }}
                onClick={handleProcess} disabled={isProcessing || files.length === 0}>
                Calculate Earned Premium
              </button>
              <button className="btn-secondary" onClick={() => { setFiles([]); setValStart(defStart); setValEnd(defEnd); }}
                disabled={isProcessing || files.length === 0}>
                Clear
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          {/* Success Header */}
          <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" width="24" height="24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            </div>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 600 }}>Calculation Complete!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '650px', margin: '0 auto 1rem auto', lineHeight: 1.5 }}>
              {(audit?.calculatedRows ?? detailRows.length).toLocaleString()} rows calculated. The detailed calculation is available as CSV, and the summary has been written into the template’s RESULT sheet.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => { setHasResults(false); clearDownloadedFiles(); }}>Start Over</button>
              <button className="btn-primary" onClick={() => downloadAsset(summaryWorkbook, `Earned_Premium_Result_${valEnd}.xlsx`)} disabled={!summaryWorkbook} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download RESULT Workbook
              </button>
              <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => downloadAsset(calculationFile, calculationFile?.name || `Earned_Premium_Calculation_${valEnd}.csv`)} disabled={!calculationFile}>Download Calculation CSV</button>
            </div>
          </div>

          {audit && (
            <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem 0', color: 'var(--text)' }}>Processing KPIs</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                {[
                  { label: 'Input rows', value: audit.totalRows, color: 'var(--text)' },
                  { label: 'Calculated rows', value: audit.calculatedRows, color: '#22c55e' },
                  { label: 'Validation issues', value: audit.reviewRows, color: audit.reviewRows ? '#f59e0b' : '#22c55e' },
                  ...Object.entries(audit.reasons).map(([reason, count]) => ({ label: reason, value: count, color: '#f59e0b' }))
                ].map(kpi => (
                  <div key={kpi.label} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.025)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.2 }}>{kpi.label}</div>
                    <div style={{ color: kpi.color, fontSize: '1.15rem', fontWeight: 700, marginTop: '0.15rem', fontFamily: 'monospace' }}>{kpi.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button onClick={() => setActiveTab('summary')}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em',
                background: activeTab === 'summary' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'summary' ? '#000' : 'var(--text-muted)',
                fontWeight: activeTab === 'summary' ? 700 : 400,
                transition: 'all 0.2s'
              }}>
              Summary
            </button>
            <button onClick={() => setActiveTab('detail')}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em',
                background: activeTab === 'detail' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'detail' ? '#000' : 'var(--text-muted)',
                fontWeight: activeTab === 'detail' ? 700 : 400,
                transition: 'all 0.2s'
              }}>
              Detail preview ({detailRows.length.toLocaleString()})
            </button>
          </div>

          {/* Summary Tab */}
          {activeTab === 'summary' && summaryData.length > 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text)' }}>Summary by Class</h3>
                
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select 
                    value={summaryClassFilter}
                    onChange={(e) => setSummaryClassFilter(e.target.value)}
                    style={{ background: 'var(--bg-lighter)', color: 'var(--text)', border: '1px solid var(--border-color)', padding: '0.4rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}
                  >
                    <option value="All">All Classes</option>
                    {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <select 
                    value={summaryTopBottom}
                    onChange={(e) => setSummaryTopBottom(e.target.value as any)}
                    style={{ background: 'var(--bg-lighter)', color: 'var(--text)', border: '1px solid var(--border-color)', padding: '0.4rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}
                  >
                    <option value="All">All Items</option>
                    <option value="Top 5">Top 5</option>
                    <option value="Top 10">Top 10</option>
                    <option value="Bottom 5">Bottom 5</option>
                    <option value="Bottom 10">Bottom 10</option>
                  </select>

                  <select 
                    value={summarySortMetric}
                    onChange={(e) => setSummarySortMetric(e.target.value as any)}
                    disabled={summaryTopBottom === 'All'}
                    style={{ background: 'var(--bg-lighter)', color: summaryTopBottom === 'All' ? 'var(--text-muted)' : 'var(--text)', border: '1px solid var(--border-color)', padding: '0.4rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem', opacity: summaryTopBottom === 'All' ? 0.5 : 1 }}
                  >
                    <option value="earnedPremium">By Earned Premium</option>
                    <option value="unearnedPremium">By Unearned Premium</option>
                    <option value="dac">By DAC</option>
                    <option value="gwpYtd">By GWP YTD</option>
                  </select>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Class</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Earned Premium</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Unearned Premium</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>DAC</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>GWP YTD</th>
                  </tr>
                </thead>
                <tbody>
                  {processedSummary.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem', color: 'var(--text)', fontWeight: 500 }}>{row.class}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNum(row.earnedPremium)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNum(row.unearnedPremium)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNum(row.dac)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNum(row.gwpYtd)}</td>
                    </tr>
                  ))}
                  {processedSummary.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data matches current filters</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--primary)', fontWeight: 700, background: 'rgba(56, 189, 248, 0.04)' }}>
                    <td style={{ padding: '0.75rem', color: 'var(--text)', fontSize: '0.95rem' }}>TOTAL</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)' }}>{formatNum(processedSummary.reduce((s, r) => s + r.earnedPremium, 0))}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)' }}>{formatNum(processedSummary.reduce((s, r) => s + r.unearnedPremium, 0))}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)' }}>{formatNum(processedSummary.reduce((s, r) => s + r.dac, 0))}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)' }}>{formatNum(processedSummary.reduce((s, r) => s + r.gwpYtd, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Detail Tab */}
          {activeTab === 'detail' && (
            <div className="glass-panel" style={{ padding: '1.5rem', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
              {audit && audit.calculatedRows > audit.previewRows && (
                <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Showing the first {audit.previewRows.toLocaleString()} calculated rows to keep browser memory low. The Calculation CSV contains all {audit.calculatedRows.toLocaleString()} calculated rows.
                </p>
              )}
              {/* Search + Filter bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 280px', minWidth: '200px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search all columns..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setCurrentPage(0); }}
                    style={{
                      width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', borderRadius: '6px',
                      border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)',
                      fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {filteredDetail.length.toLocaleString()} / {detailRows.length.toLocaleString()} rows
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', width: '100%', minWidth: 0, padding: '0.85rem', marginBottom: '1rem', background: 'rgba(56, 189, 248, 0.04)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ flex: '1 1 170px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>Date field</label>
                  <select value={dateFilterField} onChange={e => { setDateFilterField(e.target.value as DateFilterField); setCurrentPage(0); }} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)' }}>
                    <option value="regDate">Registration date</option>
                    <option value="startDate">Policy start date</option>
                    <option value="endDate">Policy end date</option>
                  </select>
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>From</label>
                  <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(0); }} style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)' }} />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>To</label>
                  <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(0); }} style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)' }} />
                </div>
                <button className="btn-secondary" onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(0); }} disabled={!dateFrom && !dateTo} style={{ height: '37px' }}>Clear dates</button>
              </div>

              {/* Column filter inputs */}
              <details style={{ width: '100%', minWidth: 0, marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <summary style={{ cursor: 'pointer', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Column Filters
                </summary>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {DETAIL_COLUMNS.filter(col => !col.numeric && !col.key.toLowerCase().includes('date')).map(col => (
                    <div key={col.key} style={{ flex: '0 0 auto', minWidth: '130px' }}>
                      <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                        {col.label}
                      </label>
                      <input
                        type="text"
                        placeholder={`Filter ${col.label}...`}
                        value={columnFilters[col.key] || ''}
                        onChange={e => setColumnFilter(col.key, e.target.value)}
                        style={{
                          width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem',
                          border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)',
                          outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </details>

              {/* Data table */}
              <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', maxHeight: '600px', overflowY: 'auto', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: 'var(--bg-input)', borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>#</th>
                      {DETAIL_COLUMNS.map(col => (
                        <th key={col.key}
                            onClick={() => {
                              let direction: 'asc' | 'desc' = 'asc';
                              if (sortConfig && sortConfig.key === col.key && sortConfig.direction === 'asc') {
                                direction = 'desc';
                              }
                              setSortConfig({ key: col.key, direction });
                              setCurrentPage(0);
                            }}
                            style={{ 
                              cursor: 'pointer', userSelect: 'none',
                              padding: '0.5rem 0.6rem', textAlign: col.numeric ? 'right' : 'left', 
                              whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.7rem', 
                              textTransform: 'uppercase', letterSpacing: '0.05em', 
                              color: sortConfig?.key === col.key ? 'var(--primary)' : 'var(--text-muted)' 
                            }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: col.numeric ? 'flex-end' : 'flex-start' }}>
                            {col.label}
                            {sortConfig?.key === col.key && (
                              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={DETAIL_COLUMNS.length + 1} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No rows match your filters.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row, i) => (
                        <tr key={safePage * ROWS_PER_PAGE + i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            {safePage * ROWS_PER_PAGE + i + 1}
                          </td>
                          {DETAIL_COLUMNS.map(col => (
                            <td key={col.key} style={{
                              padding: '0.4rem 0.6rem',
                              textAlign: col.numeric ? 'right' : 'left',
                              fontFamily: col.numeric ? 'monospace' : 'inherit',
                              whiteSpace: 'nowrap',
                              color: 'var(--text)'
                            }}>
                              {col.numeric
                                ? (col.key === 'duration' || col.key === 'exposedDays' || col.key === 'unePeriod'
                                  ? formatInt(row[col.key])
                                  : formatNum(row[col.key]))
                                : (row[col.key] || '')}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {filteredDetail.length > ROWS_PER_PAGE && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  <button className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    disabled={safePage === 0} onClick={() => setCurrentPage(0)}>
                    First
                  </button>
                  <button className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    disabled={safePage === 0} onClick={() => setCurrentPage(safePage - 1)}>
                    ← Prev
                  </button>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>
                    Page {safePage + 1} of {totalPages.toLocaleString()}
                  </span>
                  <button className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    disabled={safePage >= totalPages - 1} onClick={() => setCurrentPage(safePage + 1)}>
                    Next →
                  </button>
                  <button className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    disabled={safePage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)}>
                    Last
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
