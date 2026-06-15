import {
  ArchiveX,
  Ban,
  Check,
  Loader2,
  MessageSquareText,
  NotebookPen,
  Send,
} from 'lucide-react';
import type { ComponentType } from 'react';
import '../styles/DispositionDock.css';

type DispositionTone = 'go' | 'watch' | 'stop' | 'archive';

interface DispositionOption {
  key: string;
  label: string;
  helper: string;
  tone: DispositionTone;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}

interface DispositionDockProps {
  ariaLabel?: string;
  title?: string;
  description?: string;
  currentStatusKey: string;
  saving?: boolean;
  saveMessage?: string;
  onDispatch: (statusKey: string) => void | Promise<void>;
  onOpenWriteback?: () => void;
}

const dispositionOptions: DispositionOption[] = [
  {
    key: 'skip',
    label: 'Skip',
    helper: 'Do not pursue this role',
    tone: 'stop',
    icon: Ban,
  },
  {
    key: 'discarded',
    label: 'Discard',
    helper: 'Closed, stale, or not worth time',
    tone: 'archive',
    icon: ArchiveX,
  },
  {
    key: 'applied',
    label: 'Applied',
    helper: 'Application has been sent',
    tone: 'go',
    icon: Send,
  },
  {
    key: 'interview',
    label: 'Interview',
    helper: 'Process is now active',
    tone: 'watch',
    icon: MessageSquareText,
  },
];

function DispositionDock({
  ariaLabel = 'Fast disposition controls',
  title = 'Disposition dock',
  description = 'Dispatch the selected tracker record without opening the full writeback form.',
  currentStatusKey,
  saving = false,
  saveMessage = '',
  onDispatch,
  onOpenWriteback,
}: DispositionDockProps) {
  return (
    <section className="disposition-dock" aria-label={ariaLabel}>
      <div className="disposition-dock__header">
        <div>
          <span>Fast disposition</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {onOpenWriteback && (
          <button className="disposition-dock__review" type="button" onClick={onOpenWriteback}>
            <NotebookPen size={15} aria-hidden />
            Review notes
          </button>
        )}
      </div>

      <div className="disposition-dock__grid" aria-label="Disposition actions">
        {dispositionOptions.map((option) => {
          const Icon = option.icon;
          const isCurrent = currentStatusKey === option.key;
          return (
            <button
              key={option.key}
              className={`disposition-dock__action tone-${option.tone} ${isCurrent ? 'is-current' : ''}`}
              type="button"
              onClick={() => onDispatch(option.key)}
              disabled={saving}
              aria-pressed={isCurrent}
            >
              <span className="disposition-dock__icon">
                {saving ? <Loader2 size={16} aria-hidden className="is-spinning" /> : <Icon size={16} aria-hidden />}
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.helper}</small>
              </span>
              {isCurrent && (
                <em>
                  <Check size={13} aria-hidden />
                  Current
                </em>
              )}
            </button>
          );
        })}
      </div>

      {saveMessage && (
        <p className="disposition-dock__message" role="status" aria-live="polite">
          {saveMessage}
        </p>
      )}
    </section>
  );
}

export default DispositionDock;
