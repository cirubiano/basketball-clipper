const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../shared");

const config = getDefaultConfig(projectRoot);

// Allow Metro to watch files outside the mobile/ directory (monorepo)
config.watchFolders = [sharedRoot];

// When Metro resolves modules from files inside shared/ it walks up the
// directory tree starting from shared/ — it never reaches mobile/node_modules.
// Explicitly adding mobile/node_modules ensures that Babel runtime helpers
// (and any other deps only installed in mobile/) are found regardless of
// which directory the source file lives in.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
];

module.exports = config;
