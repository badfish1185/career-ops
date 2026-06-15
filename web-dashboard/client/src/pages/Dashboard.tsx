import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  BarChart3,
  Briefcase,
  Check,
  CheckCircle,
  Clipboard,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import CommandPlaybook from '../components/CommandPlaybook';
import DispositionDock from '../components/DispositionDock';
import PrimaryActionBar from '../components/PrimaryActionBar';
import StagePath from '../components/StagePath';
import { StateBlock, StateSkeleton } from '../components/StateBlock';
import StatusBadge from '../components/StatusBadge';
import TrackerWriteback from '../components/TrackerWriteback';
import { copyTextToClipboard } from '../utils/clipboard';
import '../styles/Dashboard.css';

type StatusKey = 'all' | 'evaluated' | 'applied' | 'responded' | 'interview' | 'offer' | 'top' | 'skip' | 'rejected' | 'discarded';
type SortKey = 'score' | 'date' | 'company' | 'status';
type SavedViewKey = 'command' | 'topfits' | 'evaluation' | 'followups' | 'interviews';

interface ReportSummary {
  filename: string;
  url?: string;
  legitimacy?: string;
  archetype?: string;
  recommendation?: string;
  remote?: string;
  comp?: string;
  tldr?: string;
  redFlags?: string[];
  actionPlan?: string[];
}

interface ApplicationAction {
  id: string;
  label: string;
  mode?: string;
  command: string;
  helper: string;
  suggestedStatus?: string;
  tone: 'elite' | 'strong' | 'risk' | 'neutral';
  brief: string;
}

interface Application {
  id: string;
  number: number;
  date: string;
  company: string;
  role: string;
  score: number | null;
  scoreRaw: string;
  status: string;
  statusKey: StatusKey;
  statusLabel: string;
  pdf: boolean;
  report: string | null;
  reportFilename: string | null;
  jobUrl: string;
  notes: string;
  summary: ReportSummary | null;
  actions?: ApplicationAction[];
}

interface CountDatum {
  id?: string;
  status?: string;
  label: string;
  count: number;
  pct?: number;
}

interface Metrics {
  total: number;
  active: number;
  actionable: number;
  evaluated: number;
  topFits: number;
  avgScore: number;
  topScore: number;
  withPdf: number;
  statusGroups: CountDatum[];
  funnel: CountDatum[];
  scoreBuckets: CountDatum[];
  weeklyActivity: { week: string; count: number }[];
  rates: {
    response: number;
    interview: number;
    offer: number;
  };
}

interface DashboardPayload {
  generatedAt: string;
  metrics: Metrics;
  applications: Application[];
  topCandidates: Application[];
  nextActions: Application[];
}

interface ReportNavigationContext {
  stage?: StatusKey;
  sort?: SortKey;
  query?: string;
  view?: SavedViewKey;
}

const API_BASE = '';

const tabs: { key: StatusKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'evaluated', label: 'Evaluated' },
  { key: 'applied', label: 'Applied' },
  { key: 'responded', label: 'Responded' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'top', label: 'Top 4+' },
  { key: 'skip', label: 'Skip' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'discarded', label: 'Discarded' },
];

const sortLabels: Record<SortKey, string> = {
  score: 'Score',
  date: 'Date',
  company: 'Company',
  status: 'Status',
};

const savedViews: {
  key: SavedViewKey;
  label: string;
  helper: string;
  tab: StatusKey;
  sortKey: SortKey;
}[] = [
  { key: 'command', label: 'Today', helper: 'Default queue', tab: 'all', sortKey: 'score' },
  { key: 'topfits', label: 'Top fits', helper: 'Score 4.0+', tab: 'top', sortKey: 'score' },
  { key: 'evaluation', label: 'Evaluation', helper: 'Decision queue', tab: 'evaluated', sortKey: 'score' },
  { key: 'followups', label: 'Follow-ups', helper: 'Applied queue', tab: 'applied', sortKey: 'date' },
  { key: 'interviews', label: 'Interviews', helper: 'Prep focus', tab: 'interview', sortKey: 'date' },
];

const statusOptions = [
  { key: 'evaluated', label: 'Evaluated' },
  { key: 'applied', label: 'Applied' },
  { key: 'responded', label: 'Responded' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'discarded', label: 'Discarded' },
  { key: 'skip', label: 'SKIP' },
];

const defaultPayload: DashboardPayload = {
  generatedAt: '',
  metrics: {
    total: 0,
    active: 0,
    actionable: 0,
    evaluated: 0,
    topFits: 0,
    avgScore: 0,
    topScore: 0,
    withPdf: 0,
    statusGroups: [],
    funnel: [],
    scoreBuckets: [],
    weeklyActivity: [],
    rates: { response: 0, interview: 0, offer: 0 },
  },
  applications: [],
  topCandidates: [],
  nextActions: [],
};

const formatScore = (score: number | null) => (typeof score === 'number' ? score.toFixed(1) : 'N/A');

const shortWeek = (week: string) => week.includes('-') ? week.split('-')[1] : week;

const getQueryParam = (key: string) => new URLSearchParams(window.location.search).get(key) || '';

const isStatusKey = (value: string): value is StatusKey => tabs.some((tab) => tab.key === value);

const isSortKey = (value: string): value is SortKey => Object.keys(sortLabels).includes(value);

const reportHrefForApp = (app: Application, from = 'dashboard', context: ReportNavigationContext = {}) => {
  if (!app.reportFilename) return '';
  const params = new URLSearchParams({ from, app: app.id, reportView: 'actions' });
  if (from === 'dashboard') {
    if (context.view) params.set('view', context.view);
    if (context.stage && context.stage !== 'all') params.set('stage', context.stage);
    if (context.sort && context.sort !== 'score') params.set('sort', context.sort);
    if (context.query?.trim()) params.set('q', context.query.trim());
  }
  return `/report/${app.reportFilename}?${params.toString()}`;
};

