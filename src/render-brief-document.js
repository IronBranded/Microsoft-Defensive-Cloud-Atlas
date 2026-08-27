/**
 * Builds the complete standalone HTML document for one Executive Brief
 * popup/tab, from an ALREADY-COMPUTED report model.
 *
 * This is the piece that makes "no separate executive-brief.html file
 * needed" possible: the Atlas (index.html) computes the model itself (it
 * already has report-engine.js + the data loaded for its own purposes —
 * see build/build-atlas-bundle.js), then calls buildBriefDocument() to get
 * back a full HTML string, and opens that directly (Blob URL or
 * document.write) — no navigation to a second file on disk. The popup only
 * needs the RENDERING half (i18n.js + render-report.js) inlined, not the
 * full engine or raw data, since the model is passed in pre-computed.
 *
 * Same function also powers the standalone dev-preview tool
 * (build/build-report-page.js writes dist/executive-brief.html) — there,
 * the full engine+data are inlined instead because that page computes its
 * own model client-side from a ?scope= URL param at load time. Two
 * different callers, one shared "given a model, build the document" core.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AtlasBriefDocument = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * @param {Object} opts
   * @param {Object} opts.model          - report-engine.js#buildReportModel() output (language-agnostic)
   * @param {string} opts.initialLang    - "en" | "fr"
   * @param {Object} opts.i18nCatalogs   - { en: {...}, fr: {...} }
   * @param {Object} opts.scopeLabels    - { en: "...", fr: "..." } — precomputed by the caller
   *                                        (who has the license catalog for name lookups), so this
   *                                        module never needs the full license list, just the labels.
   * @param {string} opts.themeCss       - contents of theme/report-light.css
   * @param {string} opts.rendererSrc    - i18n.js + render-report.js source, concatenated
   * @returns {string} a complete <!DOCTYPE html> document
   */
  function buildBriefDocument(opts) {
    const modelJson = JSON.stringify(opts.model);
    const i18nJson = JSON.stringify(opts.i18nCatalogs);
    const labelsJson = JSON.stringify(opts.scopeLabels);

    return (
      "<!DOCTYPE html>\n" +
      '<html lang="' + opts.initialLang + '">\n' +
      "<head>\n" +
      '<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      "<title>Executive Brief: Microsoft 365 Licensing Gaps</title>\n" +
      "<style>\n" + opts.themeCss + "\n</style>\n" +
      "</head>\n<body>\n" +
      '<div class="control-bar">\n' +
      '  <div class="cb-title">Executive Brief</div>\n' +
      '  <div class="lang-toggle" id="lang-toggle" style="margin-left:auto;">\n' +
      '    <button data-lang="en">EN</button>\n' +
      '    <button data-lang="fr">FR</button>\n' +
      "  </div>\n" +
      '  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>\n' +
      "</div>\n" +
      '<div class="sheet" id="sheet"></div>\n' +
      "<script>\n" +
      "const MODEL = " + modelJson + ";\n" +
      "const I18N = " + i18nJson + ";\n" +
      "const SCOPE_LABELS = " + labelsJson + ";\n" +
      opts.rendererSrc + "\n" +
      "let lang = " + JSON.stringify(opts.initialLang) + ";\n" +
      "function rerender() {\n" +
      "  const scopeLabel = SCOPE_LABELS[lang];\n" +
      '  document.getElementById("sheet").innerHTML = AtlasStandaloneReport.renderSheet(MODEL, lang, I18N, scopeLabel);\n' +
      '  document.querySelectorAll(".lang-toggle button").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));\n' +
      '  document.title = "Executive Brief: MS365 Licensing Gaps — " + scopeLabel;\n' +
      "}\n" +
      'document.getElementById("lang-toggle").addEventListener("click", (e) => {\n' +
      '  const btn = e.target.closest("button[data-lang]");\n' +
      "  if (!btn) return;\n" +
      "  lang = btn.dataset.lang;\n" +
      "  rerender();\n" +
      "});\n" +
      "rerender();\n" +
      "<\/script>\n</body>\n</html>\n"
    );
  }

  /** Opens a built document in a new tab via a Blob URL — no document.write()
   *  quirks-mode issues, and the URL can be revoked once the tab has loaded. */
  function openBriefDocument(htmlString) {
    const blob = new Blob([htmlString], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) {
      w.addEventListener("load", () => setTimeout(() => URL.revokeObjectURL(url), 2000));
    }
    return w;
  }

  return { buildBriefDocument, openBriefDocument };
});
