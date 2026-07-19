import React, { useState } from 'react';
import { GROUP1_SHEETS, GROUP2_SHEETS, GROUP3_SHEETS, GROUP4_SHEETS } from '../utils/processor';
import { CALCULATION_METHODOLOGIES } from '../config/calculationMethodologies';

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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Review calculation methodologies, data mappings, and general settings</p>
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
          <div style={{ animation: 'fadeIn 0.3s ease-out', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {CALCULATION_METHODOLOGIES.map(methodology => (
              <section key={methodology.id} className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  <div>
                    <div style={{ color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>P&amp;C Analysis Methodology</div>
                    <h2 style={{ margin: '0 0 0.5rem 0' }}>{methodology.name}</h2>
                    <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: '760px', lineHeight: 1.6 }}>{methodology.description}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ padding: '0.35rem 0.65rem', borderRadius: '999px', border: '1px solid rgba(56, 189, 248, 0.35)', background: 'rgba(56, 189, 248, 0.08)', color: 'var(--primary)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Read only</span>
                    <span style={{ padding: '0.35rem 0.65rem', borderRadius: '999px', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'monospace' }}>v{methodology.version}</span>
                  </div>
                </div>

                <div style={{ padding: '0.85rem 1rem', marginBottom: '1.5rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.06)', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
                  This documents the formula logic currently used by the Earned Premium calculation. Nothing on this page can change calculation results yet.
                </div>

                <h3 style={{ fontSize: '1rem', margin: '0 0 0.9rem 0' }}>Calculation sequence</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.85rem', marginBottom: '1.75rem' }}>
                  {methodology.formulas.map((formula, index) => (
                    <article key={formula.name} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '9px', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ display: 'inline-flex', width: '24px', height: '24px', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'rgba(56, 189, 248, 0.1)', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700 }}>{index + 1}</span>
                          <h4 style={{ margin: 0, fontSize: '0.9rem' }}>{formula.name}</h4>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.68rem', textTransform: 'uppercase' }}>{formula.output}</span>
                      </div>
                      <code style={{ display: 'block', padding: '0.75rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--primary)', fontSize: '0.78rem', lineHeight: 1.55, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{formula.formula}</code>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.55, margin: '0.7rem 0 0 0' }}>{formula.description}</p>
                    </article>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ padding: '1rem', borderRadius: '9px', border: '1px solid var(--border-color)' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--primary)', margin: '0 0 0.75rem 0' }}>Methodology rules</h3>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.7 }}>
                      {methodology.rules.map(rule => <li key={rule}>{rule}</li>)}
                    </ul>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '9px', border: '1px solid var(--border-color)' }}>
                    <h3 style={{ fontSize: '0.9rem', color: '#f59e0b', margin: '0 0 0.75rem 0' }}>Validation and exclusions</h3>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.7 }}>
                      {methodology.validations.map(rule => <li key={rule}>{rule}</li>)}
                    </ul>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '9px', border: '1px solid var(--border-color)' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--secondary)', margin: '0 0 0.75rem 0' }}>Required source fields</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {methodology.requiredInputs.map(input => <code key={input} style={{ padding: '0.3rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text)', fontSize: '0.7rem' }}>{input}</code>)}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.55rem' }}>Calculated outputs</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {methodology.outputs.map(output => <span key={output} style={{ padding: '0.3rem 0.55rem', borderRadius: '999px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)', color: '#22c55e', fontSize: '0.72rem' }}>{output}</span>)}
                  </div>
                </div>
              </section>
            ))}

            <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
              Additional modules—including Revised Composite—can be added here as separate methodology sections without changing the Earned Premium documentation.
            </div>
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
