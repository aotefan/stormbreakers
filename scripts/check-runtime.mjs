const [major, minor, patch] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 22 || (minor === 22 && patch < 1)) {
  console.error(`Stormbreakers requires security-patched Node.js 24 LTS (>=24.22.1 <25); running ${process.version}. See .nvmrc.`);
  process.exit(1);
}
console.log(`Stormbreakers runtime: ${process.version}`);
