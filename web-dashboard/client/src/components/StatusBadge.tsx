import React from 'react';
import '../styles/StatusBadge.css';

interface StatusBadgeProps {
  status: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const normalizedStatus = status.toLowerCase();
  return (
    <span className={`status-badge status-${normalizedStatus}`}>
      {status}
    </span>
  );
};

export default StatusBadge;
