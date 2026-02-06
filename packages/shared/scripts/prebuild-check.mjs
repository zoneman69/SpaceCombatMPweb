import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cwd = process.cwd();
const root = path.resolve(cwd, "../..");
const searchPaths = [
  cwd,
  path.join(cwd, "node_modules"),
  path.join(root, "node_modules"),
  root,
];

const exists = (target) => {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
};

const listDir = (target) => {
  try {
    return fs.readdirSync(target);
  } catch (error) {
    return `error: ${error?.message ?? error}`;
  }
};

console.log("[shared] prebuild diagnostics");
console.log("[shared] node", process.version);
console.log("[shared] execPath", process.execPath);
console.log("[shared] cwd", cwd);
console.log(
  "[shared] require.resolve.paths",
  require.resolve.paths("@colyseus/schema"),
);
console.log("[shared] root", root);
console.log("[shared] NODE_PATH", process.env.NODE_PATH ?? "(unset)");
console.log("[shared] node_modules exists (cwd)", exists(path.join(cwd, "node_modules")));
console.log("[shared] node_modules exists (root)", exists(path.join(root, "node_modules")));
console.log(
  "[shared] root node_modules entries",
  listDir(path.join(root, "node_modules")).slice(0, 20),
);
console.log(
  "[shared] shared node_modules entries",
  listDir(path.join(cwd, "node_modules")).slice(0, 20),
);

try {
  console.log("[shared] resolve @colyseus/schema (default)", require.resolve("@colyseus/schema"));
} catch (error) {
  console.error(
    "[shared] resolve @colyseus/schema (default) failed",
    error?.message ?? error,
  );
}

for (const base of searchPaths) {
  try {
    const resolved = require.resolve("@colyseus/schema", { paths: [base] });
    console.log("[shared] resolve @colyseus/schema (paths)", base, "=>", resolved);
  } catch (error) {
    console.error(
      "[shared] resolve @colyseus/schema (paths) failed",
      base,
      error?.message ?? error,
    );
  }
}