const getTabCount = (payload: DashboardPayload, key: StatusKey) => {
  if (key === 'all') return payload.metrics.total;
  if (key === 'top') return payload.metrics.topFits;
  return payload.metrics.statusGroups.find((group) => group.status === key)?.count || 0;
};

const matchesTab = (app: Application, activeTab: StatusKey) => {
  if (activeTab === 'all') return true;
  if (activeTab === 'top') return typeof app.score === 'number' && app.score >= 4;
  return app.statusKey === activeTab;
};

const matchesQuery = (app: Application, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [app.company, app.role, app.notes, app.summary?.archetype, app.summary?.recommendation]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
};

const sortApplications = (applications: Application[], sortKey: SortKey) => (
  [...applications].sort((a, b) => {
    if (sortKey === 'date') return b.date.localeCompare(a.date) || (b.score || 0) - (a.score || 0);
    if (sortKey === 'company') return a.company.localeCompare(b.company) || (b.score || 0) - (a.score || 0);
    if (sortKey === 'status') return a.statusKey.localeCompare(b.statusKey) || (b.score || 0) - (a.score || 0);
    return (b.score || 0) - (a.score || 0) || b.date.localeCompare(a.date);
  })
);

const selectFirstApplication = (
  applications: Application[],
  tab: StatusKey,
  sortKey: SortKey,
  query: string,
) => sortApplications(
  applications.filter((app) => matchesTab(app, tab) && matchesQuery(app, query)),
  sortKey,
)[0] || null;

const isDefaultDashboardContext = (tab: StatusKey, sortKey: SortKey, query: string) => (
  tab === 'all' && sortKey === 'score' && !query.trim()
);

const selectDashboardApplication = (
  payload: DashboardPayload,
  tab: StatusKey,
  sortKey: SortKey,
  query: string,
) => {
  if (isDefaultDashboardContext(tab, sortKey, query)) {
    return payload.nextActions[0] || payload.topCandidates[0] || selectFirstApplication(payload.applications, tab, sortKey, query);
  }
  if (tab === 'top' && sortKey === 'score' && !query.trim()) {
    return payload.topCandidates[0] || selectFirstApplication(payload.applications, tab, sortKey, query);
  }
  return selectFirstApplication(payload.applications, tab, sortKey, query);
};

const scoreTone = (score: number | null) => {
  if (typeof score !== 'number') return 'neutral';
  if (score >= 4.5) return 'elite';
  if (score >= 4) return 'strong';
  if (score >= 3) return 'medium';
  return 'low';
};

const buildFallbackAction = (app: Application): ApplicationAction => {
  const highScore = typeof app.score === 'number' && app.score >= 4;
  const lowScore = typeof app.score === 'number' && app.score < 4;
  const label = app.statusKey === 'interview'
    ? 'Prepare interview brief'
    : app.statusKey === 'applied' || app.statusKey === 'responded'
      ? 'Draft follow-up'
      : lowScore
        ? 'Review discard rationale'
        : highScore
          ? 'Verify and apply'
          : 'Review evaluation';
  const command = app.statusKey === 'interview'
    ? '/career-ops interview-prep'
    : app.statusKey === 'applied' || app.statusKey === 'responded'
      ? '/career-ops followup'
      : lowScore
        ? '/career-ops patterns'
        : highScore
          ? '/career-ops apply'
          : '/career-ops oferta';
  const mode = command.replace(/^\/career-ops\s*/, '').trim();
  const helper = app.statusKey === 'interview'
    ? 'Build company-specific talking points, risks, and proof stories from the evaluation report.'
    : app.statusKey === 'applied' || app.statusKey === 'responded'
      ? 'Use tracker notes, score, and role context to write a concise follow-up without sending it automatically.'
      : lowScore
        ? 'Check whether this should be skipped, discarded, or kept only for market intelligence.'
        : 'Inspect recommendation, risks, and tracker notes before deciding whether this record should move forward.';

  return {
    id: `${app.id}-review`,
    label,
    mode,
    command,
    helper,
    suggestedStatus: app.statusLabel || app.status,
    tone: lowScore ? 'risk' : highScore ? 'strong' : 'neutral',
    brief: [
      'Operate this Career-Ops application record.',
      '',
      `Next action: ${label}`,
      `Company: ${app.company}`,
      `Role: ${app.role}`,
      `Tracker #: ${app.number}`,
      `Date: ${app.date}`,
      `Status: ${app.statusLabel || app.status}`,
      `Score: ${formatScore(app.score)}/5`,
      app.reportFilename ? `Report: reports/${app.reportFilename}` : '',
      app.jobUrl ? `Job URL: ${app.jobUrl}` : '',
      app.summary?.recommendation ? `Recommendation: ${app.summary.recommendation}` : '',
      app.summary?.archetype ? `Archetype: ${app.summary.archetype}` : '',
      app.summary?.legitimacy ? `Legitimacy: ${app.summary.legitimacy}` : '',
      app.notes ? `Tracker notes: ${app.notes}` : '',
      '',
      `${helper} Do not submit or send anything without user review.`,
    ].filter(Boolean).join('\n'),
  };
};

function KpiCard({
  label,
  value,
  helper,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <div className="kpi-card__top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{helper}</p>
    </>
  );

  if (onClick) {
    return (
      <button className={`kpi-card kpi-card--button ${active ? 'active' : ''}`} type="button" onClick={onClick} aria-pressed={active}>
        {content}
      </button>
    );
  }

  return (
    <div className="kpi-card">
      {content}
    </div>
  );
}

