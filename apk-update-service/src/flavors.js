"use strict";

function findFlavorForAssetName(flavors, assetName) {
  if (!assetName) return null;
  for (const f of flavors) {
    if (f.pattern.test(assetName)) return f;
  }
  return null;
}

function findAssetForFlavor(assets, flavor) {
  if (!Array.isArray(assets)) return null;
  for (const a of assets) {
    const name = a?.name;
    if (name && flavor.pattern.test(name)) return a;
  }
  return null;
}

module.exports = { findFlavorForAssetName, findAssetForFlavor };
