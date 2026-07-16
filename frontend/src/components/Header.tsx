import React from 'react';

interface HeaderProps {
  activePortfolioId: string | null;
  portfolioTitle: string | null;
  activeTab: 'combine' | 'preview' | 'history' | 'analysis' | 'settings';
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  handleExitPortfolio: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activePortfolioId,
  portfolioTitle,
  activeTab,
  theme,
  toggleTheme,
  handleExitPortfolio
}) => {
  const pageTitle = activeTab === 'preview'
    ? 'Data Processing'
    : activeTab === 'history'
      ? 'History'
    : activeTab === 'analysis'
      ? 'Analysis'
      : activeTab === 'settings'
        ? 'Configuration'
        : null;
  const previewNavTitle = pageTitle && portfolioTitle
    ? `${pageTitle} / ${portfolioTitle}`
    : pageTitle;

  return (
    <header className="app-header">
      {activePortfolioId && portfolioTitle ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'preview' ? (
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
              {previewNavTitle}
            </span>
          ) : (
            <>
              <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                {portfolioTitle}
              </span>
              {pageTitle && (
                <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text)', marginTop: '0.15rem', fontFamily: 'var(--font-heading)' }}>
                  {pageTitle}
                </h1>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem', fontWeight: '600', fontFamily: 'var(--font-heading)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" width="20" height="20" style={{ color: 'var(--primary)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
          </svg>
          Actuarial Services Portal
        </div>
      )}
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="btn-secondary"
          style={{
            padding: '0.5rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-color)',
            cursor: 'pointer'
          }}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            // Sun Icon (Switch to Light)
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m0 13.5V21M5.25 12H3m18 0h-2.25m-14.25-6.75 1.59 1.59M18.75 18.75l-1.59-1.59M4.5 19.5l1.59-1.59M19.5 4.5l-1.59 1.59M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
            </svg>
          ) : (
            // Moon Icon (Switch to Dark)
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          )}
        </button>

        {activePortfolioId && (
          <button className="btn-secondary" onClick={handleExitPortfolio} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            Switch Portfolio
          </button>
        )}


      </div>
    </header>
  );
};
