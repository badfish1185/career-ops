import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  Archive,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { StateBlock, StateSkeleton } from '../components/StateBlock';
import StatusBadge from '../components/StatusBadge';
import TrackerWriteback from '../components/TrackerWriteback';
import { copyTextToClipboard } from '../utils/clipboard';
import '../styles/Applications.css';

type StatusKey = 'all' | 'evaluated' | 'applied' | 'responded' | 'interview' | 'offer' | 'top' | 'skip' | 'rejected' | 'discarded';
type WorkModeKey = 'decide' | 'pursue' | 'followup' | 'interview' | 'archive' | 'all';
type SortKey = 'priority' | 'date' | 'score' | 'company';
type WorkspaceTab = 'brief' | 'evidence' | 'writeback';

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
  mode: string;
  command: string;
  helper: string;
  suggestedStatus: string;
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
  actions: ApplicationAction[];
}

interface DashboardPayload {
  generatedAt: string;
  metrics: {
    total: number;
    actionable: number;
    topFits: number;
    withPdf: number;
    statusGroups: { status?: string; label: string; count: number }[];
  };
  applications: Application[];
  topCandidates: Application[];
  nextActions: Application[];
}

const API_BASE = '';

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

const workModes: {
  key: WorkModeKey;
  label: string;
  helper: string;
  status?: StatusKey;
}[] = [
  { key: 'decide', label: 'Decide', helper: 'Open evaluations', status: 'evaluated' },
  { key: 'pursue', label: 'Pursue', helper: 'Score 4.0+' },
  { key: 'followup', label: 'Follow up', helper: 'Applied or responded' },
  { key: 'interview', label: 'Interview', helper: 'Prep and active loops', status: 'interview' },
  { key: 'archive', label: 'Archive', helper: 'Closed outcomes' },
  { key: 'all', label: 'All', helper: 'Full tracker' },
];

const sortLabels: Record<SortKey, string> = {
  priority: 'Priority',
  date: 'Newest',
  score: 'Score',
  company: 'Company',
};

const workspaceTabs: { key: WorkspaceTab; label: string }[] = [
  { key: 'brief', label: 'Brief' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'writeback', label: 'Writeback' },
];

const decisionActions = [
  {
    status: 'skip',
    label: 'Skip',
    helper: 'Not worth applying',
    tone: 'stop',
    icon: X,
  },
  {
    status: 'discarded',
    label: 'Archive',
    helper: 'Closed or stale',
    tone: 'archive',
    icon: Archive,
  },
  {
    status: 'applied',
    label: 'Applied',
    helper: 'Package sent',
    tone: 'go',
    icon: Check,
  },
  {
    status: 'interview',
    label: 'Interview',
    helper: 'Loop is active',
    tone: 'watch',
    icon: BriefcaseBusiness,
  },
];

const defaultPayload: DashboardPayload = {
  generatedAt: '',
  metrics: {
    total: 0,
    actionable: 0,
    topFits: 0,
    withPdf: 0,
    statusGroups: [],
  },
  applications: [],
  topCandidates: [],
  nextActions: [],
};

const closedStatuses = new Set<StatusKey>(['skip', 'rejected', 'discarded']);
const followupStatuses = new Set<StatusKey>(['applied', 'responded']);

const formatScore = (score: number | null) => (typeof score === 'number' ? score.toFixed(1) : 'N/A');

const scoreTone = (score: number | null) => {
  if (typeof score !== 'number') return 'neutral';
  if (score >= 4.5) return 'elite';
  if (score >= 4) return 'strong';
  if (score >= 3) return 'medium';
  return 'low';
};

const getQueryParam = (key: string) => new URLSearchParams(window.location.search).get(key) || '';

const isWorkMode = (value: string): value is WorkModeKey => workModes.some((mode) => mode.key === value);
const isSortKey = (value: string): value is SortKey => Object.keys(sortLabels).includes(value);

