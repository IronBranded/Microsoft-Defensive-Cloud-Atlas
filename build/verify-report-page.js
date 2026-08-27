const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

  const base = "file://" + path.join(__dirname, "..", "dist", "executive-brief.html");

  // --- Scenario 1: opened with NO ?scope= at all — should show the clear
  // "no scope provided" state, not a default/fake report. This is the
  // behavior that replaces the old picker: the page has an opinion about
  // what it needs, and says so, instead of offering to pick something. ---
  await page.goto(base);
  await page.waitForTimeout(150);
  const noScopeVisible = await page.isVisible(".no-scope");
  const reportVisible = await page.isVisible(".sheet");
  console.log("Scenario 1 (no ?scope=): no-scope message shown?", noScopeVisible, "| report shown (should be false)?", reportVisible);
  console.log("Scenario 1 errors:", errors.length ? errors : "(none)");
  await page.click('.lang-toggle button[data-lang="fr"]');
  await page.waitForTimeout(100);
  const noScopeTextFr = await page.textContent(".no-scope");
  console.log("No-scope message translates to FR?", /périmètre/i.test(noScopeTextFr));

  // --- Scenario 2: the real handoff — ?scope= from the Atlas print view.
  // This IS the only intended entry point; verify it end to end. ---
  errors.length = 0;
  const handoffUrl = base + "?scope=biz-premium,sentinel,entra-p2";
  await page.goto(handoffUrl);
  await page.waitForTimeout(200);
  const bodyText = await page.textContent("#sheet");
  console.log("\nScenario 2 (?scope= handoff) report renders?", await page.isVisible(".sheet"));
  console.log("Scope label reflected correctly?", bodyText.includes("Business Premium") && bodyText.includes("Sentinel") && bodyText.includes("Entra ID P2"));
  await page.click('.lang-toggle button[data-lang="fr"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/std_handoff_fr.png", fullPage: true });
  console.log("Scenario 2 errors:", errors.length ? errors : "(none)");

  // --- Scenario 3: a totally different ?scope= URL — proves the engine is
  // still fully dynamic (any of the 34 catalogued licenses, any combination)
  // even with no in-page picker; the dynamism lives in the URL contract and
  // the engine, not in UI. ---
  errors.length = 0;
  await page.goto(base + "?scope=m365-e3,mdi,mdca,entra-p2");
  await page.waitForTimeout(200);
  const statNumbers3 = await page.$$eval(".stat-n", (els) => els.map((e) => e.textContent));
  const bodyText3 = await page.textContent("#sheet");
  console.log("\nScenario 3 (different combination via URL) stat strip:", statNumbers3);
  console.log("Reflects M365 E3 (not Business Premium)?", bodyText3.includes("M365 E3") && !bodyText3.includes("M365 Business Premium"));
  console.log("Scenario 3 errors:", errors.length ? errors : "(none)");

  // --- Scenario 4: default direct-open screenshot for visual record (uses the real handoff scope, not a bare open) ---
  await page.goto(base + "?scope=biz-premium");
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/std_default.png", fullPage: true });
  console.log("\nScenario 4 title:", await page.title());

  // --- Scenario 5: print media emulation — control bar (incl. lang toggle) hides, sheet fills width ---
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: "/tmp/std_print_preview.png", fullPage: true });
  const controlBarVisible = await page.isVisible(".control-bar");
  console.log("\nScenario 5 (print emulation) control bar visible (should be false):", controlBarVisible);

  await browser.close();
  console.log("\nDone. Screenshots in /tmp/std_*.png");
})();
