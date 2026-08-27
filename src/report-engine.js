/**
 * Atlas Executive Licensing Report — computation engine.
 *
 * Design contract:
 *   - No DOM access, no i18n strings, no HTML. Input data in, a plain-object
 *     report MODEL out. Language-agnostic: the model carries ids/keys/numbers;
 *     renderers (render-html.js, render-docx.js) turn the model + a language
 *     code into output. This is what makes "specific changes when required
 *     while ensuring overall integrity" possible — a retention figure or a
 *     MITRE tag is corrected in ONE data file and every output (web, print,
 *     docx, EN, FR) picks it up automatically; nothing here hardcodes prose.
 *   - Works unmodified in the browser (as a <script>) or in Node (module.exports),
 *     so the same engine drives the live Atlas tool AND any offline/docx export.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AtlasReportEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SEVERITY_WEIGHT = { critical: 3, high: 2, medium: 1, info: 0 };

  /**
   * Resolve the full set of license ids actually held, given what the caller
   * directly selected, by walking each license's `includes` graph.
   *
   * Robust to drift on purpose: Microsoft renames SKUs, retires them, and adds
   * new ones on its own schedule, not this repo's. An id the catalog doesn't
   * (yet) recognize is still counted as held — so a source whose
   * `requiresLicense` already references that id (e.g. because someone added
   * the source before getting around to cataloging the license metadata, or
   * a new add-on is selected before this file is updated) still resolves
   * correctly. Only bundle EXPANSION is skipped for an unknown id, since we
   * have nothing to expand. Callers get the unknown ids back so the report
   * can say so rather than silently computing as if everything was normal.
   */
  function resolveHeldLicenses(licenseCatalog, selectedIds) {
    const byId = {};
    licenseCatalog.licenses.forEach((l) => (byId[l.id] = l));
    const held = new Set();
    const unknown = new Set();
    const visit = (id) => {
      if (held.has(id)) return;
      held.add(id);
      const entry = byId[id];
      if (!entry) {
        unknown.add(id);
        return;
      }
      (entry.includes || []).forEach(visit);
    };
    (selectedIds || []).forEach(visit);
    return { held, unknown };
  }

  /** Annotate every source with its computed state for this license scope. */
  function computeSourceStates(sources, heldLicenseSet) {
    return sources.map((s) => {
      const needsConfig = s.gateType === "config";
      let licenseLocked;
      if (needsConfig) {
        licenseLocked = false; // no license required at all — "available", same as the real Atlas counts it
      } else {
        const required = s.requiresAnyOf || (s.requiresLicense ? [s.requiresLicense] : []);
        licenseLocked = required.length > 0 && !required.some((id) => heldLicenseSet.has(id));
      }
      let statusKey;
      if (needsConfig) statusKey = "configGap"; // available (no license) but not yet collecting data
      else statusKey = licenseLocked ? "locked" : "active";
      return Object.assign({}, s, { locked: licenseLocked, needsConfig, statusKey });
    });
  }

  /**
   * Section 1 posture table rows. Groups sources by `product` (fine-grained:
   * mde, mdi, mdca, mdo, mdfc, purview-dlp, etc.), then rolls products up to
   * their `family` (the 6 categories the real Atlas reports). A family with
   * exactly one product renders as a single row, unchanged from before. A
   * family with more than one product — currently Defender XDR (5 products)
   * and Purview (8 products) — renders as a bold parent aggregate row
   * followed by one indented row per product, so "Defender XDR: 0%" can never
   * hide that MDI is fully dark while MDO partially isn't, or vice versa.
   * Adding a new product to products.json and tagging sources with it is the
   * entire extension mechanism — no rendering code changes with it.
   */
  function computePostureRows(sourcesWithState, productsCatalog) {
    const byProduct = {};
    sourcesWithState.forEach((s) => {
      const p = s.product;
      const meta = productsCatalog.products[p];
      const family = meta ? meta.family : s.category; // fall back to category if a source's product isn't cataloged yet
      if (!byProduct[p]) byProduct[p] = { product: p, family, label: meta ? meta.name : s.categoryLabel, total: 0, active: 0 };
      byProduct[p].total++;
      if (!s.locked) byProduct[p].active++;
    });
    Object.values(byProduct).forEach((p) => (p.pct = p.total ? Math.round((p.active / p.total) * 100) : 0));

    const byFamily = {};
    Object.values(byProduct).forEach((p) => {
      if (!byFamily[p.family]) byFamily[p.family] = [];
      byFamily[p.family].push(p);
    });

    const familyEntries = Object.entries(byFamily).map(([familyId, products]) => {
      const total = products.reduce((a, p) => a + p.total, 0);
      const active = products.reduce((a, p) => a + p.active, 0);
      const pct = total ? Math.round((active / total) * 100) : 0;
      return { familyId, products, total, active, pct };
    });
    familyEntries.sort((a, b) => b.pct - a.pct); // order the family blocks, best coverage first

    const rows = [];
    familyEntries.forEach(({ familyId, products, total, active, pct }) => {
      const familyMeta = productsCatalog.families[familyId];
      rows.push({
        kind: "family",
        id: familyId,
        label: familyMeta ? familyMeta.name : products[0].label,
        active, total, pct,
        childCount: products.length,
      });
      if (products.length > 1) {
        products
          .slice()
          .sort((a, b) => b.pct - a.pct) // order the product sub-rows within this family block, same convention
          .forEach((p) => rows.push({ kind: "product", id: p.product, family: familyId, label: p.label, active: p.active, total: p.total, pct: p.pct }));
      }
    });
    return rows;
  }

  /**
   * Ransomware kill-chain visibility. For each stage in ransomware-chain.json,
   * finds every source tagged with at least one of that stage's MITRE
   * techniques, and reports whether the stage is "covered" (every matching
   * source active), "blind" (every matching source locked or config-gapped),
   * "partial" (mixed), or "unmapped" (no source currently tagged with any of
   * the stage's techniques at all — a data gap to fix, not a licensing one).
   * Deliberately separate from computeMitreCoverage: this view exists
   * specifically to answer "are we exposed to ransomware," not to enumerate
   * every gapped technique in the environment.
   */
  function computeRansomwareExposure(sourcesWithState, ransomwareChain) {
    const stages = ransomwareChain.stages.map((stage) => {
      const matches = sourcesWithState.filter((s) => (s.mitreTechniques || []).some((t) => stage.techniques.includes(t)));
      const activeMatches = matches.filter((s) => !s.locked);
      let status;
      if (!matches.length) status = "unmapped";
      else if (activeMatches.length === matches.length) status = "covered";
      else if (activeMatches.length === 0) status = "blind";
      else status = "partial";
      return {
        id: stage.id,
        title: stage.title,
        blurb: stage.blurb,
        techniqueIds: stage.techniques,
        sources: matches,
        activeCount: activeMatches.length,
        totalCount: matches.length,
        status,
      };
    });
    const blindCount = stages.filter((s) => s.status === "blind" || s.status === "unmapped").length;
    return { stages, blindCount, totalStages: stages.length };
  }

  /** Score each risk-narrative candidate by how many / how severe its trigger
   *  sources are currently gapped, and return the top N. */
  function computeTopRisks(sourcesWithState, riskNarratives, topN) {
    const byId = {};
    sourcesWithState.forEach((s) => (byId[s.id] = s));
    const scored = riskNarratives.candidates.map((cand) => {
      let score = 0;
      let anyGapped = false;
      cand.triggerSourceIds.forEach((id) => {
        const s = byId[id];
        if (s && (s.locked || s.needsConfig)) {
          anyGapped = true;
          score += (SEVERITY_WEIGHT[s.severity] || 0) + 1;
        }
      });
      return { cand, score, anyGapped };
    });
    return scored
      .filter((r) => r.anyGapped)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN || 3)
      .map((r) => r.cand);
  }

  /** Group every gapped source's MITRE techniques into the A/B/C/D narrative
   *  sections, deduplicating technique mentions within a group. */
  function computeMitreCoverage(sourcesWithState, mitreData, tacticGroups) {
    const tacticToGroup = {};
    tacticGroups.groups.forEach((g) => g.tactics.forEach((t) => (tacticToGroup[t] = g.id)));

    const groups = {};
    tacticGroups.groups.forEach((g) => (groups[g.id] = { id: g.id, title: g.title, techniqueIds: new Set(), sources: [] }));

    sourcesWithState
      .filter((s) => (s.locked || s.needsConfig) && s.mitreTechniques && s.mitreTechniques.length)
      .forEach((s) => {
        s.mitreTechniques.forEach((techId) => {
          const tech = mitreData.techniques[techId];
          if (!tech) return;
          tech.tactics.forEach((tacticId) => {
            const groupId = tacticToGroup[tacticId];
            if (!groupId) return;
            groups[groupId].techniqueIds.add(techId);
          });
        });
        // record which group(s) this source's "missing capability" note belongs to
        s.mitreTechniques.forEach((techId) => {
          const tech = mitreData.techniques[techId];
          if (!tech) return;
          tech.tactics.forEach((tacticId) => {
            const groupId = tacticToGroup[tacticId];
            if (groupId && !groups[groupId].sources.find((x) => x.id === s.id)) {
              groups[groupId].sources.push(s);
            }
          });
        });
      });

    return tacticGroups.groups.map((g) => ({
      id: g.id,
      title: g.title,
      techniques: Array.from(groups[g.id].techniqueIds).map((id) => Object.assign({ id }, mitreData.techniques[id])),
      gappedSources: groups[g.id].sources,
    }));
  }

  /** Build the Track 2 (paid) roadmap: one row per license that unlocks at
   *  least one currently-locked source, ranked by mitigation value. */
  function computeRoadmap(sourcesWithState, licenseCatalog) {
    const byLicense = {};
    sourcesWithState
      .filter((s) => s.locked && s.gateType === "license")
      .forEach((s) => {
        const reqs = s.requiresAnyOf || (s.requiresLicense ? [s.requiresLicense] : []);
        // Attribute the source to its FIRST listed requirement for roadmap grouping;
        // requiresAnyOf sources still show up once, other license readers can filter by requiresLicense directly.
        const primary = reqs[0];
        if (!primary) return;
        if (!byLicense[primary]) byLicense[primary] = { licenseId: primary, sources: [], mitreTechniqueIds: new Set() };
        byLicense[primary].sources.push(s);
        (s.mitreTechniques || []).forEach((t) => byLicense[primary].mitreTechniqueIds.add(t));
      });

    const licById = {};
    licenseCatalog.licenses.forEach((l) => (licById[l.id] = l));

    const rows = Object.values(byLicense).map((row) => {
      const score = row.sources.reduce((acc, s) => acc + (SEVERITY_WEIGHT[s.severity] || 0) + 1, 0);
      return {
        license: licById[row.licenseId] || { id: row.licenseId, name: { en: row.licenseId, fr: row.licenseId } },
        sourceCount: row.sources.length,
        sources: row.sources,
        mitreTechniqueIds: Array.from(row.mitreTechniqueIds),
        score,
      };
    });
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => (r.priority = i + 1));
    return rows;
  }

  /** Track 1: sources whose gap is a free config fix, not a license. */
  function computeFreeFixes(sourcesWithState) {
    return sourcesWithState.filter((s) => s.needsConfig);
  }

  /**
   * Top-level orchestrator.
   * @param {Object} input
   * @param {Object} input.sources        - parsed sources.example.json .sources
   * @param {Object} input.licenseCatalog - parsed licenses.json
   * @param {Object} input.mitreData      - parsed mitre-mapping.json
   * @param {Object} input.tacticGroups   - parsed tactic-groups.json
   * @param {Object} input.riskNarratives - parsed risk-narratives.json
   * @param {Object} input.productsCatalog - parsed products.json
   * @param {Object} input.ransomwareChain - parsed ransomware-chain.json
   * @param {string[]} input.selectedLicenseIds - license ids the user selected in the panel
   */
  function buildReportModel(input) {
    const { held, unknown } = resolveHeldLicenses(input.licenseCatalog, input.selectedLicenseIds);
    const sourcesWithState = computeSourceStates(input.sources, held);

    const totalCount = sourcesWithState.length;
    const activeCount = sourcesWithState.filter((s) => !s.locked).length;
    const lockedCount = totalCount - activeCount;
    const licenseLockedCount = sourcesWithState.filter((s) => s.locked && s.gateType === "license").length;
    const configGapCount = sourcesWithState.filter((s) => s.needsConfig).length;
    const criticalLocked = sourcesWithState.filter((s) => s.locked && s.severity === "critical").length;
    const highLocked = sourcesWithState.filter((s) => s.locked && s.severity === "high").length;

    return {
      generatedAt: new Date().toISOString(),
      selectedLicenseIds: input.selectedLicenseIds,
      heldLicenseIds: Array.from(held),
      unknownLicenseIds: Array.from(unknown),
      sources: sourcesWithState,
      stats: {
        totalCount,
        activeCount,
        lockedCount,
        licenseLockedCount,
        configGapCount,
        activePct: totalCount ? Math.round((activeCount / totalCount) * 100) : 0,
        criticalLocked,
        highLocked,
      },
      postureRows: computePostureRows(sourcesWithState, input.productsCatalog),
      ransomwareExposure: computeRansomwareExposure(sourcesWithState, input.ransomwareChain),
      topRisks: computeTopRisks(sourcesWithState, input.riskNarratives, 3),
      mitreCoverage: computeMitreCoverage(sourcesWithState, input.mitreData, input.tacticGroups),
      roadmap: computeRoadmap(sourcesWithState, input.licenseCatalog),
      freeFixes: computeFreeFixes(sourcesWithState),
    };
  }

  return {
    resolveHeldLicenses,
    computeSourceStates,
    computePostureRows,
    computeRansomwareExposure,
    computeTopRisks,
    computeMitreCoverage,
    computeRoadmap,
    computeFreeFixes,
    buildReportModel,
  };
});
