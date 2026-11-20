export const meta = {
  name: 'build-execute',
  description: 'The middle of /orc:build: implementation waves with per-wave focused verification and commit, acceptance tests and their proofs, then review with one finding-verifier per finding. Launched by the build skill with the planned waves as args; returns done, question or gate.',
  phases: [
    { title: 'waves', detail: 'implementers per wave (test-writer alongside wave 1), then wave-integrator verifies, commits and pushes' },
    { title: 'tests', detail: 'test-prover runs, proves and finalizes the acceptance tests, gap-fill rounds, the tests commit, and the diff file' },
    { title: 'review', detail: 'review agents and deploy-risk-scanner over the diff file, then one finding-verifier per BLOCKER or WARNING' },
  ],
};

// ---------------------------------------------------------------------------
// Args — every key is read here, once. `answers` is only ever used to look up
// the answer for a specific question id (replay safety, Decision 1).
// ---------------------------------------------------------------------------
const {
  number, title, branch, pluginRoot, pr: argPr, pushed, dryRun, path, spec,
  decisionsPath, focused, mutation, testInfo, testWriter, testFiles, mockups,
  waves, answers,
} = args;

// Mirrors the middle rows of build/SKILL.md's Paths table.
const PATHS = {
  S: {
    reviewers: ['orc:review-correctness', 'orc:review-quality'],
    coverage: false,
    breaks: null,
    gapFillRounds: 0,
  },
  M: {
    reviewers: ['orc:review-correctness', 'orc:review-quality', 'orc:review-security', 'orc:review-impact'],
    coverage: true,
    breaks: { scope: 'Key Logic functions', max: 3 },
    gapFillRounds: 1,
  },
  L: {
    reviewers: ['orc:review-correctness', 'orc:review-quality', 'orc:review-security', 'orc:review-impact'],
    coverage: true,
    breaks: { scope: 'every changed function with logic', max: 5 },
    gapFillRounds: 2,
  },
};

const CLOSING = 'Return your result through the structured output. Put the full markdown your agent definition\'s Output section describes in `report`.';

// ---------------------------------------------------------------------------
// Schemas — one per agent result, each with `report`.
// ---------------------------------------------------------------------------
function obj(properties, required) {
  return { type: 'object', properties, required: required || Object.keys(properties) };
}
function nullable(schema) {
  const type = Array.isArray(schema.type) ? schema.type : [schema.type];
  return Object.assign({}, schema, { type: type.concat('null') });
}
function oneOf(...values) {
  return { type: 'string', enum: values };
}
const STR = { type: 'string' };
const BOOL = { type: 'boolean' };
const INT = { type: 'integer' };
const STRS = { type: 'array', items: STR };
const arrayOf = (items) => ({ type: 'array', items });

const DECISION = obj({
  decision: STR,
  options: STR,
  chose: STR,
  confidence: oneOf('high', 'medium', 'low'),
  why: STR,
});
const QUESTION = nullable(obj({ text: STR, options: STRS, blocksLaterWork: BOOL }));

const IMPLEMENTER_SCHEMA = obj({
  status: oneOf('done', 'stopped'),
  files: STRS,
  decisions: arrayOf(DECISION),
  question: QUESTION,
  report: STR,
});

const TEST_WRITER_SCHEMA = obj({
  status: oneOf('written', 'nothing', 'stopped'),
  files: STRS,
  behaviors: arrayOf(obj({
    behavior: STR,
    test: nullable(STR),
    catches: nullable(STR),
    guardsExisting: BOOL,
    reason: nullable(STR),
  })),
  gaps: arrayOf(obj({
    target: STR,
    test: nullable(STR),
    outcome: oneOf('test', 'no-effect', 'question'),
    note: STR,
  })),
  runWith: STR,
  assumptions: STRS,
  question: QUESTION,
  report: STR,
});

const INTEGRATOR_SCHEMA = obj({
  status: oneOf('ok', 'verify-failed', 'error'),
  mode: oneOf('wave', 'commit', 'diff', 'restore'),
  commit: nullable(obj({ sha: STR, message: STR })),
  pr: nullable(INT),
  verify: nullable(obj({ command: STR, passed: BOOL, output: STR })),
  headSha: nullable(STR),
  diffPath: nullable(STR),
  gitStatus: nullable(STR),
  unexpected: STRS,
  notRun: arrayOf(obj({ command: STR, reason: STR })),
  report: STR,
});

