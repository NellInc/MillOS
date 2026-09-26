#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = path.join(projectRoot, 'public');
const distDirectory = path.join(projectRoot, 'dist');
const packageMetadata = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const releaseMatrixPath = path.join(projectRoot, 'release-matrix.json');
const releaseMatrix = JSON.parse(fs.readFileSync(releaseMatrixPath, 'utf8'));
const [major, minor] = String(packageMetadata.version).split('.');
const currentVersion = `v${major}.${minor}`;
if (releaseMatrix.currentVersion !== currentVersion) {
  throw new Error(
    `Release matrix current version ${releaseMatrix.currentVersion} does not match package ${currentVersion}.`
  );
}
const releaseByVersion = new Map(
  releaseMatrix.releases.map((release) => [release.version, release])
);
if (releaseByVersion.size !== releaseMatrix.releases.length) {
  throw new Error('Release matrix contains duplicate versions.');
}

const readFlagValues = (flag) =>
  process.argv.flatMap((argument, index) =>
    argument === flag && process.argv[index + 1] ? [process.argv[index + 1]] : []
  );

const parseVersionValue = (value, flag) => {
  const separator = value.indexOf('=');
  const version = separator >= 0 ? value.slice(0, separator) : '';
  const detail = separator >= 0 ? value.slice(separator + 1) : '';
  if (!/^v\d+\.\d+$/.test(version) || !detail) {
    throw new Error(`${flag} expects vMAJOR.MINOR=value, received: ${value}`);
  }
  return [version, detail];
};

const outputArgumentIndex = process.argv.indexOf('--output');
if (outputArgumentIndex >= 0 && !process.argv[outputArgumentIndex + 1]) {
  throw new Error('--output requires a directory.');
}
const outputDirectory = path.resolve(
  projectRoot,
  outputArgumentIndex >= 0 && process.argv[outputArgumentIndex + 1]
    ? process.argv[outputArgumentIndex + 1]
    : 'staging'
);

const unsafeOutputs = new Set([
  '/',
  projectRoot,
  path.dirname(projectRoot),
  process.env.HOME,
  publicDirectory,
  distDirectory,
]);
if (unsafeOutputs.has(outputDirectory)) {
  throw new Error(`Refusing unsafe Pages staging output: ${outputDirectory}`);
}
if (!fs.existsSync(path.join(distDirectory, 'index.html'))) {
  throw new Error('Build dist with VERSION set before constructing Pages staging.');
}

const builtIndex = fs.readFileSync(path.join(distDirectory, 'index.html'), 'utf8');
if (!builtIndex.includes(`/${currentVersion}/assets/`)) {
  throw new Error(`dist is not a ${currentVersion} versioned build.`);
}

const publicVersionDirectories = fs
  .readdirSync(publicDirectory, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && /^v\d+\.\d+$/.test(entry.name) && entry.name !== currentVersion
  )
  .map((entry) => entry.name);
const archiveReleases = releaseMatrix.releases.filter(
  (release) => release.version !== currentVersion
);
const staticReleases = archiveReleases.filter((release) => release.type === 'static');
const sourceBuildReleases = archiveReleases.filter((release) => release.type === 'source-build');
const staticArchives = staticReleases.map((release) => release.version);
const archiveBuilds = new Map(
  readFlagValues('--archive-build').map((value) => parseVersionValue(value, '--archive-build'))
);

for (const version of publicVersionDirectories) {
  const release = releaseByVersion.get(version);
  if (!release) {
    throw new Error(`Public version directory is missing from release matrix: ${version}`);
  }
  if (
    release.type === 'static' &&
    !fs.existsSync(path.join(publicDirectory, version, 'index.html'))
  ) {
    throw new Error(`Static release has no runnable index: ${version}`);
  }
  if (release.type === 'source-build' && !archiveBuilds.has(version)) {
    throw new Error(
      `${version} contains supplemental assets but no runnable archive. Supply --archive-build ${version}=PATH.`
    );
  }
}
for (const release of staticReleases) {
  if (!fs.existsSync(path.resolve(projectRoot, release.sourcePath, 'index.html'))) {
    throw new Error(`Static release source is incomplete: ${release.version}`);
  }
}
for (const release of sourceBuildReleases) {
  if (!archiveBuilds.has(release.version)) {
    throw new Error(`Source-built release is missing an archive build: ${release.version}`);
  }
}
for (const version of archiveBuilds.keys()) {
  if (!sourceBuildReleases.some((release) => release.version === version)) {
    throw new Error(`Archive build is not declared as source-built: ${version}`);
  }
}

const archiveBuildDirectories = new Map();
for (const [version, sourceValue] of archiveBuilds) {
  const sourceDirectory = path.resolve(projectRoot, sourceValue);
  const sourceIndexPath = path.join(sourceDirectory, 'index.html');
  if (!fs.existsSync(sourceIndexPath)) {
    throw new Error(`Archive build ${version} has no index.html: ${sourceDirectory}`);
  }
  const sourceIndex = fs.readFileSync(sourceIndexPath, 'utf8');
  if (!sourceIndex.includes(`/${version}/assets/`)) {
    throw new Error(`Archive build ${version} is not versioned for /${version}/.`);
  }
  archiveBuildDirectories.set(version, sourceDirectory);
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

const copyReleaseBuild = (sourceDirectory, destinationDirectory) => {
  fs.cpSync(sourceDirectory, destinationDirectory, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(sourceDirectory, source);
      const firstSegment = relative.split(path.sep)[0];
      return (
        relative === '' ||
        (!/^v\d+\.\d+$/.test(firstSegment) && path.basename(source) !== '.DS_Store')
      );
    },
  });
};

copyReleaseBuild(distDirectory, path.join(outputDirectory, currentVersion));