const reportHrefForApp = (app: Application) => {
  if (!app.reportFilename) return '';
  const params = new URLSearchParams({ from: 'applications', app: app.id, reportView: 'actions' });
  return `/report/${app.reportFilename}?${params.toString()}`;
};

const primaryActionFor = (app: Application): ApplicationAction => app.actions?.[0] || {
  id: `${app.id}-review`,
  label: app.statusKey === 'interview' ? 'Prepare interview brief' : 'Review record',
  mode: app.statusKey === 'interview' ? 'interview-prep' : 'oferta',
  command: app.statusKey === 'interview' ? '/career-ops interview-prep' : '/career-ops oferta',
  helper: 'Review the report, update the tracker, and decide the next action.',
  suggestedStatus: app.statusLabel || app.status,
  tone: 'neutral',
  brief: [
    'Operate this Career-Ops application record.',
    '',
    `Company: ${app.company}`,
    `Role: ${app.role}`,
    `Tracker #: ${app.number}`,
    `Status: ${app.statusLabel || app.status}`,
    `Score: ${formatScore(app.score)}/5`,
    app.reportFilename ? `Report: reports/${app.reportFilename}` : '',
    app.jobUrl ? `Job URL: ${app.jobUrl}` : '',
    '',
    'Do not submit or send anything without user review.',
  ].filter(Boolean).join('\n'),
};

const modeCount = (apps: Application[], mode: WorkModeKey) => apps.filter((app) => matchesMode(app, mode)).length;

function matchesMode(app: Application, mode: WorkModeKey) {
  if (mode === 'all') return true;
  if (mode === 'archive') return closedStatuses.has(app.statusKey);
  if (mode === 'pursue') return typeof app.score === 'number' && app.score >= 4 && !closedStatuses.has(app.statusKey);
  if (mode === 'followup') return followupStatuses.has(app.statusKey);
  if (mode === 'interview') return app.statusKey === 'interview' || app.statusKey === 'offer';
  return app.statusKey === 'evaluated' && !closedStatuses.has(app.statusKey);
}

const priorityScore = (app: Application) => {
  const statusRank: Record<string, number> = {
    interview: 100,
    responded: 90,
    applied: 78,
    offer: 76,
    evaluated: 64,
    skip: 5,
    rejected: 4,
    discarded: 3,
  };
  const score = typeof app.score === 'number' ? app.score * 10 : 0;
  const riskPenalty = app.summary?.redFlags?.length ? app.summary.redFlags.length * 2 : 0;
  const assetBoost = app.pdf ? 4 : app.reportFilename ? 2 : 0;
  return (statusRank[app.statusKey] || 20) + score + assetBoost - riskPenalty;
};

const sortApplications = (apps: Application[], sortKey: SortKey) => [...apps].sort((a, b) => {
  if (sortKey === 'date') return b.date.localeCompare(a.date) || priorityScore(b) - priorityScore(a);
  if (sortKey === 'score') return (b.score || 0) - (a.score || 0) || priorityScore(b) - priorityScore(a);
  if (sortKey === 'company') return a.company.localeCompare(b.company) || priorityScore(b) - priorityScore(a);
  return priorityScore(b) - priorityScore(a) || b.date.localeCompare(a.date);
});

const matchesQuery = (app: Application, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    app.company,
    app.role,
    app.notes,
    app.summary?.archetype,
    app.summary?.recommendation,
    app.summary?.legitimacy,
  ].filter(Boolean).join(' ').toLowerCase().includes(normalized);
};

const selectDefaultApp = (payload: DashboardPayload, mode: WorkModeKey, sortKey: SortKey, query: string) => {
  const filtered = sortApplications(
    payload.applications.filter((app) => matchesMode(app, mode) && matchesQuery(app, query)),
    sortKey,
  );
  return filtered[0] || payload.nextActions[0] || payload.topCandidates[0] || payload.applications[0] || null;
};

