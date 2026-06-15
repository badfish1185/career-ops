import { fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell, RouteErrorBoundary } from './App';

function renderShell(pathname: string) {
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <AppShell>
        <div>Route content</div>
      </AppShell>
    </MemoryRouter>
  );
}

describe('App shell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders route-aware dashboard navigation context', () => {
    renderShell('/');

    const nav = screen.getByLabelText('Career-Ops navigation');
    expect(within(nav).getByText('Career-Ops')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Today/i })).toHaveClass('active');
    expect(screen.getByLabelText('Current workspace')).toHaveTextContent('Today');
    expect(screen.getByLabelText('Career-Ops source status')).toHaveTextContent('Career-Ops tracker');
  });

  it('renders report pages as evaluation artifacts in the shell', () => {
    renderShell('/report/001-techcorp.md?from=dashboard&app=1');

    expect(screen.getByLabelText('Current workspace')).toHaveTextContent('Report dossier');
    expect(screen.getByLabelText('Current workspace')).toHaveTextContent('/report/001-techcorp.md');
    expect(screen.getByLabelText('Current workspace')).toHaveTextContent('Record #1');
    expect(screen.getByLabelText('Career-Ops source status')).toHaveTextContent('reports/*.md');
  });

  it('renders queue pages with workflow source context', () => {
    renderShell('/operations?lane=scanner&mode=scan&q=capital&item=https%3A%2F%2Fexample.com%2Fcapital-one');

    const nav = screen.getByLabelText('Career-Ops navigation');
    expect(within(nav).getByRole('link', { name: /Queues/i })).toHaveClass('active');
    expect(screen.getByLabelText('Current workspace')).toHaveTextContent('Queues');
    expect(screen.getByLabelText('Current workspace')).toHaveTextContent('Lane Scanner / Mode Scan / Search "capital" / Record selected');
    expect(screen.getByLabelText('Career-Ops source status')).toHaveTextContent('pipeline, scan, follow-up files');
  });

  it('summarizes dashboard and application query-backed workspace state', () => {
    renderShell('/?view=evaluation&stage=evaluated&sort=date&app=2');

    expect(screen.getByLabelText('Current workspace')).toHaveTextContent('View Evaluation / Stage Evaluated / Sort Date / Record #2');
  });

  it('scrolls the app shell to the top on route changes', () => {
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const elementScrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: elementScrollTo,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell>
          <Link to="/applications?app=24">Open applications</Link>
        </AppShell>
      </MemoryRouter>,
    );

    windowScrollTo.mockClear();
    elementScrollTo.mockClear();

    fireEvent.click(screen.getByRole('link', { name: /Open applications/i }));

    expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    expect(elementScrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    expect(screen.getByLabelText('Current workspace')).toHaveTextContent('Applications');
  });
});

function BrokenWorkspace() {
  throw new Error('Route chunk failed');
  return null;
}

describe('RouteErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a recoverable workspace failure state', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RouteErrorBoundary resetKey="/operations">
        <BrokenWorkspace />
      </RouteErrorBoundary>,
    );

    expect(screen.getByLabelText('Workspace load failure')).toHaveTextContent('Could not load this Career-Ops view');
    expect(screen.getByRole('button', { name: /Reload workspace/i })).toBeInTheDocument();
  });

  it('clears workspace failure state when the route changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <RouteErrorBoundary resetKey="/operations">
        <BrokenWorkspace />
      </RouteErrorBoundary>,
    );

    expect(screen.getByLabelText('Workspace load failure')).toBeInTheDocument();

    rerender(
      <RouteErrorBoundary resetKey="/applications">
        <div>Recovered workspace</div>
      </RouteErrorBoundary>,
    );

    expect(screen.queryByLabelText('Workspace load failure')).not.toBeInTheDocument();
    expect(screen.getByText('Recovered workspace')).toBeInTheDocument();
  });
});
