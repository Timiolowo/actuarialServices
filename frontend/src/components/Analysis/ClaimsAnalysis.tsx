import { useState, useEffect } from 'react';

interface ClaimsAnalysisProps {
  onBack: () => void;
}

export function ClaimsAnalysis({ onBack }: ClaimsAnalysisProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: number;
    if (isProcessing) {
      setProgress(0);
      interval = window.setInterval(() => {
        setProgress(p => Math.min(100, p + 10));
      }, 150);
    }
    return () => window.clearInterval(interval);
  }, [isProcessing]);

  const handleProcess = (bypass = false) => {
    if (!file && !bypass) return;
    if (bypass) setFile(new File([""], "sample_data.csv", { type: "text/csv" }));
    setIsProcessing(true);
    // Simulate processing delay
    setTimeout(() => {
      setIsProcessing(false);
      setHasResults(true);
    }, 1500);
  };

  return (
    <div className="container" style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
        <button className="btn-secondary" onClick={onBack} style={{ marginRight: '1.5rem', padding: '0.5rem 1rem' }}>
          ← Back to Hub
        </button>
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>Claims Analysis</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Analyze claims data, triangles, and perform projections</p>
        </div>
      </div>

      {isProcessing ? (
        <div className="glass-panel" style={{ padding: '5rem 2rem', textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="48" height="48" style={{ color: 'var(--primary)' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Processing Claims Data...</h2>
          <p style={{ color: 'var(--text-muted)' }}>Building development triangles and projecting ultimate losses.</p>
          <div style={{ marginTop: '1.5rem', fontFamily: 'monospace', fontSize: '1.5rem', color: 'var(--primary)', fontWeight: 'bold' }}>
            {progress}%
          </div>
          <div style={{ width: '100%', maxWidth: '300px', height: '4px', background: 'var(--border)', margin: '0.5rem auto 0 auto', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.15s linear' }} />
          </div>
        </div>
      ) : !hasResults ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '1rem' }}>Upload Claims Data</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem auto' }}>
            Please upload a CSV or Excel file containing your claims data (e.g. claim ID, date of loss, report date, paid amounts, outstanding).
          </p>
          
          <div className="upload-zone" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <label className="upload-label">
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    setHasResults(false);
                  }
                }}
                style={{ display: 'none' }}
              />
              <div className="upload-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="upload-text">
                {file ? (
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{file.name} selected</span>
                ) : (
                  <span><strong>Click to browse</strong> or drag file here</span>
                )}
              </div>
              <div className="upload-hint">Supports CSV and Excel files</div>
            </label>
          </div>

          {file ? (
            <div style={{ marginTop: '2rem' }}>
              <button 
                className="btn-primary" 
                style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}
                onClick={() => handleProcess()}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Process Claims Data'}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '2rem' }}>
              <button 
                className="btn-secondary" 
                style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
                onClick={() => handleProcess(true)}
                disabled={isProcessing}
              >
                {isProcessing ? 'Loading...' : 'View Sample Data'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Claims Triangle Preview (Dummy Data)</h2>
              <button className="btn-secondary" onClick={() => { setFile(null); setHasResults(false); }}>
                Start Over
              </button>
            </div>
            
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Accident Year</th>
                    <th colSpan={4} style={{ textAlign: 'center' }}>Development Year</th>
                  </tr>
                  <tr>
                    <th></th>
                    <th style={{ textAlign: 'right' }}>1</th>
                    <th style={{ textAlign: 'right' }}>2</th>
                    <th style={{ textAlign: 'right' }}>3</th>
                    <th style={{ textAlign: 'right' }}>4</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>2021</strong></td>
                    <td style={{ textAlign: 'right' }}>$1,000</td>
                    <td style={{ textAlign: 'right' }}>$2,500</td>
                    <td style={{ textAlign: 'right' }}>$3,200</td>
                    <td style={{ textAlign: 'right', color: 'var(--primary)' }}>$3,350</td>
                  </tr>
                  <tr>
                    <td><strong>2022</strong></td>
                    <td style={{ textAlign: 'right' }}>$1,200</td>
                    <td style={{ textAlign: 'right' }}>$2,800</td>
                    <td style={{ textAlign: 'right', color: 'var(--primary)' }}>$3,500</td>
                    <td style={{ textAlign: 'right', color: 'var(--border)' }}>-</td>
                  </tr>
                  <tr>
                    <td><strong>2023</strong></td>
                    <td style={{ textAlign: 'right' }}>$1,500</td>
                    <td style={{ textAlign: 'right', color: 'var(--primary)' }}>$3,100</td>
                    <td style={{ textAlign: 'right', color: 'var(--border)' }}>-</td>
                    <td style={{ textAlign: 'right', color: 'var(--border)' }}>-</td>
                  </tr>
                  <tr>
                    <td><strong>2024</strong></td>
                    <td style={{ textAlign: 'right', color: 'var(--primary)' }}>$1,800</td>
                    <td style={{ textAlign: 'right', color: 'var(--border)' }}>-</td>
                    <td style={{ textAlign: 'right', color: 'var(--border)' }}>-</td>
                    <td style={{ textAlign: 'right', color: 'var(--border)' }}>-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
