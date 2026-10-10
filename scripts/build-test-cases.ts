/**
 * Builds `test-cases.html`, the one self-contained, offline test-case document,
 * from the real Playwright specs.
 *
 *   npx tsx scripts/build-test-cases.ts                     # catalogue only (Actual blank, Not Run)
 *   npx tsx scripts/build-test-cases.ts --results run.json  # fill Actual and Status from a Playwright JSON report
 *   npx tsx scripts/build-test-cases.ts --tag-specs         # prefix every spec title with its TC id (once; idempotent)
 *
 * Nothing here touches the app or the database.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CATEGORIES, buildCatalogue, flattenList, loadIds, type TestCase } from "./lib/test-catalogue";

const ROOT = path.resolve(__dirname, "..");
const TESTS = path.join(ROOT, "tests");
const OUT_HTML = path.join(ROOT, "test-cases.html");
const OUT_JSON = path.join(ROOT, "test-cases", "catalogue.json");

type Result = { status: "Pass" | "Fail" | "Blocked" | "Not Run"; actual: string };

function listTests(): ReturnType<typeof flattenList> {
  const raw = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "test", "--list", "--reporter=json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return flattenList(JSON.parse(raw));
}

/** Playwright JSON report -> result per TC id (matched by the id at the start of the title). */
function readResults(file: string): Map<string, Result> {
  const out = new Map<string, Result>();
  type Spec = { title: string; tests: { status: string; results: { status: string; duration: number; error?: { message?: string } }[] }[] };
  type Suite = { suites?: Suite[]; specs?: Spec[] };
  const walk = (s: Suite) => {
    for (const sp of s.specs ?? []) {
      const m = /^\[(TC-[A-Z0-9]+-\d{3})\]/.exec(sp.title);
      if (!m) continue;
      const t = sp.tests[0];
      const r = t?.results[t.results.length - 1];
      if (!t || !r) continue;
      const secs = (r.duration / 1000).toFixed(1);
      if (t.status === "expected" && r.status === "passed") out.set(m[1], { status: "Pass", actual: `Passed in ${secs}s. All checks held.` });
      else if (t.status === "skipped") out.set(m[1], { status: "Blocked", actual: "Skipped by the runner." });
      else {
        const msg = (r.error?.message ?? r.status).replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 4).join(" ").slice(0, 400);
        out.set(m[1], { status: "Fail", actual: `Failed after ${secs}s: ${msg}` });
      }
    }
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of (JSON.parse(fs.readFileSync(file, "utf8")) as { suites: Suite[] }).suites) walk(s);
  return out;
}

