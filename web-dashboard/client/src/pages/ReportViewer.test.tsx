import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ReportViewer from './ReportViewer';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current report route">{location.search}</output>;
}

const mockReportResponse = (markdown: string) => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(markdown),
  } as Response);
};

const mockReportFailure = () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
  } as Response);
};

describe('ReportViewer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('fetches and renders markdown report content', async () => {
    const mockMarkdown = '# Evaluation Report\n\n## Block A: Match';
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/086-capital-one.md']}>
        <LocationProbe />
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading evaluation dossier.../i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getAllByText(/Evaluation Report/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Block A: Match/i).length).toBeGreaterThan(0);
    });

    expect(fetch).toHaveBeenCalledWith('/api/reports/086-capital-one.md');
  });

  test('filters dossier sections through saved report views and search', async () => {
    const mockMarkdown = [
      '# Evaluation: Capital One - Senior Director',
      '',
      '**Company:** Capital One',
      '**Role:** Senior Director',
      '**Score:** 4.8/5',
      '**Recommendation:** Build pursuit package',
      '',
      '## Decision Summary',
      'Strong fit with executive scope.',
      '',
      '## Evidence Matrix',
      '| Signal | Evidence |',
      '| --- | --- |',
      '| Leadership | AI platform proof |',
      '',
      '## Risk Review',
      '- Hybrid schedule risk',
      '',
      '## Action Plan',
      '- Prepare CV and outreach',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/086-capital-one.md']}>
        <LocationProbe />
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    const controls = await screen.findByLabelText('Report reading controls');
    fireEvent.click(within(controls).getByRole('button', { name: /Risks/i }));

    await waitFor(() => {
      expect(screen.getByText('View: Risks')).toBeInTheDocument();
      expect(screen.getAllByText('Risk Review').length).toBeGreaterThan(0);
      expect(within(screen.getByLabelText('Saved report views')).getByRole('button', { name: /Risks/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('reportView=risks');
    });

    fireEvent.change(within(controls).getByPlaceholderText('Search dossier sections...'), {
      target: { value: 'hybrid' },
    });

    await waitFor(() => {
      expect(screen.getByText('Search: hybrid')).toBeInTheDocument();
      expect(screen.getByText(/section shown/)).toBeInTheDocument();
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('reportQ=hybrid');
    });

    fireEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: /Risk Review/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('section=risk-review');
      expect(within(screen.getByRole('navigation')).getByRole('link', { name: /Risk Review/i })).toHaveAttribute('aria-current', 'location');
    });
  });

  test('renders an interactive decision brief that focuses report views', async () => {
    const mockMarkdown = [
      '# Evaluation: Capital One - Senior Director',
      '',
      '**Company:** Capital One',
      '**Role:** Senior Director',
      '**Score:** 4.8/5',
      '**Recommendation:** Build pursuit package',
      '**Legitimacy:** High Confidence',
      '',
      '## Decision Summary',
      'Strong fit with executive scope.',
      '',
      '## Evidence Matrix',
      '| Signal | Evidence |',
      '| --- | --- |',
      '| Leadership | AI platform proof |',
      '',
      '## Risk Review',
      '- Hybrid schedule risk',
      '',
      '## Action Plan',
      '- Prepare CV and outreach',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/086-capital-one.md']}>
        <LocationProbe />
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    const brief = await screen.findByLabelText('Decision brief');
    expect(within(brief).getByText('Priority pursuit')).toBeInTheDocument();
    expect(within(brief).getByText('Build pursuit package')).toBeInTheDocument();

    fireEvent.click(within(brief).getByRole('button', { name: /Evidence/i }));

    await waitFor(() => {
      expect(screen.getByText('View: Evidence')).toBeInTheDocument();
      expect(screen.getAllByText('Evidence Matrix').length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('reportView=evidence');
    });
  });

  test('uses the reader cockpit to focus dossier views', async () => {
    const mockMarkdown = [
      '# Evaluation: Capital One - Senior Director',
      '',
      '**Company:** Capital One',
      '**Role:** Senior Director',
      '**Score:** 4.8/5',
      '**Recommendation:** Build pursuit package',
      '**Legitimacy:** High Confidence',
      '',
      '## Decision Summary',
      'Strong fit with executive scope.',
      '',
      '## Evidence Matrix',
      '| Signal | Evidence |',
      '| --- | --- |',
      '| Leadership | AI platform proof |',
      '',
      '## Risk Review',
      '- Hybrid schedule risk',
      '',
      '## Action Plan',
      '- Prepare CV and outreach',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/086-capital-one.md?from=applications&app=86']}>
        <LocationProbe />
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    const cockpit = await screen.findByLabelText('Report reader cockpit');
    expect(within(cockpit).getByText('Applications context')).toBeInTheDocument();
    expect(within(cockpit).getByRole('button', { name: /Evidence map/i })).toBeInTheDocument();

    fireEvent.click(within(cockpit).getByRole('button', { name: /Risk review/i }));

    await waitFor(() => {
      expect(screen.getByText('View: Risks')).toBeInTheDocument();
      expect(screen.getAllByText('Risk Review').length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('from=applications');
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('app=86');
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('reportView=risks');
    });
  });

  test('hydrates report workspace state from the URL', async () => {
    const mockMarkdown = [
      '# Evaluation: Capital One - Senior Director',
      '',
      '**Company:** Capital One',
      '**Role:** Senior Director',
      '**Score:** 4.8/5',
      '**Recommendation:** Build pursuit package',
      '**Legitimacy:** High Confidence',
      '',
      '## Decision Summary',
      'Strong fit with executive scope.',
      '',
      '## Evidence Matrix',
      '| Signal | Evidence |',
      '| --- | --- |',
      '| Leadership | AI platform proof |',
      '',
      '## Risk Review',
      '- Hybrid schedule risk',
      '',
      '## Action Plan',
      '- Prepare CV and outreach',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/086-capital-one.md?from=applications&app=86&reportView=risks&section=risk-review&action=company-research']}>
        <LocationProbe />
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    const workspace = await screen.findByLabelText('Report action workspace');
    const workspaceState = await screen.findByLabelText('Report workspace state');
    await waitFor(() => {
      expect(screen.getByText('View: Risks')).toBeInTheDocument();
      expect(screen.getByLabelText('Dossier reading context')).toHaveTextContent('Risk Review');
      expect(workspaceState).toHaveTextContent('Workspace state');
      expect(workspaceState).toHaveTextContent('Risks');
      expect(workspaceState).toHaveTextContent('Research company context');
      expect(workspaceState).toHaveTextContent('Risk Review');
      expect(within(workspace).getAllByText('Research company context').length).toBeGreaterThan(0);
      expect(within(workspace).getAllByText('/career-ops deep').length).toBeGreaterThan(0);
    });

    fireEvent.click(within(workspaceState).getByRole('button', { name: /Reset view/i }));

    await waitFor(() => {
      expect(workspaceState).toHaveTextContent('Full dossier');
      expect(screen.getByLabelText('Current report route')).not.toHaveTextContent('reportView=risks');
      expect(screen.getByLabelText('Current report route')).not.toHaveTextContent('section=risk-review');
    });
  });

  test('renders a selected action workspace that changes command context', async () => {
    const mockMarkdown = [
      '# Evaluation: Capital One - Senior Director',
      '',
      '**Company:** Capital One',
      '**Role:** Senior Director',
      '**Score:** 4.8/5',
      '**Recommendation:** Build pursuit package',
      '**Legitimacy:** High Confidence',
      '',
      '## Decision Summary',
      'Strong fit with executive scope.',
      '',
      '## Evidence Matrix',
      '| Signal | Evidence |',
      '| --- | --- |',
      '| Leadership | AI platform proof |',
      '',
      '## Risk Review',
      '- Hybrid schedule risk',
      '',
      '## Action Plan',
      '- Prepare CV and outreach',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/086-capital-one.md?from=applications&app=86']}>
        <LocationProbe />
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    const workspace = await screen.findByLabelText('Report action workspace');
    expect(within(workspace).getAllByText('Build pursuit package').length).toBeGreaterThan(0);
    expect(within(workspace).getAllByText('/career-ops apply').length).toBeGreaterThan(0);
    const primaryActions = within(workspace).getByLabelText('Report action primary actions');
    expect(primaryActions).toHaveTextContent('Next best action');
    expect(primaryActions).toHaveTextContent('Build pursuit package');
    expect(within(primaryActions).getByRole('button', { name: /Copy brief/i })).toBeInTheDocument();
    expect(within(primaryActions).getByRole('button', { name: /Focus view/i })).toBeInTheDocument();
    expect(within(primaryActions).getByRole('link', { name: /Tracker/i })).toHaveAttribute('href', '/applications?app=86');

    fireEvent.click(within(workspace).getByRole('button', { name: /Research company context/i }));

    await waitFor(() => {
      expect(within(workspace).getAllByText('/career-ops deep').length).toBeGreaterThan(0);
      expect(screen.getByText('View: Evidence')).toBeInTheDocument();
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('action=company-research');
      expect(screen.getByLabelText('Current report route')).toHaveTextContent('reportView=evidence');
    });
  });

  test('focuses the action workspace from action-view report links', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const mockMarkdown = [
      '# Evaluation: Capital One - Senior Director',
      '',
      '**Company:** Capital One',
      '**Role:** Senior Director',
      '**Score:** 4.8/5',
      '**Recommendation:** Build pursuit package',
      '**Legitimacy:** High Confidence',
      '',
      '## Decision Summary',
      'Strong fit with executive scope.',
      '',
      '## Action Plan',
      '- Prepare CV and outreach',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/086-capital-one.md?from=dashboard&app=86&reportView=actions']}>
        <LocationProbe />
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByLabelText('Report action workspace');

    await waitFor(() => {
      expect(screen.getByText('View: Actions')).toBeInTheDocument();
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    });
  });

  test('preserves dashboard cockpit context in the back link', async () => {
    const mockMarkdown = [
      '# Evaluation: Athena Technology Group - Strategic Information CISO',
      '',
      '**Company:** Athena Technology Group',
      '**Role:** Strategic Information CISO',
      '**Score:** 4.5/5',
      '',
      '## Decision Summary',
      'Apply immediately.',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/002-athena-ciso.md?from=dashboard&app=5&stage=evaluated&sort=company&q=athena&view=evaluation']}>
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    const backLink = await screen.findByRole('link', { name: /Dashboard/i });
    expect(backLink).toHaveAttribute('href', '/?app=5&stage=evaluated&sort=company&q=athena&view=evaluation');
  });

  test('extracts fit score from global score section headings when header score is missing', async () => {
    const mockMarkdown = [
      '# Evaluation: Athena Technology Group - Strategic Information CISO',
      '',
      '**Company:** Athena Technology Group',
      '**Role:** Strategic Information CISO',
      '',
      '## Decision Summary',
      'Apply immediately.',
      '',
      '## F. Global Score: 4.5/5',
      '**Recommendation:** Apply immediately.',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/002-athena-ciso.md?from=dashboard&app=5']}>
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('4.5/5').length).toBeGreaterThan(0);
    });
  });

  test('does not add an empty query mark to operations back links', async () => {
    const mockMarkdown = [
      '# Evaluation Report',
      '',
      '## Decision Summary',
      'Review required.',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/002-athena-ciso.md?from=operations']}>
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    const backLink = await screen.findByRole('link', { name: /Operations/i });
    expect(backLink).toHaveAttribute('href', '/operations');
  });

  test('adds responsive labels to markdown table cells', async () => {
    const mockMarkdown = [
      '# Evaluation Report',
      '',
      '## Evidence Matrix',
      '| Signal | Evidence |',
      '| --- | --- |',
      '| Leadership | AI platform proof |',
    ].join('\n');
    mockReportResponse(mockMarkdown);

    render(
      <MemoryRouter initialEntries={['/report/086-capital-one.md']}>
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    const leadershipCell = await screen.findByText('Leadership');
    expect(leadershipCell).toHaveAttribute('data-label', 'Signal');
  });

  test('renders error message on fetch failure', async () => {
    mockReportFailure();

    render(
      <MemoryRouter initialEntries={['/report/invalid.md']}>
        <Routes>
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load report/i)).toBeDefined();
    });
  });
});
