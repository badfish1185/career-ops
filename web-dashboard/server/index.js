const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5173;

app.use(cors());
app.use(express.json());

const ROOT_DIR = path.join(__dirname, '../../');
const CLIENT_DIST_DIR = path.join(ROOT_DIR, 'web-dashboard/client/dist');
const APPS_FILE = path.join(ROOT_DIR, 'data/applications.md');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const BATCH_INPUT_FILE = path.join(ROOT_DIR, 'batch/batch-input.tsv');
const SCAN_HISTORY_FILE = path.join(ROOT_DIR, 'data/scan-history.tsv');
const PIPELINE_FILE = path.join(ROOT_DIR, 'data/pipeline.md');
const FOLLOWUPS_FILE = path.join(ROOT_DIR, 'data/follow-ups.md');

const STATUS_LABELS = {
  evaluated: 'Evaluated',
  applied: 'Applied',
  responded: 'Responded',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  discarded: 'Discarded',
  skip: 'SKIP',
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([key, label]) => ({ key, label }));
const FUNNEL_ORDER = ['evaluated', 'applied', 'responded', 'interview', 'offer'];
const STATUS_ORDER = ['interview', 'offer', 'responded', 'applied', 'evaluated', 'skip', 'rejected', 'discarded'];
const ACTIVE_STATUSES = new Set(['applied', 'responded', 'interview', 'offer']);
const INACTIVE_STATUSES = new Set(['skip', 'rejected', 'discarded']);

const readText = (filePath) => {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
};

const normalizeStatus = (raw = '') => {
  const status = raw
    .replace(/\*\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+202\d.*$/, '');

  if (status.includes('no aplicar') || status.includes('no_aplicar') || status === 'skip' || status.includes('geo blocker')) return 'skip';
  if (status.includes('interview') || status.includes('entrevista')) return 'interview';
  if (status === 'offer' || status.includes('oferta')) return 'offer';
  if (status.includes('responded') || status.includes('respondido')) return 'responded';
  if (status.includes('applied') || status.includes('aplicado') || ['enviada', 'aplicada', 'sent'].includes(status)) return 'applied';
  if (status.includes('rejected') || status.includes('rechazado') || status === 'rechazada') return 'rejected';
  if (
    status.includes('discarded') ||
    status.includes('descartado') ||
    status === 'descartada' ||
    status === 'cerrada' ||
    status === 'cancelada' ||
    status.startsWith('duplicado') ||
    status.startsWith('dup')
  ) return 'discarded';
  if (
    status.includes('evaluated') ||
    status.includes('evaluada') ||
    ['condicional', 'hold', 'monitor', 'evaluar', 'verificar'].includes(status)
  ) return 'evaluated';

  return status || 'evaluated';
};

const normalizeCompany = (company = '') => company
  .trim()
  .toLowerCase()
  .replace(/\s+(inc\.?|llc|ltd|corp|corporation|technologies|technology|group|co\.?)$/i, '')
  .trim();

const normalizeTextKey = (value = '') => value
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^\w]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parseScore = (scoreRaw = '') => {
  const match = scoreRaw.match(/(\d+\.?\d*)\/5/);
  if (!match) return null;
  return Number.parseFloat(match[1]);
};

const reportPathToFilename = (reportPath) => {
  if (!reportPath || reportPath === 'N/A') return null;
  return path.basename(reportPath);
};

const resolveReportPath = (filenameOrPath) => {
  if (!filenameOrPath) return null;
  const filename = path.basename(filenameOrPath);
  const resolved = path.join(REPORTS_DIR, filename);
  if (!resolved.startsWith(REPORTS_DIR)) return null;
  return resolved;
};

const firstMatch = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanMarkdown(match[1]);
  }
  return '';
};

const cleanMarkdown = (value = '') => value
  .replace(/\*\*/g, '')
  .replace(/\s*\|\s*$/, '')
  .trim();

const extractBulletsAfterHeading = (text, headingPattern, maxBullets = 3) => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) return [];

  const bullets = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('### ') || line.startsWith('## ')) break;
    if (line.startsWith('- ')) bullets.push(cleanMarkdown(line.slice(2)));
    if (bullets.length >= maxBullets) break;
  }
  return bullets;
};

