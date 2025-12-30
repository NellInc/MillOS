/**
 * AssetShowcase - Visual browser for downloaded 3D assets
 *
 * Displays models from the Kenney and Quaternius packs in a carousel-style viewer.
 * Press 'B' in the main app to toggle this showcase.
 */
import React, { useState, Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Center, Html } from '@react-three/drei';
import { ChevronLeft, ChevronRight, X, Package, Car, Users, Factory } from 'lucide-react';
import * as THREE from 'three';

// Asset categories with their paths
const ASSET_CATEGORIES = {
  machines: {
    label: 'Machines & Conveyors',
    icon: Factory,
    assets: [
      { name: 'Silo', path: '/models/machines/silo.glb' },
      { name: 'Conveyor', path: '/models/machines/conveyor.glb' },
      { name: 'Conveyor Long', path: '/models/machines/conveyor-long.glb' },
      { name: 'Conveyor Bars', path: '/models/machines/conveyor-bars.glb' },
      { name: 'Conveyor Bars High', path: '/models/machines/conveyor-bars-high.glb' },
      { name: 'Robot Arm A', path: '/models/machines/robot-arm-a.glb' },
      { name: 'Robot Arm B', path: '/models/machines/robot-arm-b.glb' },
      { name: 'Cover Hopper', path: '/models/machines/cover-hopper.glb' },
      { name: 'Detail Tank', path: '/models/machines/detail-tank.glb' },
      { name: 'Scanner High', path: '/models/machines/scanner-high.glb' },
      { name: 'Chimney Large', path: '/models/machines/chimney-large.glb' },
      { name: 'Building A', path: '/models/machines/building-a.glb' },
      { name: 'Building B', path: '/models/machines/building-b.glb' },
      { name: 'Building C', path: '/models/machines/building-c.glb' },
      { name: 'Structure Wall', path: '/models/machines/structure-wall.glb' },
      { name: 'Structure Window', path: '/models/machines/structure-window.glb' },
      { name: 'Door', path: '/models/machines/door.glb' },
      { name: 'Box Large', path: '/models/machines/box-large.glb' },
    ],
  },
  vehicles: {
    label: 'Vehicles',
    icon: Car,
    assets: [
      { name: 'Delivery Truck', path: '/models/vehicles/delivery.glb' },
      { name: 'Delivery Flat', path: '/models/vehicles/delivery-flat.glb' },
      { name: 'Truck', path: '/models/vehicles/truck.glb' },
      { name: 'Truck Flat', path: '/models/vehicles/truck-flat.glb' },
      { name: 'Van', path: '/models/vehicles/van.glb' },
      { name: 'Garbage Truck', path: '/models/vehicles/garbage-truck.glb' },
      { name: 'Tractor', path: '/models/vehicles/tractor.glb' },
      { name: 'Tractor Shovel', path: '/models/vehicles/tractor-shovel.glb' },
      { name: 'Firetruck', path: '/models/vehicles/firetruck.glb' },
      { name: 'Ambulance', path: '/models/vehicles/ambulance.glb' },
      { name: 'Police', path: '/models/vehicles/police.glb' },
      { name: 'Sedan', path: '/models/vehicles/sedan.glb' },
      { name: 'SUV', path: '/models/vehicles/suv.glb' },
      { name: 'Taxi', path: '/models/vehicles/taxi.glb' },
    ],
  },
  characters: {
    label: 'Characters',
    icon: Users,
    assets: [
      { name: 'Worker Male', path: '/models/characters/Worker_Male.gltf' },
      { name: 'Worker Female', path: '/models/characters/Worker_Female.gltf' },
      { name: 'Casual Male', path: '/models/characters/Casual_Male.gltf' },
      { name: 'Casual Female', path: '/models/characters/Casual_Female.gltf' },
      { name: 'Casual Bald', path: '/models/characters/Casual_Bald.gltf' },
      { name: 'Suit Male', path: '/models/characters/Suit_Male.gltf' },
      { name: 'Suit Female', path: '/models/characters/Suit_Female.gltf' },
      { name: 'Chef Male', path: '/models/characters/Chef_Male.gltf' },
      { name: 'Chef Female', path: '/models/characters/Chef_Female.gltf' },
      { name: 'Doctor Male Young', path: '/models/characters/Doctor_Male_Young.gltf' },
      { name: 'Doctor Female Young', path: '/models/characters/Doctor_Female_Young.gltf' },
      { name: 'Soldier Male', path: '/models/characters/Soldier_Male.gltf' },
      { name: 'Soldier Female', path: '/models/characters/Soldier_Female.gltf' },
      { name: 'Cowboy Male', path: '/models/characters/Cowboy_Male.gltf' },
      { name: 'Viking Male', path: '/models/characters/Viking_Male.gltf' },
      { name: 'Ninja Male', path: '/models/characters/Ninja_Male.gltf' },
    ],
  },
};

