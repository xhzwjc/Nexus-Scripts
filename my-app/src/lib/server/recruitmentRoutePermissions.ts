export const RECRUITMENT_INTERVIEW_SCOPED_PERMISSIONS: string[] = [
  "recruitment-interview-view",
  "recruitment-interview-act",
  "recruitment-interview-manage",
];

export const RECRUITMENT_REVIEW_SCOPED_PERMISSIONS: string[] = [
  "recruitment-review-view",
  "recruitment-review-act",
];

export const RECRUITMENT_TASK_EVENT_PERMISSIONS: string[] = [
  "recruitment-process-execute",
  "recruitment-log-view",
  ...RECRUITMENT_REVIEW_SCOPED_PERMISSIONS,
  ...RECRUITMENT_INTERVIEW_SCOPED_PERMISSIONS,
];

export const RECRUITMENT_CANDIDATE_INTERVIEW_SCHEDULE_PERMISSIONS: string[] = [
  "recruitment-dashboard-view",
  ...RECRUITMENT_INTERVIEW_SCOPED_PERMISSIONS,
];