const loadReportSummary = (reportFilename) => {
  const reportPath = resolveReportPath(reportFilename);
  if (!reportPath || !fs.existsSync(reportPath)) return null;

  const text = fs.readFileSync(reportPath, 'utf8');
  const header = text.slice(0, 2500);

  return {
    filename: path.basename(reportPath),
    url: firstMatch(header, [/^\*\*URL:\*\*\s*(https?:\/\/\S+)/m]),
    legitimacy: firstMatch(header, [/^\*\*Legitimacy:\*\*\s*(.+)$/m, /^\*\*Tier:\*\*\s*(.+)$/m]),
    archetype: firstMatch(text, [
      /\*\*Primary Archetype:\*\*\s*(.+)$/m,
      /\*\*Archetype:\*\*\s*(.+)$/m,
      /\*\*Arquetipo(?: detectado)?:\*\*\s*(.+)$/m,
      /\*\*Arquetipo(?:\s+detectado)?\*\*\s*\|\s*(.+)$/m,
    ]),
    recommendation: firstMatch(text, [
      /\*\*Recommendation:\*\*\s*(.+)$/m,
      /\*\*Global Recommendation:\*\*\s*(.+)$/m,
      /\*\*Recomendacion:\*\*\s*(.+)$/m,
    ]),
    remote: firstMatch(text, [
      /\*\*Remote(?: Policy)?:\*\*\s*(.+)$/m,
      /\*\*Remote\*\*\s*\|\s*(.+)$/m,
      /\*\*Location:\*\*\s*(.+)$/m,
    ]),
    comp: firstMatch(text, [
      /\*\*Comp(?:ensation)?:\*\*\s*(.+)$/m,
      /\*\*Comp\*\*\s*\|\s*(.+)$/m,
      /\*\*Market Check:\*\*\s*(.+)$/m,
      /\*\*Target:\*\*\s*(.+)$/m,
    ]),
    tldr: firstMatch(text, [
      /\*\*TL;DR:\*\*\s*(.+)$/m,
      /\*\*TL;DR\*\*\s*\|\s*(.+)$/m,
      /\*\*Recommendation:\*\*\s*(.+)$/m,
    ]),
    redFlags: extractBulletsAfterHeading(text, /Block E|Red Flags|Warnings/i, 3),
    actionPlan: extractBulletsAfterHeading(text, /Action Plan|Next Steps|Plan/i, 4),
  };
};

const loadBatchUrlIndex = () => {
  const content = readText(BATCH_INPUT_FILE);
  const byCompany = new Map();

  for (const line of content.split('\n')) {
    const fields = line.split('\t');
    if (fields.length < 4 || fields[0] === 'id') continue;

    const notes = fields[3] || '';
    const noteLead = notes.split(' | ')[0] || '';
    const atIndex = noteLead.lastIndexOf(' @ ');
    if (atIndex < 0) continue;

    const role = noteLead.slice(0, atIndex).trim();
    const company = noteLead.slice(atIndex + 3).trim();
    const maybeUrl = notes.split(' | ').findLast?.((part) => part.trim().startsWith('http'));
    const url = maybeUrl?.trim() || (fields[1]?.startsWith('http') ? fields[1] : '');
    if (!url) continue;

    const key = normalizeCompany(company);
    const matches = byCompany.get(key) || [];
    matches.push({ role, url });
    byCompany.set(key, matches);
  }

  return byCompany;
};

const loadScanHistoryIndex = () => {
  const content = readText(SCAN_HISTORY_FILE);
  const byCompany = new Map();

  for (const line of content.split('\n')) {
    const fields = line.split('\t');
    if (fields.length < 5 || fields[0] === 'url') continue;

    const [url, , , title, company] = fields;
    if (!url?.startsWith('http')) continue;

    const key = normalizeCompany(company);
    const matches = byCompany.get(key) || [];
    matches.push({ role: title, url });
    byCompany.set(key, matches);
  }

  return byCompany;
};

