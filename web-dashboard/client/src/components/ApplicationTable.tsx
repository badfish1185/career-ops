import React from 'react';
import { FileText } from 'lucide-react';
import StatusBadge from './StatusBadge';
import '../styles/ApplicationTable.css';

export interface Application {
  id: string;
  date: string;
  company: string;
  role: string;
  score: string;
  status: string;
  pdf: boolean;
  report: string | null;
  notes: string;
}

interface ApplicationTableProps {
  applications: Application[];
}

const ApplicationTable: React.FC<ApplicationTableProps> = ({ applications }) => {
  return (
    <div className="application-table-container">
      <table className="application-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Company</th>
            <th>Role</th>
            <th>Score</th>
            <th>Status</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => (
            <tr key={app.id}>
              <td>{app.date}</td>
              <td className="company-cell">{app.company}</td>
              <td>{app.role}</td>
              <td>
                <span className="score-pill">{app.score}</span>
              </td>
              <td>
                <StatusBadge status={app.status} />
              </td>
              <td className="pdf-cell">
                {app.pdf && <FileText className="pdf-icon lucide-file-text" size={18} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ApplicationTable;
