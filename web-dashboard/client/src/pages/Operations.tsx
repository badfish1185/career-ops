import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Gauge,
  History,
  Inbox,
  RefreshCw,
  ScanSearch,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import CommandPlaybook from '../components/CommandPlaybook';
import PrimaryActionBar from '../components/PrimaryActionBar';
import { StateBlock, StateSkeleton } from '../components/StateBlock';
import { copyTextToClipboard } from '../utils/clipboard';
import '../styles/Operations.css';

interface PipelineItem {
  completed: boolean;
  id: string;
  url: string;
  company: string;
  role: string;
  score: string;
  pdf: boolean;
  raw: string;
  status?: string;
  notes?: string;
  reportFilename?: string;
  jobUrl?: string;
  applicationDate?: string;
  firstSeen?: string;
  portal?: string;
  scanStatus?: string;
  scanTitle?: string;
  readiness?: string;
}

interface ScanEntry {
  url: string;
  firstSeen: string;
  portal: string;
  title: string;
  company: string;
  status: string;
  inPipeline?: boolean;
  pipelineState?: 'new' | 'queued' | 'processed';
}

interface FollowupEntry {
  num: number;
  date: string;
  company: string;
  role: string;
  status: string;
  score: string;
  notes: string;
  reportPath: string;
  urgency: string;
  nextFollowupDate: string | null;
  daysUntilNext: number | null;
  daysSinceApplication: number;
}

interface Recommendation {
  action: string;
  reasoning: string;
  impact: string;
}

interface OperationAction {
  id: string;
  label: string;
  command: string;
  helper: string;
  tone: 'elite' | 'strong' | 'risk' | 'neutral';
  brief: string;
}

type OpsLane = 'intake' | 'followups' | 'scanner' | 'outcomes' | 'intelligence';
type OpsSavedViewKey = 'command' | 'followups' | 'sourcing' | 'reports' | 'intelligence';
type OpsCapabilityKey = 'pipeline' | 'scan' | 'apply' | 'followup' | 'patterns' | 'interview' | 'deep' | 'batch';

interface OperationsPayload {
  generatedAt: string;
  files: {
    pipelineExists: boolean;
    followupsExists: boolean;
    scanHistoryExists: boolean;
  };
  pipeline: {
    total: number;
    pending: number;
    completed: number;
    pdfReady: number;
    next: PipelineItem[];
    recentCompleted: PipelineItem[];
  };
  scan: {
    total: number;
    added: number;
    skippedExpired: number;
    skippedTitle: number;
    skippedDuplicate: number;
    uncertain: number;
    statusCounts: Record<string, number>;
    recent: ScanEntry[];
  };
  followups: {
    error?: string;
    metadata?: {
      analysisDate: string;
      totalTracked: number;
      actionable: number;
      overdue: number;
      urgent: number;
      cold: number;
      waiting: number;
    };
    entries?: FollowupEntry[];
  };
  patterns: {
    error?: string;
    metadata?: {
      total: number;
      byOutcome: Record<string, number>;
    };
    scoreThreshold?: {
      recommended: number;
      reasoning: string;
      positiveRange: string;
    };
    remotePolicy?: {
      policy: string;
      total: number;
      positive: number;
      negative: number;
      self_filtered: number;
      pending: number;
      conversionRate: number;
    }[];
    recommendations?: Recommendation[];
  };
}

const API_BASE = '';

const opsLanes = new Set<OpsLane>(['intake', 'followups', 'scanner', 'outcomes', 'intelligence']);

const laneLabels: Record<OpsLane, string> = {
  intake: 'Intake',
  followups: 'Follow-ups',
  scanner: 'Scanner',
  outcomes: 'Outcomes',
  intelligence: 'Intelligence',
};

const opsSavedViews: {
  key: OpsSavedViewKey;
  label: string;
  helper: string;
  lane: OpsLane;
}[] = [
  { key: 'command', label: 'Command', helper: 'Pending URLs', lane: 'intake' },
  { key: 'followups', label: 'Follow-ups', helper: 'Cadence pressure', lane: 'followups' },
  { key: 'sourcing', label: 'Sourcing', helper: 'Recent scanner finds', lane: 'scanner' },
  { key: 'reports', label: 'Reports', helper: 'Processed outcomes', lane: 'outcomes' },
  { key: 'intelligence', label: 'Intelligence', helper: 'Targeting rules', lane: 'intelligence' },
];

const commandCapabilities: {
  key: OpsCapabilityKey;
  label: string;
  command: string;
  lane: OpsLane;
  helper: string;
  reads: string;
  produces: string;
  guardrail: string;
}[] = [
  {
    key: 'pipeline',
    label: 'Process pipeline',
    command: '/career-ops pipeline',
    lane: 'intake',
    helper: 'Turn pending URLs into evaluated records, reports, and tracker updates.',
    reads: 'data/pipeline.md, live job URLs',
    produces: 'Evaluation report, score, PDF decision',
    guardrail: 'Verify liveness before scoring',
  },
  {
    key: 'scan',
    label: 'Scan portals',
    command: '/career-ops scan',
    lane: 'scanner',
    helper: 'Discover fresh jobs from configured portals and dedupe against history.',
    reads: 'portals.yml, scan-history.tsv',
    produces: 'Qualified scan rows and intake candidates',
    guardrail: 'Filter for fit before adding',
  },
  {
    key: 'apply',
    label: 'Build package',
    command: '/career-ops apply',
    lane: 'outcomes',
    helper: 'Prepare reviewed application materials for strong evaluated records.',
    reads: 'CV, report, profile, job post',
    produces: 'Application answers, CV context, outreach',
    guardrail: 'Never submit without review',
  },
  {
    key: 'followup',
    label: 'Follow-up cadence',
    command: '/career-ops followup',
    lane: 'followups',
    helper: 'Find overdue applications and draft concise follow-up language.',
    reads: 'applications.md, follow-ups.md',
    produces: 'Cadence flags and follow-up drafts',
    guardrail: 'Draft only; user sends',
  },
  {
    key: 'patterns',
    label: 'Pattern analysis',
    command: '/career-ops patterns',
    lane: 'intelligence',
    helper: 'Learn from outcomes, score thresholds, and targeting misses.',
    reads: 'Tracker outcomes and scores',
    produces: 'Score gates and targeting rules',
    guardrail: 'Use outcomes, not vibes',
  },
  {
    key: 'interview',
    label: 'Interview prep',
    command: '/career-ops interview-prep',
    lane: 'followups',
    helper: 'Convert active opportunities into prep briefs and proof stories.',
    reads: 'Report, CV, story bank',
    produces: 'Prep brief, questions, STAR stories',
    guardrail: 'Ground claims in proof',
  },
  {
    key: 'deep',
    label: 'Deep research',
    command: '/career-ops deep',
    lane: 'outcomes',
    helper: 'Expand company context, product signals, and interview-relevant risk.',
    reads: 'Company, role, report, public signals',
    produces: 'Dossier, risks, interview angles',
    guardrail: 'Research only',
  },
  {
    key: 'batch',
    label: 'Batch evaluate',
    command: '/career-ops batch',
    lane: 'intake',
    helper: 'Run parallel evaluation workers for many queued opportunities.',
    reads: 'Batch input and worker prompts',
    produces: 'Reports and tracker additions',
    guardrail: 'Merge tracker after batch',
  },
];

const getQueryParam = (key: string) => new URLSearchParams(window.location.search).get(key) || '';
const queryOpsSearch = () => getQueryParam('q');
const queryItemKey = () => getQueryParam('item');

const queryLane = () => {
  const lane = getQueryParam('lane') as OpsLane;
  return opsLanes.has(lane) ? lane : 'intake';
};

const isCapabilityKey = (value: string): value is OpsCapabilityKey => commandCapabilities.some((capability) => capability.key === value);

const queryCapabilityForLane = (lane: OpsLane) => {
  const mode = getQueryParam('mode');
  if (!isCapabilityKey(mode)) return null;
  const capability = commandCapabilities.find((item) => item.key === mode);
  return capability?.lane === lane ? capability.key : null;
};

const defaultCapabilityForLane = (lane: OpsLane): OpsCapabilityKey => {
  if (lane === 'followups') return 'followup';
  if (lane === 'scanner') return 'scan';
  if (lane === 'outcomes') return 'apply';
  if (lane === 'intelligence') return 'patterns';
  return 'pipeline';
};

const emptyPayload: OperationsPayload = {
  generatedAt: '',
  files: {
    pipelineExists: false,
    followupsExists: false,
    scanHistoryExists: false,
  },
  pipeline: {
    total: 0,
    pending: 0,
    completed: 0,
    pdfReady: 0,
    next: [],
    recentCompleted: [],
  },
  scan: {
    total: 0,
    added: 0,
    skippedExpired: 0,
    skippedTitle: 0,
    skippedDuplicate: 0,
    uncertain: 0,
    statusCounts: {},
    recent: [],
  },
  followups: {},
  patterns: {},
};

