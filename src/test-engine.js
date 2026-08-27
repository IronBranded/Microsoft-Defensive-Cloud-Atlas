const fs = require("fs");
const path = require("path");
const engine = require("./report-engine.js");

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", p), "utf8"));
}

const sourcesData = loadJSON("data/sources.example.json");
const licenseCatalog = loadJSON("data/licenses.json");
const mitreData = loadJSON("data/mitre-mapping.json");
const tacticGroups = loadJSON("data/tactic-groups.json");
const riskNarratives = loadJSON("data/risk-narratives.json");
const productsCatalog = loadJSON("data/products.json");
const ransomwareChain = loadJSON("data/ransomware-chain.json");

function run(scopeName, selectedLicenseIds) {
  const model = engine.buildReportModel({
    sources: sourcesData.sources,
    licenseCatalog,
    mitreData,
    tacticGroups,
    riskNarratives,
    productsCatalog,
    ransomwareChain,
    selectedLicenseIds,
  });
  console.log(`\n=== Scope: ${scopeName} (${selectedLicenseIds.join(", ")}) ===`);
  console.log("Held licenses:", model.heldLicenseIds.join(", "));
  console.log("Stats:", model.stats);
  console.log("Posture rows:");
  model.postureRows.forEach((r) => console.log(`  ${r.kind === "product" ? "    - " : ""}${r.id.padEnd(24)} ${r.active}/${r.total}  ${r.pct}%`));
  console.log("Ransomware exposure:", model.ransomwareExposure.blindCount + "/" + model.ransomwareExposure.totalStages, "stages blind");
  model.ransomwareExposure.stages.forEach((s) => console.log(`    ${s.id.padEnd(22)} ${s.status.padEnd(10)} ${s.activeCount}/${s.totalCount}`));
  console.log("Top risks:", model.topRisks.map((r) => r.id));
  console.log("MITRE coverage groups:");
  model.mitreCoverage.forEach((g) => console.log(`  ${g.id}: ${g.techniques.map((t) => t.id).join(", ") || "(none gapped)"}`));
  console.log("Free-fix (Track 1) count:", model.freeFixes.length, model.freeFixes.map((f) => f.id));
  console.log("Roadmap (Track 2), by priority:");
  model.roadmap.forEach((r) => console.log(`  #${r.priority} ${r.license.id.padEnd(20)} unlocks ${r.sourceCount}  score=${r.score}`));
  return model;
}

// Scope 1: Business Premium — should reproduce the same picture as the manually-built report.
const m1 = run("Business Premium", ["biz-premium"]);

// Scope 2: full M365 E5 — sanity check that a richer scope meaningfully shrinks the gap list
// and that bundle-inclusion resolution (E5 -> E3 -> F1, Entra P1+P2, MDE P1+P2, MDO P1+P2, MDI, MDCA, E5 Security, Purview E5 Compliance) works.
const m2 = run("M365 E5", ["m365-e5"]);

// Scope 3: Business Premium + standalone Sentinel + standalone Entra P2 (a realistic upsell scenario)
const m3 = run("Business Premium + Sentinel + Entra P2", ["biz-premium", "sentinel", "entra-p2"]);

// --- Assertions -------------------------------------------------------
const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
};

// Scope 4: a base plan stacked with SIX independent standalone add-ons — the
// realistic "fully kitted out SMB" scenario the whole "must be dynamic, not a
// fixed list of scopes" requirement is about. None of these add-ons appear
// together in any other test scope.
const m4 = run("Business Premium, fully add-on'd", ["biz-premium", "mde-p2", "mdi", "mdca", "entra-p2", "sentinel", "m365-copilot"]);

// Scope 5: an add-on with NO base plan at all — e.g. an org using Entra ID
// standalone without any M365 seat. Edge case the engine should still handle
// correctly (Entra ID risk detections unlock; nothing M365-specific does).
const m5 = run("Entra ID P2 standalone, no M365 base", ["entra-p2"]);

console.log("\n--- Add-on robustness checks ---");
const idProtection4 = m4.sources.find((s) => s.id === "risk-detections");
assert(idProtection4.locked === false, "6-addon scope: Identity Protection risk detections should unlock via the standalone Entra P2 add-on");
const deviceProc4 = m4.sources.find((s) => s.id === "device-process-events");
assert(deviceProc4.locked === false, "6-addon scope: MDE P2 add-on should unlock DeviceProcessEvents even stacked with 5 other add-ons");
assert(m4.stats.activeCount > m1.stats.activeCount, "6-addon scope should show strictly more active sources than bare Business Premium");

const idProtection5 = m5.sources.find((s) => s.id === "risk-detections");
assert(idProtection5.locked === false, "Entra P2 standalone (no base): Identity Protection risk detections should still unlock");
const mailAccessed5 = m5.sources.find((s) => s.id === "mail-items-accessed");
assert(mailAccessed5.locked === true, "Entra P2 standalone (no base): MailItemsAccessed should still be locked (needs M365 E5 or Purview Advanced Audit, neither selected)");

