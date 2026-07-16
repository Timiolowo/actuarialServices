import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
      <div>© 2026 Actuarial Services Reserves Console. All rights reserved.</div>
      <div className="footer-links">
        <Link className="footer-link" to="/how-to-use">How to Use</Link>
        <Link className="footer-link" to="/help-desk">Help Desk</Link>
        <span style={{ color: 'var(--primary)', fontWeight: '600' }}>v2.4.0</span>
      </div>
    </footer>
  );
};
