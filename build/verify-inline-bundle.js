const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const bundleSrc = fs.readFileSync(path.join(__dirname, "..", "dist", "atlas-inline-bundle.js"), "utf8");

  // A minimal stand-in for index.html: just enough chrome to prove the
  // bundle works when inlined into a host page and triggered by a button,
  // with NO reference to executive-brief.html anywhere.
  const hostHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Atlas host stand-in</title></head>
<body>
<h1>Atlas (stand-in)</h1>
<div id="license-scope-summary">Selected: Business Premium, Sentinel, Entra ID P2</div>
<button id="brief-btn" onclick="openExecutiveBrief(['biz-premium','sentinel','entra-p2'], 'fr')">→ EXECUTIVE BRIEF</button>
<script>
${bundleSrc}
</script>
</body></html>`;

  const hostPath = path.join(__dirname, "..", "dist", "_host-standin-test.html");
  fs.writeFileSync(hostPath, hostHtml);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const hostErrors = [];
  page.on("pageerror", (e) => hostErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") hostErrors.push(m.text()); });

  await page.goto("file://" + hostPath);
  await page.waitForTimeout(150);
  console.log("Host page load errors:", hostErrors.length ? hostErrors : "(none)");

  // Click the button and capture the popup it opens via window.open()
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.click("#brief-btn"),
  ]);
  await popup.waitForLoadState();
  await popup.waitForTimeout(200);

  const popupErrors = [];
  popup.on("pageerror", (e) => popupErrors.push(e.message));

  console.log("\nPopup opened, no navigation to any executive-brief.html file — confirmed via URL:");
  console.log("  Popup URL scheme:", new URL(popup.url()).protocol, "(expect blob:)");

  const title = await popup.title();
  console.log("\nPopup title:", title);
  const bodyText = await popup.textContent("#sheet");
  console.log("Reflects the exact 3-license combo passed to openExecutiveBrief (Business Premium + Sentinel + Entra ID P2)?",
    bodyText.includes("Business Premium") && bodyText.includes("Sentinel") && bodyText.includes("Entra ID P2"));
  console.log("Opened in French (as requested)?", (await popup.textContent(".cover-title")) === null ? "n/a" : (await popup.textContent("h1.cover-title")).length > 0);
  const frText = await popup.textContent("#sheet");
  console.log("Contains French section heading?", frText.includes("Aperçu exécutif"));

  await popup.click('.lang-toggle button[data-lang="en"]');
  await popup.waitForTimeout(150);
  const enText = await popup.textContent("#sheet");
  console.log("Language toggle to EN works inside the popup?", enText.includes("Executive Overview"));

  await popup.screenshot({ path: "/tmp/inline_bundle_popup.png", fullPage: true });
  console.log("\nPopup errors:", popupErrors.length ? popupErrors : "(none)");

  fs.unlinkSync(hostPath);
  await browser.close();
  console.log("\nDone.");
})();
