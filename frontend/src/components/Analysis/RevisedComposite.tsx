import { useState, useEffect } from 'react';

interface RevisedCompositeProps {
  onBack: () => void;
}

export function RevisedComposite({ onBack }: RevisedCompositeProps) {
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
    setTimeout(() => {
      setIsProcessing(false);
      setHasResults(true);
    }, 1500);
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

      {isProcessing ? (
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
      ) : !hasResults ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '1rem' }}>Upload Base Data</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem auto' }}>
            Upload the raw data required to generate the revised composite sheet.
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
                {isProcessing ? 'Generating...' : 'Generate Composite'}
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
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ marginBottom: '1.5rem', color: 'var(--success)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="64" height="64" style={{ margin: '0 auto' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.75rem' }}>Composite Sheet Generated!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>The revised composite sheet has been successfully generated.</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary" style={{ padding: '0.75rem 2rem' }}>
                Download Result (.xlsx)
              </button>
              <button className="btn-secondary" onClick={() => { setFile(null); setHasResults(false); }} style={{ padding: '0.75rem 2rem' }}>
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
