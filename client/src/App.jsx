import React, { useEffect, useState } from 'react';
import { ApprovalTrack, Badge, Empty, Field, Modal, Table } from './components/ui.jsx';
import { api, csv, download } from './shared/api.js';
import { DEFAULT_APP_CONFIG, isAdminRole, nextRounds, safeLink, SECTIONS, statusJob, STAGES, STEPS, today } from './shared/constants.js';
export default function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG),
    [db, setDb] = useState({
      employees: [],
      jobs: [],
      candidates: []
    }),
    [notifications, setNotifications] = useState([]),
    [page, setPage] = useState('job-requisition'),
    [expanded, setExpanded] = useState([true, true, true]),
    [search, setSearch] = useState(''),
    [jobFilter, setJobFilter] = useState(''),
    [stageFilter, setStageFilter] = useState(''),
    [sourceFilter, setSourceFilter] = useState(''),
    [jobStatusFilter, setJobStatusFilter] = useState(''),
    [employeeDeptFilter, setEmployeeDeptFilter] = useState(''),
    [employeeStatusFilter, setEmployeeStatusFilter] = useState(''),
    [manager, setManager] = useState(''),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState([]),
    [mobile, setMobile] = useState(false),
    [login, setLogin] = useState({
      email: 'admin@udata.local',
      password: ''
    });
  const editAllowed = user && (isAdminRole(user.role) || user.role === 'recruiter');
  const jobAllowed = editAllowed || user?.role === 'manager';
  const notify = s => {
    setToast(s);
    setTimeout(() => setToast(''), 4500);
  };
  async function reload() {
    const d = await api('/bootstrap');
    const n = d.config?.features?.notifications ? await api('/notifications') : [];
    setDb(d);
    setAppConfig(d.config || DEFAULT_APP_CONFIG);
    setNotifications(n);
    return d;
  }
  async function readNotification(n) {
    await api('/notifications/' + n.id + '/read', 'PATCH');
    setNotifications(current => current.map(item => item.id === n.id ? {
      ...item,
      readAt: new Date().toISOString()
    } : item));
    if (n.href === '/approvals') setPage('approvals');else if (n.href === '/candidates') setPage('candidates');else setPage('notifications');
  }
  async function readAllNotifications() {
    await api('/notifications/read-all', 'POST', {});
    setNotifications(current => current.map(n => ({
      ...n,
      readAt: new Date().toISOString()
    })));
  }
  useEffect(() => {
    api('/auth/me').then(async d => {
      if (d.user) {
        setUser(d.user);
        await reload();
      }
    }).catch(e => {
      setError(e.message);
    }).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    setJobFilter('');
    setStageFilter('');
    setSourceFilter('');
    setJobStatusFilter('');
    setEmployeeDeptFilter('');
    setEmployeeStatusFilter('');
    setSelected([]);
    setMobile(false);
  }, [page]);
  useEffect(() => {
    if (page !== 'notifications' || !user || !appConfig.features.notifications) return;
    api('/notifications')
      .then(setNotifications)
      .catch(e => {
        setError(e.message);
        notify(e.message);
      });
  }, [page, user, appConfig.features.notifications]);
  async function run(fn, message) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      if (message) notify(message);
    } catch (e) {
      setError(e.message);
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(kind, data) {
    return run(async () => {
      await api('/' + kind + (data.id ? '/' + data.id : ''), data.id ? 'PUT' : 'POST', data);
      await reload();
      setModal(null);
    }, 'Saved to MongoDB');
  }
  async function remove(kind, item) {
    if (!confirm(`Delete ${item.name || item.title}? This cannot be undone.`)) return;
    await run(async () => {
      await api(`/${kind}/${item.id}`, 'DELETE', {
        version: item.version
      });
      await reload();
      if (modal?.item?.id === item.id) setModal(null);
    }, 'Record deleted');
  }
  async function candAction(c, body) {
    return run(async () => {
      const updated = await api(`/candidates/${c.id}/action`, 'POST', {
        ...body,
        version: c.version
      });
      await reload();
      setModal(m => m?.type === 'candidate' && m.item?.id === c.id ? {
        ...m,
        item: updated
      } : m);
    }, 'Workflow updated');
  }
  async function jobAction(j, body) {
    return run(async () => {
      const updated = await api(`/jobs/${j.id}/action`, 'POST', {
        ...body,
        version: j.version
      });
      await reload();
      setModal(m => m?.item?.id === j.id ? {
        ...m,
        item: updated
      } : m);
    }, 'Requisition updated');
  }
  const jobName = id => {
    const j = db.jobs.find(j => j.id === id);
    return j ? `${j.jobCode} — ${j.title}` : 'Removed requisition';
  };
  const empName = id => db.employees.find(e => e.id === id)?.name || '—';
  const match = item => [item.name, item.title, item.jobCode, item.email, item.dept, item.phone].some(x => String(x || '').toLowerCase().includes(search.toLowerCase()));
  let candidates = db.candidates.filter(c => match(c) && (!jobFilter || c.jobId === jobFilter) && (!stageFilter || c.stage === stageFilter) && (!sourceFilter || c.source === sourceFilter));
  if (page === 'candidates') candidates = candidates.filter(c => c.source !== 'Referral');
  if (page === 'referred-candidates') candidates = candidates.filter(c => c.source === 'Referral');
  if (page === 'offers') candidates = candidates.filter(c => ['Selected', 'Hold', 'Offer', 'Hired'].includes(c.stage) || c.offerStatus);
  const jobs = db.jobs.filter(j => match(j) && (!jobStatusFilter || statusJob(j) === jobStatusFilter));
  const employees = db.employees.filter(e => match(e) && (!employeeDeptFilter || e.dept === employeeDeptFilter) && (!employeeStatusFilter || e.status === employeeStatusFilter));
  const activeManager = user?.role === 'manager' ? db.employees.find(e => e.id === user.employeeId)?.name : manager || db.employees[0]?.name || '';
  async function bulk(action) {
    if (!selected.length) return;
    let reason = '';
    if (action === 'reject') {
      reason = prompt('Rejection reason for selected candidates');
      if (!reason) return;
    }
    if (action === 'delete' && !confirm(`Permanently delete ${selected.length} candidates?`)) return;
    await run(async () => {
      const failures = [];
      for (const id of selected) {
        const c = db.candidates.find(c => c.id === id);
        try {
          await api('/candidates/' + id + (action === 'delete' ? '' : '/action'), action === 'delete' ? 'DELETE' : 'POST', {
            action,
            reason,
            version: c.version
          });
        } catch (e) {
          failures.push(c.name + ': ' + e.message);
        }
      }
      await reload();
      setSelected([]);
      if (failures.length) throw Error(failures.join('; '));
    }, 'Bulk action completed');
  }
  function newCandidate() {
    const live = db.jobs.find(j => statusJob(j) === 'Live');
    if (!live) return notify('Approve a requisition before adding candidates');
    setModal({
      type: 'candidate',
      item: {
        name: '',
        jobId: live.id,
        source: page === 'referred-candidates' ? 'Referral' : 'LinkedIn',
        education: {},
        stage: 'Applied',
        appliedDate: today(),
        interviews: [],
        activity: []
      }
    });
  }
  function candidateTable(list) {
    return list.length ? <Table headers={['Select', 'Candidate', 'Requisition', 'Source', 'Stage', 'Applied', 'Actions']}>{list.map(c => <tr key={c.id}><td><input type="checkbox" checked={selected.includes(c.id)} onChange={e => setSelected(s => e.target.checked ? [...s, c.id] : s.filter(x => x !== c.id))} /></td><td><button className="text-link" onClick={() => setModal({
            type: 'candidate',
            item: c
          })}>{c.name}</button><small>{c.email}</small></td><td>{jobName(c.jobId)}</td><td>{c.source}{c.referredBy && <small>By {c.referredBy}</small>}</td><td><Badge>{c.stage}</Badge>{c.offerStatus && <small>{c.offerStatus}</small>}</td><td>{c.appliedDate}</td><td><button className="secondary" onClick={() => setModal({
            type: 'candidate',
            item: c
          })}>Open</button>{editAllowed && <button className="danger" disabled={busy} onClick={() => remove('candidates', c)}>Delete</button>}</td></tr>)}</Table> : <Empty />;
  }
  function jobCards(list) {
    return list.length ? <div className="cards">{list.map(j => <article className="card" key={j.id}><div className="row"><span className="eyebrow">{j.jobCode}</span><Badge>{statusJob(j)}</Badge></div><h3>{j.title}</h3><p>{j.dept} · {j.location}</p><div className="job-meta"><span>{j.openings} openings</span><span>{db.candidates.filter(c => c.jobId === j.id).length} applicants</span><span>CTC ₹{j.ctc || '—'}</span></div><small>Raised by {j.raisedBy || '—'} · Recruiter: {empName(j.assignedRecruiterId)}</small><div className="actions"><button className="secondary" onClick={() => setModal({
            type: 'job-detail',
            item: j
          })}>Details & approvals</button>{editAllowed && <><button className="ghost" onClick={() => setModal({
              type: 'job',
              item: j
            })}>Edit</button><button className="ghost" disabled={busy} onClick={() => jobAction(j, {
              action: 'close'
            })}>{j.closed ? 'Reopen' : 'Close'}</button><button className="danger" disabled={busy} onClick={() => jobAction(j, {
              action: 'cancel'
            })}>{j.cancelled ? 'Restore' : 'Cancel'}</button><button className="danger" disabled={busy} onClick={() => remove('jobs', j)}>Delete</button></>}</div></article>)}</div> : <Empty />;
  }
  function renderPage() {
    if (page === 'reports' && !appConfig.features.reports) return <Empty text="Reports are disabled by server configuration." />;
    if (page === 'notifications' && !appConfig.features.notifications) return <Empty text="Notifications are disabled by server configuration." />;
    if (page === 'job-requisition') return jobCards(jobs);
    if (['candidates', 'referred-candidates', 'offers'].includes(page)) return <>{editAllowed && selected.length > 0 && <div className="bulk"><b>{selected.length} selected</b><button disabled={busy} onClick={() => bulk('shortlist')}>Shortlist</button><button disabled={busy} className="danger" onClick={() => bulk('reject')}>Reject</button><button disabled={busy} className="danger" onClick={() => bulk('delete')}>Delete</button><button className="ghost" onClick={() => setSelected([])}>Clear</button></div>}{candidateTable(candidates)}</>;
    if (page === 'interview-pipeline') return <div className="kanban">{STAGES.filter(s => s !== 'Applied').map(stage => <section className="lane" key={stage} onDragOver={e => e.preventDefault()} onDrop={e => {
        const c = db.candidates.find(c => c.id === e.dataTransfer.getData('text/plain'));
        if (!c) return;
        if (stage === 'Rejected') {
          const reason = prompt('Rejection reason');
          if (reason) candAction(c, {
            action: 'reject',
            reason
          });
        } else if (stage === 'Selected' && c.stage === 'Hold') candAction(c, {
          action: 'select-hold'
        });else notify('Use candidate workflow to complete interviews and approvals before changing stage.');
      }}><header><h3>{stage}</h3><Badge>{candidates.filter(c => c.stage === stage).length}</Badge></header>{candidates.filter(c => c.stage === stage).map(c => <article className="pipeline-card" key={c.id} draggable={editAllowed} onDragStart={e => e.dataTransfer.setData('text/plain', c.id)} onClick={() => setModal({
          type: 'candidate',
          item: c
        })}><b>{c.name}</b><small>{jobName(c.jobId)}</small><Badge>{c.source}</Badge>{c.interviews?.at(-1) && <small>{c.interviews.at(-1).round}: {c.interviews.at(-1).status}</small>}</article>)}{!candidates.some(c => c.stage === stage) && <Empty text="No candidates" />}</section>)}</div>;
    if (page === 'all-employees') return employees.length ? <Table headers={['Name', 'Role', 'Department', 'Manager', 'Status', 'Joined', 'Actions']}>{employees.map(e => <tr key={e.id}><td><b>{e.name}</b><small>{e.email}</small></td><td>{e.role}</td><td>{e.dept}</td><td>{empName(e.managerId)}</td><td><Badge>{e.status}</Badge></td><td>{e.joinDate}</td><td>{editAllowed && <><button className="secondary" onClick={() => setModal({
              type: 'employee',
              item: e
            })}>Edit</button><button className="danger" disabled={busy} onClick={() => remove('employees', e)}>Delete</button></>}</td></tr>)}</Table> : <Empty />;
    if (page === 'documents') {
      const docs = candidates.filter(c => c.resumeFile || c.resumeUrl);
      return docs.length ? <Table headers={['Document', 'Candidate', 'Requisition', 'Source', 'Download']}>{docs.map(c => <tr key={c.id}><td>{c.resumeFileName || 'Resume link'}</td><td>{c.name}</td><td>{jobName(c.jobId)}</td><td>{c.source}</td><td>{c.resumeFile && <a className="button secondary" href={c.resumeFile} download>Download</a>}{safeLink(c.resumeUrl) && <a href={c.resumeUrl} target="_blank" rel="noreferrer">Open link</a>}</td></tr>)}</Table> : <Empty text="Upload a resume from a candidate profile." />;
    }
    if (page === 'org-chart') {
      const depts = [...new Set(employees.map(e => e.dept || 'Unassigned'))];
      return <><p className="muted">Employees grouped by department, with saved reporting managers.</p><div className="cards">{depts.map(d => <section className="card" key={d}><h3>{d}</h3>{employees.filter(e => (e.dept || 'Unassigned') === d).map(e => <div className="person" key={e.id}><span className="avatar">{e.name.slice(0, 2).toUpperCase()}</span><div><b>{e.name}</b><small>{e.role}</small><small>Reports to: {empName(e.managerId)}</small></div></div>)}</section>)}</div>{!depts.length && <Empty />}</>;
    }
    if (page === 'my-requests') {
      const shared = candidates.filter(c => c.cvSharedWith === activeManager && c.cvShareStatus === 'Shared');
      return <>{user.role !== 'manager' && <Field label="Viewing manager" value={activeManager} onChange={setManager} options={db.employees.map(e => ({
          value: e.name,
          label: e.name + ' — ' + e.role
        }))} />}<h3>CVs awaiting review ({shared.length})</h3>{candidateTable(shared)}<h3>Requisitions raised by {activeManager}</h3>{jobCards(jobs.filter(j => j.raisedBy === activeManager))}</>;
    }
    if (page === 'approvals') return <><h3>Awaiting approval</h3>{jobCards(jobs.filter(j => statusJob(j) === 'Pending Approval'))}<h3>Decided requisitions</h3>{jobCards(jobs.filter(j => ['Live', 'Rejected'].includes(statusJob(j))))}</>;
    if (page === 'reports') return <Reports db={db} />;
    if (page === 'notifications') return <section className="notification-list"><div className="section-heading"><div><h2>Activity notifications</h2><p className="muted">Updates from requisitions and candidate workflows.</p></div><button className="secondary" disabled={!notifications.some(n => !n.readAt)} onClick={() => run(readAllNotifications, 'Notifications marked as read')}>Mark all as read</button></div>{notifications.length ? notifications.map(n => <article key={n.id} className={'notification-card ' + (!n.readAt ? 'unread' : '')}><span className="notification-icon">{n.type === 'requisition' ? '↗' : '◎'}</span><div className="notification-copy"><div className="row"><b>{n.title}</b><small>{new Date(n.createdAt).toLocaleString()}</small></div><p>{n.message}</p>{n.actorName && <small>By {n.actorName}</small>}</div><button className="secondary" onClick={() => run(() => readNotification(n), 'Notification opened')}>{n.readAt ? 'Open' : 'View'}</button></article>) : <Empty text="You’re all caught up. New workflow activity will appear here." />}</section>;
    return <Empty />;
  }
  if (!ready) return <div className="loading">Connecting to U-data HR…</div>;
  if (!user) return <div className="login"><form onSubmit={e => {
      e.preventDefault();
      run(async () => {
        const d = await api('/auth/login', 'POST', login);
        setUser(d.user);
        await reload();
      });
    }}><div className="brandmark">U</div><h1>U-data HR</h1><p>Recruitment & people workspace</p><Field label="Email" type="email" value={login.email} onChange={email => setLogin({
        ...login,
        email
      })} required /><Field label="Password" type="password" value={login.password} onChange={password => setLogin({
        ...login,
        password
      })} required />{error && <p className="error">{error}</p>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><small>Use the credentials printed by the setup script.</small></form></div>;
  const sections = SECTIONS.map(([label, items]) => [
    label,
    items.filter(([id]) => id !== 'reports' || appConfig.features.reports)
      .filter(([id]) => id !== 'notifications' || appConfig.features.notifications)
  ]).filter(([, items]) => items.length);
  const title = sections.flatMap(section => section[1]).find(([id]) => id === page)?.[1] || 'Workspace';
  const unreadNotifications = notifications.filter(n => !n.readAt).length;
  return <div className="app"><aside className={mobile ? 'open' : ''}><div className="brand"><div className="brandmark">U</div><div><b>U-data HR</b><small>People. Progress. Possibility.</small></div></div><nav>{sections.map(([label, items], i) => <div key={label}><button className="nav-group" onClick={() => setExpanded(s => s.map((v, n) => n === i ? !v : v))}>{label}<span>{expanded[i] ? '−' : '+'}</span></button>{expanded[i] && items.map(([id, name]) => <button key={id} className={'nav-item ' + (page === id ? 'active' : '')} onClick={() => {
            setPage(id);
            setMobile(false);
          }}>{name}</button>)}</div>)}</nav><div className="sidebar-footer"><div className="sidebar-profile"><span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span><div><b>{user.name}</b><small>{user.role}</small></div></div><button className="ghost" onClick={() => setModal({
          type: 'settings'
        })}>Account & settings</button><button type="button" className="ghost" onClick={() => run(async () => {
          await api('/auth/logout', 'POST');
          setUser(null);
          setDb({
            employees: [],
            jobs: [],
            candidates: []
          });
          setAppConfig(DEFAULT_APP_CONFIG);
          setNotifications([]);
        })}>Sign out</button></div></aside><div className="workspace"><header className="topbar"><button type="button" className="ghost mobile-toggle" onClick={() => setMobile(!mobile)} aria-label="Toggle navigation">☰</button><div className="topbar-search"><span aria-hidden="true">⌕</span><input aria-label="Search workspace" placeholder="Search names, emails, roles or requisitions…" value={search} onChange={e => setSearch(e.target.value)} /></div>{appConfig.features.notifications && <button className="notification-bell" aria-label="Open notifications" onClick={() => setPage('notifications')}>♧{unreadNotifications > 0 && <i>{unreadNotifications}</i>}</button>}<button className="secondary refresh-button" disabled={busy} onClick={() => run(reload, 'Refreshed')}>Refresh</button><span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span></header><main><div className="page-title"><div><span className="eyebrow">Workspace <span aria-hidden="true">/</span> {title}</span><h1>{title}</h1><p className="muted">{page === 'reports' ? 'A clear view of your hiring funnel, approvals and people operations.' : 'Manage your recruitment and people records in one place.'}</p></div><div className="actions">{page === 'job-requisition' && jobAllowed && <button onClick={() => setModal({
              type: 'job',
              item: {
                openings: 1,
                reqType: 'New Requirement',
                roleExpType: 'Experienced',
                postedDate: today()
              }
            })}>+ Raise requisition</button>}{['candidates', 'referred-candidates'].includes(page) && editAllowed && <button onClick={newCandidate}>{page === 'referred-candidates' ? '+ Add referral' : '+ Add candidate'}</button>}{page === 'all-employees' && editAllowed && <button onClick={() => setModal({
              type: 'employee',
              item: {
                status: 'Active',
                joinDate: today()
              }
            })}>+ Add employee</button>}</div></div>{page !== 'reports' && <div className="stats"><Stat label="Live requisitions" value={db.jobs.filter(j => statusJob(j) === 'Live').length} /><Stat label="Candidates" value={db.candidates.length} /><Stat label="Scheduled interviews" value={db.candidates.reduce((a, c) => a + (c.interviews || []).filter(r => r.status === 'Scheduled').length, 0)} /><Stat label="Active employees" value={db.employees.filter(e => e.status === 'Active').length} /></div>}{['candidates', 'referred-candidates', 'interview-pipeline', 'offers', 'documents'].includes(page) && <div className="filters"><Field label="Requisition" value={jobFilter} onChange={setJobFilter} options={[{
            value: '',
            label: 'All requisitions'
          }, ...db.jobs.map(j => ({
            value: j.id,
            label: jobName(j.id)
          }))]} /><Field label="Stage" value={stageFilter} onChange={setStageFilter} options={[{
            value: '',
            label: 'All stages'
          }, ...STAGES]} /><Field label="Source" value={sourceFilter} onChange={setSourceFilter} options={[{
            value: '',
            label: 'All sources'
          }, 'Referral', 'LinkedIn', 'Job Board', 'Career Page', 'Agency', 'Other']} /></div>}{error && <div className="error-banner">{error}<button className="ghost" onClick={() => setError('')}>Dismiss</button></div>}{renderPage()}</main></div>{toast && <div role="status" className="toast">{toast}</div>}{modal?.type === 'job' && <Modal title={modal.item.id ? 'Edit requisition' : 'Raise requisition'} onClose={() => setModal(null)}><JobForm item={modal.item} employees={db.employees} busy={busy} onSave={d => save('jobs', d)} onCancel={() => setModal(null)} /></Modal>}{modal?.type === 'employee' && <Modal title={modal.item.id ? 'Edit employee' : 'Add employee'} onClose={() => setModal(null)}><EmployeeForm item={modal.item} employees={db.employees} busy={busy} onSave={d => save('employees', d)} /></Modal>}{modal?.type === 'job-detail' && <Modal title={modal.item.title} onClose={() => setModal(null)}><JobDetail job={modal.item} role={user.role} busy={busy} onAction={b => jobAction(modal.item, b)} /></Modal>}{modal?.type === 'candidate' && <Modal title={modal.item.id ? 'Candidate profile' : 'New application'} onClose={() => setModal(null)}><CandidateDetail key={modal.item.id || 'new'} candidate={modal.item} jobs={db.jobs} employees={db.employees} appConfig={appConfig} role={user.role} busy={busy} onSave={d => save('candidates', d)} onAction={b => candAction(modal.item, b)} onError={s => {
        notify(s);
        setError(s);
      }} onSync={() => run(async () => {
        await api(`/candidates/${modal.item.id}/sync-employee`, 'POST');
        await reload();
      }, 'Employee record synced')} /></Modal>}{modal?.type === 'settings' && <Modal title="Account & settings" onClose={() => setModal(null)}><Settings user={user} employees={db.employees} features={appConfig.features} run={run} busy={busy} onError={message => {
    setError(message);
    notify(message);
  }} /></Modal>}</div>;
}
function Stat({
  label,
  value
}) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}
function JobForm({
  item,
  employees,
  onSave,
  busy
}) {
  const [d, setD] = useState(item);
  const f = (key, label, type = 'text', options, required = false) => <Field key={key} label={label} type={type} options={options} value={d[key]} onChange={v => setD({
    ...d,
    [key]: v
  })} required={required} />;
  return <form onSubmit={e => {
    e.preventDefault();
    onSave({
      ...d,
      openings: Number(d.openings)
    });
  }}><div className="form-grid">{f('jobCode', 'Job code', 'text', null, true)}{f('title', 'Job title', 'text', null, true)}{f('designation', 'Designation')}{f('dept', 'Department')}{f('subDept', 'Sub department')}{f('location', 'Location')}{f('openings', 'Number of openings', 'number', null, true)}{f('reqType', 'Requirement type', 'text', ['New Requirement', 'Replacement'])}{d.reqType === 'Replacement' && f('replacementOf', 'Replacement of')}{f('grade', 'Grade')}{f('ctc', 'Annual budget CTC (₹)')}{f('qualification', 'Qualification')}{f('roleExpType', 'Experience type', 'text', ['Experienced', 'Fresher'])}{d.roleExpType === 'Experienced' && f('roleExpYears', 'Years of experience', 'number')}{f('raisedBy', 'Raised by', 'text', [{
        value: '',
        label: 'Select employee'
      }, ...employees.map(e => ({
        value: e.name,
        label: e.name
      }))])}{f('deptHead', 'Department head')}{f('assignedRecruiterId', 'Assigned recruiter', 'text', [{
        value: '',
        label: 'Unassigned'
      }, ...employees.map(e => ({
        value: e.id,
        label: e.name
      }))])}{f('postedDate', 'Posted date', 'date')}</div>{f('jd', 'Job description', 'textarea')}{f('eligibility', 'Eligibility', 'textarea')}<p className="muted">Reviewed requisitions must have their approval track reset before editing. Changes need fresh approvals.</p><div className="modal-actions"><button type="submit" disabled={busy}>Save requisition</button></div></form>;
}
function EmployeeForm({
  item,
  employees,
  onSave,
  busy
}) {
  const [d, setD] = useState(item);
  const f = (key, label, type = 'text', options, required = false) => <Field key={key} label={label} type={type} options={options} value={d[key]} onChange={v => setD({
    ...d,
    [key]: v
  })} required={required} />;
  return <form onSubmit={e => {
    e.preventDefault();
    onSave({
      ...d,
      salary: Number(d.salary || 0)
    });
  }}><div className="form-grid">{f('name', 'Full name', 'text', null, true)}{f('role', 'Role / title')}{f('dept', 'Department')}{f('email', 'Email', 'email')}{f('salary', 'Annual salary (₹)', 'number')}{f('joinDate', 'Join date', 'date')}{f('status', 'Status', 'text', ['Active', 'Inactive'])}{f('managerId', 'Reporting manager', 'text', [{
        value: '',
        label: 'No reporting manager'
      }, ...employees.filter(e => e.id !== d.id).map(e => ({
        value: e.id,
        label: e.name
      }))])}</div><div className="modal-actions"><button type="submit" disabled={busy}>Save employee</button></div></form>;
}
function JobDetail({
  job: j,
  role,
  busy,
  onAction
}) {
  return <><div className="row"><span className="eyebrow">{j.jobCode}</span><Badge>{statusJob(j)}</Badge></div><dl className="detail-grid">{['designation', 'dept', 'subDept', 'location', 'openings', 'reqType', 'replacementOf', 'grade', 'ctc', 'qualification', 'roleExpType', 'roleExpYears', 'raisedBy', 'deptHead', 'postedDate'].map(k => <div key={k}><dt>{k.replace(/([A-Z])/g, ' $1')}</dt><dd>{String(j[k] || '—')}</dd></div>)}</dl><h3>Job description</h3><p className="preserve">{j.jd || '—'}</p><h3>Eligibility</h3><p>{j.eligibility || '—'}</p><h3>Approval workflow</h3><ApprovalTrack track={j.approvals} role={j.closed || j.cancelled ? 'none' : role} busy={busy} onDecision={(step, decision) => onAction({
      action: 'approve',
      step,
      decision
    })} />{(isAdminRole(role) || role === 'recruiter') && <button className="secondary" disabled={busy} onClick={() => {
      if (confirm('Reset approvals? All three steps will need approval again.')) onAction({
        action: 'reset'
      });
    }}>Reset approvals to revise</button>}</>;
}
function CandidateDetail({
  candidate: c,
  jobs,
  employees,
  appConfig,
  role,
  busy,
  onSave,
  onAction,
  onError,
  onSync
}) {
  const [d, setD] = useState(c),
    [tab, setTab] = useState('profile'),
    [uploading, setUploading] = useState(false),
    [uploadNote, setUploadNote] = useState(''),
    [manager, setManager] = useState(c.cvSharedWith || ''),
    [ctc, setCtc] = useState(c.negotiatedCTC || '');
  const edit = isAdminRole(role) || role === 'recruiter';
  const review = edit || role === 'manager';
  useEffect(() => {
    setD(c);
    setCtc(c.negotiatedCTC || '');
  }, [c]);
  const f = (key, label, type = 'text', options, required = false) => <Field key={key} label={label} type={type} options={options} value={d[key]} onChange={v => setD({
    ...d,
    [key]: v
  })} required={required} disabled={!edit} />;
  async function upload(file) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('jobId', d.jobId);
      const r = await api('/uploads', 'POST', form);
      setD(prev => ({
        ...prev,
        resumeFile: r.resumeFile,
        resumeFileName: r.resumeFileName,
        resumeMatchScore: r.resumeMatchScore,
        ...Object.fromEntries(Object.entries(r.extracted).filter(([k, v]) => v && !prev[k]))
      }));
      setUploadNote((r.warning || 'Resume uploaded; verify extracted fields before saving.') + (r.resumeMatchScore === null ? '' : ` Keyword match: ${r.resumeMatchScore}% (heuristic).`));
    } catch (e) {
      onError(e.message);
    } finally {
      setUploading(false);
    }
  }
  return <><div className="profile-summary"><span className="avatar large">{(c.name || 'NA').slice(0, 2).toUpperCase()}</span><div><h3>{c.name || 'New candidate'}</h3><p>{jobs.find(j => j.id === c.jobId)?.title}</p><Badge>{c.stage}</Badge>{c.offerStatus && <Badge>{c.offerStatus}</Badge>}</div></div><div className="tabs">{['profile', ...(c.id ? ['workflow', 'interviews', 'activity'] : [])].map(t => <button className={tab === t ? 'active' : 'ghost'} key={t} onClick={() => setTab(t)}>{t}</button>)}</div>{tab === 'profile' && <form onSubmit={e => {
      e.preventDefault();
      onSave(d);
    }}><div className="form-grid"><Field label="Requisition" value={d.jobId} onChange={v => setD({
          ...d,
          jobId: v
        })} disabled={!!c.id || !edit} required options={jobs.filter(j => statusJob(j) === 'Live' || j.id === d.jobId).map(j => ({
          value: j.id,
          label: j.jobCode + ' — ' + j.title
        }))} />{f('name', 'Full name', 'text', null, true)}{f('email', 'Email', 'email')}{f('phone', 'Phone')}{f('gender', 'Gender', 'text', ['', 'Female', 'Male', 'Other'])}{f('dob', 'Date of birth', 'date')}{f('experienceType', 'Experience', 'text', ['Fresher', 'Experienced'])}{f('experienceYears', 'Experience years', 'number')}{f('noticePeriod', 'Notice period')}{f('currentCTC', 'Current CTC (₹)')}{f('expectedCTC', 'Expected CTC (₹)')}{f('source', 'Source', 'text', ['Referral', 'LinkedIn', 'Job Board', 'Career Page', 'Agency', 'Other'])}{d.source === 'Referral' && f('referredBy', 'Referred by')}{f('appliedDate', 'Applied date', 'date')}{f('resumeUrl', 'Resume URL', 'url')}{['degree', 'institution', 'year'].map(k => <Field key={k} label={'Education ' + k} value={d.education?.[k]} disabled={!edit} onChange={v => setD({
          ...d,
          education: {
            ...d.education,
            [k]: v
          }
        })} />)}</div>{f('currentAddress', 'Current address', 'textarea')}{f('notes', 'Notes', 'textarea')}{(appConfig.features.resumeUploads || d.resumeFile || safeLink(d.resumeUrl)) && <div className="upload-box"><b>Resume</b>{d.resumeMatchScore != null && <small>Keyword match: {d.resumeMatchScore}% · verify suitability manually</small>}{edit && appConfig.features.resumeUploads && <input type="file" accept=".pdf,.docx,.doc,.txt" disabled={uploading || busy} onChange={e => upload(e.target.files[0])} />}<small>{appConfig.features.resumeUploads ? `PDF / DOCX / DOC / TXT · maximum ${appConfig.uploadMaxSizeMb} MB. Scanned PDFs need manual details.` : 'Resume uploads are disabled by server configuration.'}</small>{uploading && <p>Uploading and extracting text…</p>}{uploadNote && <p>{uploadNote}</p>}{d.resumeFile && <a href={d.resumeFile} download>{d.resumeFileName || 'Download resume'}</a>}{safeLink(d.resumeUrl) && <a href={d.resumeUrl} target="_blank" rel="noreferrer">Open resume link</a>}</div>}{edit && <div className="modal-actions"><button disabled={busy || uploading}>Save profile</button></div>}</form>}
{tab === 'workflow' && <><h3>CV review</h3><p>Shared with: {c.cvSharedWith || '—'} · {c.cvShareStatus || 'Not shared'}</p>{c.stage === 'Applied' && <><Field label="Hiring manager" value={manager} onChange={setManager} options={[{
          value: '',
          label: 'Select manager'
        }, ...employees.map(e => ({
          value: e.name,
          label: e.name
        }))]} /><div className="actions">{edit && <button disabled={busy || !manager} onClick={() => onAction({
            action: 'share-cv',
            manager
          })}>Share CV for review</button>}{review && <button disabled={busy} onClick={() => onAction({
            action: 'shortlist'
          })}>Shortlist for interviews</button>}</div></>}{review && !['Hired', 'Rejected'].includes(c.stage) && <button className="danger" disabled={busy} onClick={() => {
        const reason = prompt('Rejection reason');
        if (reason) onAction({
          action: 'reject',
          reason
        });
      }}>Reject candidate</button>}{edit && c.stage === 'Rejected' && !c.offerLetterGenerated && <button disabled={busy} onClick={() => onAction({
        action: 'reopen'
      })}>Reopen application</button>}{edit && c.stage === 'Hold' && <button disabled={busy} onClick={() => onAction({
        action: 'select-hold'
      })}>Select held candidate</button>}
{['Selected', 'Offer'].includes(c.stage) && <><h3>Offer package</h3><p>Negotiated CTC: ₹{c.negotiatedCTC || 'Not submitted'}</p>{edit && <div className="inline-form"><Field label="Negotiated annual CTC (₹)" value={ctc} onChange={setCtc} /><button disabled={busy || !ctc} onClick={() => {
            if (!c.negotiatedCTC || confirm('Resubmit package? All offer approvals and outcomes will reset.')) onAction({
              action: 'package',
              ctc
            });
          }}>{c.negotiatedCTC ? 'Revise & resubmit' : 'Submit for approval'}</button></div>}{c.offerPackageApprovals && <ApprovalTrack track={c.offerPackageApprovals} role={role} busy={busy} onDecision={(step, decision) => onAction({
          action: 'package-approval',
          step,
          decision
        })} />}<h3>Offer letter</h3>{edit && STEPS.every(([k]) => c.offerPackageApprovals?.[k]?.status === 'Approved') && (!c.offerLetterGenerated || c.offerLetterApproval?.status === 'Rejected') && <button disabled={busy} onClick={() => onAction({
          action: 'generate-letter'
        })}>{c.offerLetterGenerated ? 'Resubmit letter' : 'Generate letter'}</button>}{c.offerLetterGenerated && <><Badge>{c.offerLetterApproval?.status}</Badge><a className="button secondary" href={`/api/candidates/${c.id}/offer.pdf`} download>Download offer PDF</a>{(isAdminRole(role) || role === 'taHead') && c.offerLetterApproval?.status === 'Pending' && <div className="actions"><button disabled={busy} onClick={() => onAction({
              action: 'letter-approval',
              decision: 'Approved'
            })}>Approve letter</button><button disabled={busy} className="danger" onClick={() => onAction({
              action: 'letter-approval',
              decision: 'Rejected'
            })}>Reject letter</button></div>}{edit && c.offerLetterApproval?.status === 'Approved' && !c.offerShared && <button disabled={busy} onClick={() => onAction({
            action: 'share-offer'
          })}>Release offer for sharing</button>}{c.offerShared && <p>Released {new Date(c.offerShared).toLocaleString()}. Download the PDF and send it to the candidate.</p>}{edit && c.offerShared && !c.offerStatus && <div className="actions">{['Accepted', 'Declined', 'No-show'].map(outcome => <button className={outcome === 'Accepted' ? '' : 'danger'} key={outcome} disabled={busy} onClick={() => onAction({
              action: 'offer-outcome',
              outcome
            })}>{outcome}</button>)}</div>}{edit && c.offerStatus === 'Accepted' && <button disabled={busy} onClick={() => onAction({
            action: 'hire'
          })}>Mark hired & create employee</button>}</>}</>}{c.stage === 'Hired' && <><h3>Employee created</h3><p>Hired on {c.hiredDate}. The People Repository contains the employee record.</p>{edit && <button className="secondary" disabled={busy} onClick={onSync}>Sync employee record</button>}</>}</>}
{tab === 'interviews' && <Interviews c={c} edit={edit} review={review} busy={busy} onAction={onAction} employees={employees} />}{tab === 'activity' && <div className="timeline">{[...(c.activity || [])].reverse().map((a, i) => <div key={i}><b>{a.message}</b><small>{new Date(a.date).toLocaleString()}</small></div>)}{!c.activity?.length && <Empty text="No activity yet" />}</div>}</>;
}
function Interviews({
  c,
  edit,
  review,
  busy,
  onAction,
  employees
}) {
  const rounds = nextRounds(c);
  const [s, setS] = useState({
      round: rounds[0] || 'Round 1',
      date: today(),
      time: '10:00',
      hiringManager: ''
    }),
    [feedback, setFeedback] = useState(null),
    [reschedule, setReschedule] = useState(null);
  useEffect(() => {
    setS(p => ({
      ...p,
      round: rounds[0] || 'Round 1'
    }));
  }, [c]);
  return <><p className="muted">Interview times use Asia/Kolkata (IST). Round 1 is mandatory; optional rounds lead to the Final Round.</p>{edit && c.stage === 'Interviewing' && rounds.length > 0 && !c.interviews.some(r => r.status === 'Scheduled') && <form className="card" onSubmit={e => {
      e.preventDefault();
      onAction({
        action: 'schedule',
        ...s
      });
    }}><h3>Schedule interview</h3><div className="form-grid"><Field label="Round" value={s.round} onChange={round => setS({
          ...s,
          round
        })} options={rounds} /><Field label="Date" type="date" value={s.date} onChange={date => setS({
          ...s,
          date
        })} required /><Field label="Time (IST)" type="time" value={s.time} onChange={time => setS({
          ...s,
          time
        })} required /><Field label="Interviewer" value={s.hiringManager} onChange={hiringManager => setS({
          ...s,
          hiringManager
        })} required /></div><button disabled={busy}>Schedule round</button></form>}{c.interviews?.map(r => <article key={r.id} className="card"><div className="row"><h3>{r.round}</h3><Badge>{r.status}</Badge></div><p>{r.date} at {r.time} IST · {r.hiringManager}</p><p>Decision: {r.decision} · {r.feedback || 'No feedback yet'}</p>{r.scorecard && <p>Communication {r.scorecard.communication}/5 · Technical {r.scorecard.technical}/5 · Culture {r.scorecard.culture}/5</p>}<div className="actions"><a className="button secondary" href={`/api/candidates/${c.id}/interviews/${r.id}/calendar.ics`} download>Calendar invite</a>{review && r.status === 'Scheduled' && <><button disabled={busy} onClick={() => setFeedback({
            roundId: r.id,
            round: r.round,
            decision: r.round === 'Final Round' ? 'Selected' : 'Proceed',
            feedback: '',
            scorecard: {
              communication: 3,
              technical: 3,
              culture: 3
            }
          })}>Add feedback</button><button className="danger" disabled={busy} onClick={() => onAction({
            action: 'no-show',
            roundId: r.id
          })}>Mark no-show</button></>}{review && ['Scheduled', 'No-show'].includes(r.status) && <button className="secondary" onClick={() => setReschedule({
          roundId: r.id,
          date: r.date,
          time: r.time
        })}>Reschedule</button>}</div>{reschedule?.roundId === r.id && <form onSubmit={e => {
        e.preventDefault();
        onAction({
          action: 'reschedule',
          ...reschedule
        });
        setReschedule(null);
      }}><div className="form-grid"><Field label="New date" type="date" value={reschedule.date} onChange={date => setReschedule({
            ...reschedule,
            date
          })} required /><Field label="New time (IST)" type="time" value={reschedule.time} onChange={time => setReschedule({
            ...reschedule,
            time
          })} required /></div><button disabled={busy}>Save time</button></form>}{feedback?.roundId === r.id && <form onSubmit={e => {
        e.preventDefault();
        onAction({
          action: 'feedback',
          ...feedback
        });
        setFeedback(null);
      }}><Field label="Decision" value={feedback.decision} onChange={decision => setFeedback({
          ...feedback,
          decision
        })} options={r.round === 'Final Round' ? ['Selected', 'Hold', 'Rejected'] : ['Proceed', 'Rejected']} /><Field label="Feedback" type="textarea" value={feedback.feedback} onChange={v => setFeedback({
          ...feedback,
          feedback: v
        })} /><div className="form-grid">{['communication', 'technical', 'culture'].map(k => <Field key={k} label={k + ' (1–5)'} type="number" min={1} max={5} value={feedback.scorecard[k]} onChange={v => setFeedback({
            ...feedback,
            scorecard: {
              ...feedback.scorecard,
              [k]: Number(v)
            }
          })} required />)}</div><button disabled={busy || !feedback.feedback.trim()}>Save feedback</button><button type="button" className="ghost" onClick={() => setFeedback(null)}>Cancel</button></form>}</article>)}{!c.interviews?.length && <Empty text="No interviews scheduled yet. Shortlist this candidate from Workflow first." />}</>;
}
function Reports({
  db
}) {
  const [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const cs = db.candidates.filter(c => (!start || c.appliedDate >= start) && (!end || c.appliedDate <= end));
  const stages = STAGES.map((name, index) => {
    const count = cs.filter(candidate => candidate.stage === name).length;
    return {
      name,
      count,
      share: cs.length ? Math.round(count / cs.length * 100) : 0,
      index
    };
  });
  const approvalLevels = STEPS.map(([key, label]) => {
    const counts = db.jobs.reduce((totals, job) => {
      const status = job.approvals?.[key]?.status || 'Pending';
      totals[status] = (totals[status] || 0) + 1;
      return totals;
    }, {});
    return {
      key,
      label,
      approved: counts.Approved || 0,
      pending: counts.Pending || 0,
      rejected: counts.Rejected || 0,
      completion: db.jobs.length ? Math.round((counts.Approved || 0) / db.jobs.length * 100) : 0
    };
  });
  const sources = [...new Set(cs.map(candidate => candidate.source || 'Other'))]
    .map(name => ({
      name,
      count: cs.filter(candidate => (candidate.source || 'Other') === name).length
    }))
    .sort((a, b) => b.count - a.count);
  const departments = [...new Set(db.employees.map(employee => employee.dept || 'Unassigned'))]
    .map(name => ({
      name,
      count: db.employees.filter(employee => (employee.dept || 'Unassigned') === name && employee.status === 'Active').length
    }))
    .sort((a, b) => b.count - a.count);
  const hired = cs.filter(candidate => candidate.stage === 'Hired').length;
  const interviewNoShows = cs.reduce((total, candidate) =>
    total + (candidate.interviews || []).filter(interview => interview.status === 'No-show').length, 0);
  const offers = cs.filter(candidate => candidate.offerStatus || ['Offer', 'Hired'].includes(candidate.stage));
  const acceptedOffers = offers.filter(candidate => candidate.offerStatus === 'Accepted').length;
  const openJobs = db.jobs.filter(job => ['Live', 'Pending Approval'].includes(statusJob(job))).length;
  const maxSource = Math.max(1, ...sources.map(source => source.count));
  const maxDepartment = Math.max(1, ...departments.map(department => department.count));
  const exportReport = () => download('hr-report.csv', csv([
    ['Candidate', 'Job', 'Source', 'Stage', 'Applied', 'Offer outcome', 'Hired date'],
    ...cs.map(candidate => [
      candidate.name,
      db.jobs.find(job => job.id === candidate.jobId)?.jobCode,
      candidate.source,
      candidate.stage,
      candidate.appliedDate,
      candidate.offerStatus,
      candidate.hiredDate
    ])
  ]), 'text/csv;charset=utf-8');

  return <section className="analytics">
    <div className="analytics-toolbar">
      <div>
        <span className="eyebrow">Hiring performance</span>
        <p className="muted">Filter candidate metrics by application date. Approval and headcount metrics show current totals.</p>
      </div>
      <div className="filters analytics-filters">
        <Field label="Applied from" type="date" value={start} onChange={setStart} />
        <Field label="Applied through" type="date" value={end} onChange={setEnd} />
        <button className="secondary" onClick={exportReport}>Export CSV</button>
      </div>
    </div>
    <div className="analytics-kpis">
      <article className="analytics-kpi"><span>Total candidates</span><strong>{cs.length}</strong><small>Within selected dates</small></article>
      <article className="analytics-kpi"><span>Hired</span><strong>{hired}</strong><small>{cs.length ? Math.round(hired / cs.length * 100) : 0}% of candidates</small></article>
      <article className="analytics-kpi"><span>Offer acceptance</span><strong>{offers.length ? Math.round(acceptedOffers / offers.length * 100) : 0}%</strong><small>{acceptedOffers} accepted of {offers.length} offers</small></article>
      <article className="analytics-kpi"><span>Open requisitions</span><strong>{openJobs}</strong><small>{db.jobs.filter(job => statusJob(job) === 'Pending Approval').length} awaiting approval</small></article>
      <article className="analytics-kpi"><span>Interview no-shows</span><strong>{interviewNoShows}</strong><small>Within selected dates</small></article>
    </div>

    <div className="analytics-grid">
      <section className="analytics-panel">
        <div className="analytics-panel-heading"><div><span className="eyebrow">Recruitment</span><h2>Candidate pipeline</h2></div><span className="chart-caption">{cs.length} applications</span></div>
        <div className="pipeline-chart" aria-label="Candidates grouped by recruitment stage">
          {stages.map(stage => <div className="pipeline-row" key={stage.name}>
            <div className="pipeline-label"><span>{stage.name}</span><b>{stage.count}</b></div>
            <div className="pipeline-track" role="progressbar" aria-label={`${stage.name} candidates`} aria-valuenow={stage.share} aria-valuemin="0" aria-valuemax="100">
              <span className={`pipeline-fill stage-${stage.index}`} style={{ width: `${stage.share}%` }} />
            </div>
            <small>{stage.share}%</small>
          </div>)}
          {!cs.length && <Empty text="No applications match this date range." />}
        </div>
      </section>

      <section className="analytics-panel">
        <div className="analytics-panel-heading"><div><span className="eyebrow">Governance</span><h2>Approval levels</h2></div><span className="chart-caption">{db.jobs.length} requisitions</span></div>
        <div className="approval-levels">
          {approvalLevels.map((level, index) => <article className="level-card" key={level.key}>
            <div className="level-heading"><span className="level-number">{String(index + 1).padStart(2, '0')}</span><div><b>{level.label}</b><small>{level.completion}% approved</small></div></div>
            <div className="level-progress" role="progressbar" aria-label={`${level.label} approvals`} aria-valuenow={level.completion} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${level.completion}%` }} /></div>
            <div className="level-counts"><span><i className="level-dot approved" />{level.approved} approved</span><span><i className="level-dot pending" />{level.pending} pending</span><span><i className="level-dot rejected" />{level.rejected} rejected</span></div>
          </article>)}
          {!db.jobs.length && <Empty text="Requisitions will appear here as approval steps begin." />}
        </div>
        <p className="analytics-note">Approval completion is based on all requisitions and follows the configured HOD → Site Head → TA Head sequence.</p>
      </section>

      <section className="analytics-panel">
        <div className="analytics-panel-heading"><div><span className="eyebrow">Sourcing</span><h2>Candidate sources</h2></div></div>
        {sources.length ? <div className="insight-list">{sources.map(source => <div className="insight-row" key={source.name}>
          <div className="insight-label"><span>{source.name}</span><b>{source.count}</b></div>
          <div className="insight-track"><span style={{ width: `${source.count / maxSource * 100}%` }} /></div>
        </div>)}</div> : <Empty text="Source insights will appear when candidates are added." />}
      </section>

      <section className="analytics-panel">
        <div className="analytics-panel-heading"><div><span className="eyebrow">People</span><h2>Active headcount</h2></div><span className="chart-caption">{db.employees.filter(employee => employee.status === 'Active').length} people</span></div>
        {departments.length ? <div className="insight-list">{departments.slice(0, 6).map(department => <div className="insight-row" key={department.name}>
          <div className="insight-label"><span>{department.name}</span><b>{department.count}</b></div>
          <div className="insight-track insight-track-green"><span style={{ width: `${department.count / maxDepartment * 100}%` }} /></div>
        </div>)}</div> : <Empty text="Add employees to see department headcount." />}
      </section>
    </div>

    <section className="analytics-panel outcomes-panel">
      <div className="analytics-panel-heading"><div><span className="eyebrow">Hiring outcomes</span><h2>Requisition performance</h2></div></div>
      {db.jobs.length ? <Table headers={['Code', 'Role', 'Status', 'Applicants', 'Hired', 'Openings']}>{db.jobs.map(job => <tr key={job.id}>
        <td>{job.jobCode}</td><td>{job.title}</td><td><Badge>{statusJob(job)}</Badge></td>
        <td>{cs.filter(candidate => candidate.jobId === job.id).length}</td>
        <td>{cs.filter(candidate => candidate.jobId === job.id && candidate.stage === 'Hired').length}</td>
        <td>{job.openings}</td>
      </tr>)}</Table> : <Empty text="Requisition performance will appear here when roles are created." />}
      <p className="muted analytics-footnote">Candidate and hiring outcomes use the selected application date range. Approval and headcount metrics use current records.</p>
    </section>
  </section>;
}
function Settings({
  user,
  employees,
  features,
  run,
  busy,
  onError
}) {
  const [p, setP] = useState({
      current: '',
      password: ''
    }),
    [u, setU] = useState({
      name: '',
      email: '',
      password: '',
      role: 'recruiter',
      employeeId: ''
    }),
    [users, setUsers] = useState([]);
  useEffect(() => {
    if (isAdminRole(user.role) && features.staffAccounts) {
      api('/users').then(setUsers).catch(error => onError(error.message));
    }
  }, []);
  return <><h3>Change password</h3><form onSubmit={e => {
      e.preventDefault();
      run(async () => {
        await api('/auth/password', 'POST', p);
        setP({
          current: '',
          password: ''
        });
      }, 'Password changed');
    }}><Field label="Current password" type="password" value={p.current} onChange={current => setP({
        ...p,
        current
      })} required /><Field label="New password (10+ characters)" type="password" value={p.password} onChange={password => setP({
        ...p,
        password
      })} required /><button disabled={busy}>Change password</button></form>{isAdminRole(user.role) && features.staffAccounts && <><h3>Create staff login</h3><form onSubmit={e => {
        e.preventDefault();
        run(async () => {
          await api('/users', 'POST', u);
          setUsers(await api('/users'));
          setU({
            name: '',
            email: '',
            password: '',
            role: 'recruiter',
            employeeId: ''
          });
        }, 'User created');
      }}><div className="form-grid">{['name', 'email', 'password'].map(k => <Field key={k} label={k} type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'} value={u[k]} onChange={v => setU({
            ...u,
            [k]: v
          })} required />)}<Field label="Role" value={u.role} onChange={role => setU({
            ...u,
            role
          })}           options={['recruiter', 'manager', 'hod', 'siteHead', 'taHead', 'admin', 'superadmin']} />{u.role === 'manager' && <Field label="Linked employee" value={u.employeeId} onChange={employeeId => setU({
            ...u,
            employeeId
          })} options={[{
            value: '',
            label: 'Select employee'
          }, ...employees.map(e => ({
            value: e.id,
            label: e.name
          }))]} required />}</div><button disabled={busy}>Create login</button></form><h3>Staff accounts</h3><Table headers={['Name', 'Email', 'Role']}>{users.map(x => <tr key={x._id}><td>{x.name}</td><td>{x.email}</td><td>{x.role}</td></tr>)}</Table></>}{isAdminRole(user.role) && features.dataBackup && <><h3>Backup</h3><p>Download a JSON backup including resumes. Use the MongoDB backup commands in README for complete recovery.</p><button disabled={busy} onClick={() => run(async () => {
        download('udata-hr-backup-' + today() + '.json', JSON.stringify(await api('/backup'), null, 2));
      }, 'Backup downloaded')}>Download JSON backup</button></>}</>;
}
