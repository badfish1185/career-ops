import { useMemo, useState } from 'react';
import { Check, Clipboard, Database, Eye, FileCheck2, MessageSquareText, Save, ShieldCheck, Wand2 } from 'lucide-react';
import '../styles/CommandPlaybook.css';

export type CommandTone = 'elite' | 'strong' | 'risk' | 'neutral';

export interface CommandAction {
  id: string;
  label: string;
  command: string;
  helper: string;
  tone: CommandTone;
  brief: string;
  suggestedStatus?: string;
}

interface CommandPlaybookProps<TAction extends CommandAction> {
  title: string;
  actions: TAction[];
  copiedActionId: string;
  copyFailedActionId: string;
  onCopy: (action: TAction) => void;
  variant?: 'rail' | 'wide' | 'compact';
  previewLines?: string[];
  secondaryLabel?: string;
  primaryButtonLabel?: string;
  onStageStatus?: (action: TAction) => void;
}

interface WorkflowContract {
  input: string;
  output: string;
  guardrail: string;
}

const commandContracts: Record<string, WorkflowContract> = {
  apply: {
    input: 'CV, report, tracker notes, job post',
    output: 'Application package and reviewed answers',
    guardrail: 'Draft only; user submits',
  },
  pipeline: {
    input: 'data/pipeline.md and live posting',
    output: 'Evaluation report, PDF decision, tracker row',
    guardrail: 'Verify liveness first',
  },
  oferta: {
    input: 'Report, JD, profile, scoring rubric',
    output: 'Fit rationale and next decision',
    guardrail: 'Report is source of truth',
  },
  ofertas: {
    input: 'Multiple evaluated offers',
    output: 'Ranked comparison and tradeoffs',
    guardrail: 'Compare fit, not volume',
  },
  deep: {
    input: 'Company, role, report, public signals',
    output: 'Dossier, risks, interview angles',
    guardrail: 'Research only',
  },
  'interview-prep': {
    input: 'Report, CV, story bank, company context',
    output: 'Prep brief, proof stories, questions',
    guardrail: 'Ground claims in proof',
  },
  followup: {
    input: 'Tracker status, age, notes, report',
    output: 'Follow-up draft and cadence decision',
    guardrail: 'Draft only; user sends',
  },
  scan: {
    input: 'portals.yml and scan history',
    output: 'New qualified pipeline candidates',
    guardrail: 'Deduplicate and filter fit',
  },
  patterns: {
    input: 'Tracker outcomes and scores',
    output: 'Targeting rules and score gates',
    guardrail: 'Learn from outcomes',
  },
  tracker: {
    input: 'data/applications.md',
    output: 'Pipeline state and status view',
    guardrail: 'Canonical states only',
  },
  pdf: {
    input: 'cv.md, profile, report context',
    output: 'Tailored ATS-ready CV PDF',
    guardrail: 'No hardcoded proof points',
  },
  batch: {
    input: 'Batch input and worker prompts',
    output: 'Merged reports and tracker additions',
    guardrail: 'Run merge-tracker after',
  },
  contacto: {
    input: 'Company, role, network context',
    output: 'LinkedIn outreach draft',
    guardrail: 'No unsolicited send',
  },
  project: {
    input: 'Project idea and career targets',
    output: 'Portfolio value assessment',
    guardrail: 'Optimize for proof',
  },
  training: {
    input: 'Course/cert and target roles',
    output: 'ROI and positioning assessment',
    guardrail: 'Avoid credential theater',
  },
};

function commandMode(command: string) {
  return command.replace(/^\/career-ops\s*/, '').trim().split(/\s+/)[0] || 'tracker';
}

function workflowContractFor(command: string): WorkflowContract {
  const mode = commandMode(command);
  return commandContracts[mode] || {
    input: 'Career-Ops source files and selected record',
    output: 'Prepared decision support for review',
    guardrail: 'No submit/send without user review',
  };
}

function briefPreview(action: CommandAction, previewLines?: string[]) {
  if (previewLines?.length) return previewLines.filter(Boolean).join('\n');
  return action.brief;
}