const statusLabel = (status: string) => status
  .replace(/^skipped_/, 'Skipped ')
  .replace(/_/g, ' ');

const includesQuery = (values: Array<string | number | null | undefined>, query: string) => {
  if (!query) return true;
  return values
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase()
    .includes(query);
};

const urgencyLabel = (entry: FollowupEntry) => {
  if (entry.urgency === 'overdue' && typeof entry.daysUntilNext === 'number') return `${Math.abs(entry.daysUntilNext)}d overdue`;
  if (entry.urgency === 'urgent') return 'Urgent';
  if (entry.urgency === 'cold') return 'Cold';
  return entry.nextFollowupDate || 'Waiting';
};

const hostFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const reportFilenameFromPath = (reportPath: string | null | undefined = '') => {
  if (!reportPath) return '';
  const parts = reportPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
};

const reportHrefWithContext = (filename: string, appId = '', lane: OpsLane = 'outcomes') => {
  if (!filename) return '';
  const params = new URLSearchParams({ from: 'operations', lane, reportView: 'actions' });
  if (appId) params.set('app', appId);
  return `/report/${filename}?${params.toString()}`;
};

const scoreValue = (score = '') => {
  const value = Number.parseFloat(score);
  return Number.isFinite(value) ? value : null;
};

const pipelineItemRouteKey = (item: PipelineItem) => item.raw || item.id || item.url;
const followupItemRouteKey = (entry: FollowupEntry) => String(entry.num);
const scanItemRouteKey = (entry: ScanEntry) => entry.url;
const outcomeItemRouteKey = (item: PipelineItem) => item.raw || item.id || item.reportFilename || item.url;

const writeOperationsRoute = (
  lane: OpsLane,
  capabilityKey?: OpsCapabilityKey,
  options: { query?: string; itemKey?: string } = {},
) => {
  const params = new URLSearchParams({ lane });
  if (capabilityKey) params.set('mode', capabilityKey);
  if (options.query?.trim()) params.set('q', options.query.trim());
  if (options.itemKey) params.set('item', options.itemKey);
  window.history.replaceState(null, '', `/operations?${params.toString()}`);
};

const buildEvaluationBrief = (item: PipelineItem) => [
  'Evaluate this Career-Ops pipeline item.',
  '',
  `Company: ${item.company || 'Unknown company'}`,
  `Role: ${item.role || item.scanTitle || 'Unknown role'}`,
  `URL: ${item.url}`,
  item.firstSeen ? `First seen: ${item.firstSeen}` : '',
  item.portal ? `Portal: ${item.portal}` : '',
  '',
  'Run the normal Career-Ops evaluation workflow: verify the posting is live, score the fit, create the report/PDF if warranted, and update the tracker without submitting an application.',
].filter(Boolean).join('\n');

const buildPipelineLine = (entry: ScanEntry) => `- [ ] ${entry.url} | ${entry.company || 'Unknown company'} | ${entry.title || 'Unknown role'}`;

const buildIntakeActions = (item: PipelineItem): OperationAction[] => {
  const primaryBrief = buildEvaluationBrief(item);
  const scope = item.raw || item.url || `${item.company}-${item.role}`;
  return [
    {
      id: `${scope}-evaluate-intake`,
      label: 'Evaluate pending URL',
      command: '/career-ops pipeline',
      tone: 'strong',
      helper: 'Verify liveness, score fit, create the report/PDF if warranted, and update the tracker.',
      brief: primaryBrief,
    },
    {
      id: `${scope}-research-intake`,
      label: 'Research company context',
      command: '/career-ops deep',
      tone: 'neutral',
      helper: 'Build company context before deciding whether this intake item deserves a full application package.',
      brief: [
        'Research this Career-Ops intake item.',
        '',
        `Company: ${item.company || 'Unknown company'}`,
        `Role: ${item.role || item.scanTitle || 'Unknown role'}`,
        item.url ? `URL: ${item.url}` : '',
        item.portal ? `Portal: ${item.portal}` : '',
        '',
        'Return company context, product/market signals, role legitimacy, and interview-relevant risks. Do not submit an application.',
      ].filter(Boolean).join('\n'),
    },
  ];
};

const buildFollowupActions = (entry: FollowupEntry, reportFilename = ''): OperationAction[] => [
  {
    id: `${entry.num}-draft-followup`,
    label: 'Draft follow-up',
    command: '/career-ops followup',
    tone: entry.urgency === 'overdue' || entry.urgency === 'urgent' ? 'risk' : 'strong',
    helper: 'Draft a concise follow-up using application age, current status, score, and tracker notes.',
    brief: [
      'Draft a Career-Ops follow-up.',
      '',
      `Company: ${entry.company}`,
      `Role: ${entry.role}`,
      `Tracker #: ${entry.num}`,
      `Status: ${entry.status}`,
      `Score: ${entry.score}`,
      `Applied: ${entry.daysSinceApplication} days ago`,
      entry.nextFollowupDate ? `Next follow-up date: ${entry.nextFollowupDate}` : '',
      reportFilename ? `Report: reports/${reportFilename}` : '',
      entry.notes ? `Tracker notes: ${entry.notes}` : '',
      '',
      'Draft only. Do not send without user review.',
    ].filter(Boolean).join('\n'),
  },
  {
    id: `${entry.num}-review-report`,
    label: 'Review report',
    command: '/career-ops oferta',
    tone: 'neutral',
    helper: 'Use the evaluation report before deciding what to say next.',
    brief: [
      'Review this Career-Ops evaluation before follow-up.',
      '',
      `Company: ${entry.company}`,
      `Role: ${entry.role}`,
      reportFilename ? `Report: reports/${reportFilename}` : '',
      `Status: ${entry.status}`,
      entry.notes ? `Tracker notes: ${entry.notes}` : '',
    ].filter(Boolean).join('\n'),
  },
];

const buildScanActions = (entry: ScanEntry, line: string): OperationAction[] => [
  {
    id: `${entry.url}-promote-scan`,
    label: entry.inPipeline ? 'Review queued intake' : 'Add to pipeline',
    command: '/career-ops scan',
    tone: entry.inPipeline ? 'strong' : 'elite',
    helper: entry.inPipeline ? 'This scan result is already in the intake queue; review readiness and move it through evaluation.' : 'Promote this scan result into data/pipeline.md for evaluation.',
    brief: [
      entry.inPipeline ? 'Review this queued scanner result.' : 'Promote this scanner result into the Career-Ops pipeline.',
      '',
      `Company: ${entry.company || 'Unknown company'}`,
      `Role: ${entry.title || 'Unknown role'}`,
      `URL: ${entry.url}`,
      entry.portal ? `Portal: ${entry.portal}` : '',
      entry.firstSeen ? `First seen: ${entry.firstSeen}` : '',
      `Pipeline line: ${line}`,
      '',
      'Do not submit an application. Queue or evaluate only.',
    ].filter(Boolean).join('\n'),
  },
  {
    id: `${entry.url}-evaluate-scan`,
    label: 'Evaluate posting',
    command: '/career-ops pipeline',
    tone: 'strong',
    helper: 'Verify the posting, score fit, create report/PDF if warranted, and update the tracker.',
    brief: [
      'Evaluate this scanner result.',
      '',
      `Company: ${entry.company || 'Unknown company'}`,
      `Role: ${entry.title || 'Unknown role'}`,
      `URL: ${entry.url}`,
      entry.portal ? `Portal: ${entry.portal}` : '',
      '',
      'Verify liveness first. Do not submit an application.',
    ].filter(Boolean).join('\n'),
  },
];

