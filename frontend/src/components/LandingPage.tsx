import React from 'react';

interface Portfolio {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface LandingPageProps {
  onSelectPortfolio: (portfolioId: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSelectPortfolio }) => {
  const portfolios: Portfolio[] = [
    {
      id: 'group-life',
      title: 'Group Life',
      description: 'Reserving, AOM impact, and cashflow consolidation for employee benefit programs and group policies.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="24" height="24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
      )
    },
    {
      id: 'individual-life',
      title: 'Individual Life',
      description: 'Model and consolidate actuarial reserves for term, whole life, savings, and endowment policies.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="24" height="24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      )
    },
    {
      id: 'health',
      title: 'Health Care',
      description: 'Consolidated claim modeling, loss ratios, and reserving projections for group and individual health lines.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="24" height="24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
      )
    },
    {
      id: 'pc',
      title: 'Property & Casualty (P&C)',
      description: 'Consolidated triangulation, loss development factors, and reinsurance calculations for general insurance.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="24" height="24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5-7.75-3-1m-3 1.09-3-1.09m-6 2.181 3-1.091m0 0 3 1.09m-6-1.091v10.909m0-10.909L4.5 7.364M12 5.273V21" />
        </svg>
      )
    }
  ];

  return (
    <div className="container" style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div className="landing-hero">
        <h1>Actuarial Reserving Workspace</h1>
        <p>
          Consolidate, merge, and clean Line of Business (LOB) and Reinsurance spreadsheets with high-performance client-side computation. Select a portfolio to begin.
        </p>
      </div>

      <div className="portfolio-grid">
        {portfolios.map((portfolio) => (
          <div
            key={portfolio.id}
            className="glass-panel portfolio-card"
            onClick={() => onSelectPortfolio(portfolio.id)}
          >
            <div className="portfolio-icon">
              {portfolio.icon}
            </div>
            <h3>{portfolio.title}</h3>
            <p>{portfolio.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
