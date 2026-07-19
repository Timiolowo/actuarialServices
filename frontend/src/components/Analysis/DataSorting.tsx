import { useState } from 'react';

interface DataSortingProps {
  onBack: () => void;
}

export function DataSorting({ onBack }: DataSortingProps) {
  const [finconFile, setFinconFile] = useState<File | null>(null);
  const [currentMonthFile, setCurrentMonthFile] = useState<File | null>(null);
  const [previousMonthFile, setPreviousMonthFile] = useState<File | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [summary, setSummary] = useState<any>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);

  const handleProcess = async () => {
    if (!finconFile || !currentMonthFile || !previousMonthFile) {
      setError('Please upload all three required files before processing.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSummary(null);
    setDownloadId(null);

    const formData = new FormData();
    formData.append('fincon', finconFile);
    formData.append('currentMonth', currentMonthFile);
    formData.append('previousMonth', previousMonthFile);

    try {
      const response = await fetch('http://localhost:3001/api/process/data-sorting', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      setSummary(data.summary);
      setDownloadId(data.downloadId);
    } catch (err: any) {
      setError(err.message || 'An error occurred during processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (downloadId) {
      window.location.href = `http://localhost:3001/api/process/download-data-sorting/${downloadId}`;
    }
  };

  return (
    <div className="container" style={{ animation: 'fadeIn 0.4s ease-out', paddingTop: '1.75rem', paddingBottom: '3rem' }}>
      
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <button className="btn-secondary" onClick={onBack} style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Analysis Hub
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>/</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text)' }}>Data Sorting</span>
      </div>

      <p style={{ fontFamily: 'monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
        Upload and process the <strong style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Fincon & Production Reports</strong> to generate sorted data.
      </p>

      {!summary ? (
        <div className="glass-panel" style={{ padding: '2.5rem', animation: 'fadeIn 0.3s ease-out' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Upload Required Data Files</h2>

          <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>1. Current Month Production Report (CSV)</label>
              <input 
                type="file" 
                accept=".csv"
                onChange={e => setCurrentMonthFile(e.target.files?.[0] || null)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>2. Previous Month Production Report (CSV)</label>
              <input 
                type="file" 
                accept=".csv"
                onChange={e => setPreviousMonthFile(e.target.files?.[0] || null)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>3. Fincon Report (Excel)</label>
              <input 
                type="file" 
                accept=".xlsx,.xlsb,.xls"
                onChange={e => setFinconFile(e.target.files?.[0] || null)}
                style={{ width: '100%' }}
              />
            </div>
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
              disabled={isProcessing || !finconFile || !currentMonthFile || !previousMonthFile}
              style={{ 
                padding: '0.75rem 2rem', 
                borderRadius: '50px',
                opacity: (isProcessing || !finconFile || !currentMonthFile || !previousMonthFile) ? 0.5 : 1
              }}
            >
              {isProcessing ? 'Processing...' : 'Process Data Sorting'}
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
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Data Sorted Successfully!</h2>
            <p style={{ color: 'var(--text-muted)' }}>The data has been sorted into the template and is ready for download.</p>
          </div>

          {summary.hasDiscrepancies && (
            <div style={{ marginTop: '2rem', marginBottom: '2.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--danger)' }}>Premium Discrepancies Detected</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Total Discrepancy Amount: <strong>{summary.totalDiscrepancyAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </p>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'var(--bg-body)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                  <thead style={{ background: 'var(--bg-surface)' }}>
                    <tr>
                      <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem' }}>Month</th>
                      <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, textAlign: 'right', fontSize: '0.85rem' }}>Previous Premium</th>
                      <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, textAlign: 'right', fontSize: '0.85rem' }}>Current Premium</th>
                      <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, textAlign: 'right', fontSize: '0.85rem' }}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.discrepancies.map((item: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{item.month}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {item.previousPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {item.currentPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: 'var(--danger)', fontSize: '0.85rem' }}>
                          {item.difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!summary.hasDiscrepancies && (
            <div style={{ marginTop: '2rem', marginBottom: '2.5rem', textAlign: 'center', padding: '1rem', background: 'rgba(34, 197, 94, 0.05)', borderRadius: '8px' }}>
              <p style={{ color: '#22c55e', margin: 0, fontWeight: 500 }}>No premium discrepancies found between the months!</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
            <button 
              className="btn-primary" 
              onClick={handleDownload}
              style={{ 
                padding: '0.75rem 2.5rem', 
                borderRadius: '50px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download {summary.fileName || 'Data Sorting.xlsx'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
