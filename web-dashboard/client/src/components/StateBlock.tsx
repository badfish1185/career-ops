import type { ReactNode } from 'react';
import '../styles/StateBlock.css';

interface StateBlockAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface StateBlockProps {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  body: string;
  tone?: 'neutral' | 'risk' | 'success';
  compact?: boolean;
  action?: StateBlockAction;
}

export function StateBlock({
  icon,
  eyebrow = 'Status',
  title,
  body,
  tone = 'neutral',
  compact = false,
  action,
}: StateBlockProps) {
  return (
    <div className={`state-block state-block--${tone} ${compact ? 'state-block--compact' : ''}`}>
      {icon && <div className="state-block__icon">{icon}</div>}
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p>{body}</p>
        {action && (
          action.href ? (
            <a className="button-secondary" href={action.href}>{action.label}</a>
          ) : (
            <button className="button-secondary" type="button" onClick={action.onClick}>{action.label}</button>
          )
        )}
      </div>
    </div>
  );
}

export function StateSkeleton({ rows = 5, label = 'Loading workspace' }: { rows?: number; label?: string }) {
  return (
    <div className="state-skeleton" aria-label={label}>
      <div className="state-skeleton__top" />
      {Array.from({ length: rows }).map((_, index) => (
        <div className="state-skeleton__row" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
