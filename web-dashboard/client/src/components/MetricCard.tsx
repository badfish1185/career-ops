import React from 'react';
import '../styles/MetricCard.css';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon }) => {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <div className="metric-value">{value}</div>
    </div>
  );
};

export default MetricCard;
