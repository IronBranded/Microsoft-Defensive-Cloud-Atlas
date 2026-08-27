(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AtlasI18n = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function get(obj, dotPath) {
    return dotPath.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  /** t(catalog, "section2.table.source") -> string
   *  t(catalog, "section1.postureIntro", {activeCount: 33, totalCount: 66}) -> interpolated string */
  function t(catalog, key, vars) {
    let str = get(catalog, key);
    if (str == null) return `[[missing:${key}]]`; // loud, visible failure instead of a silent blank
    if (typeof str !== "string") return str; // allow returning nested objects for e.g. severity maps
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return str;
  }

  /** Recursively collects every leaf key path in an object, e.g. "section1.postureTitle". */
  function collectKeys(obj, prefix) {
    let keys = [];
    Object.keys(obj || {}).forEach((k) => {
      const full = prefix ? `${prefix}.${k}` : k;
      const val = obj[k];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        keys = keys.concat(collectKeys(val, full));
      } else {
        keys.push(full);
      }
    });
    return keys;
  }

  /** Compares two language catalogs and returns { onlyInA, onlyInB } key path lists.
   *  Run this in CI / before every commit — a passing result is what "bilingual
   *  integrity" actually means here: no key can silently exist in one language only. */
  function diffCatalogs(catalogA, catalogB) {
    const a = new Set(collectKeys(catalogA));
    const b = new Set(collectKeys(catalogB));
    const onlyInA = [...a].filter((k) => !b.has(k));
    const onlyInB = [...b].filter((k) => !a.has(k));
    return { onlyInA, onlyInB, inSync: onlyInA.length === 0 && onlyInB.length === 0 };
  }

  return { t, get, collectKeys, diffCatalogs };
});