const chooseBestUrl = (matches = [], role = '') => {
  if (matches.length === 0) return '';
  if (matches.length === 1) return matches[0].url;

  const roleWords = role.toLowerCase().split(/\W+/).filter((word) => word.length > 2);
  let best = matches[0];
  let bestScore = -1;

  for (const match of matches) {
    const candidate = (match.role || '').toLowerCase();
    const score = roleWords.reduce((count, word) => count + (candidate.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = match;
      bestScore = score;
    }
  }

  return best.url;
};

const formatScore = (score) => (typeof score === 'number' && Number.isFinite(score) ? `${score.toFixed(1)}/5` : 'N/A');

const buildApplicationAction = ({ app, id, label, mode, helper, suggestedStatus = '', tone = 'neutral' }) => {
  const summary = app.summary || {};
  const command = `/career-ops ${mode}`;
  const brief = [
    `Career-Ops action: ${label}`,
    '',
    `Command mode: ${command}`,
    `Tracker #: ${String(app.number).padStart(3, '0')}`,
    `Company: ${app.company}`,
    `Role: ${app.role}`,
    `Date: ${app.date}`,
    `Status: ${app.statusLabel || app.status}`,
    `Score: ${formatScore(app.score)}`,
    app.reportFilename ? `Report: reports/${app.reportFilename}` : '',
    app.jobUrl ? `Job URL: ${app.jobUrl}` : '',
    summary.archetype ? `Archetype: ${summary.archetype}` : '',
    summary.legitimacy ? `Legitimacy: ${summary.legitimacy}` : '',
    summary.recommendation ? `Recommendation: ${summary.recommendation}` : '',
    app.notes ? `Tracker notes: ${app.notes}` : '',
    suggestedStatus ? `Suggested tracker status: ${suggestedStatus}` : '',
    '',
    `${helper} Do not submit, send, or apply without user review.`,
  ].filter(Boolean).join('\n');

  return { id, label, mode, command, helper, suggestedStatus, tone, brief };
};

const buildApplicationActions = (app) => {
  const actions = [];
  const score = app.score;

  if (app.statusKey === 'interview') {
    actions.push(buildApplicationAction({
      app,
      id: 'interview-prep',
      label: 'Prepare interview brief',
      mode: 'interview-prep',
      tone: 'strong',
      suggestedStatus: 'Interview',
      helper: 'Generate company-specific interview prep, proof stories, risks, and likely panel questions from the report.',
    }));
  }

  if (['applied', 'responded', 'interview'].includes(app.statusKey)) {
    actions.push(buildApplicationAction({
      app,
      id: 'followup',
      label: 'Draft follow-up',
      mode: 'followup',
      tone: 'strong',
      suggestedStatus: app.statusLabel || app.status,
      helper: 'Draft a concise follow-up from tracker notes, application age, role context, and the latest evaluation.',
    }));
  }

  if (app.statusKey === 'evaluated' && typeof score === 'number' && score >= 4.5) {
    actions.push(buildApplicationAction({
      app,
      id: 'apply-package',
      label: 'Build application package',
      mode: 'apply',
      tone: 'elite',
      suggestedStatus: 'Applied',
      helper: 'Prepare the application package, tailored CV context, answers, and outreach language for review.',
    }));
  } else if (app.statusKey === 'evaluated' && typeof score === 'number' && score >= 4) {
    actions.push(buildApplicationAction({
      app,
      id: 'verify-apply',
      label: 'Verify and apply',
      mode: 'apply',
      tone: 'strong',
      suggestedStatus: 'Applied',
      helper: 'Verify the posting is live, review fit, and prepare application materials before any submission.',
    }));
  }

  if (typeof score === 'number' && score < 4) {
    actions.push(buildApplicationAction({
      app,
      id: 'discard-review',
      label: 'Review discard rationale',
      mode: 'patterns',
      tone: 'risk',
      suggestedStatus: app.statusKey === 'skip' ? 'SKIP' : 'Discarded',
      helper: 'Check whether the low-fit signal should become SKIP, discarded, or a targeting lesson.',
    }));
  }

  actions.push(buildApplicationAction({
    app,
    id: 'deep-dossier',
    label: 'Research company context',
    mode: 'deep',
    tone: 'neutral',
    helper: 'Expand the dossier with company context, leadership signals, product bets, and interview-relevant risks.',
  }));

  if (app.reportFilename) {
    actions.push(buildApplicationAction({
      app,
      id: 'report-review',
      label: 'Review evaluation report',
      mode: 'oferta',
      tone: 'neutral',
      helper: 'Re-read the evaluation report and use it as the source of truth for the next decision.',
    }));
  }

  return actions.slice(0, 4);
};

const parseApplications = () => {
  const content = readText(APPS_FILE);
  const batchUrls = loadBatchUrlIndex();
  const scanUrls = loadScanHistoryIndex();
  const apps = [];
  let tableStarted = false;

  for (const line of content.split('\n')) {
    if (line.includes('| # |')) {
      tableStarted = true;
      continue;
    }
    if (!tableStarted || !line.trim() || line.includes('|---|')) continue;

    const cols = line.split('|').map((col) => col.trim()).filter(Boolean);
    if (cols.length < 8) continue;

    const reportCol = cols[7];
    const reportMatch = reportCol.match(/\[[^\]]+\]\(([^)]+)\)/);
    const reportPath = reportMatch ? reportMatch[1] : (reportCol !== 'N/A' ? reportCol : null);
    const reportFilename = reportPathToFilename(reportPath);
    const reportSummary = reportFilename ? loadReportSummary(reportFilename) : null;
    const statusKey = normalizeStatus(cols[5]);
    const score = parseScore(cols[4]);
    const companyKey = normalizeCompany(cols[2]);
    const inferredUrl = chooseBestUrl(batchUrls.get(companyKey), cols[3]) || chooseBestUrl(scanUrls.get(companyKey), cols[3]);

    const app = {
      id: cols[0],
      number: Number.parseInt(cols[0], 10) || apps.length + 1,
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score,
      scoreRaw: cols[4],
      status: cols[5],
      statusKey,
      statusLabel: STATUS_LABELS[statusKey] || cols[5],
      pdf: cols[6].includes('✅'),
      report: reportPath,
      reportFilename,
      jobUrl: reportSummary?.url || inferredUrl || '',
      notes: cols[8] || '',
      summary: reportSummary,
    };

    app.actions = buildApplicationActions(app);
    apps.push(app);
  }

  return apps;
};