const PROVER_SCHEMA = obj({
  status: oneOf('ok', 'impl-failures', 'unclassifiable', 'error'),
  mode: oneOf('run', 'prove', 'finalize'),
  testFixes: arrayOf(obj({ file: STR, change: STR, reason: STR })),
  implFailures: arrayOf(obj({ taskId: STR, test: STR, output: STR })),
  redOnBase: arrayOf(obj({
    test: STR,
    failedOnBase: BOOL,
    onAssertion: BOOL,
    action: oneOf('kept', 'rewritten', 'deleted'),
  })),
  unmapped: STRS,
  uncoveredLines: STRS,
  breaks: obj({
    planted: INT,
    caught: INT,
    equivalent: INT,
    open: arrayOf(obj({ file: STR, fn: STR, mutation: STR })),
  }),
  mutationUnmeasured: nullable(STR),
  deleted: arrayOf(obj({ test: STR, pattern: STR })),
  criteria: arrayOf(obj({
    criterion: STR,
    status: oneOf('met', 'not_met', 'not_run'),
    proof: STR,
  })),
  testFiles: STRS,
  decisions: arrayOf(DECISION),
  question: nullable(STR),
  report: STR,
});

const REVIEW_SCHEMA = obj({
  status: oneOf('PASS', 'WARNING', 'BLOCK'),
  findings: arrayOf(obj({
    severity: oneOf('BLOCKER', 'WARNING', 'NOTE'),
    title: STR,
    file: nullable(STR),
    line: nullable(INT),
    detail: STR,
  })),
  report: STR,
});

const DEPLOY_SCHEMA = obj({
  needsNotes: BOOL,
  destructive: nullable(STR),
  notes: STR,
  report: STR,
});

const VERIFIER_SCHEMA = obj({
  verdict: oneOf('CONFIRMED', 'REFUTED', 'UNCERTAIN'),
  severity: oneOf('BLOCKER', 'WARNING'),
  evidence: STR,
  report: STR,
});

// ---------------------------------------------------------------------------
// State — everything below is derived from args and agent results only, so a
// relaunch with the same args replays to the same point.
// ---------------------------------------------------------------------------
const P = PATHS[path] || PATHS.L;
const GH = `${pluginRoot}/scripts/gh-rest`;
const DIFF_PATH = `.orc/tmp/${number}-diff.patch`;
const allWaves = waves || [];
const allTasks = [].concat(...allWaves);
const ownedTestFiles = testFiles || [];

let phaseName = 'waves';
let pr = argPr == null ? null : argPr;
let pushedInRun = false;
let headSha = null;
let diffPath = DIFF_PATH;
let deploy = null;
const commits = [];
const decisions = [];
// Decisions of the wave in progress: written by wave-integrator only on a pass,
// so a gate before that must carry them (Decision 23).
let pendingWave = () => [];
const notRun = [];
const findings = [];
let criteria = [];

// tests
let tw = null;
let writtenTests = [];
let runWith = null;
let added = 0;
let redOnBase = [];
let unmapped = [];
let uncoveredLines = [];
let breaks = { planted: 0, caught: 0, equivalent: 0, open: [] };
let mutationUnmeasured = null;
const testFixes = [];
let deleted = [];
let finalTestFiles = [];

