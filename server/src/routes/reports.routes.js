import { Candidate, Employee, Job } from '../models.js';

const stages = ['Applied', 'Interviewing', 'Selected', 'Hold', 'Offer', 'Hired', 'Rejected'];

export function registerReportRoutes(app, { wrap, jobStage }) {
  app.get('/api/reports/summary', wrap(async (req, res) => {
    const query = {};
    if (req.query.from || req.query.through) {
      query.appliedDate = {};
      if (req.query.from) query.appliedDate.$gte = String(req.query.from);
      if (req.query.through) query.appliedDate.$lte = String(req.query.through);
    }

    const [employees, jobs, candidates] = await Promise.all([
      Employee.find().select('status'),
      Job.find().select('id jobCode title openings closed cancelled approvals'),
      Candidate.find(query).select('jobId source stage offerStatus interviews')
    ]);
    const stageCounts = Object.fromEntries(stages.map(stage => [
      stage,
      candidates.filter(candidate => candidate.stage === stage).length
    ]));
    const sources = {};
    for (const candidate of candidates) {
      const source = candidate.source || 'Other';
      sources[source] = (sources[source] || 0) + 1;
    }

    res.json({
      totals: {
        employees: employees.length,
        activeEmployees: employees.filter(employee => employee.status === 'Active').length,
        requisitions: jobs.length,
        liveRequisitions: jobs.filter(job => jobStage(job) === 'Live').length,
        pendingApprovals: jobs.filter(job => jobStage(job) === 'Pending Approval').length,
        candidates: candidates.length,
        offersAccepted: candidates.filter(candidate => candidate.offerStatus === 'Accepted').length,
        interviewNoShows: candidates.reduce((total, candidate) =>
          total + (candidate.interviews || []).filter(interview => interview.status === 'No-show').length, 0)
      },
      stages: stageCounts,
      sources,
      requisitions: jobs.map(job => ({
        id: job.id,
        jobCode: job.jobCode,
        title: job.title,
        status: jobStage(job),
        openings: job.openings,
        applicants: candidates.filter(candidate => candidate.jobId === job.id).length,
        hired: candidates.filter(candidate => candidate.jobId === job.id && candidate.stage === 'Hired').length
      }))
    });
  }));
}
