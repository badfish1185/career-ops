import { Check } from 'lucide-react';
import '../styles/StagePath.css';

export interface StagePathOption {
  key: string;
  label: string;
}

interface StagePathProps {
  stages: StagePathOption[];
  currentKey: string;
  draftKey: string;
  onChange: (key: string) => void;
  title?: string;
  helper?: string;
}

const pursuitOrder = ['evaluated', 'applied', 'responded', 'interview', 'offer'];
const closedStages = new Set(['skip', 'rejected', 'discarded']);

function StagePath({
  stages,
  currentKey,
  draftKey,
  onChange,
  title = 'Pipeline stage',
  helper = 'Click a stage to draft the next tracker status, then save changes.',
}: StagePathProps) {
  const activeKey = draftKey || currentKey;
  const activeIndex = pursuitOrder.indexOf(activeKey);

  return (
    <section className="stage-path" aria-label={title}>
      <div className="stage-path__header">
        <div>
          <p className="eyebrow">{title}</p>
          <h4>{stages.find((stage) => stage.key === activeKey)?.label || 'Choose status'}</h4>
        </div>
        {draftKey && draftKey !== currentKey && <span>Draft</span>}
      </div>
      <div className="stage-path__rail" role="list">
        {stages.map((stage) => {
          const stageIndex = pursuitOrder.indexOf(stage.key);
          const isClosed = closedStages.has(stage.key);
          const isCurrent = stage.key === currentKey;
          const isDraft = stage.key === draftKey;
          const isComplete = stageIndex >= 0 && activeIndex >= 0 && stageIndex < activeIndex;
          const className = [
            'stage-path__step',
            isComplete ? 'is-complete' : '',
            isCurrent ? 'is-current' : '',
            isDraft ? 'is-draft' : '',
            isClosed ? 'is-closed' : '',
          ].filter(Boolean).join(' ');

          return (
            <button className={className} key={stage.key} type="button" onClick={() => onChange(stage.key)} role="listitem">
              <span>{isComplete ? <Check size={13} /> : null}</span>
              <strong>{stage.label}</strong>
            </button>
          );
        })}
      </div>
      <p>{helper}</p>
    </section>
  );
}

export default StagePath;
