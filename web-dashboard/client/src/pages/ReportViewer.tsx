import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  Clipboard,
  Database,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Gauge,
  ListChecks,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import CommandPlaybook from '../components/CommandPlaybook';
import PrimaryActionBar from '../components/PrimaryActionBar';
import { StateBlock, StateSkeleton } from '../components/StateBlock';
import { copyTextToClipboard } from '../utils/clipboard';
import '../styles/ReportViewer.css';

interface ReportMeta {
  title: string;
  company: string;
  role: string;
  url: string;
  date: string;
  score: string;
  pdf: string;
  legitimacy: string;
  archetype: string;
  recommendation: string;
}

interface TocItem {
  id: string;
  label: string;
  level: number;
}

interface ReportAction {
  id: string;
  label: string;
  command: string;
  helper: string;
  tone: 'elite' | 'strong' | 'risk' | 'neutral';
  brief: string;
}

interface MarkdownTextBlock {
  type: 'markdown';
  content: string;
}

interface MarkdownTableBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
}

type MarkdownBlock = MarkdownTextBlock | MarkdownTableBlock;

interface ReportSection {
  id: string;
  label: string;
  markdown: string;
  preview: string;
  evidenceCount: number;
  tableCount: number;
}

type ReportViewKey = 'full' | 'decision' | 'evidence' | 'risks' | 'actions';
type ReportSectionCategory = ReturnType<typeof sectionCategory>;

interface WorkflowContract {
  reads: string;
  produces: string;
  guardrail: string;
}

const emptyMeta: ReportMeta = {
  title: 'Evaluation Report',
  company: '',
  role: '',
  url: '',
  date: '',
  score: '',
  pdf: '',
  legitimacy: '',
  archetype: '',
  recommendation: '',
};

const reportViews: {
  key: ReportViewKey;
  label: string;
  helper: string;
}[] = [
  { key: 'full', label: 'Full dossier', helper: 'All sections' },
  { key: 'decision', label: 'Decision', helper: 'Score and fit' },
  { key: 'evidence', label: 'Evidence', helper: 'Signals and tables' },
  { key: 'risks', label: 'Risks', helper: 'Flags and legitimacy' },
  { key: 'actions', label: 'Actions', helper: 'Next steps' },
];

const isReportViewKey = (value: string | null): value is ReportViewKey => (
  Boolean(value) && reportViews.some((view) => view.key === value)
);

const reportViewFromParams = (params: URLSearchParams) => {
  const view = params.get('reportView');
  return isReportViewKey(view) ? view : 'full';
};

const slugify = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const stripMarkdown = (value = '') => value.replace(/\*\*/g, '').replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1').trim();

const readField = (content: string, label: string) => {
  const pattern = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'im');
  return stripMarkdown(content.match(pattern)?.[1] || '');
};

const readFirst = (content: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const value = content.match(pattern)?.[1];
    if (value) return stripMarkdown(value);
  }
  return '';
};

