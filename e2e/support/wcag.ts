import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectNoWcagViolations(page: Page, testInfo: TestInfo, state: string) {
  // A newly visible sidebar is still fading in. Sample its settled colours,
  // rather than measuring white text halfway through the entrance animation.
  await expect
    .poll(() =>
      page
        .locator('aside:visible')
        .evaluateAll((panels) =>
          panels.every((panel) => Number(getComputedStyle(panel).opacity) >= 0.9999)
        )
    )
    .toBe(true);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      summary: node.failureSummary,
    })),
  }));

  if (violations.length > 0) {
    await testInfo.attach(`axe-${state}`, {
      body: Buffer.from(JSON.stringify(violations, null, 2)),
      contentType: 'application/json',
    });
  }
  expect(violations, `${state} has WCAG A or AA violations`).toEqual([]);
}
