import React, { useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';


const troubleshootingItems = [
  {
    title: 'Valuation date mismatch',
    detail: 'Confirm the selected month matches the last date in every expected LOB sheet, then upload the Reserve Split Template again.'
  },
  {
    title: 'File will not upload',
    detail: 'Check the extension and file size. Combine Sheet accepts XLSX/XLSB up to 50 MB; Data Processing also accepts CSV, XLS, and XLSM.'
  },
  {
    title: 'LOB file is unmatched',
    detail: 'Check that the filename or worksheet naming identifies the expected line of business and that Gross and RI files are in the correct upload section.'
  },
  {
    title: 'Totals look incorrect',
    detail: 'Compare PY and CY separately, then confirm whether the value belongs to Attritional IBNR, Large Loss IBNR, or Outstanding Claims (OCR).'
  }
];

const suggestedQuestions = [
  'Why is my valuation date not matching?',
  'Why is a LOB file showing as unmatched?',
  'Help me diagnose a failed workbook upload.',
  'Explain the difference between IBNR and OCR.'
];

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const HelpDesk: React.FC = () => {
  const [input, setInput] = useState('');
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: `${apiBaseUrl}/api/help-chat`
    }),
    []
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const isWorking = status === 'submitted' || status === 'streaming';

  const submitQuestion = (question: string) => {
    const text = question.trim();
    if (!text || isWorking) return;
    setInput('');
    void sendMessage({ text });
  };

  return (
    <div className="help-desk-page container">
      <div className="help-desk-hero">
        <span className="how-to-eyebrow">Support centre</span>
        <h1>Help Desk</h1>
        <p>Find a quick fix or describe the problem to the diagnostic assistant.</p>
      </div>

      <section className="help-desk-grid" aria-label="Troubleshooting guides">
        {troubleshootingItems.map(item => (
          <article className="help-topic glass-panel" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="help-chat glass-panel" aria-labelledby="help-chat-title">
        <div className="help-chat-header">
          <div>
            <span className="help-chat-status"><i /> Diagnostic assistant</span>
            <h2 id="help-chat-title">Ask about an error or workflow issue</h2>
          </div>
          <span className="help-chat-scope">Read-only guidance</span>
        </div>

        <div className="help-chat-messages" aria-live="polite">
          <div className="help-message assistant">
            <div className="help-message-label">Assistant</div>
            <p>Tell me which page and step you are on, what you expected, and the exact error shown. I can help diagnose uploads, workbook structure, date checks, matching, summaries, processing, and downloads.</p>
          </div>

          {messages.map(message => (
            <div className={`help-message ${message.role}`} key={message.id}>
              <div className="help-message-label">{message.role === 'user' ? 'You' : 'Assistant'}</div>
              {message.parts.map((part, index) => part.type === 'text' ? (
                <Streamdown
                  animated
                  isAnimating={isWorking && message.role === 'assistant'}
                  key={`${message.id}-${index}`}
                >
                  {part.text}
                </Streamdown>
              ) : null)}
            </div>
          ))}

          {status === 'submitted' && (
            <div className="help-message assistant help-message-loading">Reviewing the issue…</div>
          )}

          {error && (
            <div className="help-chat-error" role="alert">
              {error.message || 'The assistant is unavailable. Confirm that the backend and AI Gateway credentials are configured.'}
            </div>
          )}
        </div>

        {messages.length === 0 && (
          <div className="help-suggestions">
            {suggestedQuestions.map(question => (
              <button type="button" key={question} onClick={() => submitQuestion(question)}>{question}</button>
            ))}
          </div>
        )}

        <form className="help-chat-form" onSubmit={event => { event.preventDefault(); submitQuestion(input); }}>
          <label htmlFor="help-question">Describe the issue</label>
          <textarea
            id="help-question"
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitQuestion(input);
              }
            }}
            placeholder="Example: Data Processing step 1 says the Fire PI valuation date does not match September 2026…"
            rows={3}
          />
          <div className="help-chat-form-footer">
            <span>Do not share policyholder, claimant, employee, medical, or account data.</span>
            {isWorking ? (
              <button className="btn-secondary" type="button" onClick={stop}>Stop</button>
            ) : (
              <button className="btn-primary" type="submit" disabled={!input.trim()}>Send question</button>
            )}
          </div>
        </form>
      </section>

      <section className="help-escalation glass-panel">
        <div>
          <span className="how-to-section-number">Escalation checklist</span>
          <h2>What to include in a support request</h2>
        </div>
        <ul>
          <li>Portfolio, page, and workflow step</li>
          <li>Exact error text and the time it occurred</li>
          <li>File extension and approximate size</li>
          <li>Worksheet names or a redacted screenshot</li>
          <li>Relevant processing-log or browser-console excerpt</li>
        </ul>
      </section>
    </div>
  );
};
