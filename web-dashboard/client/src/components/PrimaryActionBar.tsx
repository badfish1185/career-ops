import type { ReactNode } from 'react';
import '../styles/PrimaryActionBar.css';

type PrimaryActionMetaItem = ReactNode | false | null | undefined;

interface PrimaryActionBarProps {
  ariaLabel: string;
  title: string;
  description: string;
  actions: ReactNode;
  eyebrow?: string;
  meta?: PrimaryActionMetaItem[];
  className?: string;
  actionsClassName?: string;
}

function PrimaryActionBar({
  ariaLabel,
  title,
  description,
  actions,
  eyebrow = 'Next best action',
  meta = [],
  className = '',
  actionsClassName = '',
}: PrimaryActionBarProps) {
  const metaItems = meta.filter(Boolean);

  return (
    <section className={`primary-action-bar ${className}`.trim()} aria-label={ariaLabel} aria-live="polite">
      <div className="primary-action-bar__body">
        <p className="eyebrow">{eyebrow}</p>
        <strong>{title}</strong>
        <span>{description}</span>
        {metaItems.length > 0 && (
          <div className="primary-action-bar__meta" aria-label={`${ariaLabel} context`}>
            {metaItems.map((item, index) => (
              <small key={typeof item === 'string' ? item : index}>{item}</small>
            ))}
          </div>
        )}
      </div>
      <div className={`primary-action-bar__actions ${actionsClassName}`.trim()}>
        {actions}
      </div>
    </section>
  );
}

export default PrimaryActionBar;