const buildOutcomeActions = (item: PipelineItem): OperationAction[] => {
  const score = scoreValue(item.score);
  const scope = item.raw || item.id || `${item.company}-${item.role}`;
  const actions: OperationAction[] = [];
  if (score !== null && score >= 4.5) {
    actions.push({
      id: `${scope}-build-package`,
      label: 'Build pursuit package',
      command: '/career-ops apply',
      tone: 'elite',
      helper: 'Prepare application materials, proof points, and outreach language for user review.',
      brief: [
        'Build a Career-Ops pursuit package.',
        '',
        `Company: ${item.company}`,
        `Role: ${item.role}`,
        `Score: ${item.score}`,
        item.reportFilename ? `Report: reports/${item.reportFilename}` : '',
        item.jobUrl || item.url ? `Job URL: ${item.jobUrl || item.url}` : '',
        item.notes ? `Tracker notes: ${item.notes}` : '',
        '',
        'Prepare materials only. Do not submit without user review.',
      ].filter(Boolean).join('\n'),
    });
  } else if (score !== null && score < 4) {
    actions.push({
      id: `${scope}-discard-review`,
      label: 'Review discard rationale',
      command: '/career-ops patterns',
      tone: 'risk',
      helper: 'Turn this low-fit result into a tracker decision or targeting lesson.',
      brief: [
        'Review this low-fit Career-Ops outcome.',
        '',
        `Company: ${item.company}`,
        `Role: ${item.role}`,
        `Score: ${item.score}`,
        item.reportFilename ? `Report: reports/${item.reportFilename}` : '',
        item.notes ? `Tracker notes: ${item.notes}` : '',
        '',
        'Decide whether the tracker should be SKIP, Discarded, or retained for market intelligence.',
      ].filter(Boolean).join('\n'),
    });
  }

  actions.push({
    id: `${scope}-open-report`,
    label: 'Review evaluation report',
    command: '/career-ops oferta',
    tone: 'strong',
    helper: 'Inspect the underlying evaluation before taking the next pipeline action.',
    brief: [
      'Review this processed Career-Ops outcome.',
      '',
      `Company: ${item.company}`,
      `Role: ${item.role}`,
      item.score ? `Score: ${item.score}` : '',
      item.reportFilename ? `Report: reports/${item.reportFilename}` : '',
      item.notes ? `Tracker notes: ${item.notes}` : '',
    ].filter(Boolean).join('\n'),
  });

  actions.push({
    id: `${scope}-company-research`,
    label: 'Research company context',
    command: '/career-ops deep',
    tone: 'neutral',
    helper: 'Expand company context, risk signals, and interview angles around this processed result.',
    brief: [
      'Research this processed Career-Ops outcome.',
      '',
      `Company: ${item.company}`,
      `Role: ${item.role}`,
      item.jobUrl || item.url ? `Job URL: ${item.jobUrl || item.url}` : '',
      item.reportFilename ? `Report: reports/${item.reportFilename}` : '',
    ].filter(Boolean).join('\n'),
  });

  return actions.slice(0, 3);
};

function OpsStat({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="ops-stat">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{helper}</p>
      </div>
      {icon}
    </div>
  );
}

interface OpsRecordFact {
  label: string;
  value: string | number;
}

function OpsRecordDetail({
  eyebrow,
  title,
  subtitle,
  badge,
  facts,
  chips = [],
  description,
  tone = 'neutral',
  actionBar,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  badge: ReactNode;
  facts: OpsRecordFact[];
  chips?: string[];
  description?: string;
  tone?: 'neutral' | 'strong' | 'risk' | 'success';
  actionBar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`ops-record-detail ops-record-detail--${tone}`} data-selected-record-detail="true">
      <div className="ops-record-detail__top">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <div className="ops-record-detail__badge">{badge}</div>
      </div>
      <h4>{subtitle}</h4>
      {chips.length > 0 && (
        <div className="ops-record-detail__chips">
          {chips.filter(Boolean).map((chip) => <span key={chip}>{chip}</span>)}
        </div>
      )}
      {actionBar}
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value || 'Unknown'}</dd>
          </div>
        ))}
      </dl>
      {description && <p className="ops-record-detail__description">{description}</p>}
      <div className="ops-record-detail__body">{children}</div>
    </section>
  );
}

function OperationRunPreview({
  capability,
  selectedContext,
  activeAction,
  copiedActionKey,
  onCopy,
  onFocusLane,
}: {
  capability: typeof commandCapabilities[number];
  selectedContext: {
    eyebrow: string;
    title: string;
    subtitle: string;
    badge: ReactNode;
    meta: string;
  };
  activeAction?: OperationAction;
  copiedActionKey: string;
  onCopy: (action: OperationAction) => void;
  onFocusLane: (lane: OpsLane) => void;
}) {
  const fallbackAction: OperationAction = {
    id: `${capability.key}-run-preview`,
    label: capability.label,
    command: capability.command,
    helper: capability.helper,
    tone: 'neutral',
    brief: [
      'Preview this Career-Ops operation.',
      '',
      `Command: ${capability.command}`,
      `Mode: ${capability.label}`,
      `Active lane: ${laneLabels[capability.lane]}`,
      `Selected object: ${selectedContext.title}`,
      `Context: ${selectedContext.subtitle}`,
      `Reads: ${capability.reads}`,
      `Produces: ${capability.produces}`,
      `Guardrail: ${capability.guardrail}`,
      '',
      'Review only. Do not submit, send, or apply without user approval.',
    ].filter(Boolean).join('\n'),
  };
  const runAction = activeAction || fallbackAction;
  const copied = copiedActionKey === runAction.id;

  return (
    <section className={`ops-run-preview action-${runAction.tone}`} aria-label="Operations run preview">
      <div className="ops-run-preview__header">
        <div>
          <p className="eyebrow">Run preview</p>
          <h2>{runAction.label}</h2>
          <p>{runAction.helper}</p>
        </div>
        <code>{runAction.command}</code>
      </div>

      <div className="ops-run-preview__grid">
        <button type="button" onClick={() => onFocusLane(capability.lane)}>
          <Activity size={16} />
          <span>Selected input</span>
          <strong>{selectedContext.title}</strong>
          <small>{selectedContext.meta}</small>
        </button>
        <div>
          <CheckCircle2 size={16} />
          <span>Produces</span>
          <strong>{capability.produces}</strong>
          <small>{runAction.helper}</small>
        </div>
        <div>
          <AlertTriangle size={16} />
          <span>Guardrail</span>
          <strong>{capability.guardrail}</strong>
          <small>No final send, submit, or apply action from this preview.</small>
        </div>
      </div>

      <div className="ops-run-preview__brief">
        <div>
          <span>Review plan</span>
          <strong>{selectedContext.eyebrow.replace(/^Active\s+/i, '')}: {selectedContext.title}</strong>
          <p>{runAction.brief.split('\n').filter(Boolean).slice(0, 5).join(' / ')}</p>
        </div>
        <button className="button-primary" type="button" onClick={() => onCopy(runAction)}>
          {copied ? <Check size={16} /> : <Clipboard size={16} />}
          {copied ? 'Copied' : 'Copy run brief'}
        </button>
      </div>
    </section>
  );
}

