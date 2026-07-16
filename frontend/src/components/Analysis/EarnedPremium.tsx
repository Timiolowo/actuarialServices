import { useState, useEffect, useRef, useMemo } from 'react';
import EpWorker from '../../workers/earnedPremium.worker?worker';

interface EarnedPremiumProps {
  onBack: () => void;
}

type ViewTab = 'summary' | 'detail';

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

  const [file, setFile] = useState<File | null>(null);
  const [valStart, setValStart] = useState(defStart);
  const [valEnd, setValEnd] = useState(defEnd);

  const [isProcessing, setIsProcessing] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // View state
  const [activeTab, setActiveTab] = useState<ViewTab>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(0);

  // Drag state
  const [dragActive, setDragActive] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const handleDrag = (e: React.DragEvent, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(active);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setHasResults(false);
      setErrorMsg('');
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(0);
    setStatusMsg('Loading template...');
    setErrorMsg('');
    setResultBlob(null);

    try {
      const templateRes = await fetch('https://raw.githubusercontent.com/Timiolowo/actuarialServices/main/frontend/public/templates/Earned%20Premium%20Data.xlsx');
      if (!templateRes.ok) throw new Error('Could not load Excel template from server.');
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
          setResultBlob(data.blob);
          if (data.summary) setSummaryData(data.summary);
          if (data.detailRows) setDetailRows(data.detailRows);
          setCurrentPage(0);
          setSearchQuery('');
          setColumnFilters({});
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
        file,
        valStartStr: valStart,
        valEndStr: valEnd,
        templateBuffer
      });
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMsg(err.message || 'An error occurred');
    }
  };

  const downloadResult = () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Earned_Premium_${valEnd}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

    return data;
  }, [detailRows, searchQuery, columnFilters]);

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
        <div className="glass-panel status-panel" style={{ padding: '4rem 2rem', textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: '64px', height: '64px' }}>
              <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="64" height="64" style={{ color: 'var(--primary)' }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.15 }}></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)' }}>
                {Math.round(progress)}%
              </div>
            </div>
          </div>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 600 }}>{statusMsg || 'Calculating...'}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>Applying actuarial methodologies to massive datasets locally without uploading to a server.</p>
          <div className="progress-bar-container" style={{ height: '6px', margin: '2rem auto 0 auto', maxWidth: '400px' }}>
            <div className="progress-bar-fill" style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', borderRadius: '9999px', transition: 'width 0.25s ease-out' }}></div>
          </div>
        </div>
      ) : !hasResults ? (
        <>
          <div className="glass-panel" style={{ padding: '2.5rem' }}>
            {/* Parameters Section */}
            <div style={{ marginBottom: '3rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--primary)" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                Valuation Parameters
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Valuation Start Date</label>
                  <input type="date" value={valStart} onChange={e => setValStart(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Valuation End Date</label>
                  <input type="date" value={valEnd} onChange={e => setValEnd(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'} />
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
                <input type="file" ref={fileInputRef} accept=".csv,.parquet,.xlsx,.xls"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setHasResults(false); setErrorMsg(''); } e.target.value = ''; }}
                  style={{ display: 'none' }} />
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--primary)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="22" height="22">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                </div>
                {file ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>{file.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <button type="button" className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }} onClick={(e) => { e.stopPropagation(); setFile(null); }}>Remove</button>
                  </div>
                ) : (
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--text)' }}><strong>Click to browse</strong> or drag file here</p>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Supports .parquet, .csv, and .xlsx</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="glass-panel action-bar">
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600 }}
                onClick={handleProcess} disabled={isProcessing || !file}>
                Calculate Earned Premium
              </button>
              <button className="btn-secondary" onClick={() => { setFile(null); setValStart(defStart); setValEnd(defEnd); }}
                disabled={isProcessing || !file}>
                Clear
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          {/* Success Header */}
          <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" width="32" height="32">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            </div>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 600 }}>Calculation Complete!</h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto 1.5rem auto', lineHeight: 1.6 }}>
              {detailRows.length.toLocaleString()} rows processed. Your summary and detailed sheets have been injected into the Earned Premium Template.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-secondary" onClick={() => { setFile(null); setHasResults(false); }}>Start Over</button>
              <button className="btn-primary" onClick={downloadResult} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Earned Premium Report
              </button>
            </div>
          </div>

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
              Detail ({detailRows.length.toLocaleString()})
            </button>
          </div>

          {/* Summary Tab */}
          {activeTab === 'summary' && summaryData.length > 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text)' }}>Summary by Class</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Class</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Earned Premium</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Unearned Premium</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>DAC</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>GWP YTD</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', borderLeft: '2px solid var(--primary)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryData.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem', color: 'var(--text)', fontWeight: 500 }}>{row.class}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNum(row.earnedPremium)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNum(row.unearnedPremium)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNum(row.dac)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatNum(row.gwpYtd)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', borderLeft: '2px solid var(--primary)', fontWeight: 700, color: 'var(--primary)' }}>{formatNum(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--primary)', fontWeight: 700, background: 'rgba(56, 189, 248, 0.04)' }}>
                    <td style={{ padding: '0.75rem', color: 'var(--text)', fontSize: '0.95rem' }}>TOTAL</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)' }}>{formatNum(summaryData.reduce((s, r) => s + r.earnedPremium, 0))}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)' }}>{formatNum(summaryData.reduce((s, r) => s + r.unearnedPremium, 0))}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)' }}>{formatNum(summaryData.reduce((s, r) => s + r.dac, 0))}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)' }}>{formatNum(summaryData.reduce((s, r) => s + r.gwpYtd, 0))}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', borderLeft: '2px solid var(--primary)', color: 'var(--primary)', fontSize: '0.95rem' }}>{formatNum(summaryData.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Detail Tab */}
          {activeTab === 'detail' && (
            <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
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
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                  {filteredDetail.length.toLocaleString()} / {detailRows.length.toLocaleString()} rows
                </span>
              </div>

              {/* Column filter inputs */}
              <details style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <summary style={{ cursor: 'pointer', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Column Filters
                </summary>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {DETAIL_COLUMNS.map(col => (
                    <div key={col.key} style={{ flex: '0 0 auto', minWidth: '130px' }}>
                      <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                        {col.label}
                      </label>
                      <input
                        type="text"
                        placeholder="Filter..."
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
              <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: 'var(--bg-input)', borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>#</th>
                      {DETAIL_COLUMNS.map(col => (
                        <th key={col.key} style={{ padding: '0.5rem 0.6rem', textAlign: col.numeric ? 'right' : 'left', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                          {col.label}
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
