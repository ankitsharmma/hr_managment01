export const steps = ['hod', 'siteHead', 'taHead'];
export const stages = ['Applied', 'Interviewing', 'Selected', 'Hold', 'Offer', 'Hired', 'Rejected'];
export const track = () => Object.fromEntries(steps.map(k => [k, {
  status: 'Pending',
  by: '',
  date: ''
}]));
export const jobStage = j => j.cancelled ? 'Cancelled' : j.closed ? 'Closed' : steps.some(k => j.approvals?.[k]?.status === 'Rejected') ? 'Rejected' : steps.every(k => j.approvals?.[k]?.status === 'Approved') ? 'Live' : 'Pending Approval';
export function assert(ok, msg) {
  if (!ok) {
    const e = new Error(msg);
    e.status = 400;
    throw e;
  }
}
export function decide(t, key, decision, by) {
  const i = steps.indexOf(key);
  assert(i >= 0, 'Invalid approval step');
  assert(['Approved', 'Rejected'].includes(decision), 'Invalid decision');
  assert(t?.[key]?.status === 'Pending', 'Step already decided');
  assert(steps.slice(0, i).every(k => t[k].status === 'Approved'), 'Previous approval is pending');
  t[key] = {
    status: decision,
    by,
    date: new Date().toISOString()
  };
  return t;
}
export function nextRounds(c) {
  const rs = c.interviews || [];
  if (rs.some(r => r.round === 'Final Round')) return [];
  const done = n => rs.some(r => r.round === n && r.status === 'Completed' && r.decision === 'Proceed');
  if (!done('Round 1')) return ['Round 1'];
  if (!done('Round 2') && !done('Round 3')) return ['Round 2', 'Final Round'];
  if (done('Round 2') && !done('Round 3')) return ['Round 3', 'Final Round'];
  return ['Final Round'];
}
export function actionCandidate(c, body, actor) {
  const {
    action
  } = body;
  const approved = () => steps.every(k => c.offerPackageApprovals?.[k]?.status === 'Approved');
  if (action === 'share-cv') {
    assert(c.stage === 'Applied', 'CV sharing is available in Applied stage');
    assert(body.manager?.trim(), 'Select a manager');
    c.cvSharedWith = body.manager;
    c.cvShareStatus = 'Shared';
  } else if (action === 'shortlist') {
    assert(c.stage === 'Applied', 'Only applied candidates can be shortlisted');
    c.shortlisted = true;
    c.cvShareStatus = 'Shortlisted';
    c.stage = 'Interviewing';
  } else if (action === 'reject') {
    assert(c.stage !== 'Hired', 'Cannot reject a hired candidate');
    assert(body.reason?.trim(), 'Rejection reason required');
    c.stage = 'Rejected';
    c.cvShareStatus = 'Rejected';
    c.rejectionReason = body.reason;
  } else if (action === 'schedule') {
    assert(c.shortlisted && c.stage === 'Interviewing', 'Shortlist candidate before scheduling');
    assert(!(c.interviews || []).some(r => r.status === 'Scheduled'), 'Complete the scheduled round first');
    assert(nextRounds(c).includes(body.round), 'Round is not available');
    assert(body.date && body.time && body.hiringManager?.trim(), 'Date, time and interviewer required');
    c.interviews.push({
      id: crypto.randomUUID(),
      round: body.round,
      date: body.date,
      time: body.time,
      hiringManager: body.hiringManager,
      status: 'Scheduled',
      decision: 'Pending',
      feedback: '',
      scorecard: null
    });
  } else if (['feedback', 'no-show', 'reschedule'].includes(action)) {
    const r = c.interviews.find(r => r.id === body.roundId);
    assert(r, 'Interview not found');
    assert(r.status === 'Scheduled' || action === 'reschedule' && r.status === 'No-show', 'Round cannot be changed');
    if (action === 'no-show') {
      r.status = 'No-show';
      r.decision = 'Pending';
    } else if (action === 'reschedule') {
      assert(body.date && body.time, 'Date and time required');
      r.date = body.date;
      r.time = body.time;
      r.status = 'Scheduled';
    } else {
      const options = r.round === 'Final Round' ? ['Selected', 'Hold', 'Rejected'] : ['Proceed', 'Rejected'];
      assert(options.includes(body.decision), 'Invalid interview decision');
      assert(body.feedback?.trim(), 'Feedback required');
      assert(['communication', 'technical', 'culture'].every(k => Number(body.scorecard?.[k]) >= 1 && Number(body.scorecard?.[k]) <= 5), 'Scores must be 1–5');
      Object.assign(r, {
        status: 'Completed',
        decision: body.decision,
        feedback: body.feedback,
        scorecard: body.scorecard
      });
      if (['Selected', 'Hold', 'Rejected'].includes(body.decision)) c.stage = body.decision;
      if (body.decision === 'Rejected') c.rejectionReason = body.feedback;
    }
  } else if (action === 'select-hold') {
    assert(c.stage === 'Hold', 'Candidate is not on hold');
    c.stage = 'Selected';
  } else if (action === 'package') {
    assert(['Selected', 'Offer'].includes(c.stage), 'Select candidate first');
    assert(Number(String(body.ctc).replace(/,/g, '')) > 0, 'Valid CTC required');
    c.negotiatedCTC = body.ctc;
    c.offerPackageApprovals = track();
    c.offerLetterGenerated = false;
    c.offerLetterApproval = null;
    c.offerShared = '';
    c.offerStatus = '';
    c.stage = 'Selected';
  } else if (action === 'package-approval') {
    assert(['Selected', 'Offer'].includes(c.stage), 'Candidate is not selected');
    decide(c.offerPackageApprovals, body.step, body.decision, actor);
  } else if (action === 'generate-letter') {
    assert(approved(), 'Package approval required');
    assert(!c.offerLetterGenerated || c.offerLetterApproval?.status === 'Rejected', 'Letter already generated');
    c.offerLetterGenerated = true;
    c.offerLetterApproval = {
      status: 'Pending',
      by: '',
      date: ''
    };
    c.stage = 'Offer';
  } else if (action === 'letter-approval') {
    assert(c.offerLetterGenerated && c.offerLetterApproval?.status === 'Pending', 'Letter is not pending');
    assert(['Approved', 'Rejected'].includes(body.decision), 'Invalid decision');
    c.offerLetterApproval = {
      status: body.decision,
      by: actor,
      date: new Date().toISOString()
    };
  } else if (action === 'share-offer') {
    assert(c.offerLetterApproval?.status === 'Approved', 'Approve letter first');
    assert(!c.offerShared, 'Offer already released');
    c.offerShared = new Date().toISOString();
  } else if (action === 'offer-outcome') {
    assert(c.offerShared && c.stage === 'Offer' && !c.offerStatus, 'Release offer first');
    assert(['Accepted', 'Declined', 'No-show'].includes(body.outcome), 'Invalid outcome');
    c.offerStatus = body.outcome;
    if (body.outcome !== 'Accepted') {
      c.stage = 'Rejected';
      c.rejectionReason = 'Offer ' + body.outcome;
    }
  } else if (action === 'hire') {
    assert(c.offerStatus === 'Accepted' && c.stage === 'Offer', 'Accepted offer required');
    c.stage = 'Hired';
    c.hiredDate = new Date().toISOString().slice(0, 10);
  } else if (action === 'reopen') {
    assert(c.stage === 'Rejected', 'Only rejected candidates can be reopened');
    assert(!c.offerLetterGenerated, 'Create a new application after an offer rejection');
    c.stage = 'Applied';
    c.shortlisted = false;
    c.cvShareStatus = '';
    c.interviews = [];
    c.rejectionReason = '';
  } else assert(false, 'Unknown action');
  c.activity.push({
    date: new Date().toISOString(),
    message: `${action}${body.decision ? ' — ' + body.decision : ''} by ${actor}`
  });
  return c;
}
