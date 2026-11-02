import { useEffect } from 'react';
import { isAdminRole, STEPS } from '../shared/constants.js';

export function Badge({ children }) {
  const positive = ['Live', 'Approved', 'Hired', 'Accepted', 'Active', 'Selected', 'Proceed', 'Completed', 'Shortlisted'];
  const negative = ['Rejected', 'Cancelled', 'Declined', 'No-show', 'Inactive'];
  const tone = positive.includes(children) ? 'green' : negative.includes(children) ? 'red' : 'amber';

  return <span className={'badge ' + tone}>{children || '—'}</span>;
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  options,
  required = false,
  disabled = false,
  min,
  max
}) {
  return <label className="field">
    <span>{label}{required ? ' *' : ''}</span>
    {options
      ? <select value={value ?? ''} onChange={event => onChange(event.target.value)} required={required} disabled={disabled}>
        {options.map(option => <option
          key={typeof option === 'string' ? option : option.value}
          value={typeof option === 'string' ? option : option.value}
        >{typeof option === 'string' ? option : option.label}</option>)}
      </select>
      : type === 'textarea'
        ? <textarea value={value ?? ''} onChange={event => onChange(event.target.value)} rows={3} disabled={disabled} />
        : <input
          type={type}
          value={value ?? ''}
          onChange={event => onChange(event.target.value)}
          required={required}
          disabled={disabled}
          min={min}
          max={max}
          step={type === 'number' ? 'any' : undefined}
        />}
  </label>;
}

export function Empty({ text = 'No records yet.' }) {
  return <div className="empty">{text}</div>;
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return <div className="overlay" onClick={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </header>
      {children}
      <footer className="modal-actions">
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
      </footer>
    </section>
  </div>;
}

export function Table({ headers, children }) {
  return <div className="table-scroll">
    <table>
      <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}

export function ApprovalTrack({ track, onDecision, role, busy }) {
  return <div className="approval-track">{STEPS.map(([key, label], index) => {
    const approval = track?.[key] || { status: 'Pending' };
    const enabled = approval.status === 'Pending'
      && STEPS.slice(0, index).every(([previousKey]) => track?.[previousKey]?.status === 'Approved')
      && (isAdminRole(role) || role === key);

    return <div className="approval-step" key={key}>
      <b>{label}</b>
      <Badge>{approval.status}</Badge>
      {approval.by && <small>{approval.by} · {new Date(approval.date).toLocaleDateString()}</small>}
      {enabled
        ? <div className="actions">
          <button disabled={busy} onClick={() => onDecision(key, 'Approved')}>Approve</button>
          <button disabled={busy} className="danger" onClick={() => onDecision(key, 'Rejected')}>Reject</button>
        </div>
        : approval.status === 'Pending' && <small>Waiting for prior step or assigned approver</small>}
    </div>;
  })}</div>;
}
