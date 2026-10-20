#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageMetadata = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const releaseMatrixPath = path.join(projectRoot, 'release-matrix.json');
const releaseMatrix = JSON.parse(fs.readFileSync(releaseMatrixPath, 'utf8'));
const failures = [];

const stagingArgumentIndex = process.argv.indexOf('--staging');
const stagingDirectory =
  stagingArgumentIndex >= 0 && process.argv[stagingArgumentIndex + 1]
    ? path.resolve(projectRoot, process.argv[stagingArgumentIndex + 1])
    : null;

const packageVersion = `v${String(packageMetadata.version).split('.').slice(0, 2).join('.')}`;
if (releaseMatrix.schemaVersion !== 1) failures.push('Release matrix schemaVersion must be 1.');
if (releaseMatrix.currentVersion !== packageVersion) {
  failures.push(
    `Current release ${releaseMatrix.currentVersion} does not match package ${packageVersion}.`
  );
}
if (!Array.isArray(releaseMatrix.releases) || releaseMatrix.releases.length === 0) {
  failures.push('Release matrix has no releases.');
}

const versions = releaseMatrix.releases.map((release) => release.version);
if (new Set(versions).size !== versions.length) failures.push('Release versions are not unique.');
if (versions[0] !== releaseMatrix.currentVersion) {
  failures.push('Current release must be the first selectable release.');
}
for (let index = 1; index < versions.length; index += 1) {
  if (versions[index - 1].localeCompare(versions[index], undefined, { numeric: true }) <= 0) {
    failures.push('Release versions must be ordered newest first.');
    break;
  }
}

