import { lazy, Suspense, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { CombineSheet } from './components/CombineSheet';
import { DataProcessing } from './components/DataProcessing/index';
import { Analysis } from './components/Analysis';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HowToUse } from './components/HowToUse';
import { History } from './components/History';
import { useActuarialProcessor } from './hooks/useActuarialProcessor';
import './App.css';

const PORTFOLIO_TITLES: Record<string, string> = {
  'group-life': 'Group Life',
  'individual-life': 'Individual Life',
  'health': 'Health Care',
  'pc': 'Property & Casualty'
};

type ActiveTab = 'combine' | 'preview' | 'history' | 'analysis' | 'settings';

const TAB_PATHS: Record<ActiveTab, string> = {
  combine: 'combine',
  preview: 'data-processing',
  history: 'history',
  analysis: 'analysis',
  settings: 'settings'
};

const PATH_TABS: Record<string, ActiveTab> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as ActiveTab])
);

const HelpDesk = lazy(() => import('./components/HelpDesk').then(module => ({ default: module.HelpDesk })));

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const location = useLocation();
  const navigate = useNavigate();

  const [, portfolioIdFromPath, sectionFromPath] = location.pathname.split('/');
  const activePortfolioId = PORTFOLIO_TITLES[portfolioIdFromPath]
    ? portfolioIdFromPath
    : null;
  const activeTab = PATH_TABS[sectionFromPath] ?? 'combine';

  const {
    step,
    setStep,
    processingDuration,
    lobFiles,
    setLobFiles,
    reinsuranceFiles,
    setReinsuranceFiles,
    isProcessing,
    progressPercent,
    currentStatus,
    logs,
    processedData,
    downloadUrl,
    handleClear,
    handleProcessFiles
  } = useActuarialProcessor();

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  };

  const handleSelectPortfolio = (portfolioId: string) => {
    handleClear();
    navigate(`/${portfolioId}/${TAB_PATHS.combine}`);
  };

  const handleSelectTab = (tab: ActiveTab) => {
    if (!activePortfolioId) return;
    navigate(`/${activePortfolioId}/${TAB_PATHS[tab]}`);
  };

  const handleExitPortfolio = () => {
    handleClear();
    navigate('/');
  };

  const currentPortfolioTitle = activePortfolioId ? PORTFOLIO_TITLES[activePortfolioId] : null;

  return (
    <div className="app-layout">
      {/* Sidebar - Only rendered when a portfolio is active */}
      {activePortfolioId && currentPortfolioTitle && (
        <Sidebar
          portfolioTitle={currentPortfolioTitle}
          activeTab={activeTab}
          setActiveTab={handleSelectTab}
          hasProcessedData={!!processedData}
          handleExitPortfolio={handleExitPortfolio}
        />
      )}

      {/* Main Content Viewport */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Global Header */}
        <Header
          activePortfolioId={activePortfolioId}
          portfolioTitle={currentPortfolioTitle}
          activeTab={activeTab}
          theme={theme}
          toggleTheme={toggleTheme}
          handleExitPortfolio={handleExitPortfolio}
        />

        {/* Render Active Tab */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<LandingPage onSelectPortfolio={handleSelectPortfolio} />} />
            <Route path="/how-to-use" element={<HowToUse />} />
            <Route
              path="/help-desk"
              element={(
                <Suspense fallback={<div className="container">Loading Help Desk…</div>}>
                  <HelpDesk />
                </Suspense>
              )}
            />
            <Route
              path="/:portfolioId/combine"
              element={activePortfolioId ? (
                <CombineSheet
                  portfolioTitle={currentPortfolioTitle || ''}
                  step={step}
                  setStep={setStep}
                  processingDuration={processingDuration}
                  lobFiles={lobFiles}
                  setLobFiles={setLobFiles}
                  reinsuranceFiles={reinsuranceFiles}
                  setReinsuranceFiles={setReinsuranceFiles}
                  isProcessing={isProcessing}
                  progressPercent={progressPercent}
                  currentStatus={currentStatus}
                  logs={logs}
                  processingSummary={processedData}
                  downloadUrl={downloadUrl}
                  handleProcessFiles={() => handleProcessFiles(currentPortfolioTitle || '', activePortfolioId)}
                  handleClear={handleClear}
                />
              ) : <Navigate to="/" replace />}
            />
            <Route
              path="/:portfolioId/data-processing"
              element={activePortfolioId
                ? <DataProcessing portfolioId={activePortfolioId} />
                : <Navigate to="/" replace />}
            />
            <Route
              path="/:portfolioId/history"
              element={activePortfolioId
                ? <History portfolioId={activePortfolioId} />
                : <Navigate to="/" replace />}
            />
            <Route
              path="/:portfolioId/analysis"
              element={activePortfolioId
                ? <Analysis portfolioId={activePortfolioId} />
                : <Navigate to="/" replace />}
            />
            <Route
              path="/:portfolioId/settings"
              element={activePortfolioId
                ? <Settings onBack={() => handleSelectTab('combine')} />
                : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Footer — landing page only */}
        {!activePortfolioId && <Footer />}
      </div>
    </div>
  );
}

export default App;