function OperationsWorkflowFocus({
  activeLane,
  laneButtons,
  capability,
  commandOptions,
  selectedContext,
  opsQuery,
  activeFilters,
  currentSavedView,
  getFilteredLaneCount,
  copiedState,
  copiedActionKey,
  activeAction,
  onFocusLane,
  onSelectCapability,
  onApplySavedView,
  onUpdateQuery,
  onClearFilter,
  onCopyLink,
  onCopyAction,
  onReset,
}: {
  activeLane: OpsLane;
  laneButtons: { lane: OpsLane; label: string; value: string | number; helper: string; icon: React.ReactNode }[];
  capability: typeof commandCapabilities[number];
  commandOptions: typeof commandCapabilities;
  selectedContext: {
    eyebrow: string;
    title: string;
    subtitle: string;
    badge: ReactNode;
    meta: string;
  };
  opsQuery: string;
  activeFilters: { key: string; label: string }[];
  currentSavedView?: typeof opsSavedViews[number];
  getFilteredLaneCount: (lane: OpsLane) => number;
  copiedState: '' | 'copied' | 'failed';
  copiedActionKey: string;
  activeAction?: OperationAction;
  onFocusLane: (lane: OpsLane) => void;
  onSelectCapability: (capability: typeof commandCapabilities[number]) => void;
  onApplySavedView: (view: typeof opsSavedViews[number]) => void;
  onUpdateQuery: (value: string) => void;
  onClearFilter: (key: string) => void;
  onCopyLink: () => void;
  onCopyAction: (action: OperationAction) => void;
  onReset: () => void;
}) {
  const copied = Boolean(activeAction && copiedActionKey === activeAction.id);

  return (
    <section className="ops-workflow-shell" aria-label="Operations workflow focus">
      <div className="ops-workflow-focus">
        <div className="ops-workflow-focus__main">
          <div>
            <p className="eyebrow">Priority workflow</p>
            <h2>{capability.label}</h2>
            <p>{capability.helper}</p>
          </div>
          <code>{activeAction?.command || capability.command}</code>
        </div>

        <div className="ops-workflow-focus__record">
          <div>
            <span>{selectedContext.eyebrow}</span>
            <strong>{selectedContext.title}</strong>
            <p>{selectedContext.subtitle}</p>
          </div>
          <div>
            <span>Status</span>
            <strong>{selectedContext.badge}</strong>
            <p>{selectedContext.meta}</p>
          </div>
        </div>

        <div className="ops-workflow-focus__contract" aria-label="Selected command contract">
          <div>
            <span>Reads</span>
            <strong>{capability.reads}</strong>
          </div>
          <div>
            <span>Produces</span>
            <strong>{capability.produces}</strong>
          </div>
          <div>
            <span>Guardrail</span>
            <strong>{capability.guardrail}</strong>
          </div>
        </div>

        <div className="ops-workflow-focus__actions">
          <button className="button-secondary" type="button" onClick={() => onFocusLane(activeLane)}>
            <ExternalLink size={16} />
            Open lane
          </button>
          <button className="button-secondary" type="button" onClick={onReset}>
            <X size={15} />
            Reset
          </button>
          <button className="button-secondary" type="button" onClick={onCopyLink}>
            {copiedState === 'copied' ? <Check size={15} /> : <Clipboard size={15} />}
            {copiedState === 'failed' ? 'Copy failed' : copiedState === 'copied' ? 'Link copied' : 'Copy link'}
          </button>
          <button
            className="button-primary"
            type="button"
            onClick={() => activeAction && onCopyAction(activeAction)}
            disabled={!activeAction}
          >
            {copied ? <Check size={16} /> : <Clipboard size={16} />}
            {copied ? 'Copied' : 'Copy brief'}
          </button>
        </div>
      </div>

      <aside className="ops-workflow-side">
        <div className="ops-command-modes">
          {commandOptions.map((option) => (
            <button
              key={option.key}
              className={capability.key === option.key ? 'active' : ''}
              type="button"
              onClick={() => onSelectCapability(option)}
              aria-pressed={capability.key === option.key}
            >
              <Sparkles size={14} />
              <span>
                <strong>{option.label}</strong>
                <small>{option.command}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="ops-saved-view-strip" aria-label="Saved operations views">
          {opsSavedViews.map((view) => (
            <button
              key={view.key}
              className={currentSavedView?.key === view.key ? 'active' : ''}
              type="button"
              onClick={() => onApplySavedView(view)}
              aria-pressed={currentSavedView?.key === view.key}
            >
              <SlidersHorizontal size={15} />
              <span>
                <strong>{view.label}</strong>
                <small>{view.helper} / {getFilteredLaneCount(view.lane)}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="ops-filter-row">
          <label className="ops-search">
            <Search size={16} />
            <input value={opsQuery} onChange={(event) => onUpdateQuery(event.target.value)} placeholder="Search operations records..." />
          </label>
          <div className="ops-filter-summary">
            <div>
              <strong>{getFilteredLaneCount(activeLane)}</strong>
              <span>{getFilteredLaneCount(activeLane) === 1 ? 'record' : 'records'} in {laneLabels[activeLane]}</span>
            </div>
            <div className="ops-filter-chips" aria-label="Active operations filters">
              {activeFilters.length ? activeFilters.map((filter) => (
                <button key={filter.key} type="button" onClick={() => onClearFilter(filter.key)}>
                  {filter.label}
                  <X size={13} />
                </button>
              )) : <span>Default intake command view</span>}
            </div>
          </div>
        </div>

        <div className="ops-lane-switcher" aria-label="Operations lanes">
          {laneButtons.map((lane) => (
            <button
              key={lane.lane}
              className={activeLane === lane.lane ? 'active' : ''}
              type="button"
              onClick={() => onFocusLane(lane.lane)}
              aria-pressed={activeLane === lane.lane}
            >
              {lane.icon}
              <span>
                <strong>{lane.label}</strong>
                <small>{lane.helper}</small>
              </span>
              <em>{lane.value}</em>
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}

function Operations() {
  const [payload, setPayload] = useState<OperationsPayload>(emptyPayload);
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineItem | null>(null);
  const [selectedFollowup, setSelectedFollowup] = useState<FollowupEntry | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<PipelineItem | null>(null);
  const [selectedScan, setSelectedScan] = useState<ScanEntry | null>(null);
  const [activeLane, setActiveLane] = useState<OpsLane>(() => queryLane());
  const [selectedCapabilityKey, setSelectedCapabilityKey] = useState<OpsCapabilityKey>('pipeline');
  const [opsQuery, setOpsQuery] = useState(() => queryOpsSearch());
  const [copiedBriefKey, setCopiedBriefKey] = useState('');
  const [copiedScanKey, setCopiedScanKey] = useState('');
  const [copiedActionKey, setCopiedActionKey] = useState('');
  const [copyFailedActionKey, setCopyFailedActionKey] = useState('');
  const [copiedWorkspaceLink, setCopiedWorkspaceLink] = useState<'' | 'copied' | 'failed'>('');
  const [promotingScanUrl, setPromotingScanUrl] = useState('');
  const [scanActionMessage, setScanActionMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOperations = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/operations`);
      if (!response.ok) throw new Error('Operations API failed');
      const data = await response.json() as OperationsPayload;
      const targetLane = queryLane();
      const targetCapability = queryCapabilityForLane(targetLane);
      const targetAppId = getQueryParam('app');
      const targetQuery = queryOpsSearch();
      const targetItemKey = queryItemKey();
      setPayload(data);
      const nextFollowups = data.followups.entries || [];
      const recentOutcomes = data.pipeline.recentCompleted || [];
      setActiveLane(targetLane);
      setSelectedCapabilityKey(targetCapability || defaultCapabilityForLane(targetLane));
      setOpsQuery(targetQuery);
      setSelectedPipeline((current) => {
        if (!data.pipeline.next.length) return null;
        const restored = targetLane === 'intake' && targetItemKey ? data.pipeline.next.find((item) => pipelineItemRouteKey(item) === targetItemKey) : null;
        if (restored) return restored;
        if (current) {
          return data.pipeline.next.find((item) => pipelineItemRouteKey(item) === pipelineItemRouteKey(current)) || data.pipeline.next[0];
        }
        return data.pipeline.next[0];
      });
      setSelectedFollowup((current) => {
        if (!nextFollowups.length) return null;
        const restoreKey = targetItemKey || targetAppId;
        const restored = targetLane === 'followups' && restoreKey ? nextFollowups.find((entry) => followupItemRouteKey(entry) === restoreKey) : null;
        if (restored) return restored;
        if (current) {
          return nextFollowups.find((entry) => entry.num === current.num) || nextFollowups[0];
        }
        return nextFollowups[0];
      });
      setSelectedOutcome((current) => {
        if (!recentOutcomes.length) return null;
        const restored = targetLane === 'outcomes' && (targetItemKey || targetAppId)
          ? recentOutcomes.find((item) => outcomeItemRouteKey(item) === targetItemKey || item.id === targetAppId)
          : null;
        if (restored) return restored;
        if (current) {
          return recentOutcomes.find((item) => outcomeItemRouteKey(item) === outcomeItemRouteKey(current)) || recentOutcomes[0];
        }
        return recentOutcomes[0];
      });
      setSelectedScan((current) => {
        if (!data.scan.recent.length) return null;
        const restored = targetLane === 'scanner' && targetItemKey ? data.scan.recent.find((entry) => scanItemRouteKey(entry) === targetItemKey) : null;
        if (restored) return restored;
        if (current) {
          return data.scan.recent.find((entry) => entry.url === current.url) || data.scan.recent[0];
        }
        return data.scan.recent[0];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadOperations();
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setScanActionMessage('');
    });
  }, [selectedScan?.url]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCopiedActionKey('');
      setCopyFailedActionKey('');
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPipeline?.raw, selectedFollowup?.num, selectedOutcome?.raw, selectedScan?.url]);

  const followupEntries = payload.followups.entries || [];
  const recommendations = payload.patterns.recommendations || [];
  const remotePolicies = useMemo(() => payload.patterns.remotePolicy || [], [payload.patterns.remotePolicy]);
  const normalizedOpsQuery = opsQuery.trim().toLowerCase();
  const filteredPipelineItems = payload.pipeline.next.filter((item) => includesQuery([
    item.company,
    item.role,
    item.url,
    item.portal,
    item.scanTitle,
    item.readiness,
  ], normalizedOpsQuery));
  const filteredFollowups = followupEntries.filter((entry) => includesQuery([
    entry.company,
    entry.role,
    entry.status,
    entry.score,
    entry.notes,
    entry.urgency,
  ], normalizedOpsQuery));
  const filteredScanEntries = payload.scan.recent.filter((entry) => includesQuery([
    entry.company,
    entry.title,
    entry.url,
    entry.portal,
    entry.status,
    entry.pipelineState,
  ], normalizedOpsQuery));
  const filteredOutcomes = payload.pipeline.recentCompleted.filter((item) => includesQuery([
    item.company,
    item.role,
    item.status,
    item.score,
    item.notes,
    item.reportFilename,
    item.jobUrl,
  ], normalizedOpsQuery));
  const filteredRecommendations = recommendations.filter((item) => includesQuery([
    item.action,
    item.reasoning,
    item.impact,
  ], normalizedOpsQuery));
  const scanTotal = Math.max(payload.scan.total, 1);
  const scanAddedPct = Math.round((payload.scan.added / scanTotal) * 100);
  const skippedTotal = payload.scan.skippedExpired + payload.scan.skippedTitle + payload.scan.skippedDuplicate + payload.scan.uncertain;
  const selectedPipelineHost = selectedPipeline?.url ? hostFromUrl(selectedPipeline.url) : '';
  const selectedFollowupReport = selectedFollowup ? reportFilenameFromPath(selectedFollowup.reportPath) : '';
  const selectedOutcomeHost = selectedOutcome?.jobUrl || selectedOutcome?.url ? hostFromUrl(selectedOutcome.jobUrl || selectedOutcome.url) : '';
  const selectedScanHost = selectedScan?.url ? hostFromUrl(selectedScan.url) : '';
  const selectedEvaluationBrief = selectedPipeline ? buildEvaluationBrief(selectedPipeline) : '';
  const selectedPipelineLine = selectedScan ? buildPipelineLine(selectedScan) : '';
  const selectedPipelineActions = selectedPipeline ? buildIntakeActions(selectedPipeline) : [];
  const selectedFollowupActions = selectedFollowup ? buildFollowupActions(selectedFollowup, selectedFollowupReport) : [];
  const selectedScanActions = selectedScan ? buildScanActions(selectedScan, selectedPipelineLine) : [];
  const selectedOutcomeActions = selectedOutcome ? buildOutcomeActions(selectedOutcome) : [];

  const getSelectedRouteItemKey = (lane: OpsLane) => {
    if (lane === 'intake' && selectedPipeline) return pipelineItemRouteKey(selectedPipeline);
    if (lane === 'followups' && selectedFollowup) return followupItemRouteKey(selectedFollowup);
    if (lane === 'scanner' && selectedScan) return scanItemRouteKey(selectedScan);
    if (lane === 'outcomes' && selectedOutcome) return outcomeItemRouteKey(selectedOutcome);
    return '';
  };

  const scrollOperationsSelectionIntoView = (lane: OpsLane, preferDetail = false) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const detailElement = document.querySelector<HTMLElement>(`#ops-lane-${lane} [data-selected-record-detail="true"]`);
        const laneElement = document.getElementById(`ops-lane-${lane}`);
        const shouldPreferDetail = preferDetail && window.matchMedia?.('(max-width: 820px)').matches;
        const targetElement = shouldPreferDetail ? detailElement || laneElement : laneElement;
        if (typeof targetElement?.scrollIntoView === 'function') {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  };

  const selectOperationsRecord = (lane: OpsLane, itemKey: string) => {
    const capabilityKey = defaultCapabilityForLane(lane);
    setActiveLane(lane);
    setSelectedCapabilityKey(capabilityKey);
    writeOperationsRoute(lane, capabilityKey, { query: opsQuery, itemKey });
    scrollOperationsSelectionIntoView(lane, true);
  };

  const updateOpsQuery = (value: string) => {
    setOpsQuery(value);
    writeOperationsRoute(activeLane, selectedCapabilityKey, { query: value, itemKey: getSelectedRouteItemKey(activeLane) });
  };

  const copyOperationAction = async (action: OperationAction) => {
    setCopyFailedActionKey('');
    try {
      await copyTextToClipboard(action.brief);
      setCopiedActionKey(action.id);
      window.setTimeout(() => setCopiedActionKey(''), 1800);
    } catch {
      setCopyFailedActionKey(action.id);
      window.setTimeout(() => setCopyFailedActionKey(''), 2200);
    }
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

  const copyEvaluationBrief = async () => {
    if (!selectedPipeline || !selectedEvaluationBrief) return;
    try {
      await copyTextToClipboard(selectedEvaluationBrief);
      setCopiedBriefKey(selectedPipeline.raw);
      window.setTimeout(() => setCopiedBriefKey(''), 1800);
    } catch {
      setCopiedBriefKey('');
    }
  };

  const copyPipelineLine = async () => {
    if (!selectedScan || !selectedPipelineLine) return;
    try {
      await copyTextToClipboard(selectedPipelineLine);
      setCopiedScanKey(selectedScan.url);
      window.setTimeout(() => setCopiedScanKey(''), 1800);
    } catch {
      setCopiedScanKey('');
    }
  };

  const promoteScanItem = async () => {
    if (!selectedScan) return;
    setPromotingScanUrl(selectedScan.url);
    setScanActionMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/pipeline/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: selectedScan.url,
          company: selectedScan.company,
          title: selectedScan.title,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'Failed to add to pipeline');
      const nextPayload = data.operations as OperationsPayload;
      setPayload(nextPayload);
      const nextSelected = nextPayload.scan.recent.find((entry) => entry.url === selectedScan.url) || selectedScan;
      setSelectedScan(nextSelected);
      setScanActionMessage(data.result?.duplicate ? 'Already in pipeline' : 'Added to pipeline');
    } catch (err) {
      setScanActionMessage(err instanceof Error ? err.message : 'Could not add to pipeline');
    } finally {
      setPromotingScanUrl('');
    }
  };

  const bestPolicy = useMemo(() => {
    return [...remotePolicies].sort((a, b) => b.conversionRate - a.conversionRate)[0];
  }, [remotePolicies]);

  const focusLane = (
    lane: OpsLane,
    {
      preserveCapability = false,
      capabilityKey,
      queryOverride,
    }: { preserveCapability?: boolean; capabilityKey?: OpsCapabilityKey; queryOverride?: string } = {},
  ) => {
    const routeQuery = queryOverride ?? opsQuery;
    setActiveLane(lane);
    if (!preserveCapability) {
      setSelectedCapabilityKey(defaultCapabilityForLane(lane));
    }
    writeOperationsRoute(lane, preserveCapability ? capabilityKey || selectedCapabilityKey : undefined, {
      query: routeQuery,
      itemKey: getSelectedRouteItemKey(lane),
    });
    scrollOperationsSelectionIntoView(lane);
  };

  const currentSavedView = opsSavedViews.find((view) => view.lane === activeLane && !opsQuery.trim());
  const activeFilters = [
    activeLane !== 'intake' ? { key: 'lane', label: `Lane: ${laneLabels[activeLane]}` } : null,
    opsQuery.trim() ? { key: 'query', label: `Search: ${opsQuery.trim()}` } : null,
  ].filter(Boolean) as { key: string; label: string }[];

  const getFilteredLaneCount = (lane: OpsLane) => {
    if (lane === 'intake') return filteredPipelineItems.length;
    if (lane === 'followups') return filteredFollowups.length;
    if (lane === 'scanner') return filteredScanEntries.length;
    if (lane === 'outcomes') return filteredOutcomes.length;
    return filteredRecommendations.length;
  };

  const applySavedView = (view: typeof opsSavedViews[number]) => {
    setOpsQuery('');
    focusLane(view.lane, { queryOverride: '' });
  };

  const clearFilter = (key: string) => {
    if (key === 'query') updateOpsQuery('');
    if (key === 'lane') focusLane('intake');
  };

  const resetFilters = () => {
    setOpsQuery('');
    focusLane('intake', { queryOverride: '' });
  };

  const lanePanelStyle = (lane: OpsLane, fallbackOrder: number) => ({
    order: activeLane === lane ? 1 : fallbackOrder,
  });

  const selectedContext = (() => {
    if (activeLane === 'followups' && selectedFollowup) {
      return {
        eyebrow: 'Active follow-up',
        title: selectedFollowup.company,
        subtitle: selectedFollowup.role,
        badge: urgencyLabel(selectedFollowup),
        meta: `${selectedFollowup.status} / ${selectedFollowup.score || 'N/A'} / ${selectedFollowup.daysSinceApplication}d since apply`,
      };
    }
    if (activeLane === 'scanner' && selectedScan) {
      return {
        eyebrow: 'Active scan row',
        title: selectedScan.company || 'Unknown company',
        subtitle: selectedScan.title || selectedScan.url,
        badge: statusLabel(selectedScan.status),
        meta: `${selectedScan.portal || 'Unknown portal'} / ${selectedScan.inPipeline ? 'Queued' : 'Not queued'}`,
      };
    }
    if (activeLane === 'outcomes' && selectedOutcome) {
      return {
        eyebrow: 'Active outcome',
        title: selectedOutcome.company,
        subtitle: selectedOutcome.role,
        badge: selectedOutcome.score || 'N/A',
        meta: `${selectedOutcome.status || 'Processed'} / ${selectedOutcome.pdf ? 'PDF ready' : 'PDF missing'}`,
      };
    }
    if (activeLane === 'intelligence') {
      const recommendation = filteredRecommendations[0] || recommendations[0];
      return {
        eyebrow: 'Active intelligence',
        title: recommendation?.action || 'Targeting recommendations',
        subtitle: recommendation?.reasoning || 'Run pattern analysis after more outcomes accumulate.',
        badge: recommendation?.impact || `${recommendations.length} rules`,
        meta: payload.patterns.scoreThreshold?.reasoning || 'Pattern analysis uses tracker outcomes and score thresholds.',
      };
    }
    if (selectedPipeline) {
      return {
        eyebrow: 'Active intake',
        title: selectedPipeline.company || 'Unknown company',
        subtitle: selectedPipeline.role || selectedPipeline.url,
        badge: selectedPipeline.readiness || 'Pending',
        meta: `${selectedPipeline.portal || 'data/pipeline.md'} / ${selectedPipelineHost || 'Unknown host'}`,
      };
    }
    return {
      eyebrow: 'No record selected',
      title: laneLabels[activeLane],
      subtitle: 'Select a row in this lane to inspect command context and source details.',
      badge: 'Idle',
      meta: 'Career-Ops operations data is loaded from pipeline, scanner, follow-up, and pattern files.',
    };
  })();

  const followupAlertCount = (payload.followups.metadata?.overdue || 0) + (payload.followups.metadata?.urgent || 0);
  const laneButtons: { lane: OpsLane; label: string; value: string | number; helper: string; icon: React.ReactNode }[] = [
    { lane: 'intake', label: 'Intake', value: payload.pipeline.pending, helper: 'Pending URLs', icon: <Inbox size={17} /> },
    { lane: 'followups', label: 'Follow-ups', value: followupAlertCount, helper: 'Alerts due', icon: <CalendarClock size={17} /> },
    { lane: 'scanner', label: 'Scanner', value: payload.scan.recent.length, helper: 'Recent finds', icon: <ScanSearch size={17} /> },
    { lane: 'outcomes', label: 'Outcomes', value: payload.pipeline.recentCompleted.length, helper: 'Recent processed', icon: <CheckCircle2 size={17} /> },
    { lane: 'intelligence', label: 'Intelligence', value: recommendations.length, helper: 'Targeting rules', icon: <Sparkles size={17} /> },
  ];
  const selectedCapability = commandCapabilities.find((capability) => capability.key === selectedCapabilityKey) || commandCapabilities[0];
  const activeLaneActions = (() => {
    if (activeLane === 'followups') return selectedFollowupActions;
    if (activeLane === 'scanner') return selectedScanActions;
    if (activeLane === 'outcomes') return selectedOutcomeActions;
    if (activeLane === 'intelligence') return [];
    return selectedPipelineActions;
  })();
  const activePrimaryAction = activeLaneActions.find((action) => action.command === selectedCapability.command) || activeLaneActions[0];

  const selectCapability = (capability: typeof commandCapabilities[number]) => {
    setSelectedCapabilityKey(capability.key);
    focusLane(capability.lane, { preserveCapability: true, capabilityKey: capability.key });
  };

  return (
    <div className="operations-page">
      <header className="ops-header">
        <div>
          <p className="eyebrow">Career-ops work queues</p>
          <h1>Queues</h1>
          <p>Track intake, scanner quality, follow-up pressure, and targeting rules from the same files the CLI uses.</p>
        </div>
        <button className="refresh-button" onClick={loadOperations} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'is-spinning' : ''} />
          Refresh
        </button>
      </header>

      {error && (
        <StateBlock
          icon={<AlertTriangle size={20} />}
          eyebrow="Operations unavailable"
          title="Could not load workflow data"
          body={error}
          tone="risk"
          action={{ label: 'Try again', onClick: loadOperations }}
          compact
        />
      )}

      <section className="ops-stat-grid" aria-label="Operations metrics">
        <OpsStat label="Pending intake" value={payload.pipeline.pending} helper={`${payload.pipeline.completed} processed from pipeline`} icon={<Inbox size={20} />} />
        <OpsStat label="Follow-up alerts" value={followupAlertCount} helper={`${payload.followups.metadata?.actionable || 0} active applications`} icon={<AlertTriangle size={20} />} />
        <OpsStat label="Scanner added" value={`${scanAddedPct}%`} helper={`${payload.scan.added} added / ${skippedTotal} skipped`} icon={<ScanSearch size={20} />} />
        <OpsStat label="Score gate" value={payload.patterns.scoreThreshold?.recommended ? `${payload.patterns.scoreThreshold.recommended}/5` : 'N/A'} helper={bestPolicy ? `${bestPolicy.policy}: ${bestPolicy.conversionRate}% conversion` : 'Pattern analysis ready'} icon={<Gauge size={20} />} />
      </section>

      <OperationsWorkflowFocus
        activeLane={activeLane}
        laneButtons={laneButtons}
        capability={selectedCapability}
        commandOptions={commandCapabilities}
        selectedContext={selectedContext}
        opsQuery={opsQuery}
        activeFilters={activeFilters}
        currentSavedView={currentSavedView}
        getFilteredLaneCount={getFilteredLaneCount}
        copiedState={copiedWorkspaceLink}
        copiedActionKey={copiedActionKey}
        activeAction={activePrimaryAction}
        onFocusLane={focusLane}
        onSelectCapability={selectCapability}
        onApplySavedView={applySavedView}
        onUpdateQuery={updateOpsQuery}
        onClearFilter={clearFilter}
        onCopyLink={copyWorkspaceLink}
        onCopyAction={copyOperationAction}
        onReset={resetFilters}
      />

      <OperationRunPreview
        capability={selectedCapability}
        selectedContext={selectedContext}
        activeAction={activePrimaryAction}
        copiedActionKey={copiedActionKey}
        onCopy={copyOperationAction}
        onFocusLane={focusLane}
      />

      <section className="ops-grid">
        <div
          id="ops-lane-intake"
          className={`ops-panel ops-panel--wide ops-lane-panel ${activeLane === 'intake' ? 'is-active-lane' : ''}`}
          style={lanePanelStyle('intake', 10)}
        >
          <div className="ops-panel__header">
            <div>
              <p className="eyebrow">Pipeline intake</p>
              <h2>Pending URLs</h2>
            </div>
            <span>{payload.pipeline.pending} open</span>
          </div>
          <div className="intake-workspace">
            <div className="ops-list">
              {loading ? (
                <StateSkeleton rows={7} label="Loading pending intake" />
              ) : filteredPipelineItems.length ? filteredPipelineItems.map((item) => (
                <button
                  className={`ops-item ops-item--button ${selectedPipeline?.raw === item.raw ? 'selected' : ''}`}
                  key={`${item.url}-${item.company}-${item.role}`}
                  onClick={() => {
                    setSelectedPipeline(item);
                    selectOperationsRecord('intake', pipelineItemRouteKey(item));
                  }}
                >
                  <span className="ops-item__icon"><Inbox size={15} /></span>
                  <span>
                    <strong>{item.company || 'Unknown company'}</strong>
                    <small>{item.role || item.url}</small>
                  </span>
                </button>
              )) : (
                <StateBlock
                  icon={normalizedOpsQuery ? <Search size={20} /> : <Inbox size={20} />}
                  eyebrow={normalizedOpsQuery ? 'No intake matches' : 'Intake clear'}
                  title={normalizedOpsQuery ? 'No pending URLs match this search' : 'No pending pipeline URLs'}
                  body={normalizedOpsQuery ? 'Clear the search or switch saved views to inspect another operations lane.' : 'New scanner promotions and manually added URLs will appear here for evaluation.'}
                  tone={normalizedOpsQuery ? 'neutral' : 'success'}
                  action={normalizedOpsQuery ? { label: 'Clear search', onClick: () => updateOpsQuery('') } : undefined}
                  compact
                />
              )}
            </div>

            {activeLane === 'intake' && (
            <aside>
              {selectedPipeline ? (
                <OpsRecordDetail
                  eyebrow="Selected intake"
                  title={selectedPipeline.company || 'Unknown company'}
                  subtitle={selectedPipeline.role || 'Role not extracted'}
                  badge="Pending"
                  tone="strong"
                  chips={[selectedPipelineHost || 'Unknown host', selectedPipeline.portal || 'data/pipeline.md']}
                  facts={[
                    { label: 'Source', value: selectedPipeline.portal || 'data/pipeline.md' },
                    { label: 'First seen', value: selectedPipeline.firstSeen || 'Not in scan history' },
                    { label: 'Readiness', value: selectedPipeline.readiness || 'Needs review' },
                    { label: 'Queue state', value: selectedPipeline.completed ? 'Processed' : 'Pending evaluation' },
                  ]}
                  description="This is the next raw URL waiting for the Career-Ops evaluation workflow. Verify liveness before creating any report or application package."
                  actionBar={(
                    <PrimaryActionBar
                      ariaLabel="Selected intake primary actions"
                  className="ops-record-primary-actions"
                  title="Evaluate this URL"
                  description="Copy the evaluation brief, verify the live posting, then run the Career-Ops pipeline."
                  meta={[
                    selectedPipeline.company || 'Unknown company',
                    selectedPipeline.role || 'Role not extracted',
                    selectedPipeline.completed ? 'Processed' : 'Pending evaluation',
                    selectedPipelineHost || 'Unknown host',
                  ]}
                  actions={(
                    <>
                        <button className="button-primary" type="button" onClick={copyEvaluationBrief}>
                          {copiedBriefKey === selectedPipeline.raw ? <Check size={16} /> : <Clipboard size={16} />}
                          {copiedBriefKey === selectedPipeline.raw ? 'Brief copied' : 'Copy brief'}
                        </button>
                        <a className="button-secondary" href={selectedPipeline.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={16} />
                          Job post
                        </a>
                        </>
                      )}
                    />
                  )}
                >
                  <CommandPlaybook
                    title="Intake command"
                    actions={selectedPipelineActions}
                    copiedActionId={copiedActionKey}
                    copyFailedActionId={copyFailedActionKey}
                    onCopy={copyOperationAction}
                    variant="compact"
                  />
                  <div className="ops-record-source">
                    <p className="eyebrow">Source URL</p>
                    <code>{selectedPipeline.url}</code>
                  </div>
                </OpsRecordDetail>
              ) : (
                <StateBlock
                  icon={<Inbox size={20} />}
                  eyebrow="No intake selected"
                  title="Select a pending URL"
                  body="Choose an intake item to review source context, copy the evaluation brief, or open the job post."
                  compact
                />
              )}
            </aside>
            )}
          </div>
        </div>

        <div
          id="ops-lane-followups"
          className={`ops-panel ops-lane-panel ${activeLane === 'followups' ? 'is-active-lane' : ''}`}
          style={lanePanelStyle('followups', 20)}
        >
          <div className="ops-panel__header">
            <div>
              <p className="eyebrow">Cadence</p>
              <h2>Follow-ups</h2>
            </div>
            <span className={payload.files.followupsExists ? 'ops-good' : 'ops-warn'}>
              {payload.files.followupsExists ? 'Logged' : 'No ledger'}
            </span>
          </div>
          <div className="ops-list">
            {loading ? (
              <StateSkeleton rows={3} label="Loading follow-ups" />
            ) : filteredFollowups.length ? filteredFollowups.map((entry) => (
              <button
                className={`ops-item ops-item--button ${selectedFollowup?.num === entry.num ? 'selected' : ''}`}
                key={`${entry.num}-${entry.company}`}
                onClick={() => {
                  setSelectedFollowup(entry);
                  selectOperationsRecord('followups', followupItemRouteKey(entry));
                }}
              >
                <span className={`urgency-dot urgency-${entry.urgency}`} />
                <span>
                  <strong>{entry.company}</strong>
                  <small>{entry.role}</small>
                </span>
                <em>{urgencyLabel(entry)}</em>
              </button>
            )) : (
              <StateBlock
                icon={normalizedOpsQuery ? <Search size={20} /> : <CalendarClock size={20} />}
                eyebrow={normalizedOpsQuery ? 'No follow-ups match' : 'Cadence clear'}
                title={normalizedOpsQuery ? 'No follow-ups match this search' : 'No active follow-ups'}
                body={normalizedOpsQuery ? 'Clear the search or inspect another saved view.' : 'When applied records reach their follow-up cadence, they will surface here with urgency.'}
                tone={normalizedOpsQuery ? 'neutral' : 'success'}
                action={normalizedOpsQuery ? { label: 'Clear search', onClick: () => updateOpsQuery('') } : undefined}
                compact
              />
            )}
          </div>
          {activeLane === 'followups' && selectedFollowup && (
            <OpsRecordDetail
              eyebrow="Selected follow-up"
              title={selectedFollowup.company}
              subtitle={selectedFollowup.role}
              badge={<span className={`urgency-pill urgency-pill--${selectedFollowup.urgency}`}>{selectedFollowup.urgency}</span>}
              tone={selectedFollowup.urgency === 'overdue' || selectedFollowup.urgency === 'urgent' ? 'risk' : 'strong'}
              chips={[selectedFollowup.status, `${selectedFollowup.daysSinceApplication}d since apply`]}
              facts={[
                { label: 'Status', value: selectedFollowup.status },
                { label: 'Applied', value: `${selectedFollowup.daysSinceApplication} days ago` },
                { label: 'Next follow-up', value: selectedFollowup.nextFollowupDate || 'Not scheduled' },
                { label: 'Score', value: selectedFollowup.score || 'N/A' },
              ]}
              description={selectedFollowup.notes || 'No tracker notes captured for this application.'}
              actionBar={(
                <PrimaryActionBar
                  ariaLabel="Selected follow-up primary actions"
                  className="ops-record-primary-actions"
                  title="Draft follow-up"
                  description="Copy a follow-up brief with tracker context; sending still stays with you."
                  meta={[
                    `${selectedFollowup.company} #${selectedFollowup.num}`,
                    selectedFollowup.status,
                    selectedFollowup.score ? `Score ${selectedFollowup.score}` : 'Score N/A',
                    `${selectedFollowup.daysSinceApplication}d since apply`,
                  ]}
                  actions={(
                    <>
                    {selectedFollowupActions[0] && (
                      <button className="button-primary" type="button" onClick={() => copyOperationAction(selectedFollowupActions[0])}>
                        {copiedActionKey === selectedFollowupActions[0].id ? <Check size={16} /> : <Clipboard size={16} />}
                        {copiedActionKey === selectedFollowupActions[0].id ? 'Brief copied' : 'Copy brief'}
                      </button>
                    )}
                    {selectedFollowupReport && (
                      <Link className="button-secondary" to={reportHrefWithContext(selectedFollowupReport, String(selectedFollowup.num), 'followups')}>
                        <FileText size={16} />
                        Report
                      </Link>
                    )}
                    <Link className="button-secondary" to="/applications">
                      <CalendarClock size={16} />
                      Tracker
                    </Link>
                    </>
                  )}
                />
              )}
            >
              <CommandPlaybook
                title="Follow-up command"
                actions={selectedFollowupActions}
                copiedActionId={copiedActionKey}
                copyFailedActionId={copyFailedActionKey}
                onCopy={copyOperationAction}
                variant="compact"
              />
            </OpsRecordDetail>
          )}
        </div>

        <div className="ops-panel ops-lane-panel ops-support-panel" style={{ order: 30 }}>
          <div className="ops-panel__header">
            <div>
              <p className="eyebrow">Scanner quality</p>
              <h2>Scan history</h2>
            </div>
            <span>{payload.scan.total} rows</span>
          </div>
          <div className="scan-stack">
            {[
              ['Added', payload.scan.added, 'green'],
              ['Expired', payload.scan.skippedExpired, 'amber'],
              ['Title skip', payload.scan.skippedTitle, 'blue'],
              ['Duplicate', payload.scan.skippedDuplicate, 'gray'],
              ['Uncertain', payload.scan.uncertain, 'red'],
            ].map(([label, value, tone]) => (
              <div className="scan-row" key={label as string}>
                <span>{label}</span>
                <div><i className={`tone-${tone}`} style={{ width: `${Math.max(4, Math.round((Number(value) / scanTotal) * 100))}%` }} /></div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div
          id="ops-lane-intelligence"
          className={`ops-panel ops-panel--wide ops-lane-panel ${activeLane === 'intelligence' ? 'is-active-lane' : ''}`}
          style={lanePanelStyle('intelligence', 40)}
        >
          <div className="ops-panel__header">
            <div>
              <p className="eyebrow">Targeting intelligence</p>
              <h2>Pattern recommendations</h2>
            </div>
            <Sparkles size={18} />
          </div>
          <div className="recommendation-list">
            {loading ? (
              <StateSkeleton rows={3} label="Loading pattern recommendations" />
            ) : filteredRecommendations.length ? filteredRecommendations.map((item) => (
              <div className="recommendation" key={item.action}>
                <strong>{item.action}</strong>
                <p>{item.reasoning}</p>
                <span>{item.impact} impact</span>
              </div>
            )) : (
              <StateBlock
                icon={normalizedOpsQuery ? <Search size={20} /> : <Sparkles size={20} />}
                eyebrow={normalizedOpsQuery ? 'No intelligence matches' : 'No recommendations'}
                title={normalizedOpsQuery ? 'No recommendations match this search' : 'No pattern recommendations available'}
                body={normalizedOpsQuery ? 'Clear the search to return to all targeting recommendations.' : 'Run the pattern analysis workflow after more outcomes accumulate to generate targeting rules.'}
                action={normalizedOpsQuery ? { label: 'Clear search', onClick: () => updateOpsQuery('') } : undefined}
                compact
              />
            )}
          </div>
        </div>

        <div
          id="ops-lane-scanner"
          className={`ops-panel ops-lane-panel ${activeLane === 'scanner' ? 'is-active-lane' : ''}`}
          style={lanePanelStyle('scanner', 50)}
        >
          <div className="ops-panel__header">
            <div>
              <p className="eyebrow">Recent scanner finds</p>
              <h2>Latest scan rows</h2>
            </div>
            <History size={18} />
          </div>
          <div className="ops-list ops-list--compact">
            {loading ? (
              <StateSkeleton rows={6} label="Loading scanner rows" />
            ) : filteredScanEntries.length ? filteredScanEntries.slice(0, 8).map((entry) => (
              <button
                className={`ops-item ops-item--button ${selectedScan?.url === entry.url ? 'selected' : ''}`}
                key={`${entry.url}-${entry.title}`}
                onClick={() => {
                  setSelectedScan(entry);
                  selectOperationsRecord('scanner', scanItemRouteKey(entry));
                }}
              >
                <span className="ops-item__icon"><Activity size={15} /></span>
                <span>
                  <strong>{entry.company}</strong>
                  <small>{entry.title}</small>
                </span>
                <em>{statusLabel(entry.status)}</em>
              </button>
            )) : (
              <StateBlock
                icon={normalizedOpsQuery ? <Search size={20} /> : <ScanSearch size={20} />}
                eyebrow={normalizedOpsQuery ? 'No scan rows match' : 'No scan rows'}
                title={normalizedOpsQuery ? 'No scanner rows match this search' : 'No recent scanner finds'}
                body={normalizedOpsQuery ? 'Clear the search or switch saved views to inspect another lane.' : 'Run the scanner to populate this lane with fresh portal results and dedupe status.'}
                action={normalizedOpsQuery ? { label: 'Clear search', onClick: () => updateOpsQuery('') } : undefined}
                compact
              />
            )}
          </div>
          {activeLane === 'scanner' && selectedScan && (
            <OpsRecordDetail
              eyebrow="Selected scan row"
              title={selectedScan.company || 'Unknown company'}
              subtitle={selectedScan.title || 'Role not captured'}
              badge={statusLabel(selectedScan.status)}
              tone={selectedScan.inPipeline ? 'success' : 'neutral'}
              chips={[selectedScanHost || 'Unknown host', selectedScan.portal || 'Unknown portal']}
              facts={[
                { label: 'Portal', value: selectedScan.portal || 'Unknown' },
                { label: 'First seen', value: selectedScan.firstSeen || 'Unknown' },
                { label: 'Pipeline', value: selectedScan.pipelineState === 'processed' ? 'Processed' : selectedScan.inPipeline ? 'Queued' : 'Not queued' },
                { label: 'Scanner status', value: statusLabel(selectedScan.status) },
              ]}
              description={selectedScan.inPipeline ? 'This scanner result already exists in the intake queue or tracker. Use the command brief to continue evaluation with context.' : 'This scanner result can be promoted into the intake queue before evaluation.'}
              actionBar={(
                <PrimaryActionBar
                  ariaLabel="Selected scanner row primary actions"
                  className="ops-record-primary-actions"
                  title={selectedScan.inPipeline ? 'Continue from pipeline' : 'Promote to intake'}
                  description={selectedScan.inPipeline ? 'This role is already queued; copy the intake line or open the source.' : 'Add the scanner hit to the intake queue before evaluation.'}
                  meta={[
                    selectedScan.company || 'Unknown company',
                    selectedScan.portal || 'Unknown portal',
                    selectedScan.inPipeline ? 'Already queued' : 'Needs intake',
                    selectedScanHost || 'Unknown host',
                  ]}
                  actions={(
                    <>
                    <button
                      className="button-primary"
                      type="button"
                      onClick={promoteScanItem}
                      disabled={Boolean(selectedScan.inPipeline) || promotingScanUrl === selectedScan.url}
                    >
                      {selectedScan.inPipeline ? <Check size={16} /> : <Inbox size={16} />}
                      {selectedScan.inPipeline ? 'In pipeline' : promotingScanUrl === selectedScan.url ? 'Adding...' : 'Add to pipeline'}
                    </button>
                    <button className="button-secondary" type="button" onClick={copyPipelineLine}>
                      {copiedScanKey === selectedScan.url ? <Check size={16} /> : <Clipboard size={16} />}
                      {copiedScanKey === selectedScan.url ? 'Copied' : 'Copy intake'}
                    </button>
                    <a className="button-secondary" href={selectedScan.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      Job post
                    </a>
                    </>
                  )}
                />
              )}
            >
              <CommandPlaybook
                title="Scan command"
                actions={selectedScanActions}
                copiedActionId={copiedActionKey}
                copyFailedActionId={copyFailedActionKey}
                onCopy={copyOperationAction}
                variant="compact"
              />
              <div className="ops-record-source">
                <p className="eyebrow">Pipeline line</p>
                <code>{selectedPipelineLine}</code>
              </div>
              {scanActionMessage && (
                <div className={scanActionMessage.includes('Added') || scanActionMessage.includes('Already') ? 'scan-action-message ok' : 'scan-action-message error'}>
                  {scanActionMessage}
                </div>
              )}
            </OpsRecordDetail>
          )}
        </div>

        <div
          id="ops-lane-outcomes"
          className={`ops-panel ops-lane-panel ${activeLane === 'outcomes' ? 'is-active-lane' : ''}`}
          style={lanePanelStyle('outcomes', 60)}
        >
          <div className="ops-panel__header">
            <div>
              <p className="eyebrow">Processed queue</p>
              <h2>Recent outcomes</h2>
            </div>
            <CheckCircle2 size={18} />
          </div>
          <div className="ops-list ops-list--compact">
            {loading ? (
              <StateSkeleton rows={6} label="Loading processed outcomes" />
            ) : filteredOutcomes.length ? filteredOutcomes.map((item) => (
              <button
                className={`ops-item ops-item--button ${selectedOutcome?.raw === item.raw ? 'selected' : ''}`}
                key={`${item.id}-${item.url}`}
                onClick={() => {
                  setSelectedOutcome(item);
                  selectOperationsRecord('outcomes', outcomeItemRouteKey(item));
                }}
              >
                <span className="ops-item__icon"><FileText size={15} /></span>
                <span>
                  <strong>{item.company}</strong>
                  <small>{item.role}</small>
                </span>
                <em>{item.score || 'N/A'}</em>
              </button>
            )) : (
              <StateBlock
                icon={normalizedOpsQuery ? <Search size={20} /> : <CheckCircle2 size={20} />}
                eyebrow={normalizedOpsQuery ? 'No outcomes match' : 'No outcomes'}
                title={normalizedOpsQuery ? 'No processed outcomes match this search' : 'No processed outcomes yet'}
                body={normalizedOpsQuery ? 'Clear the search to return to processed outcomes.' : 'Completed pipeline evaluations will land here with reports, scores, and next-action context.'}
                action={normalizedOpsQuery ? { label: 'Clear search', onClick: () => updateOpsQuery('') } : undefined}
                compact
              />
            )}
          </div>
          {activeLane === 'outcomes' && selectedOutcome && (
            <OpsRecordDetail
              eyebrow="Selected outcome"
              title={selectedOutcome.company}
              subtitle={selectedOutcome.role}
              badge={selectedOutcome.score || 'N/A'}
              tone="success"
              chips={[selectedOutcome.status || 'Processed', selectedOutcomeHost || 'Unknown host']}
              facts={[
                { label: 'Status', value: selectedOutcome.status || 'Processed' },
                { label: 'Date', value: selectedOutcome.applicationDate || 'Not merged' },
                { label: 'Host', value: selectedOutcomeHost || 'Unknown' },
                { label: 'PDF', value: selectedOutcome.pdf ? 'Ready' : 'Not ready' },
              ]}
              description={selectedOutcome.notes || 'This processed item has not been matched to tracker notes yet.'}
              actionBar={(
                <PrimaryActionBar
                  ariaLabel="Selected outcome primary actions"
                  className="ops-record-primary-actions"
                  title="Review outcome evidence"
                  description="Open the report, source role, or copy the next command for this processed item."
                  meta={[
                    `${selectedOutcome.company} #${selectedOutcome.id}`,
                    selectedOutcome.status || 'Processed',
                    selectedOutcome.score ? `Score ${selectedOutcome.score}` : 'Score N/A',
                    selectedOutcome.pdf ? 'PDF ready' : 'PDF missing',
                  ]}
                  actions={(
                    <>
                    {selectedOutcome.reportFilename && (
                      <Link className="button-primary" to={reportHrefWithContext(selectedOutcome.reportFilename, selectedOutcome.id, 'outcomes')}>
                        <FileText size={16} />
                        Report
                      </Link>
                    )}
                    {selectedOutcomeActions[0] && (
                      <button className="button-secondary" type="button" onClick={() => copyOperationAction(selectedOutcomeActions[0])}>
                        {copiedActionKey === selectedOutcomeActions[0].id ? <Check size={16} /> : <Clipboard size={16} />}
                        {copiedActionKey === selectedOutcomeActions[0].id ? 'Copied' : 'Copy brief'}
                      </button>
                    )}
                    {(selectedOutcome.jobUrl || selectedOutcome.url) && (
                      <a className="button-secondary" href={selectedOutcome.jobUrl || selectedOutcome.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} />
                        Job post
                      </a>
                    )}
                    </>
                  )}
                />
              )}
            >
              <CommandPlaybook
                title="Outcome command"
                actions={selectedOutcomeActions}
                copiedActionId={copiedActionKey}
                copyFailedActionId={copyFailedActionKey}
                onCopy={copyOperationAction}
                variant="compact"
              />
            </OpsRecordDetail>
          )}
        </div>
      </section>
    </div>
  );
}

export default Operations;
