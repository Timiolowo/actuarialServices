import { useState } from 'react';
import type { ProcessingSummary } from '../../utils/processor';
import { EarnedPremium } from './EarnedPremium';
import { ClaimsAnalysis } from './ClaimsAnalysis';
import { RevisedComposite } from './RevisedComposite';
import { AlmCashflow } from './AlmCashflow';
import { PmpMonitoring } from './PmpMonitoring';
import { Reserving } from './Reserving';

interface AnalysisProps {
  processedData: ProcessingSummary | null;
}

type AnalysisModule = 'hub' | 'earned-premium' | 'claims' | 'summary' | 'revised-composite' | 'alm-cashflow' | 'pmp-monitoring' | 'reserving';

export function Analysis({ processedData }: AnalysisProps) {
  const [activeModule, setActiveModule] = useState<AnalysisModule>('hub');

  const handleBackToHub = () => setActiveModule('hub');

  if (activeModule === 'earned-premium') {
    return <EarnedPremium onBack={handleBackToHub} />;
  }

  if (activeModule === 'claims') {
    return <ClaimsAnalysis onBack={handleBackToHub} />;
  }

  if (activeModule === 'revised-composite') {
    return <RevisedComposite onBack={handleBackToHub} />;
  }

  if (activeModule === 'alm-cashflow') {
    return <AlmCashflow onBack={handleBackToHub} />;
  }

  if (activeModule === 'pmp-monitoring') {
    return <PmpMonitoring onBack={handleBackToHub} />;
  }

  if (activeModule === 'reserving') {
    return <Reserving onBack={handleBackToHub} />;
  }

  if (activeModule === 'summary') {
    if (!processedData) {
      return (
        <div className="container" style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
            <button className="btn-secondary" onClick={handleBackToHub} style={{ marginRight: '1.5rem', padding: '0.5rem 1rem' }}>
              ← Back to Hub
            </button>
            <div>
              <h1 style={{ fontSize: '2rem', margin: 0 }}>Data Summary</h1>
            </div>
          </div>
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>No Consolidated Data Available</h3>
            <p style={{ marginTop: '0.5rem' }}>Process the workbooks under Combine Sheet first.</p>
          </div>
        </div>
      );
    }

    const sheetStats = Object.entries(processedData.sheets).map(([sheetName, stats]) => ({ sheetName, ...stats }));
    const populatedSheets = sheetStats.filter(sheet => sheet.rowCount > 0);
    const highestVolumeSheet = populatedSheets.reduce(
      (highest, current) => current.rowCount > highest.rowCount ? current : highest,
      { sheetName: 'N/A', rowCount: 0, columnCount: 0, emptyCells: 0, totalCells: 0, sourceFileCount: 0 }
    );
    const totalCells = sheetStats.reduce((sum, sheet) => sum + sheet.totalCells, 0);
    const emptyCells = sheetStats.reduce((sum, sheet) => sum + sheet.emptyCells, 0);
    const overallDensity = totalCells > 0 ? ((totalCells - emptyCells) / totalCells) * 100 : 0;

    return (
      <div className="container" style={{ animation: 'fadeIn 0.4s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
          <button className="btn-secondary" onClick={handleBackToHub} style={{ marginRight: '1.5rem', padding: '0.5rem 1rem' }}>
            ← Back to Hub
          </button>
          <div>
            <h1 style={{ fontSize: '2rem', margin: 0 }}>Combine Sheet Summary</h1>
            <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Consolidated dataset dimensions and data-quality summary</p>
          </div>
        </div>

        <div className="analysis-overview">
          <div className="glass-panel metric-card">
            <span className="metric-label">Total Records Merged</span>
            <span className="metric-value">{processedData.totalRows.toLocaleString()}</span>
            <span className="metric-caption">Across {processedData.sheetCount} generated sheets</span>
          </div>
          <div className="glass-panel metric-card">
            <span className="metric-label">Highest Volume Sheet</span>
            <span className="metric-name" title={highestVolumeSheet.sheetName}>{highestVolumeSheet.sheetName}</span>
            <span className="metric-caption">{highestVolumeSheet.rowCount.toLocaleString()} rows</span>
          </div>
          <div className="glass-panel metric-card">
            <span className="metric-label">Average Data Density</span>
            <span className="metric-value metric-value-secondary">{overallDensity.toFixed(1)}%</span>
            <span className="metric-caption">{processedData.populatedSheetCount} populated sheets</span>
          </div>
        </div>

        <h2 style={{ fontSize: '1.4rem', marginBottom: '1.25rem' }}>Worksheet Dimensions &amp; Quality</h2>
        <div className="sheet-summary-list">
          {populatedSheets.map(sheet => {
            const density = sheet.totalCells > 0 ? ((sheet.totalCells - sheet.emptyCells) / sheet.totalCells) * 100 : 0;
            return (
              <div key={sheet.sheetName} className="glass-panel sheet-summary-card">
                <div className="sheet-summary-heading">
                  <h3>{sheet.sheetName}</h3>
                  <div className="sheet-summary-counts">
                    <span>Rows: <strong>{sheet.rowCount.toLocaleString()}</strong></span>
                    <span>Columns: <strong>{sheet.columnCount.toLocaleString()}</strong></span>
                    <span>Source files: <strong>{sheet.sourceFileCount}</strong></span>
                  </div>
                </div>
                <div className="density-heading">
                  <span>Data Density Check</span>
                  <strong>{density.toFixed(1)}% Non-Empty</strong>
                </div>
                <div className="density-track">
                  <div className="density-fill" style={{ width: `${density}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Hub View
  return (
    <div className="container" style={{ animation: 'fadeIn 0.4s ease-out', paddingTop: '1.75rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', fontWeight: 600 }}>Analysis Hub</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Select a module below to perform actuarial calculations and analysis.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
        
        <div 
          className="glass-panel analysis-module-card" 
          onClick={() => setActiveModule('earned-premium')}
          style={{ cursor: 'pointer', padding: '1.5rem', transition: 'all 0.2s', border: '1px solid transparent' }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '0.9rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', color: 'var(--primary)' }}>Earned Premium</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.85rem' }}>
            Upload policy data to calculate earned premium using standard actuarial methodologies.
          </p>
        </div>

        <div 
          className="glass-panel analysis-module-card" 
          onClick={() => setActiveModule('claims')}
          style={{ cursor: 'pointer', padding: '1.5rem', transition: 'all 0.2s', border: '1px solid transparent' }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '0.9rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', color: 'var(--primary)' }}>Claims Analysis</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.85rem' }}>
            Analyze claims data, build development triangles, and perform LDF projections.
          </p>
        </div>

        <div 
          className="glass-panel analysis-module-card" 
          onClick={() => setActiveModule('summary')}
          style={{ cursor: 'pointer', padding: '1.5rem', transition: 'all 0.2s', border: '1px solid transparent' }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '0.9rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', color: 'var(--primary)' }}>Combine Sheet Summary</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.85rem' }}>
            View the dimensions and data-quality summary of the consolidated dataset.
          </p>
        </div>

        <div 
          className="glass-panel analysis-module-card" 
          onClick={() => setActiveModule('revised-composite')}
          style={{ cursor: 'pointer', padding: '1.5rem', transition: 'all 0.2s', border: '1px solid transparent' }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </div>
          <h3 style={{ fontSize: '0.9rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', color: 'var(--primary)' }}>Revised Composite</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.85rem' }}>
            Generate a revised composite sheet from base actuarial data seamlessly.
          </p>
        </div>

        <div 
          className="glass-panel analysis-module-card" 
          onClick={() => setActiveModule('alm-cashflow')}
          style={{ cursor: 'pointer', padding: '1.5rem', transition: 'all 0.2s', border: '1px solid transparent' }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '0.9rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', color: 'var(--primary)' }}>ALM Cashflow</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.85rem' }}>
            Asset Liability Management and cashflow projections.
          </p>
        </div>

        <div 
          className="glass-panel analysis-module-card" 
          onClick={() => setActiveModule('pmp-monitoring')}
          style={{ cursor: 'pointer', padding: '1.5rem', transition: 'all 0.2s', border: '1px solid transparent' }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '0.9rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', color: 'var(--primary)' }}>PMP Monitoring</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.85rem' }}>
            Per Member Per Month (PMPM) and Portfolio Monitoring.
          </p>
        </div>

        <div 
          className="glass-panel analysis-module-card" 
          onClick={() => setActiveModule('reserving')}
          style={{ cursor: 'pointer', padding: '1.5rem', transition: 'all 0.2s', border: '1px solid transparent' }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--primary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '0.9rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', color: 'var(--primary)' }}>Reserving</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.85rem' }}>
            Calculate IBNR and assess total reserve adequacy.
          </p>
        </div>

        {/* Placeholder for future modules */}
        <div 
          className="glass-panel analysis-module-card" 
          style={{ padding: '1.5rem', opacity: 0.6, border: '1px dashed var(--border)' }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="32" height="32" style={{ color: 'var(--text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a1.5 1.5 0 01-1.5 1.5H6a1.5 1.5 0 00-1.5 1.5v2.625c0 .355-.186.676-.401.959-.221.29-.349.634-.349 1.003 0 1.036 1.007 1.875 2.25 1.875s2.25-.84 2.25-1.875c0-.369-.128-.713-.349-1.003-.215-.283-.401-.604-.401-.959v0c0-.828.672-1.5 1.5-1.5h2.625a1.5 1.5 0 011.5 1.5v2.625c0 .355-.186.676-.401.959-.221.29-.349.634-.349 1.003 0 1.036 1.007 1.875 2.25 1.875s2.25-.84 2.25-1.875c0-.369-.128-.713-.349-1.003-.215-.283-.401-.604-.401-.959v0a1.5 1.5 0 01-1.5-1.5H18a1.5 1.5 0 001.5-1.5v-2.625c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0c0 .828-.672 1.5-1.5 1.5h-2.625a1.5 1.5 0 01-1.5-1.5v-2.625z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '0.9rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>More Modules</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.85rem' }}>
            Pricing engines, experience studies, and other custom actuarial modules coming soon.
          </p>
        </div>

      </div>
    </div>
  );
}
