# Recruitment UI Redesign QA

Reference assets:
- `/Users/wangjingchuan/Downloads/tangren-ui-redesign-v2/tangren-02-jobs.png`
- `/Users/wangjingchuan/Downloads/tangren-ui-redesign-v2/tangren-02-candidates.png`
- `/Users/wangjingchuan/Downloads/tangren-ui-redesign-v2/tangren-02-talent.png`
- `/Users/wangjingchuan/Downloads/tangren-ui-redesign-v2/tangren-candidates-competitor-card-actions-refined.png`

Checked pages:
- Jobs / recruitment requirements: left demand list, candidate table, match/status tags, toolbar buttons.
- Candidates: stage stats, position scope sidebar, candidate rows, match percentage, status and actions.
- Talent pool: left queue, filter toolbar, source/status tags, AI recommended role, potential direction, entry time, actions.

Screenshots:
- `design-qa-screenshots/jobs.png`
- `design-qa-screenshots/candidates.png`
- `design-qa-screenshots/candidates-list-fixes.png`
- `design-qa-screenshots/candidates-list-footer-match.png`
- `design-qa-screenshots/candidates-horizontal-sync.png`
- `design-qa-screenshots/candidates-card-refined.png`
- `design-qa-screenshots/talent-final.png`
- `design-qa-screenshots/talent-tooltip.png`
- `design-qa-screenshots/talent-overflow-tooltip.png`
- `design-qa-screenshots/talent-row-click-columns.png`

Verification:
- `npm run typecheck` passed.
- Chrome visual check passed at 1920x814 for all three target pages.
- No document-level horizontal overflow observed.
- Talent pool status label wrapping was corrected by moving status into the source column.
- Talent pool follow-up fixes checked: hidden empty candidate info placeholders, source text changed from AI unrecognized to no system-position match, long recommendation/potential copy gets native hover titles, per-row entry-time subtitles removed, and row actions stay on one line.
- Talent pool row actions use immediate custom hover/focus tooltips instead of delayed native browser titles.
- Talent pool text columns use immediate custom tooltips only when the displayed content is actually truncated or line-clamped.
- Talent pool column widths were rebalanced to give potential direction more room while keeping actions compact.
- Talent pool row click opens candidate detail again; row action buttons stop propagation and keep their own behavior.
- Candidate list follow-up fixes checked: candidate and position columns narrowed, status source line hidden in JSX comments for later reuse, detail action removed because row click opens detail, reject icon changed from trash to a prohibited action icon, action buttons stay on one line, footer range has 20px left padding again, match percentage is 20px, and row click opens detail.
- Candidate list card redesign checked against `tangren-candidates-competitor-card-actions-refined.png`: table header and horizontal scrolling were removed, each candidate renders as a card with profile, experience, applied-position metadata, AI match/action panel, and bottom fit summary. Row click still opens candidate detail, row actions stop propagation, and no document-level horizontal overflow was observed.

Final result: passed.
