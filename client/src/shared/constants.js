export const SECTIONS = [
  ['Recruitment Module', [
    ['job-requisition', 'Job Requisition'],
    ['candidates', 'Candidates'],
    ['referred-candidates', 'Referred Candidates'],
    ['interview-pipeline', 'Interview Pipeline'],
    ['offers', 'Offers']
  ]],
  ['People Repository', [
    ['all-employees', 'All Employees'],
    ['documents', 'Documents'],
    ['org-chart', 'Org Chart']
  ]],
  ['Hiring Manager', [
    ['my-requests', 'My Requests'],
    ['approvals', 'Approvals'],
    ['reports', 'People Analytics'],
    ['notifications', 'Notifications']
  ]]
];

export const STEPS = [['hod', 'HOD'], ['siteHead', 'Site Head'], ['taHead', 'TA Head']];
export const STAGES = ['Applied', 'Interviewing', 'Selected', 'Hold', 'Offer', 'Hired', 'Rejected'];
export const today = () => new Date().toISOString().slice(0, 10);
export const isAdminRole = role => role === 'admin' || role === 'superadmin';
export const DEFAULT_APP_CONFIG = {
  features: {
    notifications: true,
    reports: true,
    resumeUploads: true,
    staffAccounts: true,
    dataBackup: true
  },
  uploadMaxSizeMb: 8
};

export const statusJob = job => job.cancelled
  ? 'Cancelled'
  : job.closed
    ? 'Closed'
    : STEPS.some(([key]) => job.approvals?.[key]?.status === 'Rejected')
      ? 'Rejected'
      : STEPS.every(([key]) => job.approvals?.[key]?.status === 'Approved')
        ? 'Live'
        : 'Pending Approval';

export function nextRounds(candidate) {
  const interviews = candidate.interviews || [];
  if (interviews.some(round => round.round === 'Final Round')) return [];

  const completed = name => interviews.some(round =>
    round.round === name && round.status === 'Completed' && round.decision === 'Proceed'
  );

  if (!completed('Round 1')) return ['Round 1'];
  if (!completed('Round 2') && !completed('Round 3')) return ['Round 2', 'Final Round'];
  if (completed('Round 2') && !completed('Round 3')) return ['Round 3', 'Final Round'];
  return ['Final Round'];
}

export const safeLink = value => /^https?:\/\//i.test(value || '');
