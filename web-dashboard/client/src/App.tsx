import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  BriefcaseBusiness,
  Database,
  FileText,
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import './index.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Applications = lazy(() => import('./pages/Applications'));
const Operations = lazy(() => import('./pages/Operations'));
const ReportViewer = lazy(() => import('./pages/ReportViewer'));

const navItems = [
  {
    to: '/',
    label: 'Today',
    helper: 'Command queue',
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: '/applications',
    label: 'Applications',
    helper: 'Tracker records',
    icon: ListTodo,
  },
  {
    to: '/operations',
    label: 'Queues',
    helper: 'Incoming and follow-ups',
    icon: Workflow,
  },
];

const routeContext = (pathname: string) => {
  if (pathname.startsWith('/applications')) {
    return {
      eyebrow: 'Tracker workspace',
      title: 'Applications',
      helper: 'Operate application records, stage tracker updates, and open report evidence.',
      icon: BriefcaseBusiness,
      source: 'data/applications.md',
    };
  }
  if (pathname.startsWith('/operations')) {
    return {
      eyebrow: 'Work queues',
      title: 'Queues',
      helper: 'Review incoming jobs, scanner finds, follow-ups, and workflow-ready records.',
      icon: Workflow,
      source: 'pipeline, scan, follow-up files',
    };
  }
  if (pathname.startsWith('/report')) {
    return {
      eyebrow: 'Evaluation artifact',
      title: 'Report dossier',
      helper: 'Read decision evidence, risks, actions, and command context from a generated report.',
      icon: FileText,
      source: 'reports/*.md',
    };
  }
  return {
    eyebrow: 'Command center',
    title: 'Today',
    helper: 'Prioritize the active opportunity, inspect funnel health, and jump into the next action.',
    icon: LayoutDashboard,
    source: 'Career-Ops tracker',
  };
};

const humanizeParam = (value: string) => value
  .replace(/[-_]/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());

const routeStateSummary = (pathname: string, search: string) => {
  const params = new URLSearchParams(search);
  const stateParts: string[] = [];

  if (pathname.startsWith('/operations')) {
    if (params.get('lane')) stateParts.push(`Lane ${humanizeParam(params.get('lane') || '')}`);
    if (params.get('mode')) stateParts.push(`Mode ${humanizeParam(params.get('mode') || '')}`);
    if (params.get('q')) stateParts.push(`Search "${params.get('q')}"`);
    if (params.get('item')) stateParts.push('Record selected');
    return stateParts.length ? stateParts.join(' / ') : 'Default workflow view';
  }

  if (pathname.startsWith('/applications')) {
    if (params.get('view')) stateParts.push(`View ${humanizeParam(params.get('view') || '')}`);
    if (params.get('segment')) stateParts.push(`Segment ${humanizeParam(params.get('segment') || '')}`);
    if (params.get('status')) stateParts.push(`Status ${humanizeParam(params.get('status') || '')}`);
    if (params.get('tab')) stateParts.push(`Section ${humanizeParam(params.get('tab') || '')}`);
    if (params.get('q')) stateParts.push(`Search "${params.get('q')}"`);
    if (params.get('app')) stateParts.push(`Record #${params.get('app')}`);
    return stateParts.length ? stateParts.join(' / ') : 'Default tracker workbench';
  }

  if (pathname.startsWith('/report')) {
    if (params.get('reportView')) stateParts.push(`View ${humanizeParam(params.get('reportView') || '')}`);
    if (params.get('action')) stateParts.push(`Action ${humanizeParam(params.get('action') || '')}`);
    if (params.get('section')) stateParts.push('Section anchored');
    if (params.get('reportQ')) stateParts.push(`Search "${params.get('reportQ')}"`);
    if (params.get('app')) stateParts.push(`Record #${params.get('app')}`);
    return stateParts.length ? stateParts.join(' / ') : 'Full dossier view';
  }

  if (params.get('view')) stateParts.push(`View ${humanizeParam(params.get('view') || '')}`);
  if (params.get('stage')) stateParts.push(`Stage ${humanizeParam(params.get('stage') || '')}`);
  if (params.get('sort')) stateParts.push(`Sort ${humanizeParam(params.get('sort') || '')}`);
  if (params.get('q')) stateParts.push(`Search "${params.get('q')}"`);
  if (params.get('app')) stateParts.push(`Record #${params.get('app')}`);
  return stateParts.length ? stateParts.join(' / ') : 'Default command view';
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const context = routeContext(location.pathname);
  const ContextIcon = context.icon;
  const routeState = routeStateSummary(location.pathname, location.search);
  const fullRoute = `${location.pathname}${location.search}`;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const mainContent = document.querySelector('.main-content');
    if (mainContent instanceof HTMLElement) {
      mainContent.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.pathname]);

  return (
    <div className="app-container">
      <aside className="sidebar" aria-label="Career-Ops navigation">
        <div className="sidebar-brand">
          <div className="sidebar-logo">Career-Ops</div>
          <span>Web command center</span>
        </div>

        <nav className="nav-links">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                end={item.end}
              >
                <Icon size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.helper}</small>
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-status" aria-label="Career-Ops source status">
          <div>
            <Database size={15} />
            <span>Source of truth</span>
          </div>
          <strong>{context.source}</strong>
        </div>

        <div className="sidebar-guardrail">
          <ShieldCheck size={15} />
          <span>Draft, review, then send</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="app-topbar" aria-label="Current workspace">
          <div>
            <p className="eyebrow">{context.eyebrow}</p>
            <h1><ContextIcon size={20} /> {context.title}</h1>
            <p>{context.helper}</p>
          </div>
          <div className="app-topbar__meta">
            <span><Activity size={14} /> Live workspace</span>
            <strong>{routeState}</strong>
            <small>{fullRoute}</small>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <AppShell>
      <RouteWorkspace />
    </AppShell>
  );
}

function RouteWorkspace() {
  const location = useLocation();

  return (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<RouteLoadingState />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/report/:id" element={<ReportViewer />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

function RouteLoadingState() {
  return (
    <section className="route-loading-state" aria-label="Loading workspace">
      <div>
        <p className="eyebrow">Loading workspace</p>
        <h2>Preparing Career-Ops view</h2>
        <p>Loading the selected command surface and source-backed data.</p>
      </div>
    </section>
  );
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Career-Ops route failed to render', error, info.componentStack);
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="route-error-state" aria-label="Workspace load failure">
          <div>
            <p className="eyebrow">Workspace interrupted</p>
            <h2>Could not load this Career-Ops view</h2>
            <p>Refresh the workspace and keep the current tracker data intact.</p>
            <button className="button-primary" type="button" onClick={() => window.location.reload()}>
              Reload workspace
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
