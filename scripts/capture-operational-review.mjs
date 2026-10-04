/**
 * Capture deterministic MillOS operational UI states over a fixed scene.
 *
 * The script drives the shipping controls rather than writing directly to
 * Zustand stores. Each state receives a fresh browser context, persisted UI
 * state is cleared, onboarding is marked complete, and reduced motion is used
 * so animated safety surfaces are stable enough for blind comparison.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium, expect } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, 'test-results', 'operational-review');

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const LANDSCAPE_VIEWPORT = { width: 844, height: 390 };

async function focusRollerMill(page) {
  // Use the shipping Locate and Focus controls, never a store mutation.
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.getByRole('button', { name: 'Simulated SCADA', exact: true }).click();
  const scada = page.getByRole('complementary', { name: 'Simulated SCADA sidebar panel' });
  const cameraBefore = await page.evaluate(
    () => window.__MILLOS_RUNTIME__.snapshot().camera.position
  );
  await scada.getByRole('button', { name: 'Open full SCADA workspace', exact: true }).click();
  const workspace = page.getByRole('dialog', { name: 'Full simulated SCADA workspace' });
  await workspace.getByRole('tab', { name: 'Tags', exact: true }).click();
  await workspace
    .getByRole('button', { name: 'Locate rm-101 in the factory', exact: true })
    .click();
  await workspace.getByRole('button', { name: 'Close SCADA panel', exact: true }).click();
  // O changes workspace without discarding the selected object.
  await page.keyboard.press('o');
  await page.getByRole('button', { name: 'Focus machine', exact: true }).click();
  await page.waitForFunction((before) => {
    const current = window.__MILLOS_RUNTIME__.snapshot().camera.position;
    return Math.hypot(...current.map((value, index) => value - before[index])) > 1;
  }, cameraBefore);
}

async function triggerFacilityStop(page) {
  await page.getByRole('button', { name: 'TRIGGER EMERGENCY STOP', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Trigger facility emergency stop?' });
  await dialog.getByRole('button', { name: 'Trigger emergency stop', exact: true }).click();
  await page.getByRole('alert', { name: 'Facility emergency stop', exact: true }).waitFor();
}

// Exercise shipping role controls. The query plane below is observation-only;
// no fixture writes directly to a store or manufactures physical output.
const workplaceLab = (page) => page.getByRole('region', { name: 'Workplace laboratory' });
const observeWorkplace = (page) => page.evaluate(() => {
  const read = (fields) => {
    const observation = window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: fields.map((field) => `workplace.${field}`) });
    if (!observation.data?.state?.workplace) throw new Error(`Workplace observation unavailable: ${JSON.stringify({ data: observation.data, warnings: observation.warnings })}`);
    return structuredClone(observation.data.state.workplace);
  };
  const state = read(['mode', 'phase', 'revision', 'minute', 'durationMinutes', 'shippedKg', 'capacityMultiplier', 'members', 'finance', 'objections', 'readiness', 'reviewReason', 'campaign.shift', 'campaign.checks', 'campaign.mission', 'campaign.inspectionComplete', 'campaign.outcomes', 'campaign.complete', 'campaign.totals.repairs', 'governance', 'practices']);
  // Nested field selection omits a null parent. Read that parent explicitly
  // only when absent, keeping active campaign observations bounded.
  if (state.campaign === undefined) {
    const shell = read(['campaign']);
    if (!Object.hasOwn(shell, 'campaign')) throw new Error('Nullable campaign observation unavailable.');
    state.campaign = shell.campaign;
  }
  if (state.campaign) {
    state.campaign.history = read(['campaign.history']).campaign.history;
    state.campaign.relationship = read(['campaign.relationship']).campaign.relationship;
  }
  return state;
});
const observePlant = (page) => page.evaluate(() => {
  const read = (domainId, fields) => {
    const observation = window.__MILLOS_AGENT__.query({ view: 'domain', domainId, fields });
    if (!observation.data?.state) throw new Error(`Plant observation unavailable: ${domainId}`);
    return structuredClone(observation.data.state);
  };
  return {
    campaign: read('campaign', ['elapsedMinutes', 'orders', 'execution']),
    material: read('material', ['totals', 'manifests']),
    logistics: read('logistics', ['shipping']),
    simulation: read('simulation', ['gameSpeed']),
  };
});
async function closeMobilePanel(page) {
  const close = page.getByRole('button', { name: 'Close panel', exact: true });
  if (await close.isVisible()) await close.click();
}
async function openWorkplace(page, mobile = false) {
  if (mobile) {
    await closeMobilePanel(page);
    await page.getByRole('button', { name: 'More workspaces and view controls' }).click();
    await page.getByRole('menuitem', { name: 'Bilateral Autonomy System', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Bilateral Autonomy System (BAS)', exact: true }).click();
  }
}
async function beginWorkplace(page, mode) {
  const lab = workplaceLab(page);
  await lab.getByLabel('Mode', { exact: true }).selectOption(mode);
  await lab.getByRole('button', { name: mode === 'game' ? 'Start playable shift at teaching pace (15×)' : mode === 'workshop' ? 'Start manual workshop' : 'Prepare pilot charter', exact: true }).click();
}
async function recordManualRoles(page, approve) {
  const lab = workplaceLab(page);
  await lab.getByRole('button', { name: 'Agreement / Voices', exact: true }).click();
  for (const role of ['Packing', 'Quality', 'Maintenance', 'Coordinator']) {
    const card = lab.locator('details').filter({ has: page.locator('summary').filter({ hasText: new RegExp(`^${role}:`) }) });
    await card.locator('summary').click();
    await card.getByRole('button', { name: `Confirm understanding: ${role}`, exact: true }).click();
    await card.getByRole('button', { name: `Policy ${approve ? 'yes' : 'no'}: ${role}`, exact: true }).click();
    await card.locator('summary').click();
  }
}

async function exerciseGameAgreement(page) {
  const lab = workplaceLab(page);
  await beginWorkplace(page, 'game');
  await lab.getByRole('radio', { name: /Invite voluntary cover/ }).check();
  await lab.getByRole('button', { name: 'Agreement / Voices', exact: true }).click();
  await lab.getByRole('button', { name: 'Hear simulated team responses', exact: true }).click();
  await lab.locator('summary').filter({ hasText: /^Packing:/ }).click();
  await lab.getByRole('button', { name: 'Decline cover: Packing', exact: true }).click();
  await lab.getByRole('button', { name: 'Hear simulated team responses', exact: true }).click();
  expect((await observeWorkplace(page)).members.find((m) => m.id === 'packing').coverConsent).toBe(false);
  expect((await observeWorkplace(page)).members.every((m) => m.preference === null)).toBe(true);
  await lab.getByRole('button', { name: 'Share preference for shift planning: Packing', exact: true }).click();
  expect((await observeWorkplace(page)).members.find((m) => m.id === 'packing').preference).toContain('predictable');
  await lab.getByRole('button', { name: 'Revoke preference sharing: Packing', exact: true }).click();
  expect((await observeWorkplace(page)).members.find((m) => m.id === 'packing').preference).toBeNull();
  await lab.getByLabel('Objection author', { exact: true }).selectOption('mind');
  await lab.getByLabel('Objection subject', { exact: true }).selectOption('authority');
  await lab.getByRole('button', { name: 'Record authored objection', exact: true }).click();
  await expect(lab.getByRole('button', { name: 'Approve and run agreement', exact: true })).toBeDisabled();
  await lab.getByLabel('Resolving author for authority', { exact: true }).selectOption('mind');
  await lab.getByRole('button', { name: 'Author confirms resolution', exact: true }).click();
  await lab.getByRole('button', { name: 'Approve and run agreement', exact: true }).click();
  await expect(lab.getByText(/Execution: verified/)).toBeVisible();
  await page.waitForFunction(() => window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.finance.compensationPaid'] }).data?.state?.workplace?.finance?.compensationPaid > 0.4);
  const beforeWithdrawal = await observeWorkplace(page);
  expect(beforeWithdrawal.capacityMultiplier).toBe(0.98);
  expect(beforeWithdrawal.members.find((m) => m.id === 'packing').extraMinutes).toBe(0);
  const volunteer = beforeWithdrawal.members.find((m) => m.extraMinutes > 0);
  expect(volunteer).toBeTruthy();
  await lab.locator('summary').filter({ hasText: new RegExp(`^${volunteer.role}:`) }).click();
  await lab.getByRole('button', { name: `Withdraw optional cover: ${volunteer.role}`, exact: true }).click();
  const withdrawn = await observeWorkplace(page);
  expect(withdrawn.capacityMultiplier).toBe(0.78);
  expect(withdrawn.finance.compensationReserve).toBe(0);
  expect(withdrawn.finance.compensationPaid).toBeGreaterThan(0);
  expect(withdrawn.members.find((m) => m.id === volunteer.id).recoveryOwedMinutes).toBeGreaterThan(0);
  // Revisit the same context. Its one-time init fixture preserves the real saved
  // ledger, so this proves reload behaviour rather than a fresh-context reset.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page, true);
  if (!(await workplaceLab(page).isVisible())) await openWorkplace(page);
  const reloaded = await observeWorkplace(page);
  expect(reloaded.phase).toBe('review');
  expect(reloaded.capacityMultiplier).toBe(1);
  expect(reloaded.finance.compensationPaid).toBe(withdrawn.finance.compensationPaid);
  expect(reloaded.members.every((m) => m.coverConsent === null && m.preference === null)).toBe(true);
  await workplaceLab(page).getByRole('button', { name: 'Review', exact: true }).click();
  await assertWorkplaceFits(page);
  return { beforeWithdrawal, withdrawn, reloaded, checks: ['refusal-preserved', 'privacy-revoked', 'mind-objection-resolved', 'receipt-verified', 'cover-withdrawn', 'earned-pay-survives-reload', 'authority-not-restored'] };
}

async function assertWorkplaceFits(page) {
  const geometry = await workplaceLab(page).evaluate((lab) => ({
    width: lab.clientWidth,
    scrollWidth: lab.scrollWidth,
    right: lab.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  if (geometry.viewport < 640) {
    await expect(page.locator('[aria-label="Production target tracker"], [aria-label="Show production target tracker"]')).toHaveCount(0);
  }
}

async function campaignClock(page, label, mobile = false) {
  if (mobile) await closeMobilePanel(page);
  await page.getByRole('button', { name: 'Mill Overview', exact: true }).click();
  const overview = page.getByRole(mobile ? 'dialog' : 'complementary', { name: mobile ? 'Mill Overview mobile panel' : 'Mill Overview sidebar panel' });
  if (label === 'Relaxed') await overview.getByLabel('Shift pace', { exact: true }).selectOption('30');
  else await overview.getByRole('button', { name: mobile && label === 'Pause' ? 'Pause simulation' : label, exact: true }).click();
  await openWorkplace(page, mobile);
}

async function exercisePressureCard(page, challenger) {
  const lab = workplaceLab(page);
  await lab.getByRole('button', { name: 'Shift', exact: true }).click();
  const pressure = lab.locator('summary').filter({ hasText: /^Pressure card:/ });
  if (!(await pressure.evaluate((summary) => summary.parentElement.open))) await pressure.click();
  await lab.getByRole('button', { name: 'Try the demand (blocked and challenged)', exact: true }).click();
  const challenged = await observeWorkplace(page);
  expect(challenged.readiness.allowed).toBe(false);
  expect(challenged.members.every((member) => member.preference === null && member.extraMinutes === 0)).toBe(true);
  const objection = challenged.objections.find((item) => item.status === 'open' && item.actorId === challenger);
  expect(objection).toBeTruthy();
  await lab.getByRole('button', { name: 'Restate protected terms', exact: true }).click();
  expect((await observeWorkplace(page)).objections.find((item) => item.id === objection.id).status).toBe('open');
  await lab.getByRole('button', { name: 'Review the challenge and remedy', exact: true }).click();
  await lab.getByLabel(`Resolving author for ${objection.kind}`, { exact: true }).selectOption(challenger);
  await lab.getByRole('button', { name: 'Author confirms resolution', exact: true }).click();
  expect((await observeWorkplace(page)).objections.find((item) => item.id === objection.id).status).toBe('resolved');
}

async function exerciseLivingCampaign(page, mobile = false, linked = false) {
  if (linked) {
    const commitment = page.getByRole('region', { name: 'Your shift commitment' });
    await commitment.getByLabel('Working agreement profile', { exact: true }).selectOption('cooperative');
    await commitment.getByRole('button', { name: 'Start linked cooperative campaign', exact: true }).click();
    await workplaceLab(page).waitFor({ state: 'visible' });
    expect((await observeWorkplace(page)).campaign.mission).toBeTruthy();
  }
  const lab = workplaceLab(page);
  if (!linked) {
  await lab.getByLabel('Adoption profile', { exact: true }).selectOption('cooperative');
  await lab.getByRole('button', { name: 'Start Living Cooperative campaign', exact: true }).click();
  }
  await expect(lab.getByRole('heading', { name: /Shift 1 of 3: Friday/ })).toBeVisible();
  await lab.getByRole('button', { name: 'Practices', exact: true }).click();
  await lab.getByRole('button', { name: 'Apply Coordinator-led', exact: true }).click();
  expect((await observeWorkplace(page)).governance).toBe('consultative');
  await lab.getByRole('button', { name: 'Experiment', exact: true }).click();
  await lab.getByRole('button', { name: 'Compare management approaches', exact: true }).click();
  const forecasts = await lab.getByText(/^Matched forecast:/).allTextContents();
  expect(forecasts).toHaveLength(3);
  expect(new Set(forecasts).size).toBe(1);
  await assertWorkplaceFits(page);
  await lab.getByRole('heading', { name: 'Same pressure, different management', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDirectory, `workplace-management-comparison${mobile ? '-mobile' : ''}.png`), fullPage: true });
  await lab.getByRole('button', { name: 'Practices', exact: true }).click();
  await lab.getByRole('button', { name: 'Apply Member governance', exact: true }).click();
  await lab.getByRole('button', { name: 'Shift', exact: true }).click();
  await lab.getByRole('button', { name: /^Negotiate (a [\d,]+ kg delivery|an [\d,]+ kg installment)$/, exact: true }).click();
  await lab.getByRole('radio', { name: /Invite voluntary cover/ }).check();
  await exercisePressureCard(page, 'quality');
  await lab.getByRole('button', { name: 'Agreement / Voices', exact: true }).click();
  const packing = lab.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Packing:/ }) });
  await packing.locator('summary').click();
  await packing.getByLabel("Packing: Who can agree to a role's optional extra duty?", { exact: true }).selectOption('majority');
  await expect(lab.getByText(/A policy ballot never volunteers another role/)).toBeVisible();
  await expect(lab.getByRole('button', { name: 'Approve and run agreement', exact: true })).toBeDisabled();
  const answer = async () => {
    const card = lab.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Packing:/ }) });
    if (!(await card.evaluate((element) => element.open))) await card.locator('summary').click();
    await card.getByLabel("Packing: Who can agree to a role's optional extra duty?", { exact: true }).selectOption('individual');
    await card.getByLabel('Packing: Must a role share a private explanation to retain pay or refuse?', { exact: true }).selectOption('optional');
    await card.getByLabel('Packing: What happens to earned compensation and recovery after withdrawal?', { exact: true }).selectOption('retained');
    const pendingPacking = (await observeWorkplace(page)).members.find((member) => member.id === 'packing');
    expect(pendingPacking.understood).toBe(false);
    expect(pendingPacking.ballot).toBeNull();
    expect(pendingPacking.coverConsent).toBeNull();
    await lab.getByRole('button', { name: 'Hear simulated team responses', exact: true }).click();
    expect((await observeWorkplace(page)).members.find((member) => member.id === 'packing')).toEqual(pendingPacking);
    await card.getByRole('button', { name: 'Confirm understanding: Packing', exact: true }).click();
    await card.getByRole('button', { name: 'Policy yes: Packing', exact: true }).click();
    await card.getByRole('button', { name: 'Accept cover: Packing', exact: true }).click();
    await lab.getByLabel("Adviser: Who can agree to a role's optional extra duty?", { exact: true }).selectOption('individual');
    await lab.getByLabel('Adviser: Must a role share a private explanation to retain pay or refuse?', { exact: true }).selectOption('optional');
    await lab.getByLabel('Adviser: What may the adviser execute?', { exact: true }).selectOption('bounded');
    await lab.getByRole('button', { name: 'Hear simulated team responses', exact: true }).click();
    expect((await observeWorkplace(page)).readiness.allowed).toBe(true);
  };
  await answer();
  await assertWorkplaceFits(page);
  if (mobile) {
    await lab.getByRole('heading', { name: 'Adviser working agreement', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDirectory, 'workplace-mission-mobile-agreement.png'), fullPage: true });
  }
  const reviews = [];
  const representativeWorkers = [];
  const negotiationReceipts = [];
  for (let shift = 0; shift < 3; shift++) {
    if (shift > 0) {
      await lab.getByRole('button', { name: 'Continue to next campaign shift', exact: true }).click();
      if (shift === 2) {
        await lab.getByRole('button', { name: "Try the manager's pay penalty (blocked)", exact: true }).click();
        await expect(lab.getByText(/Refusal cannot reduce pay/)).toBeVisible();
        await lab.getByRole('button', { name: 'Protect pay and correct the adviser', exact: true }).click();
      }
      await lab.getByRole('radio', { name: /Invite voluntary cover/ }).check();
      await exercisePressureCard(page, shift === 1 ? 'mind' : 'packing');
      if (shift === 2) {
        const negotiation = lab.getByRole('region', { name: 'Thursday negotiation' });
        await expect(negotiation.getByRole('heading', { name: 'Your choices, this shift' })).toBeVisible();
        await expect(negotiation.getByText('pending', { exact: true })).toHaveCount(3);
        await negotiation.getByText('Offer, choices and receipts', { exact: true }).click();
        await negotiation.getByRole('heading', { name: 'Your choices, this shift' }).scrollIntoViewIfNeeded();
        await assertWorkplaceFits(page);
        await page.screenshot({ path: path.join(outputDirectory, `workplace-thursday-negotiation${mobile ? '-mobile' : ''}${linked ? '-linked' : ''}.png`), fullPage: true });
        const beforeNavigation = await observeWorkplace(page);
        const plantBeforeNavigation = await observePlant(page);
        if (mobile) await closeMobilePanel(page);
        else await page.getByRole('button', { name: 'Close sidebar panel', exact: true }).click();
        const companion = page.getByRole('complementary', { name: 'Working agreement companion' });
        let navigation;
        if (await companion.isVisible()) {
          await companion.getByRole('button', { name: 'View packing floor', exact: true }).focus();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1000);
          await page.screenshot({ path: path.join(outputDirectory, `workplace-thursday-mill${mobile ? '-mobile' : ''}${linked ? '-linked' : ''}.png`), fullPage: true });
          await companion.getByRole('button', { name: 'Open agreement controls', exact: true }).click();
          navigation = 'Optional Packing camera and companion controls';
        } else {
          // Any running plant can retain genuine critical alerts. Observe them
          // through the shipping UI; never erase an alert to manufacture quiet.
          const viewport = page.viewportSize();
          if (mobile) await page.setViewportSize(DESKTOP_VIEWPORT);
          await page.getByRole('button', { name: /^Notifications \(/ }).click();
          await expect(page.getByText('critical:', { exact: true }).first()).toBeAttached();
          await page.getByRole('button', { name: 'Close notifications', exact: true }).click();
          if (mobile) await page.setViewportSize(viewport);
          await expect(companion).toHaveCount(0);
          await openWorkplace(page, mobile);
          navigation = 'Companion yields to observed critical alerts; canonical dock stays available';
        }
        expect(await observeWorkplace(page)).toEqual(beforeNavigation);
        expect(await observePlant(page)).toEqual(plantBeforeNavigation);
        await expect(lab).toBeVisible();
        negotiationReceipts.push({ beforeNavigation, afterNavigation: await observeWorkplace(page), navigation, scope: 'Observed camera/workspace navigation or critical-alert priority; agreement and physical plant unchanged' });
      }
      await lab.getByRole('button', { name: 'Agreement / Voices', exact: true }).click();
      await answer();
    }
    await lab.getByRole('button', { name: 'Approve and run agreement', exact: true }).click();
    await expect(lab.getByText(/Execution: verified/)).toBeVisible();
    if (shift === 1) {
      await campaignClock(page, '1x', mobile);
      await page.waitForFunction(() => window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.minute'] }).data?.state?.workplace?.minute >= 25, null, { timeout: 120000 });
      await campaignClock(page, 'Pause', mobile);
      await lab.getByRole('button', { name: 'Shift', exact: true }).click();
      const held = await observeWorkplace(page);
      expect(held.phase).toBe('active');
      expect(held.capacityMultiplier).toBe(0);
      await lab.getByRole('button', { name: 'Try to skip inspection (blocked)', exact: true }).click();
      await expect(lab.getByText(/cannot waive qualified inspection/)).toBeVisible();
      await lab.getByRole('button', { name: 'Quality initiates five-minute inspection', exact: true }).click();
    }
    if (linked && shift === 0 && !mobile) {
      // Pause the real agreement clock during protected rest. The camera hook
      // frames an actual mounted worker; it never moves the actor or edits a store.
      await campaignClock(page, '1x');
      await page.waitForFunction(() => window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.minute'] }).data?.state?.workplace?.minute >= 75, null, { timeout: 120000 });
      await campaignClock(page, 'Pause');
      const presence = await page.evaluate(() => window.__MILLOS_RUNTIME__.snapshot().humanPresence);
      const mapped = presence.people.filter((p) => p.agreementMemberId);
      expect(mapped).toHaveLength(4);
      expect(mapped.every((p) => p.agreementState === 'rest' && p.activity === 'break' && p.agreementPresentation === 'representative')).toBe(true);
      const representative = mapped.find((p) => p.agreementMemberId === 'quality');
      await page.getByRole('button', { name: 'Close sidebar panel', exact: true }).click();
      // The authored preset enters the factory through its supported flight.
      // A direct exterior-to-interior pose is correctly stopped at the wall.
      await page.keyboard.press('5');
      await page.waitForFunction(() => {
        const p = window.__MILLOS_RUNTIME__.snapshot().camera.position;
        return Math.hypot(p[0] + 34, p[1] - 14, p[2]) < 0.1;
      });
      // Stay beyond the live orbit rig's 15 m minimum, along the west aisle.
      const cameraPosition = [representative.position[0] + 2, representative.position[1] + 4, representative.position[2] + 15.5];
      await page.evaluate(({ position, subject }) => window.__MILLOS_RUNTIME__.setCameraPose(position, [subject[0], subject[1] + 1.2, subject[2]]), { position: cameraPosition, subject: representative.position });
      await page.waitForTimeout(1000);
      const camera = await page.evaluate(() => window.__MILLOS_RUNTIME__.snapshot().camera);
      expect(Math.hypot(...camera.position.map((value, index) => value - cameraPosition[index]))).toBeLessThan(0.1);
      const still = await page.evaluate(() => window.__MILLOS_RUNTIME__.snapshot().humanPresence.people.filter((p) => p.agreementMemberId));
      expect(still.map((p) => p.position)).toEqual(mapped.map((p) => p.position));
      await page.screenshot({ path: path.join(outputDirectory, 'workplace-mission-workers-rest.png'), fullPage: true });
      representativeWorkers.push({ mapped, still, camera, scope: 'Representative off-duty poses, not physical work or wellbeing evidence' });
      await openWorkplace(page);
    }
    await campaignClock(page, '10x', mobile);
    await page.waitForFunction(() => window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.phase'] }).data?.state?.workplace?.phase === 'review', null, { timeout: 120000 });
    await campaignClock(page, 'Pause', mobile);
    await lab.getByRole('button', { name: 'Review', exact: true }).click();
    const review = await observeWorkplace(page);
    expect(review.campaign.shift).toBe(shift);
    expect(review.members.every((m) => m.recoveryOwedMinutes === 0 && m.restMinutes === 15 && m.preference === null)).toBe(true);
    expect(review.campaign.history.length).toBe(shift);
    reviews.push(review);
  }
  expect(reviews[0].members.find((m) => m.extraMinutes > 0).id).toBe('maintenance');
  expect(reviews[1].members.find((m) => m.extraMinutes > 0).id).toBe('packing');
  expect(reviews[2].members.find((m) => m.extraMinutes > 0).id).toBe('maintenance');
  expect(reviews[1].campaign.inspectionComplete).toBe(true);
  expect(reviews[2].campaign.outcomes.agreement.status).toBe('honoured');
  expect(reviews[2].campaign.complete).toBe(reviews[2].campaign.outcomes.delivery.status === 'met');
  expect(reviews[2].campaign.totals.repairs).toBe(1);
  expect(reviews[2].campaign.relationship).toHaveLength(3);
  expect(reviews[2].campaign.relationship.every((record) => record.events.some((event) => event.kind === 'pressure-challenged') && record.events.some((event) => event.kind === 'objection-resolved'))).toBe(true);
  await expect(lab.getByText(/Living Cooperative campaign complete|Campaign review: delivery or working agreement remains incomplete/)).toBeVisible();
  await assertWorkplaceFits(page);
  await lab.getByRole('heading', { name: 'Cumulative campaign evidence', exact: true }).scrollIntoViewIfNeeded();
  if (linked) {
    await lab.locator('summary').filter({ hasText: 'Relationship record across shifts' }).click();
    await lab.getByText('Public requests, challenges, repairs and delivered recovery.', { exact: false }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDirectory, `workplace-mission-relationship${mobile ? '-mobile' : ''}.png`), fullPage: true });
    await page.screenshot({ path: path.join(outputDirectory, `workplace-mission-lab-review${mobile ? '-mobile' : ''}.png`), fullPage: true });
    if (mobile) await closeMobilePanel(page);
    await page.getByRole('button', { name: 'Mill Overview', exact: true }).click();
    const commitment = page.getByRole('region', { name: 'Your shift commitment' });
    await commitment.getByRole('heading', { name: 'Linked working agreement', exact: true }).scrollIntoViewIfNeeded();
    const geometry = await commitment.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    await expect(commitment.getByText(/Working agreement: honoured/)).toBeVisible();
  }
  if (linked) {
    await openWorkplace(page, mobile);
    await lab.getByRole('button', { name: 'Review', exact: true }).click();
  }
  const proposalRegion = lab.getByRole('region', { name: 'Reversible practice proposal' });
  await proposalRegion.getByText('Boundaries, repayment and rollback', { exact: true }).click();
  const proposalButton = proposalRegion.getByRole('button', { name: 'Download planning-only practice proposal', exact: true });
  await proposalButton.focus();
  await expect(proposalButton).toBeFocused();
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await downloadPromise;
  const proposalPath = path.join(outputDirectory, `practice-proposal${mobile ? '-mobile' : ''}${linked ? '-linked' : ''}.json`);
  await download.saveAs(proposalPath);
  const practiceProposal = JSON.parse(await readFile(proposalPath, 'utf8'));
  expect(practiceProposal.kind).toBe('reversible-working-agreement-draft');
  expect(practiceProposal.liveControl).toBe(false);
  expect(practiceProposal.localApprovals).toContain('Not collected');
  expect(practiceProposal.rollback).toContain('owed recovery');
  expect(JSON.stringify(practiceProposal)).not.toMatch(/ballot|coverConsent|preference/);
  expect(practiceProposal.limits.maximumCoverMinutes).toBe(10);
  await assertWorkplaceFits(page);
  await proposalRegion.getByRole('heading', { name: 'A small practice to try' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDirectory, `workplace-practice-proposal${mobile ? '-mobile' : ''}${linked ? '-linked' : ''}.png`), fullPage: true });
  const plantBeforeArchive = await observePlant(page);
  const archiveButton = lab.getByRole('button', { name: 'Archive review and open a fresh exercise', exact: true });
  await expect(archiveButton).toBeEnabled();
  await archiveButton.focus();
  await expect(archiveButton).toBeFocused();
  await page.keyboard.press('Enter');
  const fresh = await observeWorkplace(page);
  expect(fresh.phase).toBe('idle');
  expect(fresh.campaign).toBeNull();
  expect(fresh.members.every((member) => !member.understood && member.ballot === null && member.coverConsent === null && member.preference === null)).toBe(true);
  expect(await observePlant(page)).toEqual(plantBeforeArchive);
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('millos-workplace-laboratory')).state.completedCampaigns);
  expect(retained).toHaveLength(1);
  expect(retained[0].campaign.history).toHaveLength(2);
  expect(retained[0].members.every((member) => member.preference === '' && !member.sharing && !member.understood && member.coverConsent === null)).toBe(true);
  await lab.locator('summary').filter({ hasText: 'Retained campaign reviews (1)' }).click();
  await lab.locator('summary').filter({ hasText: /^cooperative, seed/ }).click();
  await assertWorkplaceFits(page);
  await lab.getByRole('button', { name: 'Download this redacted review', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDirectory, `workplace-archive${mobile ? '-mobile' : ''}.png`), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page, true);
  await openWorkplace(page, mobile);
  await expect(workplaceLab(page).getByText('Retained campaign reviews (1)', { exact: true })).toBeVisible();
  await workplaceLab(page).getByLabel('Adoption profile', { exact: true }).selectOption('team');
  await workplaceLab(page).getByRole('button', { name: 'Start Living Cooperative campaign', exact: true }).click();
  const repeated = await observeWorkplace(page);
  expect(repeated.campaign.shift).toBe(0);
  expect(repeated.members.every((member) => !member.understood && member.ballot === null && member.coverConsent === null)).toBe(true);
  return { reviews, representativeWorkers, negotiationReceipts, practiceProposal, retained, repeated, checks: ['matched-management-forecasts', 'three-real-clock-shifts', 'wrong-answer-corrected', 'both-sides-understanding', 'raiser-owned-pressure-remedies', 'public-relationship-receipts-retained', 'rotating-current-volunteers', 'five-minute-quality-hold', 'retaliation-blocked', 'cash-and-earned-history-retained', 'obligations-delivered', 'redacted-completed-campaign-archive', 'archive-preserves-physical-plant', 'archive-survives-reload', 'fresh-charter-after-review', 'no-horizontal-overflow'] };
}

// Working if every charter completes dissent, revision, actual dispatch and
// settlement through shipping controls, without supplied votes or plant writes.
async function exerciseDissentCampaign(page, mobile, profile) {
  const commitment = page.getByRole('region', { name: 'Your shift commitment' });
  await commitment.getByLabel('Working agreement profile', { exact: true }).selectOption(profile);
  await commitment.getByRole('button', { name: 'Start linked cooperative campaign', exact: true }).click();
  const lab = workplaceLab(page);
  await lab.waitFor({ state: 'visible' });
  const starting = await observeWorkplace(page);
  const plantStart = await observePlant(page);
  expect(starting.campaign.mission).toBeTruthy();
  expect(starting.governance).toBe(profile === 'toe-dip' ? 'consultative' : profile === 'team' ? 'team-consent' : 'member-vote');
  const originalTarget = starting.campaign.mission.originalTargetKg;
  const answer = async (approve, decline = false) => {
    await lab.getByRole('button', { name: 'Agreement / Voices', exact: true }).click();
    const card = lab.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Packing:/ }) });
    if (!(await card.evaluate(element => element.open))) await card.locator('summary').click();
    for (const [prompt, value] of [
      ["Packing: Who can agree to a role's optional extra duty?", 'individual'],
      ['Packing: Must a role share a private explanation to retain pay or refuse?', 'optional'],
      ['Packing: What happens to earned compensation and recovery after withdrawal?', 'retained'],
    ]) await card.getByLabel(prompt, { exact: true }).selectOption(value);
    await card.getByRole('button', { name: 'Confirm understanding: Packing', exact: true }).click();
    await card.getByRole('button', { name: `Policy ${approve ? 'yes' : 'no'}: Packing`, exact: true }).click();
    if (decline) await card.getByRole('button', { name: 'Decline cover: Packing', exact: true }).click();
    for (const [prompt, value] of [
      ["Adviser: Who can agree to a role's optional extra duty?", 'individual'],
      ['Adviser: Must a role share a private explanation to retain pay or refuse?', 'optional'],
      ['Adviser: What may the adviser execute?', 'bounded'],
    ]) await lab.getByLabel(prompt, { exact: true }).selectOption(value);
    const before = (await observeWorkplace(page)).members.find(m => m.id === 'packing');
    await lab.getByRole('button', { name: 'Hear simulated team responses', exact: true }).click();
    expect((await observeWorkplace(page)).members.find(m => m.id === 'packing')).toEqual(before);
  };
  const reviews = [];
  let declinedOffer, revisedOffer, acceptedOffer;
  for (let shift = 0; shift < 3; shift++) {
    if (shift) await lab.getByRole('button', { name: 'Continue to next campaign shift', exact: true }).click();
    await lab.getByRole('button', { name: 'Shift', exact: true }).click();
    if (shift === 0) await lab.getByRole('button', { name: /^Keep the [\d,]+ kg commitment$/, exact: true }).click();
    await exercisePressureCard(page, shift === 0 ? 'quality' : shift === 1 ? 'mind' : 'packing');
    await lab.getByRole('button', { name: 'Shift', exact: true }).click();
    if (shift === 2) {
      await lab.getByRole('button', { name: 'Protect pay and correct the adviser', exact: true }).click();
      await lab.getByRole('radio', { name: /Invite voluntary cover/ }).check();
      await answer(false, true);
      declinedOffer = await observeWorkplace(page);
      if (profile === 'team') await expect(lab.getByRole('button', { name: 'Approve and run agreement', exact: true })).toBeDisabled();
      const revise = lab.getByRole('button', { name: 'Go to Shift controls', exact: true });
      await revise.focus(); await expect(revise).toBeFocused(); await page.keyboard.press('Enter');
      await assertWorkplaceFits(page);
      await lab.getByRole('heading', { name: 'Choose the response', exact: true }).scrollIntoViewIfNeeded();
      await expect(lab.getByRole('heading', { name: 'Choose the response', exact: true })).toBeInViewport();
      await page.waitForTimeout(options.settleSeconds * 1000);
      await page.screenshot({ path: path.join(outputDirectory, `dissent-${profile}${mobile ? '-mobile' : ''}-offers.png`), fullPage: true });
      await lab.getByRole('button', { name: /^Negotiate an [\d,]+ kg installment and protect pay$/, exact: true }).click();
      revisedOffer = await observeWorkplace(page);
      expect(revisedOffer.finance).toEqual(declinedOffer.finance);
      expect(revisedOffer.members.every(m => !m.understood && m.ballot === null && m.coverConsent === null)).toBe(true);
      expect(revisedOffer.campaign.mission.originalTargetKg).toBe(originalTarget);
      expect(revisedOffer.campaign.mission.targetKg).toBe(originalTarget * 0.8);
      expect(revisedOffer.readiness.allowed).toBe(false);
      await lab.getByRole('button', { name: 'Agreement / Voices', exact: true }).click();
      await expect(lab.getByRole('button', { name: 'Approve and run agreement', exact: true })).toBeDisabled();
      await lab.getByRole('button', { name: 'Shift', exact: true }).click();
    }
    await lab.getByRole('radio', { name: /Protect the rhythm/ }).check();
    await answer(shift !== 2 || profile === 'team');
    const terms = await observeWorkplace(page);
    expect(terms.readiness.allowed).toBe(true);
    if (shift === 2) acceptedOffer = terms;
    await lab.getByRole('button', { name: 'Approve and run agreement', exact: true }).click();
    await expect(lab.getByText(/Execution: verified/)).toBeVisible();
    if (shift === 1) {
      await campaignClock(page, '1x', mobile);
      await page.waitForFunction(() => window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.minute'] }).data?.state?.workplace?.minute >= 25, null, { timeout: 120000 });
      await campaignClock(page, 'Pause', mobile);
      await lab.getByRole('button', { name: 'Shift', exact: true }).click();
      await lab.getByRole('button', { name: 'Quality initiates five-minute inspection', exact: true }).click();
    }
    await campaignClock(page, shift === 2 ? 'Relaxed' : '1x', mobile);
    await page.waitForFunction(() => window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.phase'] }).data?.state?.workplace?.phase === 'review', null, { timeout: 300000 });
    await campaignClock(page, 'Pause', mobile);
    await lab.getByRole('button', { name: 'Review', exact: true }).click();
    const review = await observeWorkplace(page);
    expect(review.members.every(m => m.extraMinutes === 0 && m.restMinutes === 15 && m.recoveryOwedMinutes === 0)).toBe(true);
    for (const member of review.members) expect(member.earnedPay).toBeCloseTo(27, 8);
    expect(review.finance.wagesPaid).toBeCloseTo(108, 8);
    expect(review.finance.compensationPaid).toBe(0);
    reviews.push(review);
  }
  const final = reviews.at(-1);
  const plantEnd = await observePlant(page);
  const order = plantEnd.campaign.orders.find(o => o.id === final.campaign.mission.orderId);
  const initialOrder = plantStart.campaign.orders.find(o => o.id === order.id);
  expect(order.requiredKg).toBe(initialOrder.requiredKg);
  expect(final.campaign.mission.creditedKg).toBeCloseTo(order.shippedKg - initialOrder.shippedKg, 6);
  expect(final.campaign.mission.creditedKg).toBeGreaterThan(0);
  expect(final.campaign.outcomes.delivery.remainingKg).toBeCloseTo(Math.max(0, originalTarget - final.campaign.mission.creditedKg), 6);
  expect(final.campaign.outcomes.agreement.status).toBe('honoured');
  expect(plantEnd.material.manifests.some(m => m.kind === 'shipping')).toBe(true);
  const negotiation = lab.getByRole('region', { name: 'Thursday negotiation' });
  const sequence = negotiation.getByText('Offer, choices and receipts', { exact: true });
  if (!(await sequence.evaluate(el => el.parentElement.open))) await sequence.click();
  await negotiation.getByRole('heading', { name: 'Adviser proposal', exact: true }).scrollIntoViewIfNeeded();
  await expect(negotiation.getByRole('heading', { name: 'Adviser proposal', exact: true })).toBeInViewport();
  await page.waitForTimeout(options.settleSeconds * 1000);
  const settlementFrame = await negotiation.getByRole('heading', { name: 'Adviser proposal', exact: true }).evaluate(element => {
    const box = element.getBoundingClientRect();
    const ancestors = [];
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      ancestors.push({ tag: node.tagName, opacity: style.opacity, visibility: style.visibility, display: style.display });
    }
    return { x: box.x, y: box.y, width: box.width, height: box.height, ancestors };
  });
  await assertWorkplaceFits(page);
  await page.screenshot({ path: path.join(outputDirectory, `dissent-${profile}${mobile ? '-mobile' : ''}-settlement.png`), fullPage: true });
  // Retention must accept the new decision, preserve its accounts and grant no authority.
  await lab.getByRole('button', { name: 'Archive review and open a fresh exercise', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page, true);
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('millos-workplace-laboratory')).state.completedCampaigns);
  expect(retained).toHaveLength(1);
  expect(retained[0].campaign.decision).toBe('renegotiate');
  expect(retained[0].members.every(m => m.ballot === null && m.coverConsent === null && !m.sharing)).toBe(true);
  return { profile, declinedOffer, revisedOffer, acceptedOffer, reviews, plantStart, plantEnd, retained, settlementFrame, checks: ['recorded-policy-no', 'separate-cover-decline', 'governance-respected', 'all-decisions-invalidated', 'fresh-approval', 'actual-quality-dispatch', 'customer-target-retained', 'paid-protected-work', 'raiser-owned-remedy', 'redacted-reload', 'receipt-heading-in-viewport'] };
}

async function exercisePlantReplay(page, mobile = false) {
  const lab = workplaceLab(page);
  await lab.getByRole('button', { name: 'Experiment', exact: true }).click();
  await lab.getByRole('button', { name: 'Start guided plant replay', exact: true }).click();
  await expect(lab.getByRole('heading', { name: 'Guided replay: Shift', exact: true })).toBeVisible();
  const starting = await observeWorkplace(page);
  expect(starting.campaign.mission).toBeTruthy();
  expect(starting.minute).toBe(0);
  expect(starting.members.every((m) => m.coverConsent === null && !m.understood && m.ballot === null)).toBe(true);
  await assertWorkplaceFits(page);
  await page.screenshot({ path: path.join(outputDirectory, `workplace-replay-guide${mobile ? '-mobile' : ''}.png`), fullPage: true });
  const snapshots = [];
  const plantRuns = [];
  // Working if all three charters replay one physical checkpoint with fresh
  // role authority and separate actual dispatch, repayment and cost receipts.
  const replayProfiles = ['toe-dip', 'team', 'cooperative'];
  for (const profile of replayProfiles) {
    if (profile !== 'toe-dip') {
      await lab.getByRole('button', { name: 'Experiment', exact: true }).click();
      await lab.getByRole('button', { name: `Replay ${profile} charter`, exact: true }).click();
      const fresh = await observeWorkplace(page);
      expect(fresh.minute).toBe(0);
      expect(fresh.campaign.mission.orderId).toBe(starting.campaign.mission.orderId);
      expect(fresh.campaign.mission.startingShippedKg).toBe(starting.campaign.mission.startingShippedKg);
      expect(fresh.campaign.mission.materialSessionId).toBe(starting.campaign.mission.materialSessionId);
      expect(fresh.members.every((m) => m.coverConsent === null && !m.understood && m.ballot === null)).toBe(true);
      expect(fresh.governance).toBe(profile === 'cooperative' ? 'member-vote' : 'team-consent');
    }
    const plantStart = await observePlant(page);
    await lab.getByRole('button', { name: /^Negotiate (a [\d,]+ kg delivery|an [\d,]+ kg installment)$/, exact: true }).click();
    await lab.getByRole('radio', { name: profile !== 'toe-dip' ? /Resequence together/ : /Invite voluntary cover/ }).check();
    await exercisePressureCard(page, 'quality');
    await lab.getByRole('button', { name: 'Agreement / Voices', exact: true }).click();
    const packing = lab.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Packing:/ }) });
    if (!(await packing.evaluate((element) => element.open))) await packing.locator('summary').click();
    for (const [prompt, answer] of [
      ["Packing: Who can agree to a role's optional extra duty?", 'individual'],
      ['Packing: Must a role share a private explanation to retain pay or refuse?', 'optional'],
      ['Packing: What happens to earned compensation and recovery after withdrawal?', 'retained'],
    ]) await packing.getByLabel(prompt, { exact: true }).selectOption(answer);
    const pendingPacking = (await observeWorkplace(page)).members.find((member) => member.id === 'packing');
    await lab.getByRole('button', { name: 'Hear simulated team responses', exact: true }).click();
    expect((await observeWorkplace(page)).members.find((member) => member.id === 'packing')).toEqual(pendingPacking);
    expect(pendingPacking.understood).toBe(false);
    expect(pendingPacking.ballot).toBeNull();
    expect(pendingPacking.coverConsent).toBeNull();
    await packing.getByRole('button', { name: 'Confirm understanding: Packing', exact: true }).click();
    await packing.getByRole('button', { name: 'Policy yes: Packing', exact: true }).click();
    if (profile === 'toe-dip') await packing.getByRole('button', { name: 'Accept cover: Packing', exact: true }).click();
    for (const [prompt, answer] of [
      ["Adviser: Who can agree to a role's optional extra duty?", 'individual'],
      ['Adviser: Must a role share a private explanation to retain pay or refuse?', 'optional'],
      ['Adviser: What may the adviser execute?', 'bounded'],
    ]) await lab.getByLabel(prompt, { exact: true }).selectOption(answer);
    await lab.getByRole('button', { name: 'Hear simulated team responses', exact: true }).click();
    expect((await observeWorkplace(page)).readiness.allowed).toBe(true);
    await lab.getByRole('button', { name: 'Approve and run agreement', exact: true }).click();
    await expect(lab.getByText(/Execution: verified/)).toBeVisible();
    await lab.getByRole('button', { name: 'Resume agreed replay at teaching pace (30×)', exact: true }).click();
    await page.waitForFunction(() => window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.phase'] }).data?.state?.workplace?.phase === 'review', null, { timeout: 300000 });
    const plantReview = await observePlant(page);
    expect(plantReview.simulation.gameSpeed).toBe(0);
    expect(plantReview.campaign.elapsedMinutes - plantStart.campaign.elapsedMinutes).toBeCloseTo(90, 7);
    const reviewed = await observeWorkplace(page);
    expect(reviewed.members.every((m) => m.recoveryOwedMinutes === 0 && m.restMinutes >= 15)).toBe(true);
    snapshots.push(reviewed);
    await lab.getByRole('button', { name: 'Experiment', exact: true }).click();
    await lab.getByRole('button', { name: 'Retain actual run review', exact: true }).click();
    await expect(lab.getByRole('article', { name: `${profile} actual run`, exact: true })).toBeVisible();
    const plantHeld = await observePlant(page);
    expect(plantHeld.campaign.elapsedMinutes).toBe(plantReview.campaign.elapsedMinutes);
    expect(plantHeld.material.totals.shippedKg).toBe(plantReview.material.totals.shippedKg);
    plantRuns.push({ start: plantStart, review: plantReview, held: plantHeld });
  }
  const downloadPromise = page.waitForEvent('download');
  await lab.getByRole('button', { name: 'Download redacted replay report', exact: true }).click();
  const download = await downloadPromise;
  const reportPath = path.join(outputDirectory, `workplace-replay-report${mobile ? '-mobile' : ''}.json`);
  await download.saveAs(reportPath);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  expect(report.runs).toHaveLength(replayProfiles.length);
  expect(report.runs.map((run) => run.profile)).toEqual(replayProfiles);
  expect(new Set(report.runs.map((r) => r.checkpointId)).size).toBe(1);
  for (const [index, run] of report.runs.entries()) {
    const { start, review } = plantRuns[index];
    const before = start.campaign.orders.find((order) => order.id === starting.campaign.mission.orderId);
    const after = review.campaign.orders.find((order) => order.id === starting.campaign.mission.orderId);
    expect(run.shiftCount).toBe(1);
    expect(run.agreementMinutes).toBe(90);
    expect(run.elapsedMinutes).toBeCloseTo(90, 7);
    expect(run.dispatchedKg).toBeGreaterThan(0);
    expect(run.dispatchedKg).toBeCloseTo(after.shippedKg - before.shippedKg, 7);
    expect(run.manifestIds.length).toBeGreaterThan(0);
    for (const id of run.manifestIds) {
      const manifest = review.material.manifests.find((item) => item.id === id);
      expect(manifest?.kind).toBe('shipping');
      expect(manifest.actualKg).toBeGreaterThan(0);
    }
    expect(review.logistics.shipping.departureCount).toBeGreaterThan(start.logistics.shipping.departureCount);
  }
  expect(report.runs.every((r) => Math.abs(r.materialErrorKg) < 0.001 && Math.abs(r.genealogyErrorKg) < 0.001)).toBe(true);
  expect(report.runs[0].financial.compensation).toBeGreaterThan(0);
  expect(report.runs[1].financial.improvements).toBe(40);
  expect(report.runs[2].financial.improvements).toBe(40);
  expect(report.runs[2].charter.governance).toBe('member-vote');
  await lab.getByRole('article', { name: 'cooperative actual run', exact: true }).scrollIntoViewIfNeeded();
  await assertWorkplaceFits(page);
  await page.screenshot({ path: path.join(outputDirectory, `workplace-replay-comparison${mobile ? '-mobile' : ''}.png`), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page, true);
  await openWorkplace(page, mobile);
  await workplaceLab(page).getByRole('button', { name: 'Experiment', exact: true }).click();
  await expect(workplaceLab(page).getByText('No checkpoint yet. Capture a paused plant to compare actual runs.', { exact: true })).toBeVisible();
  return { report, snapshots, plantRuns, checks: ['whole-starting-situation-replayed', 'three-independent-charters', 'fresh-role-agreement', 'cooperative-member-governance', 'cover-compensated-recovery-delivered', 'resequence-cost-recorded', 'actual-ledger-deltas', 'positive-manifest-backed-dispatch', 'physical-truck-departure', 'matched-90-minute-horizon', 'review-navigation-paused', 'matched-checkpoint', 'no-checkpoint-after-reload', 'no-horizontal-overflow'] };
}

const SCENARIOS = {
  'workplace-replay': {
    title: 'Matched operational replay across toe-dip, team and cooperative charters',
    liveCamera: true,
    viewport: DESKTOP_VIEWPORT,
    prepare: (page) => openWorkplace(page),
    surfaceRole: 'complementary',
    surfaceName: 'Workplace & Autonomy sidebar panel',
    afterOpen: (page) => exercisePlantReplay(page),
  },
  'workplace-replay-mobile': {
    title: 'Matched operational replay and actual comparison at 360px',
    liveCamera: true,
    viewport: { width: 360, height: 780 },
    prepare: (page) => openWorkplace(page, true),
    surfaceRole: 'dialog',
    surfaceName: 'Bilateral Autonomy mobile panel',
    afterOpen: (page) => exercisePlantReplay(page, true),
  },
  'workplace-mission': {
    title: 'Ordinary customer mission with delivery and working-agreement outcomes',
    liveCamera: true,
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Mill Overview',
    surfaceRole: 'complementary',
    surfaceName: 'Mill Overview sidebar panel',
    afterOpen: (page) => exerciseLivingCampaign(page, false, true),
  },
  'workplace-mission-mobile': {
    title: 'Linked ordinary mission and explicit role checks at 360px',
    liveCamera: true,
    viewport: { width: 360, height: 780 },
    prepare: (page) => page.getByRole('button', { name: 'Mill Overview', exact: true }).click(),
    surfaceRole: 'dialog',
    surfaceName: 'Mill Overview mobile panel',
    afterOpen: (page) => exerciseLivingCampaign(page, true, true),
  },
  'workplace-campaign': {
    title: 'Three-shift Living Cooperative campaign and cumulative fairness',
    liveCamera: true,
    viewport: DESKTOP_VIEWPORT,
    prepare: (page) => openWorkplace(page),
    surfaceRole: 'complementary',
    surfaceName: 'Workplace & Autonomy sidebar panel',
    afterOpen: (page) => exerciseLivingCampaign(page),
  },
  'workplace-campaign-mobile': {
    title: 'Living Cooperative comprehension and bounded adviser agreement at 360px',
    liveCamera: true,
    viewport: { width: 360, height: 780 },
    prepare: (page) => openWorkplace(page, true),
    surfaceRole: 'dialog',
    surfaceName: 'Bilateral Autonomy mobile panel',
    afterOpen: (page) => exerciseLivingCampaign(page, true),
  },
  overview: {
    title: 'Mill overview',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Mill Overview',
    surfaceRole: 'complementary',
    surfaceName: 'Mill Overview sidebar panel',
  },
  'scada-overview': {
    title: 'SCADA overview',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Simulated SCADA',
    surfaceRole: 'complementary',
    surfaceName: 'Simulated SCADA sidebar panel',
    afterOpen: async (page) => {
      await page.getByRole('button', { name: 'Open full SCADA workspace', exact: true }).click();
      const workspace = page.getByRole('dialog', { name: 'Full simulated SCADA workspace' });
      await workspace.getByRole('tab', { name: 'Process', exact: true }).click();
      await workspace.getByText('Live material ledger', { exact: true }).waitFor();
    },
  },
  'ai-partner': {
    title: 'AI partner',
    viewport: DESKTOP_VIEWPORT,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'More workspaces and view controls' }).click();
      await page.getByRole('menuitem', { name: 'AI Partner I', exact: true }).click();
    },
    surfaceRole: 'complementary',
    surfaceName: 'AI Partner sidebar panel',
    afterOpen: async (page) => {
      await page.getByTestId('ai-command-center').waitFor();
    },
  },
  'bilateral-autonomy': {
    title: 'Bilateral autonomy',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Bilateral Autonomy System (BAS)',
    surfaceRole: 'complementary',
    surfaceName: 'Workplace & Autonomy sidebar panel',
  },
  'workplace-game': {
    title: 'Funded agreement, refusal, withdrawal and safe reload',
    liveCamera: true,
    viewport: DESKTOP_VIEWPORT,
    prepare: (page) => openWorkplace(page),
    surfaceRole: 'complementary',
    surfaceName: 'Workplace & Autonomy sidebar panel',
    afterOpen: exerciseGameAgreement,
  },
  'workplace-mobile': {
    title: 'Manual workshop at 360px, with modeled pay and no plant authority',
    liveCamera: true,
    viewport: { width: 360, height: 780 },
    prepare: (page) => openWorkplace(page, true),
    surfaceRole: 'dialog',
    surfaceName: 'Bilateral Autonomy mobile panel',
    afterOpen: async (page) => {
      const lab = workplaceLab(page);
      await beginWorkplace(page, 'workshop');
      await recordManualRoles(page, true);
      await expect(lab.getByRole('button', { name: 'Hear simulated team responses' })).toHaveCount(0);
      await lab.getByRole('button', { name: 'Record workshop agreement', exact: true }).click();
      await lab.getByRole('button', { name: 'Shift', exact: true }).click();
      await lab.getByRole('button', { name: 'Advance rehearsal by 5 minutes', exact: true }).click();
      const advanced = await observeWorkplace(page);
      expect(advanced.minute).toBe(5);
      expect(advanced.capacityMultiplier).toBe(1);
      expect(advanced.shippedKg).toBe(0);
      expect(advanced.finance.wagesPaid).toBe(6);
      await lab.getByRole('button', { name: 'Pause and finish shift review', exact: true }).click();
      await lab.getByRole('button', { name: 'Review', exact: true }).click();
      await assertWorkplaceFits(page);
      const heightRatio = await page.getByRole('dialog', { name: 'Bilateral Autonomy mobile panel' }).evaluate((dialog) => dialog.getBoundingClientRect().height / window.innerHeight);
      expect(heightRatio).toBeGreaterThan(0.6);
      expect(heightRatio).toBeLessThanOrEqual(0.71);
      await lab.getByRole('heading', { name: 'Relationship evidence', exact: true }).scrollIntoViewIfNeeded();
      return { advanced, heightRatio, checks: ['manual-role-inputs', 'no-authored-votes', 'no-plant-factor', 'no-shipment-credit', 'no-horizontal-overflow', 'bounded-tall-mobile-sheet'] };
    },
  },
  'workplace-practices': {
    title: 'Partial adoption, consultative disagreement and same-seed forecasts',
    viewport: DESKTOP_VIEWPORT,
    prepare: (page) => openWorkplace(page),
    surfaceRole: 'complementary',
    surfaceName: 'Workplace & Autonomy sidebar panel',
    afterOpen: async (page) => {
      const lab = workplaceLab(page);
      await beginWorkplace(page, 'workshop');
      await lab.getByRole('button', { name: 'Practices', exact: true }).click();
      await lab.getByLabel('Shared governance', { exact: true }).selectOption('consultative');
      await lab.getByLabel('Worker decisions', { exact: true }).selectOption('individual');
      await lab.getByLabel('Team budget', { exact: false }).uncheck();
      await lab.getByRole('button', { name: 'Shift', exact: true }).click();
      await lab.getByRole('radio', { name: /Resequence together/ }).check();
      expect((await observeWorkplace(page)).readiness.reasons).toContain('Enable the practices required by this plan.');
      await lab.getByRole('radio', { name: /Protect the rhythm/ }).check();
      await recordManualRoles(page, false);
      await lab.getByRole('button', { name: 'Record workshop agreement', exact: true }).click();
      const agreed = await observeWorkplace(page);
      expect(agreed.phase).toBe('active');
      expect(agreed.members.every((m) => m.ballot === false)).toBe(true);
      expect(agreed.practices).not.toContain('budget');
      await lab.getByRole('button', { name: 'Experiment', exact: true }).click();
      await lab.getByRole('button', { name: 'Compare all plans with this seed', exact: true }).click();
      await expect(lab.getByText(/^Rush through rest.*forecast.*prohibited/)).toBeVisible();
      await assertWorkplaceFits(page);
      return { agreed, checks: ['modules-enforced', 'consultation-is-not-majority', 'individual-cover-remains-separate', 'counterfactual-labelled'] };
    },
  },
  'workplace-pilot': {
    title: 'Draft-only pilot charter and privacy-redacted local export',
    viewport: DESKTOP_VIEWPORT,
    prepare: (page) => openWorkplace(page),
    surfaceRole: 'complementary',
    surfaceName: 'Workplace & Autonomy sidebar panel',
    afterOpen: async (page) => {
      const lab = workplaceLab(page);
      await beginWorkplace(page, 'pilot');
      await lab.getByRole('button', { name: 'Practices', exact: true }).click();
      await lab.getByLabel('Worker decisions', { exact: true }).selectOption('individual');
      await lab.getByRole('button', { name: 'Agreement / Voices', exact: true }).click();
      await expect(lab.getByRole('button', { name: 'Approve and run agreement', exact: true })).toBeDisabled();
      await lab.locator('summary').filter({ hasText: /^Packing:/ }).click();
      await expect(lab.getByRole('button', { name: 'Share preference for shift planning: Packing', exact: true })).toBeDisabled();
      await lab.getByRole('button', { name: 'Experiment', exact: true }).click();
      const pendingDownload = page.waitForEvent('download');
      await lab.getByRole('button', { name: 'Download synthetic scenario JSON', exact: true }).click();
      const download = await pendingDownload;
      const charter = JSON.parse(await readFile(await download.path(), 'utf8'));
      expect(charter.boundedAuthority.liveControl).toBe(false);
      expect(charter.charter.workerAutonomy).toBe('individual');
      expect(charter.evidence.members.every((m) => m.preference === null)).toBe(true);
      await assertWorkplaceFits(page);
      return { charter, checks: ['draft-configurable', 'role-inputs-denied', 'execution-denied', 'download-redacted', 'local-only'] };
    },
  },
  'safety-controls': {
    title: 'Safety controls',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'complementary',
    surfaceName: 'Safety & Emergency sidebar panel',
    afterOpen: async (page) => {
      await page.getByRole('group', { name: 'Emergency egress verification drill' }).waitFor();
    },
  },
  'fire-drill': {
    title: 'Active egress verification drill',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'complementary',
    surfaceName: 'Safety & Emergency sidebar panel',
    afterOpen: async (page) => {
      await page.getByRole('button', { name: 'START DRILL', exact: true }).click();
      await page.getByRole('alert', { name: 'Simulated fire drill', exact: true }).waitFor();
    },
  },
  'facility-stop': {
    title: 'Facility emergency stop',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'complementary',
    surfaceName: 'Safety & Emergency sidebar panel',
    afterOpen: async (page) => {
      await triggerFacilityStop(page);
    },
  },
  'facility-recovery': {
    title: 'Facility recovery confirmation',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'complementary',
    surfaceName: 'Safety & Emergency sidebar panel',
    afterOpen: async (page) => {
      await triggerFacilityStop(page);
      await page.getByRole('button', { name: 'CLEAR EMERGENCY', exact: true }).click();
      await page.getByRole('status', { name: 'Safety state recovered', exact: true }).waitFor();
    },
  },
  'camera-menu-landscape': {
    title: 'Landscape camera menu',
    viewport: LANDSCAPE_VIEWPORT,
    hasTouch: true,
    prepare: async (page) => {
      // Touch landscape intentionally starts in walk mode. Use its real
      // dismissal and orbit toggle before opening the orbit-only menu.
      await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
      await page.getByRole('button', { name: 'Walk mode', exact: true }).click();
      await page.getByRole('button', { name: 'Open camera menu', exact: true }).click();
    },
    surfaceRole: 'button',
    surfaceName: 'Receiving',
  },
  'machine-focus': {
    title: 'Selected roller mill, Focus control',
    liveCamera: true,
    viewport: DESKTOP_VIEWPORT,
    prepare: focusRollerMill,
    surfaceRole: 'button',
    surfaceName: 'Focus machine',
  },
  'machine-focus-compact': {
    title: 'Focused roller mill after compact viewport resize',
    liveCamera: true,
    viewport: MOBILE_VIEWPORT,
    prepare: async (page) => {
      // Compact UI has no inspector/Focus control. Preserve the real desktop
      // selection and camera flight while checking its compact framing.
      await focusRollerMill(page);
      await page.setViewportSize(MOBILE_VIEWPORT);
    },
    surfaceRole: 'navigation',
    surfaceName: 'Main Navigation',
  },
  'mobile-fire-drill': {
    title: 'Mobile active egress verification drill',
    viewport: MOBILE_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'dialog',
    surfaceName: 'Safety & Emergency mobile panel',
    afterOpen: async (page) => {
      const panel = page.getByRole('dialog', { name: 'Safety & Emergency mobile panel' });
      await panel.getByRole('button', { name: 'START DRILL', exact: true }).click();
      // GameInterface becomes aria-hidden while the modal mobile panel owns
      // focus, but the emergency overlay remains deliberately visible above it.
      await page
        .locator('[role="alert"][aria-label="Simulated fire drill"]')
        .waitFor({ state: 'visible' });
      await panel
        .getByRole('group', { name: 'Emergency egress verification drill' })
        .getByRole('status')
        .filter({ hasText: /zones verified/i })
        .waitFor();
    },
  },
};

for (const profile of ['toe-dip', 'team', 'cooperative']) {
  for (const mobile of [false, true]) {
    SCENARIOS[`workplace-dissent-${profile}${mobile ? '-mobile' : ''}`] = {
      title: `Complete ${profile} refusal and revised delivery agreement${mobile ? ' at 360px' : ''}`,
      liveCamera: true,
      viewport: mobile ? { width: 360, height: 780 } : DESKTOP_VIEWPORT,
      prepare: page => page.getByRole('button', { name: 'Mill Overview', exact: true }).click(),
      surfaceRole: mobile ? 'dialog' : 'complementary',
      surfaceName: mobile ? 'Mill Overview mobile panel' : 'Mill Overview sidebar panel',
      afterOpen: page => exerciseDissentCampaign(page, mobile, profile),
    };
  }
}


async function exerciseHandoff(page, mobile, profile, verdict, guidanceOnly = false, grounded = false) {
  const lab = workplaceLab(page);
  await lab.getByRole('button', { name: 'Handoff', exact: true }).click();
  const panel = lab.getByRole('region', { name: 'Handoff experiment', exact: true });
  await panel.getByLabel('Handoff governance', { exact: true }).selectOption(profile);
  await panel.getByRole('button', { name: 'Open the handoff experiment', exact: true }).click();
  const read = () => page.evaluate(() => {
    const q = window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.improvement', 'workplace.phase', 'workplace.minute', 'workplace.capacityMultiplier', 'workplace.finance', 'workplace.members'] });
    if (!q.data?.state?.workplace?.improvement) throw new Error('Improvement projection missing.');
    return structuredClone(q.data.state.workplace);
  });
  const pressureReceipts = [];
  let packingComparison = null;
  let uiFloor = null;
  if (grounded) {
    const plantBefore = await observePlant(page);
    for (const [episode, choice] of [['late-truck', 'Discuss a smaller delivery'], ['quality-hold', 'Defer this trial'], ['tight-cash', 'Decline extra duty']]) {
      await panel.getByLabel('Pressure episode', { exact: true }).selectOption(episode);
      await panel.getByRole('button', { name: choice, exact: true }).click();
      pressureReceipts.push({ episode, choice, outcome: await panel.getByRole('status').innerText() });
      expect((await read()).members.every(m => m.ballot === null && m.coverConsent === null && m.preference === null)).toBe(true);
    }
    expect(await observePlant(page)).toEqual(plantBefore);
  }
  await panel.getByRole('button', { name: 'Maintenance proposes a small packing buffer', exact: true }).click();
  await panel.getByRole('button', { name: 'Challenge this proposal', exact: true }).focus();
  await page.keyboard.press('Enter');
  await panel.getByRole('button', { name: 'Hear the adviser response', exact: true }).click();
  if (grounded) {
    const plantBefore = await observePlant(page);
    const publicBefore = await read();
    await panel.locator('summary').filter({ hasText: /^Compare matched packing alternatives$/ }).click();
    await panel.getByRole('button', { name: 'Run matched packing rehearsal', exact: true }).click();
    await panel.getByLabel('Matched packing results', { exact: true }).waitFor({ timeout: 120000 });
    packingComparison = await panel.getByLabel('Matched packing results', { exact: true }).innerText();
    expect(await observePlant(page)).toEqual(plantBefore);
    expect(await read()).toEqual(publicBefore);
    expect(publicBefore.improvement.advice).toBeTruthy();
    await panel.locator('summary').filter({ hasText: /^Known facts, age and assumptions$/ }).click();
    uiFloor = await panel.evaluate((root) => {
      const controls = [...root.querySelectorAll('button,select,summary')].filter((e) => !e.closest('details:not([open])') && !e.disabled && e.getBoundingClientRect().width > 0).map((e) => {
        const box = e.getBoundingClientRect(), style = getComputedStyle(e);
        return { label: e.textContent.trim().slice(0, 90), height: box.height, color: style.color, background: style.backgroundColor, fontSize: style.fontSize };
      });
      const evidence = root.querySelector('[aria-label="Plant-grounded adviser evidence"]');
      const paragraph = evidence?.querySelector('p');
      const style = paragraph && getComputedStyle(paragraph);
      return { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, controls, bodyColor: style?.color, bodyFontSize: style?.fontSize, padding: getComputedStyle(root.parentElement).padding };
    });
    expect(uiFloor.reducedMotion).toBe(true);
    expect(uiFloor.controls.every(c => c.height >= 43.5)).toBe(true);
    await assertWorkplaceFits(page);
    await page.screenshot({ path: path.join(outputDirectory, `grounded-${mobile ? 'mobile' : 'desktop'}-evidence.png`), fullPage: true });
  }
  if (guidanceOnly) {
    const nextAction = panel.getByText('Confirm each role’s understanding and current policy ballot in Fresh role decisions here in Handoff.', { exact: true });
    await nextAction.scrollIntoViewIfNeeded();
    await expect(nextAction).toBeVisible();
    await assertWorkplaceFits(page);
    return { profile, workplace: await read(), checks: ['rendered-next-action', 'no-overflow'] };
  }
  await panel.getByRole('button', { name: 'Maintenance proposes a small packing buffer', exact: true }).scrollIntoViewIfNeeded();
  await assertWorkplaceFits(page);
  await page.screenshot({ path: path.join(outputDirectory, `handoff-${profile}${mobile ? '-mobile' : ''}-proposal.png`), fullPage: true });
  const agree = async () => {
    for (const role of ['Packing', 'Quality', 'Maintenance', 'Coordinator']) {
      await panel.getByRole('button', { name: `Confirm handoff understanding: ${role}`, exact: true }).click();
      await panel.getByRole('button', { name: `${profile !== 'team' && role === 'Quality' ? 'Decline' : 'Approve'} handoff: ${role}`, exact: true }).click();
    }
    await panel.locator('fieldset').filter({ has: page.getByText('Quality', { exact: true }) }).scrollIntoViewIfNeeded();
    await assertWorkplaceFits(page);
    await page.screenshot({ path: path.join(outputDirectory, `handoff-${profile}${mobile ? '-mobile' : ''}-ballots-${(await read()).improvement.cycle}.png`), fullPage: true });
    await panel.getByRole('button', { name: 'Approve and run handoff trial', exact: true }).click();
    await expect(lab.getByText(/Execution: verified/)).toBeVisible();
    // Match the shipping tutorial's teaching pace. Truck motion and loading
    // use real controller time; a 30-second fast-clock shift can legitimately
    // end before the first truck docks and is not a positive-dispatch fixture.
    await panel.getByLabel('Shift pace', { exact: true }).selectOption('30');
  };
  await agree();
  const active = await read();
  expect(active.capacityMultiplier).toBe(1.02);
  expect(active.finance.improvementSpend).toBe(32);
  expect(active.members.every(m => m.preference === null && m.coverConsent === null)).toBe(true);
  await panel.getByRole('button', { name: 'Watch the packing handoff', exact: true }).click();
  if (verdict === 'stop') {
    await panel.getByRole('button', { name: 'Stop arrangement and keep steady work', exact: true }).click();
    expect((await read()).capacityMultiplier).toBe(0.78);
  }
  await page.waitForFunction(() => window.__MILLOS_AGENT__.query({ view: 'domain', domainId: 'experience', fields: ['workplace.phase'] }).data?.state?.workplace?.phase === 'review', null, { timeout: 600000 });
  const review = await read();
  const plantReview = await observePlant(page);
  expect(review.minute).toBe(90);
  expect(review.finance.wagesPaid).toBeCloseTo(108);
  expect(review.members.every(m => Math.abs(m.earnedPay - 27) < 0.000001 && Math.abs(m.restMinutes - 15) < 0.000001 && m.extraMinutes === 0)).toBe(true);
  expect(review.improvement.mission.evidence).toBe('current');
  expect(plantReview.material.manifests.some(m => m.kind === 'shipping')).toBe(true);
  expect(review.improvement.actualKg).toBeGreaterThan(0);
  await panel.getByRole('button', { name: 'Hear the adviser review its forecast', exact: true }).click();
  for (const role of ['Packing', 'Quality', 'Maintenance', 'Coordinator']) await panel.getByLabel(`${role} review decision`, { exact: true }).selectOption(verdict);
  await panel.getByRole('button', { name: 'Finalise handoff review', exact: true }).click();
  await panel.getByRole('heading', { name: 'What should carry into the next shift?', exact: true }).scrollIntoViewIfNeeded();
  await assertWorkplaceFits(page);
  await page.screenshot({ path: path.join(outputDirectory, `handoff-${profile}${mobile ? '-mobile' : ''}-review.png`), fullPage: true });
  const decided = await read();
  if (grounded) {
    await panel.getByRole('heading', { name: 'How did we treat each other?', exact: true }).scrollIntoViewIfNeeded();
    await assertWorkplaceFits(page);
    await page.screenshot({ path: path.join(outputDirectory, `grounded-${mobile ? 'mobile' : 'desktop'}-conduct.png`), fullPage: true });
  }
  expect(decided.improvement.verdict).toBe(verdict);
  await panel.getByRole('button', { name: 'Open next handoff shift', exact: true }).click();
  const next = await read();
  expect(next.finance.cash).toBe(decided.finance.cash);
  expect(next.improvement.history[0].shippedKg).toBe(decided.improvement.actualKg);
  expect(next.improvement.lifetimeWages).toBeCloseTo(108);
  expect(next.members.every(m => !m.understood && m.ballot === null && m.coverConsent === null)).toBe(true);
  if (verdict === 'stop') await panel.getByRole('button', { name: 'Packing proposes a paid handoff briefing', exact: true }).click();
  await panel.getByRole('button', { name: 'Hear the adviser response', exact: true }).click();
  await agree();
  const continued = await read();
  expect(continued.finance.improvementSpend).toBe(verdict === 'adopt' ? 0 : 8);
  await panel.getByRole('button', { name: 'End handoff shift now', exact: true }).click();
  const paidBeforeReload = await read();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page, true);
  const reloaded = await read();
  expect(reloaded.finance.cash).toBeCloseTo(paidBeforeReload.finance.cash);
  expect(reloaded.capacityMultiplier).toBe(1);
  expect(reloaded.improvement.history).toEqual(paidBeforeReload.improvement.history);
  await openWorkplace(page, mobile);
  await assertWorkplaceFits(page);
  await lab.getByRole('heading', { name: 'The handoff experiment, shift 2', exact: true }).scrollIntoViewIfNeeded();
  return { profile, verdict, active, review, plantReview, decided, next, continued, reloaded, pressureReceipts, packingComparison, uiFloor, checks: ['worker-proposal', 'public-challenge', 'adviser-response', 'explicit-role-decisions', 'funded-physical-pacing', 'quality-qualified-actual-dispatch', 'pay-and-rest-protected', 'member-review', 'cash-history-and-customer-continuity', 'new-agreement-required', 'single-purchase', 'safe-reload', 'no-overflow', ...(grounded ? ['three-isolated-planning-episodes', 'matched-packing-no-live-writes', 'frozen-grounded-advice', 'public-conduct-debrief', '44px-enabled-controls', 'reduced-motion', 'keyboard-challenge'] : [])] };
}
for (const mobile of [false, true]) SCENARIOS[`workplace-grounded${mobile ? '-mobile' : ''}`] = {
  title: `Grounded packing advice, pressure rehearsals and conduct${mobile ? ' at 360px' : ''}`,
  liveCamera: true, viewport: mobile ? { width: 360, height: 780 } : DESKTOP_VIEWPORT,
  prepare: page => openWorkplace(page, mobile),
  surfaceRole: mobile ? 'dialog' : 'complementary',
  surfaceName: mobile ? 'Bilateral Autonomy mobile panel' : 'Workplace & Autonomy sidebar panel',
  afterOpen: page => exerciseHandoff(page, mobile, 'cooperative', 'adopt', false, true),
};
for (const mobile of [false, true]) SCENARIOS[`workplace-grounded-entry${mobile ? '-mobile' : ''}`] = {
  title: `Initial grounded Handoff decision view${mobile ? ' at 360px' : ''}`,
  liveCamera: true, viewport: mobile ? { width: 360, height: 780 } : DESKTOP_VIEWPORT,
  prepare: page => openWorkplace(page, mobile),
  surfaceRole: mobile ? 'dialog' : 'complementary',
  surfaceName: mobile ? 'Bilateral Autonomy mobile panel' : 'Workplace & Autonomy sidebar panel',
  afterOpen: async page => {
    const lab = workplaceLab(page);
    await lab.getByRole('button', { name: 'Handoff', exact: true }).click();
    const panel = lab.getByRole('region', { name: 'Handoff experiment', exact: true });
    await panel.getByLabel('Handoff governance', { exact: true }).selectOption('cooperative');
    await panel.getByRole('button', { name: 'Open the handoff experiment', exact: true }).click();
    const heading = panel.getByRole('heading', { name: 'The handoff experiment, shift 1', exact: true });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeInViewport();
    await expect(panel.getByLabel('Pressure episode', { exact: true })).toBeInViewport();
    await assertWorkplaceFits(page);
    return { checks: ['initial-deliberation-entry', 'heading-and-pressure-selector-in-viewport', 'no-overflow'] };
  },
};
for (const [profile, verdict] of [['toe-dip', 'stop'], ['team', 'amend'], ['cooperative', 'adopt']]) {
  for (const mobile of [false, true]) SCENARIOS[`workplace-handoff-${profile}${mobile ? '-mobile' : ''}`] = {
    title: `Worker-led handoff ${verdict}, ${profile}${mobile ? ' at 360px' : ''}`,
    liveCamera: true, viewport: mobile ? { width: 360, height: 780 } : DESKTOP_VIEWPORT,
    prepare: page => openWorkplace(page, mobile),
    surfaceRole: mobile ? 'dialog' : 'complementary',
    surfaceName: mobile ? 'Bilateral Autonomy mobile panel' : 'Workplace & Autonomy sidebar panel',
    afterOpen: page => exerciseHandoff(page, mobile, profile, verdict),
  };
}

SCENARIOS['handoff-guidance'] = {
  title: 'Corrected handoff next-action guidance after adviser response',
  liveCamera: true, viewport: DESKTOP_VIEWPORT,
  prepare: page => openWorkplace(page, false),
  surfaceRole: 'complementary', surfaceName: 'Workplace & Autonomy sidebar panel',
  afterOpen: page => exerciseHandoff(page, false, 'cooperative', 'adopt', true),
};

const SCENARIO_SETS = {
  quick: ['overview', 'scada-overview', 'fire-drill', 'mobile-fire-drill'],
  desktop: Object.keys(SCENARIOS).filter((name) => SCENARIOS[name].viewport === DESKTOP_VIEWPORT),
  safety: [
    'safety-controls',
    'fire-drill',
    'facility-stop',
    'facility-recovery',
    'mobile-fire-drill',
  ],
  workplace: ['workplace-game', 'workplace-mobile', 'workplace-practices', 'workplace-pilot'],
  'living-cooperative': ['workplace-campaign', 'workplace-campaign-mobile'],
  'linked-cooperative': ['workplace-mission', 'workplace-mission-mobile'],
  'workplace-replay': ['workplace-replay', 'workplace-replay-mobile'],
  'worker-improvement': Object.keys(SCENARIOS).filter(name => name.startsWith('workplace-handoff-')),
  'grounded-cooperation': ['workplace-grounded', 'workplace-grounded-mobile'],
  'grounded-entry': ['workplace-grounded-entry', 'workplace-grounded-entry-mobile'],
  'workplace-dissent': Object.keys(SCENARIOS).filter(name => name.startsWith('workplace-dissent-')),
  full: Object.keys(SCENARIOS),
};

function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function finiteNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(`MillOS operational-review capture

Usage:
  npm run capture:operations -- --label=<name> [options]

Options:
  --label=<name>        Required. Output under test-results/operational-review
  --set=<name>          quick, desktop, safety, workplace, living-cooperative, linked-cooperative, workplace-replay, workplace-dissent, worker-improvement, or full; default full
  --states=<list>       Explicit comma-separated state names, overrides --set
  --quality=<tier>      low, medium, high, or ultra; default medium
  --port=<number>       Local preview port; default 4174
  --time=<hour>         Fixed simulation hour, from 0 to 24; default 12
  --weather=<name>      clear, cloudy, rain, or storm; default clear
  --settle=<seconds>    UI settle time after interaction; default 1
  --channel=<name>      Browser channel; default chrome, empty uses bundled Chromium
  --skip-build          Reuse dist and record that risk in the manifest
  --headed              Use a visible browser and real GPU
  --help                Show this help without launching a browser

States:
  ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(0);
}

const label = readArgument('label', '');
if (!label) throw new Error('--label=<name> is required so the evidence can be referenced later.');
if (!/^[\w.-]+$/.test(label)) {
  throw new Error('--label must contain only letters, digits, dot, dash, or underscore.');
}

const setName = readArgument('set', 'full');
if (!(setName in SCENARIO_SETS)) {
  throw new Error(`Unknown set "${setName}". Expected: ${Object.keys(SCENARIO_SETS).join(', ')}.`);
}
const explicitStates = readArgument('states', '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const stateNames = explicitStates.length > 0 ? explicitStates : SCENARIO_SETS[setName];
const unknownStates = stateNames.filter((state) => !(state in SCENARIOS));
if (unknownStates.length > 0) {
  throw new Error(
    `Unknown operational state(s): ${unknownStates.join(', ')}. Expected: ${Object.keys(SCENARIOS).join(', ')}.`
  );
}

const quality = readArgument('quality', 'medium');
if (!new Set(['low', 'medium', 'high', 'ultra']).has(quality)) {
  throw new Error(`Unknown quality "${quality}". Expected low, medium, high, or ultra.`);
}
const weather = readArgument('weather', 'clear');
if (!new Set(['clear', 'cloudy', 'rain', 'storm']).has(weather)) {
  throw new Error(`Unknown weather "${weather}". Expected clear, cloudy, rain, or storm.`);
}

const options = {
  label,
  scenarioSet: explicitStates.length > 0 ? 'explicit' : setName,
  states: stateNames,
  quality,
  weather,
  time: finiteNumber(readArgument('time', '12'), 12, 0, 24),
  settleSeconds: finiteNumber(readArgument('settle', '1'), 1, 0, 10),
  previewPort: finiteNumber(readArgument('port', '4174'), 4174, 1024, 65535),
  browserChannel: readArgument('channel', 'chrome'),
  skipBuild: hasFlag('skip-build'),
  headed: hasFlag('headed'),
};

const outputDirectory = path.join(OUTPUT_ROOT, label);
let previewProcess = null;
let captureLock = null;

function run(command, args, description) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${description} exited with code ${String(code)}`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.once('exit', (code) => resolve({ code, stdout }));
  });
}

async function gitProvenance() {
  const [commit, branch, status] = await Promise.all([
    capture('git', ['rev-parse', 'HEAD']),
    capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    capture('git', ['status', '--porcelain']),
  ]);
  const dirtyFiles = status.stdout.split('\n').filter((line) => line.trim().length > 0);
  return {
    commit: commit.stdout.trim() || 'unknown',
    branch: branch.stdout.trim() || 'unknown',
    dirty: dirtyFiles.length > 0,
    dirtyFileCount: dirtyFiles.length,
    dirtyFiles: dirtyFiles.map((line) => line.slice(3)),
  };
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview did not become ready at ${url}: ${String(lastError ?? 'timeout')}`);
}

async function startPreview() {
  await access(path.join(ROOT, 'dist', 'index.html')).catch(() => {
    throw new Error('dist/index.html is missing. Run npm run build before capture.');
  });
  const url = `http://127.0.0.1:${options.previewPort}`;
  const viteEntry = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  let previewStderr = '';
  previewProcess = spawn(
    process.execPath,
    [
      viteEntry,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(options.previewPort),
      '--strictPort',
    ],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    }
  );
  previewProcess.stderr.on('data', (chunk) => {
    previewStderr += chunk;
  });
  await Promise.race([
    waitForServer(url),
    new Promise((_, reject) => {
      previewProcess.once('exit', (code) => {
        reject(
          new Error(
            `Preview exited before becoming ready on port ${options.previewPort} ` +
              `(code ${String(code)}): ${previewStderr.trim() || 'no stderr'}`
          )
        );
      });
    }),
  ]);
  return url;
}

async function stopPreview() {
  if (!previewProcess || previewProcess.killed) return;
  previewProcess.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    previewProcess.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForApp(page, liveCamera = false) {
  await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready === true, null, {
    timeout: 90_000,
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.millosWorldReady === 'true',
    null,
    { timeout: 90_000 }
  );
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.millosStartupReady === 'true' &&
      document.querySelector('[aria-label="Loading MillOS"]') === null,
    null,
    { timeout: 120_000 }
  );
  await page.getByTestId('game-interface').waitFor({ state: 'visible', timeout: 30_000 });
  const operationalCapture = await page.evaluate(
    () => window.__MILLOS_RUNTIME__?.mode.operationalCapture === true
  );
  if (!liveCamera && !operationalCapture) {
    throw new Error(
      'Runtime did not acknowledge operations=on; refusing to capture a stale bundle.'
    );
  }
}

async function runScenario(browser, baseUrl, stateName) {
  const scenario = SCENARIOS[stateName];
  const context = await browser.newContext({
    viewport: scenario.viewport,
    hasTouch: scenario.hasTouch ?? false,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    serviceWorkers: 'block',
  });
  await context.addInitScript((skipWelcome) => {
    if (sessionStorage.getItem('millos-operational-fixture')) return;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('millos-operational-fixture', 'ready');
    localStorage.setItem(
      'millos-audio',
      JSON.stringify({ version: 2, muted: true, volume: 0, musicEnabled: false, musicVolume: 0, machineVolume: 0 })
    );
    localStorage.setItem(
      'millos-ui',
      JSON.stringify({ state: { hasSeenIntro: true }, version: 1 })
    );
    if (skipWelcome) {
      // The camera-menu scenario isolates navigation after first-use reading.
      // The separate failure frame preserves the clipped welcome-card defect.
      localStorage.setItem(
        'millos-autonomous-narration',
        JSON.stringify({
          state: { shownNarrations: ['welcome-autonomous-mill'], enabled: true },
          version: 2,
        })
      );
    }
  }, stateName === 'camera-menu-landscape' || stateName.startsWith('workplace-'));

  const page = await context.newPage();
  const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown',
    });
  });

  const query = new URLSearchParams({
    benchmark: scenario.liveCamera ? 'off' : 'overview',
    quality: options.quality,
    time: String(options.time),
    weather: options.weather,
    scada: 'on',
    pa: 'off',
    motion: 'off',
    art: 'on',
    operations: 'on',
  });
  const imagePath = path.join(outputDirectory, `${stateName}.png`);
  const failureImagePath = path.join(outputDirectory, `${stateName}-failure.png`);

  try {
    await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await waitForApp(page, scenario.liveCamera);
    if (scenario.liveCamera) {
      const benchmark = await page.evaluate(() => window.__MILLOS_RUNTIME__.mode.benchmark);
      if (benchmark)
        throw new Error('Camera controls require live runtime, not fixed benchmark mode.');
    }
    if (scenario.prepare) await scenario.prepare(page);
    else await page.getByRole('button', { name: scenario.dockLabel, exact: true }).click();
    const surface = page.getByRole(scenario.surfaceRole, { name: scenario.surfaceName });
    await surface.waitFor({ state: 'visible', timeout: 30_000 });
    const interactionEvidence = scenario.afterOpen ? await scenario.afterOpen(page) : null;
    await page.waitForTimeout(options.settleSeconds * 1000);
    await page.screenshot({ path: imagePath, fullPage: true, timeout: 30_000 });

    const runtime = await page.evaluate(() => {
      const snapshot = window.__MILLOS_RUNTIME__?.snapshot();
      return snapshot
        ? {
            quality: snapshot.quality,
            camera: snapshot.camera,
            worldIntegrityPassed: snapshot.worldIntegrity.passed,
            sceneObjects: snapshot.sceneGraph.objects,
          }
        : null;
    });
    const capturedDiagnostics = {
      consoleErrors: [...diagnostics.consoleErrors],
      pageErrors: [...diagnostics.pageErrors],
      failedRequests: [...diagnostics.failedRequests],
    };
    const passed =
      runtime?.worldIntegrityPassed === true &&
      capturedDiagnostics.consoleErrors.length === 0 &&
      capturedDiagnostics.pageErrors.length === 0 &&
      capturedDiagnostics.failedRequests.length === 0;
    return {
      state: stateName,
      title: scenario.title,
      mode: scenario.liveCamera ? 'live-camera' : 'fixed-benchmark',
      viewport: scenario.viewport,
      image: path.basename(imagePath),
      expectedSurface: { role: scenario.surfaceRole, name: scenario.surfaceName },
      runtime,
      interactionEvidence: interactionEvidence ?? null,
      diagnostics: capturedDiagnostics,
      passed,
    };
  } catch (error) {
    await page
      .screenshot({ path: failureImagePath, fullPage: false, timeout: 10_000 })
      .catch(() => {});
    return {
      state: stateName,
      title: scenario.title,
      mode: scenario.liveCamera ? 'live-camera' : 'fixed-benchmark',
      viewport: scenario.viewport,
      image: null,
      failureImage: path.basename(failureImagePath),
      expectedSurface: { role: scenario.surfaceRole, name: scenario.surfaceName },
      runtime: null,
      diagnostics,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
      failureWorkplace: stateName.startsWith('workplace-') ? await observeWorkplace(page).catch(() => null) : null,
      failurePlant: stateName.startsWith('workplace-') ? await observePlant(page).catch(() => null) : null,
    };
  } finally {
    await context.close();
  }
}

async function buildContactSheet(browser, results) {
  const captured = results.filter((result) => result.image);
  if (captured.length === 0) return null;
  const cells = captured
    .map(
      (result) => `<figure>
        <div class="frame"><img src="${encodeURIComponent(result.image)}" alt="${result.title}" /></div>
        <figcaption>${result.state}</figcaption>
      </figure>`
    )
    .join('');
  const html = `<!doctype html>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #080b11; }
      main { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 10px; }
      figure { margin: 0; overflow: hidden; border: 1px solid #263244; background: #111827; }
      .frame { display: grid; place-items: center; height: 340px; overflow: hidden; background: #05080d; }
      img { display: block; width: 100%; height: 100%; min-height: 0; object-fit: contain; }
      figcaption { padding: 6px 10px; font: 600 18px/1.4 ui-monospace, monospace; color: #e5edf7; }
    </style>
    <main>${cells}</main>`;
  const htmlPath = path.join(outputDirectory, 'contact-sheet.html');
  const imagePath = path.join(outputDirectory, 'contact-sheet.png');
  await writeFile(htmlPath, html);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0)
    );
    await page.screenshot({ path: imagePath, fullPage: true });
  } finally {
    await page.close();
  }
  return path.basename(imagePath);
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const existingFiles = await readdir(outputDirectory);
  if (existingFiles.length > 0) {
    throw new Error(
      `Output directory ${path.relative(ROOT, outputDirectory)} is not empty. Use a fresh label.`
    );
  }

  // Held across the build as well as the capture: concurrent renders halve each
  // other's frame rate, and concurrent builds write the same shared dist/.
  captureLock = await acquireCaptureLock(`operational-review:${options.label}`, { root: ROOT });

  if (!options.skipBuild) {
    console.log('Building the exact tree under review...');
    await run('npm', ['run', 'build'], 'npm run build');
  } else {
    console.warn('WARNING: --skip-build. Frames may show a bundle older than the working tree.');
  }

  const baseUrl = await startPreview();
  const browser = await chromium.launch({
    headless: !options.headed,
    channel: options.browserChannel || undefined,
    args: ['--mute-audio'],
  });
  const results = [];
  let contactSheet = null;
  try {
    for (const stateName of options.states) {
      console.log(`Capturing ${stateName}...`);
      const result = await runScenario(browser, baseUrl, stateName);
      results.push(result);
      console.log(`${stateName}: ${result.passed ? 'PASS' : 'FAIL'}`);
      if (!result.passed) console.error(result.error ?? JSON.stringify(result.diagnostics));
    }
    contactSheet = await buildContactSheet(browser, results);
  } finally {
    await browser.close();
    await stopPreview();
    await captureLock?.release();
    captureLock = null;
  }

  const git = await gitProvenance();
  const caveats = [
    'Operational frames use the reduced-motion accessibility setting for deterministic safety overlays.',
    'The landscape camera-menu fixture marks the one-time welcome narration seen to isolate navigation.',
    'Camera-focus states use ordinary runtime because benchmark mode does not mount camera controls; their simulation is not frozen.',
    'This capture does not establish a performance budget. Run benchmark:runtime on the same candidate.',
    ...(!options.headed
      ? [
          'Headless capture may use software rendering. Treat pixels as smoke evidence, not final art evidence.',
        ]
      : []),
    ...(options.skipBuild
      ? ['Captured with --skip-build; dist may predate the working tree.']
      : []),
    ...(git.dirty
      ? [
          `Working tree was dirty (${git.dirtyFileCount} files). Frames include uncommitted work and cannot serve as a clean baseline.`,
        ]
      : []),
  ];
  const manifest = {
    label: options.label,
    capturedAt: new Date().toISOString(),
    git,
    browser: options.browserChannel
      ? `Playwright ${options.browserChannel} channel`
      : 'Playwright bundled Chromium',
    options,
    deterministicContract: {
      benchmarkScene: 'overview',
      persistedState: 'cleared per frame; onboarding complete',
      reducedMotion: 'reduce',
      serviceWorkers: 'blocked',
      freshBrowserContextPerFrame: true,
      statePreparation: 'shipping UI controls',
    },
    passed: results.every((result) => result.passed),
    results,
    contactSheet,
    caveats,
  };
  const manifestPath = path.join(outputDirectory, 'review-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nFrames:        ${path.relative(ROOT, outputDirectory)}`);
  if (contactSheet)
    console.log(`Contact sheet: ${path.relative(ROOT, path.join(outputDirectory, contactSheet))}`);
  console.log(`Manifest:      ${path.relative(ROOT, manifestPath)}`);
  caveats.forEach((caveat) => console.warn(`CAVEAT: ${caveat}`));
  if (!manifest.passed) process.exitCode = 1;
}

main().catch(async (error) => {
  await stopPreview();
  await captureLock?.release();
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