/** Prefix every `test("title"` / template title in the specs with `[TC-…]`. Idempotent. */
function tagSpecs(cases: TestCase[]): number {
  let changed = 0;
  const byFile = new Map<string, TestCase[]>();
  for (const c of cases) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c]);
  for (const [file, list] of byFile) {
    // A line that produces several tests (a loop) is named at run time by tests/case-id.ts instead.
    const perLine = new Map<number, number>();
    for (const c of list) perLine.set(c.line, (perLine.get(c.line) ?? 0) + 1);
    const full = path.join(TESTS, file);
    const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
    const nl = fs.readFileSync(full, "utf8").includes("\r\n") ? "\r\n" : "\n";
    let touched = false;
    for (const c of list) {
      if ((perLine.get(c.line) ?? 0) > 1) continue;
      const i = c.line - 1;
      const m = /^(\s*test(?:\.only)?\(\s*)(["'`])(?!\[TC-)/.exec(lines[i] ?? "");
      if (!m) continue;
      lines[i] = lines[i].replace(m[0], `${m[1]}${m[2]}[${c.id}] `);
      touched = true;
      changed++;
    }
    if (touched) fs.writeFileSync(full, lines.join(nl));
  }
  return changed;
}

type TraceIn = { phase: string; criterion: string; match?: { module: string; any?: string[] }[]; manual?: string; cases?: string[] };
type TraceOut = { phase: string; criterion: string; cases: string[]; manual?: string };

/** A criterion is covered by the cases of its module(s) whose title mentions one of its keywords (or all of the module's cases when it lists none). */
function resolveTrace(input: TraceIn[], cases: TestCase[]): TraceOut[] {
  return input.map((t) => {
    const ids = new Set<string>(t.cases ?? []);
    for (const m of t.match ?? []) {
      for (const c of cases) {
        if (c.module !== m.module) continue;
        const title = c.title.toLowerCase();
        if (!m.any || m.any.some((k) => title.includes(k.toLowerCase()))) ids.add(c.id);
      }
    }
    return { phase: t.phase, criterion: t.criterion, cases: [...ids].sort(), manual: t.manual };
  });
}

type Slot = string | { module: string; any?: string[] } | { na: string };
type ActionIn = { action: string; happy: Slot | Slot[]; invalid: Slot | Slot[]; unauthorized: Slot | Slot[]; boundary: Slot | Slot[] };
type ActionOut = { action: string; slots: Record<"happy" | "invalid" | "unauthorized" | "boundary", { cases: string[]; na?: string }> };
const SLOTS = ["happy", "invalid", "unauthorized", "boundary"] as const;

/** The coverage floor: every user action needs a happy, an invalid-input, an unauthorized and a boundary case, or a stated reason why one cannot exist. */
function resolveActions(input: ActionIn[], cases: TestCase[]): { out: ActionOut[]; problems: string[] } {
  const byId = new Set(cases.map((c) => c.id));
  const problems: string[] = [];
  const out = input.map((a) => {
    const slots = {} as ActionOut["slots"];
    for (const slot of SLOTS) {
      const raw = a[slot];
      const list = Array.isArray(raw) ? raw : [raw];
      const ids = new Set<string>();
      let na: string | undefined;
      for (const item of list) {
        if (typeof item === "string") {
          const id = `TC-${item}`;
          if (byId.has(id)) ids.add(id);
          else problems.push(`${a.action} / ${slot}: ${id} does not exist`);
        } else if ("na" in item) na = item.na;
        else for (const c of cases) if (c.module === item.module && (!item.any || item.any.some((k) => c.title.toLowerCase().includes(k.toLowerCase())))) ids.add(c.id);
      }
      if (ids.size === 0 && !na) problems.push(`${a.action} / ${slot}: no case and no reason given`);
      slots[slot] = { cases: [...ids].sort(), na: ids.size === 0 ? na : undefined };
    }
    return { action: a.action, slots };
  });
  return { out, problems };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(cases: TestCase[], results: Map<string, Result>, traceability: TraceOut[], coverage: ActionOut[], generated: string): string {
  const rows = cases.map((c) => ({ ...c, ...(results.get(c.id) ?? { status: "Not Run", actual: "" }) }));
  const data = JSON.stringify({ generated, categories: CATEGORIES, rows, traceability, coverage }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Asetheria test cases</title>
<style>
:root{--bg:#f7f1e4;--card:#fffaf0;--fg:#1d1a14;--muted:#5e5648;--line:#d9ccb0;--accent:#8a5a00;--pass:#1e6b34;--fail:#a3201b;--block:#8a5a00;--notrun:#5e5648;--chip:#efe4c8}
@media (prefers-color-scheme:dark){:root{--bg:#0f0d0a;--card:#181510;--fg:#f1e8d4;--muted:#b8ac92;--line:#3a3326;--accent:#e0b04a;--pass:#6fd08c;--fail:#ff8a80;--block:#e0b04a;--notrun:#b8ac92;--chip:#26211a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif}
header,main{max-width:1500px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px}
.muted{color:var(--muted)}
.dash{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:12px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.tile b{display:block;font-size:22px}
.bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.bar{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.bar h3{margin:0 0 6px;font-size:13px}
.row{display:grid;grid-template-columns:150px 1fr 56px;gap:8px;align-items:center;font-size:12px;margin:3px 0}
.track{height:8px;background:var(--chip);border-radius:4px;overflow:hidden}.fill{height:100%;background:var(--accent)}
.filters{position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0;display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--line)}
input,select,textarea,button{font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:5px 8px}
button{cursor:pointer}
input[type=search]{min-width:240px}
table{width:100%;border-collapse:collapse;background:var(--card);margin-top:10px}
th,td{border:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}
th{background:var(--chip);position:sticky;top:46px;z-index:2;font-size:12px}
td.id{white-space:nowrap;font-weight:600}
ol,ul{margin:0;padding-left:18px}
.chip{display:inline-block;background:var(--chip);border-radius:10px;padding:1px 8px;font-size:12px;white-space:nowrap}
.st-Pass{color:var(--pass);font-weight:600}.st-Fail{color:var(--fail);font-weight:600}.st-Blocked{color:var(--block);font-weight:600}.st-Not\\ Run{color:var(--notrun)}
tr.hidden{display:none}
textarea{width:100%;min-width:140px;min-height:44px}
.actual{min-width:180px;color:var(--muted)}
details summary{cursor:pointer;color:var(--accent)}
.trace td,.trace th{position:static}
@media print{
  body{background:#fff;color:#000;font-size:10px}.filters,.noprint,select,textarea{display:none!important}
  header,main{max-width:none;padding:0}th{position:static}
  tr{break-inside:avoid}table{font-size:9px}
  .st-Pass,.st-Fail,.st-Blocked,.st-Not\\ Run{color:#000}
  td.statuscell::after{content:attr(data-status)}
}
</style>
</head>
<body>
<header>
<h1>Asetheria: test cases</h1>
<div class="muted">Generated ${esc(generated)} from the Playwright specs in <code>tests/</code>. One case per automated test; each test's title starts with its case id. Steps, data and expected results are read from the test bodies.</div>
<div class="dash" id="tiles" aria-label="Summary"></div>
<div class="bars" id="bars"></div>
</header>
<main>
<h2 id="cases">Test cases</h2>
<div class="filters noprint" role="search">
<input type="search" id="q" placeholder="Search id, title, steps, expected…" aria-label="Search test cases">
<select id="fModule" aria-label="Module"><option value="">All modules</option></select>
<select id="fCategory" aria-label="Category"><option value="">All categories</option></select>
<select id="fPriority" aria-label="Priority"><option value="">All priorities</option><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select>
<select id="fStatus" aria-label="Status"><option value="">All statuses</option><option>Not Run</option><option>Pass</option><option>Fail</option><option>Blocked</option></select>
<button id="reset" type="button">Reset</button>
<span class="muted" id="count" role="status"></span>
</div>
<table id="t">
<thead><tr><th>ID</th><th>Module</th><th>Category</th><th>Priority</th><th>Preconditions</th><th>Steps</th><th>Test data</th><th>Expected</th><th>Actual</th><th>Status</th><th>Notes</th></tr></thead>
<tbody id="tb"></tbody>
</table>
<h2 id="coverage">Coverage floor: every user action</h2>
<div class="muted">Each user action has a happy case, an invalid-input case, an unauthorized case and a boundary case, or a stated reason one cannot exist.</div>
<table class="trace" id="cov"><thead><tr><th>User action</th><th>Happy</th><th>Invalid input</th><th>Unauthorized</th><th>Boundary</th></tr></thead><tbody id="covb"></tbody></table>
<h2 id="traceability">Traceability: plan criteria to cases</h2>
<div class="muted">Each acceptance item from PLAN.md, and the case ids that check it. A criterion with no case would show as uncovered.</div>
<table class="trace" id="trace"><thead><tr><th>Phase</th><th>Criterion</th><th>Cases</th></tr></thead><tbody id="tr"></tbody></table>
</main>
<script id="data" type="application/json">${data}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('data').textContent);
var rows=D.rows;var KEY='asetheria-test-cases:v1';
var saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(e){}}
function el(t,a,c){var e=document.createElement(t);if(a)for(var k in a){if(k==='class')e.className=a[k];else e.setAttribute(k,a[k])}(c||[]).forEach(function(x){e.appendChild(typeof x==='string'?document.createTextNode(x):x)});return e}
function list(items,ord){if(!items||!items.length)return document.createTextNode('');var l=el(ord?'ol':'ul');items.forEach(function(i){l.appendChild(el('li',null,[i]))});return l}
function statusOf(r){return (saved[r.id]&&saved[r.id].status)||r.status}
function notesOf(r){return (saved[r.id]&&saved[r.id].notes)||''}
var tb=document.getElementById('tb');
var trs={};
rows.forEach(function(r){
 var tr=el('tr');tr.id=r.id;trs[r.id]=tr;
 var sel=el('select',{'aria-label':'Status of '+r.id},['Not Run','Pass','Fail','Blocked'].map(function(s){var o=el('option',null,[s]);if(s===statusOf(r))o.selected=true;return o}));
 var stTd=el('td',{class:'statuscell','data-status':statusOf(r)},[sel]);
 sel.addEventListener('change',function(){saved[r.id]=saved[r.id]||{};saved[r.id].status=sel.value;persist();stTd.setAttribute('data-status',sel.value);sel.className='st-'+sel.value;dash();apply()});
 sel.className='st-'+statusOf(r);
 var notes=el('textarea',{'aria-label':'Notes for '+r.id});notes.value=notesOf(r);
 notes.addEventListener('input',function(){saved[r.id]=saved[r.id]||{};saved[r.id].notes=notes.value;persist()});
 var det=el('details',null,[el('summary',null,[r.title]),el('div',{class:'muted'},[r.file+':'+r.line+(r.describe?' · '+r.describe:'')])]);
 tr.appendChild(el('td',{class:'id'},[r.id]));
 tr.appendChild(el('td',null,[r.module+' ',el('div',{class:'muted'},[r.moduleName])]));
 tr.appendChild(el('td',null,[el('span',{class:'chip'},[r.category])]));
 tr.appendChild(el('td',null,[r.priority]));
 tr.appendChild(el('td',null,[list(r.preconditions,false)]));
 tr.appendChild(el('td',null,[det,list(r.steps,true)]));
 tr.appendChild(el('td',null,[list(r.testData,false)]));
 tr.appendChild(el('td',null,[list(r.expected,false)]));
 tr.appendChild(el('td',{class:'actual'},[r.actual||'']));
 tr.appendChild(stTd);
 tr.appendChild(el('td',null,[notes]));
 tb.appendChild(tr);
});
function fillSel(id,vals){var s=document.getElementById(id);vals.forEach(function(v){s.appendChild(el('option',{value:v},[v]))})}
var mods={};rows.forEach(function(r){mods[r.module]=r.module+' · '+r.moduleName});
fillSel('fModule',Object.keys(mods).sort());
(function(){var s=document.getElementById('fModule');for(var i=1;i<s.options.length;i++)s.options[i].textContent=mods[s.options[i].value]})();
fillSel('fCategory',D.categories);
var q=document.getElementById('q'),fm=document.getElementById('fModule'),fc=document.getElementById('fCategory'),fp=document.getElementById('fPriority'),fs=document.getElementById('fStatus');
function apply(){
 var term=q.value.trim().toLowerCase(),n=0;
 rows.forEach(function(r){
  var hay=(r.id+' '+r.title+' '+r.steps.join(' ')+' '+r.expected.join(' ')+' '+r.module+' '+r.category+' '+r.describe).toLowerCase();
  var ok=(!term||hay.indexOf(term)>=0)&&(!fm.value||r.module===fm.value)&&(!fc.value||r.category===fc.value)&&(!fp.value||r.priority===fp.value)&&(!fs.value||statusOf(r)===fs.value);
  trs[r.id].classList.toggle('hidden',!ok);if(ok)n++;
 });
 document.getElementById('count').textContent=n+' of '+rows.length+' shown';
}
[q,fm,fc,fp,fs].forEach(function(e){e.addEventListener('input',apply)});
document.getElementById('reset').addEventListener('click',function(){q.value='';fm.value='';fc.value='';fp.value='';fs.value='';apply()});
function tally(key){var m={};rows.forEach(function(r){var k=key(r);m[k]=(m[k]||0)+1});return m}
function bars(title,m,order){
 var box=el('div',{class:'bar'},[el('h3',null,[title])]);var max=Math.max.apply(null,Object.keys(m).map(function(k){return m[k]}).concat([1]));
 (order||Object.keys(m).sort()).forEach(function(k){if(!m[k])return;var row=el('div',{class:'row'},[el('span',null,[k]),el('div',{class:'track'},[el('div',{class:'fill',style:'width:'+Math.round(100*m[k]/max)+'%'})]),el('span',null,[String(m[k])])]);box.appendChild(row)});
 return box}
function dash(){
 var st=tally(statusOf),tiles=document.getElementById('tiles');tiles.textContent='';
 [['Total',rows.length],['Pass',st['Pass']||0],['Fail',st['Fail']||0],['Blocked',st['Blocked']||0],['Not Run',st['Not Run']||0]].forEach(function(p){tiles.appendChild(el('div',{class:'tile'},[el('b',{class:'st-'+p[0]},[String(p[1])]),el('span',{class:'muted'},[p[0]])]))});
 var done=(st['Pass']||0)+(st['Fail']||0);var rate=done?Math.round(100*(st['Pass']||0)/done):0;
 tiles.appendChild(el('div',{class:'tile'},[el('b',null,[done?rate+'%':'n/a']),el('span',{class:'muted'},['Pass rate of run cases'])]));
 var b=document.getElementById('bars');b.textContent='';
 b.appendChild(bars('By category',tally(function(r){return r.category}),D.categories));
 b.appendChild(bars('By priority',tally(function(r){return r.priority}),['P0','P1','P2','P3']));
 b.appendChild(bars('By status',st,['Pass','Fail','Blocked','Not Run']));
 b.appendChild(bars('By module',tally(function(r){return r.module})));
}
var tr=document.getElementById('tr');
(D.traceability||[]).forEach(function(t){
 var ids=t.cases||[];var kids=ids.map(function(i,ix){var a=el('a',{href:'#'+i},[i]);return ix?el('span',null,[', ',a]):a});if(t.manual)kids.push(el('div',{class:'muted'},[(ids.length?'Also: ':'Not a Playwright check: ')+t.manual]));if(!kids.length)kids=[el('b',{class:'st-Fail'},['No case'])];var links=el('td',null,kids);
 tr.appendChild(el('tr',null,[el('td',null,[t.phase]),el('td',null,[t.criterion]),links]));
});
var cb=document.getElementById('covb');
(D.coverage||[]).forEach(function(a){
 var tds=[el('td',null,[a.action])];
 ['happy','invalid','unauthorized','boundary'].forEach(function(k){var s=a.slots[k];var kids=s.cases.map(function(i,ix){var l=el('a',{href:'#'+i},[i.slice(3)]);return ix?el('span',null,[', ',l]):l});if(s.na)kids=[el('span',{class:'muted'},['n/a: '+s.na])];tds.push(el('td',null,kids))});
 cb.appendChild(el('tr',null,tds));
});
dash();apply();
})();
</script>
</body>
</html>
`;
}

function main(): void {
  const args = process.argv.slice(2);
  const resultsArg = args.indexOf("--results");
  const listed = listTests();
  const cases = buildCatalogue(listed, TESTS);
  if (args.includes("--tag-specs")) {
    const n = tagSpecs(cases);
    process.stdout.write(`Tagged ${n} spec titles with their case ids.\n`);
    return;
  }
  const results = resultsArg >= 0 ? readResults(path.resolve(args[resultsArg + 1])) : new Map<string, Result>();
  const traceFile = path.join(ROOT, "test-cases", "traceability.json");
  const trace = resolveTrace(fs.existsSync(traceFile) ? (JSON.parse(fs.readFileSync(traceFile, "utf8")) as TraceIn[]) : [], cases);
  const actionsFile = path.join(ROOT, "test-cases", "actions.json");
  const { out: coverage, problems } = resolveActions(fs.existsSync(actionsFile) ? (JSON.parse(fs.readFileSync(actionsFile, "utf8")) as ActionIn[]) : [], cases);
  for (const p of problems) process.stderr.write(`COVERAGE GAP: ${p}
`);
  const uncovered = trace.filter((t) => t.cases.length === 0 && !t.manual);
  for (const t of uncovered) process.stderr.write(`UNCOVERED: ${t.phase}: ${t.criterion}
`);
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(cases, null, 1)}\n`);
  fs.writeFileSync(OUT_HTML, render(cases, results, trace, coverage, new Date().toISOString().slice(0, 16).replace("T", " ")));
  const ids = loadIds();
  if (problems.length > 0 && args.includes("--strict")) process.exitCode = 1;
  process.stdout.write(`${cases.length} cases (${Object.keys(ids).length} ids), ${results.size} results -> test-cases.html\n`);
}

main();