const archiveSources = new Map();
const archives = archiveReleases.map((release) => release.version);

for (const release of staticReleases) {
  fs.cpSync(
    path.resolve(projectRoot, release.sourcePath),
    path.join(outputDirectory, release.version),
    {
      recursive: true,
      filter: (source) => path.basename(source) !== '.DS_Store',
    }
  );
  archiveSources.set(release.version, { type: 'static', path: release.sourcePath });
}

for (const [version, sourceDirectory] of archiveBuildDirectories) {
  const release = releaseByVersion.get(version);
  copyReleaseBuild(sourceDirectory, path.join(outputDirectory, version));
  archiveSources.set(version, {
    type: 'source-build',
    commit: release.sourceCommit,
    sourcePackageVersion: release.sourcePackageVersion,
    identityNote: release.identityNote,
  });
}

archives.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

const musicFiles = fs
  .readdirSync(publicDirectory)
  .filter((entry) => entry.toLowerCase().endsWith('.mp3'));
for (const archive of ['v0.10', 'v0.20']) {
  const archiveDirectory = path.join(outputDirectory, archive);
  if (!fs.existsSync(archiveDirectory)) continue;
  for (const musicFile of musicFiles) {
    fs.copyFileSync(path.join(publicDirectory, musicFile), path.join(archiveDirectory, musicFile));
  }
}

const releaseNavigationPath = path.join(outputDirectory, currentVersion, 'release-navigation.js');
if (!fs.existsSync(releaseNavigationPath)) {
  throw new Error(`Current build is missing release-navigation.js: ${releaseNavigationPath}`);
}
// Content-hash the bridge URL so a returning archive visitor's cache-first copy
// is bypassed whenever the bridge changes. validate-release-matrix strips this
// tag (query included) before checking the proven historical index hashes.
const bridgeHash = createHash('sha256')
  .update(fs.readFileSync(releaseNavigationPath))
  .digest('hex')
  .slice(0, 12);
const releaseNavigationTag = `<script defer src="/${currentVersion}/release-navigation.js?v=${bridgeHash}"></script>`;
for (const archive of archives) {
  const archiveIndexPath = path.join(outputDirectory, archive, 'index.html');
  const archiveIndex = fs.readFileSync(archiveIndexPath, 'utf8');
  if (archiveIndex.includes(releaseNavigationTag)) continue;
  const injectedIndex = /<\/body>/i.test(archiveIndex)
    ? archiveIndex.replace(/<\/body>/i, `  ${releaseNavigationTag}\n</body>`)
    : `${archiveIndex}\n${releaseNavigationTag}\n`;
  fs.writeFileSync(archiveIndexPath, injectedIndex);
}

const rootIndex = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="0;url=/${currentVersion}/">
  <title>MillOS | 3D Grain Mill Operations Simulator</title>
  <meta name="description" content="Explore MillOS, a browser-based autonomous 3D grain mill operations simulator with deterministic logistics, production metrics, and a simulated SCADA workspace." />
  <link rel="canonical" href="https://www.millos.net/" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://www.millos.net/" />
  <meta property="og:title" content="MillOS | 3D Grain Mill Operations Simulator" />
  <meta property="og:description" content="Explore an autonomous browser-based grain mill simulator with deterministic logistics, production metrics, and a simulated SCADA workspace." />
  <meta property="og:image" content="https://www.millos.net/og-image.png" />
  <meta property="og:image:alt" content="An uncrewed 3D grain mill: a glass-walled milling hall, grain silos and truck yard below green hills" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="MillOS" />
  <meta property="og:locale" content="en_GB" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://www.millos.net/" />
  <meta name="twitter:title" content="MillOS | 3D Grain Mill Operations Simulator" />
  <meta name="twitter:description" content="An autonomous browser-based 3D grain mill simulator with deterministic logistics, production metrics, and simulated SCADA." />
  <meta name="twitter:image" content="https://www.millos.net/og-image.png" />
  <meta name="twitter:image:alt" content="An uncrewed 3D grain mill: a glass-walled milling hall, grain silos and truck yard below green hills" />
  <meta name="twitter:creator" content="@NellWatson" />
</head>
<body>
  <p>Redirecting to <a href="/${currentVersion}/">MillOS ${currentVersion}</a>...</p>
</body>
</html>
`;
fs.writeFileSync(path.join(outputDirectory, 'index.html'), rootIndex);
fs.copyFileSync(releaseMatrixPath, path.join(outputDirectory, 'release-matrix.json'));

for (const file of ['robots.txt', 'sitemap.xml', 'og-image.png']) {
  fs.copyFileSync(path.join(publicDirectory, file), path.join(outputDirectory, file));
}
fs.copyFileSync(path.join(projectRoot, 'CNAME'), path.join(outputDirectory, 'CNAME'));
fs.writeFileSync(path.join(outputDirectory, '.nojekyll'), '');

const buildInfoPath = path.join(distDirectory, 'build-info.json');
const buildInfo = fs.existsSync(buildInfoPath)
  ? JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'))
  : null;
fs.writeFileSync(
  path.join(outputDirectory, 'deployment-manifest.json'),
  `${JSON.stringify(
    {
      schemaVersion: 2,
      packageVersion: packageMetadata.version,
      currentVersion,
      buildInfo,
      archives,
      archiveSources: Object.fromEntries(
        archives.map((version) => [version, archiveSources.get(version)])
      ),
      releases: releaseMatrix.releases.map((release) => ({
        ...release,
        source:
          release.version === currentVersion
            ? { type: 'current', buildInfo }
            : archiveSources.get(release.version),
      })),
    },
    null,
    2
  )}\n`
);

console.log(
  `Prepared ${currentVersion} plus ${archives.length} archived releases in ${path.relative(projectRoot, outputDirectory)}.`
);
