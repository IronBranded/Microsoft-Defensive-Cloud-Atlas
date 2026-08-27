/**
 * Renders the Executive Brief (Microsoft 365 Licensing Gaps) as an HTML string
 * for the standalone report page (dist/executive-brief.html) — a
 * document-style light theme, deliberately unrelated to the Atlas SPA's
 * dark terminal theme, since this report is a separate artifact opened
 * after the Atlas findings are printed, not a screen inside the SPA.
 *
 * Same contract as report-engine.js: pure function, MODEL + language in,
 * an HTML string out. No fetch, no globals beyond what's passed in.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AtlasStandaloneReport = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const i18n = typeof require !== "undefined" ? require("./i18n.js") : AtlasI18n;

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function sevChip(sev, label) {
    return '<span class="chip ' + sev + '">' + esc(label) + "</span>";
  }
  function readingKey(pct) {
    return pct >= 70 ? "high" : pct >= 40 ? "mid" : "low";
  }

  /** @param model report-engine.js#buildReportModel() output
   *  @param lang "en" | "fr"
   *  @param i18nCatalogs { en: {...}, fr: {...} }
   *  @param scopeLabel human-readable label for the selected scope, already localized by the caller
   *  @returns HTML string for the #sheet container (cover + all sections) */
  function renderSheet(model, lang, i18nCatalogs, scopeLabel) {
    const cat = i18nCatalogs[lang];
    const t = (k, vars) => i18n.t(cat, k, vars);
    const s = model.stats;

    const statStrip = [
      [s.activeCount, t("stats.logSourcesAvailable")],
      [s.licenseLockedCount, t("stats.logSourcesLocked")],
      [model.selectedLicenseIds.length, t("stats.licensesActive")],
      [s.criticalLocked, t("severity.critical")],
      [s.highLocked, t("severity.high")],
      [s.activePct + "%", t("stats.overallCoverage")],
    ]
      .map(([n, l]) => '<div class="stat-box"><div class="stat-n">' + esc(n) + '</div><div class="stat-l">' + esc(l) + "</div></div>")
      .join("");

    const covRows = model.postureRows
      .map((r) => {
        if (r.kind === "family") {
          const childHint = r.childCount > 1 ? ` <span class="fam-hint">(${r.childCount} ${esc(t("section1.productsWord"))})</span>` : "";
          return (
            "<tr class=\"fam-row\"><td><strong>" + esc(r.label[lang]) + childHint + '</strong></td><td>' + r.active + "/" + r.total + ' &nbsp; <span class="mono">' + r.pct + '%</span></td><td>' + esc(t("section1.coverageReading." + readingKey(r.pct))) + "</td></tr>"
          );
        }
        return (
          "<tr class=\"prod-row\"><td class=\"prod-label\">" + esc(r.label[lang]) + '</td><td>' + r.active + "/" + r.total + ' &nbsp; <span class="mono">' + r.pct + '%</span></td><td>' + esc(t("section1.coverageReading." + readingKey(r.pct))) + "</td></tr>"
        );
      })
      .join("");

    const risks = model.topRisks
      .map((r, i) => '<div class="risk"><div class="n">' + (i + 1) + '</div><div><div class="t">' + esc(r.title[lang]) + '</div><div class="b">' + esc(r.body[lang]) + "</div></div></div>")
      .join("");

    const re = model.ransomwareExposure;
    const rcStages = re.stages
      .map(
        (s, i) =>
          (i > 0 ? '<div class="rc-arrow">→</div>' : "") +
          '<div class="rc-stage ' + (s.status === "unmapped" ? "blind" : s.status) + '">' +
          '<div class="rc-n">' + (i + 1) + "/" + re.totalStages + "</div>" +
          '<div class="rc-title">' + esc(s.title[lang]) + "</div>" +
          '<div class="rc-blurb">' + esc(s.blurb[lang]) + "</div>" +
          '<span class="rc-badge">' + esc(t("section1.ransomwareStatus." + s.status)) + " " + s.activeCount + "/" + s.totalCount + "</span>" +
          "</div>"
      )
      .join("");
    const rcHeadline =
      '<div class="rc-headline"><div class="n">' + re.blindCount + "/" + re.totalStages + '</div><div class="t">' +
      esc(t("section1.ransomwareBlindHeadline", { blindCount: re.blindCount, totalStages: re.totalStages })) + "</div></div>";

    const gapRows = model.sources
      .map(
        (src) =>
          '<tr><td><span class="mono">' + esc(src.table) + "</span></td><td>" + esc(src.name[lang]) + "</td><td>" + esc(t("section2.status." + src.statusKey)) + "</td><td>" + esc(src.retentionNative[lang]) + "</td></tr>"
      )
      .join("");

    const mitreGroups = model.mitreCoverage
      .filter((g) => g.techniques.length)
      .map((g) => {
        const techList = g.techniques
          .map((tech) => "<li><span class=\"mono\">" + esc(tech.id) + "</span> <strong>" + esc(tech.name[lang]) + "</strong>" + (tech.note[lang] ? " — " + esc(tech.note[lang]) : "") + "</li>")
          .join("");
        const missing = g.gappedSources
          .map((src) => "<li><span class=\"mono\">" + esc(src.table) + "</span> (" + esc(src.name[lang]) + ") " + sevChip(src.severity, t("severity." + src.severity)) + "</li>")
          .join("");
        return (
          '<div class="mitre-group"><h3 class="sub">' + esc(g.id) + ". " + esc(g.title[lang]) + '</h3>' +
          '<h4 class="subtle">' + esc(t("section3.techniquesTitle")) + "</h4><ul>" + techList + "</ul>" +
          '<h4 class="subtle">' + esc(t("section3.missingTitle")) + "</h4><ul>" + missing + "</ul></div>"
        );
      })
      .join("");

    const freeRows = model.freeFixes.map((f) => '<li><span class="mono">' + esc(f.table) + "</span> — " + esc(f.name[lang]) + "</li>").join("");
    const roadmapRows = model.roadmap
      .map((r) => {
        const mitreNames = r.mitreTechniqueIds.map((id) => '<span class="mono">' + esc(id) + "</span>").join(", ") || "—";
        const sourceNames = r.sources.map((x) => esc(x.table)).join(", ");
        return "<tr><td>" + r.priority + "</td><td><strong>" + esc(r.license.name[lang]) + "</strong></td><td>" + sourceNames + "</td><td>" + mitreNames + "</td></tr>";
      })
      .join("");

    // Section 4 (IR impact) — the retention figures and checklist items reference the
    // sources that actually drive urgency (UAL, sign-in logs, MDE hunting, message trace);
    // these are curated, bilingual narrative rather than fully generalized from the
    // dataset (see README.md > "What still needs a human").
    const irChecklist = [
      { en: "Preserve MDI timeline for on-prem AD lateral movement", fr: "Préserver la chronologie MDI pour le déplacement latéral AD local", blocked: !model.heldLicenseIds.includes("mdi") },
      { en: "Verify Advanced Audit is ON (MailItemsAccessed, SearchQueryInitiated)", fr: "Vérifier qu'Advanced Audit est activé (MailItemsAccessed, SearchQueryInitiated)", blocked: model.sources.some((s) => s.id === "mail-items-accessed" && s.locked) },
      { en: "Capture current OAuth app consents and delegated permissions", fr: "Capturer les consentements d'applications OAuth actuels et les permissions déléguées", blocked: model.sources.some((s) => s.id === "cloud-app-events" && s.locked) },
      { en: "Place affected mailboxes on Legal Hold via Purview eDiscovery (Premium features limited)", fr: "Placer les boîtes affectées sous suspension légale via Purview eDiscovery (fonctions Premium limitées)", blocked: model.sources.some((s) => s.id === "edisc-premium-advanced" && s.locked) },
    ];
    const checklistRows = irChecklist
      .map((c) => '<li>' + esc(c[lang]) + (c.blocked ? " " + sevChip("high", t("severity.high")) : "") + "</li>")
      .join("");

    const unknownNote = model.unknownLicenseIds && model.unknownLicenseIds.length
      ? '<div class="method-note" style="border-color:var(--high);color:var(--high);"><b>' + esc(t("meta.unknownLicenseNoteLabel")) + '</b> ' +
        esc(t("meta.unknownLicenseNote", { count: model.unknownLicenseIds.length, ids: model.unknownLicenseIds.join(", ") })) + "</div>"
      : "";

    return `
    <div class="cover-kicker">${esc(t("meta.classificationValue"))}</div>
    <h1 class="cover-title">${esc(t("meta.docTitle"))}</h1>
    <div class="cover-sub">${esc(t("meta.docSubtitle"))} — ${esc(scopeLabel)}</div>
    <table class="meta-table">
      <tr><td>${esc(t("meta.preparedForLabel"))}</td><td>${esc(t("meta.preparedForValue"))}</td></tr>
      <tr><td>${esc(t("meta.dateLabel"))}</td><td>${new Date().toISOString().slice(0, 10)}</td></tr>
      <tr><td>${esc(t("meta.sourceLabel"))}</td><td>${esc(t("meta.sourceValue", { scopeNames: scopeLabel }))}</td></tr>
    </table>
    <div class="method-note"><b>${esc(t("meta.methodNoteLabel"))}</b> ${esc(t("meta.methodNote"))}</div>
    ${unknownNote}
    <div class="contents">
      <div class="contents-title">${esc(t("summary.title"))}</div>
      <a href="#s1">${esc(t("summary.s1"))}</a>
      <a href="#s2">${esc(t("summary.s2"))}</a>
      <a href="#s3">${esc(t("summary.s3"))}</a>
      <a href="#s4">${esc(t("summary.s4"))}</a>
      <a href="#s5">${esc(t("summary.s5"))}</a>
    </div>

    <h2 class="sec" id="s1">${esc(t("section1.title"))}</h2>
    <div class="stat-strip">${statStrip}</div>
    <h3 class="sub">${esc(t("section1.postureTitle"))}</h3>
    <p>${esc(t("section1.postureIntro", { activeCount: s.activeCount, totalCount: s.totalCount, activePct: s.activePct }))}</p>
    <table class="rep"><thead><tr><th>${esc(t("section1.categoryHeaders").category)}</th><th>${esc(t("section1.categoryHeaders").coverage)}</th><th>${esc(t("section1.categoryHeaders").reading)}</th></tr></thead><tbody>${covRows}</tbody></table>
    <h3 class="sub">${esc(t("section1.top3Title"))}</h3>
    ${risks}
    <h3 class="sub">${esc(t("section1.ransomwareTitle"))}</h3>
    <p>${esc(t("section1.ransomwareIntro"))}</p>
    ${rcHeadline}
    <div class="rc-chain">${rcStages}</div>
    <h3 class="sub">${esc(t("section1.roiTitle"))}</h3>
    <p>${esc(t("section1.roiIntro"))}</p>
    <ul class="plain">${model.roadmap.slice(0, 3).map((r) => "<li><strong>" + esc(r.license.name[lang]) + "</strong> — " + r.sourceCount + " " + esc(t("stats.logSourcesLocked")).toLowerCase() + "</li>").join("")}</ul>

    <h2 class="sec" id="s2">${esc(t("section2.title"))}</h2>
    <p>${esc(t("section2.intro", { active: t("section2.activeWord"), available: t("section2.availableWord"), locked: t("section2.lockedWord") }))}</p>
    <table class="rep"><thead><tr><th>${esc(t("section2.table").source)}</th><th>${esc(t("section2.table").license)}</th><th>${esc(t("section2.table").status)}</th><th>${esc(t("section2.table").retention)}</th></tr></thead><tbody>${gapRows}</tbody></table>

    <h2 class="sec" id="s3">${esc(t("section3.title"))}</h2>
    <p>${esc(t("section3.intro"))}</p>
    ${mitreGroups}

    <h2 class="sec" id="s4">${esc(t("section4.title"))}</h2>
    <h3 class="sub">${esc(t("section4.mttdTitle"))}</h3>
    <p>${esc(t("section4.mttdBody"))}</p>
    <p>${esc(t("section4.mttdBody2"))}</p>
    <h3 class="sub">${esc(t("section4.mttrTitle"))}</h3>
    <p>${esc(t("section4.mttrIntro"))}</p>
    <ul class="plain">${i18n.get(cat, "section4.mttrBullets").map((b) => "<li>" + esc(b) + "</li>").join("")}</ul>
    <p>${esc(t("section4.mttrClosing"))}</p>
    <h3 class="sub">${esc(t("section4.firstResponderTitle"))}</h3>
    <p>${esc(t("section4.firstResponderIntro"))}</p>
    <ul class="plain">${checklistRows}</ul>

    <h2 class="sec" id="s5">${esc(t("section5.title"))}</h2>
    <h3 class="sub">${esc(t("section5.track1Title"))}</h3>
    <p>${esc(t("section5.track1Intro"))}</p>
    <ul class="plain">${freeRows}</ul>
    <h3 class="sub">${esc(t("section5.track2Title"))}</h3>
    <p>${esc(t("section5.track2Intro"))}</p>
    <table class="rep"><thead><tr><th>${esc(t("section5.roadmapTable").priority)}</th><th>${esc(t("section5.roadmapTable").license)}</th><th>${esc(t("section5.roadmapTable").unlocks)}</th><th>${esc(t("section5.roadmapTable").mitre)}</th></tr></thead><tbody>${roadmapRows}</tbody></table>

    <div class="disclaimer">${esc(t("references.finalDisclaimerLabel"))} ${esc(t("references.finalDisclaimer"))}</div>
  `;
  }

  return { renderSheet, esc };
});