const countBy = (items, getKey) => items.reduce((acc, item) => {
  const key = getKey(item);
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const averageScore = (apps) => {
  const scored = apps.filter((app) => typeof app.score === 'number' && Number.isFinite(app.score));
  if (scored.length === 0) return 0;
  return scored.reduce((sum, app) => sum + app.score, 0) / scored.length;
};

const computeScoreBuckets = (apps) => {
  const buckets = [
    { id: '4.5-5.0', label: '4.5-5.0', min: 4.5, max: 5.01, count: 0 },
    { id: '4.0-4.4', label: '4.0-4.4', min: 4.0, max: 4.5, count: 0 },
    { id: '3.5-3.9', label: '3.5-3.9', min: 3.5, max: 4.0, count: 0 },
    { id: '3.0-3.4', label: '3.0-3.4', min: 3.0, max: 3.5, count: 0 },
    { id: '<3.0', label: '<3.0', min: Number.NEGATIVE_INFINITY, max: 3.0, count: 0 },
    { id: 'unscored', label: 'Unscored', min: null, max: null, count: 0 },
  ];

  for (const app of apps) {
    if (typeof app.score !== 'number' || !Number.isFinite(app.score)) {
      buckets.find((bucket) => bucket.id === 'unscored').count += 1;
      continue;
    }
    const bucket = buckets.find((candidate) => app.score >= candidate.min && app.score < candidate.max);
    if (bucket) bucket.count += 1;
  }

  return buckets.map(({ min, max, ...bucket }) => bucket);
};

const toIsoWeek = (dateString) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const target = new Date(date.valueOf());
  const dayNumber = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const computeWeeklyActivity = (apps) => {
  const counts = countBy(apps, (app) => toIsoWeek(app.date));
  return Object.entries(counts)
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));
};

