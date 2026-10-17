import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

// A pre-existing preview can win an HTTP-ready/child-exit race. Leave its
// owner untouched. Working if occupied ports fail before a browser launches.
export async function assertPreviewPortAvailable(port, host = '127.0.0.1') {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', (error) =>
      reject(new Error(`Preview port ${port} unavailable: ${error.code}`))
    );
    probe.listen({ port, host, exclusive: true }, () => probe.close(resolve));
  });
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// A matching title or Git HEAD does not identify the loaded dirty build.
// Working if a stale index or entry bundle is rejected before frame sampling.
export async function assertPreviewBuildIdentity(baseUrl, distDirectory) {
  const index = await readFile(path.join(distDirectory, 'index.html'));
  const indexUrl = `${baseUrl.replace(/\/$/, '')}/`;
  const compare = async (url, expected) => {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const actual = Buffer.from(await response.arrayBuffer());
    if (!response.ok || !actual.equals(expected))
      throw new Error(`Preview build identity mismatch: ${url}`);
    return { url, sha256: digest(actual), bytes: actual.length };
  };
  const indexIdentity = await compare(indexUrl, index);
  const entries = [];
  const basePath = new URL(indexUrl).pathname.replace(/\/$/, '');
  for (const match of index
    .toString()
    .matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/g)) {
    const url = new URL(match[1], indexUrl);
    if (!url.pathname.startsWith(`${basePath}/`))
      throw new Error('Preview entry lies outside build base');
    const relative = decodeURIComponent(url.pathname.slice(basePath.length + 1));
    const file = path.resolve(distDirectory, relative);
    const within = path.relative(path.resolve(distDirectory), file);
    if (within.startsWith('..') || path.isAbsolute(within))
      throw new Error('Invalid preview entry path');
    entries.push(await compare(url.href, await readFile(file)));
  }
  if (!entries.length) throw new Error('Preview has no compiled JavaScript entry');
  return { index: indexIdentity, entries };
}
