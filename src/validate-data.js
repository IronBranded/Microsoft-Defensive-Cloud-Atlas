/**
 * Validates referential integrity across the whole data graph:
 *   licenses.json ↔ sources.example.json ↔ mitre-mapping.json ↔
 *   tactic-groups.json ↔ risk-narratives.json ↔ i18n/{en,fr}.json
 *
 * Why this exists: the whole point of the data-driven architecture is that
 * adding a license, an add-on, a log source, or a MITRE technique should be a
 * pure data edit. That's only actually safe if broken references, orphaned
 * ids, and missing translations get caught automatically — otherwise "safe to
 * edit" is just a claim, not a property of the system. Run this after any
 * change to data/ or i18n/, and in CI if this repo gets one.
 *
 * Usage: node src/validate-data.js   (exit code 0 = clean, 1 = problems found)
 */
const fs = require("fs");
const path = require("path");
const i18n = require("./i18n.js");

const ROOT = path.join(__dirname, "..");
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const licenses = readJSON("data/licenses.json");
const sourcesData = readJSON("data/sources.example.json");
const mitreData = readJSON("data/mitre-mapping.json");
const tacticGroups = readJSON("data/tactic-groups.json");
const riskNarratives = readJSON("data/risk-narratives.json");
const productsCatalog = readJSON("data/products.json");
const ransomwareChain = readJSON("data/ransomware-chain.json");
const en = readJSON("i18n/en.json");
const fr = readJSON("i18n/fr.json");

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const VALID_KINDS = new Set(["base", "addon", "consumption"]);
const VALID_GATE_TYPES = new Set(["license", "config"]);
const VALID_SEVERITIES = new Set(["critical", "high", "medium", "info"]);