function writeRoute(app: Application | null, mode: WorkModeKey, sortKey: SortKey, query: string) {
  const params = new URLSearchParams();
  if (app) params.set('app', app.id);
  if (mode !== 'decide') params.set('view', mode);
  if (sortKey !== 'priority') params.set('sort', sortKey);
  if (query.trim()) params.set('q', query.trim());
  const queryString = params.toString();
  window.history.replaceState(null, '', queryString ? `/applications?${queryString}` : '/applications');
}

function CommandChip({
  label,
  value,
  helper,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  helper: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`apps-command-chip ${active ? 'is-active' : ''}`} type="button" onClick={onClick} aria-pressed={active}>
      <strong>{label}</strong>
      <span>{value}</span>
      <small>{helper}</small>
    </button>
  );
}

function QueueRow({
  app,
  selected,
  onSelect,
}: {
  app: Application;
  selected: boolean;
  onSelect: (app: Application) => void;
}) {
  const action = primaryActionFor(app);

  return (
    <button className={`apps-queue-row ${selected ? 'is-selected' : ''}`} type="button" onClick={() => onSelect(app)} aria-current={selected ? 'true' : undefined}>
      <span className={`score-chip score-${scoreTone(app.score)}`}>{formatScore(app.score)}</span>
      <span className="apps-queue-row__main">
        <strong>{app.company}</strong>
        <small>{app.role}</small>
      </span>
      <span className="apps-queue-row__meta">
        <StatusBadge status={app.statusLabel || app.status} />
        <small>#{app.number} / {app.date}</small>
      </span>
      <span className="apps-queue-row__action">{action.label}</span>
    </button>
  );
}

function DecisionButton({
  action,
  current,
  saving,
  onClick,
}: {
  action: typeof decisionActions[number];
  current: boolean;
  saving: boolean;
  onClick: () => void;
}) {
  const Icon = action.icon;

  return (
    <button
      className={`apps-decision-button tone-${action.tone} ${current ? 'is-current' : ''}`}
      type="button"
      onClick={onClick}
      disabled={saving}
    >
      <span><Icon size={16} /></span>
      <strong>{action.label}</strong>
      <small>{action.helper}</small>
    </button>
  );
}