function MiniBar({ label, value, max, tone = 'blue' }: { label: string; value: number; max: number; tone?: string }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;

  return (
    <div className="mini-bar">
      <div className="mini-bar__row">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="mini-bar__track">
        <div className={`mini-bar__fill tone-${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ApplicationRow({
  app,
  selected,
  onSelect,
  reportContext,
}: {
  app: Application;
  selected: boolean;
  onSelect: (app: Application) => void;
  reportContext: ReportNavigationContext;
}) {
  const reportHref = reportHrefForApp(app, 'dashboard', reportContext);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(app);
    }
  };
  const stopRowSelection = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      className={`application-row ${selected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(app)}
      onKeyDown={handleKeyDown}
      aria-label={`${app.company} ${app.role}`}
      aria-pressed={selected}
    >
      <span className="application-row__date">{app.date}</span>
      <span className="application-row__company">
        <strong>{app.company}</strong>
        <small>#{app.number}</small>
      </span>
      <span className="application-row__role">{app.role}</span>
      <span className={`score-chip score-${scoreTone(app.score)}`}>{formatScore(app.score)}</span>
      <StatusBadge status={app.statusLabel || app.status} />
      <span className="application-row__assets" onClick={stopRowSelection} onKeyDown={stopRowSelection}>
        {reportHref && (
          <Link
            className="application-row__asset-link"
            to={reportHref}
            aria-label={`Open report for ${app.company}`}
            title="Open report"
          >
            <FileText size={15} />
          </Link>
        )}
        {app.jobUrl && (
          <a
            className="application-row__asset-link"
            href={app.jobUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open job post for ${app.company}`}
            title="Open job post"
          >
            <ExternalLink size={15} />
          </a>
        )}
      </span>
    </div>
  );
}

function ActiveOpportunityWorkspace({
  app,
  reportContext,
  onOpenDetail,
  onDispatchStatus,
  dispatching,
  dispatchMessage,
  copiedActionId,
  copyFailedActionId,
  onCopyAction,
}: {
  app: Application | null;
  reportContext: ReportNavigationContext;
  onOpenDetail: () => void;
  onDispatchStatus: (app: Application, status: string) => void | Promise<void>;
  dispatching: boolean;
  dispatchMessage: string;
  copiedActionId: string;
  copyFailedActionId: string;
  onCopyAction: (action: ApplicationAction) => void;
}) {
  if (!app) {
    return (
      <section className="active-workspace active-workspace--empty" aria-label="Dashboard active workspace">
        <StateBlock
          icon={<Target size={20} />}
          eyebrow="Today focus"
          title="Select an opportunity"
          body="Use a queue card, health metric, or pipeline row to choose the record that needs attention."
          compact
        />
      </section>
    );
  }

  const summary = app.summary;
  const actions = app.actions?.length ? app.actions : [buildFallbackAction(app)];
  const primaryAction = actions[0];
  const reportHref = reportHrefForApp(app, 'dashboard', reportContext);
  const applicationsHref = `/applications?app=${encodeURIComponent(app.id)}`;
  const copyState = copiedActionId === primaryAction.id ? 'copied' : copyFailedActionId === primaryAction.id ? 'failed' : '';

  return (
    <section className={`active-workspace action-${primaryAction.tone}`} aria-label="Dashboard active workspace">
      <div className="active-workspace__header">
        <div>
          <p className="eyebrow">Today focus</p>
          <h2>{primaryAction.label}</h2>
          <p>{primaryAction.helper}</p>
        </div>
        <button type="button" onClick={onOpenDetail}>
          <Sparkles size={16} />
          <code>{primaryAction.command}</code>
        </button>
      </div>

      <PrimaryActionBar
        ariaLabel="Dashboard active workspace primary actions"
        className="active-workspace__primary-actions"
        title={primaryAction.label}
        description={primaryAction.helper}
        meta={[
          `${app.company} #${app.number}`,
          app.statusLabel || app.status,
          `Score ${formatScore(app.score)}/5`,
          summary?.legitimacy || 'Legitimacy unknown',
        ]}
        actions={(
          <>
          <button className="button-primary" type="button" onClick={() => onCopyAction(primaryAction)}>
            {copyState === 'copied' ? <Check size={16} /> : <Clipboard size={16} />}
            {copyState === 'failed' ? 'Copy failed' : copyState === 'copied' ? 'Brief copied' : 'Copy action brief'}
          </button>
          {reportHref && <Link className="button-secondary" to={reportHref}><FileText size={16} /> Open report</Link>}
          <Link className="button-secondary" to={applicationsHref}><Briefcase size={16} /> Tracker</Link>
          </>
        )}
      />

      <DispositionDock
        currentStatusKey={app.statusKey}
        saving={dispatching}
        saveMessage={dispatchMessage}
        onDispatch={(status) => onDispatchStatus(app, status)}
        onOpenWriteback={onOpenDetail}
      />

      <div className="active-workspace__facts" aria-label="Active workspace facts">
        <div>
          <span>Score</span>
          <strong>{formatScore(app.score)}/5</strong>
        </div>
        <div>
          <span>Archetype</span>
          <strong>{summary?.archetype || 'Not extracted'}</strong>
        </div>
        <div>
          <span>Assets</span>
          <strong>{app.pdf ? 'PDF ready' : app.reportFilename ? 'Report only' : 'Needs package'}</strong>
        </div>
      </div>

      <div className="active-workspace__links">
        {reportHref && <Link className="button-primary" to={reportHref}><FileText size={16} /> Open dossier</Link>}
        <Link className="button-secondary" to={applicationsHref}><Briefcase size={16} /> Tracker record</Link>
        {app.jobUrl && <a className="button-secondary" href={app.jobUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Job post</a>}
        <button className="button-secondary" type="button" onClick={onOpenDetail}><Activity size={16} /> Writeback</button>
      </div>
    </section>
  );
}

function DashboardWorkspaceBar({
  viewLabel,
  activeStageLabel,
  selected,
  sortLabel,
  query,
  copiedState,
  onCopyLink,
  onReset,
}: {
  viewLabel: string;
  activeStageLabel: string;
  selected: Application | null;
  sortLabel: string;
  query: string;
  copiedState: '' | 'copied' | 'failed';
  onCopyLink: () => void;
  onReset: () => void;
}) {
  return (
    <section className="dashboard-workspace-bar" aria-label="Dashboard workspace state">
      <div className="dashboard-workspace-bar__summary">
        <div>
          <span>Focus state</span>
          <strong>{viewLabel}</strong>
        </div>
        <div>
          <span>Selected record</span>
          <strong>{selected ? `${selected.company} #${selected.number}` : 'None'}</strong>
        </div>
        <div>
          <span>Stage</span>
          <strong>{activeStageLabel}</strong>
        </div>
        <div>
          <span>Sort / search</span>
          <strong>{query.trim() ? `${sortLabel} / ${query.trim()}` : sortLabel}</strong>
        </div>
      </div>
      <div className="dashboard-workspace-bar__actions">
        <button className="button-secondary" type="button" onClick={onReset}>
          <X size={15} />
          Reset focus
        </button>
        <button className="button-primary" type="button" onClick={onCopyLink}>
          {copiedState === 'copied' ? <Check size={15} /> : <Clipboard size={15} />}
          {copiedState === 'failed' ? 'Copy failed' : copiedState === 'copied' ? 'Link copied' : 'Copy link'}
        </button>
      </div>
    </section>
  );
}

function DetailRail({
  app,
  onSave,
  reportContext,
}: {
  app: Application | null;
  onSave: (id: string, status: string, notes: string) => Promise<void>;
  reportContext?: ReportNavigationContext;
}) {
  const [statusDraft, setStatusDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [copiedActionId, setCopiedActionId] = useState('');
  const [copyFailedActionId, setCopyFailedActionId] = useState('');

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setStatusDraft(app?.statusKey || '');
      setNotesDraft(app?.notes || '');
      setSaveMessage('');
      setCopiedActionId('');
      setCopyFailedActionId('');
    });
    return () => {
      cancelled = true;
    };
  }, [app?.id, app?.notes, app?.statusKey]);

  if (!app) {
    return (
      <aside className="detail-rail">
        <StateBlock
          icon={<Target size={20} />}
          eyebrow="No record selected"
          title="Select an application"
          body="Open a pipeline row to inspect the recommendation, fit narrative, risks, and next actions."
          compact
        />
      </aside>
    );
  }

  const summary = app.summary;
  const reportHref = reportHrefForApp(app, 'dashboard', reportContext);
  const selectedActions = app.actions?.length ? app.actions : [buildFallbackAction(app)];
  const primaryAction = selectedActions[0];
  const selectedActionPreview = primaryAction ? [
    `${app.company} / ${app.role}`,
    `Status: ${app.statusLabel || app.status}, score: ${formatScore(app.score)}/5`,
    summary?.legitimacy ? `Legitimacy: ${summary.legitimacy}` : '',
    primaryAction.suggestedStatus ? `Stage status: ${primaryAction.suggestedStatus}` : '',
  ].filter(Boolean) : [];

  const copyActionBrief = async (action: ApplicationAction) => {
    setCopiedActionId('');
    setCopyFailedActionId('');
    try {
      await copyTextToClipboard(action.brief);
      setCopiedActionId(action.id);
      window.setTimeout(() => setCopiedActionId(''), 1800);
    } catch {
      setCopyFailedActionId(action.id);
    }
  };

  const stageSuggestedStatus = (action: ApplicationAction) => {
    const nextStatus = action.suggestedStatus || app.statusLabel || app.status;
    const match = statusOptions.find((option) => option.label.toLowerCase() === nextStatus.toLowerCase());
    if (match) setStatusDraft(match.key);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      await onSave(app.id, statusDraft, notesDraft);
      setSaveMessage('Saved to tracker');
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const resetWritebackDraft = () => {
    setStatusDraft(app.statusKey);
    setNotesDraft(app.notes);
    setSaveMessage('');
  };

  return (
    <aside className="detail-rail">
      <div className="detail-rail__header">
        <div>
          <p className="eyebrow">Selected opportunity</p>
          <h2>{app.company}</h2>
        </div>
        <span className={`score-chip score-${scoreTone(app.score)}`}>{formatScore(app.score)}</span>
      </div>

      <h3>{app.role}</h3>
      <div className="detail-meta">
        <StatusBadge status={app.statusLabel || app.status} />
        <span>{app.date}</span>
        {app.pdf && <span>CV ready</span>}
      </div>

      <p className="detail-note">{summary?.recommendation || summary?.tldr || app.notes || 'No summary available yet.'}</p>

      <StagePath
        stages={statusOptions}
        currentKey={app.statusKey}
        draftKey={statusDraft}
        onChange={setStatusDraft}
      />

      <CommandPlaybook
        title="Recommended command"
        actions={selectedActions}
        copiedActionId={copiedActionId}
        copyFailedActionId={copyFailedActionId}
        onCopy={copyActionBrief}
        onStageStatus={stageSuggestedStatus}
        previewLines={selectedActionPreview}
        secondaryLabel="Other playbook actions"
        variant="compact"
      />

      <TrackerWriteback
        title="Update record"
        eyebrow="Tracker controls"
        recordLabel={`${app.company} / #${app.number}`}
        rowLabel="data/applications.md tracker row"
        statusOptions={statusOptions}
        currentStatusKey={app.statusKey}
        currentStatusLabel={app.statusLabel || app.status}
        statusDraft={statusDraft}
        originalNotes={app.notes}
        notesDraft={notesDraft}
        saving={saving}
        saveMessage={saveMessage}
        onStatusChange={setStatusDraft}
        onNotesChange={setNotesDraft}
        onSave={handleSave}
        onReset={resetWritebackDraft}
      />

      <dl className="detail-facts">
        <div>
          <dt>Archetype</dt>
          <dd>{summary?.archetype || 'Not extracted'}</dd>
        </div>
        <div>
          <dt>Comp / location</dt>
          <dd>{summary?.comp || summary?.remote || 'Not extracted'}</dd>
        </div>
        <div>
          <dt>Legitimacy</dt>
          <dd>{summary?.legitimacy || 'Unknown'}</dd>
        </div>
      </dl>

      {summary?.redFlags && summary.redFlags.length > 0 && (
        <section className="detail-section">
          <h4>Risks</h4>
          <ul>
            {summary.redFlags.map((flag) => <li key={flag}>{flag}</li>)}
          </ul>
        </section>
      )}

      {summary?.actionPlan && summary.actionPlan.length > 0 && (
        <section className="detail-section">
          <h4>Action plan</h4>
          <ul>
            {summary.actionPlan.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      )}

      <div className="detail-actions">
        {reportHref && <Link className="button-primary" to={reportHref}><FileText size={16} /> Report</Link>}
        {app.jobUrl && <a className="button-secondary" href={app.jobUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Job post</a>}
      </div>
    </aside>
  );
}

function CockpitBrief({
  payload,
  activeTab,
  sortKey,
  query,
  onFocus,
}: {
  payload: DashboardPayload;
  activeTab: StatusKey;
  sortKey: SortKey;
  query: string;
  onFocus: (context: { tab?: StatusKey; sort?: SortKey; query?: string; view?: SavedViewKey; scroll?: boolean }) => void;
}) {
  const interviewCount = getTabCount(payload, 'interview');
  const appliedCount = getTabCount(payload, 'applied');
  const latestWeek = payload.metrics.weeklyActivity[payload.metrics.weeklyActivity.length - 1];
  const cards: {
    id: string;
    label: string;
    title: string;
    helper: string;
    value: string | number;
    tab: StatusKey;
    sort: SortKey;
    view?: SavedViewKey;
    icon: ReactNode;
  }[] = [
    {
      id: 'decision',
      label: 'Decisions',
      title: 'Choose move or skip',
      helper: 'Review evaluated roles that still need a clear next step.',
      value: payload.metrics.evaluated,
      tab: 'evaluated',
      sort: 'score',
      view: 'evaluation',
      icon: <Target size={17} />,
    },
    {
      id: 'followups',
      label: 'Follow-ups',
      title: 'Check cadence',
      helper: 'Inspect in-flight applications before drafting a careful follow-up.',
      value: appliedCount,
      tab: 'applied',
      sort: 'date',
      view: 'followups',
      icon: <Activity size={17} />,
    },
    {
      id: 'interviews',
      label: 'Interviews',
      title: 'Prepare proof',
      helper: 'Focus interview records and the reports that support them.',
      value: interviewCount,
      tab: 'interview',
      sort: 'date',
      view: 'interviews',
      icon: <ShieldCheck size={17} />,
    },
    {
      id: 'top',
      label: 'High-fit',
      title: 'Package best fits',
      helper: 'Move strong matches toward apply, prep, or outreach.',
      value: payload.metrics.topFits,
      tab: 'top',
      sort: 'score',
      view: 'topfits',
      icon: <Sparkles size={17} />,
    },
    {
      id: 'latest',
      label: 'Recent',
      title: 'Review movement',
      helper: latestWeek ? `${latestWeek.count} records in ${latestWeek.week}` : 'Sort by date to inspect newest tracker movement.',
      value: latestWeek?.count || 0,
      tab: 'all',
      sort: 'date',
      view: 'command',
      icon: <TrendingUp size={17} />,
    },
  ];

  const handleCardClick = (
    event: MouseEvent<HTMLButtonElement>,
    card: typeof cards[number],
  ) => {
    event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    onFocus({ tab: card.tab, sort: card.sort, query: '', view: card.view, scroll: card.id !== 'latest' });
  };

  return (
    <section className="cockpit-brief" aria-label="Today command queue">
      <div className="cockpit-brief__header">
        <div>
          <p className="eyebrow">Today</p>
          <h2>Command queue</h2>
        </div>
        <span>{payload.metrics.actionable} need attention</span>
      </div>
      <div className="cockpit-brief__grid">
        {cards.map((card) => {
          const active = activeTab === card.tab && sortKey === card.sort && !query.trim();
          return (
            <button
              key={card.id}
              className={active ? 'active' : ''}
              type="button"
              onClick={(event) => handleCardClick(event, card)}
              aria-pressed={active}
            >
              {card.icon}
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.title}</small>
              <p>{card.helper}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload>(defaultPayload);
  const [selected, setSelected] = useState<Application | null>(null);
  const [activeTab, setActiveTab] = useState<StatusKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [query, setQuery] = useState('');
  const [copiedWorkspaceLink, setCopiedWorkspaceLink] = useState<'' | 'copied' | 'failed'>('');
  const [copiedActionId, setCopiedActionId] = useState('');
  const [copyFailedActionId, setCopyFailedActionId] = useState('');
  const [dispatchingStatus, setDispatchingStatus] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const detailAnchorRef = useRef<HTMLDivElement | null>(null);

  const writeDashboardContext = ({
    app,
    tab,
    sort,
    query: queryValue,
    view,
  }: {
    app: Application | null;
    tab: StatusKey;
    sort: SortKey;
    query: string;
    view?: SavedViewKey;
  }) => {
    const params = new URLSearchParams();
    if (app) params.set('app', app.id);
    if (view) params.set('view', view);
    if (tab !== 'all') params.set('stage', tab);
    if (sort !== 'score') params.set('sort', sort);
    if (queryValue.trim()) params.set('q', queryValue.trim());
    const nextSearch = params.toString();
    window.history.replaceState(null, '', nextSearch ? `/?${nextSearch}` : '/');
  };

  const focusDashboardContext = ({
    tab = activeTab,
    sort = sortKey,
    query: queryValue = query,
    app,
    view,
    scroll = false,
  }: {
    tab?: StatusKey;
    sort?: SortKey;
    query?: string;
    app?: Application | null;
    view?: SavedViewKey;
    scroll?: boolean;
  }) => {
    const nextSelection = app === undefined
      ? selectDashboardApplication(payload, tab, sort, queryValue)
      : app;

    setActiveTab(tab);
    setSortKey(sort);
    setQuery(queryValue);
    setSelected(nextSelection);
    writeDashboardContext({ app: nextSelection, tab, sort, query: queryValue, view });

    if (scroll) {
      window.requestAnimationFrame(() => {
        if (window.matchMedia('(max-width: 1200px)').matches) {
          activeWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  };

  const selectApplication = (app: Application, tab: StatusKey | 'keep' = 'keep') => {
    const nextTab = tab !== 'keep' ? tab : activeTab;
    focusDashboardContext({
      tab: nextTab,
      sort: sortKey,
      query: tab !== 'keep' ? '' : query,
      app,
      scroll: true,
    });
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/dashboard`);
      if (!response.ok) throw new Error('Dashboard API failed');
      const data = await response.json() as DashboardPayload;
      const targetAppId = getQueryParam('app');
      const targetStageParam = getQueryParam('stage');
      const targetSortParam = getQueryParam('sort');
      const targetStage = isStatusKey(targetStageParam) ? targetStageParam : 'all';
      const targetSort = isSortKey(targetSortParam) ? targetSortParam : 'score';
      const targetQuery = getQueryParam('q');
      setPayload(data);
      setActiveTab(targetStage);
      setSortKey(targetSort);
      setQuery(targetQuery);
      setSelected((current) => {
        if (!data.applications.length) return null;
        const restored = targetAppId ? data.applications.find((app) => app.id === targetAppId) : null;
        if (restored) {
          return restored;
        }
        const contextualSelection = selectDashboardApplication(data, targetStage, targetSort, targetQuery);
        if (!current) return contextualSelection || data.topCandidates[0] || data.applications[0];
        const refreshedCurrent = data.applications.find((app) => app.id === current.id);
        return refreshedCurrent && matchesTab(refreshedCurrent, targetStage) && matchesQuery(refreshedCurrent, targetQuery)
          ? refreshedCurrent
          : contextualSelection || data.topCandidates[0] || data.applications[0];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadDashboard();
    });
  }, []);

  const saveApplication = async (id: string, status: string, notes: string) => {
    const response = await fetch(`${API_BASE}/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || 'Failed to save application');

    const nextPayload = data as DashboardPayload;
    setPayload(nextPayload);
    const nextSelected = nextPayload.applications.find((app) => app.id === id) || nextPayload.topCandidates[0] || nextPayload.applications[0] || null;
    setSelected(nextSelected);
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDispatchMessage('');
      setDispatchingStatus('');
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const dispatchStatus = async (app: Application, status: string) => {
    setDispatchingStatus(status);
    setDispatchMessage('');
    try {
      await saveApplication(app.id, status, app.notes);
      setDispatchMessage('Disposition saved to tracker');
    } catch (err) {
      setDispatchMessage(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setDispatchingStatus('');
    }
  };

  const filteredApplications = useMemo(() => {
    const filtered = payload.applications.filter((app) => matchesTab(app, activeTab) && matchesQuery(app, query));
    return sortApplications(filtered, sortKey);
  }, [activeTab, payload.applications, query, sortKey]);

  const currentSavedView = savedViews.find((view) => (
    view.tab === activeTab &&
    view.sortKey === sortKey &&
    !query.trim()
  ));
  const activeStageLabel = tabs.find((tab) => tab.key === activeTab)?.label || activeTab;
  const dashboardViewLabel = currentSavedView?.label || activeStageLabel;
  const dashboardReportContext: ReportNavigationContext = {
    stage: activeTab,
    sort: sortKey,
    query,
    view: currentSavedView?.key,
  };

  const activeFilters = [
    activeTab !== 'all' ? { key: 'tab', label: `Stage: ${tabs.find((tab) => tab.key === activeTab)?.label || activeTab}` } : null,
    sortKey !== 'score' ? { key: 'sort', label: `Sort: ${sortLabels[sortKey]}` } : null,
    query.trim() ? { key: 'query', label: `Search: ${query.trim()}` } : null,
  ].filter(Boolean) as { key: string; label: string }[];

  const applySavedView = (view: typeof savedViews[number]) => {
    focusDashboardContext({ tab: view.tab, sort: view.sortKey, query: '', view: view.key });
  };

  const focusKpiView = (tab: StatusKey, sort: SortKey = 'score') => {
    focusDashboardContext({ tab, sort, query: '' });
  };

  const changeSort = (sort: SortKey) => {
    focusDashboardContext({ sort });
  };

  const changeQuery = (queryValue: string) => {
    focusDashboardContext({ query: queryValue });
  };

  const clearFilter = (key: string) => {
    const nextTab = key === 'tab' ? 'all' : activeTab;
    const nextSort = key === 'sort' ? 'score' : sortKey;
    const nextQuery = key === 'query' ? '' : query;
    const nextSelection = selectDashboardApplication(payload, nextTab, nextSort, nextQuery);
    setActiveTab(nextTab);
    setSortKey(nextSort);
    setQuery(nextQuery);
    setSelected(nextSelection);
    writeDashboardContext({ app: nextSelection, tab: nextTab, sort: nextSort, query: nextQuery });
  };

  const resetFilters = () => {
    focusDashboardContext({ tab: 'all', sort: 'score', query: '' });
  };

  const copyWorkspaceLink = async () => {
    setCopiedWorkspaceLink('');
    try {
      await copyTextToClipboard(window.location.href);
      setCopiedWorkspaceLink('copied');
      window.setTimeout(() => setCopiedWorkspaceLink(''), 1800);
    } catch {
      setCopiedWorkspaceLink('failed');
      window.setTimeout(() => setCopiedWorkspaceLink(''), 2200);
    }
  };

  const copyActionBrief = async (action: ApplicationAction) => {
    setCopiedActionId('');
    setCopyFailedActionId('');
    try {
      await copyTextToClipboard(action.brief);
      setCopiedActionId(action.id);
      window.setTimeout(() => setCopiedActionId(''), 1800);
    } catch {
      setCopyFailedActionId(action.id);
      window.setTimeout(() => setCopyFailedActionId(''), 2200);
    }
  };

  const openDetailRail = () => {
    detailAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const maxFunnel = Math.max(...payload.metrics.funnel.map((item) => item.count), 1);
  const maxScoreBucket = Math.max(...payload.metrics.scoreBuckets.map((item) => item.count), 1);
  const maxWeekly = Math.max(...payload.metrics.weeklyActivity.map((item) => item.count), 1);

  return (
    <div className="dashboard-page">
      <header className="command-header">
        <div>
          <p className="eyebrow">Career-ops today</p>
          <h1>Today</h1>
          <p>Focus the job search on the records that need a decision, follow-up, interview prep, or high-fit next step.</p>
        </div>
        <button className="refresh-button" onClick={loadDashboard} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'is-spinning' : ''} />
          Refresh
        </button>
      </header>

      {error && (
        <StateBlock
          icon={<AlertTriangle size={20} />}
          eyebrow="Dashboard unavailable"
          title="Could not load career-ops data"
          body={error}
          tone="risk"
          action={{ label: 'Try again', onClick: loadDashboard }}
          compact
        />
      )}

      <CockpitBrief
        payload={payload}
        activeTab={activeTab}
        sortKey={sortKey}
        query={query}
        onFocus={focusDashboardContext}
      />

      <section className="kpi-grid" aria-label="Pipeline metrics">
        <KpiCard
          label="Pipeline"
          value={payload.metrics.total}
          helper={`${payload.metrics.withPdf} tailored PDFs`}
          icon={<Briefcase size={18} />}
          onClick={() => focusKpiView('all')}
          active={activeTab === 'all' && !query.trim()}
        />
        <KpiCard
          label="Needs attention"
          value={payload.metrics.actionable}
          helper="Open decisions and pursuits"
          icon={<Activity size={18} />}
          onClick={() => focusKpiView('evaluated')}
          active={activeTab === 'evaluated' && !query.trim()}
        />
        <KpiCard
          label="High-fit"
          value={payload.metrics.topFits}
          helper={`Best score ${payload.metrics.topScore.toFixed(1)}/5`}
          icon={<Sparkles size={18} />}
          onClick={() => focusKpiView('top')}
          active={activeTab === 'top' && !query.trim()}
        />
        <KpiCard
          label="Response"
          value={`${payload.metrics.rates.response}%`}
          helper={`${payload.metrics.rates.interview}% interview rate`}
          icon={<TrendingUp size={18} />}
          onClick={() => focusKpiView('responded', 'date')}
          active={activeTab === 'responded' && !query.trim()}
        />
      </section>

      <section className="dashboard-focus-bar" aria-label="Dashboard active opportunity">
        <div>
          <p className="eyebrow">{selected ? 'Active opportunity' : 'No opportunity selected'}</p>
          <h2>{selected?.company || 'Select a pipeline record'}</h2>
          <p>{selected?.role || 'Use a queue card, health metric, saved view, or row to choose today\'s focus.'}</p>
        </div>
        <div className="dashboard-focus-bar__meta">
          {selected ? (
            <>
              <span className={`score-chip score-${scoreTone(selected.score)}`}>{formatScore(selected.score)}</span>
              <StatusBadge status={selected.statusLabel || selected.status} />
              {selected.reportFilename && <Link className="button-secondary" to={reportHrefForApp(selected, 'dashboard', dashboardReportContext)}><FileText size={16} /> Report</Link>}
            </>
          ) : (
            <span className="dashboard-focus-bar__empty">Waiting for selection</span>
          )}
        </div>
      </section>

      <div className="active-workspace-anchor" ref={activeWorkspaceRef}>
        <ActiveOpportunityWorkspace
          app={selected}
          reportContext={dashboardReportContext}
          onOpenDetail={openDetailRail}
          onDispatchStatus={dispatchStatus}
          dispatching={Boolean(dispatchingStatus)}
          dispatchMessage={dispatchMessage}
          copiedActionId={copiedActionId}
          copyFailedActionId={copyFailedActionId}
          onCopyAction={copyActionBrief}
        />
      </div>

      <DashboardWorkspaceBar
        viewLabel={dashboardViewLabel}
        activeStageLabel={activeStageLabel}
        selected={selected}
        sortLabel={sortLabels[sortKey]}
        query={query}
        copiedState={copiedWorkspaceLink}
        onCopyLink={copyWorkspaceLink}
        onReset={resetFilters}
      />

      <section className="insight-grid" aria-label="Pipeline health">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Pipeline health</p>
              <h2>Funnel</h2>
            </div>
            <BarChart3 size={18} />
          </div>
          <div className="mini-bars">
            {payload.metrics.funnel.map((item) => (
              <MiniBar key={item.status} label={item.label} value={item.count} max={maxFunnel} tone="blue" />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Fit quality</p>
              <h2>Score distribution</h2>
            </div>
            <Target size={18} />
          </div>
          <div className="mini-bars">
            {payload.metrics.scoreBuckets.map((item) => (
              <MiniBar key={item.id} label={item.label} value={item.count} max={maxScoreBucket} tone={item.label.startsWith('4') ? 'green' : 'amber'} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Search rhythm</p>
              <h2>Weekly activity</h2>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="weekly-strip">
            {payload.metrics.weeklyActivity.slice(-8).map((week) => (
              <div className="week-column" key={week.week}>
                <div style={{ height: `${Math.max(8, (week.count / maxWeekly) * 70)}px` }} />
                <span>{shortWeek(week.week)}</span>
                <strong>{week.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="pipeline-panel">
          <div className="pipeline-toolbar">
            <div>
              <p className="eyebrow">Pipeline records</p>
              <h2>Review list</h2>
            </div>
            <div className="toolbar-controls">
              <label className="search-box">
                <Search size={16} />
                <input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Search company, role, notes..." />
              </label>
              <label className="sort-control">
                {sortKey === 'company' ? <ArrowDownAZ size={16} /> : <ArrowDownWideNarrow size={16} />}
                <select value={sortKey} onChange={(event) => changeSort(event.target.value as SortKey)}>
                  {Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="dashboard-saved-view-strip" aria-label="Saved pipeline views">
            {savedViews.map((view) => (
              <button
                key={view.key}
                className={currentSavedView?.key === view.key ? 'active' : ''}
                type="button"
                onClick={() => applySavedView(view)}
                aria-pressed={currentSavedView?.key === view.key}
              >
                <SlidersHorizontal size={15} />
                <span>
                  <strong>{view.label}</strong>
                  <small>{view.helper} ({getTabCount(payload, view.tab)})</small>
                </span>
              </button>
            ))}
          </div>

          <div className="status-tabs" aria-label="Pipeline stages">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? 'active' : ''}
                onClick={() => focusDashboardContext({ tab: tab.key })}
                aria-pressed={activeTab === tab.key}
              >
                <span>{tab.label}</span>
                <strong>{getTabCount(payload, tab.key)}</strong>
              </button>
            ))}
          </div>

          <div className="dashboard-filter-summary">
            <div>
              <strong>{filteredApplications.length}</strong>
              <span>{filteredApplications.length === 1 ? 'record' : 'records'} shown</span>
            </div>
            <div className="dashboard-filter-chips" aria-label="Active dashboard filters">
              {activeFilters.length ? activeFilters.map((filter) => (
                <button key={filter.key} type="button" onClick={() => clearFilter(filter.key)}>
                  {filter.label}
                  <X size={13} />
                </button>
              )) : <span>Today view</span>}
            </div>
            {activeFilters.length > 0 && (
              <button className="dashboard-clear-filters" type="button" onClick={resetFilters}>Clear all</button>
            )}
          </div>

          <div className="application-list" aria-label="Applications">
            <div className="application-list__head">
              <span>Date</span>
              <span>Company</span>
              <span>Role</span>
              <span>Score</span>
              <span>Status</span>
              <span>Assets</span>
            </div>
            {loading ? (
              <StateSkeleton rows={8} label="Loading career-ops applications" />
            ) : filteredApplications.length ? (
              filteredApplications.map((app) => (
                <ApplicationRow
                  key={`${app.id}-${app.company}-${app.role}`}
                  app={app}
                  selected={selected?.id === app.id}
                  onSelect={(app) => selectApplication(app)}
                  reportContext={dashboardReportContext}
                />
              ))
            ) : (
              <StateBlock
                icon={<Search size={20} />}
                eyebrow="No matching records"
                title="No applications match this view"
                body="Clear the active chips, try another saved view, or refresh the tracker after the next Career-Ops pipeline run."
                action={{ label: 'Reset filters', onClick: resetFilters }}
                compact
              />
            )}
          </div>
        </div>
        <div className="detail-anchor" ref={detailAnchorRef}>
          <DetailRail app={selected} onSave={saveApplication} reportContext={dashboardReportContext} />
        </div>
      </section>

      <section className="priority-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">High-fit opportunities</p>
              <h2>Recent best fits</h2>
            </div>
            <CheckCircle size={18} />
          </div>
          <div className="compact-list">
            {payload.topCandidates.map((app) => (
              <button key={`${app.id}-top`} onClick={() => selectApplication(app, 'top')}>
                <span>{app.company}</span>
                <small>{app.role}</small>
                <strong>{formatScore(app.score)}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Next decisions</p>
              <h2>Next actions</h2>
            </div>
            <Activity size={18} />
          </div>
          <div className="compact-list">
            {payload.nextActions.map((app) => (
              <button key={`${app.id}-next`} onClick={() => selectApplication(app, app.statusKey)}>
                <span>{app.company}</span>
                <small>{app.notes || app.role}</small>
                <StatusBadge status={app.statusLabel || app.status} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
