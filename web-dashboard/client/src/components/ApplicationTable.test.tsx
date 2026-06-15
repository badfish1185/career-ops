import { render, screen } from '@testing-library/react';
import ApplicationTable from './ApplicationTable';
import { describe, it, expect } from 'vitest';

interface Application {
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

const mockApplications: Application[] = [
  {
    id: '1',
    date: '2023-10-01',
    company: 'Google',
    role: 'Software Engineer',
    score: '4.5/5',
    status: 'Applied',
    pdf: true,
    report: 'reports/001-google.md',
    notes: 'Exciting role'
  },
  {
    id: '2',
    date: '2023-10-02',
    company: 'Meta',
    role: 'Product Manager',
    score: '3.8/5',
    status: 'Interview',
    pdf: false,
    report: null,
    notes: 'Follow up'
  }
];

describe('ApplicationTable', () => {
  it('renders a table with application data', () => {
    render(<ApplicationTable applications={mockApplications} />);

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('Product Manager')).toBeInTheDocument();
    expect(screen.getByText('2023-10-01')).toBeInTheDocument();
    expect(screen.getByText('2023-10-02')).toBeInTheDocument();
    expect(screen.getByText('4.5/5')).toBeInTheDocument();
    expect(screen.getByText('3.8/5')).toBeInTheDocument();
  });

  it('renders StatusBadge for each application', () => {
    render(<ApplicationTable applications={mockApplications} />);

    expect(screen.getByText('Applied')).toHaveClass('status-badge');
    expect(screen.getByText('Interview')).toHaveClass('status-badge');
  });

  it('renders PDF icon when pdf is true', () => {
    const { container } = render(<ApplicationTable applications={mockApplications} />);

    // Check for lucide-react FileText icon (which we'll use for PDF)
    const pdfIcons = container.querySelectorAll('.lucide-file-text');
    expect(pdfIcons.length).toBe(1);
  });
});
