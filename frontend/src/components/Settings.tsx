import React, { useState } from 'react';
import { GROUP1_SHEETS, GROUP2_SHEETS, GROUP3_SHEETS, GROUP4_SHEETS } from '../utils/processor';

interface SettingsProps {
  onBack: () => void;
}

type SettingsTab = 'general' | 'formulas' | 'assumptions' | 'mappings';

export const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [skipRows, setSkipRows] = useState<number>(8);
  const [numericThreshold, setNumericThreshold] = useState<number>(90);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Configuration saved locally (this is a preview mode configuration).');
  };

  const TabButton = ({ id, label }: { id: SettingsTab, label: string }) => (
    <button 
      onClick={() => setActiveTab(id)}
      style={{ 
        padding: '0.75rem 1.5rem', 
        background: 'none', 
        border: 'none', 
        borderBottom: activeTab === id ? '2px solid var(--primary)' : '2px solid transparent', 
        color: activeTab === id ? 'var(--primary)' : 'var(--text-muted)', 
        cursor: 'pointer', 
        fontWeight: activeTab === id ? 600 : 400, 
        transition: 'all 0.2s',
        fontSize: '1rem'
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="container" style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem' }}>App Configuration</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Configure actuarial formulas, data mappings, and general settings</p>
        </div>
        {onBack && (
          <button className="btn-secondary" onClick={onBack} style={{ padding: '0.5rem 1rem' }}>
            Back to Dashboard
          </button>
        )}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <TabButton id="general" label="General Setup" />
        <TabButton id="formulas" label="Formulas & Logic" />
        <TabButton id="assumptions" label="Actuarial Assumptions" />
        <TabButton id="mappings" label="Data Mappings" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {activeTab === 'general' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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
        )}

        {activeTab === 'formulas' && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ color: 'var(--primary)', marginBottom: '1rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="48" height="48" style={{ margin: '0 auto' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
              </svg>
            </div>
            <h2 style={{ marginBottom: '1rem' }}>Formulas & Logic Configuration</h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}>
              This section will allow you to edit the specific formulas and calculation logic that directly affect your numbers. The comprehensive formula editor will be available here once the calculations are provided.
            </p>
          </div>
        )}

        {activeTab === 'assumptions' && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ color: 'var(--secondary)', marginBottom: '1rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="48" height="48" style={{ margin: '0 auto' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
              </svg>
            </div>
            <h2 style={{ marginBottom: '1rem' }}>Actuarial Assumptions</h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}>
              Manage global variables, discount rates, risk margins, and baseline assumptions used across all modules.
            </p>
          </div>
        )}

        {activeTab === 'mappings' && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ color: 'var(--accent)', marginBottom: '1rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="48" height="48" style={{ margin: '0 auto' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </div>
            <h2 style={{ marginBottom: '1rem' }}>Data Mappings</h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}>
              Configure column mappings, overrides, and transformations for your imported datasets.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
