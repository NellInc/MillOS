import { SITE_LAYOUT } from '../constants/siteLayout';
import { MachineType } from '../types';
import { resolveMaterialTransport } from './materialTransport';
import {
  PLANNING_DOCKS,
  PLANNING_VIEW,
  planningQueueSummary,
  protectedEgressApproaches,
  roundedPlanningRoute,
  scoreLogisticsLayout,
  stagingBounds,
  type LayoutSnapshot,
  type LogisticsProposal,
  type PlanningAssumptions,
} from './layoutPlanning';

const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
  );
const n = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '0');
const x = (world: number) => (world - PLANNING_VIEW.minX) * 3 + 30;
const z = (world: number) => (world - PLANNING_VIEW.minZ) * 3 + 40;

/** A self-contained, dimensioned drawing, shared by the UI and local SVG/PNG exports. */
export function layoutPlanSvg(
  snapshot: LayoutSnapshot,
  proposal: LogisticsProposal,
  title: string
): string {
  const rect = (
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    attrs: string
  ) =>
    `<rect x="${n(x(bounds.minX))}" y="${n(z(bounds.minZ))}" width="${n((bounds.maxX - bounds.minX) * 3)}" height="${n((bounds.maxZ - bounds.minZ) * 3)}" ${attrs}/>`;
  const queues = new Map(planningQueueSummary(snapshot.buffers).map((queue) => [queue.id, queue]));
  const arrowId = `flow-${title.replace(/[^a-zA-Z0-9]/g, '')}`;
  const sifterHeights = [
    ...new Set(
      snapshot.machines
        .filter((machine) => machine.type === MachineType.PLANSIFTER)
        .map((machine) => n(machine.position[1]))
    ),
  ].join('/');
  const transport = resolveMaterialTransport(snapshot.machines, snapshot.segments);
  const flows = new Set<string>();
  const flowSvg = transport
    .map((route, index) => {
      const key = `${route.fromMachineId}>${route.toMachineId}`;
      if (flows.has(key) || !route.route) return '';
      flows.add(key);
      const segment = snapshot.segments[index];
      const points = route.route.curve
        .getPoints(80)
        .map((point) => `${n(x(point.x))},${n(z(point.z))}`)
        .join(' ');
      const load = snapshot.segments
        .filter(
          (s) => s.fromMachineId === route.fromMachineId && s.toMachineId === route.toMachineId
        )
        .reduce((sum, s) => sum + s.currentLoad, 0);
      return `<polyline points="${points}" fill="none" stroke="#86adb0" stroke-width="${n(1 + Math.min(3, load / 100))}" marker-end="url(#${arrowId})" ${route.provenance === 'modeled' ? 'stroke-dasharray="5 4"' : ''}><title>${xml(key)}: ${n(load)} kg in transit; ${n(segment.flowRate * 60)} kg/min rated; ${route.provenance} path, ${n(route.transitSeconds ?? 0)} s</title></polyline>`;
    })
    .join('');
  const machines = snapshot.machines
    .map((machine) => {
      const queue = queues.get(machine.id);
      const [mx, y, mz] = machine.position;
      const width = machine.size[0],
        depth = machine.size[2];
      const label =
        machine.type === MachineType.SILO
          ? machine.id.replace('silo-', 'S')
          : machine.type === MachineType.ROLLER_MILL
            ? machine.id.replace('rm-', 'M')
            : machine.type === MachineType.PLANSIFTER
              ? machine.id.replace('sifter-', 'SF-').toUpperCase()
              : machine.id.replace('packer-', 'P');
      return (
        rect(
          {
            minX: mx - width / 2,
            maxX: mx + width / 2,
            minZ: mz - depth / 2,
            maxZ: mz + depth / 2,
          },
          `fill="${(queue?.utilization ?? 0) >= 0.8 ? '#63441f' : '#213342'}" stroke="#c2cdd4" ${y > 3 ? 'stroke-dasharray="3 2"' : ''}`
        ) +
        `<text x="${n(x(mx))}" y="${n(z(mz) + 3)}" fill="#f1f5f9" text-anchor="middle" font-size="8"><title>${xml(machine.id)} at +${n(y)} m; ${n(queue?.inputKg ?? 0)} kg in / ${n(queue?.outputKg ?? 0)} kg out</title>${xml(label)}</text>` +
        `<text x="${n(x(mx))}" y="${n(z(mz) + depth * 1.5 + 9)}" fill="#cbd5e1" text-anchor="middle" font-size="7">${((queue?.utilization ?? 0) * 100).toFixed(0)}%</text>`
      );
    })
    .join('');
  const logistics = PLANNING_DOCKS.map((dock) => {
    const route = roundedPlanningRoute(dock, proposal.routes[dock]);
    const points = [...route.points, route.points[0]]
      .map(([px, , pz]) => `${n(x(px))},${n(z(pz))}`)
      .join(' ');
    const stage = stagingBounds(dock, proposal.staging[dock]);
    const color = dock === 'shipping' ? '#f3ba77' : '#6dd3e0';
    return (
      `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3"><title>${dock} forklift loop, full ${n(route.halfWidth * 2)} m clearance corridor checked</title></polyline>` +
      rect(stage, `fill="${color}" fill-opacity="0.15" stroke="${color}"`) +
      `<text x="${n(x((stage.minX + stage.maxX) / 2))}" y="${n(z(stage.maxZ) + 12)}" text-anchor="middle" fill="${color}" font-size="9">${dock === 'shipping' ? '50 pallet spaces' : 'Return pallets'}</text>`
    );
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 700" width="460" height="700" role="img" aria-label="${xml(title)} dimensioned mill logistics plan">
    <title>${xml(title)}: mill logistics and captured material queues</title>
    <defs><marker id="${arrowId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 Z" fill="#86adb0"/></marker></defs>
    <rect width="460" height="700" fill="#0c1c28"/>
    <text x="30" y="22" fill="#f1f5f9" font-family="sans-serif" font-size="15">${xml(title)}</text>
    <g font-family="sans-serif">
    ${Object.values(SITE_LAYOUT.docks)
      .map(({ apron }) => rect(apron, 'fill="#142731" stroke="#45606f"'))
      .join('')}
    ${rect(SITE_LAYOUT.factory.bounds, 'fill="#101f2d" stroke="#93a9b7" stroke-width="1.5"')}
    ${protectedEgressApproaches()
      .map((bounds) =>
        rect(bounds, 'fill="#90c6a0" fill-opacity="0.12" stroke="#90c6a0" stroke-dasharray="2 3"')
      )
      .join('')}
    ${flowSvg}${machines}${logistics}
    <path d="M${x(-40)} ${z(50) + 30} H${x(40)} M${x(-40)} ${z(50) + 26} V${z(50) + 34} M${x(40)} ${z(50) + 26} V${z(50) + 34}" stroke="#cbd5e1" fill="none"/>
    <text x="${x(0)}" y="${z(50) + 44}" text-anchor="middle" fill="#cbd5e1" font-size="10">80 m factory width</text>
    <path d="M${x(-40) - 15} ${z(-50)} V${z(50)}" stroke="#cbd5e1" fill="none"/>
    <text x="${x(-40) - 20}" y="${z(0)}" transform="rotate(-90 ${x(-40) - 20} ${z(0)})" text-anchor="middle" fill="#cbd5e1" font-size="10">100 m factory depth</text>
    <path d="M30 646 H90 M30 642 V650 M90 642 V650" stroke="#f1f5f9" fill="none"/>
    <text x="60" y="662" text-anchor="middle" fill="#cbd5e1" font-size="10">20 m</text>
    <text x="120" y="646" fill="#cbd5e1" font-size="9">Solid: rendered pipes. Dashed: modeled paths.</text>
    <text x="120" y="661" fill="#cbd5e1" font-size="9">Amber/cyan: forklift loops. Green: protected access.</text>
    <text x="30" y="681" fill="#cbd5e1" font-size="9">Queue snapshot at material clock ${n(snapshot.simulationTime)} s. Coordinates in metres.</text>
    <text x="30" y="695" fill="#cbd5e1" font-size="9">S: silo. M: mill. SF: sifter (+${xml(sifterHeights)} m). P: packer. %: buffer fill.</text>
    </g></svg>`;
}

/** Minimal ASCII DXF in metre units with semantic layers, no compliance claim. */
export function layoutPlanDxf(snapshot: LayoutSnapshot, proposal: LogisticsProposal): string {
  const lines = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$INSUNITS',
    '70',
    '6',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  const line = (layer: string, a: readonly number[], b: readonly number[]) => {
    lines.push(
      '0',
      'LINE',
      '8',
      layer,
      '10',
      n(a[0]),
      '20',
      n(-a[2]),
      '30',
      n(a[1]),
      '11',
      n(b[0]),
      '21',
      n(-b[2]),
      '31',
      n(b[1])
    );
  };
  const box = (
    layer: string,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    y = 0
  ) => {
    const points = [
      [bounds.minX, y, bounds.minZ],
      [bounds.maxX, y, bounds.minZ],
      [bounds.maxX, y, bounds.maxZ],
      [bounds.minX, y, bounds.maxZ],
    ];
    points.forEach((point, index) => line(layer, point, points[(index + 1) % points.length]));
  };
  box('FACTORY', SITE_LAYOUT.factory.bounds);
  for (const machine of snapshot.machines) {
    const [mx, y, mz] = machine.position;
    box(
      'EQUIPMENT',
      {
        minX: mx - machine.size[0] / 2,
        maxX: mx + machine.size[0] / 2,
        minZ: mz - machine.size[2] / 2,
        maxZ: mz + machine.size[2] / 2,
      },
      y
    );
  }
  for (const dock of PLANNING_DOCKS) {
    const route = roundedPlanningRoute(dock, proposal.routes[dock]);
    route.points.forEach((point, index) =>
      line(`ROUTE_${dock.toUpperCase()}`, point, route.points[(index + 1) % route.points.length])
    );
    box(`STAGING_${dock.toUpperCase()}`, stagingBounds(dock, proposal.staging[dock]));
  }
  for (const bounds of protectedEgressApproaches()) box('PROTECTED_ACCESS', bounds);
  const seen = new Set<string>();
  for (const route of resolveMaterialTransport(snapshot.machines, snapshot.segments)) {
    const key = `${route.fromMachineId}>${route.toMachineId}`;
    if (!route.route || seen.has(key)) continue;
    seen.add(key);
    const points = route.route.curve.getPoints(80);
    points
      .slice(1)
      .forEach((point, index) =>
        line(
          route.provenance === 'rendered' ? 'PROCESS_RENDERED' : 'PROCESS_MODELED',
          points[index].toArray(),
          point.toArray()
        )
      );
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n') + '\n';
}

export function layoutProposalJson(
  snapshot: LayoutSnapshot,
  current: LogisticsProposal,
  proposal: LogisticsProposal,
  assumptions: PlanningAssumptions
): string {
  return JSON.stringify(
    {
      schema: 'millos-logistics-proposal-v1',
      units: 'metres',
      capturedAt: snapshot.capturedAt,
      simulationTime: snapshot.simulationTime,
      assumptions,
      current,
      proposal,
      currentScore: scoreLogisticsLayout(current, assumptions, snapshot.obstacles),
      proposedScore: scoreLogisticsLayout(proposal, assumptions, snapshot.obstacles),
      queues: planningQueueSummary(snapshot.buffers),
      transport: snapshot.segments.map(
        ({ id, fromMachineId, toMachineId, transitTime, routeLengthMetres, routeProvenance }) => ({
          id,
          fromMachineId,
          toMachineId,
          transitTime,
          routeLengthMetres,
          routeProvenance,
        })
      ),
    },
    null,
    2
  );
}
