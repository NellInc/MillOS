import React, { useState, useEffect } from 'react';
import { audioManager } from '../../utils/audioManager';
import { FLOOR_LAYERS } from '../../constants/renderLayers';

// Re-export the centralized animation manager and utilities
export * from './shared';

// Re-export all component categories
export * from './wearDamage';
export * from './safety';
export * from './wildlife';
export * from './equipment';
export * from './atmosphere';
export * from './personalItems';
export * from './workplaceCulture';
export * from './utilities';
export * from './microDetails';
export * from './maintenance';

// Import components for use in main group
import { AmbientAnimationManager } from './shared';
import {
  Cobweb,
  RustStain,
  OilPuddle,
  RainPuddle,
  ScorchMark,
  RoofLeakPuddle,
  CeilingWaterStain,
  WindowCondensation,
} from './wearDamage';
import {
  SafetySign,
  FireExtinguisherStation,
  WarningLight,
  FirstAidKit,
  EmergencyShower,
  EyeWashStation,
  EarPlugDispenser,
  SafetyGogglesRack,
  ChalkOutline,
  AccidentBoard,
} from './safety';
import { Pigeon, Mouse, Flies, Spider, DustBunny, MothSwarm, Cockroach } from './wildlife';
import {
  StackedPallets,
  ToolRack,
  HardHatHook,
  CleaningEquipment,
  Toolbox,
  OilDrum,
  GasCylinder,
  TrashBin,
} from './equipment';
import {
  GodRays,
  SteamVent,
  FlickeringLight,
  SwingingChain,
  LoadingDockDoor,
  CondensationDrip,
} from './atmosphere';
import {
  JacketOnHook,
  UmbrellaCorner,
  LunchBag,
  WaterBottle,
  FoldedNewspaper,
  CoffeeCup,
} from './personalItems';
import {
  VendingMachine,
  TimeClockStation,
  WallCalendar,
  BirthdayDecorations,
  Graffiti,
  BulletinBoard,
  EmployeeOfMonth,
  OldRadio,
  FactoryWallClock,
} from './workplaceCulture';
import {
  CableTray,
  ElectricalPanel,
  DrainageGrate,
  PressureGauge,
  ValveWheel,
  PASpeaker,
  AlarmBell,
  ExtensionCord,
  ControlPanel,
  ControlPanelLED,
  VibrationIndicator,
  PulsingIndicator,
} from './utilities';
import { CigaretteButts, StuckGum, StickyNote, ScatteredPens } from './microDetails';
import { Sawhorse, MaintenanceCart, OutOfOrderSign, OpenedPanel } from './maintenance';

