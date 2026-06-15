import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Applications from './Applications';

const renderApplications = () => render(
  <MemoryRouter>
    <Applications />
  </MemoryRouter>,
);

describe('Applications Page', () => {
  const mockApplication = {
    id: '24',
    number: 24,
    date: '2026-05-02',
    company: 'CrowdStrike',
    role: 'Vice President, Enterprise AI Strategy',
    score: 4.8,
    scoreRaw: '4.8/5',
    status: 'Interview',
    statusKey: 'interview',
    statusLabel: 'Interview',
    pdf: true,
    report: 'reports/024-crowdstrike.md',
    reportFilename: '024-crowdstrike.md',
    jobUrl: 'https://example.com/crowdstrike',
    notes: 'Interview scheduled',
    summary: {
      filename: '024-crowdstrike.md',
      recommendation: 'Excellent strategic AI leadership fit.',
      archetype: 'AI Transformation',
      legitimacy: 'High Confidence',
      comp: '$300K+',
      redFlags: ['Hybrid schedule'],
      actionPlan: ['Prepare interview proof points'],
    },
    actions: [
      {
        id: 'prepare',
        label: 'Prepare interview brief',
        mode: 'interview-prep',
        command: '/career-ops interview-prep',
        helper: 'Build interview talking points.',
        suggestedStatus: 'Interview',
        tone: 'strong',
        brief: 'Prepare interview brief for CrowdStrike.',
      },
    ],
  };

  const evaluatedApplication = {
    id: '25',
    number: 25,
    date: '2026-05-03',
    company: 'AlphaWorks',
    role: 'AI Automation Lead',
    score: 4.2,
    scoreRaw: '4.2/5',
    status: 'Evaluated',
    statusKey: 'evaluated',
    statusLabel: 'Evaluated',
    pdf: false,
    report: 'reports/025-alpha.md',
    reportFilename: '025-alpha.md',
    jobUrl: 'https://example.com/alpha',
    notes: 'Needs decision',
    summary: {
      filename: '025-alpha.md',
      recommendation: 'Good automation fit.',
      archetype: 'Automation',
      legitimacy: 'Medium Confidence',
      redFlags: [],
      actionPlan: ['Verify posting'],
    },
    actions: [
      {
        id: 'apply',
        label: 'Verify and apply',
        mode: 'apply',
        command: '/career-ops apply',
        helper: 'Verify posting and prepare package.',
        suggestedStatus: 'Applied',
        tone: 'strong',
        brief: 'Verify and apply for AlphaWorks.',
      },
    ],
  };

  const mockPayload = {
    generatedAt: '2026-06-06T00:00:00.000Z',
    metrics: {
      total: 2,
      actionable: 2,
      topFits: 2,
      withPdf: 1,
      statusGroups: [
        { status: 'interview', label: 'Interview', count: 1 },
        { status: 'evaluated', label: 'Evaluated', count: 1 },
      ],
    },
    applications: [mockApplication, evaluatedApplication],
    topCandidates: [mockApplication, evaluatedApplication],
    nextActions: [mockApplication, evaluatedApplication],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/api/applications/24') && options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockPayload,
            applications: [{ ...mockApplication, status: 'Rejected', statusKey: 'rejected', statusLabel: 'Rejected', notes: 'Panel rejected after interview.' }, evaluatedApplication],
            topCandidates: [evaluatedApplication],
            nextActions: [evaluatedApplication],
          }),
        });
      }
      if (url.includes('/api/applications/25') && options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockPayload,
            applications: [mockApplication, { ...evaluatedApplication, status: 'Applied', statusKey: 'applied', statusLabel: 'Applied' }],
          }),
        });
      }
      if (url.includes('/api/dashboard')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPayload),
        });
      }
      return Promise.reject(new Error('Unknown API endpoint'));
    }));
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('renders the calmer command deck around the selected opportunity', async () => {
    renderApplications();

    const workspace = await screen.findByLabelText('Applications command workspace');
    const selected = within(workspace).getByLabelText('Selected opportunity preview');

    expect(screen.getByText('Decide the next move')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Application metrics')).getByRole('button', { name: /Interview/i })).toHaveTextContent('1');
    expect(within(selected).getByText('AlphaWorks')).toBeInTheDocument();
    expect(within(selected).getByText('Verify and apply')).toBeInTheDocument();
    fireEvent.click(within(selected).getByRole('button', { name: /Open workspace/i }));

    const dialog = await screen.findByRole('dialog', { name: /AlphaWorks disposition workspace/i });
    const dispositionWorkspace = within(dialog).getByLabelText('Selected opportunity disposition workspace');
    expect(within(dispositionWorkspace).getByText('Good automation fit.')).toBeInTheDocument();
    expect(within(dispositionWorkspace).getByLabelText('Fast disposition controls')).toBeInTheDocument();
    expect(within(dispositionWorkspace).getByLabelText('Selected opportunity sections')).toBeInTheDocument();
    expect(within(dispositionWorkspace).getByRole('link', { name: /Report/i })).toHaveAttribute(
      'href',
      '/report/025-alpha.md?from=applications&app=25&reportView=actions',
    );
    expect(within(dialog).getByRole('button', { name: /Next/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Close workspace/i })).toBeInTheDocument();
  });

  it('changes work modes and synchronizes the URL', async () => {
    renderApplications();

    const modeStrip = await screen.findByLabelText('Application work modes');
    fireEvent.click(within(modeStrip).getByRole('button', { name: /All/i }));

    await waitFor(() => {
      expect(window.location.search).toContain('view=all');
      expect(screen.getAllByText('AlphaWorks').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByPlaceholderText('Search company, role, notes'), {
      target: { value: 'alpha' },
    });

    await waitFor(() => {
      expect(window.location.search).toContain('q=alpha');
      expect(screen.getAllByText('AlphaWorks').length).toBeGreaterThan(0);
    });
  });

  it('restores a deep-linked application from the URL', async () => {
    window.history.replaceState(null, '', '/applications?app=25&view=all');

    renderApplications();

    await waitFor(() => {
      const selected = screen.getByLabelText('Selected opportunity preview');
      expect(selected).toHaveTextContent('AlphaWorks');
      expect(selected).toHaveTextContent('Verify and apply');
    });

    fireEvent.click(screen.getByRole('button', { name: /Open workspace/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Action brief')).toHaveTextContent('Report available');
    });
  });

  it('opens a full-screen disposition workspace from a queue row', async () => {
    renderApplications();

    const modeStrip = await screen.findByLabelText('Application work modes');
    fireEvent.click(within(modeStrip).getByRole('button', { name: /All/i }));
    const alphaRow = await screen.findByRole('button', { name: /AlphaWorks/i });
    fireEvent.click(alphaRow);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /AlphaWorks disposition workspace/i })).toBeInTheDocument();
      expect(screen.getByLabelText('Selected opportunity disposition workspace')).toHaveTextContent('AlphaWorks');
      expect(window.location.search).toContain('app=25');
    });
  });

  it('dispatches a fast disposition while preserving existing notes', async () => {
    renderApplications();

    fireEvent.click(await screen.findByRole('button', { name: /Open workspace/i }));
    const dock = await screen.findByLabelText('Fast disposition controls');
    fireEvent.click(within(dock).getByRole('button', { name: /Skip/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/applications/25',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'skip', notes: 'Needs decision' }),
        }),
      );
    });
  });

  it('previews tracker writeback diffs before saving a canonical row update', async () => {
    renderApplications();

    fireEvent.click(await screen.findByRole('button', { name: /Open workspace/i }));
    const tabs = await screen.findByLabelText('Selected opportunity sections');
    fireEvent.click(within(tabs).getByRole('button', { name: /Writeback/i }));

    const writeback = await screen.findByLabelText('Tracker writeback panel');
    const statusSelect = within(writeback).getByRole('combobox');
    fireEvent.change(statusSelect, { target: { value: 'rejected' } });
    fireEvent.change(within(writeback).getByRole('textbox'), { target: { value: 'Panel rejected after interview.' } });

    expect(within(writeback).getByText('Before')).toBeInTheDocument();
    expect(within(writeback).getByText('Needs decision')).toBeInTheDocument();
    expect(within(writeback).getByText('After')).toBeInTheDocument();
    expect(within(writeback).getAllByText('Rejected').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(statusSelect).toHaveValue('rejected');
    });

    fireEvent.click(within(writeback).getByRole('button', { name: /Save reviewed diff/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/applications/25',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'rejected', notes: 'Panel rejected after interview.' }),
        }),
      );
    });
  });
});