const parseReport = (content: string) => {
  const title = stripMarkdown(content.match(/^#\s+(.+)$/m)?.[1] || 'Evaluation Report');
  const evaluationTitleParts = title.match(/^Evaluation:\s*(.+?)\s+[\u2014-]\s+(.+)$/);
  const reportTitleParts = title.match(/^Report\s+\d+:\s*(.+?)\s+[\u2014-]\s+(.+)$/);
  const meta: ReportMeta = {
    title,
    company: readField(content, 'Company') || evaluationTitleParts?.[1] || reportTitleParts?.[1] || '',
    role: readField(content, 'Role') || evaluationTitleParts?.[2] || reportTitleParts?.[2] || '',
    url: readFirst(content, [/^\*\*URL:\*\*\s*(https?:\/\/\S+)/im]),
    date: readField(content, 'Date'),
    score: readField(content, 'Score') || readFirst(content, [
      /^#+\s+.*Global Score:\s*([0-9.]+\/5)/im,
      /Global Score:\s*([0-9.]+\/5)/i,
    ]),
    pdf: readField(content, 'PDF'),
    legitimacy: readField(content, 'Legitimacy') || readFirst(content, [/^\*\*Tier:\*\*\s*(.+)$/im]),
    archetype: readFirst(content, [
      /^\*\*Primary Archetype:\*\*\s*(.+)$/im,
      /^\*\*Archetype:\*\*\s*(.+)$/im,
      /^\*\*Arquetipo(?: detectado)?:\*\*\s*(.+)$/im,
    ]),
    recommendation: readFirst(content, [
      /^\*\*Recommendation:\*\*\s*(.+)$/im,
      /^\*\*Global Recommendation:\*\*\s*(.+)$/im,
      /^\*\*TL;DR:\*\*\s*(.+)$/im,
      /^### Recommended Action\s*\n+\*\*(.+?)\*\*/im,
    ]),
  };

  const toc: TocItem[] = [];
  let body = content.replace(/^#\s+.+\n+/, '');
  body = body.replace(/^## \*\*Header\*\*[\s\S]*?---\n+/m, '');
  body = body.replace(/^\*\*Date:\*\*[\s\S]*?\n\n---\n+/m, '');
  const enhancedBody = body.replace(/^(#{2,3})\s+\*?(.+?)\*?\s*$/gm, (_match, hashes: string, rawLabel: string) => {
    const label = stripMarkdown(rawLabel);
    const id = slugify(label);
    if (id) toc.push({ id, label, level: hashes.length });
    return `${hashes} ${label}`;
  });

  return { meta, toc, body: enhancedBody };
};

const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const parseTableLine = (line: string) => line
  .trim()
  .replace(/^\|/, '')
  .replace(/\|$/, '')
  .split('|')
  .map((cell) => stripMarkdown(cell));

const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
  const lines = markdown.split('\n');
  const blocks: MarkdownBlock[] = [];
  let markdownBuffer: string[] = [];

  const flushMarkdown = () => {
    const content = markdownBuffer.join('\n').trim();
    if (content) blocks.push({ type: 'markdown', content });
    markdownBuffer = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line.trim().startsWith('|') && next && isTableSeparator(next)) {
      flushMarkdown();
      const headers = parseTableLine(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableLine(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'table', headers, rows });
    } else {
      markdownBuffer.push(line);
    }
  }

  flushMarkdown();
  return blocks;
};

const cleanSectionText = (value = '') => stripMarkdown(value)
  .replace(/^[-*]\s+/, '')
  .replace(/^\|/, '')
  .replace(/\|$/, '')
  .replace(/\s*\|\s*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const sectionMatchesQuery = (section: ReportSection, query: string) => {
  if (!query) return true;
  return [
    section.label,
    section.preview,
    cleanSectionText(section.markdown),
  ].join(' ').toLowerCase().includes(query);
};

const sectionMatchesView = (section: ReportSection, view: ReportViewKey) => {
  if (view === 'full') return true;
  const label = section.label.toLowerCase();
  const haystack = `${section.label} ${section.preview} ${cleanSectionText(section.markdown)}`.toLowerCase();
  if (view === 'decision') {
    return /overview|summary|score|fit|match|recommend|decision|block a|block b|tldr|tl;dr/.test(label)
      || /overview|summary|score|fit|match|recommend|decision|tldr|tl;dr/.test(haystack);
  }
  if (view === 'evidence') {
    return /evidence|requirement|signal|proof|portfolio|jd|company|role|responsibilit|experience|table|match|alignment|comp|cultural|cv|block c|block d/.test(label)
      || /evidence|requirement|signal|proof|portfolio|jd|company|role|responsibilit|experience|table/.test(haystack);
  }
  if (view === 'risks') {
    return /risk|red flag|legitimacy|concern|weak|gap|blocker|expired|verification|posting|block g/.test(label);
  }
  return /action|apply|interview|follow|next|package|outreach|pdf|prepare|block e|block f/.test(label)
    || /action|apply|interview|follow|next|package|outreach|pdf|prepare/.test(haystack);
};

const sectionPreview = (markdown: string) => {
  const tldr = markdown.match(/^\|\s*TL;DR\s*\|\s*(.+?)\s*\|$/im)?.[1];
  if (tldr) return cleanSectionText(tldr);

  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || isTableSeparator(trimmed)) continue;
    if (/^\|\s*(field|source|#|jd requirement|signal)\s*\|/i.test(trimmed)) continue;
    const cleaned = cleanSectionText(trimmed);
    if (cleaned.length > 12) return cleaned;
  }

  return 'Open this section for the detailed evidence and decision notes.';
};

const splitReportSections = (markdown: string): ReportSection[] => {
  const lines = markdown.split('\n');
  const sections: { label: string; content: string[] }[] = [];
  let current: { label: string; content: string[] } | null = null;
  const preamble: string[] = [];
  const splitOnH2 = lines.some((line) => /^##\s+/.test(line));
  const sectionHeadingPattern = splitOnH2 ? /^##\s+(.+)$/ : /^###\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(sectionHeadingPattern);
    if (match) {
      if (current) sections.push(current);
      current = { label: stripMarkdown(match[1]), content: [] };
    } else if (current) {
      current.content.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (current) sections.push(current);

  const preambleContent = preamble.join('\n').trim();
  const normalizedSections = sections.map((section) => {
    const markdownContent = section.content.join('\n').trim();
    const tableCount = (markdownContent.match(/^\|.+\|$/gm) || []).length;
    const evidenceCount = (markdownContent.match(/^[-*]\s+/gm) || []).length + (markdownContent.match(/^\|\s*[^|-].+\|$/gm) || []).length;
    return {
      id: slugify(section.label),
      label: section.label,
      markdown: markdownContent,
      preview: sectionPreview(markdownContent),
      evidenceCount,
      tableCount,
    };
  });

  if (!preambleContent) return normalizedSections;
  return [{
    id: 'report-overview',
    label: 'Report Overview',
    markdown: preambleContent,
    preview: sectionPreview(preambleContent),
    evidenceCount: (preambleContent.match(/^[-*]\s+/gm) || []).length,
    tableCount: (preambleContent.match(/^\|.+\|$/gm) || []).length,
  }, ...normalizedSections];
};

const sectionCategory = (section: ReportSection) => {
  const label = section.label.toLowerCase();
  const haystack = `${section.label} ${section.preview} ${cleanSectionText(section.markdown)}`.toLowerCase();
  if (/risk|red flag|legitimacy|blocker|gap|verification|posting/.test(label)) return 'Risk';
  if (/action|apply|interview|follow|outreach|pdf|prepare/.test(label)) return 'Action';
  if (/evidence|requirement|signal|proof|portfolio|experience|table|match|alignment|comp|culture|cultural|cv/.test(label)) return 'Evidence';
  if (/risk|red flag|legitimacy|blocker|gap|verification|posting/.test(haystack)) return 'Risk';
  if (/evidence|requirement|signal|proof|portfolio|experience|table|match|alignment|comp|culture|cv/.test(haystack)) return 'Evidence';
  if (/action|apply|interview|follow|outreach|pdf|prepare/.test(haystack)) return 'Action';
  return 'Decision';
};

const scoreTone = (score: string) => {
  const value = Number.parseFloat(score);
  if (!Number.isFinite(value)) return 'neutral';
  if (value >= 4.5) return 'elite';
  if (value >= 4) return 'strong';
  if (value >= 3) return 'medium';
  return 'low';
};

const decisionLabelForScore = (score: string) => {
  const value = Number.parseFloat(score);
  if (!Number.isFinite(value)) return 'Needs review';
  if (value >= 4.5) return 'Priority pursuit';
  if (value >= 4) return 'Verify and apply';
  if (value >= 3) return 'Hold or inspect';
  return 'Likely skip';
};

const commandMode = (command: string) => command.replace(/^\/career-ops\s*/, '').trim().split(/\s+/)[0] || 'tracker';

const workflowContractFor = (command: string): WorkflowContract => {
  const contracts: Record<string, WorkflowContract> = {
    apply: {
      reads: 'CV, evaluation report, tracker notes, job post',
      produces: 'Reviewed application package and answer drafts',
      guardrail: 'Never submit without user review',
    },
    patterns: {
      reads: 'Tracker outcomes, scores, discard reasons',
      produces: 'Targeting rules and score gates',
      guardrail: 'Learn from outcomes, not vibes',
    },
    'interview-prep': {
      reads: 'Report, CV, story bank, company context',
      produces: 'Prep brief, proof stories, panel risks',
      guardrail: 'Ground claims in proof',
    },
    deep: {
      reads: 'Company, role, report, public signals',
      produces: 'Company dossier and interview angles',
      guardrail: 'Research only',
    },
    followup: {
      reads: 'Tracker status, age, notes, report',
      produces: 'Cadence decision and follow-up draft',
      guardrail: 'Draft only; user sends',
    },
    oferta: {
      reads: 'JD, report, profile, scoring rubric',
      produces: 'Fit rationale and next decision',
      guardrail: 'Report is source of truth',
    },
  };

  return contracts[commandMode(command)] || {
    reads: 'Career-Ops source files and selected record',
    produces: 'Prepared decision support for review',
    guardrail: 'No submit, send, or apply without review',
  };
};

const viewForAction = (action: ReportAction): ReportViewKey => {
  const mode = commandMode(action.command);
  if (action.id.includes('discard') || mode === 'patterns') return 'risks';
  if (mode === 'deep') return 'evidence';
  if (mode === 'apply' || mode === 'interview-prep' || mode === 'followup') return 'actions';
  return 'decision';
};

const firstSectionByCategory = (sections: ReportSection[], category: ReturnType<typeof sectionCategory>) => (
  sections
    .filter((section) => sectionCategory(section) === category)
    .sort((a, b) => (b.evidenceCount + b.tableCount) - (a.evidenceCount + a.tableCount))[0]
);

function DecisionBrief({
  meta,
  sections,
  primaryAction,
  dossierDecision,
  onFocusView,
}: {
  meta: ReportMeta;
  sections: ReportSection[];
  primaryAction?: ReportAction;
  dossierDecision: string;
  onFocusView: (view: ReportViewKey) => void;
}) {
  const evidenceSection = firstSectionByCategory(sections, 'Evidence');
  const riskSection = firstSectionByCategory(sections, 'Risk');
  const actionSection = firstSectionByCategory(sections, 'Action');
  const evidenceCount = sections.filter((section) => sectionCategory(section) === 'Evidence').length;
  const riskCount = sections.filter((section) => sectionCategory(section) === 'Risk').length;
  const actionCount = sections.filter((section) => sectionCategory(section) === 'Action').length;
  const nextMoveLabel = actionCount ? `Next move · ${actionCount}` : 'Next move · command';

  return (
    <section className="report-decision-brief" aria-label="Decision brief">
      <div className="report-decision-brief__header">
        <div>
          <p className="eyebrow">Decision brief</p>
          <h2>{decisionLabelForScore(meta.score)}</h2>
        </div>
        <span className={`score-chip score-${scoreTone(meta.score)}`}>{meta.score || 'N/A'}</span>
      </div>
      <div className="report-decision-brief__grid">
        <button type="button" onClick={() => onFocusView('decision')}>
          <CheckCircle2 size={17} />
          <span>Decision</span>
          <strong>{dossierDecision || 'Review required'}</strong>
        </button>
        <button type="button" onClick={() => onFocusView('evidence')}>
          <Sparkles size={17} />
          <span>Evidence · {evidenceCount}</span>
          <strong>{evidenceSection?.preview || meta.archetype || 'No evidence summary extracted yet.'}</strong>
        </button>
        <button type="button" onClick={() => onFocusView('risks')}>
          <ShieldCheck size={17} />
          <span>Risk · {riskCount}</span>
          <strong>{riskSection?.preview || meta.legitimacy || 'No risk section surfaced.'}</strong>
        </button>
        <button type="button" onClick={() => onFocusView('actions')}>
          <ListChecks size={17} />
          <span>{nextMoveLabel}</span>
          <strong>{actionSection?.preview || primaryAction?.helper || primaryAction?.label || 'Choose the next Career-Ops action.'}</strong>
        </button>
      </div>
    </section>
  );
}

function ReaderCockpit({
  sections,
  visibleSections,
  activeSection,
  currentView,
  sourceLabel,
  legitimacy,
  onFocusView,
  onFocusSection,
}: {
  sections: ReportSection[];
  visibleSections: ReportSection[];
  activeSection?: TocItem;
  currentView: typeof reportViews[number];
  sourceLabel: string;
  legitimacy: string;
  onFocusView: (view: ReportViewKey) => void;
  onFocusSection: (id: string) => void;
}) {
  const countByCategory = (category: ReportSectionCategory) => sections.filter((section) => sectionCategory(section) === category).length;
  const visibleEvidencePoints = visibleSections.reduce((sum, section) => sum + section.evidenceCount + section.tableCount, 0);
  const riskCount = countByCategory('Risk');
  const evidenceCount = countByCategory('Evidence');

  return (
    <section className="report-reader-cockpit" aria-label="Report reader cockpit">
      <div className="report-reader-cockpit__header">
        <div>
          <p className="eyebrow">Reader cockpit</p>
          <h2>{currentView.label}</h2>
        </div>
        <span>{sourceLabel} context</span>
      </div>
      <div className="report-reader-cockpit__grid">
        <button
          type="button"
          className={currentView.key === 'full' ? 'active' : ''}
          onClick={() => onFocusView('full')}
          aria-pressed={currentView.key === 'full'}
        >
          <FileText size={17} />
          <span>Visible dossier</span>
          <strong>{visibleSections.length}/{sections.length}</strong>
          <small>{currentView.helper}</small>
        </button>
        <button
          type="button"
          className={currentView.key === 'evidence' ? 'active' : ''}
          onClick={() => onFocusView('evidence')}
          aria-pressed={currentView.key === 'evidence'}
        >
          <Sparkles size={17} />
          <span>Evidence map</span>
          <strong>{evidenceCount}</strong>
          <small>{visibleEvidencePoints} visible signals</small>
        </button>
        <button
          type="button"
          className={currentView.key === 'risks' ? 'active' : ''}
          onClick={() => onFocusView('risks')}
          aria-pressed={currentView.key === 'risks'}
        >
          <ShieldCheck size={17} />
          <span>Risk review</span>
          <strong>{riskCount}</strong>
          <small>{legitimacy || 'No legitimacy tier extracted'}</small>
        </button>
        <button
          type="button"
          onClick={() => activeSection?.id && onFocusSection(activeSection.id)}
          disabled={!activeSection?.id}
        >
          <ListChecks size={17} />
          <span>Reading now</span>
          <strong>{activeSection?.label || 'Overview'}</strong>
          <small>Jump to active section</small>
        </button>
      </div>
    </section>
  );
}

function ReportActionWorkspace({
  actions,
  selectedAction,
  copiedActionId,
  copyFailedActionId,
  meta,
  sections,
  trackerTarget,
  onSelectAction,
  onCopy,
  onFocusView,
  onFocusSection,
}: {
  actions: ReportAction[];
  selectedAction: ReportAction;
  copiedActionId: string;
  copyFailedActionId: string;
  meta: ReportMeta;
  sections: ReportSection[];
  trackerTarget: string;
  onSelectAction: (action: ReportAction) => void;
  onCopy: (action: ReportAction) => void;
  onFocusView: (view: ReportViewKey) => void;
  onFocusSection: (id: string) => void;
}) {
  const contract = workflowContractFor(selectedAction.command);
  const selectedView = viewForAction(selectedAction);
  const copied = copiedActionId === selectedAction.id;
  const copyFailed = copyFailedActionId === selectedAction.id;
  const groundingSections = [
    firstSectionByCategory(sections, 'Decision'),
    firstSectionByCategory(sections, 'Evidence'),
    firstSectionByCategory(sections, 'Risk'),
    firstSectionByCategory(sections, 'Action'),
  ].filter(Boolean) as ReportSection[];
  const previewLines = [
    selectedAction.brief.split('\n').find((line) => line.startsWith('Next action:')) || selectedAction.label,
    selectedAction.brief.split('\n').find((line) => line.startsWith('Command mode:')) || selectedAction.command,
    meta.company ? `Company: ${meta.company}` : '',
    meta.role ? `Role: ${meta.role}` : '',
    meta.score ? `Score: ${meta.score}` : '',
    meta.legitimacy ? `Legitimacy: ${meta.legitimacy}` : '',
  ].filter(Boolean);

  return (
    <section className={`report-action-workspace action-${selectedAction.tone}`} aria-label="Report action workspace">
      <div className="report-action-workspace__header">
        <div>
          <p className="eyebrow">Action workspace</p>
          <h2>{selectedAction.label}</h2>
          <p>{selectedAction.helper}</p>
        </div>
        <div className="report-action-workspace__command">
          <Wand2 size={16} />
          <code>{selectedAction.command}</code>
        </div>
      </div>

      <PrimaryActionBar
        ariaLabel="Report action primary actions"
        className="report-action-primary-actions"
        title={selectedAction.label}
        description={selectedAction.helper}
        meta={[
          meta.company || 'Company unknown',
          meta.role || 'Role unknown',
          meta.score ? `Score ${meta.score}` : 'Score N/A',
          meta.legitimacy || 'Legitimacy unknown',
        ]}
        actions={(
          <>
          <button className="button-primary" type="button" onClick={() => onCopy(selectedAction)}>
            {copied ? <Check size={16} /> : <Clipboard size={16} />}
            {copyFailed ? 'Copy failed' : copied ? 'Brief copied' : 'Copy brief'}
          </button>
          <button className="button-secondary" type="button" onClick={() => onFocusView(selectedView)}>
            <Eye size={16} />
            Focus view
          </button>
          <Link to={trackerTarget} className="button-secondary"><BriefcaseBusiness size={16} /> Tracker</Link>
          {meta.url && <a className="button-secondary" href={meta.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Job post</a>}
          </>
        )}
      />

      <div className="report-action-workspace__body">
        <div className="report-action-picker" aria-label="Recommended dossier actions">
          {actions.map((action, index) => {
            const selected = action.id === selectedAction.id;
            return (
              <button
                key={action.id}
                type="button"
                className={`action-${action.tone} ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelectAction(action)}
                aria-pressed={selected}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{action.label}</strong>
                <small>{action.command}</small>
              </button>
            );
          })}
        </div>

        <div className="report-action-workspace__main">
          <div className="report-action-contract" aria-label="Selected action workflow contract">
            <button type="button" onClick={() => onFocusView(selectedView)}>
              <Eye size={15} />
              <span>View</span>
              <strong>{selectedView === 'actions' ? 'Action sections' : selectedView === 'risks' ? 'Risk review' : selectedView === 'evidence' ? 'Evidence map' : 'Decision brief'}</strong>
            </button>
            <div>
              <Database size={15} />
              <span>Reads</span>
              <strong>{contract.reads}</strong>
            </div>
            <div>
              <FileCheck2 size={15} />
              <span>Produces</span>
              <strong>{contract.produces}</strong>
            </div>
            <div>
              <ShieldCheck size={15} />
              <span>Guardrail</span>
              <strong>{contract.guardrail}</strong>
            </div>
          </div>

          <div className="report-action-preview">
            <div className="report-action-preview__header">
              <div>
                <p className="eyebrow">Brief preview</p>
                <h3>{meta.company || 'Selected dossier'}</h3>
              </div>
            </div>
            <code>{previewLines.join('\n')}</code>
          </div>

          <div className="report-grounding-grid" aria-label="Dossier grounding sections">
            {groundingSections.map((section) => (
              <button key={section.id} type="button" onClick={() => onFocusSection(section.id)}>
                <span>{sectionCategory(section)}</span>
                <strong>{section.label}</strong>
                <small>{section.preview}</small>
              </button>
            ))}
          </div>

          <div className="report-action-links" aria-label="Action workspace links">
            <Link to={trackerTarget} className="button-secondary"><BriefcaseBusiness size={16} /> Tracker record</Link>
            {meta.url && <a className="button-secondary" href={meta.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Job post</a>}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReportWorkspaceBar({
  currentView,
  selectedAction,
  activeSection,
  sectionQuery,
  copiedState,
  onCopyLink,
  onReset,
}: {
  currentView: typeof reportViews[number];
  selectedAction?: ReportAction;
  activeSection?: TocItem;
  sectionQuery: string;
  copiedState: '' | 'copied' | 'failed';
  onCopyLink: () => void;
  onReset: () => void;
}) {
  return (
    <section className="report-workspace-bar" aria-label="Report workspace state">
      <div className="report-workspace-bar__summary">
        <div>
          <span>Workspace state</span>
          <strong>{currentView.label}</strong>
        </div>
        <div>
          <span>Workflow</span>
          <strong>{selectedAction?.label || 'Review dossier'}</strong>
        </div>
        <div>
          <span>Section</span>
          <strong>{activeSection?.label || 'Overview'}</strong>
        </div>
        <div>
          <span>Search</span>
          <strong>{sectionQuery.trim() || 'None'}</strong>
        </div>
      </div>
      <div className="report-workspace-bar__actions">
        <button className="button-secondary" type="button" onClick={onReset}>
          <X size={15} />
          Reset view
        </button>
        <button className="button-primary" type="button" onClick={onCopyLink}>
          {copiedState === 'copied' ? <Check size={15} /> : <Clipboard size={15} />}
          {copiedState === 'failed' ? 'Copy failed' : copiedState === 'copied' ? 'Link copied' : 'Copy link'}
        </button>
      </div>
    </section>
  );
}

const buildReportAction = (meta: ReportMeta, action: Omit<ReportAction, 'brief'>): ReportAction => ({
  ...action,
  brief: [
    'Operate this Career-Ops evaluation dossier.',
    '',
    `Next action: ${action.label}`,
    `Command mode: ${action.command}`,
    `Company: ${meta.company || 'Unknown company'}`,
    `Role: ${meta.role || 'Unknown role'}`,
    meta.date ? `Date: ${meta.date}` : '',
    meta.score ? `Score: ${meta.score}` : '',
    meta.legitimacy ? `Legitimacy: ${meta.legitimacy}` : '',
    meta.archetype ? `Archetype: ${meta.archetype}` : '',
    meta.recommendation ? `Recommendation: ${meta.recommendation}` : '',
    meta.url ? `Job URL: ${meta.url}` : '',
    '',
    `${action.helper} Do not submit, send, or apply without user review.`,
  ].filter(Boolean).join('\n'),
});

const buildReportActions = (meta: ReportMeta): ReportAction[] => {
  const score = Number.parseFloat(meta.score);
  const actions: ReportAction[] = [];

  if (Number.isFinite(score) && score >= 4.5) {
    actions.push(buildReportAction(meta, {
      id: 'pursuit-package',
      label: 'Build pursuit package',
      command: '/career-ops apply',
      tone: 'elite',
      helper: 'Use this dossier to prepare the application, outreach, interview prep, and proof-point narrative for user review.',
    }));
  } else if (Number.isFinite(score) && score >= 4) {
    actions.push(buildReportAction(meta, {
      id: 'verify-apply',
      label: 'Verify and apply',
      command: '/career-ops apply',
      tone: 'strong',
      helper: 'Verify the posting is live, review the fit evidence, and prepare application materials for approval.',
    }));
  }

  if (Number.isFinite(score) && score < 4) {
    actions.push(buildReportAction(meta, {
      id: 'discard-review',
      label: 'Validate discard decision',
      command: '/career-ops patterns',
      tone: 'risk',
      helper: 'Review risks, legitimacy, and fit blockers before marking this role as skip or discard.',
    }));
  }

  actions.push(buildReportAction(meta, {
    id: 'interview-prep',
    label: 'Prepare interview brief',
    command: '/career-ops interview-prep',
    tone: 'strong',
    helper: 'Convert the evaluation into company-specific interview questions, proof stories, and role risks.',
  }));

  actions.push(buildReportAction(meta, {
    id: 'company-research',
    label: 'Research company context',
    command: '/career-ops deep',
    tone: 'neutral',
    helper: 'Expand the dossier with market context, leadership signals, product bets, and risk checks.',
  }));

  actions.push(buildReportAction(meta, {
    id: 'followup',
    label: 'Draft follow-up',
    command: '/career-ops followup',
    tone: 'neutral',
    helper: 'Draft a concise follow-up when this opportunity is already in motion.',
  }));

  if (actions.length === 3 && !Number.isFinite(score)) {
    actions.unshift(buildReportAction(meta, {
      id: 'fit-review',
      label: 'Review fit decision',
      command: '/career-ops oferta',
      tone: 'neutral',
      helper: 'Use the recommendation and report sections to decide whether this opportunity should move forward.',
    }));
  }

  return actions.slice(0, 4);
};

function MetadataItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  if (!value) return null;

  return (
    <div className="report-meta-item">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function MarkdownBlocks({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'table') {
          return (
            <div className="report-table-wrap" key={`table-${index}`}>
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${row.join('-')}-${rowIndex}`}>
                      {block.headers.map((header, cellIndex) => (
                        <td data-label={header} key={`${header}-${cellIndex}`}>{row[cellIndex] || ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <ReactMarkdown
            key={`markdown-${index}`}
            components={{
              h2: ({ children }) => {
                const label = String(children);
                return <h2 id={slugify(label)}>{children}</h2>;
              },
              h3: ({ children }) => {
                const label = String(children);
                return <h3 id={slugify(label)}>{children}</h3>;
              },
              a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
            }}
          >
            {block.content}
          </ReactMarkdown>
        );
      })}
    </>
  );
}

function ReportSectionCards({ sections }: { sections: ReportSection[] }) {
  if (!sections.length) return null;

  return (
    <>
      {sections.map((section, index) => {
        const category = sectionCategory(section);
        return (
          <section className="report-section-card" id={section.id} key={`${section.id}-${index}`}>
            <div className="report-section-card__header">
              <div>
                <p className="eyebrow">Section {String(index + 1).padStart(2, '0')}</p>
                <h2>{section.label}</h2>
              </div>
              <div className="report-section-card__badges">
                <span className={`section-category section-category--${category.toLowerCase()}`}>{category}</span>
                <span>{section.tableCount ? `${section.tableCount} table rows` : `${section.evidenceCount} evidence points`}</span>
              </div>
            </div>
            <div className="report-section-card__body">
              <MarkdownBlocks markdown={section.markdown} />
            </div>
          </section>
        );
      })}
    </>
  );
}

function ReportViewer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [content, setContent] = useState('');
  const [reportView, setReportView] = useState<ReportViewKey>(() => reportViewFromParams(searchParams));
  const [sectionQuery, setSectionQuery] = useState(() => searchParams.get('reportQ') || '');
  const [selectedActionId, setSelectedActionId] = useState(() => searchParams.get('action') || '');
  const [copiedActionId, setCopiedActionId] = useState('');
  const [copyFailedActionId, setCopyFailedActionId] = useState('');
  const [copiedWorkspaceLink, setCopiedWorkspaceLink] = useState<'' | 'copied' | 'failed'>('');
  const [activeSectionId, setActiveSectionId] = useState(() => searchParams.get('section') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const initialActionFocusKey = useRef('');

  useEffect(() => {
    const fetchReport = async () => {
      const API_BASE = '';
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/api/reports/${id}`);
        if (!response.ok) throw new Error('Failed to load report');
        setContent(await response.text());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [id]);

  const parsed = useMemo(() => parseReport(content), [content]);
  const meta = content ? parsed.meta : emptyMeta;
  const reportSections = useMemo(() => splitReportSections(parsed.body), [parsed.body]);
  const normalizedSectionQuery = sectionQuery.trim().toLowerCase();
  const visibleSections = useMemo(() => (
    reportSections.filter((section) => sectionMatchesView(section, reportView) && sectionMatchesQuery(section, normalizedSectionQuery))
  ), [normalizedSectionQuery, reportSections, reportView]);
  const visibleSectionIds = useMemo(() => new Set(visibleSections.map((section) => section.id)), [visibleSections]);
  const visibleToc = useMemo(() => {
    const primary = parsed.toc.filter((item) => visibleSectionIds.has(item.id));
    return primary.length ? primary : visibleSections.map((section) => ({ id: section.id, label: section.label, level: 2 }));
  }, [parsed.toc, visibleSectionIds, visibleSections]);
  const dossierDecision = meta.recommendation || reportSections[0]?.preview || 'Review required';
  const source = searchParams.get('from') || 'dashboard';
  const sourceApp = searchParams.get('app') || '';
  const sourceLane = searchParams.get('lane') || '';
  const sourceStage = searchParams.get('stage') || '';
  const sourceSort = searchParams.get('sort') || '';
  const sourceQuery = searchParams.get('q') || '';
  const sourceView = searchParams.get('view') || '';
  const dashboardParams = new URLSearchParams();
  if (sourceApp) dashboardParams.set('app', sourceApp);
  if (sourceStage) dashboardParams.set('stage', sourceStage);
  if (sourceSort) dashboardParams.set('sort', sourceSort);
  if (sourceQuery) dashboardParams.set('q', sourceQuery);
  if (sourceView) dashboardParams.set('view', sourceView);
  const dashboardTarget = dashboardParams.toString() ? `/?${dashboardParams.toString()}` : '/';
  const operationsParams = new URLSearchParams({
    ...(sourceLane ? { lane: sourceLane } : {}),
    ...(sourceApp ? { app: sourceApp } : {}),
  });
  const sourceTarget = source === 'applications'
    ? `/applications${sourceApp ? `?app=${encodeURIComponent(sourceApp)}` : ''}`
    : source === 'operations'
      ? `/operations${operationsParams.toString() ? `?${operationsParams.toString()}` : ''}`
      : dashboardTarget;
  const sourceLabel = source === 'applications' ? 'Applications' : source === 'operations' ? 'Operations' : 'Dashboard';
  const trackerTarget = sourceApp ? `/applications?app=${encodeURIComponent(sourceApp)}` : '/applications';
  const reportActions = useMemo(() => buildReportActions(meta), [meta]);
  const primaryReportAction = reportActions[0];
  const selectedReportAction = reportActions.find((action) => action.id === selectedActionId) || primaryReportAction;
  const reportActionPreview = reportActions[0] ? [
    `${meta.company || 'Unknown company'} - ${meta.role || 'Unknown role'}`,
    meta.score ? `Score: ${meta.score}` : '',
    meta.legitimacy ? `Legitimacy: ${meta.legitimacy}` : '',
    dossierDecision ? `Decision: ${dossierDecision}` : '',
  ].filter(Boolean) : [];
  const activeSection = visibleToc.find((item) => item.id === activeSectionId) || visibleToc[0];
  const currentReportView = reportViews.find((view) => view.key === reportView) || reportViews[0];
  const activeFilters = [
    reportView !== 'full' ? { key: 'view', label: `View: ${currentReportView.label}` } : null,
    sectionQuery.trim() ? { key: 'query', label: `Search: ${sectionQuery.trim()}` } : null,
  ].filter(Boolean) as { key: string; label: string }[];

  const writeReportRoute = ({
    view,
    section,
    action,
    query,
  }: {
    view?: ReportViewKey;
    section?: string;
    action?: string;
    query?: string;
  }) => {
    const params = new URLSearchParams(searchParams);
    const nextView = view ?? reportView;
    const nextSection = section ?? activeSectionId;
    const nextAction = action ?? selectedActionId;
    const nextQuery = query ?? sectionQuery;

    if (nextView !== 'full') params.set('reportView', nextView);
    else params.delete('reportView');

    if (nextSection) params.set('section', nextSection);
    else params.delete('section');

    if (nextAction) params.set('action', nextAction);
    else params.delete('action');

    if (nextQuery.trim()) params.set('reportQ', nextQuery.trim());
    else params.delete('reportQ');

    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectedActionId((current) => (
        current && reportActions.some((action) => action.id === current)
          ? current
          : reportActions[0]?.id || ''
      ));
    });
    return () => {
      cancelled = true;
    };
  }, [reportActions]);

  const applyReportView = (view: typeof reportViews[number]) => {
    setReportView(view.key);
    setSectionQuery('');
    setActiveSectionId('');
    writeReportRoute({ view: view.key, section: '', query: '' });
  };

  const focusReportView = (view: ReportViewKey) => {
    setReportView(view);
    setSectionQuery('');
    setActiveSectionId('');
    writeReportRoute({ view, section: '', query: '' });
    window.requestAnimationFrame(() => {
      const reader = document.querySelector('.report-layout');
      if (typeof reader?.scrollIntoView === 'function') {
        reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const selectReportAction = (action: ReportAction) => {
    setSelectedActionId(action.id);
    const nextView = viewForAction(action);
    setReportView(nextView);
    setSectionQuery('');
    setActiveSectionId('');
    writeReportRoute({ view: nextView, section: '', action: action.id, query: '' });
    window.requestAnimationFrame(() => {
      const reader = document.querySelector('.report-layout');
      if (typeof reader?.scrollIntoView === 'function') {
        reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const focusSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    writeReportRoute({ section: sectionId });
    window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      if (typeof section?.scrollIntoView === 'function') {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const clearFilter = (key: string) => {
    if (key === 'view') setReportView('full');
    if (key === 'query') setSectionQuery('');
    setActiveSectionId('');
    writeReportRoute({
      view: key === 'view' ? 'full' : reportView,
      section: '',
      query: key === 'query' ? '' : sectionQuery,
    });
  };

  const resetFilters = () => {
    setReportView('full');
    setSectionQuery('');
    setActiveSectionId('');
    writeReportRoute({ view: 'full', section: '', query: '' });
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setActiveSectionId((current) => {
        if (current && visibleToc.some((item) => item.id === current)) return current;
        return visibleToc[0]?.id || '';
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visibleToc]);

  useEffect(() => {
    if (!visibleToc.length) return undefined;
    if (!('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible?.target.id) setActiveSectionId(visible.target.id);
    }, { rootMargin: '-18% 0px -68% 0px', threshold: 0.01 });

    for (const item of visibleToc) {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [visibleToc, parsed.body, reportView, sectionQuery]);

  useEffect(() => {
    if (loading || error || !content) return;
    const shouldFocusActions = searchParams.get('reportView') === 'actions' || Boolean(searchParams.get('action'));
    const focusKey = `${id || ''}:${searchParams.toString()}`;
    if (!shouldFocusActions || initialActionFocusKey.current === focusKey) return;
    initialActionFocusKey.current = focusKey;
    window.requestAnimationFrame(() => {
      const workspace = document.querySelector('.report-action-workspace');
      if (typeof workspace?.scrollIntoView === 'function') {
        workspace.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    });
  }, [content, error, id, loading, searchParams]);

  const copyActionBrief = async (action: ReportAction) => {
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

  const handleSectionClick = (item: TocItem) => {
    setActiveSectionId(item.id);
    writeReportRoute({ section: item.id });
  };

  const updateSectionQuery = (query: string) => {
    setSectionQuery(query);
    setActiveSectionId('');
    writeReportRoute({ section: '', query });
  };

  if (loading) {
    return (
      <div className="report-page">
        <StateBlock
          icon={<FileText size={20} />}
          eyebrow="Loading"
          title="Loading evaluation dossier..."
          body="Fetching the markdown report, metadata, section index, and command playbook."
          compact
        />
        <div className="report-loading-skeleton">
          <StateSkeleton rows={8} label="Loading report sections" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-page">
        <StateBlock
          icon={<AlertTriangle size={20} />}
          eyebrow="Report unavailable"
          title="Could not load evaluation dossier"
          body={error}
          tone="risk"
          action={{ label: 'Back to dashboard', href: '/' }}
        />
      </div>
    );
  }

  return (
    <div className="report-page">
      <div className="report-topbar">
        <Link to={sourceTarget} className="back-link">
          <ArrowLeft size={16} />
          {sourceLabel}
        </Link>
        <div className="report-actions">
          <Link to={trackerTarget} className="button-secondary"><BriefcaseBusiness size={16} /> Tracker record</Link>
          {meta.url && <a className="button-secondary" href={meta.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Job post</a>}
        </div>
      </div>

      <header className="report-hero">
        <div className="report-hero__copy">
          <p className="eyebrow">Evaluation dossier</p>
          <h1>{meta.company || meta.title}</h1>
          {meta.role && <h2>{meta.role}</h2>}
          {dossierDecision && <p>{dossierDecision}</p>}
        </div>
        <div className={`report-score score-${scoreTone(meta.score)}`}>
          <span>Fit score</span>
          <strong>{meta.score || 'N/A'}</strong>
        </div>
      </header>

      <section className="report-meta-grid" aria-label="Report metadata">
        <MetadataItem icon={<BriefcaseBusiness size={18} />} label="Company" value={meta.company} />
        <MetadataItem icon={<CalendarDays size={18} />} label="Date" value={meta.date} />
        <MetadataItem icon={<ShieldCheck size={18} />} label="Legitimacy" value={meta.legitimacy} />
        <MetadataItem icon={<Sparkles size={18} />} label="Archetype" value={meta.archetype} />
        <MetadataItem icon={<Gauge size={18} />} label="Score" value={meta.score} />
        <MetadataItem icon={<MapPin size={18} />} label="Source" value={meta.url ? 'Job URL captured' : 'No URL in header'} />
      </section>

      <section className="report-decision-strip" aria-label="Dossier reading context">
        <div>
          <span>Decision</span>
          <strong>{dossierDecision}</strong>
        </div>
        <div>
          <span>Reading now</span>
          <strong>{activeSection?.label || 'Overview'}</strong>
        </div>
        <div>
          <span>Dossier depth</span>
          <strong>{visibleSections.length}/{reportSections.length} sections · {visibleToc.length} anchors</strong>
        </div>
      </section>

      <ReportWorkspaceBar
        currentView={currentReportView}
        selectedAction={selectedReportAction}
        activeSection={activeSection}
        sectionQuery={sectionQuery}
        copiedState={copiedWorkspaceLink}
        onCopyLink={copyWorkspaceLink}
        onReset={resetFilters}
      />

      <DecisionBrief
        meta={meta}
        sections={reportSections}
        primaryAction={primaryReportAction}
        dossierDecision={dossierDecision}
        onFocusView={focusReportView}
      />

      <ReaderCockpit
        sections={reportSections}
        visibleSections={visibleSections}
        activeSection={activeSection}
        currentView={currentReportView}
        sourceLabel={sourceLabel}
        legitimacy={meta.legitimacy}
        onFocusView={focusReportView}
        onFocusSection={focusSection}
      />

      {selectedReportAction && (
        <ReportActionWorkspace
          actions={reportActions}
          selectedAction={selectedReportAction}
          copiedActionId={copiedActionId}
          copyFailedActionId={copyFailedActionId}
          meta={meta}
          sections={reportSections}
          trackerTarget={trackerTarget}
          onSelectAction={selectReportAction}
          onCopy={copyActionBrief}
          onFocusView={focusReportView}
          onFocusSection={focusSection}
        />
      )}

      <section className="report-console-controls" aria-label="Report reading controls">
        <div className="report-view-strip" aria-label="Saved report views">
          {reportViews.map((view) => {
            const count = reportSections.filter((section) => sectionMatchesView(section, view.key)).length;
            return (
              <button
                key={view.key}
                className={reportView === view.key && !sectionQuery.trim() ? 'active' : ''}
                type="button"
                onClick={() => applyReportView(view)}
                aria-pressed={reportView === view.key && !sectionQuery.trim()}
              >
                <SlidersHorizontal size={15} />
                <span>
                  <strong>{view.label}</strong>
                  <small>{view.helper} · {count}</small>
                </span>
              </button>
            );
          })}
        </div>

        <div className="report-filter-row">
          <label className="report-search">
            <Search size={16} />
            <input value={sectionQuery} onChange={(event) => updateSectionQuery(event.target.value)} placeholder="Search dossier sections..." />
          </label>
          <div className="report-filter-summary">
            <div>
              <strong>{visibleSections.length}</strong>
              <span>{visibleSections.length === 1 ? 'section' : 'sections'} shown</span>
            </div>
            <div className="report-filter-chips" aria-label="Active report filters">
              {activeFilters.length ? activeFilters.map((filter) => (
                <button key={filter.key} type="button" onClick={() => clearFilter(filter.key)}>
                  {filter.label}
                  <X size={13} />
                </button>
              )) : <span>Full dossier view</span>}
            </div>
            {activeFilters.length > 0 && (
              <button className="report-clear-filters" type="button" onClick={resetFilters}>Clear all</button>
            )}
          </div>
        </div>
      </section>

      <main className="report-layout">
        <aside className="report-toc">
          <div>
            <p className="eyebrow">Navigate</p>
            <h3>Sections</h3>
          </div>
          {activeSection && (
            <div className="report-active-section">
              <span>Reading now</span>
              <strong>{activeSection.label}</strong>
            </div>
          )}
          <div className="report-progress-card">
            <ListChecks size={16} />
            <span>{visibleSections.length} visible sections</span>
          </div>
          <nav>
            {visibleToc.slice(0, 14).map((item) => (
              <a
                key={`${item.id}-${item.label}`}
                className={`toc-level-${item.level} ${activeSection?.id === item.id ? 'active' : ''}`}
                href={`#${item.id}`}
                onClick={() => handleSectionClick(item)}
                aria-current={activeSection?.id === item.id ? 'location' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="report-reader">
          {visibleSections.length ? (
            <ReportSectionCards sections={visibleSections} />
          ) : (
            <StateBlock
              icon={<Search size={20} />}
              eyebrow="No report sections match"
              title="No dossier sections match this view"
              body="Clear the section search or return to the full dossier to inspect every report block."
              action={{ label: 'Reset report filters', onClick: resetFilters }}
              compact
            />
          )}
        </article>

        <aside className="report-action-rail">
          <CommandPlaybook
            title="Recommended command"
            actions={reportActions}
            copiedActionId={copiedActionId}
            copyFailedActionId={copyFailedActionId}
            onCopy={copyActionBrief}
            previewLines={reportActionPreview}
            secondaryLabel="Dossier actions"
            variant="rail"
          />
          <section className="report-context-card" aria-label="Dossier context">
            <div>
              <p className="eyebrow">Dossier state</p>
              <h3>{currentReportView.label}</h3>
            </div>
            <dl>
              <div>
                <dt>Visible</dt>
                <dd>{visibleSections.length}/{reportSections.length} sections</dd>
              </div>
              <div>
                <dt>Active</dt>
                <dd>{activeSection?.label || 'Overview'}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{sourceLabel}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default ReportViewer;