for (const release of releaseMatrix.releases) {
  if (!/^v\d+\.\d+$/.test(release.version)) {
    failures.push(`Invalid release version: ${release.version}`);
  }
  if (release.label !== release.version.slice(1)) {
    failures.push(`Release label does not match version: ${release.version}`);
  }
  if (release.version === releaseMatrix.currentVersion && release.type !== 'current') {
    failures.push(`Current release has wrong type: ${release.type}`);
  }
  if (release.type === 'static') {
    const source = path.resolve(projectRoot, release.sourcePath ?? '');
    if (!source.startsWith(path.join(projectRoot, 'public') + path.sep)) {
      failures.push(`Static release source escapes public: ${release.version}`);
    }
    if (!fs.existsSync(path.join(source, 'index.html'))) {
      failures.push(`Static release has no index.html: ${release.version}`);
    }
  }
  if (release.type === 'source-build') {
    if (!/^[0-9a-f]{40}$/.test(release.sourceCommit ?? '')) {
      failures.push(`Source-built release has invalid commit: ${release.version}`);
      continue;
    }
    try {
      execFileSync('git', ['cat-file', '-e', `${release.sourceCommit}^{commit}`], {
        cwd: projectRoot,
        stdio: 'ignore',
      });
      const sourcePackage = JSON.parse(
        execFileSync('git', ['show', `${release.sourceCommit}:package.json`], {
          cwd: projectRoot,
          encoding: 'utf8',
        })
      );
      if (sourcePackage.version !== release.sourcePackageVersion) {
        failures.push(
          `${release.version} source package is ${sourcePackage.version}, expected ${release.sourcePackageVersion}.`
        );
      }
      const sourceIndex = execFileSync('git', ['show', `${release.sourceCommit}:index.html`], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      const buildEnvironment = release.reproducibleBuild?.buildEnvironment;
      if (
        !sourceIndex.includes(`/${release.version}/`) &&
        buildEnvironment?.VERSION !== release.version
      ) {
        failures.push(`${release.version} source index does not identify its historical route.`);
      }
      if (buildEnvironment && buildEnvironment.GITHUB_SHA !== release.sourceCommit) {
        failures.push(`${release.version} build identity does not match its preserved source.`);
      }
      if (!release.identityNote?.trim()) {
        failures.push(`${release.version} source-built archive has no identity note.`);
      }
      if (
        !/^[0-9a-f]{64}$/.test(release.reproducibleBuild?.indexSha256 ?? '') ||
        !/^[0-9a-f]{64}$/.test(release.reproducibleBuild?.mainSha256 ?? '')
      ) {
        failures.push(`${release.version} has no reproducible production build hashes.`);
      }
    } catch (error) {
      failures.push(`${release.version} source provenance cannot be read: ${error.message}`);
    }
  }
}

if (stagingDirectory) {
  const currentCanonicalUrl = `https://www.millos.net/${releaseMatrix.currentVersion}/`;
  const currentCanonicalTag = `<link rel="canonical" href="${currentCanonicalUrl}" />`;
  const expectedRobots = [
    'User-agent: *',
    'Allow: /',
    ...releaseMatrix.releases
      .filter((release) => release.version !== releaseMatrix.currentVersion)
      .map((release) => `Disallow: /${release.version}/`),
    '',
    'Sitemap: https://www.millos.net/sitemap.xml',
    '',
  ].join('\n');
  const rootIndexPath = path.join(stagingDirectory, 'index.html');
  const deploymentManifestPath = path.join(stagingDirectory, 'deployment-manifest.json');
  const stagedMatrixPath = path.join(stagingDirectory, 'release-matrix.json');
  for (const requiredPath of [rootIndexPath, deploymentManifestPath, stagedMatrixPath]) {
    if (!fs.existsSync(requiredPath))
      failures.push(`Staging is missing ${path.basename(requiredPath)}.`);
  }

  if (fs.existsSync(rootIndexPath)) {
    const rootIndex = fs.readFileSync(rootIndexPath, 'utf8');
    if (!rootIndex.includes(`url=/${releaseMatrix.currentVersion}/`)) {
      failures.push('Staging root does not redirect to the current release.');
    }
    if (!rootIndex.includes(currentCanonicalTag)) {
      failures.push('Staging root canonical does not identify the current release.');
    }
  }

  for (const directory of [
    stagingDirectory,
    path.join(stagingDirectory, releaseMatrix.currentVersion),
  ]) {
    const robotsPath = path.join(directory, 'robots.txt');
    if (!fs.existsSync(robotsPath) || fs.readFileSync(robotsPath, 'utf8') !== expectedRobots) {
      failures.push(
        'Staged robots must allow the current release and exclude only archived releases.'
      );
    }
    const sitemapPath = path.join(directory, 'sitemap.xml');
    if (!fs.existsSync(sitemapPath)) {
      failures.push(`Staging is missing ${path.relative(stagingDirectory, sitemapPath)}.`);
      continue;
    }
    const locations = [
      ...fs.readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g),
    ].map((match) => match[1]);
    if (locations.length !== 1 || locations[0] !== currentCanonicalUrl) {
      failures.push('Staged sitemap must identify only the indexable current release.');
    }
  }

  if (fs.existsSync(stagedMatrixPath)) {
    const stagedMatrix = JSON.parse(fs.readFileSync(stagedMatrixPath, 'utf8'));
    if (JSON.stringify(stagedMatrix) !== JSON.stringify(releaseMatrix)) {
      failures.push('Staged release matrix differs from source.');
    }
  }

  if (fs.existsSync(deploymentManifestPath)) {
    const deploymentManifest = JSON.parse(fs.readFileSync(deploymentManifestPath, 'utf8'));
    if (deploymentManifest.schemaVersion !== 2) {
      failures.push('Deployment manifest schemaVersion must be 2.');
    }
    if (deploymentManifest.currentVersion !== releaseMatrix.currentVersion) {
      failures.push('Deployment manifest current version differs from release matrix.');
    }
    if (
      JSON.stringify(deploymentManifest.releases?.map((release) => release.version)) !==
      JSON.stringify(versions)
    ) {
      failures.push('Deployment manifest release order differs from release matrix.');
    }
  }

  const indexHashes = new Map();
  for (const release of releaseMatrix.releases) {
    const indexPath = path.join(stagingDirectory, release.version, 'index.html');
    if (!fs.existsSync(indexPath)) {
      failures.push(`Staging is missing ${release.version}/index.html.`);
      continue;
    }
    const index = fs.readFileSync(indexPath, 'utf8');
    if (release.version === releaseMatrix.currentVersion && !index.includes(currentCanonicalTag)) {
      failures.push('Current release canonical must not point back to the root redirect.');
    }
    if (!index.includes(`/${release.version}/assets/`)) {
      failures.push(`${release.version} index does not reference its own asset base.`);
    }
    if (release.version !== releaseMatrix.currentVersion) {
      const bridge = `/${releaseMatrix.currentVersion}/release-navigation.js`;
      if (!index.includes(bridge)) {
        failures.push(`${release.version} index is missing reciprocal release navigation.`);
      }
    }
    if (release.reproducibleBuild) {
      // The injected bridge carries a `?v=<content hash>` cache-buster.
      const escapedVersion = releaseMatrix.currentVersion.replaceAll('.', '\\.');
      const navigationTag = new RegExp(
        `  <script defer src="/${escapedVersion}/release-navigation\\.js(?:\\?v=[0-9a-f]+)?"></script>\n`
      );
      const historicalIndex = index.replace(navigationTag, '');
      const historicalIndexHash = createHash('sha256').update(historicalIndex).digest('hex');
      if (historicalIndexHash !== release.reproducibleBuild.indexSha256) {
        failures.push(`${release.version} staged index differs from the proven historical build.`);
      }
      const mainAssetPath = path.join(
        stagingDirectory,
        release.version,
        release.reproducibleBuild.mainAsset
      );
      if (!fs.existsSync(mainAssetPath)) {
        failures.push(`${release.version} is missing its proven main asset.`);
      } else {
        const mainHash = createHash('sha256').update(fs.readFileSync(mainAssetPath)).digest('hex');
        if (mainHash !== release.reproducibleBuild.mainSha256) {
          failures.push(`${release.version} main asset differs from production provenance.`);
        }
      }
    }
    const hash = createHash('sha256').update(index).digest('hex');
    if (indexHashes.has(hash)) {
      failures.push(`${release.version} duplicates ${indexHashes.get(hash)} index content.`);
    }
    indexHashes.set(hash, release.version);
  }

  const navigationPath = path.join(
    stagingDirectory,
    releaseMatrix.currentVersion,
    'release-navigation.js'
  );
  if (!fs.existsSync(navigationPath)) {
    failures.push('Staging is missing the reciprocal release navigation bridge.');
  }
}

if (failures.length > 0) {
  console.error('Release matrix validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Release matrix valid: ${releaseMatrix.currentVersion} current, ${versions.length - 1} archives${stagingDirectory ? ', staged routes isolated' : ''}.`
);