const computeMetrics = (apps) => {
  const statusBreakdown = countBy(apps, (app) => app.statusKey);
  const applied = apps.filter((app) => ['applied', 'responded', 'interview', 'offer'].includes(app.statusKey)).length;
  const responded = apps.filter((app) => ['responded', 'interview', 'offer'].includes(app.statusKey)).length;
  const interviews = apps.filter((app) => ['interview', 'offer'].includes(app.statusKey)).length;
  const offers = apps.filter((app) => app.statusKey === 'offer').length;
  const avg = averageScore(apps);
  const scored = apps.filter((app) => typeof app.score === 'number' && Number.isFinite(app.score));
  const topScore = scored.length ? Math.max(...scored.map((app) => app.score)) : 0;

  return {
    total: apps.length,
    active: apps.filter((app) => ACTIVE_STATUSES.has(app.statusKey)).length,
    actionable: apps.filter((app) => !INACTIVE_STATUSES.has(app.statusKey)).length,
    evaluated: statusBreakdown.evaluated || 0,
    topFits: apps.filter((app) => typeof app.score === 'number' && app.score >= 4).length,
    avgScore: Number(avg.toFixed(2)),
    topScore,
    withPdf: apps.filter((app) => app.pdf).length,
    statusBreakdown,
    statusGroups: STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status] || status,
      count: statusBreakdown[status] || 0,
    })),
    funnel: FUNNEL_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: statusBreakdown[status] || 0,
      pct: apps.length ? Number((((statusBreakdown[status] || 0) / apps.length) * 100).toFixed(1)) : 0,
    })),
    scoreBuckets: computeScoreBuckets(apps),
    weeklyActivity: computeWeeklyActivity(apps),
    rates: {
      response: applied ? Number(((responded / applied) * 100).toFixed(1)) : 0,
      interview: applied ? Number(((interviews / applied) * 100).toFixed(1)) : 0,
      offer: applied ? Number(((offers / applied) * 100).toFixed(1)) : 0,
    },
  };
};

const buildDashboardPayload = () => {
  const applications = parseApplications();
  const metrics = computeMetrics(applications);
  const topCandidates = applications
    .filter((app) => typeof app.score === 'number' && app.score >= 4 && !INACTIVE_STATUSES.has(app.statusKey))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8);

  const nextActions = applications
    .filter((app) => ['interview', 'applied', 'responded', 'evaluated'].includes(app.statusKey))
    .sort((a, b) => {
      const statusRank = { interview: 0, responded: 1, applied: 2, evaluated: 3 };
      const rankDiff = statusRank[a.statusKey] - statusRank[b.statusKey];
      if (rankDiff !== 0) return rankDiff;
      return (b.score || 0) - (a.score || 0);
    })
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    applications,
    topCandidates,
    nextActions,
  };
};

