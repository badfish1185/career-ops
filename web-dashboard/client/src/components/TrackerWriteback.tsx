import { RotateCcw, Save, ShieldCheck } from 'lucide-react';
import '../styles/TrackerWriteback.css';

interface StatusOption {
  key: string;
  label: string;
}

interface TrackerWritebackProps {
  title?: string;
  eyebrow?: string;
  recordLabel: string;
  rowLabel?: string;
  statusOptions: StatusOption[];
  currentStatusKey: string;
  currentStatusLabel: string;
  statusDraft: string;
  originalNotes: string;
  notesDraft: string;
  saving: boolean;
  saveMessage?: string;
  onStatusChange: (status: string) => void;
  onNotesChange: (notes: string) => void;
  onSave: () => void;
  onReset: () => void;
}

const MAX_NOTES_LENGTH = 1200;

const statusLabelFor = (options: StatusOption[], key: string, fallback = 'Unknown') => (
  options.find((option) => option.key === key)?.label || fallback
);

const previewText = (value: string) => value.trim() || 'Empty';

export default function TrackerWriteback({
  title = 'Status and notes',
  eyebrow = 'Tracker writeback',
  recordLabel,
  rowLabel = 'data/applications.md',
  statusOptions,
  currentStatusKey,
  currentStatusLabel,
  statusDraft,
  originalNotes,
  notesDraft,
  saving,
  saveMessage = '',
  onStatusChange,
  onNotesChange,
  onSave,
  onReset,
}: TrackerWritebackProps) {
  const draftStatusLabel = statusLabelFor(statusOptions, statusDraft, statusDraft || 'Unknown');
  const statusChanged = statusDraft !== currentStatusKey;
  const notesChanged = notesDraft !== originalNotes;
  const dirty = statusChanged || notesChanged;
  const statusValid = statusOptions.some((option) => option.key === statusDraft);
  const notesValid = notesDraft.length <= MAX_NOTES_LENGTH;
  const ready = dirty && statusValid && notesValid && !saving;
  const saveTone = saveMessage.includes('Saved') ? 'save-ok' : 'save-error';
  const normalized = notesDraft.includes('|') || /\r?\n/.test(notesDraft);
  const noteBudget = MAX_NOTES_LENGTH - notesDraft.length;

  return (
    <section className="tracker-writeback" aria-label="Tracker writeback panel">
      <div className="tracker-writeback__header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h4>{title}</h4>
          <span>{recordLabel}</span>
        </div>
        {saveMessage && <strong className={saveTone}>{saveMessage}</strong>}
      </div>

      <div className="tracker-writeback__guardrails" aria-label="Writeback guardrails">
        <div className={statusValid ? 'is-valid' : 'is-risk'}>
          <ShieldCheck size={15} />
          <span>Canonical status</span>
        </div>
        <div className={notesValid ? 'is-valid' : 'is-risk'}>
          <ShieldCheck size={15} />
          <span>{notesValid ? `${noteBudget} chars left` : 'Notes too long'}</span>
        </div>
        <div className={dirty ? 'is-valid' : ''}>
          <ShieldCheck size={15} />
          <span>{dirty ? 'One row staged' : 'No changes staged'}</span>
        </div>
      </div>

      <div className="tracker-writeback__fields">
        <label>
          <span>Status</span>
          <select value={statusDraft} onChange={(event) => onStatusChange(event.target.value)}>
            {statusOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>Tracker notes</span>
          <textarea
            value={notesDraft}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={6}
            maxLength={MAX_NOTES_LENGTH}
          />
        </label>
      </div>

      <section className="tracker-writeback__diff" aria-label="Writeback preview">
        <div className="tracker-writeback__diff-header">
          <div>
            <p className="eyebrow">Writeback preview</p>
            <h5>{rowLabel}</h5>
          </div>
          <span>{dirty ? 'Ready for review' : 'Unchanged'}</span>
        </div>
        <div className="tracker-writeback__diff-grid">
          <div>
            <span>Before</span>
            <strong>{currentStatusLabel}</strong>
            <p>{previewText(originalNotes)}</p>
          </div>
          <div className={dirty ? 'is-after' : ''}>
            <span>After</span>
            <strong>{draftStatusLabel}</strong>
            <p>{previewText(notesDraft)}</p>
          </div>
        </div>
        {normalized && (
          <p className="tracker-writeback__normalization">
            Line breaks and table pipes will be flattened before writing the markdown row.
          </p>
        )}
      </section>

      <div className="tracker-writeback__actions">
        <button className="button-secondary" type="button" onClick={onReset} disabled={!dirty || saving}>
          <RotateCcw size={16} />
          Revert draft
        </button>
        <button className="button-primary" type="button" onClick={onSave} disabled={!ready}>
          <Save size={16} />
          {saving ? 'Saving...' : dirty ? 'Save reviewed diff' : 'No changes'}
        </button>
      </div>
    </section>
  );
}
