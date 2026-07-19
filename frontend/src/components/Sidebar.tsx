import React, { useState } from 'react';

interface SidebarProps {
  portfolioTitle: string;
  activeTab: 'combine' | 'preview' | 'history' | 'analysis' | 'settings';
  setActiveTab: (tab: 'combine' | 'preview' | 'history' | 'analysis' | 'settings') => void;
  hasProcessedData: boolean;
  handleExitPortfolio: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  portfolioTitle: _portfolioTitle,
  activeTab,
  setActiveTab,
  handleExitPortfolio
}) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('actuarial-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed(current => {
      const next = !current;
      try {
        window.localStorage.setItem('actuarial-sidebar-collapsed', String(next));
      } catch {
        // The sidebar still works when browser storage is unavailable.
      }
      return next;
    });
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Branding Header */}
      <div className="sidebar-brand-row">
        <div className="sidebar-brand" title={isCollapsed ? 'Actuarial Console' : undefined}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" width="22" height="22" style={{ color: 'var(--primary)', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
          </svg>
          <h2 className="sidebar-brand-text">Actuarial Console</h2>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" width="17" height="17">
            <path strokeLinecap="round" strokeLinejoin="round" d={isCollapsed ? 'm9 5 7 7-7 7' : 'm15 19-7-7 7-7'} />
          </svg>
        </button>
      </div>

      {/* Sidebar Menu */}
      <div className="nav-section">
        <div className="nav-title">Operations</div>
        <ul className="nav-list">
          <li>
            <button
              className={`nav-link ${activeTab === 'combine' ? 'active' : ''}`}
              onClick={() => setActiveTab('combine')}
              title={isCollapsed ? 'Combine Sheet' : undefined}
              aria-label="Combine Sheet"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
              </svg>
              <span className="nav-label">Combine Sheet</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-link ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
              title={isCollapsed ? 'Data Processing' : undefined}
              aria-label="Data Processing"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
              </svg>
              <span className="nav-label">Data Processing</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-link ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
              title={isCollapsed ? 'History' : undefined}
              aria-label="History"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-3.75-7.31M21 3v6h-6" />
              </svg>
              <span className="nav-label">History</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-link ${activeTab === 'analysis' ? 'active' : ''}`}
              onClick={() => setActiveTab('analysis')}
              title={isCollapsed ? 'Analysis' : undefined}
              aria-label="Analysis"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
              </svg>
              <span className="nav-label">Analysis</span>
            </button>
          </li>
        </ul>
      </div>

      <div className="nav-section">
        <div className="nav-title">System</div>
        <ul className="nav-list">
          <li>
            <button
              className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              title={isCollapsed ? 'Configuration' : undefined}
              aria-label="Configuration"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              <span className="nav-label">Configuration</span>
            </button>
          </li>
        </ul>
      </div>

      {/* Switch Portfolio back to landing */}
      <div className="nav-section" style={{ marginTop: 'auto' }}>
        <ul className="nav-list">
          <li>
            <button
              className="nav-link"
              onClick={handleExitPortfolio}
              title={isCollapsed ? 'Exit Portfolio' : undefined}
              aria-label="Exit Portfolio"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
              <span className="nav-label">Exit Portfolio</span>
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
};