function isBilingualOk(obj, label) {
  if (obj == null) return true;
  const enV = obj.en, frV = obj.fr;
  if (enV === undefined || frV === undefined) {
    err(`${label}: bilingual field missing an "en" or "fr" key entirely`);
    return false;
  }
  const enEmpty = enV.trim() === "", frEmpty = frV.trim() === "";
  if (enEmpty !== frEmpty) {
    err(`${label}: asymmetric translation — one language is empty and the other isn't (en="${enV}" fr="${frV}")`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------
// 1. licenses.json internal integrity
// ---------------------------------------------------------------------
const licenseIds = new Set();
licenses.licenses.forEach((l) => {
  if (licenseIds.has(l.id)) err(`licenses.json: duplicate license id "${l.id}"`);
  licenseIds.add(l.id);
  if (!VALID_KINDS.has(l.kind)) err(`licenses.json: license "${l.id}" has invalid or missing kind "${l.kind}" (expected base|addon|consumption)`);
  if (!licenses.groups[l.group]) err(`licenses.json: license "${l.id}" references unknown group "${l.group}"`);
  isBilingualOk(l.name, `licenses.json: "${l.id}".name`);
});
licenses.licenses.forEach((l) => {
  (l.includes || []).forEach((inc) => {
    if (inc === l.id) err(`licenses.json: license "${l.id}" includes itself`);
    if (!licenseIds.has(inc)) err(`licenses.json: license "${l.id}" includes unknown id "${inc}"`);
  });
});
// circular include detection (the engine tolerates cycles safely, but they're
// almost certainly a data mistake, not an intentional structure)
function hasCycle(startId) {
  const byId = Object.fromEntries(licenses.licenses.map((l) => [l.id, l]));
  const seen = new Set();
  const stack = [startId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === startId && seen.size > 0) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (byId[cur]?.includes || []).forEach((i) => stack.push(i));
  }
  return false;
}
licenses.licenses.forEach((l) => {
  if ((l.includes || []).length && hasCycle(l.id)) warn(`licenses.json: possible circular "includes" involving "${l.id}" — engine is cycle-safe, but this is almost certainly unintended`);
});

// ---------------------------------------------------------------------
// 2. sources.example.json integrity (references into licenses + MITRE)
// ---------------------------------------------------------------------
const sourceIds = new Set();
sourcesData.sources.forEach((s) => {
  if (sourceIds.has(s.id)) err(`sources.example.json: duplicate source id "${s.id}"`);
  sourceIds.add(s.id);

  if (!VALID_GATE_TYPES.has(s.gateType)) err(`sources.example.json: source "${s.id}" has invalid gateType "${s.gateType}"`);
  if (!VALID_SEVERITIES.has(s.severity)) err(`sources.example.json: source "${s.id}" has invalid severity "${s.severity}"`);
  isBilingualOk(s.name, `sources.example.json: "${s.id}".name`);
  isBilingualOk(s.categoryLabel, `sources.example.json: "${s.id}".categoryLabel`);
  isBilingualOk(s.retentionNative, `sources.example.json: "${s.id}".retentionNative`);

  if (s.gateType === "config" && (s.requiresLicense || s.requiresAnyOf)) {
    warn(`sources.example.json: "${s.id}" is gateType:"config" but also sets requiresLicense/requiresAnyOf — the license requirement will be ignored by the engine (config gaps never check licenses); remove one or the other`);
  }
  if (s.gateType === "license") {
    const reqs = s.requiresAnyOf || (s.requiresLicense ? [s.requiresLicense] : []);
    reqs.forEach((r) => {
      if (!licenseIds.has(r)) err(`sources.example.json: "${s.id}" requires unknown license id "${r}"`);
    });
  }
  (s.mitreTechniques || []).forEach((t) => {
    if (!mitreData.techniques[t]) err(`sources.example.json: "${s.id}" references unknown MITRE technique "${t}"`);
  });

  if (!s.product) {
    err(`sources.example.json: "${s.id}" has no product tag`);
  } else if (!productsCatalog.products[s.product]) {
    err(`sources.example.json: "${s.id}" references unknown product "${s.product}"`);
  }
});

// ---------------------------------------------------------------------
// 2b. products.json integrity
// ---------------------------------------------------------------------
Object.entries(productsCatalog.products).forEach(([id, p]) => {
  isBilingualOk(p.name, `products.json: "${id}".name`);
  if (!productsCatalog.families[p.family]) err(`products.json: product "${id}" references unknown family "${p.family}"`);
});
Object.entries(productsCatalog.families).forEach(([id, f]) => isBilingualOk(f.name, `products.json: families."${id}".name`));
// Every product's family should agree with the category of the sources tagged
// with it — the two are meant to describe the same top-level bucket except
// for the deliberate cross-cutting cases (documented inline in sources.example.json,
// e.g. mdfc-recommendations is category:"azure-platform" but product:"mdfc").
// A source whose product's family doesn't match ANY source sharing that
// product's category is more likely a typo than an intentional exception.


// ---------------------------------------------------------------------
// 3. mitre-mapping.json + tactic-groups.json integrity
// ---------------------------------------------------------------------
const tacticIdsCovered = new Set();
tacticGroups.groups.forEach((g) => g.tactics.forEach((t) => tacticIdsCovered.add(t)));

Object.entries(mitreData.techniques).forEach(([id, tech]) => {
  isBilingualOk(tech.name, `mitre-mapping.json: "${id}".name`);
  if (!tech.tactics || !tech.tactics.length) {
    err(`mitre-mapping.json: technique "${id}" has no tactics listed`);
    return;
  }
  tech.tactics.forEach((t) => {
    if (!mitreData.tactics[t]) err(`mitre-mapping.json: technique "${id}" references unknown tactic "${t}"`);
    else if (!tacticIdsCovered.has(t)) warn(`tactic-groups.json: tactic "${t}" (used by technique "${id}") isn't covered by any narrative group — this technique will silently never appear in Section 3`);
  });
});

// ---------------------------------------------------------------------
// 4. risk-narratives.json integrity
// ---------------------------------------------------------------------
riskNarratives.candidates.forEach((c) => {
  isBilingualOk(c.title, `risk-narratives.json: "${c.id}".title`);
  isBilingualOk(c.body, `risk-narratives.json: "${c.id}".body`);
  (c.triggerSourceIds || []).forEach((sid) => {
    if (!sourceIds.has(sid)) err(`risk-narratives.json: "${c.id}" references unknown source id "${sid}"`);
  });
});

// ---------------------------------------------------------------------
// 4b. ransomware-chain.json integrity
// ---------------------------------------------------------------------
const stageIds = new Set();
const sourceMitreSet = new Set();
sourcesData.sources.forEach((s) => (s.mitreTechniques || []).forEach((t) => sourceMitreSet.add(t)));

ransomwareChain.stages.forEach((stage) => {
  if (stageIds.has(stage.id)) err(`ransomware-chain.json: duplicate stage id "${stage.id}"`);
  stageIds.add(stage.id);
  isBilingualOk(stage.title, `ransomware-chain.json: "${stage.id}".title`);
  isBilingualOk(stage.blurb, `ransomware-chain.json: "${stage.id}".blurb`);
  if (!stage.techniques || !stage.techniques.length) {
    err(`ransomware-chain.json: stage "${stage.id}" lists no techniques`);
    return;
  }
  let anyMapped = false;
  stage.techniques.forEach((t) => {
    if (!mitreData.techniques[t]) err(`ransomware-chain.json: stage "${stage.id}" references unknown MITRE technique "${t}"`);
    else if (sourceMitreSet.has(t)) anyMapped = true;
  });
  // This is the exact check that would have caught the "encryption" stage
  // shipping with zero sources tagged T1486 — a silent "always blind"
  // finding that looked like real data instead of a data gap.
  if (!anyMapped) err(`ransomware-chain.json: stage "${stage.id}" has no source anywhere tagged with any of its techniques (${stage.techniques.join(", ")}) — it will always compute as "unmapped", indistinguishable from a genuine total blind spot`);
});

// ---------------------------------------------------------------------
// 5. i18n key parity (en.json vs fr.json)
// ---------------------------------------------------------------------
const diff = i18n.diffCatalogs(en, fr);
if (!diff.inSync) {
  diff.onlyInA.forEach((k) => err(`i18n: key "${k}" exists in en.json but not fr.json`));
  diff.onlyInB.forEach((k) => err(`i18n: key "${k}" exists in fr.json but not en.json`));
}

// ---------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------
console.log(`Checked: ${licenses.licenses.length} licenses, ${sourcesData.sources.length} sources, ${Object.keys(productsCatalog.products).length} products, ${Object.keys(mitreData.techniques).length} MITRE techniques, ${riskNarratives.candidates.length} risk narratives, ${ransomwareChain.stages.length} ransomware kill-chain stages, i18n key parity.\n`);

if (warnings.length) {
  console.log(`⚠ ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log("  -", w));
  console.log("");
}
if (errors.length) {
  console.log(`✗ ${errors.length} error(s):`);
  errors.forEach((e) => console.log("  -", e));
  process.exitCode = 1;
} else {
  console.log("✓ No integrity errors found.");
}