// Rotating model display
const ModelDisplay: React.FC<{ path: string }> = ({ path }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(path);

  // Clone the scene to avoid shared state issues
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  // Slow rotation
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <Center>
      <group ref={groupRef}>
        <primitive object={clonedScene} />
      </group>
    </Center>
  );
};

// Loading fallback
const LoadingFallback: React.FC = () => (
  <Html center>
    <div className="text-white bg-slate-800/80 px-4 py-2 rounded-lg">Loading...</div>
  </Html>
);

// Model wrapper with loading fallback
// Note: useGLTF throws on load failure, caught by React's error boundary
const ModelWithFallback: React.FC<{ path: string; name: string }> = ({ path }) => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ModelDisplay path={path} />
    </Suspense>
  );
};

interface AssetShowcaseProps {
  onClose: () => void;
}

export const AssetShowcase: React.FC<AssetShowcaseProps> = ({ onClose }) => {
  const [category, setCategory] = useState<keyof typeof ASSET_CATEGORIES>('machines');
  const [assetIndex, setAssetIndex] = useState(0);

  const currentAssets = ASSET_CATEGORIES[category].assets;
  const currentAsset = currentAssets[assetIndex];

  const nextAsset = () => {
    setAssetIndex((prev) => (prev + 1) % currentAssets.length);
  };

  const prevAsset = () => {
    setAssetIndex((prev) => (prev - 1 + currentAssets.length) % currentAssets.length);
  };

  const handleCategoryChange = (newCategory: keyof typeof ASSET_CATEGORIES) => {
    setCategory(newCategory);
    setAssetIndex(0);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-bold text-white">Asset Showcase</h1>
          <span className="text-slate-400 text-sm">
            ({assetIndex + 1}/{currentAssets.length})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 p-4 border-b border-slate-700">
        {Object.entries(ASSET_CATEGORIES).map(([key, cat]) => {
          const Icon = cat.icon;
          const isActive = category === key;
          return (
            <button
              key={key}
              onClick={() => handleCategoryChange(key as keyof typeof ASSET_CATEGORIES)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* 3D Viewer */}
        <div className="flex-1 relative">
          <Canvas camera={{ position: [3, 2, 3], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <directionalLight position={[-5, 3, -5]} intensity={0.5} />

            <Suspense fallback={null}>
              <Environment preset="warehouse" />
            </Suspense>

            <ModelWithFallback
              key={currentAsset.path}
              path={currentAsset.path}
              name={currentAsset.name}
            />

            <OrbitControls enablePan={false} minDistance={1} maxDistance={10} autoRotate={false} />

            <gridHelper args={[10, 10, '#444', '#333']} />
          </Canvas>

          {/* Navigation Arrows */}
          <button
            onClick={prevAsset}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={nextAsset}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Asset Name Overlay */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/90 px-6 py-3 rounded-lg">
            <h2 className="text-lg font-semibold text-white">{currentAsset.name}</h2>
            <p className="text-sm text-slate-400 font-mono">{currentAsset.path}</p>
          </div>
        </div>

        {/* Asset List Sidebar */}
        <div className="w-64 bg-slate-800 border-l border-slate-700 overflow-y-auto">
          <div className="p-3 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-slate-400 uppercase">
              {ASSET_CATEGORIES[category].label}
            </h3>
          </div>
          <div className="p-2">
            {currentAssets.map((asset, index) => (
              <button
                key={asset.path}
                onClick={() => setAssetIndex(index)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  index === assetIndex
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {asset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700 text-center text-sm text-slate-400">
        Use mouse to orbit • Arrow keys or buttons to navigate • Press{' '}
        <kbd className="px-2 py-1 bg-slate-700 rounded">B</kbd> or click X to close
      </div>
    </div>
  );
};

export default AssetShowcase;
