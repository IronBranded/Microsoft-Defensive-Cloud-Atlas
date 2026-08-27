/**
 * Builds dist/executive-brief.html — a DEV / PREVIEW / TESTING tool, not the
 * production integration path. It's a fully self-contained page (full
 * engine + data inlined, reads ?scope= from the URL and computes its own
 * model client-side) useful for previewing the Brief without wiring up the
 * real Atlas, and for build/verify-report-page.js's browser tests — but the
 * actual shipped integration is build/build-atlas-bundle.js, which inlines
 * everything into index.html itself and generates the Brief on the fly with
 * no second .html file involved (see README.md > "No separate file").
 *
 * This page still deliberately has no in-page way to change the scope —
 * that principle doesn't change just because this build is a dev tool. It
 * only ever renders whatever's in ?scope=; missing, it shows a clear
 * message instead of a default that could be mistaken for real data.
 *
 * This script only assembles: page shell + theme/report-light.css +
 * src/i18n.js + src/report-engine.js + src/render-report.js + the data/i18n
 * JSON, all inlined into one file — same "modular dev, single-file
 * distribution" pattern the Atlas itself uses. All logic lives in src/ and
 * is independently testable (src/test-engine.js, build/verify-report-page.js).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const readJSON = (p) => JSON.parse(read(p));

const sourcesData = readJSON("data/sources.example.json");
const licenseCatalog = readJSON("data/licenses.json");
const mitreData = readJSON("data/mitre-mapping.json");
const tacticGroups = readJSON("data/tactic-groups.json");
const riskNarratives = readJSON("data/risk-narratives.json");
const productsCatalog = readJSON("data/products.json");
const ransomwareChain = readJSON("data/ransomware-chain.json");
const en = readJSON("i18n/en.json");
const fr = readJSON("i18n/fr.json");

const theme = read("theme/report-light.css");
const moduleSrc = read("src/i18n.js") + "\n" + read("src/report-engine.js") + "\n" + read("src/render-report.js");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Executive Brief: Microsoft 365 Licensing Gaps</title>
<style>
${theme}
.no-scope{max-width:640px;margin:80px auto;text-align:center;padding:40px;background:var(--paper);border:1px solid var(--line);border-radius:6px;}
.no-scope h2{font-family:var(--serif);font-size:20px;color:var(--ink);margin-bottom:14px;}
.no-scope p{font-size:14px;color:var(--ink-soft);line-height:1.6;margin-bottom:10px;}
.no-scope code{background:var(--paper-alt);padding:2px 6px;border-radius:3px;font-family:var(--mono);font-size:12.5px;color:var(--accent);}
</style>
</head>
<body>

<div class="control-bar">
  <div class="cb-title">Executive Brief</div>
  <div class="lang-toggle" id="lang-toggle" style="margin-left:auto;">
    <button data-lang="en">EN</button>
    <button data-lang="fr">FR</button>
  </div>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
</div>

<div id="sheet-container"></div>

<script>
const ATLAS_SOURCES = ${JSON.stringify(sourcesData.sources)};
const ATLAS_LICENSES = ${JSON.stringify(licenseCatalog)};
const ATLAS_MITRE = ${JSON.stringify(mitreData)};
const ATLAS_TACTIC_GROUPS = ${JSON.stringify(tacticGroups)};
const ATLAS_RISK_NARRATIVES = ${JSON.stringify(riskNarratives)};
const ATLAS_PRODUCTS = ${JSON.stringify(productsCatalog)};
const ATLAS_RANSOMWARE_CHAIN = ${JSON.stringify(ransomwareChain)};
const ATLAS_I18N = { en: ${JSON.stringify(en)}, fr: ${JSON.stringify(fr)} };

${moduleSrc}

// ── The ONLY input: ?scope= from the URL, handed off by the Atlas's printed
// Executive Summary. No dropdown, no picker — see the file header comment. ──
function labelForIds(ids, lang) {
  return ids.map((id) => {
    const l = ATLAS_LICENSES.licenses.find((x) => x.id === id);
    return l ? l.name[lang] : id;
  }).join(" + ");
}
function scopeFromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("scope");
  if (!raw) return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return null;
  return { labelEn: labelForIds(ids, "en"), labelFr: labelForIds(ids, "fr"), licenses: ids };
}

const NO_SCOPE_TEXT = {
  en: { title: "No License Scope Provided", body: "This page renders a translation of a Microsoft Defensive Cloud Atlas license scope — it needs to know which one.", hint: "Open it via the «Executive Brief» button in the Atlas. Testing directly? Append a scope to the URL, e.g. " },
  fr: { title: "Aucun périmètre de licence fourni", body: "Cette page affiche la traduction d'un périmètre de licence du Microsoft Defensive Cloud Atlas — elle doit savoir lequel.", hint: "Ouvrez-la via le bouton «Executive Brief» dans l'Atlas. Test direct? Ajoutez un périmètre à l'URL, ex. " },
};

const currentScope = scopeFromUrl();
let currentLang = "en";

function rerender() {
  const container = document.getElementById("sheet-container");
  if (!currentScope) {
    const t = NO_SCOPE_TEXT[currentLang];
    container.innerHTML = '<div class="no-scope"><h2>' + t.title + "</h2><p>" + t.body + "</p><p>" + t.hint +
      '<code>?scope=biz-premium,sentinel,entra-p2</code></p></div>';
    document.title = "Executive Brief — " + t.title;
    document.querySelectorAll(".lang-toggle button").forEach((b) => b.classList.toggle("on", b.dataset.lang === currentLang));
    return;
  }
  const model = AtlasReportEngine.buildReportModel({
    sources: ATLAS_SOURCES, licenseCatalog: ATLAS_LICENSES, mitreData: ATLAS_MITRE,
    tacticGroups: ATLAS_TACTIC_GROUPS, riskNarratives: ATLAS_RISK_NARRATIVES, productsCatalog: ATLAS_PRODUCTS, ransomwareChain: ATLAS_RANSOMWARE_CHAIN,
    selectedLicenseIds: currentScope.licenses,
  });
  const scopeLabel = currentLang === "fr" ? currentScope.labelFr : currentScope.labelEn;
  container.innerHTML = '<div class="sheet" id="sheet"></div>';
  document.getElementById("sheet").innerHTML = AtlasStandaloneReport.renderSheet(model, currentLang, ATLAS_I18N, scopeLabel);
  document.querySelectorAll(".lang-toggle button").forEach((b) => b.classList.toggle("on", b.dataset.lang === currentLang));
  document.title = "Executive Brief: MS365 Licensing Gaps — " + scopeLabel;
}

document.getElementById("lang-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-lang]");
  if (!btn) return;
  currentLang = btn.dataset.lang;
  rerender();
});
rerender();
</script>
</body>
</html>
`;

const outPath = path.join(ROOT, "dist", "executive-brief.html");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log("Wrote", outPath, "(", html.length, "bytes )");