const parsePipelineItems = () => {
  const content = readText(PIPELINE_FILE);
  const items = [];

  for (const line of content.split('\n')) {
    const match = line.match(/^-\s+\[( |x|X)\]\s+(.+)$/);
    if (!match) continue;

    const completed = match[1].toLowerCase() === 'x';
    const parts = match[2].split('|').map((part) => part.trim());
    const leading = parts[0] || '';
    const idOnlyMatch = leading.match(/^#?(\d+)/);
    const firstUrlIndex = parts.findIndex((part) => /^https?:\/\//.test(part));
    const urlIndex = firstUrlIndex >= 0 ? firstUrlIndex : 0;
    const urlMatch = parts[urlIndex]?.match(/https?:\/\/\S+/);
    const companyIndex = urlIndex + 1;
    const roleIndex = urlIndex + 2;

    items.push({
      completed,
      id: idOnlyMatch?.[1] || '',
      url: urlMatch?.[0] || '',
      company: parts[companyIndex] || '',
      role: parts[roleIndex] || '',
      score: parts.find((part) => /\d+\.?\d*\/5/.test(part)) || '',
      pdf: parts.some((part) => part.includes('PDF') && part.includes('✅')),
      raw: line.trim(),
    });
  }

  return items;
};

const parseScanHistory = () => {
  const content = readText(SCAN_HISTORY_FILE);
  const entries = [];

  for (const line of content.split('\n')) {
    const fields = line.split('\t');
    if (fields.length < 6 || fields[0] === 'url') continue;
    const [url, firstSeen, portal, title, company, status] = fields;
    entries.push({ url, firstSeen, portal, title, company, status });
  }

  return entries;
};

const pipelineLineForScan = ({ url, company, title }) => {
  const safeUrl = String(url || '').trim();
  const safeCompany = sanitizeTrackerCell(company || 'Unknown company');
  const safeTitle = sanitizeTrackerCell(title || 'Unknown role');
  return `- [ ] ${safeUrl} | ${safeCompany} | ${safeTitle}`;
};

const appendPipelineScanItem = ({ url, company, title }) => {
  const safeUrl = String(url || '').trim();
  if (!/^https?:\/\//.test(safeUrl)) {
    const err = new Error('A valid job URL is required');
    err.statusCode = 400;
    throw err;
  }

  const existing = parsePipelineItems().find((item) => item.url === safeUrl);
  if (existing) {
    return { added: false, duplicate: true, line: existing.raw };
  }

  const line = pipelineLineForScan({ url: safeUrl, company, title });
  const current = readText(PIPELINE_FILE);
  const separator = current.endsWith('\n') || current.length === 0 ? '' : '\n';
  fs.writeFileSync(PIPELINE_FILE, `${current}${separator}${line}\n`, 'utf8');
  return { added: true, duplicate: false, line };
};

const runJsonScript = (scriptName, args = []) => {
  try {
    const output = execFileSync(process.execPath, [scriptName, ...args], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 12000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, data: JSON.parse(output) };
  } catch (err) {
    return {
      ok: false,
      error: err.stderr?.toString().trim() || err.message,
    };
  }
};

const buildOperationsPayload = () => {
  const pipelineItems = parsePipelineItems();
  const pendingPipeline = pipelineItems.filter((item) => !item.completed);
  const completedPipeline = pipelineItems.filter((item) => item.completed);
  const applications = parseApplications();
  const scans = parseScanHistory();
  const scansByUrl = new Map(scans.map((entry) => [entry.url, entry]));
  const applicationsByNumber = new Map(applications.map((app) => [String(app.number).padStart(3, '0'), app]));
  const applicationsByCompanyRole = new Map(applications.map((app) => [
    `${normalizeTextKey(app.company)}::${normalizeTextKey(app.role)}`,
    app,
  ]));
  const scanStatusCounts = countBy(scans, (entry) => entry.status || 'unknown');
  const recentScans = scans.slice(-12).reverse();
  const followups = runJsonScript('followup-cadence.mjs');
  const patterns = runJsonScript('analyze-patterns.mjs', ['--min-threshold', '3']);
  const nextPipeline = pendingPipeline.slice(0, 10).map((item) => {
    const scanMatch = scansByUrl.get(item.url);
    return {
      ...item,
      firstSeen: scanMatch?.firstSeen || '',
      portal: scanMatch?.portal || '',
      scanStatus: scanMatch?.status || '',
      scanTitle: scanMatch?.title || '',
      readiness: item.url && item.company && item.role ? 'Ready to evaluate' : 'Needs review',
    };
  });
  const recentCompleted = completedPipeline.slice(0, 8).map((item) => {
    const appMatch = applicationsByNumber.get(String(item.id).padStart(3, '0')) ||
      applicationsByCompanyRole.get(`${normalizeTextKey(item.company)}::${normalizeTextKey(item.role)}`);
    return {
      ...item,
      status: appMatch?.statusLabel || appMatch?.status || '',
      notes: appMatch?.notes || '',
      reportFilename: appMatch?.reportFilename || '',
      jobUrl: appMatch?.jobUrl || item.url,
      applicationDate: appMatch?.date || '',
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    files: {
      pipelineExists: fs.existsSync(PIPELINE_FILE),
      followupsExists: fs.existsSync(FOLLOWUPS_FILE),
      scanHistoryExists: fs.existsSync(SCAN_HISTORY_FILE),
    },
    pipeline: {
      total: pipelineItems.length,
      pending: pendingPipeline.length,
      completed: completedPipeline.length,
      pdfReady: completedPipeline.filter((item) => item.pdf).length,
      next: nextPipeline,
      recentCompleted,
    },
    scan: {
      total: scans.length,
      added: scanStatusCounts.added || 0,
      skippedExpired: scanStatusCounts.skipped_expired || 0,
      skippedTitle: scanStatusCounts.skipped_title || 0,
      skippedDuplicate: scanStatusCounts.skipped_dup || 0,
      uncertain: scanStatusCounts.skipped_uncertain || 0,
      statusCounts: scanStatusCounts,
      recent: recentScans.map((entry) => {
        const pipelineMatch = pipelineItems.find((item) => item.url === entry.url);
        return {
          ...entry,
          inPipeline: Boolean(pipelineMatch),
          pipelineState: pipelineMatch ? (pipelineMatch.completed ? 'processed' : 'queued') : 'new',
        };
      }),
    },
    followups: followups.ok ? followups.data : { error: followups.error },
    patterns: patterns.ok ? patterns.data : { error: patterns.error },
  };
};

const canonicalStatusFromInput = (input = '') => {
  const normalized = normalizeStatus(input);
  return STATUS_LABELS[normalized] ? STATUS_LABELS[normalized] : '';
};

const sanitizeTrackerCell = (value = '') => String(value)
  .replace(/\r?\n/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\|/g, '/')
  .trim();

const updateApplicationTrackerRow = ({ id, status, notes }) => {
  if (!fs.existsSync(APPS_FILE)) {
    throw new Error('applications.md not found');
  }

  const canonicalStatus = canonicalStatusFromInput(status);
  if (!canonicalStatus) {
    const allowed = Object.values(STATUS_LABELS).join(', ');
    const err = new Error(`Invalid status. Use one of: ${allowed}`);
    err.statusCode = 400;
    throw err;
  }

  const sanitizedNotes = sanitizeTrackerCell(notes).slice(0, 1200);
  const content = fs.readFileSync(APPS_FILE, 'utf8');
  const lines = content.split('\n');
  let updated = false;

  const nextLines = lines.map((line) => {
    if (!line.trim().startsWith('|')) return line;

    const fields = line.split('|').map((field) => field.trim()).filter(Boolean);
    if (fields.length < 8 || fields[0] !== String(id)) return line;

    while (fields.length < 9) fields.push('');
    fields[5] = canonicalStatus;
    fields[8] = sanitizedNotes;
    updated = true;
    return `| ${fields.join(' | ')} |`;
  });

  if (!updated) {
    const err = new Error(`Application #${id} not found`);
    err.statusCode = 404;
    throw err;
  }

  fs.writeFileSync(APPS_FILE, nextLines.join('\n'), 'utf8');
};

app.get('/api/applications', (req, res) => {
  try {
    res.json(parseApplications());
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse applications', detail: err.message });
  }
});

app.get('/api/metrics', (req, res) => {
  try {
    res.json(computeMetrics(parseApplications()));
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute metrics', detail: err.message });
  }
});

app.get('/api/dashboard', (req, res) => {
  try {
    res.json(buildDashboardPayload());
  } catch (err) {
    res.status(500).json({ error: 'Failed to build dashboard', detail: err.message });
  }
});

app.patch('/api/applications/:id', (req, res) => {
  try {
    updateApplicationTrackerRow({
      id: req.params.id,
      status: req.body?.status,
      notes: req.body?.notes || '',
    });
    res.json(buildDashboardPayload());
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: 'Failed to update application', detail: err.message });
  }
});

app.get('/api/status-options', (req, res) => {
  res.json(STATUS_OPTIONS);
});

app.get('/api/operations', (req, res) => {
  try {
    res.json(buildOperationsPayload());
  } catch (err) {
    res.status(500).json({ error: 'Failed to build operations payload', detail: err.message });
  }
});

app.post('/api/pipeline/promote', (req, res) => {
  try {
    const result = appendPipelineScanItem({
      url: req.body?.url,
      company: req.body?.company,
      title: req.body?.title,
    });
    res.json({ result, operations: buildOperationsPayload() });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: 'Failed to promote scan item', detail: err.message });
  }
});

app.get('/api/reports/:filename', (req, res) => {
  try {
    const filePath = resolveReportPath(req.params.filename);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.type('text/markdown').send(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read report', detail: err.message });
  }
});

if (fs.existsSync(CLIENT_DIST_DIR)) {
  app.use(express.static(CLIENT_DIST_DIR));

  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST_DIR, 'index.html'));
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Career-Ops Backend running on http://0.0.0.0:${PORT}`);
});

// Keep the backend resident in environments where server handles can be unref'd.
const keepAlive = setInterval(() => {}, 60_000);

const shutdown = () => {
  clearInterval(keepAlive);
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
