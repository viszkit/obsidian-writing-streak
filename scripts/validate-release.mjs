import { existsSync, readFileSync } from "node:fs";

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
	console.error(message);
	process.exitCode = 1;
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const manifest = readJson("manifest.json");
const versions = readJson("versions.json");

const packageLockRoot = packageLock.packages?.[""];
const version = manifest.version;

if (packageJson.version !== version) {
	fail(`package.json version ${packageJson.version} does not match manifest.json version ${version}.`);
}

if (packageLock.version !== version) {
	fail(`package-lock.json root version ${packageLock.version} does not match manifest.json version ${version}.`);
}

if (packageLockRoot?.version !== version) {
	fail(`package-lock.json package version ${packageLockRoot?.version} does not match manifest.json version ${version}.`);
}

if (versions[version] !== manifest.minAppVersion) {
	fail(`versions.json entry for ${version} must be ${manifest.minAppVersion}.`);
}

for (const path of ["main.js", "manifest.json", "styles.css"]) {
	if (!existsSync(path)) {
		fail(`Missing release asset: ${path}. Run npm run build before publishing.`);
	}
}

if (!manifest.id || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
	fail("manifest.json id must be lowercase kebab-case.");
}

if (!manifest.name || !manifest.description || !manifest.author) {
	fail("manifest.json must include name, description, and author.");
}

if (!process.exitCode) {
	console.log(`Release metadata is valid for ${version}.`);
}
