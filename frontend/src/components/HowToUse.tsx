import React from 'react';
import { Link } from 'react-router-dom';

const workflowSteps = [
  {
    number: '01',
    title: 'Select a portfolio',
    description: 'Choose the portfolio you want to work on from the home page. This opens the portfolio workspace and its navigation.'
  },
  {
    number: '02',
    title: 'Combine source sheets',
    description: 'Open Combine Sheet, add the Gross and Reinsurance files or folders, then run the consolidation. Review the processing log before downloading the result.'
  },
  {
    number: '03',
    title: 'Set the parameters',
    description: 'Open Data Processing and choose the valuation year, valuation month, and opening-balance treatment. Upload the Reserve Split Template and resolve any date mismatch shown.'
  },
  {
    number: '04',
    title: 'Upload and match data',
    description: 'Add Gross and Reinsurance files or folders. Confirm that each file is matched to the expected line of business before continuing.'
  },
  {
    number: '05',
    title: 'Check the data summary',
    description: 'Review Attritional IBNR, Large Loss IBNR, and Outstanding Claims (OCR) by line of business. Expand grouped rows where available and investigate unexpected totals.'
  },
  {
    number: '06',
    title: 'Review before completion',
    description: 'Confirm the valuation date, period, file counts, matches, and verification results on the final review step.'
  }
];

export const HowToUse: React.FC = () => (
  <div className="how-to-page container">
    <div className="how-to-hero">
      <span className="how-to-eyebrow">User guide</span>
      <h1>How to use the Actuarial Services Portal</h1>
      <p>Follow this workflow to consolidate source workbooks, validate reserve data, and review results before completion.</p>
    </div>

    <section className="how-to-prerequisites glass-panel">
      <div>
        <span className="how-to-section-number">Before you start</span>
        <h2>Prepare your files</h2>
      </div>
      <ul>
        <li>Use CSV, XLS, XLSX, XLSB, or XLSM files.</li>
        <li>Confirm that the Reserve Split Template contains the expected LOB sheets.</li>
        <li>Know the correct valuation month before uploading the template.</li>
        <li>Keep Gross and Reinsurance source files in separate folders where possible.</li>
      </ul>
    </section>

    <section className="how-to-workflow" aria-labelledby="workflow-heading">
      <div className="how-to-section-heading">
        <span className="how-to-section-number">Workflow</span>
        <h2 id="workflow-heading">From portfolio selection to review</h2>
      </div>
      <div className="how-to-step-list">
        {workflowSteps.map(step => (
          <article className="how-to-step glass-panel" key={step.number}>
            <span className="how-to-step-number">{step.number}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="how-to-terms glass-panel">
      <div>
        <strong>Attritional IBNR</strong>
        <span>Expected claims incurred but not yet reported from routine loss activity.</span>
      </div>
      <div>
        <strong>Large Loss IBNR</strong>
        <span>IBNR associated with individually significant or exceptional claims.</span>
      </div>
      <div>
        <strong>Outstanding Claims (OCR)</strong>
        <span>Reported claims that remain unpaid or not fully settled at the valuation date.</span>
      </div>
    </section>

    <div className="how-to-actions">
      <Link className="btn-primary how-to-home-link" to="/">Choose a portfolio</Link>
    </div>
  </div>
);
