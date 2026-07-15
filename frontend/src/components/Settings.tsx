import React, { useState } from 'react';
import { GROUP1_SHEETS, GROUP2_SHEETS, GROUP3_SHEETS, GROUP4_SHEETS } from '../utils/processor';

interface SettingsProps {
  onBack: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [skipRows, setSkipRows] = useState<number>(8);
  const [numericThreshold, setNumericThreshold] = useState<number>(90);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Configuration saved locally (this is a preview mode configuration).');
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem' }}>App Configuration</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Configure Excel parsing guidelines and groupings</p>
        </div>
        <button className="btn-secondary" onClick={onBack} style={{ padding: '0.5rem 1rem' }}>
          Back to Dashboard
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Basic Configuration */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Parsing Settings</h3>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text)' }}>Header Row Index (Row skip count)</label>
                <input
                  type="number"
                  value={skipRows}
                  onChange={(e) => setSkipRows(Number(e.target.value))}
                  min="0"
                  max="50"
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    padding: '0.6rem 0.85rem',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Default is 8 (the 9th row in Excel contains headers, skipping the first 8 rows of metadata).
                </span>
              </div>

              <div style={{ flex: 1, minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text)' }}>Numeric Coercion Threshold (%)</label>
                <input
                  type="number"
                  value={numericThreshold}
                  onChange={(e) => setNumericThreshold(Number(e.target.value))}
                  min="10"
                  max="100"
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    padding: '0.6rem 0.85rem',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  If more than this percentage of a column consists of numbers, values will be parsed as numeric.
                </span>
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
              Save Settings
            </button>
          </form>
        </div>

        {/* Excel Groupings Info */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Sheet Groupings</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            <div>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group 1 (Consolidation)</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Sheets merged row-by-row across uploaded files.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {GROUP1_SHEETS.map(s => (
                  <span key={s} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{s}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group 2 (CLO Clone)</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Cloned from CF_T1_PVFC_LIC_CLO_FADJ_PY.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {GROUP2_SHEETS.map(s => (
                  <span key={s} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{s}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--accent)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group 3 (OP Clone)</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Cloned from CF_T1_PVFC_LIC_OP.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {GROUP3_SHEETS.map(s => (
                  <span key={s} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{s}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.95rem', color: '#f59e0b', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group 4 (TEXPVAR Clone)</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Cloned from CF_T1_PVFC_LIC_TEXPVAR_PY.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {GROUP4_SHEETS.map(s => (
                  <span key={s} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
