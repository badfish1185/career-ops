import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

const renderDashboard = () => render(
  <MemoryRouter>
    <Dashboard />
  </MemoryRouter>,
);

describe('Dashboard Page', () => {
  const mockApplication = {
    id: '1',
    number: 1,
    date: '2026-06-06',
    company: 'TechCorp',
    role: 'Senior AI Engineer',
    score: 4.8,
    scoreRaw: '4.8/5',
    status: 'Interview',
    statusKey: 'interview',
    statusLabel: 'Interview',
    pdf: true,
    report: 'reports/001-techcorp.md',
    reportFilename: '001-techcorp.md',
    jobUrl: 'https://example.com/job',
    notes: 'First round done',
    summary: {
      filename: '001-techcorp.md',
      recommendation: 'Strong fit for applied AI leadership.',
      archetype: 'AI Platform',
      legitimacy: 'High Confidence',
      actionPlan: ['Tailor CV'],
      redFlags: ['Hybrid schedule'],
    },
  };

  const evaluatedApplication = {
    id: '2',
    number: 2,
    date: '2026-06-05',
    company: 'AlphaWorks',
    role: 'AI Automation Lead',
    score: 3.9,
    scoreRaw: '3.9/5',
    status: 'Evaluated',
    statusKey: 'evaluated',
    statusLabel: 'Evaluated',
    pdf: false,
    report: 'reports/002-alphaworks.md',
    reportFilename: '002-alphaworks.md',
    jobUrl: 'https://example.com/alpha',
    notes: 'Needs decision',
    summary: {
      filename: '002-alphaworks.md',
      recommendation: 'Solid fit but below top-fit threshold.',
      archetype: 'Automation',
      legitimacy: 'High Confidence',
      actionPlan: ['Review compensation'],
      redFlags: [],
    },
  };

  const skippedHighScoreApplication = {
    id: '3',
    number: 3,
    date: '2026-06-07',
    company: 'Zeta Closed',
    role: 'Chief AI Officer',
    score: 5,
    scoreRaw: '5.0/5',
    status: 'SKIP',
    statusKey: 'skip',
    statusLabel: 'SKIP',
    pdf: true,
    report: 'reports/003-zeta.md',
    reportFilename: '003-zeta.md',
    jobUrl: 'https://example.com/zeta',
    notes: 'Closed out despite strong fit.',
    summary: {
      filename: '003-zeta.md',
      recommendation: 'Closed outcome for pattern learning only.',
      archetype: 'AI Executive',
      legitimacy: 'High Confidence',
      actionPlan: [],
      redFlags: [],
    },
  };

  const mockPayload = {
    generatedAt: '2026-06-06T00:00:00.000Z',
    metrics: {
      total: 150,
      active: 45,
      actionable: 60,
      evaluated: 90,
      topFits: 12,
      avgScore: 3.82,
      topScore: 4.8,
      withPdf: 22,
      statusGroups: [
        { status: 'interview', label: 'Interview', count: 1 },
        { status: 'evaluated', label: 'Evaluated', count: 1 },
      ],
      funnel: [
        { status: 'evaluated', label: 'Evaluated', count: 90, pct: 60 },
        { status: 'applied', label: 'Applied', count: 45, pct: 30 },
        { status: 'interview', label: 'Interview', count: 1, pct: 0.7 },
      ],
      scoreBuckets: [
        { id: '4.5-5.0', label: '4.5-5.0', count: 12 },
        { id: '4.0-4.4', label: '4.0-4.4', count: 20 },
      ],
      weeklyActivity: [{ week: '2026-W23', count: 9 }],
      rates: { response: 20, interview: 10, offer: 0 },
    },
    applications: [skippedHighScoreApplication, mockApplication, evaluatedApplication],
    topCandidates: [mockApplication],
    nextActions: [mockApplication],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/api/applications/1') && options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockPayload,
            applications: [
              { ...mockApplication, status: 'SKIP', statusKey: 'skip', statusLabel: 'SKIP' },
              skippedHighScoreApplication,
              evaluatedApplication,
            ],
            topCandidates: [{ ...mockApplication, status: 'SKIP', statusKey: 'skip', statusLabel: 'SKIP' }],
            nextActions: [{ ...mockApplication, status: 'SKIP', statusKey: 'skip', statusLabel: 'SKIP' }],
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

  it('renders the command center header', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Today', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Focus the job search/i)).toBeInTheDocument();
  });

  it('fetches and displays command center metrics', async () => {
    renderDashboard();

    await waitFor(() => {
      const metrics = within(screen.getByLabelText('Pipeline metrics'));
      expect(metrics.getByText('Pipeline')).toBeInTheDocument();
      expect(metrics.getByText('150')).toBeInTheDocument();
      expect(metrics.getByText('Needs attention')).toBeInTheDocument();
      expect(metrics.getByText('60')).toBeInTheDocument();
      expect(metrics.getByText('High-fit')).toBeInTheDocument();
      expect(metrics.getByText('12')).toBeInTheDocument();
    });
  });

  it('fetches and displays application pipeline rows', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('TechCorp').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Senior AI Engineer').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Interview').length).toBeGreaterThan(0);
    });
  });

  it('opens row asset links without changing the selected application', async () => {
    renderDashboard();

    const applications = await screen.findByLabelText('Applications');
    const alphaReport = within(applications).getByRole('link', { name: /Open report for AlphaWorks/i });
    const alphaJobPost = within(applications).getByRole('link', { name: /Open job post for AlphaWorks/i });

    expect(alphaReport).toHaveAttribute(
      'href',
      expect.stringContaining('/report/002-alphaworks.md?from=dashboard&app=2'),
    );
    expect(alphaReport).toHaveAttribute('href', expect.stringContaining('reportView=actions'));
    expect(alphaJobPost).toHaveAttribute('href', 'https://example.com/alpha');

    fireEvent.click(alphaReport);

    await waitFor(() => {
      expect(screen.getByLabelText('Dashboard active opportunity')).toHaveTextContent('TechCorp');
      expect(screen.getByLabelText('Dashboard active opportunity')).not.toHaveTextContent('AlphaWorks');
    });
  });

  it('renders the active opportunity workspace with command, assets, and dossier links', async () => {
    renderDashboard();

    const workspace = await screen.findByLabelText('Dashboard active workspace');
    expect(within(workspace).getByText('Today focus')).toBeInTheDocument();
    expect(within(workspace).getAllByText('Prepare interview brief').length).toBeGreaterThan(0);
    expect(within(workspace).getAllByText('/career-ops interview-prep').length).toBeGreaterThan(0);
    expect(within(workspace).getByText('PDF ready')).toBeInTheDocument();
    const primaryActions = within(workspace).getByLabelText('Dashboard active workspace primary actions');
    expect(primaryActions).toHaveTextContent('Next best action');
    expect(primaryActions).toHaveTextContent('Prepare interview brief');
    expect(within(primaryActions).getByRole('button', { name: /Copy action brief/i })).toBeInTheDocument();
    expect(within(primaryActions).getByRole('link', { name: /Open report/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/report/001-techcorp.md?from=dashboard&app=1'),
    );
    expect(within(primaryActions).getByRole('link', { name: /Open report/i })).toHaveAttribute(
      'href',
      expect.stringContaining('reportView=actions'),
    );
    expect(within(workspace).getByRole('link', { name: /Open dossier/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/report/001-techcorp.md?from=dashboard&app=1'),
    );
    expect(within(workspace).getByRole('link', { name: /Tracker record/i })).toHaveAttribute('href', '/applications?app=1');
  });

  it('dispatches a fast skip disposition from the active workspace', async () => {
    renderDashboard();

    const workspace = await screen.findByLabelText('Dashboard active workspace');
    const dock = within(workspace).getByLabelText('Fast disposition controls');
    fireEvent.click(within(dock).getByRole('button', { name: /Skip/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/applications/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'skip', notes: 'First round done' }),
        }),
      );
    });
  });

  it('defaults the command center to the next actionable record instead of the highest scored closed record', async () => {
    renderDashboard();

    const activeOpportunity = await screen.findByLabelText('Dashboard active opportunity');

    await waitFor(() => {
      expect(activeOpportunity).toHaveTextContent('TechCorp');
      expect(activeOpportunity).toHaveTextContent('Interview');
      expect(activeOpportunity).not.toHaveTextContent('Zeta Closed');
      expect(screen.getByLabelText('Dashboard active workspace')).toHaveTextContent('Prepare interview brief');
    });
  });

  it('updates the active workspace when a saved queue is focused', async () => {
    renderDashboard();

    const cockpit = await screen.findByLabelText('Today command queue');
    const workspaceState = await screen.findByLabelText('Dashboard workspace state');
    fireEvent.click(within(cockpit).getByRole('button', { name: /Decisions/i }));

    const workspace = screen.getByLabelText('Dashboard active workspace');
    await waitFor(() => {
      expect(workspace).toHaveTextContent('AlphaWorks');
      expect(workspace).toHaveTextContent('Review discard rationale');
      expect(workspaceState).toHaveTextContent('Evaluation');
      expect(workspaceState).toHaveTextContent('AlphaWorks #2');
      expect(workspaceState).toHaveTextContent('Evaluated');
      expect(within(workspace).getByRole('link', { name: /Open dossier/i })).toHaveAttribute(
        'href',
        expect.stringContaining('stage=evaluated'),
      );
    });
  });

  it('moves mobile pipeline row selection to the active workspace actions', async () => {
    const scrollTargets: string[] = [];
    const scrollSpy = vi.fn(function trackScrollTarget(this: HTMLElement) {
      scrollTargets.push(this.className || this.getAttribute('aria-label') || this.tagName);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollSpy,
    });
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width: 1200px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    renderDashboard();

    const applications = await screen.findByLabelText('Applications');
    fireEvent.click(within(applications).getByRole('button', { name: /AlphaWorks/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Dashboard active opportunity')).toHaveTextContent('AlphaWorks');
      expect(screen.getByLabelText('Dashboard active workspace')).toHaveTextContent('Review discard rationale');
      expect(window.location.search).toContain('app=2');
      expect(scrollTargets).toContain('active-workspace-anchor');
    });
  });

  it('resets dashboard workspace state from the state bar', async () => {
    window.history.replaceState(null, '', '/?app=2&stage=evaluated&sort=company&q=alpha');

    renderDashboard();

    const workspaceState = await screen.findByLabelText('Dashboard workspace state');

    await waitFor(() => {
      expect(workspaceState).toHaveTextContent('Evaluated');
      expect(workspaceState).toHaveTextContent('AlphaWorks #2');
      expect(workspaceState).toHaveTextContent('Company / alpha');
    });

    fireEvent.click(within(workspaceState).getByRole('button', { name: /Reset focus/i }));

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(workspaceState).toHaveTextContent('Today');
      expect(workspaceState).toHaveTextContent('TechCorp #1');
      expect(workspaceState).toHaveTextContent('All');
      expect(workspaceState).toHaveTextContent('Score');
      expect(params.get('stage')).toBeNull();
      expect(params.get('sort')).toBeNull();
      expect(params.get('q')).toBeNull();
    });
  });

  it('renders a reviewed tracker writeback preview in the selected rail', async () => {
    renderDashboard();

    const panel = await screen.findByLabelText('Tracker writeback panel');

    expect(within(panel).getByText('Update record')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Writeback preview')).toHaveTextContent('Before');
    expect(within(panel).getByLabelText('Writeback preview')).toHaveTextContent('After');
    expect(within(panel).getByText('Canonical status')).toBeInTheDocument();
  });

  it('uses KPI clicks to focus the cockpit and URL context', async () => {
    renderDashboard();

    const metrics = await screen.findByLabelText('Pipeline metrics');
    fireEvent.click(within(metrics).getByRole('button', { name: /High-fit/i }));

    await waitFor(() => {
      expect(screen.getByText('Stage: Top 4+')).toBeInTheDocument();
      expect(screen.getByLabelText('Dashboard active opportunity')).toHaveTextContent('TechCorp');
      expect(window.location.search).toContain('stage=top');
      expect(window.location.search).toContain('app=1');
    });
  });

  it('uses today cockpit cards to focus the right work queue', async () => {
    renderDashboard();

    const cockpit = await screen.findByLabelText('Today command queue');
    expect(within(cockpit).getByText('Command queue')).toBeInTheDocument();

    fireEvent.click(within(cockpit).getByRole('button', { name: /Decisions/i }));

    await waitFor(() => {
      expect(screen.getByText('Stage: Evaluated')).toBeInTheDocument();
      expect(screen.getByLabelText('Dashboard active opportunity')).toHaveTextContent('AlphaWorks');
      expect(window.location.search).toContain('stage=evaluated');
      expect(window.location.search).toContain('app=2');
      expect(window.location.search).toContain('view=evaluation');
    });
  });

  it('keeps status tab clicks synchronized with the selected record and URL context', async () => {
    renderDashboard();

    const stages = await screen.findByLabelText('Pipeline stages');
    fireEvent.click(within(stages).getByRole('button', { name: /Evaluated/i }));

    await waitFor(() => {
      expect(screen.getByText('Stage: Evaluated')).toBeInTheDocument();
      expect(screen.getByLabelText('Dashboard active opportunity')).toHaveTextContent('AlphaWorks');
      expect(window.location.search).toContain('stage=evaluated');
      expect(window.location.search).toContain('app=2');
    });

    const activeOpportunity = screen.getByLabelText('Dashboard active opportunity');
    const reportLink = within(activeOpportunity).getByRole('link', { name: /Report/i });
    expect(reportLink).toHaveAttribute('href', expect.stringContaining('from=dashboard'));
    expect(reportLink).toHaveAttribute('href', expect.stringContaining('app=2'));
    expect(reportLink).toHaveAttribute('href', expect.stringContaining('reportView=actions'));
    expect(reportLink).toHaveAttribute('href', expect.stringContaining('stage=evaluated'));
  });

  it('keeps sort changes synchronized with the focused row and URL context', async () => {
    renderDashboard();

    await screen.findByLabelText('Pipeline stages');
    fireEvent.change(screen.getByDisplayValue('Score'), { target: { value: 'company' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Dashboard active opportunity')).toHaveTextContent('AlphaWorks');
      expect(window.location.search).toContain('sort=company');
      expect(window.location.search).toContain('app=2');
    });

    const activeOpportunity = screen.getByLabelText('Dashboard active opportunity');
    const reportLink = within(activeOpportunity).getByRole('link', { name: /Report/i });
    expect(reportLink).toHaveAttribute('href', expect.stringContaining('sort=company'));
  });
});