// Main ambient details group component
export const AmbientDetailsGroup: React.FC = () => {
  const [doorStates, setDoorStates] = useState<Record<string, boolean>>({
    'door-1': false,
    'door-2': false,
    'door-3': false,
  });

  // Toggle door states periodically
  useEffect(() => {
    const interval = setInterval(
      () => {
        const doorId = `door-${Math.floor(Math.random() * 3) + 1}`;
        setDoorStates((prev) => ({
          ...prev,
          [doorId]: !prev[doorId],
        }));

        // Play door sound
        if (audioManager.initialized) {
          if (doorStates[doorId]) {
            audioManager.playDoorClose();
          } else {
            audioManager.playDoorOpen();
          }
        }
      },
      15000 + Math.random() * 30000
    );

    return () => clearInterval(interval);
  }, [doorStates]);

  return (
    <group>
      {/* Centralized animation manager for all ambient details */}
      <AmbientAnimationManager />

      {/* Cobwebs in corners and rafters (updated for 120x160 floor) */}
      <Cobweb position={[-55, 28, -40]} rotation={[0.2, 0.5, 0]} scale={1.2} />
      <Cobweb position={[55, 28, -40]} rotation={[0.2, -0.5, 0]} scale={1} />
      <Cobweb position={[-55, 28, 40]} rotation={[0.2, -0.3, 0]} scale={0.8} />
      <Cobweb position={[55, 28, 40]} rotation={[0.2, 0.3, 0]} scale={1.1} />
      <Cobweb position={[-35, 26, -42]} rotation={[0.1, 0.2, 0.1]} scale={0.7} />
      <Cobweb position={[25, 27, -42]} rotation={[0.15, -0.1, 0]} scale={0.9} />

      {/* Rust stains on walls and equipment */}
      <RustStain position={[-58, 8, -25]} rotation={[0, Math.PI / 2, 0]} size={1.5} />
      <RustStain position={[58, 6, 15]} rotation={[0, -Math.PI / 2, 0]} size={1.2} />
      <RustStain position={[-45, 4, -42]} rotation={[0, 0, 0]} size={0.8} />
      <RustStain position={[35, 5, -42]} rotation={[0, 0, 0]} size={1} />
      <RustStain position={[-25, 3, 42]} rotation={[0, Math.PI, 0]} size={0.7} />

      {/* Oil puddles on floor - spread across larger area */}
      <OilPuddle position={[-20, FLOOR_LAYERS.puddle, -8]} size={1.2} />
      <OilPuddle position={[12, FLOOR_LAYERS.puddle, 18]} size={0.8} />
      <OilPuddle position={[-35, FLOOR_LAYERS.puddle, 12]} size={1} />
      <OilPuddle position={[30, FLOOR_LAYERS.puddle, -18]} size={0.6} />
      <OilPuddle position={[0, FLOOR_LAYERS.puddle, 28]} size={1.1} />
      <OilPuddle position={[-40, FLOOR_LAYERS.puddle, -20]} size={0.7} />
      <OilPuddle position={[40, FLOOR_LAYERS.puddle, 25]} size={0.9} />

      {/* Oil stains in truck yard areas - near where trucks park */}
      <OilPuddle position={[5, FLOOR_LAYERS.puddle, 45]} size={1.5} />
      <OilPuddle position={[-10, FLOOR_LAYERS.puddle, 40]} size={1.0} />
      <OilPuddle position={[15, FLOOR_LAYERS.puddle, 50]} size={0.8} />
      <OilPuddle position={[-5, FLOOR_LAYERS.puddle, 55]} size={1.2} />
      {/* Back yard oil stains */}
      <OilPuddle position={[8, FLOOR_LAYERS.puddle, -65]} size={1.3} />
      <OilPuddle position={[-12, FLOOR_LAYERS.puddle, -70]} size={0.9} />
      <OilPuddle position={[0, FLOOR_LAYERS.puddle, -60]} size={1.1} />

      {/* Rain puddles in outdoor yard areas (water pooling on pavement) */}
      <RainPuddle position={[-15, FLOOR_LAYERS.puddle, 48]} size={2.5} />
      <RainPuddle position={[20, FLOOR_LAYERS.puddle, 52]} size={2.0} />
      <RainPuddle position={[-8, FLOOR_LAYERS.puddle, 60]} size={1.8} />
      <RainPuddle position={[10, FLOOR_LAYERS.puddle, 65]} size={2.2} />
      {/* Back yard rain puddles */}
      <RainPuddle position={[-18, FLOOR_LAYERS.puddle, -68]} size={2.3} />
      <RainPuddle position={[15, FLOOR_LAYERS.puddle, -72]} size={1.9} />
      <RainPuddle position={[5, FLOOR_LAYERS.puddle, -80]} size={2.6} />

      {/* Safety signage - walls at x=±60 */}
      <SafetySign position={[-58, 8, 0]} rotation={[0, Math.PI / 2, 0]} type="exit" />
      <SafetySign position={[58, 8, 0]} rotation={[0, -Math.PI / 2, 0]} type="exit" />
      <SafetySign position={[0, 10, -42]} rotation={[0, 0, 0]} type="caution" />
      <SafetySign position={[-25, 8, -42]} rotation={[0, 0, 0]} type="danger" />
      <SafetySign position={[25, 8, -42]} rotation={[0, 0, 0]} type="ppe" />
      <SafetySign position={[0, 8, 42]} rotation={[0, Math.PI, 0]} type="exit" />

      {/* Wall clocks */}
      <FactoryWallClock position={[-58, 12, 0]} rotation={[0, Math.PI / 2, 0]} />
      <FactoryWallClock position={[58, 12, 0]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Fire extinguisher stations - expanded coverage */}
      <FireExtinguisherStation position={[-50, 0, -40]} />
      <FireExtinguisherStation position={[50, 0, -40]} />
      <FireExtinguisherStation position={[-50, 0, 40]} />
      <FireExtinguisherStation position={[50, 0, 40]} />
      <FireExtinguisherStation position={[0, 0, -35]} />
      <FireExtinguisherStation position={[0, 0, 35]} />

      {/* Loading dock doors - at z=48 (shipping dock) */}
      <LoadingDockDoor position={[-15, 0, 48]} isOpen={doorStates['door-1']} />
      <LoadingDockDoor position={[0, 0, 48]} isOpen={doorStates['door-2']} />
      <LoadingDockDoor position={[15, 0, 48]} isOpen={doorStates['door-3']} />

      {/* Control panels - walls at x=±60 */}
      <ControlPanel position={[-40, 5, -42]} rotation={[0, 0, 0]} />
      <ControlPanel position={[40, 5, -42]} rotation={[0, 0, 0]} />
      <ControlPanel position={[-58, 5, 20]} rotation={[0, Math.PI / 2, 0]} />
      <ControlPanel position={[58, 5, -20]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Condensation drips on pipes */}
      <CondensationDrip position={[-20, 18, -12]} />
      <CondensationDrip position={[15, 16, 8]} />
      <CondensationDrip position={[-8, 17, 18]} />
      <CondensationDrip position={[25, 15, -8]} />

      {/* Pulsing indicators on key machinery */}
      <PulsingIndicator position={[-25, 4, -22]} baseColor="#22c55e" />
      <PulsingIndicator position={[0, 4, -22]} baseColor="#3b82f6" />
      <PulsingIndicator position={[25, 4, -22]} baseColor="#22c55e" />
      <PulsingIndicator position={[-18, 12, 6]} baseColor="#eab308" size={0.08} />
      <PulsingIndicator position={[18, 12, 6]} baseColor="#eab308" size={0.08} />

      {/* ==========================================
          ENVIRONMENTAL PROPS (updated for 120x160 floor)
          ========================================== */}

      {/* Stacked pallets in corners and along walls */}
      <StackedPallets position={[-52, 0, -35]} count={4} />
      <StackedPallets position={[52, 0, -35]} count={3} />
      <StackedPallets position={[-52, 0, 35]} count={5} />
      <StackedPallets position={[52, 0, 35]} count={2} />
      <StackedPallets position={[-40, 0, 30]} count={3} />
      <StackedPallets position={[40, 0, -30]} count={4} />
      <StackedPallets position={[-52, 0, 0]} count={2} />
      <StackedPallets position={[52, 0, 0]} count={3} />

      {/* Tool racks on walls - x=±60 */}
      <ToolRack position={[-58, 4, -30]} rotation={[0, Math.PI / 2, 0]} />
      <ToolRack position={[58, 4, 30]} rotation={[0, -Math.PI / 2, 0]} />
      <ToolRack position={[20, 4, -42]} rotation={[0, 0, 0]} />

      {/* Hard hats on hooks - x=±60 */}
      <HardHatHook position={[-58, 5, 25]} color="#eab308" />
      <HardHatHook position={[-58, 5, 27]} color="#f97316" />
      <HardHatHook position={[-58, 5, 29]} color="#22c55e" />
      <HardHatHook position={[58, 5, -25]} color="#eab308" />
      <HardHatHook position={[58, 5, -27]} color="#3b82f6" />

      {/* Cleaning equipment - spread out */}
      <CleaningEquipment position={[-45, 0, 5]} />
      <CleaningEquipment position={[45, 0, 20]} />

      {/* Cable trays overhead - extended for larger ceiling */}
      <CableTray position={[-35, 22, 0]} length={25} />
      <CableTray position={[35, 22, 0]} length={25} />
      <CableTray position={[0, 20, -20]} length={40} rotation={[0, Math.PI / 2, 0]} />
      <CableTray position={[0, 20, 20]} length={40} rotation={[0, Math.PI / 2, 0]} />

      {/* Steam vents */}
      <SteamVent position={[-30, 15, -18]} />
      <SteamVent position={[30, 15, -18]} />
      <SteamVent position={[0, 18, 12]} />

      {/* Drainage grates in floor - expanded coverage */}
      <DrainageGrate position={[-25, 0, 0]} size={0.8} />
      <DrainageGrate position={[25, 0, 0]} size={0.8} />
      <DrainageGrate position={[0, 0, -20]} size={0.6} />
      <DrainageGrate position={[0, 0, 20]} size={0.6} />
      <DrainageGrate position={[-15, 0, 28]} size={0.5} />
      <DrainageGrate position={[15, 0, 28]} size={0.5} />
      <DrainageGrate position={[-40, 0, -15]} size={0.6} />
      <DrainageGrate position={[40, 0, 15]} size={0.6} />

      {/* ==========================================
          ANIMATED ELEMENTS (updated for 120x160 floor)
          ========================================== */}

      {/* Flickering fluorescent lights - spread across larger area */}
      <FlickeringLight position={[-35, 18, -25]} />
      <FlickeringLight position={[35, 18, 25]} />
      <FlickeringLight position={[0, 16, 0]} />
      <FlickeringLight position={[-45, 17, 10]} />
      <FlickeringLight position={[45, 17, -10]} />

      {/* Swinging chains from ceiling */}
      <SwingingChain position={[-40, 25, -15]} length={4} />
      <SwingingChain position={[40, 25, 15]} length={3} />
      <SwingingChain position={[-20, 24, 25]} length={2.5} />
      <SwingingChain position={[20, 24, -25]} length={3.5} />

      {/* Electrical panels with occasional sparks */}
      <ElectricalPanel position={[-58, 4, 8]} rotation={[0, Math.PI / 2, 0]} />
      <ElectricalPanel position={[58, 4, -8]} rotation={[0, -Math.PI / 2, 0]} />
      <ElectricalPanel position={[-30, 4, -42]} rotation={[0, 0, 0]} />

      {/* ==========================================
          AMBIENT LIFE (updated for 120x160 floor)
          ========================================== */}

      {/* Pigeons in rafters - spread across larger ceiling */}
      <Pigeon position={[-45, 27, -38]} />
      <Pigeon position={[-43, 27, -37]} />
      <Pigeon position={[48, 26, 35]} />
      <Pigeon position={[25, 28, -40]} />
      <Pigeon position={[-20, 27, 38]} />
      <Pigeon position={[0, 28, 0]} />

      {/* Pigeons roosting on yard light poles */}
      <Pigeon position={[-25, 14.5, 35]} />
      <Pigeon position={[-24, 14.5, 35]} />
      <Pigeon position={[25, 14.5, 35]} />
      <Pigeon position={[-25, 14.5, 55]} />
      <Pigeon position={[25, 14.5, 55]} />
      <Pigeon position={[26, 14.5, 55]} />
      {/* Pigeons on back yard light poles */}
      <Pigeon position={[-25, 14.5, -85]} />
      <Pigeon position={[25, 14.5, -85]} />
      <Pigeon position={[24, 14.5, -85]} />

      {/* Mice near walls (rare, scurrying) - walls at x=±60 */}
      <Mouse position={[-55, 0.02, -25]} pathLength={4} />
      <Mouse position={[55, 0.02, 20]} pathLength={3} />
      <Mouse position={[-35, 0.02, 40]} pathLength={5} />

      {/* ==========================================
          ATMOSPHERE EFFECTS
          ========================================== */}

      {/* God rays through skylights - spread across larger area */}
      <GodRays position={[-25, 30, -18]} rotation={[0.1, 0, 0.05]} />
      <GodRays position={[20, 30, 15]} rotation={[-0.05, 0, -0.1]} />
      <GodRays position={[0, 30, 0]} rotation={[0, 0, 0]} />
      <GodRays position={[0, 30, -25]} rotation={[0.08, 0, 0]} />

      {/* Graffiti in hidden corners */}
      <Graffiti position={[-51, 2, -32]} rotation={[0, Math.PI / 2, 0]} type="tag" />
      <Graffiti position={[51, 1.5, 28]} rotation={[0, -Math.PI / 2, 0]} type="drawing" />
      <Graffiti position={[-42, 2.5, -37.5]} rotation={[0, 0, 0]} type="message" />
      <Graffiti position={[35, 3, -37.5]} rotation={[0, 0, 0]} type="tag" />

      {/* Bulletin boards */}
      <BulletinBoard position={[-52, 5.5, -10]} rotation={[0, Math.PI / 2, 0]} />
      <BulletinBoard position={[52, 5.5, 10]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Scorch marks near machinery */}
      <ScorchMark
        position={[-18, FLOOR_LAYERS.wornPrimary, -8]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={0.8}
      />
      <ScorchMark
        position={[22, FLOOR_LAYERS.wornPrimary, -4]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={0.6}
      />
      <ScorchMark position={[-52, 3, 8]} rotation={[0, Math.PI / 2, 0]} size={0.5} />
      <ScorchMark
        position={[10, FLOOR_LAYERS.wornPrimary, 18]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={0.7}
      />

      {/* ==========================================
          MORE PROPS
          ========================================== */}

      {/* Oil drums / barrels */}
      <OilDrum position={[-42, 0, -28]} color="#3b82f6" />
      <OilDrum position={[-40, 0, -28]} color="#22c55e" />
      <OilDrum position={[-41, 0, -26]} color="#ef4444" />
      <OilDrum position={[42, 0, 28]} color="#3b82f6" />
      <OilDrum position={[44, 0, 27]} color="#1e293b" />
      <OilDrum position={[-25, 0, 32]} color="#78350f" tipped />

      {/* Gas cylinders (chained to walls) */}
      <GasCylinder position={[-51.5, 0, -15]} color="#22c55e" />
      <GasCylinder position={[-51.5, 0, -13]} color="#ef4444" />
      <GasCylinder position={[51.5, 0, 20]} color="#3b82f6" />
      <GasCylinder position={[51.5, 0, 22]} color="#eab308" />

      {/* Toolboxes on floor */}
      <Toolbox position={[-28, 0, -10]} isOpen />
      <Toolbox position={[32, 0, 8]} isOpen={false} />
      <Toolbox position={[-15, 0, 22]} isOpen />

      {/* Trash bins */}
      <TrashBin position={[-45, 0, 5]} />
      <TrashBin position={[45, 0, -8]} />
      <TrashBin position={[0, 0, 32]} />

      {/* Coffee cups and thermoses on surfaces */}
      <CoffeeCup position={[-35, 5.3, -37.8]} type="cup" />
      <CoffeeCup position={[-34.5, 5.3, -37.8]} type="thermos" />
      <CoffeeCup position={[35, 5.3, -37.8]} type="mug" />
      <CoffeeCup position={[-51.8, 4.3, -24.5]} type="cup" />
      <CoffeeCup position={[51.8, 4.3, 25.5]} type="thermos" />

      {/* First aid kits on walls */}
      <FirstAidKit position={[-52, 6, 30]} rotation={[0, Math.PI / 2, 0]} />
      <FirstAidKit position={[52, 6, -25]} rotation={[0, -Math.PI / 2, 0]} />
      {/* First aid kit outside bathroom door (ToiletBlock at [35,0,35], door on south wall at z=37.5) */}
      <FirstAidKit position={[38, 1.5, 39]} rotation={[0, Math.PI, 0]} />

      {/* Extension cords */}
      <ExtensionCord start={[-30, 0.01, -12]} end={[-22, 0.01, -8]} color="#f97316" />
      <ExtensionCord start={[25, 0.01, 15]} end={[32, 0.01, 18]} color="#eab308" />
      <ExtensionCord start={[-10, 0.01, 25]} end={[5, 0.01, 28]} color="#f97316" />

      {/* ==========================================
          ENVIRONMENTAL STORYTELLING
          ========================================== */}

      {/* Chalk body outline (safety training area) */}
      <ChalkOutline position={[-35, 0.02, 15]} />

      {/* "Days since last accident" boards */}
      <AccidentBoard position={[-52, 8, -5]} rotation={[0, Math.PI / 2, 0]} days={47} />
      <AccidentBoard position={[52, 8, 5]} rotation={[0, -Math.PI / 2, 0]} days={47} />

      {/* Employee of the month frames */}
      <EmployeeOfMonth position={[-52, 6, 0]} rotation={[0, Math.PI / 2, 0]} />
      <EmployeeOfMonth position={[52, 6, 0]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Old radios */}
      <OldRadio position={[-51.5, 4.5, -25]} />
      <OldRadio position={[35.5, 5.3, -37.5]} />

      {/* ==========================================
          INDUSTRIAL SAFETY EQUIPMENT
          ========================================== */}

      {/* Emergency shower stations */}
      <EmergencyShower position={[-48, 0, -35]} />
      <EmergencyShower position={[48, 0, 35]} />

      {/* Eye wash stations */}
      <EyeWashStation position={[-52, 4.5, -30]} rotation={[0, Math.PI / 2, 0]} />
      <EyeWashStation position={[52, 4.5, 30]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Ear plug dispensers */}
      <EarPlugDispenser position={[-52, 5, 5]} rotation={[0, Math.PI / 2, 0]} />
      <EarPlugDispenser position={[52, 5, -5]} rotation={[0, -Math.PI / 2, 0]} />
      <EarPlugDispenser position={[0, 5, -38]} rotation={[0, 0, 0]} />

      {/* Safety goggles racks */}
      <SafetyGogglesRack position={[-52, 4.5, 8]} rotation={[0, Math.PI / 2, 0]} />
      <SafetyGogglesRack position={[52, 4.5, -8]} rotation={[0, -Math.PI / 2, 0]} />

      {/* ==========================================
          MORE LIFE DETAILS
          ========================================== */}

      {/* Flies around trash bins */}
      <Flies position={[-45, 0.8, 5]} count={4} />
      <Flies position={[45, 0.8, -8]} count={3} />
      <Flies position={[0, 0.8, 32]} count={5} />

      {/* Spiders in cobwebs */}
      <Spider position={[-49.5, 27.5, -34.5]} />
      <Spider position={[49.5, 27.5, 34.5]} />
      <Spider position={[-29, 25.5, -37.5]} />

      {/* Dust bunnies in corners */}
      <DustBunny position={[-49, 0.02, -36]} />
      <DustBunny position={[49, 0.02, 36]} />
      <DustBunny position={[-49, 0.02, 36]} />
      <DustBunny position={[49, 0.02, -36]} />
      <DustBunny position={[-35, 0.02, -37]} />
      <DustBunny position={[35, 0.02, 37]} />
      <DustBunny position={[-48, 0.02, 0]} />
      <DustBunny position={[48, 0.02, 0]} />

      {/* ==========================================
          TIME/CULTURE ELEMENTS
          ========================================== */}

      {/* Vending machines */}
      <VendingMachine position={[-48, 0.9, 35]} rotation={[0, Math.PI / 4, 0]} />

      {/* Time clock stations */}
      <TimeClockStation position={[-52, 5, 35]} rotation={[0, Math.PI / 2, 0]} />
      <TimeClockStation position={[52, 5, -35]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Wall calendars */}
      <WallCalendar position={[-52, 5.5, 28]} rotation={[0, Math.PI / 2, 0]} />
      <WallCalendar position={[52, 5.5, -28]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Forgotten birthday decorations */}
      <BirthdayDecorations position={[-48, 6, 15]} />

      {/* ==========================================
          MORE INDUSTRIAL DETAILS
          ========================================== */}

      {/* PA system speakers */}
      <PASpeaker position={[-40, 25, -38]} rotation={[0.3, 0, 0]} />
      <PASpeaker position={[40, 25, -38]} rotation={[0.3, 0, 0]} />
      <PASpeaker position={[-40, 25, 38]} rotation={[-0.3, Math.PI, 0]} />
      <PASpeaker position={[40, 25, 38]} rotation={[-0.3, Math.PI, 0]} />

      {/* Alarm bells */}
      <AlarmBell position={[-52, 10, -20]} />
      <AlarmBell position={[52, 10, 20]} />
      <AlarmBell position={[0, 12, -38]} />

      {/* Pressure gauges on pipes */}
      <PressureGauge position={[-18, 16, -12]} rotation={[0, Math.PI / 4, 0]} />
      <PressureGauge position={[18, 16, -12]} rotation={[0, -Math.PI / 4, 0]} />
      <PressureGauge position={[0, 18, 8]} rotation={[0, 0, 0]} />
      <PressureGauge position={[-25, 14, 5]} rotation={[0, Math.PI / 2, 0]} />
      <PressureGauge position={[25, 14, 5]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Valve wheels on pipes */}
      <ValveWheel position={[-22, 15, -10]} rotation={[0, 0, 0]} size={0.12} />
      <ValveWheel position={[22, 15, -10]} rotation={[0, 0, 0]} size={0.15} />
      <ValveWheel position={[0, 17, 5]} rotation={[Math.PI / 2, 0, 0]} size={0.18} />
      <ValveWheel position={[-30, 13, 8]} rotation={[0, Math.PI / 2, 0]} size={0.1} />
      <ValveWheel position={[30, 13, 8]} rotation={[0, -Math.PI / 2, 0]} size={0.1} />
      <ValveWheel position={[-15, 16, 12]} rotation={[0, 0.3, 0]} size={0.14} />
      <ValveWheel position={[15, 16, 12]} rotation={[0, -0.3, 0]} size={0.14} />

      {/* ==========================================
          MICRO-DETAILS - OBSESSIVE PERFECTION
          ========================================== */}

      {/* Cigarette butts near back door / loading area */}
      <CigaretteButts position={[28, 0.01, 38]} count={7} />
      <CigaretteButts position={[-28, 0.01, 38]} count={5} />
      <CigaretteButts position={[-49, 0.01, -5]} count={4} />

      {/* Gum stuck under surfaces (work tables, control panels) */}
      <StuckGum position={[-35, 4.95, -37.5]} color="#f472b6" />
      <StuckGum position={[-34.8, 4.95, -37.6]} color="#86efac" />
      <StuckGum position={[35, 4.95, -37.4]} color="#93c5fd" />
      <StuckGum position={[-51.95, 4.2, -24.8]} color="#fca5a5" />

      {/* Sticky notes on equipment */}
      <StickyNote position={[-35.2, 5.4, -37.7]} rotation={[0, 0, 0.05]} color="#fef08a" curled />
      <StickyNote position={[35.3, 5.35, -37.75]} rotation={[0, 0, -0.08]} color="#fbcfe8" />
      <StickyNote
        position={[-52, 5.2, 15.1]}
        rotation={[0, Math.PI / 2, 0.03]}
        color="#bfdbfe"
        curled
      />
      <StickyNote
        position={[52, 5.25, -15.05]}
        rotation={[0, -Math.PI / 2, -0.05]}
        color="#fef08a"
      />
      <StickyNote position={[-25.1, 4.15, -37.9]} rotation={[0, 0, 0.1]} color="#d9f99d" curled />

      {/* Scattered pens and pencils on work surfaces */}
      <ScatteredPens position={[-35, 5.32, -37.5]} count={4} />
      <ScatteredPens position={[35, 5.32, -37.6]} count={3} />
      <ScatteredPens position={[-51.5, 4.55, -24.5]} count={2} />

      {/* ==========================================
          PERSONAL ITEMS
          ========================================== */}

      {/* Jackets on hooks near entrances */}
      <JacketOnHook position={[-52, 5.5, 32]} color="#1e3a8a" />
      <JacketOnHook position={[-52, 5.5, 33.5]} color="#166534" />
      <JacketOnHook position={[52, 5.5, -32]} color="#7c2d12" />

      {/* Umbrellas in corners */}
      <UmbrellaCorner position={[-49, 0, 36]} color="#1e293b" />
      <UmbrellaCorner position={[49, 0, -36]} color="#1e40af" />
      <UmbrellaCorner position={[-49, 0, -36]} color="#dc2626" />

      {/* Lunch bags near break area */}
      <LunchBag position={[-47, 0, 34.5]} type="paper" />
      <LunchBag position={[-46.5, 0, 34]} type="cooler" />
      <LunchBag position={[-47.3, 4.52, 35]} type="box" />

      {/* Water bottles scattered around */}
      <WaterBottle position={[-35.3, 5.32, -37.3]} type="plastic" />
      <WaterBottle position={[34.8, 5.32, -37.7]} type="metal" />
      <WaterBottle position={[-51.5, 4.55, -24.2]} type="sports" />
      <WaterBottle position={[-28, 0.7, -10]} type="plastic" />
      <WaterBottle position={[32.2, 0.55, 8.2]} type="metal" />

      {/* Folded newspapers */}
      <FoldedNewspaper position={[-35.2, 5.35, -37.2]} rotation={[0, 0.3, 0]} />
      <FoldedNewspaper position={[-47, 4.52, 34.8]} rotation={[0, -0.5, 0]} />

      {/* ==========================================
          WORK IN PROGRESS
          ========================================== */}

      {/* Sawhorses blocking off maintenance areas */}
      <Sawhorse position={[-20, 0, 12]} rotation={[0, 0.3, 0]} hasTape />
      <Sawhorse position={[-17, 0, 12.5]} rotation={[0, -0.2, 0]} hasTape />
      <Sawhorse position={[25, 0, -18]} rotation={[0, Math.PI / 2, 0]} hasTape={false} />

      {/* Maintenance carts */}
      <MaintenanceCart position={[-22, 0, 10]} rotation={[0, 0.5, 0]} />
      <MaintenanceCart position={[30, 0, 5]} rotation={[0, -0.3, 0]} />

      {/* Out of Order signs on equipment */}
      <OutOfOrderSign position={[-18, 4.5, -6.2]} rotation={[0, 0, 0]} />
      <OutOfOrderSign position={[7.5, 12, 5.8]} rotation={[0, 0, 0]} />

      {/* Opened panels showing maintenance in progress */}
      <OpenedPanel position={[-52, 4, 12]} rotation={[0, Math.PI / 2, 0]} />
      <OpenedPanel position={[52, 4, -12]} rotation={[0, -Math.PI / 2, 0]} />

      {/* ==========================================
          WEATHER EFFECTS
          ========================================== */}

      {/* Puddles from roof leaks */}
      <RoofLeakPuddle position={[-12, 0, 8]} size={1} />
      <RoofLeakPuddle position={[18, 0, -12]} size={0.7} />
      <RoofLeakPuddle position={[-35, 0, 22]} size={0.9} />

      {/* Condensation on windows (high humidity areas) */}
      <WindowCondensation position={[-52, 8, -25]} rotation={[0, Math.PI / 2, 0]} />
      <WindowCondensation position={[52, 8, 25]} rotation={[0, -Math.PI / 2, 0]} />
      <WindowCondensation position={[-20, 12, -38]} rotation={[0, 0, 0]} />

      {/* Water stains on ceiling from past leaks */}
      <CeilingWaterStain position={[-12, 28, 8]} size={2} />
      <CeilingWaterStain position={[18, 27, -12]} size={1.5} />
      <CeilingWaterStain position={[-35, 26, 22]} size={1.8} />
      <CeilingWaterStain position={[5, 29, 0]} size={1.2} />

      {/* ==========================================
          MORE WILDLIFE
          ========================================== */}

      {/* Moths circling the overhead lights */}
      <MothSwarm position={[-30, 17.5, -20]} count={5} />
      <MothSwarm position={[30, 17.5, 20]} count={4} />
      <MothSwarm position={[0, 15.5, 0]} count={6} />
      <MothSwarm position={[-15, 24, 20]} count={3} />

      {/* Cockroaches (rare, near dark corners and moisture) */}
      <Cockroach position={[-49, 0.01, -35]} pathLength={3} />
      <Cockroach position={[49, 0.01, 35]} pathLength={2} />
      <Cockroach position={[-12, 0.01, 9]} pathLength={2.5} />
    </group>
  );
};

export default AmbientDetailsGroup;