function CommandPlaybook<TAction extends CommandAction>({
  title,
  actions,
  copiedActionId,
  copyFailedActionId,
  onCopy,
  variant = 'rail',
  previewLines,
  secondaryLabel,
  primaryButtonLabel = 'Copy command brief',
  onStageStatus,
}: CommandPlaybookProps<TAction>) {
  const [selectedActionId, setSelectedActionId] = useState(actions[0]?.id || '');

  const selectedAction = useMemo(() => (
    actions.find((action) => action.id === selectedActionId) || actions[0]
  ), [actions, selectedActionId]);
  const primary = actions[0];
  const secondary = actions.slice(1);
  if (!primary) return null;
  const selectedIsPrimary = selectedAction.id === primary.id;
  const selectedIndex = actions.findIndex((action) => action.id === selectedAction.id) + 1;
  const selectedCopied = copiedActionId === selectedAction.id;
  const selectedCopyFailed = copyFailedActionId === selectedAction.id;
  const selectedPreview = selectedIsPrimary ? briefPreview(selectedAction, previewLines) : briefPreview(selectedAction);
  const workflowContract = workflowContractFor(selectedAction.command);

  return (
    <section className={`command-playbook command-playbook--${variant} action-${selectedAction.tone}`}>
      <div className="command-playbook__copy">
        <div className="command-playbook__top">
          <div>
            <p className="eyebrow">{title}</p>
            <h4>{selectedAction.label}</h4>
          </div>
          <Wand2 size={17} />
        </div>
        <p>{selectedAction.helper}</p>
        <div className="command-playbook__state" aria-label="Selected command action">
          <span>Step {selectedIndex} of {actions.length}</span>
          <strong>{selectedAction.command}</strong>
        </div>
        <div className="command-playbook__contract" aria-label="Workflow contract">
          <div>
            <Database size={14} />
            <span>Reads</span>
            <strong>{workflowContract.input}</strong>
          </div>
          <div>
            <FileCheck2 size={14} />
            <span>Produces</span>
            <strong>{workflowContract.output}</strong>
          </div>
          <div>
            <ShieldCheck size={14} />
            <span>Guardrail</span>
            <strong>{workflowContract.guardrail}</strong>
          </div>
        </div>
      </div>
      <div className="command-playbook__preview">
        <div className="command-playbook__preview-header">
          <p className="eyebrow">{selectedAction.command}</p>
          <span>
            <Eye size={13} />
            Preview
          </span>
        </div>
        <code>{selectedPreview}</code>
      </div>
      <div className="command-playbook__actions">
        <div className="command-playbook__primary-actions">
          <button className="button-primary" type="button" onClick={() => onCopy(selectedAction)}>
            {selectedCopied ? <Check size={16} /> : <Clipboard size={16} />}
            {selectedCopyFailed ? 'Copy failed' : selectedCopied ? 'Copied' : primaryButtonLabel}
          </button>
          {onStageStatus && selectedAction.suggestedStatus && (
            <button className="button-secondary" type="button" onClick={() => onStageStatus(selectedAction)}>
              <Save size={16} />
              Stage {selectedAction.suggestedStatus}
            </button>
          )}
        </div>
        {secondary.length > 0 && (
          <div className="command-playbook__secondary">
            {secondaryLabel && <p className="eyebrow">{secondaryLabel}</p>}
            <button
              className={`command-playbook__item action-${primary.tone} ${selectedIsPrimary ? 'is-selected' : ''}`}
              type="button"
              onClick={() => setSelectedActionId(primary.id)}
              aria-pressed={selectedIsPrimary}
            >
              <MessageSquareText size={15} />
              <span>
                <strong>{primary.label}</strong>
                <small>{primary.command}</small>
              </span>
              {copiedActionId === primary.id ? <Check size={15} /> : <Eye size={15} />}
            </button>
            {secondary.map((action) => {
              const isSelected = selectedAction.id === action.id;
              return (
                <button
                  className={`command-playbook__item action-${action.tone} ${isSelected ? 'is-selected' : ''}`}
                  key={action.id}
                  type="button"
                  onClick={() => setSelectedActionId(action.id)}
                  aria-pressed={isSelected}
                >
                  <MessageSquareText size={15} />
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.command}</small>
                  </span>
                  {copiedActionId === action.id ? <Check size={15} /> : <Eye size={15} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default CommandPlaybook;
