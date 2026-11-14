import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// D14: the pre-React cover carried a tagline under its heading, in both
// languages. The heading stands alone. Working if index.html holds no
// subtitle element and no copy of the tagline for the Portuguese swap.
describe('pre-React loading cover', () => {
  it('has a heading and no tagline under it', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('MillOS: WARMING UP THE ROLLERS');
    expect(html).not.toContain('loading-sub');
    expect(html).not.toContain('from wheat intake to flour dispatch');
    expect(html).not.toContain('da recepção do trigo');
  });
});
