/**
 * Optional companion export: same report MODEL + i18n catalogs that drive
 * render-html.js, rendered as a .docx instead. Node-only (uses the `docx`
 * npm package) — deliberately kept OUT of the zero-dependency browser tool.
 * Run: node src/render-docx.js <lang: en|fr> <scopeId>
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, VerticalAlign,
} = require("docx");
const i18n = require("./i18n.js");

const NAVY = "1F3864", GREY = "595959", BORDER_GREY = "BFBFBF", FONT = "Calibri", MONO = "Consolas", RED = "B00020", HIGH = "9C5700";
const PAGE_W = 12240, MARGIN = 1350, USABLE_W = PAGE_W - MARGIN * 2;

function run(part) {
  if (typeof part === "string") part = { text: part };
  return new TextRun({ text: part.text, bold: !!part.bold, italics: !!part.italics, color: part.color || "000000", font: part.mono ? MONO : FONT, size: part.size || (part.mono ? 18 : 21) });
}
function P(parts, opts = {}) {
  return new Paragraph({ children: (Array.isArray(parts) ? parts : [parts]).map(run), spacing: opts.spacing || { after: 140, line: 264 } });
}
function H1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }, border: { bottom: { color: NAVY, space: 6, style: BorderStyle.SINGLE, size: 10 } }, children: [new TextRun({ text, bold: true, color: NAVY, size: 28, font: FONT })] });
}
function H2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 }, children: [new TextRun({ text, bold: true, color: NAVY, size: 23, font: FONT })] });
}
function bullet(parts) {
  return new Paragraph({ children: (Array.isArray(parts) ? parts : [parts]).map(run), numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 } });
}
function cell(content, width, fill) {
  const parts = Array.isArray(content) ? content : [content];
  return new TableCell({ width: { size: width, type: WidthType.DXA }, shading: fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : undefined, verticalAlign: VerticalAlign.TOP, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: parts.map(run), spacing: { after: 0, line: 240 } })] });
}
function table(headers, rows, widths) {
  const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell([{ text: h, bold: true, color: "FFFFFF", size: 18 }], widths[i], NAVY)) });
  const body = rows.map((r, i) => new TableRow({ cantSplit: true, children: r.map((c, j) => cell(c, widths[j], i % 2 ? "F2F2F2" : "FFFFFF")) }));
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows: [headerRow, ...body], borders: Object.fromEntries(["top", "bottom", "left", "right", "insideHorizontal", "insideVertical"].map((k) => [k, { style: BorderStyle.SINGLE, size: 4, color: BORDER_GREY }])) });
}

function buildDocx(model, lang, i18nCatalogs, mitreData) {
  const cat = i18nCatalogs[lang];
  const t = (k, vars) => i18n.t(cat, k, vars);
  const children = [];

  children.push(new Paragraph({ children: [new TextRun({ text: t("meta.docTitle"), bold: true, color: NAVY, size: 40, font: FONT })], spacing: { after: 200 } }));
  children.push(P([{ text: t("meta.docSubtitle"), italics: true, color: NAVY, size: 22 }], { spacing: { after: 280 } }));

  const metaRows = [
    [t("meta.preparedForLabel"), t("meta.preparedForValue")],
    [t("meta.dateLabel"), new Date().toISOString().slice(0, 10)],
    [t("meta.classificationLabel"), t("meta.classificationValue")],
  ];
  children.push(table(["", ""], metaRows.map((r) => [[{ text: r[0], bold: true, size: 19 }], [{ text: r[1], size: 19 }]]), [2400, USABLE_W - 2400]));
  children.push(P([{ text: t("meta.methodNoteLabel") + " ", bold: true, italics: true, color: GREY, size: 17 }, { text: t("meta.methodNote"), italics: true, color: GREY, size: 17 }], { spacing: { before: 200, after: 300 } }));

  // Section 1
  children.push(H1(t("section1.title")));
  children.push(H2(t("section1.postureTitle")));
  children.push(P(t("section1.postureIntro", { activeCount: model.stats.activeCount, totalCount: model.stats.totalCount, activePct: model.stats.activePct })));
  const covRows = model.postureRows.map((r) => {
    const readingKey = t("section1.coverageReading." + (r.pct >= 70 ? "high" : r.pct >= 40 ? "mid" : "low"));
    if (r.kind === "family") {
      const hint = r.childCount > 1 ? `  (${r.childCount} ${t("section1.productsWord")})` : "";
      return [[{ text: r.label[lang] + hint, bold: true, size: 19 }], [{ text: `${r.active}/${r.total} — ${r.pct}%`, size: 19 }], [{ text: readingKey, size: 19 }]];
    }
    return [[{ text: "     – " + r.label[lang], size: 18, color: GREY }], [{ text: `${r.active}/${r.total} — ${r.pct}%`, size: 18, color: GREY }], [{ text: readingKey, size: 18, color: GREY }]];
  });
  children.push(table([t("section1.categoryHeaders").category, t("section1.categoryHeaders").coverage, t("section1.categoryHeaders").reading], covRows, [2400, 2200, USABLE_W - 4600]));
  children.push(H2(t("section1.top3Title")));
  model.topRisks.forEach((r, i) => {
    children.push(P([{ text: `${i + 1}. ${r.title[lang]}`, bold: true, color: NAVY, size: 21 }], { spacing: { before: 160, after: 60 } }));
    children.push(P(r.body[lang]));
  });

  // 1.3 Ransomware exposure — kept as its own subsection, not folded into the
  // scored Top 3, for the same reason as the HTML renderer: board-level
  // threats get a guaranteed answer, not a maybe-mention.
  children.push(H2(t("section1.ransomwareTitle")));
  children.push(P(t("section1.ransomwareIntro")));
  const re = model.ransomwareExposure;
  children.push(P([{ text: t("section1.ransomwareBlindHeadline", { blindCount: re.blindCount, totalStages: re.totalStages }), bold: true, color: RED, size: 22 }], { spacing: { before: 100, after: 160 } }));
  const rcRows = re.stages.map((st, i) => [
    [{ text: `${i + 1}. ${st.title[lang]}`, bold: true, size: 19 }],
    [{ text: t("section1.ransomwareStatus." + st.status) + ` (${st.activeCount}/${st.totalCount})`, bold: true, size: 19, color: st.status === "covered" ? "1E6B3A" : st.status === "partial" ? HIGH : RED }],
    [{ text: st.blurb[lang], size: 18 }],
  ]);
  children.push(table(["#/" + t("section1.ransomwareTitle").split(" ")[0], t("section2.table").status, t("section1.categoryHeaders").reading], rcRows, [3500, 1800, USABLE_W - 5300]));

  children.push(H2(t("section1.roiTitle")));
  children.push(P(t("section1.roiIntro")));
  model.roadmap.slice(0, 3).forEach((r) => children.push(bullet([{ text: r.license.name[lang], bold: true }, { text: ` — ${r.sourceCount} ${t("stats.logSourcesLocked").toLowerCase()}` }])));

  // Section 2
  children.push(H1(t("section2.title")));
  const tbl2 = t("section2.table");
  const rows2 = model.sources.map((s) => [[{ text: s.table, mono: true }], [{ text: s.name[lang], size: 19 }], [{ text: t("section2.status." + s.statusKey), size: 19 }], [{ text: s.retentionNative[lang], size: 19 }]]);
  const w2 = [2400, 2200, 1300, USABLE_W - 5900];
  children.push(table([tbl2.source, tbl2.license, tbl2.status, tbl2.retention], rows2, w2));

  // Section 3
  children.push(H1(t("section3.title")));
  children.push(P(t("section3.intro")));
  model.mitreCoverage.filter((g) => g.techniques.length).forEach((g) => {
    children.push(H2(`${g.id}. ${g.title[lang]}`));
    children.push(P([{ text: t("section3.techniquesTitle"), bold: true, size: 20 }]));
    g.techniques.forEach((tech) => children.push(bullet([{ text: tech.id + " ", bold: true, mono: true }, { text: tech.name[lang], bold: true }, tech.note[lang] ? { text: " — " + tech.note[lang] } : ""])));
    children.push(P([{ text: t("section3.missingTitle"), bold: true, size: 20 }]));
    g.gappedSources.forEach((s) => children.push(bullet([{ text: s.table + " ", mono: true }, { text: `(${s.name[lang]}) — ${s.severity}` }])));
  });

  // Section 4 (IR impact)
  children.push(H1(t("section4.title")));
  children.push(H2(t("section4.mttdTitle")));
  children.push(P(t("section4.mttdBody")));
  children.push(P(t("section4.mttdBody2")));
  children.push(H2(t("section4.mttrTitle")));
  children.push(P(t("section4.mttrIntro")));
  i18n.get(cat, "section4.mttrBullets").forEach((b) => children.push(bullet(b)));
  children.push(P(t("section4.mttrClosing")));
  children.push(H2(t("section4.firstResponderTitle")));
  children.push(P(t("section4.firstResponderIntro")));
  const irChecklist = [
    { en: "Preserve MDI timeline for on-prem AD lateral movement", fr: "Préserver la chronologie MDI pour le déplacement latéral AD local", blocked: !model.heldLicenseIds.includes("mdi") },
    { en: "Verify Advanced Audit is ON (MailItemsAccessed, SearchQueryInitiated)", fr: "Vérifier qu'Advanced Audit est activé (MailItemsAccessed, SearchQueryInitiated)", blocked: model.sources.some((s) => s.id === "mail-items-accessed" && s.locked) },
    { en: "Capture current OAuth app consents and delegated permissions", fr: "Capturer les consentements d'applications OAuth actuels et les permissions déléguées", blocked: model.sources.some((s) => s.id === "cloud-app-events" && s.locked) },
    { en: "Place affected mailboxes on Legal Hold via Purview eDiscovery (Premium features limited)", fr: "Placer les boîtes affectées sous suspension légale via Purview eDiscovery (fonctions Premium limitées)", blocked: model.sources.some((s) => s.id === "edisc-premium-advanced" && s.locked) },
  ];
  irChecklist.forEach((c) => children.push(bullet([{ text: c[lang] }, c.blocked ? { text: "  [" + t("severity.high") + "]", bold: true, color: "C55A11" } : { text: "" }])));

  // Section 5 (roadmap — the highest-value section for a leadership doc)
  children.push(H1(t("section5.title")));
  children.push(H2(t("section5.track1Title")));
  children.push(P(t("section5.track1Intro")));
  model.freeFixes.forEach((f) => children.push(bullet([{ text: f.table + " ", mono: true }, { text: "— " + f.name[lang] }])));
  children.push(H2(t("section5.track2Title")));
  children.push(P(t("section5.track2Intro")));
  const rt = t("section5.roadmapTable");
  const rows5 = model.roadmap.map((r) => [
    [{ text: String(r.priority), size: 19 }],
    [{ text: r.license.name[lang], bold: true, size: 19 }],
    [{ text: r.sources.map((s) => s.table).join(", "), size: 17, mono: true }],
    [{ text: r.mitreTechniqueIds.join(", ") || "—", size: 17, mono: true }],
  ]);
  children.push(table([rt.priority, rt.license, rt.unlocks, rt.mitre], rows5, [500, 2000, 3500, USABLE_W - 6000]));

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: "bullet", text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] }] },
    sections: [{ properties: { page: { size: { width: PAGE_W, height: 15840 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children }],
  });
}

module.exports = { buildDocx };

// CLI usage: node src/render-docx.js fr biz-premium
if (require.main === module) {
  const engine = require("./report-engine.js");
  const ROOT = path.join(__dirname, "..");
  const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
  const lang = process.argv[2] || "fr";
  const scopeArg = process.argv[3] || "biz-premium";

  const sourcesData = readJSON("data/sources.example.json");
  const licenseCatalog = readJSON("data/licenses.json");
  const mitreData = readJSON("data/mitre-mapping.json");
  const tacticGroups = readJSON("data/tactic-groups.json");
  const riskNarratives = readJSON("data/risk-narratives.json");
  const productsCatalog = readJSON("data/products.json");
  const ransomwareChain = readJSON("data/ransomware-chain.json");
  const i18nCatalogs = { en: readJSON("i18n/en.json"), fr: readJSON("i18n/fr.json") };

  const model = engine.buildReportModel({ sources: sourcesData.sources, licenseCatalog, mitreData, tacticGroups, riskNarratives, productsCatalog, ransomwareChain, selectedLicenseIds: scopeArg.split(",") });
  const doc = buildDocx(model, lang, i18nCatalogs, mitreData);
  const outDir = path.join(ROOT, "dist");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = path.join(outDir, `executive-brief_${scopeArg}_${lang}.docx`);
  Packer.toBuffer(doc).then((buf) => {
    fs.writeFileSync(outPath, buf);
    console.log("Wrote", outPath, buf.length, "bytes");
  });
}
