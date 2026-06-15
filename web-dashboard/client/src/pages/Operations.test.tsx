import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Operations from './Operations';

const renderOperations = () => render(
  <MemoryRouter>
    <Operations />
  </MemoryRouter>,
);

describe('Operations Page', () => {
  const mockPayload = {
    generatedAt: '2026-06-06T00:00:00.000Z',
    files: {
      pipelineExists: true,
      followupsExists: true,
      scanHistoryExists: true,
    },
    pipeline: {
      total: 3,
      pending: 2,
      completed: 1,
      pdfReady: 1,
      next: [
        {
          completed: false,
          id: 'capital-one-intake',
          url: 'https://example.com/capital-one',
          company: 'Capital One',
          role: 'Senior Director, Product',
          score: '',
          pdf: false,
          raw: 'capital-one-intake',
          portal: 'workday-api',
          firstSeen: '2026-06-01',
          readiness: 'Ready',
        },
      ],
      recentCompleted: [
        {
          completed: true,
          id: '1',
          url: 'https://example.com/report-job',
          company: 'UltraViolet Cyber',
          role: 'Security Controls Assessor',
          score: '2.0/5',
          pdf: false,
          raw: 'ultraviolet-outcome',
          status: 'Processed',
          reportFilename: '001-ultraviolet.md',
        },
      ],
    },
    scan: {
      total: 2,
      added: 1,
      skippedExpired: 0,
      skippedTitle: 0,
      skippedDuplicate: 1,
      uncertain: 0,
      statusCounts: { added: 1, skipped_duplicate: 1 },
      recent: [
        {
          url: 'https://example.com/saviynt',
          firstSeen: '2026-06-06',
          portal: 'lever-api',
          title: 'Senior Director of Product Management',
          company: 'Saviynt',
          status: 'added',
          inPipeline: true,
          pipelineState: 'queued',
        },
        {
          url: 'https://example.com/capital-one-scan',
          firstSeen: '2026-06-05',
          portal: 'workday-api',
          title: 'Director, Product Management',
          company: 'Capital One',
          status: 'added',
          inPipeline: false,
          pipelineState: 'new',
        },
      ],
    },
    followups: {
      metadata: {
        analysisDate: '2026-06-06',
        totalTracked: 1,
        actionable: 1,
        overdue: 1,
        urgent: 0,
        cold: 0,
        waiting: 0,
      },
      entries: [
        {
          num: 1,
          date: '2026-06-01',
          company: 'CrowdStrike',
          role: 'VP, Enterprise AI Strategy',
          status: 'Interview',
          score: '4.8/5',
          notes: 'Interview scheduled',
          reportPath: 'reports/001-crowdstrike.md',
          urgency: 'overdue',
          nextFollowupDate: '2026-06-05',
          daysUntilNext: -1,
          daysSinceApplication: 6,
        },
      ],
    },
    patterns: {
      metadata: {
        total: 1,
        byOutcome: { positive: 1 },
      },
      scoreThreshold: {
        recommended: 4.5,
        reasoning: 'Scores below 4.5 are not converting.',
        positiveRange: '4.5-5.0',
      },
      remotePolicy: [],
      recommendations: [
        {
          action: 'Set minimum score threshold at 4.5/5',
          reasoning: 'No positive outcomes below 4.5.',
          impact: 'Medium',
        },
      ],
    },
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/api/operations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPayload),
        });
      }
      return Promise.reject(new Error('Unknown API endpoint'));
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('switches saved views and exposes active operation filters', async () => {
    renderOperations();

    const controls = await screen.findByLabelText('Operations workflow focus');
    fireEvent.click(within(controls).getByRole('button', { name: /Sourcing/i }));

    await waitFor(() => {
      expect(screen.getByText('Lane: Scanner')).toBeInTheDocument();
      expect(screen.getByText(/records in Scanner/)).toBeInTheDocument();
    });
  });

  it('maps Career-Ops CLI capabilities to the relevant operations lane', async () => {
    renderOperations();

    const catalog = await screen.findByLabelText('Operations workflow focus');
    expect(within(catalog).getAllByText('/career-ops pipeline').length).toBeGreaterThan(0);
    expect(within(catalog).getByLabelText('Selected command contract')).toHaveTextContent('data/pipeline.md, live job URLs');

    fireEvent.click(within(catalog).getByRole('button', { name: /Pattern analysis/i }));

    await waitFor(() => {
      expect(within(catalog).getAllByText('/career-ops patterns').length).toBeGreaterThan(0);
      expect(within(catalog).getByLabelText('Selected command contract')).toHaveTextContent('Score gates and targeting rules');
      expect(screen.getByText('Lane: Intelligence')).toBeInTheDocument();
    });
  });

  it('summarizes the selected mode and active record in the workflow focus', async () => {
    renderOperations();

    const focus = await screen.findByLabelText('Operations workflow focus');
    expect(within(focus).getAllByText('Process pipeline').length).toBeGreaterThan(0);
    expect(within(focus).getAllByText('/career-ops pipeline').length).toBeGreaterThan(0);
    expect(within(focus).getByText('Capital One')).toBeInTheDocument();
    expect(within(focus).getByText('Verify liveness before scoring')).toBeInTheDocument();

    const catalog = screen.getByLabelText('Operations workflow focus');
    fireEvent.click(within(catalog).getByRole('button', { name: /Follow-up cadence/i }));

    await waitFor(() => {
      expect(within(focus).getAllByText('Follow-up cadence').length).toBeGreaterThan(0);
      expect(within(focus).getAllByText('/career-ops followup').length).toBeGreaterThan(0);
      expect(within(focus).getByText('CrowdStrike')).toBeInTheDocument();
      expect(screen.getByText('Lane: Follow-ups')).toBeInTheDocument();
    });
  });

  it('uses the workflow focus to reopen the active lane', async () => {
    renderOperations();

    const lanes = await screen.findByLabelText('Operations lanes');
    fireEvent.click(within(lanes).getByRole('button', { name: /Scanner/i }));

    const focus = await screen.findByLabelText('Operations workflow focus');
    fireEvent.click(within(focus).getByRole('button', { name: /Open lane/i }));

    await waitFor(() => {
      expect(screen.getByText('Lane: Scanner')).toBeInTheDocument();
      expect(screen.getByText('Selected scan row')).toBeInTheDocument();
      expect(window.location.search).toContain('lane=scanner');
    });
  });

  it('hydrates direct lane routes with the matching command mode', async () => {
    window.history.replaceState(null, '', '/operations?lane=followups');
    renderOperations();

    const focus = await screen.findByLabelText('Operations workflow focus');

    await waitFor(() => {
      expect(within(focus).getAllByText('Follow-up cadence').length).toBeGreaterThan(0);
      expect(within(focus).getAllByText('/career-ops followup').length).toBeGreaterThan(0);
      expect(within(focus).getByText('Draft only; user sends')).toBeInTheDocument();
      expect(screen.getByText('Lane: Follow-ups')).toBeInTheDocument();
    });
  });

  it('hydrates direct capability routes and renders the matching run preview', async () => {
    window.history.replaceState(null, '', '/operations?lane=outcomes&mode=deep');
    renderOperations();

    const focus = await screen.findByLabelText('Operations workflow focus');
    const preview = await screen.findByLabelText('Operations run preview');

    await waitFor(() => {
      expect(within(focus).getAllByText('Deep research').length).toBeGreaterThan(0);
      expect(within(focus).getAllByText('/career-ops deep').length).toBeGreaterThan(0);
      expect(within(preview).getByText('Research company context')).toBeInTheDocument();
      expect(within(preview).getAllByText('/career-ops deep').length).toBeGreaterThan(0);
      expect(within(preview).getByText('Research only')).toBeInTheDocument();
    });
  });

  it('hydrates scanner search and selected records from direct operations routes', async () => {
    window.history.replaceState(null, '', '/operations?lane=scanner&mode=scan&q=capital&item=https%3A%2F%2Fexample.com%2Fcapital-one-scan');
    renderOperations();

    const controls = await screen.findByLabelText('Operations workflow focus');
    const workflowFocus = await screen.findByLabelText('Operations workflow focus');
    const scannerPanel = document.getElementById('ops-lane-scanner');

    await waitFor(() => {
      expect(within(controls).getByPlaceholderText('Search operations records...')).toHaveValue('capital');
      expect(screen.getByText('Lane: Scanner')).toBeInTheDocument();
      expect(screen.getByText('Search: capital')).toBeInTheDocument();
      expect(workflowFocus).toHaveTextContent('Scanner');
      expect(workflowFocus).toHaveTextContent('Scan portals');
      expect(workflowFocus).toHaveTextContent('Capital One');
      expect(workflowFocus).toHaveTextContent('capital');
      expect(scannerPanel).not.toBeNull();
      expect(within(scannerPanel as HTMLElement).getByText('Selected scan row')).toBeInTheDocument();
      expect(within(scannerPanel as HTMLElement).getAllByText('Capital One').length).toBeGreaterThan(0);
      expect(within(scannerPanel as HTMLElement).getByText('Not queued')).toBeInTheDocument();
      const primaryActions = within(scannerPanel as HTMLElement).getByLabelText('Selected scanner row primary actions');
      expect(primaryActions).toHaveTextContent('Promote to intake');
      expect(within(primaryActions).getByRole('button', { name: /Add to pipeline/i })).toBeInTheDocument();
      expect(within(primaryActions).getByRole('button', { name: /Copy intake/i })).toBeInTheDocument();
      expect(within(primaryActions).getByRole('link', { name: /Job post/i })).toHaveAttribute('href', 'https://example.com/capital-one-scan');
    });
  });

  it('turns a pending pipeline click into selected intake actions and URL state', async () => {
    const scrollTargets: string[] = [];
    const scrollSpy = vi.fn(function trackScrollTarget(this: HTMLElement) {
      scrollTargets.push(this.getAttribute('data-selected-record-detail') || this.id || this.tagName);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollSpy,
    });
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width: 820px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    renderOperations();

    const intakePanel = await waitFor(() => {
      const panel = document.getElementById('ops-lane-intake');
      expect(panel).not.toBeNull();
      return panel as HTMLElement;
    });

    fireEvent.click(within(intakePanel).getByRole('button', { name: /Capital One/i }));

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      const workflowFocus = screen.getByLabelText('Operations workflow focus');
      const primaryActions = within(intakePanel).getByLabelText('Selected intake primary actions');

      expect(within(intakePanel).getByText('Selected intake')).toBeInTheDocument();
      expect(primaryActions).toHaveTextContent('Evaluate this URL');
      expect(within(primaryActions).getByRole('button', { name: /Copy brief/i })).toBeInTheDocument();
      expect(within(primaryActions).getByRole('link', { name: /Job post/i })).toHaveAttribute('href', 'https://example.com/capital-one');
      expect(workflowFocus).toHaveTextContent('Intake');
      expect(workflowFocus).toHaveTextContent('Process pipeline');
      expect(workflowFocus).toHaveTextContent('Capital One');
      expect(params.get('lane')).toBe('intake');
      expect(params.get('mode')).toBe('pipeline');
      expect(params.get('item')).toBe('capital-one-intake');
      expect(scrollTargets).toContain('true');
    });
  });

  it('resets the operations workflow state from the focus bar', async () => {
    window.history.replaceState(null, '', '/operations?lane=scanner&mode=scan&q=capital&item=https%3A%2F%2Fexample.com%2Fcapital-one-scan');
    renderOperations();

    const workflowFocus = await screen.findByLabelText('Operations workflow focus');

    await waitFor(() => {
      expect(workflowFocus).toHaveTextContent('Scanner');
      expect(workflowFocus).toHaveTextContent('capital');
    });

    fireEvent.click(within(workflowFocus).getByRole('button', { name: /^Reset$/i }));

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(workflowFocus).toHaveTextContent('Intake');
      expect(workflowFocus).toHaveTextContent('Default intake command view');
      expect(params.get('lane')).toBe('intake');
      expect(params.get('q')).toBeNull();
    });
  });

  it('persists selected capability mode in the operations URL', async () => {
    renderOperations();

    const catalog = await screen.findByLabelText('Operations workflow focus');
    fireEvent.click(within(catalog).getByRole('button', { name: /Deep research/i }));

    const preview = await screen.findByLabelText('Operations run preview');

    await waitFor(() => {
      expect(window.location.search).toContain('lane=outcomes');
      expect(window.location.search).toContain('mode=deep');
      expect(within(preview).getAllByText('/career-ops deep').length).toBeGreaterThan(0);
    });
  });

  it('filters operation records through the console search', async () => {
    renderOperations();

    const controls = await screen.findByLabelText('Operations workflow focus');
    fireEvent.click(within(controls).getByRole('button', { name: /Sourcing/i }));
    fireEvent.change(within(controls).getByPlaceholderText('Search operations records...'), {
      target: { value: 'capital' },
    });

    await waitFor(() => {
      expect(screen.getByText('Search: capital')).toBeInTheDocument();
      expect(screen.getByText(/record in Scanner/)).toBeInTheDocument();
      expect(new URLSearchParams(window.location.search).get('q')).toBe('capital');
    });
  });

  it('persists selected operations records in the URL', async () => {
    renderOperations();

    const controls = await screen.findByLabelText('Operations workflow focus');
    fireEvent.click(within(controls).getByRole('button', { name: /Sourcing/i }));

    const scannerPanel = document.getElementById('ops-lane-scanner');
    expect(scannerPanel).not.toBeNull();
    fireEvent.click(within(scannerPanel as HTMLElement).getByRole('button', { name: /Capital One/i }));

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('lane')).toBe('scanner');
      expect(params.get('mode')).toBe('scan');
      expect(params.get('item')).toBe('https://example.com/capital-one-scan');
    });
  });


  it('shows only the active lane selected detail after a lane switch', async () => {
    renderOperations();

    const lanes = await screen.findByLabelText('Operations lanes');
    fireEvent.click(within(lanes).getByRole('button', { name: /Scanner/i }));

    await waitFor(() => {
      expect(screen.getByText('Active scan row')).toBeInTheDocument();
      expect(screen.getByText('Selected scan row')).toBeInTheDocument();
      expect(screen.queryByText('Selected intake')).not.toBeInTheDocument();
      expect(screen.queryByText('Selected follow-up')).not.toBeInTheDocument();
      expect(screen.queryByText('Selected outcome')).not.toBeInTheDocument();
    });
  });
});
