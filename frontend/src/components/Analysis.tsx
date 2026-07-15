import type { ProcessingSummary } from '../utils/processor';

interface AnalysisProps {
  processedData: ProcessingSummary | null;
}

export function Analysis({ processedData }: AnalysisProps) {
  if (!processedData) {
    return (
      <div className="container">
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Actuarial Analysis</h1>
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
    <div className="container">
      <div style={{ paddingTop: '1rem', marginBottom: '2.5rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Consolidated dataset dimensions and data-quality summary</p>
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