function OpportunityPanel({
  app,
  ariaLabel = 'Selected opportunity',
  onCopy,
  copied,
  copyFailed,
  activeTab,
  onTabChange,
  statusDraft,
  notesDraft,
  saving,
  saveMessage,
  onStatusChange,
  onNotesChange,
  onSave,
  onReset,
  onDispatch,
}: {
  app: Application;
  ariaLabel?: string;
  onCopy: (action: ApplicationAction) => void;
  copied: string;
  copyFailed: string;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  statusDraft: string;
  notesDraft: string;
  saving: boolean;
  saveMessage: string;
  onStatusChange: (status: string) => void;
  onNotesChange: (notes: string) => void;
  onSave: () => void;
  onReset: () => void;
  onDispatch: (status: string) => void;
}) {
  const action = primaryActionFor(app);
  const reportHref = reportHrefForApp(app);
  const redFlags = app.summary?.redFlags || [];
  const actionPlan = app.summary?.actionPlan || [];
  const copyState = copied === action.id ? 'copied' : copyFailed === action.id ? 'failed' : '';

  return (
    <section className={`apps-workspace-card action-${action.tone}`} aria-label={ariaLabel}>
      <div className="apps-workspace-hero">
        <div className="apps-workspace-identity">
          <div className="apps-workspace-kicker">
            <StatusBadge status={app.statusLabel || app.status} />
            <span>#{app.number}</span>
          </div>
          <h2>{app.company}</h2>
          <p>{app.role}</p>
        </div>
        <div className="apps-workspace-score">
          <span>Fit score</span>
          <strong>{formatScore(app.score)}</strong>
        </div>
      </div>

      <section className="apps-command-card" aria-label="Next best action">
        <div>
          <span>Next best action</span>
          <h3>{action.label}</h3>
          <p>{action.helper}</p>
        </div>
        <div className="apps-command-card__actions">
          <button className="button-primary" type="button" onClick={() => onCopy(action)}>
            {copyState === 'copied' ? <Check size={16} /> : <Clipboard size={16} />}
            {copyState === 'failed' ? 'Copy failed' : copyState === 'copied' ? 'Copied' : 'Copy brief'}
          </button>
          {reportHref && <Link className="button-secondary" to={reportHref}><FileText size={16} /> Report</Link>}
          {app.jobUrl && <a className="button-secondary" href={app.jobUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Job post</a>}
        </div>
      </section>

      <section className="apps-decision-strip" aria-label="Fast disposition controls">
        {decisionActions.map((decision) => (
          <DecisionButton
            key={decision.status}
            action={decision}
            current={app.statusKey === decision.status}
            saving={saving}
            onClick={() => onDispatch(decision.status)}
          />
        ))}
      </section>

      <nav className="apps-workspace-tabs" aria-label="Selected opportunity sections">
        {workspaceTabs.map((tab) => (
          <button key={tab.key} type="button" className={activeTab === tab.key ? 'is-active' : ''} onClick={() => onTabChange(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'brief' && (
        <section className="apps-section apps-brief-section" aria-label="Action brief">
          <div>
            <h4>Recommendation</h4>
            <p>{app.summary?.recommendation || app.summary?.tldr || app.notes || 'No recommendation extracted yet.'}</p>
          </div>
          <dl className="apps-facts-list">
            <div>
              <dt>Status</dt>
              <dd>{app.statusLabel || app.status}</dd>
            </div>
            <div>
              <dt>Assets</dt>
              <dd>{app.pdf ? 'PDF ready' : app.reportFilename ? 'Report available' : 'Needs package'}</dd>
            </div>
            <div>
              <dt>Legitimacy</dt>
              <dd>{app.summary?.legitimacy || 'Unknown'}</dd>
            </div>
          </dl>
        </section>
      )}

      {activeTab === 'evidence' && (
        <section className="apps-section apps-evidence-section" aria-label="Decision evidence">
          <div>
            <h4>Fit context</h4>
            <dl className="apps-facts-list">
              <div>
                <dt>Archetype</dt>
                <dd>{app.summary?.archetype || 'Not extracted'}</dd>
              </div>
              <div>
                <dt>Comp or location</dt>
                <dd>{app.summary?.comp || app.summary?.remote || 'Not extracted'}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h4>Risks</h4>
            {redFlags.length ? (
              <ul>
                {redFlags.slice(0, 4).map((flag) => <li key={flag}>{flag}</li>)}
              </ul>
            ) : (
              <p>No risk notes extracted.</p>
            )}
          </div>
          <div>
            <h4>Plan</h4>
            {actionPlan.length ? (
              <ul>
                {actionPlan.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p>Use the action brief to decide the next tracker move.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === 'writeback' && (
        <section className="apps-section apps-writeback-section" aria-label="Tracker writeback workspace">
          <TrackerWriteback
            title="Tracker writeback"
            eyebrow="Review before saving"
            recordLabel={`${app.company} / #${app.number}`}
            rowLabel="data/applications.md"
            statusOptions={statusOptions}
            currentStatusKey={app.statusKey}
            currentStatusLabel={app.statusLabel || app.status}
            statusDraft={statusDraft}
            originalNotes={app.notes}
            notesDraft={notesDraft}
            saving={saving}
            saveMessage={saveMessage}
            onStatusChange={onStatusChange}
            onNotesChange={onNotesChange}
            onSave={onSave}
            onReset={onReset}
          />
        </section>
      )}

      <footer className="apps-source-note" aria-label="Source status">
        <ShieldCheck size={15} />
        <span>Writes update only <strong>data/applications.md</strong>.</span>
        <span>{app.reportFilename ? `Report: ${app.reportFilename}` : 'No report linked'}</span>
      </footer>
    </section>
  );
}

function Applications() {
  const routeMode = getQueryParam('view');
  const routeSort = getQueryParam('sort');
  const [payload, setPayload] = useState<DashboardPayload>(defaultPayload);
  const [selected, setSelected] = useState<Application | null>(null);
  const [mode, setMode] = useState<WorkModeKey>(isWorkMode(routeMode) ? routeMode : 'decide');
  const [sortKey, setSortKey] = useState<SortKey>(isSortKey(routeSort) ? routeSort : 'priority');
  const [query, setQuery] = useState(getQueryParam('q'));
  const [statusDraft, setStatusDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [copiedActionId, setCopiedActionId] = useState('');
  const [copyFailedActionId, setCopyFailedActionId] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('brief');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const closeWorkspaceRef = useRef<HTMLButtonElement | null>(null);

  const filteredApplications = useMemo(() => sortApplications(
    payload.applications.filter((app) => matchesMode(app, mode) && matchesQuery(app, query)),
    sortKey,
  ), [mode, payload.applications, query, sortKey]);
  const selectedIndex = useMemo(() => (
    selected ? filteredApplications.findIndex((app) => app.id === selected.id) : -1
  ), [filteredApplications, selected]);

  const syncSelectedApplication = (app: Application | null) => {
    setSelected(app);
    setStatusDraft(app?.statusKey || '');
    setNotesDraft(app?.notes || '');
    setSaveMessage('');
    setCopiedActionId('');
    setCopyFailedActionId('');
  };

  const focusContext = (nextMode = mode, nextSort = sortKey, nextQuery = query, app?: Application | null) => {
    const nextSelected = app === undefined ? selectDefaultApp(payload, nextMode, nextSort, nextQuery) : app;
    setMode(nextMode);
    setSortKey(nextSort);
    setQuery(nextQuery);
    syncSelectedApplication(nextSelected);
    writeRoute(nextSelected, nextMode, nextSort, nextQuery);
  };

  const loadApplications = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/dashboard`);
      if (!response.ok) throw new Error('Applications API failed');
      const data = await response.json() as DashboardPayload;
      const targetAppId = getQueryParam('app');
      const targetMode = isWorkMode(getQueryParam('view')) ? getQueryParam('view') as WorkModeKey : 'decide';
      const targetSort = isSortKey(getQueryParam('sort')) ? getQueryParam('sort') as SortKey : 'priority';
      const targetQuery = getQueryParam('q');
      const restored = targetAppId ? data.applications.find((app) => app.id === targetAppId) || null : null;
      const nextSelected = restored || selectDefaultApp(data, targetMode, targetSort, targetQuery);
      setPayload(data);
      setMode(targetMode);
      setSortKey(targetSort);
      setQuery(targetQuery);
      syncSelectedApplication(nextSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadApplications();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!workspaceOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeButton = closeWorkspaceRef.current;
    window.requestAnimationFrame(() => closeButton?.focus());

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWorkspaceOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [workspaceOpen]);

  const selectApplication = (app: Application) => {
    syncSelectedApplication(app);
    writeRoute(app, mode, sortKey, query);
    setWorkspaceOpen(true);
    setWorkspaceTab('brief');
  };

  const openSelectedWorkspace = () => {
    if (!selected) return;
    setWorkspaceOpen(true);
  };

  const moveWorkspace = (direction: -1 | 1) => {
    if (!filteredApplications.length || selectedIndex < 0) return;
    const nextIndex = (selectedIndex + direction + filteredApplications.length) % filteredApplications.length;
    const nextSelected = filteredApplications[nextIndex];
    syncSelectedApplication(nextSelected);
    setWorkspaceTab('brief');
    writeRoute(nextSelected, mode, sortKey, query);
  };

  const saveApplicationDraft = async (nextStatus = statusDraft, nextNotes = notesDraft, message = 'Saved to tracker') => {
    if (!selected) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/applications/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, notes: nextNotes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'Failed to save application');
      const nextPayload = data as DashboardPayload;
      const nextSelected = nextPayload.applications.find((app) => app.id === selected.id) || selectDefaultApp(nextPayload, mode, sortKey, query);
      setPayload(nextPayload);
      syncSelectedApplication(nextSelected);
      writeRoute(nextSelected, mode, sortKey, query);
      setSaveMessage(message);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const dispatchDisposition = async (nextStatus: string) => {
    if (!selected) return;
    setStatusDraft(nextStatus);
    await saveApplicationDraft(nextStatus, selected.notes || '', 'Disposition saved to tracker');
  };

  const copyActionBrief = async (action: ApplicationAction) => {
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

  const resetFilters = () => {
    focusContext('decide', 'priority', '');
  };

  const selectedAction = selected ? primaryActionFor(selected) : null;

  return (
    <div className="applications-page">
      <header className="apps-command-header">
        <div>
          <span className="surface-label">Applications command center</span>
          <h1>Decide the next move</h1>
          <p>Review one role at a time, make the tracker decision, and keep the queue moving without a wall of panels.</p>
        </div>
        <button className="refresh-button" type="button" onClick={loadApplications} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'is-spinning' : ''} />
          Refresh
        </button>
      </header>

      {error && (
        <StateBlock
          icon={<AlertTriangle size={20} />}
          eyebrow="Tracker unavailable"
          title="Could not load application records"
          body={error}
          tone="risk"
          action={{ label: 'Try again', onClick: loadApplications }}
          compact
        />
      )}

      <section className="apps-command-strip" aria-label="Application metrics">
        {workModes.slice(0, 5).map((item) => (
          <CommandChip
            key={item.key}
            label={item.label}
            value={modeCount(payload.applications, item.key)}
            helper={item.helper}
            active={mode === item.key}
            onClick={() => focusContext(item.key, item.key === 'all' ? 'date' : 'priority', '')}
          />
        ))}
        <CommandChip
          label="PDF ready"
          value={payload.metrics.withPdf}
          helper="Packages generated"
          active={false}
          onClick={() => focusContext('all', 'score', '')}
        />
      </section>

      <section className="apps-focus-banner" aria-label="Current focus">
        <div>
          <span>Current focus</span>
          <strong>{selected ? `${selected.company} / ${selected.role}` : 'Choose a record'}</strong>
          <p>{selectedAction?.label || 'Select a queue item to see the next best action.'}</p>
        </div>
        {selected && <span className={`score-chip score-${scoreTone(selected.score)}`}>{formatScore(selected.score)}</span>}
      </section>

      <section className="apps-command-layout" aria-label="Applications command workspace">
        <aside className="apps-queue" aria-label="Application queue">
          <div className="apps-queue__controls">
            <label className="apps-search">
              <Search size={16} />
              <span className="sr-only">Search applications</span>
              <input value={query} onChange={(event) => focusContext(mode, sortKey, event.target.value)} placeholder="Search company, role, notes" />
            </label>
            <label className="apps-select">
              <ArrowDownWideNarrow size={16} />
              <span className="sr-only">Sort applications</span>
              <select value={sortKey} onChange={(event) => focusContext(mode, event.target.value as SortKey, query)}>
                {Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
          </div>

          <div className="apps-mode-strip" aria-label="Application work modes">
            {workModes.map((item) => (
              <button key={item.key} type="button" className={mode === item.key ? 'is-active' : ''} onClick={() => focusContext(item.key, sortKey, '')} aria-pressed={mode === item.key}>
                <strong>{item.label}</strong>
                <span>{modeCount(payload.applications, item.key)}</span>
              </button>
            ))}
          </div>

          <div className="apps-result-bar">
            <strong>{filteredApplications.length}</strong>
            <span>{filteredApplications.length === 1 ? 'record' : 'records'} shown</span>
            {(query || mode !== 'decide' || sortKey !== 'priority') && (
              <button type="button" onClick={resetFilters}>
                <X size={14} />
                Reset
              </button>
            )}
          </div>

          <div className="apps-queue-list">
            {loading ? (
              <StateSkeleton rows={10} label="Loading tracker records" />
            ) : filteredApplications.length ? (
              filteredApplications.map((app) => (
                <QueueRow
                  key={`${app.id}-${app.company}-${app.role}`}
                  app={app}
                  selected={selected?.id === app.id}
                  onSelect={selectApplication}
                />
              ))
            ) : (
              <StateBlock
                icon={<Search size={20} />}
                eyebrow="No matching records"
                title="No applications match this view"
                body="Reset the workbench or search for a different company, role, or note."
                action={{ label: 'Reset', onClick: resetFilters }}
                compact
              />
            )}
          </div>
        </aside>

        <main className="apps-focus" aria-label="Selected application workspace">
          {selected ? (
            <section className="apps-workspace-card apps-focus-preview" aria-label="Selected opportunity preview">
              <div>
                <span className="surface-label">Selected role</span>
                <h2>{selected.company}</h2>
                <p>{selected.role}</p>
              </div>
              <dl className="apps-focus-preview__facts">
                <div>
                  <dt>Score</dt>
                  <dd>{formatScore(selected.score)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selected.statusLabel || selected.status}</dd>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd>{selectedAction?.label || 'Review record'}</dd>
                </div>
              </dl>
              <button className="button-primary" type="button" onClick={openSelectedWorkspace}>
                <BriefcaseBusiness size={16} />
                Open workspace
              </button>
            </section>
          ) : (
            <section className="apps-workspace-card apps-workspace-card--empty" aria-label="Selected opportunity">
              <StateBlock
                icon={<Target size={20} />}
                eyebrow="No record selected"
                title="Choose an opportunity"
                body="Select a row from the queue to inspect evidence and take the next tracker action."
                compact
              />
            </section>
          )}
        </main>
      </section>

      {workspaceOpen && selected && (
        <div className="apps-workspace-modal" role="dialog" aria-modal="true" aria-label={`${selected.company} disposition workspace`}>
          <div className="apps-workspace-modal__chrome">
            <div className="apps-workspace-modal__title">
              <span>Disposition workspace</span>
              <strong>{selected.company} / {selected.role}</strong>
            </div>
            <div className="apps-workspace-modal__nav" aria-label="Workspace record navigation">
              <button type="button" onClick={() => moveWorkspace(-1)} disabled={filteredApplications.length < 2}>
                <ChevronLeft size={16} />
                Previous
              </button>
              <span>{selectedIndex >= 0 ? selectedIndex + 1 : 1} / {Math.max(filteredApplications.length, 1)}</span>
              <button type="button" onClick={() => moveWorkspace(1)} disabled={filteredApplications.length < 2}>
                Next
                <ChevronRight size={16} />
              </button>
            </div>
            <button ref={closeWorkspaceRef} className="apps-workspace-modal__close" type="button" onClick={() => setWorkspaceOpen(false)} aria-label="Close workspace">
              <X size={17} />
            </button>
          </div>
          <div className="apps-workspace-modal__body">
            <OpportunityPanel
              app={selected}
              ariaLabel="Selected opportunity disposition workspace"
              onCopy={copyActionBrief}
              copied={copiedActionId}
              copyFailed={copyFailedActionId}
              activeTab={workspaceTab}
              onTabChange={setWorkspaceTab}
              statusDraft={statusDraft}
              notesDraft={notesDraft}
              saving={saving}
              saveMessage={saveMessage}
              onStatusChange={setStatusDraft}
              onNotesChange={setNotesDraft}
              onSave={() => saveApplicationDraft()}
              onReset={() => {
                setStatusDraft(selected.statusKey);
                setNotesDraft(selected.notes);
                setSaveMessage('');
              }}
              onDispatch={dispatchDisposition}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Applications;