const resolvedAnswers = [];
const slotsById = {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function list(items, fmt) {
  const xs = (items || []).map(fmt || ((x) => String(x)));
  return xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- none';
}

function union(...lists) {
  const seen = [];
  for (const l of lists) for (const x of l || []) if (!seen.includes(x)) seen.push(x);
  return seen;
}

function tail(text, n) {
  const s = String(text == null ? '' : text);
  return s.length > n ? '…' + s.slice(s.length - n) : s;
}

function fmtDecision(d) {
  const where = d.taskId ? `task ${d.taskId}: ` : '';
  return `${where}${d.decision} — options: ${d.options} — chose ${d.chose} — ${d.confidence} — ${d.why}`;
}

function firstPush() {
  return !pushed && !pushedInRun;
}

function answerFor(id) {
  const hit = (answers || []).find((a) => a && a.id === id);
  return hit ? String(hit.answer) : null;
}

function uncommittedTests() {
  return union(ownedTestFiles, writtenTests);
}

function testsOut() {
  return {
    files: finalTestFiles,
    runWith,
    added,
    redOnBase,
    unmapped,
    uncoveredLines,
    breaks,
    mutationUnmeasured,
    testFixes,
    deleted,
  };
}

// Every result carries exactly these keys, whatever the status.
function out(status, extra) {
  const e = extra || {};
  return {
    status,
    questions: e.questions || [],
    gate: e.gate || null,
    pr,
    headSha,
    commits,
    decisions: status === 'gate' ? decisions.concat(pendingWave()) : decisions,
    tests: testsOut(),
    criteria,
    findings,
    deploy,
    notRun,
  };
}

function agentErrorGate(who, res) {
  const why = res ? tail(res.report, 2000) : 'the agent returned no result (it died or its output failed the schema)';
  return {
    name: 'verify',
    reason: `${who} errored: ${why}`,
    needed: `Find and fix why ${who} errored (environment, credentials, or the cause in its report), then re-run /orc:build ${number}.`,
  };
}

function call(agentType, prompt, label, schema, extra) {
  return agent(
    `${prompt}\n\n${CLOSING}`,
    Object.assign({ label, phase: phaseName, schema, agentType }, extra || {}),
  );
}

// --- implementer -----------------------------------------------------------
function implBase(wi, task) {
  const deps = task.dependsOn && task.dependsOn.length ? task.dependsOn.join(', ') : 'none';
  return [
    `Issue #${number}: ${title}`,
    '',
    'Spec:',
    spec,
    '',
    `Task ${task.id} (wave ${wi + 1} of ${allWaves.length}): ${task.title}`,
    task.description || '',
    `Depends on: ${deps}`,
    '',
    'Owned files (touch nothing else):',
    list(task.files),
    '',
    'Verification (focused only; never run anything listed as CI-only):',
    focused || 'none given',
    '',
    'Mockups:',
    list(mockups),
    '',
    'Test-writer owns these files; do not create or edit them:',
    list(ownedTestFiles),
    '',
    'Answers given earlier in this build:',
    list(resolvedAnswers, (a) => `${a.question} → ${a.answer}`),
    '',
    'Do not stage, commit or push: wave-integrator commits each wave after its focused verification.',
  ].join('\n');
}

function runImplementer(s, extraSection, suffix) {
  const qa = s.qa.map((x) => `Your earlier run stopped with this question: ${x.question}\nAnswer: ${x.answer}`);
  const prompt = [s.base, ...qa, ...(extraSection ? [extraSection] : [])].join('\n\n');
  return call(
    'orc:implementer',
    prompt,
    `implementer w${s.wi} ${s.task.id} r${s.round}${suffix || ''}`,
    IMPLEMENTER_SCHEMA,
    { model: s.task.model },
  );
}

// --- test-writer -----------------------------------------------------------
function testWriterBase() {
  return [
    'Mode: initial',
    `Issue #${number}: ${title}`,
    '',
    'Spec:',
    spec,
    '',
    'Test locations and commands (from CLAUDE.md):',
    testInfo || 'none given',
    '',
    'Owned test files (the only files you may create or modify):',
    list(ownedTestFiles),
    '',
    'Write the tests from the spec alone. The implementation is being written right now in parallel; do not read it.',
  ].join('\n');
}

function runTestWriterInitial(s) {
  const qa = s.qa.map((x) => `Your earlier run stopped with this question: ${x.question}\nAnswer: ${x.answer}`);
  return call('orc:test-writer', [s.base, ...qa].join('\n\n'), `test-writer initial r${s.round}`, TEST_WRITER_SCHEMA);
}

// --- wave-integrator -------------------------------------------------------
function integrate(mode, o, label) {
  const lines = [
    `Mode: ${mode}`,
    `Issue: #${number} — ${title}`,
    `Branch: ${branch}`,
    `pr: ${pr == null ? 'none' : pr}`,
    `First push: ${firstPush() ? 'yes — git push --force-with-lease -u origin ' + branch : 'no — plain git push'}`,
    `dryRun: ${dryRun ? 'true — commit locally; skip every push, gh-rest and gh api call, and say in report what each would have sent' : 'false'}`,
    `gh-rest: ${GH}`,
    `Decision record: ${decisionsPath}`,
    '',
  ];
  if (mode === 'wave' || mode === 'commit') {
    lines.push(
      'Files to stage (exactly these, each that changed; never git add . or git add -A; never stage .orc/tmp):',
      list(o.files),
      '',
      'Test-writer files (leave unstaged' + (mode === 'wave' ? ', and exclude them from the focused run' : '') + '):',
      list(o.unstaged),
      '',
    );
    if (mode === 'wave') {
      lines.push(
        'Focused verification rules (scope the run to this wave\'s files):',
        focused || 'none given',
        '',
      );
      if (o.retry) lines.push('This is the second integration of this wave, after the owning implementers fixed a focused-verification failure.', '');
    }
    lines.push(
      `Commit message: ${o.message}`,
      '',
      'Decisions to append to the decision record before upserting it:',
      list(o.decisions, fmtDecision),
      '',
      `Issue title for a new draft PR: ${title}`,
    );
  } else if (mode === 'diff') {
    lines.push(`Diff file: ${DIFF_PATH}`);
  } else if (mode === 'restore') {
    lines.push(
      'Expected paths in git status after the restore (any other path goes in unexpected):',
      list(o.expected),
    );
  }
  return call('orc:wave-integrator', lines.join('\n'), label, INTEGRATOR_SCHEMA);
}

function record(res) {
  if (res.commit) {
    commits.push({ sha: res.commit.sha, message: res.commit.message });
    if (!dryRun) pushedInRun = true;
  }
  if (res.pr != null) pr = res.pr;
  for (const n of res.notRun || []) notRun.push({ command: n.command, reason: n.reason });
}

// Restore the working tree, then build the gate result. The caller returns it.
async function restoreThenGate(gate, waveFiles) {
  const r = await integrate('restore', { expected: union(uncommittedTests(), waveFiles) }, 'wave-integrator restore');
  let reason = gate.reason;
  if (!r || r.status === 'error') {
    reason += `\n\nRestoring the working tree also failed: ${r ? tail(r.report, 800) : 'no result'}. Check git status before the gate commit.`;
  } else if (r.unexpected && r.unexpected.length) {
    reason += `\n\nUnexpected paths left in the working tree (not staged): ${r.unexpected.join(', ')}`;
  }
  return out('gate', { gate: { name: gate.name, reason, needed: gate.needed } });
}

// --- test-prover -----------------------------------------------------------
function proverPrompt(mode, body) {
  return [
    `Mode: ${mode}`,
    `Issue: #${number} — ${title}`,
    `Path: ${path}`,
    '',
    'Spec:',
    spec,
    '',
    'Test locations and commands (from CLAUDE.md):',
    testInfo || 'none — this repo has no test framework',
    '',
    'Focused verification rules:',
    focused || 'none given',
    '',
    `Run with: ${runWith || 'none'}`,
    '',
    'Task → files map (owner for implFailures):',
    list(allTasks, (t) => `${t.id}: ${(t.files || []).join(', ')}`),
    '',
    'Test-writer behaviors:',
    list(tw ? tw.behaviors : [], (b) => `${b.behavior} → ${b.test || 'not tested — ' + (b.reason || 'no reason given')}${b.catches ? ' — catches: ' + b.catches : ''}${b.guardsExisting ? ' — guards existing' : ''}`),
    '',
    'Test-writer assumptions:',
    list(tw ? tw.assumptions : []),
    '',
    `Decision record: ${decisionsPath}`,
    'Never commit or push. Leave every implementation file at HEAD when you finish.',
    '',
    ...body,
  ].join('\n');
}

function runProver(mode, body, label) {
  return call('orc:test-prover', proverPrompt(mode, body), label, PROVER_SCHEMA);
}

function proveBody(tests, gaps) {
  const body = [
    'Tests to prove:',
    list(tests),
    '',
    `Coverage: ${P.coverage ? 'on — changed lines only, with an already set-up tool' : 'off'}`,
    `Breaks: ${P.breaks ? P.breaks.scope + ', up to ' + P.breaks.max + ' per function' : 'none on this path'}`,
    `Mutation command: ${mutation || 'none — plant breaks by hand'}`,
  ];
  if (gaps) {
    body.push(
      '',
      'These tests were written by gap-fill. Re-plant only the open breaks below (do not plant new ones; report planted as the number re-planted), and report in unmapped, uncoveredLines and breaks.open only the gaps still open with the full test set:',
      list(gaps.breaks, (b) => `${b.file} ${b.fn}: ${b.mutation}`),
      'Unmapped behaviors:',
      list(gaps.unmapped),
      'Uncovered changed lines:',
      list(gaps.uncoveredLines),
      'Test-writer gap outcomes:',
      list(gaps.outcomes, (g) => `${g.target} → ${g.outcome}${g.test ? ' ' + g.test : ''} — ${g.note}`),
    );
  }
  return body;
}

function proverGate(res, who, mode) {
  if (!res || res.status === 'error') return agentErrorGate(who, res);
  if (res.status === 'unclassifiable') {
    return {
      name: 'ambiguity',
      reason: `${who} found a test failure the spec can't classify: ${res.question || tail(res.report, 1500)}`,
      needed: `Answer whether the test or the implementation follows the spec (and update the spec if it is silent), then re-run /orc:build ${number}.`,
    };
  }
  if (res.status === 'impl-failures' && mode !== 'run') {
    return {
      name: 'verify',
      reason: `${who} reported implementation failures: ${res.implFailures.map((f) => `${f.taskId} ${f.test}`).join('; ')}`,
      needed: 'Make the implementation satisfy the failing tests, then re-run /orc:build ' + number + '.',
    };
  }
  return null;
}

function absorbProver(res) {
  for (const f of res.testFixes || []) testFixes.push({ file: f.file, change: f.change, reason: f.reason });
  for (const d of res.decisions || []) decisions.push(Object.assign({}, d, { source: 'test-prover' }));
}

function reviewPrompt(agentType) {
  return [
    `Review the change for issue #${number}: ${title}.`,
    '',
    'Spec:',
    spec,
    '',
    `Decision record: read ${decisionsPath} in full.`,
    `Diff: read ${diffPath} in full — it is git diff origin/main...HEAD. If it is large, page through it with Read's offset/limit until you have read all of it. Do not echo the diff back.`,
    'Use nothing from the build conversation; review with fresh eyes.',
    agentType === 'orc:deploy-risk-scanner' ? '' : 'Give every finding a severity: BLOCKER, WARNING or NOTE.',
  ].join('\n');
}

function verifierPrompt(f) {
  return [
    `Verify one finding raised by ${f.agent} for issue #${number}: ${title}.`,
    '',
    `Finding (${f.severity}): ${f.title}`,
    `Where: ${f.file || 'unspecified'}${f.line != null ? ':' + f.line : ''}`,
    `Detail: ${f.detail}`,
    '',
    'Spec:',
    spec,
    '',
    `Decision record: read ${decisionsPath} in full.`,
    `Diff: read ${diffPath} in full — it is git diff origin/main...HEAD. If it is large, page through it with Read's offset/limit until you have read all of it. Do not echo the diff back.`,
    'Use nothing from the build conversation.',
  ].join('\n');
}

// ===========================================================================
// Phase 1 — waves
// ===========================================================================
phase('waves');
phaseName = 'waves';

for (let wi = 0; wi < allWaves.length; wi++) {
  const wave = allWaves[wi];
  const slots = wave.map((task) => ({ wi, task, base: implBase(wi, task), round: 0, qa: [], result: null, decisions: [] }));
  for (const s of slots) slotsById[s.task.id] = s;
  const twSlot = wi === 0 && testWriter ? { base: testWriterBase(), round: 0, qa: [], result: null } : null;
  const waveFiles = union(...wave.map((t) => t.files));
  pendingWave = () => [].concat(...slots.map((s) => (s.decisions.length
    ? s.decisions
    : ((s.result && s.result.decisions) || []).map((d) => Object.assign({}, d, { taskId: s.task.id })))))
    .map((d) => Object.assign({}, d, { source: 'implementer' }));

  log(`wave ${wi + 1}/${allWaves.length}: ${wave.map((t) => t.id).join(', ')}`);
  const first = await parallel([
    ...slots.map((s) => () => runImplementer(s)),
    ...(twSlot ? [() => runTestWriterInitial(twSlot)] : []),
  ]);
  slots.forEach((s, i) => { s.result = first[i]; });
  if (twSlot) twSlot.result = first[slots.length];

  // Stopped tasks: let the wave finish, ask before integrating, re-dispatch only the stopped ones.
  let deadAgent = null;
  for (;;) {
    const dead = slots.find((s) => !s.result);
    if (dead) { deadAgent = `implementer (task ${dead.task.id})`; break; }
    if (twSlot && !twSlot.result) { deadAgent = 'test-writer'; break; }

    const stopped = slots.filter((s) => s.result.status === 'stopped');
    const twStopped = !!(twSlot && twSlot.result.status === 'stopped');
    if (!stopped.length && !twStopped) break;

    const questions = [];
    const ready = [];
    for (const s of stopped) {
      const q = s.result.question || { text: tail(s.result.report, 1500), options: [], blocksLaterWork: true };
      const id = `w${wi}-${s.task.id}-r${s.round}`;
      const a = answerFor(id);
      if (a === null) {
        questions.push({ id, source: 'implementer', taskId: s.task.id, text: q.text, options: q.options, blocksLaterWork: q.blocksLaterWork });
      } else {
        ready.push({ s, q, a });
      }
    }
    let twReady = null;
    if (twStopped) {
      const q = twSlot.result.question || { text: tail(twSlot.result.report, 1500), options: [], blocksLaterWork: true };
      const id = `tw-r${twSlot.round}`;
      const a = answerFor(id);
      if (a === null) {
        questions.push({ id, source: 'test-writer', taskId: null, text: q.text, options: q.options, blocksLaterWork: q.blocksLaterWork });
      } else {
        twReady = { q, a };
      }
    }
    if (questions.length) return out('question', { questions });

    for (const r of ready) {
      r.s.qa.push({ question: r.q.text, answer: r.a });
      r.s.round += 1;
      resolvedAnswers.push({ question: r.q.text, answer: r.a });
    }
    if (twReady) {
      twSlot.qa.push({ question: twReady.q.text, answer: twReady.a });
      twSlot.round += 1;
      resolvedAnswers.push({ question: twReady.q.text, answer: twReady.a });
    }
    const again = await parallel([
      ...ready.map((r) => () => runImplementer(r.s)),
      ...(twReady ? [() => runTestWriterInitial(twSlot)] : []),
    ]);
    ready.forEach((r, i) => { r.s.result = again[i]; });
    if (twReady) twSlot.result = again[ready.length];
  }
  if (deadAgent) return await restoreThenGate(agentErrorGate(deadAgent, null), waveFiles);

  for (const s of slots) for (const d of s.result.decisions || []) s.decisions.push(Object.assign({}, d, { taskId: s.task.id }));
  if (twSlot) {
    tw = twSlot.result;
    writtenTests = union(writtenTests, tw.files);
  }

  const message = `feat(#${number}): ${wave.map((t) => t.title).join('; ')}`;
  const waveDecisions = () => [].concat(...slots.map((s) => s.decisions));
  let integ = await integrate(
    'wave',
    { files: waveFiles, unstaged: uncommittedTests(), message, decisions: waveDecisions() },
    `wave-integrator w${wi}`,
  );
  if (!integ || integ.status === 'error') return await restoreThenGate(agentErrorGate('wave-integrator', integ), waveFiles);

  if (integ.status === 'verify-failed') {
    // Decision 13: back to the owning implementer(s) once, then gate: verify.
    const v = integ.verify || { command: 'focused verification', output: integ.report };
    const hay = `${v.command}\n${v.output}`;
    const hit = slots.filter((s) => (s.task.files || []).some((f) => hay.includes(f)));
    const owners = hit.length ? hit : slots;
    const fixSection = [
      'Focused verification failed after your wave. Your earlier changes are in the working tree; fix them so this passes, inside your owned files only.',
      `Command: ${v.command}`,
      'Output:',
      tail(v.output, 4000),
    ].join('\n');
    const fixes = await parallel(owners.map((s) => () => runImplementer(s, fixSection, ' verify-fix')));
    for (let i = 0; i < owners.length; i++) {
      const r = fixes[i];
      if (!r) return await restoreThenGate(agentErrorGate(`implementer (task ${owners[i].task.id})`, null), waveFiles);
      if (r.status === 'stopped') {
        return out('gate', { gate: {
          name: 'verify',
          reason: `${v.command} failed and task ${owners[i].task.id}'s implementer stopped instead of fixing it: ${r.question ? r.question.text : tail(r.report, 1500)}\n\nOutput:\n${tail(v.output, 2000)}`,
          needed: `Make ${v.command} pass (or answer the implementer's question in the spec), then re-run /orc:build ${number}.`,
        } });
      }
      owners[i].result = r;
      for (const d of r.decisions || []) owners[i].decisions.push(Object.assign({}, d, { taskId: owners[i].task.id }));
    }
    integ = await integrate(
      'wave',
      { files: waveFiles, unstaged: uncommittedTests(), message, decisions: waveDecisions(), retry: true },
      `wave-integrator w${wi} retry`,
    );
    if (!integ || integ.status === 'error') return await restoreThenGate(agentErrorGate('wave-integrator', integ), waveFiles);
    if (integ.status === 'verify-failed') {
      const v2 = integ.verify || { command: 'focused verification', output: integ.report };
      return out('gate', { gate: {
        name: 'verify',
        reason: `${v2.command} failed after wave ${wi + 1}, twice (the owning implementers had one fix attempt).\n\nOutput:\n${tail(v2.output, 2000)}`,
        needed: `Make ${v2.command} pass for wave ${wi + 1}'s files, then re-run /orc:build ${number}.`,
      } });
    }
  }
  record(integ);
  pendingWave = () => [];
}

// ===========================================================================
// Phase 2 — tests
// ===========================================================================
phase('tests');
phaseName = 'tests';

const haveTests = !!(testWriter && tw && tw.status === 'written' && tw.files.length);

if (haveTests) {
  runWith = tw.runWith || null;

  // 1. Run, then the implementation-fix loop (at most 2 rounds).
  for (let round = 0; ; round++) {
    const res = await runProver('run', ['Tests to run:', list(tw.files)], `test-prover run r${round}`);
    const g = proverGate(res, 'test-prover (run)', 'run');
    if (g) { if (res) absorbProver(res); return await restoreThenGate(g); }
    absorbProver(res);
    if (res.status !== 'impl-failures') break;
    if (round >= 2) {
      return await restoreThenGate({
        name: 'verify',
        reason: `Acceptance tests still fail on the implementation after 2 fix rounds:\n${res.implFailures.map((f) => `- ${f.taskId} ${f.test}: ${tail(f.output, 400)}`).join('\n')}`,
        needed: `Make the implementation satisfy the failing tests (or fix the spec if the tests read it wrongly), then re-run /orc:build ${number}.`,
      });
    }
    const byTask = [];
    for (const f of res.implFailures) {
      let e = byTask.find((x) => x.taskId === f.taskId);
      if (!e) { e = { taskId: f.taskId, failures: [] }; byTask.push(e); }
      e.failures.push(f);
    }
    let fixFiles = [];
    const fixDecisions = [];
    for (const e of byTask) {
      const s = slotsById[e.taskId];
      if (!s) {
        return await restoreThenGate({
          name: 'verify',
          reason: `test-prover blamed task '${e.taskId}', which is not in the task list: ${e.failures.map((f) => f.test).join(', ')}`,
          needed: `Make the failing tests pass, then re-run /orc:build ${number}.`,
        });
      }
      const section = [
        'Acceptance tests fail against your task\'s implementation. Fix the implementation inside your owned files; do not edit the tests.',
        ...e.failures.map((f) => `Test: ${f.test}\nOutput:\n${tail(f.output, 2000)}`),
      ].join('\n\n');
      const r = await runImplementer(s, section, ` test-fix r${round}`);
      if (!r) return await restoreThenGate(agentErrorGate(`implementer (task ${e.taskId})`, null));
      if (r.status === 'stopped') {
        return await restoreThenGate({
          name: 'verify',
          reason: `Task ${e.taskId}'s implementer stopped instead of fixing failing tests: ${r.question ? r.question.text : tail(r.report, 1500)}`,
          needed: `Answer the implementer's question in the spec or fix the failing tests' cause, then re-run /orc:build ${number}.`,
        });
      }
      fixFiles = union(fixFiles, s.task.files);
      for (const d of r.decisions || []) fixDecisions.push(Object.assign({}, d, { taskId: e.taskId }));
    }
    const c = await integrate(
      'commit',
      {
        files: fixFiles,
        unstaged: uncommittedTests(),
        message: `fix(#${number}): ${byTask.map((e) => e.taskId).join(', ')} satisfy acceptance tests`,
        decisions: fixDecisions,
      },
      `wave-integrator test-fix r${round}`,
    );
    if (!c || c.status !== 'ok') return await restoreThenGate(agentErrorGate('wave-integrator (commit)', c));
    record(c);
  }

  // 2. Prove.
  const p = await runProver('prove', proveBody(tw.files, null), 'test-prover prove');
  const pg = proverGate(p, 'test-prover (prove)', 'prove');
  if (pg) { if (p) absorbProver(p); return await restoreThenGate(pg); }
  absorbProver(p);
  added = (tw.behaviors || []).filter((b) => b.test).length;
  redOnBase = redOnBase.concat(p.redOnBase || []);
  unmapped = p.unmapped || [];
  uncoveredLines = p.uncoveredLines || [];
  breaks = p.breaks || breaks;
  mutationUnmeasured = p.mutationUnmeasured || null;

  // 3. Gap-fill rounds.
  for (let g = 0; g < P.gapFillRounds; g++) {
    if (!unmapped.length && !uncoveredLines.length && !breaks.open.length) break;
    const gapPrompt = [
      'Mode: gap-fill',
      `Issue #${number}: ${title}`,
      '',
      'Spec:',
      spec,
      '',
      'Test locations and commands (from CLAUDE.md):',
      testInfo || 'none given',
      '',
      'Owned test files:',
      list(union(ownedTestFiles, writtenTests)),
      '',
      'Surviving breaks:',
      list(breaks.open, (b) => `${b.file} ${b.fn}: ${b.mutation}`),
      'Unmapped behaviors:',
      list(unmapped),
      'Uncovered changed lines:',
      list(uncoveredLines),
    ].join('\n');
    const gf = await call('orc:test-writer', gapPrompt, `test-writer gap-fill r${g}`, TEST_WRITER_SCHEMA);
    if (!gf) return await restoreThenGate(agentErrorGate('test-writer (gap-fill)', null));
    const asked = (gf.gaps || []).filter((x) => x.outcome === 'question');
    for (const x of asked) {
      decisions.push({ decision: `gap left untested: ${x.target}`, options: 'test it · leave it', chose: 'left untested — test-writer asked: ' + x.note, confidence: 'low', why: 'the expected value isn\'t settled by the spec; would test it once the spec settles it', source: 'test-writer' });
    }
    if (gf.question && !asked.length) {
      decisions.push({ decision: `gap-fill question: ${gf.question.text}`, options: (gf.question.options || []).join(' · ') || 'answer · leave open', chose: 'left open — gap stays untested', confidence: 'low', why: 'asked during gap-fill, which never stops the build; answer in /orc:walkthru', source: 'test-writer' });
    }
    if (!gf.files.length) break;
    writtenTests = union(writtenTests, gf.files);
    added += (gf.gaps || []).filter((x) => x.outcome === 'test').length;
    const rp = await runProver(
      'prove',
      proveBody(gf.files, { breaks: breaks.open, unmapped, uncoveredLines, outcomes: gf.gaps || [] }),
      `test-prover prove gap r${g}`,
    );
    const rg = proverGate(rp, 'test-prover (prove)', 'prove');
    if (rg) { if (rp) absorbProver(rp); return await restoreThenGate(rg); }
    absorbProver(rp);
    redOnBase = redOnBase.concat(rp.redOnBase || []);
    unmapped = rp.unmapped || [];
    uncoveredLines = rp.uncoveredLines || [];
    const rb = rp.breaks || { caught: 0, equivalent: 0, open: [] };
    breaks = {
      planted: breaks.planted,
      caught: breaks.caught + rb.caught,
      equivalent: breaks.equivalent + rb.equivalent,
      open: rb.open,
    };
    mutationUnmeasured = rp.mutationUnmeasured || mutationUnmeasured;
  }
}

// 4. Finalize — runs even without test-writer (criteria and [optional] checks).
const fin = await runProver(
  'finalize',
  [
    'Test files to read and finalize:',
    list(haveTests ? writtenTests : []),
    '',
    'Delete any test matching a pattern test-writer forbids and re-check the behaviors it covered. Confirm each [e2e] criterion passed. Run each [optional] criterion\'s command if this environment can, else mark it not_run with the reason. Return criteria for every acceptance criterion, with each criterion field set to the spec\'s criterion text verbatim, including its [e2e] / [optional] marker (the workflow matches on those markers), and testFiles as the final set to commit.',
  ],
  'test-prover finalize',
);
const fg = proverGate(fin, 'test-prover (finalize)', 'finalize');
if (fg) { if (fin) absorbProver(fin); return await restoreThenGate(fg); }
absorbProver(fin);
criteria = (fin.criteria || []).map((c) => ({ criterion: c.criterion, status: c.status, proof: c.proof }));
if (haveTests) {
  deleted = fin.deleted || [];
  finalTestFiles = fin.testFiles || [];
  added = Math.max(0, added - deleted.length);
}

const e2eMissed = criteria.filter((c) => /\[e2e\]/i.test(c.criterion) && !/\[optional\]/i.test(c.criterion) && c.status === 'not_met');
if (e2eMissed.length) {
  return await restoreThenGate({
    name: 'verify',
    reason: `Required [e2e] criteria not met:\n${e2eMissed.map((c) => `- ${c.criterion} — ${c.proof}`).join('\n')}`,
    needed: `Make the implementation meet these criteria end to end, then re-run /orc:build ${number}.`,
  });
}

// 5. Commit the tests.
if (finalTestFiles.length) {
  const c = await integrate(
    'commit',
    { files: finalTestFiles, unstaged: [], message: `test(#${number}): acceptance tests`, decisions: [] },
    'wave-integrator tests',
  );
  if (!c || c.status !== 'ok') return await restoreThenGate(agentErrorGate('wave-integrator (commit)', c));
  record(c);
}

// 6. The diff file the review reads.
const d = await integrate('diff', {}, 'wave-integrator diff');
if (!d || d.status !== 'ok') return await restoreThenGate(agentErrorGate('wave-integrator (diff)', d));
headSha = d.headSha || null;
diffPath = d.diffPath || DIFF_PATH;

// ===========================================================================
// Phase 3 — review
// ===========================================================================
phase('review');
phaseName = 'review';

const reviewAgents = P.reviewers.concat(['orc:deploy-risk-scanner']);
const reviews = await parallel(reviewAgents.map((a) => () => call(
  a,
  reviewPrompt(a),
  `review ${a}`,
  a === 'orc:deploy-risk-scanner' ? DEPLOY_SCHEMA : REVIEW_SCHEMA,
)));
const deadReview = reviewAgents.findIndex((a, i) => !reviews[i]);
if (deadReview !== -1) return out('gate', { gate: agentErrorGate(reviewAgents[deadReview], null) });

const scan = reviews[reviewAgents.length - 1];
deploy = { needsNotes: scan.needsNotes, destructive: scan.destructive, notes: scan.notes };

const raised = [];
P.reviewers.forEach((a, i) => {
  for (const f of reviews[i].findings || []) {
    if (f.severity === 'NOTE') continue;
    raised.push({ agent: a.replace(/^orc:/, ''), severity: f.severity, title: f.title, file: f.file, line: f.line, detail: f.detail });
  }
});

const verdicts = await parallel(raised.map((f, i) => () => call(
  'orc:finding-verifier',
  verifierPrompt(f),
  `finding-verifier ${i + 1}`,
  VERIFIER_SCHEMA,
)));
const deadVerifier = raised.findIndex((f, i) => !verdicts[i]);
if (deadVerifier !== -1) return out('gate', { gate: agentErrorGate(`finding-verifier (${raised[deadVerifier].title})`, null) });

raised.forEach((f, i) => {
  const v = verdicts[i];
  findings.push({
    agent: f.agent,
    severity: v.verdict === 'REFUTED' ? f.severity : v.severity,
    title: f.title,
    file: f.file,
    line: f.line,
    detail: f.detail,
    verdict: v.verdict,
    evidence: v.evidence,
  });
});

// Untested gaps and [optional] failures go to findings without a verifier.
const untested = (b, file, detail) => findings.push({
  agent: 'test-prover', severity: 'WARNING', title: `untested: ${b}`, file, line: null, detail, verdict: 'CONFIRMED', evidence: detail,
});
for (const b of unmapped) untested(b, null, 'No test maps to this behavior after the last gap-fill round.');
for (const l of uncoveredLines) untested(l, null, 'Changed line no test executes after the last gap-fill round.');
for (const b of breaks.open) untested(`${b.fn} — ${b.mutation}`, b.file, 'A planted break no test caught after the last gap-fill round.');
for (const c of criteria) {
  if (/\[optional\]/i.test(c.criterion) && c.status === 'not_met') {
    findings.push({
      agent: 'test-prover', severity: 'WARNING', title: `optional check failed: ${c.criterion}`, file: null, line: null, detail: c.proof, verdict: 'CONFIRMED', evidence: c.proof,
    });
  }
}

return {
  status: 'done',
  questions: [],
  gate: null,
  pr,
  headSha,
  commits,
  decisions,
  tests: testsOut(),
  criteria,
  findings,
  deploy,
  notRun,
};