// Scope 6: a license id the catalog has never heard of — simulates Microsoft
// shipping a new SKU before this repo's data is updated for it.
const held6 = engine.resolveHeldLicenses(licenseCatalog, ["biz-premium", "ms-hypothetical-future-sku"]);
assert(held6.held.has("ms-hypothetical-future-sku"), "Unknown future license id should still be tracked as held, not silently dropped");
assert(held6.unknown.has("ms-hypothetical-future-sku"), "Unknown future license id should be reported back via `unknown` so the report can flag it");
assert(held6.held.has("entra-p1"), "Unknown license id alongside a known one shouldn't break normal bundle resolution");
assert(m1.stats.totalCount === 70, `Dataset should now cover 70 sources after the ransomware kill-chain additions (got ${m1.stats.totalCount})`);
assert(m1.stats.configGapCount === 8, `Business Premium should show 8 free-fix config gaps, +1 for the new Azure Backup source (got ${m1.stats.configGapCount})`);
assert(m1.freeFixes.length === 8, `Business Premium should show 8 free-fix config gaps in Track 1 (got ${m1.freeFixes.length})`);
const postureById = Object.fromEntries(m1.postureRows.map((r) => [r.id, r]));

console.log("\n--- Defender family breakdown checks (the actual point of this pass) ---");
const defenderFamily = postureById["defender"];
assert(defenderFamily && defenderFamily.kind === "family" && defenderFamily.childCount === 5, `Defender family should show exactly 5 distinct products (got ${defenderFamily && defenderFamily.childCount})`);
["mde", "mdi", "mdca", "mdo", "mdfc"].forEach((p) => {
  assert(postureById[p] && postureById[p].kind === "product" && postureById[p].family === "defender", `${p} should appear as its own product row under the defender family`);
});
assert(postureById["mdo"].active === 2 && postureById["mdo"].total === 3, `MDO should show 2/3 active under Business Premium now that MDO P1 inclusion is corrected (got ${postureById["mdo"].active}/${postureById["mdo"].total})`);
assert(postureById["mde"].active === 0, `MDE should show 0 active under bare Business Premium (Defender for Business has no Advanced Hunting) (got ${postureById["mde"].active})`);
assert(postureById["mdfc"].total === 2, `MDFC should consolidate both cross-cutting sources (mdfc-recommendations filed under azure-platform category + mdfc-alerts filed under defender category) into one product view (got total=${postureById["mdfc"].total})`);

const purviewFamily = postureById["purview"];
assert(purviewFamily && purviewFamily.childCount === 8, `Purview family should show 8 distinct products using the same general mechanism (got ${purviewFamily && purviewFamily.childCount})`);

const singleProductFamilies = ["azure-platform", "entra-id", "m365", "sentinel"];
singleProductFamilies.forEach((f) => {
  assert(postureById[f] && postureById[f].kind === "family" && postureById[f].childCount === 1, `${f} should still render as a single row (only one product) — the mechanism shouldn't force a breakdown where there's nothing to break down`);
});
assert(m1.postureRows.filter((r) => r.kind === "product" && r.family === "defender").length === 5, "Exactly 5 defender product sub-rows should be present, no more no less");
assert(m2.stats.lockedCount < m1.stats.lockedCount, "M365 E5 should unlock strictly more sources than Business Premium");
assert(m2.heldLicenseIds.includes("mdi") && m2.heldLicenseIds.includes("mdca"), "M365 E5 bundle resolution should include MDI and MDCA transitively");
assert(!m1.heldLicenseIds.includes("mdi"), "Business Premium should NOT include MDI");
assert(
  m3.stats.lockedCount < m1.stats.lockedCount,
  "Adding standalone Sentinel + Entra P2 on top of Business Premium should reduce the locked count"
);
const idProtection = m1.sources.find((s) => s.id === "risk-detections");
assert(idProtection.locked === true, "Identity Protection risk detections should be locked under Business Premium alone");
const idProtection3 = m3.sources.find((s) => s.id === "risk-detections");
assert(idProtection3.locked === false, "Identity Protection risk detections should unlock once Entra P2 is added");

console.log("\n--- Ransomware kill-chain checks ---");
assert(m1.ransomwareExposure.totalStages === 6, `Ransomware chain should define 6 stages (got ${m1.ransomwareExposure.totalStages})`);
assert(m1.ransomwareExposure.stages.every((s) => s.status !== "unmapped"), "No stage should ever compute as 'unmapped' — every stage's techniques must be tagged on at least one source (this is exactly the T1486 bug that validate-data.js now also catches statically)");
assert(m1.ransomwareExposure.blindCount === 3, `Business Premium should show exactly 3 fully blind kill-chain stages (got ${m1.ransomwareExposure.blindCount})`);
const stageById = Object.fromEntries(m1.ransomwareExposure.stages.map((s) => [s.id, s]));
assert(stageById["lateral-movement"].status === "blind", "Lateral movement should be fully blind under bare Business Premium (no MDI, no MDE P2)");
assert(stageById["defense-impairment"].status === "blind", "Defense impairment (T1685, ATT&CK v19) should be fully blind under bare Business Premium");
assert(stageById["encryption"].status === "blind", "Encryption should be fully blind under bare Business Premium (MDE P2 and MDCA both locked)");
assert(stageById["initial-access"].status === "partial", "Initial access should be partial (Entra sign-in logs are active, but Identity Protection risk detections and exposed-RDP detection are locked)");

const m6 = run("Business Premium + Sentinel + MDI + MDCA + MDE P2 (targeted ransomware close)", ["biz-premium", "sentinel", "mdi", "mdca", "mde-p2"]);
assert(m6.ransomwareExposure.blindCount === 0, `A targeted add-on combination (not full E5) should be able to close every kill-chain blind spot (got ${m6.ransomwareExposure.blindCount} still blind)`);
assert(m2.ransomwareExposure.blindCount === 0, "M365 E5 (already computed above as m2) should also close every kill-chain blind spot");
