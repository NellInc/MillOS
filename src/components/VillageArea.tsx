import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import Fireflies from './effects/Fireflies';
import { Cat } from './scenery/Cat';
import { HeartParticle } from './effects/HeartParticle';
import { playCritterSound } from '../utils/critterAudio';
import { audioManager } from '../utils/audioManager';

// ============================================================
// CHARMING EUROPEAN VILLAGE - West of Canal
// Lego-style adorable village with colorful buildings
// Position: [-190, 0, 0] (west of canal at -145)
// Size: ~60×120 units
// ============================================================

// Color Palette
const COLORS = {
    // Buildings
    cream: '#f5f0e1',
    yellow: '#fef3c7',
    pink: '#fce7e7',
    blue: '#dbeafe',
    terracotta: '#ea8a5e',
    green: '#365314',
    // Roofs
    roofTile: '#c2410c',
    roofSlate: '#475569',
    thatch: '#d4a574',
    // Infrastructure
    cobble: '#6b7280',
    stone: '#a89f91',
    timber: '#3d2d1d',
    grass: '#4a7c59',
    water: '#3b82f6',
};

// Font URL - uses Vite's BASE_URL for correct path at any deployment location
const FONT_URL = `${import.meta.env.BASE_URL}fonts/MedievalSharp.ttf`;

// Shared materials
const SM = {
    grass: new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 0.95 }),
    cobble: new THREE.MeshStandardMaterial({ color: COLORS.cobble, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: COLORS.stone, roughness: 0.85 }),
    timber: new THREE.MeshStandardMaterial({ color: COLORS.timber, roughness: 0.8 }),
    roofTile: new THREE.MeshStandardMaterial({ color: COLORS.roofTile, roughness: 0.7 }),
    roofSlate: new THREE.MeshStandardMaterial({ color: COLORS.roofSlate, roughness: 0.6 }),
    thatch: new THREE.MeshStandardMaterial({ color: COLORS.thatch, roughness: 0.95 }),
    cream: new THREE.MeshStandardMaterial({ color: COLORS.cream, roughness: 0.8 }),
    yellow: new THREE.MeshStandardMaterial({ color: COLORS.yellow, roughness: 0.8 }),
    pink: new THREE.MeshStandardMaterial({ color: COLORS.pink, roughness: 0.8 }),
    blue: new THREE.MeshStandardMaterial({ color: COLORS.blue, roughness: 0.8 }),
    terracotta: new THREE.MeshStandardMaterial({ color: COLORS.terracotta, roughness: 0.8 }),
    shutterGreen: new THREE.MeshStandardMaterial({ color: COLORS.green, roughness: 0.7 }),
    water: new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.2, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5 }),
    red: new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.4, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: '#93c5fd', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 }),
    smoke: new THREE.MeshBasicMaterial({ color: '#9ca3af', transparent: true, opacity: 0.4 }),
};

// ===== CHIMNEY SMOKE =====
const ChimneySmoke: React.FC<{ position: [number, number, number]; offset?: number }> = ({ position, offset = 0 }) => {
    const smokeRefs = useRef<(THREE.Mesh | null)[]>([]);
    const frameCount = useRef(0);

    useFrame((state) => {
        // Throttle smoke animation to every 3rd frame (~20 FPS)
        frameCount.current++;
        if (frameCount.current % 3 !== 0) return;

        const time = state.clock.elapsedTime + offset;
        smokeRefs.current.forEach((mesh, i) => {
            if (mesh) {
                const phase = (time * 0.5 + i * 0.3) % 2;
                mesh.position.y = phase * 2;
                mesh.scale.setScalar(0.3 + phase * 0.4);
                (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - phase * 0.25);
            }
        });
    });

    return (
        <group position={position}>
            {[0, 1, 2].map((i) => (
                <mesh key={i} ref={(el) => { smokeRefs.current[i] = el; }}>
                    <sphereGeometry args={[0.3, 8, 6]} />
                    <primitive object={SM.smoke.clone()} attach="material" />
                </mesh>
            ))}
        </group>
    );
};

// ===== COTTAGE =====
const Cottage = React.memo<{
    position: [number, number, number];
    rotation?: number;
    wallColor?: keyof typeof SM;
    roofType?: 'tile' | 'thatch' | 'slate';
    hasGarden?: boolean;
    isNight?: boolean;
}>(({ position, rotation = 0, wallColor = 'cream', roofType = 'tile', hasGarden = true, isNight = false }) => {
    const wallMat = SM[wallColor] || SM.cream;
    const roofMat = roofType === 'thatch' ? SM.thatch : roofType === 'slate' ? SM.roofSlate : SM.roofTile;

    return (
        <group position={position} rotation={[0, rotation, 0]}>
            {/* Main building */}
            <mesh position={[0, 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[5, 4, 4]} />
                <primitive object={wallMat} attach="material" />
            </mesh>
            {/* Cute cone roof - Lego style */}
            <mesh position={[0, 5.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[4, 3, 4]} />
                <primitive object={roofMat} attach="material" />
            </mesh>
            {/* Chimney */}
            <mesh position={[1.5, 6, 0]} castShadow>
                <boxGeometry args={[0.6, 1.5, 0.6]} />
                <primitive object={SM.stone} attach="material" />
            </mesh>
            {/* Chimney smoke */}
            <ChimneySmoke position={[1.5, 7, 0]} offset={Math.random() * 10} />
            {/* Door */}
            <mesh position={[0, 1.2, 2.01]}>
                <boxGeometry args={[1, 2.2, 0.1]} />
                <primitive object={SM.timber} attach="material" />
            </mesh>
            {/* Windows */}
            {[[-1.5, 2.5], [1.5, 2.5]].map(([x, y], i) => (
                <group key={i} position={[x, y, 2.01]}>
                    <mesh>
                        <boxGeometry args={[0.8, 1, 0.05]} />
                        {isNight ? (
                            <meshBasicMaterial color="#fbbf24" />
                        ) : (
                            <primitive object={SM.glass} attach="material" />
                        )}
                    </mesh>
                    <mesh position={[0, 0, 0.03]}><boxGeometry args={[0.1, 1.1, 0.02]} /><primitive object={SM.white} attach="material" /></mesh>
                    <mesh position={[0, 0, 0.03]}><boxGeometry args={[0.9, 0.1, 0.02]} /><primitive object={SM.white} attach="material" /></mesh>
                </group>
            ))}
            {/* Shutters */}
            {[[-2, 2.5], [2, 2.5]].map(([x, y], i) => (
                <mesh key={`shutter-${i}`} position={[x, y, 2.01]}>
                    <boxGeometry args={[0.25, 1, 0.05]} />
                    <primitive object={SM.shutterGreen} attach="material" />
                </mesh>
            ))}
            {/* Flower boxes - under windows (split to avoid door) */}
            {[-1.5, 1.5].map((x, i) => (
                <group key={`flowerbox-${i}`} position={[x, 1.8, 2.1]}>
                    <mesh castShadow>
                        <boxGeometry args={[1, 0.2, 0.3]} />
                        <primitive object={SM.timber} attach="material" />
                    </mesh>
                    {/* Flowers */}
                    {[-0.3, 0, 0.3].map((off, j) => (
                        <mesh key={`flower-${j}`} position={[off, 0.25, 0]} castShadow>
                            <sphereGeometry args={[0.12, 8, 8]} />
                            <meshStandardMaterial color={['#f472b6', '#fbbf24', '#f87171'][(i + j) % 3]} roughness={0.8} />
                        </mesh>
                    ))}
                </group>
            ))}
            {/* Garden fence */}
            {hasGarden && (
                <group position={[0, 0, 4]}>
                    {[-2, 0, 2].map((x, i) => (
                        <mesh key={i} position={[x, 0.4, 0]} castShadow>
                            <boxGeometry args={[2, 0.8, 0.1]} />
                            <primitive object={SM.white} attach="material" />
                        </mesh>
                    ))}
                </group>
            )}
        </group>
    );
});
Cottage.displayName = 'Cottage';

// ===== SHOP BUILDING =====
const ShopBuilding = React.memo<{
    position: [number, number, number];
    rotation?: number;
    wallColor?: keyof typeof SM;
    signText?: string;
    awningColor?: string;
    isNight?: boolean;
}>(({ position, rotation = 0, wallColor = 'yellow', signText = 'SHOP', awningColor = '#dc2626', isNight = false }) => {
    const wallMat = SM[wallColor] || SM.yellow;

    return (
        <group position={position} rotation={[0, rotation, 0]}>
            {/* Main building */}
            <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[6, 5, 5]} />
                <primitive object={wallMat} attach="material" />
            </mesh>
            {/* Pyramid roof */}
            <mesh position={[0, 6.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[5, 3, 4]} />
                <primitive object={SM.roofTile} attach="material" />
            </mesh>
            {/* Shop window - resized and moved to avoid door */}
            <mesh position={[1.2, 1.5, 2.6]}>
                <boxGeometry args={[2.8, 2.5, 0.1]} />
                {isNight ? (
                    <meshBasicMaterial color="#fbbf24" />
                ) : (
                    <primitive object={SM.glass} attach="material" />
                )}
            </mesh>
            {/* Door */}
            <mesh position={[-2, 1.2, 2.6]}>
                <boxGeometry args={[1, 2.2, 0.1]} />
                <primitive object={SM.timber} attach="material" />
            </mesh>
            {/* Awning */}
            <mesh position={[0, 3.2, 3.5]} rotation={[0.4, 0, 0]} castShadow>
                <boxGeometry args={[5.5, 0.1, 2]} />
                <meshStandardMaterial color={awningColor} roughness={0.7} />
            </mesh>
            {/* Sign */}
            <Text
                position={[0, 4.5, 2.6]}
                fontSize={0.5}
                color="#1e293b"
                anchorX="center"
                anchorY="middle"
                font={FONT_URL}
            >
                {signText}
            </Text>
        </group>
    );
});
ShopBuilding.displayName = 'ShopBuilding';

// ===== CHURCH =====
const ChurchBuilding = React.memo<{ position: [number, number, number]; rotation?: number; isNight?: boolean }>(
    ({ position, rotation = 0, isNight = false }) => (
        <group position={position} rotation={[0, rotation, 0]}>
            {/* Main nave */}
            <mesh position={[0, 4, 0]} castShadow receiveShadow>
                <boxGeometry args={[10, 8, 12]} />
                <primitive object={SM.stone} attach="material" />
            </mesh>
            {/* Pyramid roof */}
            <mesh position={[0, 10, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[9, 4, 4]} />
                <primitive object={SM.roofSlate} attach="material" />
            </mesh>
            {/* Tower */}
            <mesh position={[0, 8, -5]} castShadow>
                <boxGeometry args={[4, 10, 4]} />
                <primitive object={SM.stone} attach="material" />
            </mesh>
            {/* Spire - proper cone */}
            <mesh position={[0, 16, -5]} castShadow>
                <coneGeometry args={[2, 6, 8]} />
                <primitive object={SM.roofSlate} attach="material" />
            </mesh>
            {/* Cross on spire */}
            <group position={[0, 19.5, -5]}>
                <mesh><boxGeometry args={[0.15, 1.2, 0.15]} /><primitive object={SM.gold} attach="material" /></mesh>
                <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.7, 0.15, 0.15]} /><primitive object={SM.gold} attach="material" /></mesh>
            </group>
            {/* Door */}
            <mesh position={[0, 1.85, 6.01]}>
                <boxGeometry args={[2, 3.5, 0.2]} />
                <primitive object={SM.timber} attach="material" />
            </mesh>
            {/* Stained glass rose window */}
            <group position={[0, 5.5, 6.02]}>
                {/* Background - deep blue */}
                <mesh position={[0, 0, 0]}>
                    <circleGeometry args={[1.4, 24]} />
                    <meshStandardMaterial color="#1e3a5f" roughness={0.3} />
                </mesh>
                {/* Main glass segments - radiating colors */}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <mesh key={i} position={[0, 0, 0.01]} rotation={[0, 0, (i * Math.PI) / 4]}>
                        <circleGeometry args={[1.3, 3, (i * Math.PI) / 4, Math.PI / 4]} />
                        <meshStandardMaterial
                            color={['#dc2626', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308'][i]}
                            roughness={0.2}
                            metalness={0.1}
                            transparent
                            opacity={0.9}
                            emissive={['#dc2626', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308'][i]}
                            emissiveIntensity={isNight ? 3 : 0.2}
                        />
                    </mesh>
                ))}
                {/* Gold tracery spokes */}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <mesh key={`spoke-${i}`} position={[0, 0, 0.02]} rotation={[0, 0, (i * Math.PI) / 4]}>
                        <boxGeometry args={[0.04, 1.3, 0.01]} />
                        <primitive object={SM.gold} attach="material" />
                    </mesh>
                ))}
                {/* Outer gold frame */}
                <mesh position={[0, 0, 0.02]}>
                    <ringGeometry args={[1.35, 1.5, 24]} />
                    <primitive object={SM.gold} attach="material" />
                </mesh>
                {/* Middle gold ring */}
                <mesh position={[0, 0, 0.02]}>
                    <ringGeometry args={[0.7, 0.78, 16]} />
                    <primitive object={SM.gold} attach="material" />
                </mesh>
                {/* Center medallion */}
                <mesh position={[0, 0, 0.03]}>
                    <circleGeometry args={[0.35, 16]} />
                    <meshStandardMaterial color="#fef3c7" emissive="#fcd34d" emissiveIntensity={0.4} roughness={0.3} />
                </mesh>
                {/* Inner gold ring */}
                <mesh position={[0, 0, 0.04]}>
                    <ringGeometry args={[0.28, 0.35, 16]} />
                    <primitive object={SM.gold} attach="material" />
                </mesh>
                {/* Cross in center */}
                <mesh position={[0, 0, 0.05]}>
                    <boxGeometry args={[0.05, 0.22, 0.01]} />
                    <primitive object={SM.gold} attach="material" />
                </mesh>
                <mesh position={[0, 0, 0.05]}>
                    <boxGeometry args={[0.16, 0.05, 0.01]} />
                    <primitive object={SM.gold} attach="material" />
                </mesh>
            </group>
            {/* Side windows */}
            {[-3, 0, 3].map((z, i) => (
                <React.Fragment key={i}>
                    <mesh position={[5.01, 4, z]}>
                        <boxGeometry args={[0.1, 3, 1.5]} />
                        {isNight ? (
                            <meshStandardMaterial
                                color="#fef3c7"
                                emissive="#fef3c7"
                                emissiveIntensity={2}
                                toneMapped={false}
                            />
                        ) : (
                            <primitive object={SM.glass} attach="material" />
                        )}
                    </mesh>
                    <mesh position={[-5.01, 4, z]}>
                        <boxGeometry args={[0.1, 3, 1.5]} />
                        {isNight ? (
                            <meshStandardMaterial
                                color="#fef3c7"
                                emissive="#fef3c7"
                                emissiveIntensity={2}
                                toneMapped={false}
                            />
                        ) : (
                            <primitive object={SM.glass} attach="material" />
                        )}
                    </mesh>
                </React.Fragment>
            ))}
        </group>
    )
);
ChurchBuilding.displayName = 'ChurchBuilding';

// Isolated clock component to prevent full building re-renders
const TownHallClock: React.FC<{ position: [number, number, number]; isNight: boolean }> = React.memo(({ position, isNight }) => {
    const gameTime = useGameSimulationStore((state) => state.gameTime);
    const lastChimeHourRef = useRef(-1);

    // Play clock chime on the hour
    useEffect(() => {
        const currentHour = Math.floor(gameTime);
        // Only chime when crossing an hour boundary
        if (currentHour !== lastChimeHourRef.current && gameTime % 1 < 0.05) {
            audioManager.playClockChime(currentHour);
            lastChimeHourRef.current = currentHour;
        }
    }, [gameTime]);

    // Clock hands: hour hand rotates once per 12 hours, minute hand once per hour
    const hourAngle = ((gameTime / 12) * Math.PI * 2);
    const minuteAngle = (((gameTime % 1) * 60) / 60) * Math.PI * 2;

    return (
        <group position={position}>
            {/* Clock face */}
            <mesh position={[0, 0, 0]}>
                <circleGeometry args={[1.2, 16]} />
                <primitive object={SM.white} attach="material" />
            </mesh>
            <mesh position={[0, 0, 0.01]}>
                <circleGeometry args={[1.1, 16]} />
                {isNight ? (
                    <meshStandardMaterial
                        color="#ffffff"
                        emissive="#ffffff"
                        emissiveIntensity={1.5}
                        toneMapped={false}
                    />
                ) : (
                    <meshStandardMaterial color="#1e293b" roughness={0.5} />
                )}
            </mesh>
            {/* Hour hand - arrow shaped */}
            <group position={[0, 0, 0.05]} rotation={[0, 0, -hourAngle + Math.PI / 2]}>
                <mesh position={[0.2, 0, 0]}>
                    <boxGeometry args={[0.5, 0.1, 0.02]} />
                    {isNight ? <primitive object={SM.black} attach="material" /> : <primitive object={SM.gold} attach="material" />}
                </mesh>
                <mesh position={[0.5, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
                    <coneGeometry args={[0.12, 0.2, 4]} />
                    {isNight ? <primitive object={SM.black} attach="material" /> : <primitive object={SM.gold} attach="material" />}
                </mesh>
            </group>
            {/* Minute hand - arrow shaped, longer */}
            <group position={[0, 0, 0.06]} rotation={[0, 0, -minuteAngle + Math.PI / 2]}>
                <mesh position={[0.3, 0, 0]}>
                    <boxGeometry args={[0.7, 0.08, 0.02]} />
                    {isNight ? <primitive object={SM.black} attach="material" /> : <primitive object={SM.gold} attach="material" />}
                </mesh>
                <mesh position={[0.7, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
                    <coneGeometry args={[0.1, 0.18, 4]} />
                    {isNight ? <primitive object={SM.black} attach="material" /> : <primitive object={SM.gold} attach="material" />}
                </mesh>
            </group>
            {/* Clock center cap */}
            <mesh position={[0, 0, 0.07]}>
                <cylinderGeometry args={[0.08, 0.08, 0.02, 8]} />
                <primitive object={SM.gold} attach="material" />
            </mesh>
        </group>
    );
});
TownHallClock.displayName = 'TownHallClock';

// ===== TOWN HALL =====
const TownHall = React.memo<{ position: [number, number, number]; rotation?: number }>(
    ({ position, rotation = 0 }) => {
        // PERF: Use shallow equality to only re-render on day/night switch, not every tick
        const isNight = useGameSimulationStore(useShallow((state) => state.gameTime >= 20 || state.gameTime < 6));

        return (
            <group position={position} rotation={[0, rotation, 0]}>
                {/* Main building */}
                <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
                    <boxGeometry args={[12, 7, 10]} />
                    <primitive object={SM.cream} attach="material" />
                </mesh>

                {/* Office Windows (Added for night emissives) */}
                {/* Front Windows (flanking entrance) */}
                {[-4, 4].map((x, i) => (
                    <mesh key={`win-front-${i}`} position={[x, 3.5, 5.01]}>
                        <boxGeometry args={[1.5, 2.5, 0.1]} />
                        {isNight ? (
                            <meshStandardMaterial
                                color="#fef3c7"
                                emissive="#fef3c7"
                                emissiveIntensity={2}
                                toneMapped={false}
                            />
                        ) : (
                            <primitive object={SM.glass} attach="material" />
                        )}
                    </mesh>
                ))}
                {/* Side Windows */}
                {[-1, 0, 1].map((zOffset, i) => (
                    <React.Fragment key={`win-side-${i}`}>
                        {[-6.01, 6.01].map((x, j) => (
                            <mesh key={`win-side-${i}-${j}`} position={[x, 3.5, zOffset * 3]} rotation={[0, Math.PI / 2, 0]}>
                                <boxGeometry args={[1.5, 2.5, 0.1]} />
                                {isNight ? (
                                    <meshStandardMaterial
                                        color="#fef3c7"
                                        emissive="#fef3c7"
                                        emissiveIntensity={2}
                                        toneMapped={false}
                                    />
                                ) : (
                                    <primitive object={SM.glass} attach="material" />
                                )}
                            </mesh>
                        ))}
                    </React.Fragment>
                ))}

                {/* Pyramid roof */}
                <mesh position={[0, 9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[10, 4, 4]} />
                    <primitive object={SM.roofSlate} attach="material" />
                </mesh>
                {/* Clock tower */}
                <mesh position={[0, 11, 0]} castShadow>
                    <boxGeometry args={[4, 6, 4]} />
                    <primitive object={SM.cream} attach="material" />
                </mesh>
                {/* Tower roof - proper cone */}
                <mesh position={[0, 16, 0]} castShadow>
                    <coneGeometry args={[2.8, 4, 8]} />
                    <primitive object={SM.roofSlate} attach="material" />
                </mesh>

                {/* Clock Face & Hands - Isolated Component */}
                <TownHallClock position={[0, 12, 2.01]} isNight={isNight} />

                {/* Grand entrance - raised to meet steps */}
                <mesh position={[0, 2.4, 5.01]}>
                    <boxGeometry args={[3, 3, 0.2]} />
                    <primitive object={SM.timber} attach="material" />
                </mesh>
                {/* Steps - ascending toward building */}
                {[0, 1, 2].map((i) => (
                    <mesh key={i} position={[0, 0.15 + i * 0.3, 7 - i * 0.5]} castShadow receiveShadow>
                        <boxGeometry args={[5 - i * 0.5, 0.3, 1]} />
                        <primitive object={SM.stone} attach="material" />
                    </mesh>
                ))}
                {/* Columns */}
                {[-2.5, 2.5].map((x, i) => (
                    <mesh key={i} position={[x, 2, 5.5]} castShadow>
                        <cylinderGeometry args={[0.3, 0.35, 4, 12]} />
                        <primitive object={SM.white} attach="material" />
                    </mesh>
                ))}
                {/* Lintel across columns */}
                <mesh position={[0, 4.2, 5.5]} castShadow>
                    <boxGeometry args={[5.5, 0.4, 0.5]} />
                    <primitive object={SM.white} attach="material" />
                </mesh>
                {/* TOWN HALL text */}
                <Text
                    position={[0, 6, 5.1]}
                    fontSize={0.6}
                    color="#1e293b"
                    anchorX="center"
                    anchorY="middle"
                    font={FONT_URL}
                >
                    TOWN HALL
                </Text>
            </group>
        );
    }
);
TownHall.displayName = 'TownHall';

// ===== PUB =====
const Pub = React.memo<{ position: [number, number, number]; rotation?: number; isNight?: boolean }>(
    ({ position, rotation = 0, isNight = false }) => (
        <group position={position} rotation={[0, rotation, 0]}>
            {/* Main building - timber frame style */}
            <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[8, 5, 6]} />
                <primitive object={SM.cream} attach="material" />
            </mesh>
            {/* Timber beams - vertical */}
            {[[-3.5, 2.5], [0, 2.5], [3.5, 2.5]].map(([x, y], i) => (
                <mesh key={i} position={[x, y, 3.01]} castShadow>
                    <boxGeometry args={[0.3, 5, 0.15]} />
                    <primitive object={SM.timber} attach="material" />
                </mesh>
            ))}
            {/* Horizontal beams */}
            {[1, 3, 4.5].map((y, i) => (
                <mesh key={`h-${i}`} position={[0, y, 3.01]} castShadow>
                    <boxGeometry args={[8, 0.2, 0.15]} />
                    <primitive object={SM.timber} attach="material" />
                </mesh>
            ))}
            {/* Pyramid roof */}
            <mesh position={[0, 6.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[6.5, 3, 4]} />
                <primitive object={SM.thatch} attach="material" />
            </mesh>
            {/* Chimney */}
            <mesh position={[3, 7, 0]} castShadow>
                <boxGeometry args={[0.8, 2, 0.8]} />
                <primitive object={SM.stone} attach="material" />
            </mesh>
            {/* Chimney smoke */}
            <ChimneySmoke position={[3, 8.2, 0]} offset={5} />
            {/* Door */}
            <mesh position={[0, 1.2, 3.01]}>
                <boxGeometry args={[1.5, 2.4, 0.1]} />
                <primitive object={SM.timber} attach="material" />
            </mesh>
            {/* Windows */}
            {[-2.5, 2.5].map((x, i) => (
                <mesh key={i} position={[x, 2, 3.02]}>
                    <boxGeometry args={[1.2, 1.2, 0.05]} />
                    {isNight ? (
                        <meshBasicMaterial color="#fbbf24" />
                    ) : (
                        <primitive object={SM.glass} attach="material" />
                    )}
                </mesh>
            ))}
            {/* Hanging sign */}
            <group position={[4.5, 3.5, 0]}>
                <mesh><boxGeometry args={[0.1, 1.5, 0.1]} /><primitive object={SM.black} attach="material" /></mesh>
                <mesh position={[0.8, -0.5, 0]}><boxGeometry args={[1.5, 1, 0.1]} /><primitive object={SM.timber} attach="material" /></mesh>
                <Text
                    position={[0.8, -0.5, 0.1]}
                    fontSize={0.15}
                    color="#fef3c7"
                    anchorX="center"
                    anchorY="middle"
                    font={FONT_URL}
                >
                    THE FLOUR{'\n'}& BARREL
                </Text>
            </group>
            {/* Outdoor seating */}
            {[-2, 2].map((x, i) => (
                <group key={i} position={[x, 0, 5]}>
                    <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[1.2, 0.08, 1.2]} /><primitive object={SM.timber} attach="material" /></mesh>
                    <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.08, 0.08, 0.6, 8]} /><primitive object={SM.timber} attach="material" /></mesh>
                </group>
            ))}
        </group>
    )
);
Pub.displayName = 'Pub';

// ===== SCHOOL =====
const School = React.memo<{ position: [number, number, number]; rotation?: number; isNight?: boolean }>(
    ({ position, rotation = 0, isNight = false }) => (
        <group position={position} rotation={[0, rotation, 0]}>
            {/* Main building */}
            <mesh position={[0, 3, 0]} castShadow receiveShadow>
                <boxGeometry args={[10, 6, 7]} />
                <primitive object={SM.cream} attach="material" />
            </mesh>
            {/* Pyramid roof */}
            <mesh position={[0, 7.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[8, 3, 4]} />
                <primitive object={SM.roofSlate} attach="material" />
            </mesh>
            {/* Bell tower - open frame with posts */}
            <group position={[0, 9, 0]}>
                {/* Four corner posts */}
                {[[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].map(([x, z], i) => (
                    <mesh key={i} position={[x, 0, z]} castShadow>
                        <boxGeometry args={[0.3, 3, 0.3]} />
                        <primitive object={SM.cream} attach="material" />
                    </mesh>
                ))}
                {/* Top beam connecting posts */}
                <mesh position={[0, 1.35, 0]} castShadow>
                    <boxGeometry args={[2, 0.3, 2]} />
                    <primitive object={SM.cream} attach="material" />
                </mesh>

                {/* Bell - realistic lathe profile */}
                <group
                    position={[0, 0.7, 0]}
                    scale={1.5}
                    onClick={(e) => {
                        e.stopPropagation();
                        playCritterSound('bell');
                    }}
                    onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                    onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                >
                    {/* Bell body using lathe geometry for proper curve */}
                    <mesh rotation={[Math.PI, 0, 0]}>
                        <latheGeometry args={[
                            // Profile points for bell shape: [x, y] from top to bottom
                            [
                                new THREE.Vector2(0.08, 0),      // Top center (narrow)
                                new THREE.Vector2(0.12, 0.05),   // Shoulder
                                new THREE.Vector2(0.15, 0.12),   // Upper body
                                new THREE.Vector2(0.18, 0.22),   // Mid body
                                new THREE.Vector2(0.24, 0.32),   // Lower body (widening)
                                new THREE.Vector2(0.32, 0.40),   // Waist
                                new THREE.Vector2(0.38, 0.45),   // Lip start
                                new THREE.Vector2(0.40, 0.48),   // Lip flare
                                new THREE.Vector2(0.38, 0.50),   // Lip bottom edge
                            ],
                            16  // Segments around
                        ]} />
                        <primitive object={SM.gold} attach="material" />
                    </mesh>
                    {/* Mounting yoke */}
                    <mesh position={[0, 0.08, 0]}>
                        <boxGeometry args={[0.08, 0.12, 0.3]} />
                        <primitive object={SM.timber} attach="material" />
                    </mesh>
                    {/* Clapper rod */}
                    <mesh position={[0, -0.2, 0]}>
                        <cylinderGeometry args={[0.015, 0.015, 0.25, 6]} />
                        <primitive object={SM.black} attach="material" />
                    </mesh>
                    {/* Clapper ball */}
                    <mesh position={[0, -0.35, 0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <primitive object={SM.black} attach="material" />
                    </mesh>
                </group>
            </group>
            <mesh position={[0, 11.5, 0]} castShadow>
                <coneGeometry args={[1.4, 2, 8]} />
                <primitive object={SM.roofSlate} attach="material" />
            </mesh>
            {/* Windows - row */}
            {[-3, -1, 1, 3].map((x, i) => (
                <mesh key={i} position={[x, 3.5, 3.51]}>
                    <boxGeometry args={[1.2, 2, 0.05]} />
                    {isNight ? (
                        <meshBasicMaterial color="#fef3c7" />
                    ) : (
                        <primitive object={SM.glass} attach="material" />
                    )}
                </mesh>
            ))}
            {/* Door */}
            <mesh position={[0, 1.5, 3.51]}>
                <boxGeometry args={[1.5, 3, 0.1]} />
                <primitive object={SM.timber} attach="material" />
            </mesh>
            {/* Sign */}
            <Text
                position={[0, 5.5, 3.6]}
                fontSize={0.4}
                color="#1e293b"
                anchorX="center"
                anchorY="middle"
                font={FONT_URL}
            >
                SCHOOL
            </Text>
        </group>
    )
);
School.displayName = 'School';

// ===== WISHING WELL =====
const WishingWell = React.memo<{ position: [number, number, number] }>(({ position }) => (
    <group position={position}>
        {/* Stone base */}
        <mesh position={[0, 0.4, 0]} castShadow>
            <cylinderGeometry args={[1, 1.2, 0.8, 12]} />
            <primitive object={SM.stone} attach="material" />
        </mesh>
        {/* Water inside */}
        <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.85, 0.85, 0.5, 12]} />
            <primitive object={SM.water} attach="material" />
        </mesh>
        {/* Wooden posts */}
        {[-0.7, 0.7].map((x, i) => (
            <mesh key={i} position={[x, 1.5, 0]} castShadow>
                <boxGeometry args={[0.15, 2.2, 0.15]} />
                <primitive object={SM.timber} attach="material" />
            </mesh>
        ))}
        {/* Roof */}
        <mesh position={[0, 2.8, 0]} castShadow>
            <coneGeometry args={[1.2, 1, 8]} />
            <primitive object={SM.thatch} attach="material" />
        </mesh>
        {/* Bucket */}
        <mesh position={[0, 1.2, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.15, 0.3, 8]} />
            <primitive object={SM.timber} attach="material" />
        </mesh>
        {/* Rope */}
        <mesh position={[0, 2, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 1.5, 6]} />
            <meshStandardMaterial color="#8b7355" roughness={0.9} />
        </mesh>
    </group>
));
WishingWell.displayName = 'WishingWell';

// ===== STREET LAMP =====
const VillageLamp = React.memo<{ position: [number, number, number]; isNight?: boolean }>(({ position, isNight = false }) => (
    <group position={position}>
        <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, 4, 8]} />
            <primitive object={SM.black} attach="material" />
        </mesh>
        <mesh position={[0, 4.3, 0]}>
            <boxGeometry args={[0.5, 0.6, 0.5]} />
            <primitive object={SM.black} attach="material" />
        </mesh>
        <mesh position={[0, 4.3, 0]}>
            <boxGeometry args={[0.35, 0.45, 0.35]} />
            {isNight ? (
                <>
                    <meshStandardMaterial
                        color="#ffaa00"
                        emissive="#ffaa00"
                        emissiveIntensity={2}
                        toneMapped={false}
                    />
                    <pointLight color="#ffaa00" intensity={1} distance={15} decay={2} castShadow={false} />
                </>
            ) : (
                <meshStandardMaterial color="#333333" roughness={0.6} />
            )}
        </mesh>
    </group>
));
VillageLamp.displayName = 'VillageLamp';

// ===== DUCK COMPONENT =====
const Duck = React.memo<{
    position: [number, number, number];
    delay: number;
    onClick: (pos: [number, number, number]) => void;
}>(({ position, delay, onClick }) => {
    const groupRef = useRef<THREE.Group>(null);
    const [isExcited, setIsExcited] = React.useState(false);

    // Animation loop
    useFrame((state) => {
        if (!groupRef.current) return;
        const time = state.clock.elapsedTime;

        // Base bobbing
        let yOffset = Math.sin(time * 2 + delay) * 0.02;
        let rotOffset = Math.sin(time * 0.5 + delay) * 0.1;

        // Excitement override
        if (isExcited) {
            yOffset += Math.abs(Math.sin(time * 15)) * 0.1; // Rapid hop
            rotOffset += Math.sin(time * 20) * 0.2; // Wiggle
        }

        groupRef.current.position.y = position[1] + yOffset;
        groupRef.current.rotation.y = rotOffset;
    });

    // Reset excitement
    React.useEffect(() => {
        if (isExcited) {
            const timer = setTimeout(() => setIsExcited(false), 1000);
            return () => clearTimeout(timer);
        }
    }, [isExcited]);

    const handleClick = (e: any) => {
        e.stopPropagation();
        setIsExcited(true);
        playCritterSound('duck');
        onClick(position);
    };

    return (
        <group ref={groupRef} position={[position[0], position[1], position[2]]} onClick={handleClick}>
            <mesh castShadow><sphereGeometry args={[0.25, 8, 8]} /><meshStandardMaterial color="#fef3c7" roughness={0.8} /></mesh>
            <mesh position={[0.2, 0.1, 0]} castShadow><sphereGeometry args={[0.15, 8, 8]} /><meshStandardMaterial color="#fef3c7" roughness={0.8} /></mesh>
            <mesh position={[0.35, 0.1, 0]} rotation={[0, 0, -0.3]}><boxGeometry args={[0.1, 0.05, 0.08]} /><meshStandardMaterial color="#f97316" roughness={0.6} /></mesh>
        </group>
    );
});
Duck.displayName = 'Duck';

// ===== DUCK POND =====
const DuckPond = React.memo<{ position: [number, number, number] }>(({ position }) => {
    // Local heart particles state
    const [hearts, setHearts] = React.useState<{ id: number; pos: [number, number, number] }[]>([]);

    const addHeart = React.useCallback((pos: [number, number, number]) => {
        const id = Date.now() + Math.random();
        // Spawning heart slighty above duck
        setHearts(prev => [...prev, { id, pos: [pos[0], pos[1] + 1, pos[2]] }]);
    }, []);

    const removeHeart = React.useCallback((id: number) => {
        setHearts(prev => prev.filter(h => h.id !== id));
    }, []);

    return (
        <group position={position}>
            {/* Shore ring */}
            <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <ringGeometry args={[5.5, 7, 24]} />
                <meshStandardMaterial color="#a89f91" roughness={0.9} />
            </mesh>
            {/* Water */}
            <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <circleGeometry args={[6, 24]} />
                <primitive object={SM.water} attach="material" />
            </mesh>
            {/* Ducks */}
            <group>
                {[[2, 0.2, 1], [-1, 0.2, -2], [0, 0.2, 2], [1.5, 0.2, -1.5]].map(([x, y, z], i) => (
                    <Duck key={i} position={[x as number, y as number, z as number]} delay={i} onClick={() => addHeart([x as number, y as number, z as number])} />
                ))}
            </group>
            {/* Lily pads */}
            {[[-2, 0.13, 0], [1, 0.13, -1.5], [-0.5, 0.13, 2.5]].map(([x, y, z], i) => (
                <mesh key={`lily-${i}`} position={[x as number, y as number, z as number]} rotation={[-Math.PI / 2, 0, i]}>
                    <circleGeometry args={[0.4, 12]} />
                    <meshStandardMaterial color="#22c55e" roughness={0.9} />
                </mesh>
            ))}
            {/* Render Active Hearts */}
            {hearts.map(h => (
                <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
            ))}
        </group>
    );
});
DuckPond.displayName = 'DuckPond';

// ===== MARKET STALL =====
const MarketStall = React.memo<{ position: [number, number, number]; rotation?: number; color1?: string; color2?: string }>(
    ({ position, rotation = 0, color1 = '#dc2626', color2 = '#fef3c7' }) => (
        <group position={position} rotation={[0, rotation, 0]}>
            {/* Table top */}
            <mesh position={[0, 0.9, 0]} castShadow>
                <boxGeometry args={[2.8, 0.1, 1.8]} />
                <primitive object={SM.timber} attach="material" />
            </mesh>
            {/* Base/Legs with bracing */}
            <group position={[0, 0.45, 0]}>
                {[[-1.2, 0.7], [1.2, 0.7], [-1.2, -0.7], [1.2, -0.7]].map(([x, z], i) => (
                    <mesh key={i} position={[x, 0, z]} castShadow>
                        <boxGeometry args={[0.1, 0.9, 0.1]} />
                        <primitive object={SM.timber} attach="material" />
                    </mesh>
                ))}
                {/* Cross bracing sides */}
                {[-0.7, 0.7].map((z, i) => (
                    <mesh key={`brace-${i}`} position={[0, 0.2, z]} rotation={[0, 0, Math.PI / 2]}>
                        <boxGeometry args={[0.1, 2.4, 0.05]} />
                        <primitive object={SM.timber} attach="material" />
                    </mesh>
                ))}
            </group>

            {/* Roof Frame Posts */}
            {[[-1.3, 0.8], [1.3, 0.8]].map(([x, z], i) => (
                <mesh key={`post-${i}`} position={[x, 1.6, z]} castShadow>
                    <cylinderGeometry args={[0.04, 0.04, 1.6, 8]} />
                    <primitive object={SM.timber} attach="material" />
                </mesh>
            ))}

            {/* Striped Awning - constructed from multiple segments */}
            <group position={[0, 2.4, 0.2]} rotation={[0.4, 0, 0]}>
                {[-1.4, -1.0, -0.6, -0.2, 0.2, 0.6, 1.0, 1.4].map((x, i) => (
                    <mesh key={i} position={[x, 0, 0]} receiveShadow>
                        <boxGeometry args={[0.4, 0.05, 2.2]} />
                        <meshStandardMaterial color={i % 2 === 0 ? color1 : color2} roughness={0.9} />
                    </mesh>
                ))}
            </group>

            {/* Merchandise on table */}
            <group position={[0, 1, 0]}>
                {/* Crate 1 */}
                <group position={[-0.8, 0.15, 0.2]} rotation={[0, 0.2, 0]}>
                    <mesh castShadow><boxGeometry args={[0.6, 0.3, 0.6]} /><primitive object={SM.timber} attach="material" /></mesh>
                    {/* Apples */}
                    {[[-0.15, 0.2, -0.15], [0.15, 0.2, -0.15], [-0.15, 0.2, 0.15], [0.15, 0.2, 0.15], [0, 0.25, 0]].map(([x, y, z], i) => (
                        <mesh key={i} position={[x, y, z]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#ef4444" /></mesh>
                    ))}
                </group>

                {/* Cheese wheels */}
                <group position={[0.6, 0.1, -0.3]}>
                    <mesh position={[0, 0, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.15, 16]} /><meshStandardMaterial color="#fbbf24" /></mesh>
                    <mesh position={[0.1, 0.15, 0.1]} castShadow><cylinderGeometry args={[0.15, 0.15, 0.12, 16]} /><meshStandardMaterial color="#fcd34d" /></mesh>
                </group>

                {/* Sacks */}
                <mesh position={[0.2, 0.2, 0.4]} rotation={[0.2, 0.1, 0]} castShadow>
                    <sphereGeometry args={[0.25, 12, 12]} />
                    <meshStandardMaterial color="#d6d3d1" roughness={1} />
                </mesh>
            </group>
        </group>
    )
);
MarketStall.displayName = 'MarketStall';

// ===== POSTBOX =====
const Postbox = React.memo<{ position: [number, number, number]; rotation?: number }>(({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
        {/* Main cylinder body */}
        <mesh position={[0, 0.65, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.28, 1.3, 12]} />
            <primitive object={SM.red} attach="material" />
        </mesh>
        {/* Flatter dome top - like real British pillar box */}
        <mesh position={[0, 1.22, 0]} castShadow>
            <sphereGeometry args={[0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3]} />
            <primitive object={SM.red} attach="material" />
        </mesh>
        {/* Mail slot - higher up like real pillar box */}
        <mesh position={[0, 1.05, 0.29]}>
            <boxGeometry args={[0.22, 0.06, 0.02]} />
            <primitive object={SM.black} attach="material" />
        </mesh>
        {/* Collection times plate */}
        <mesh position={[0, 0.5, 0.29]}>
            <boxGeometry args={[0.18, 0.12, 0.01]} />
            <primitive object={SM.white} attach="material" />
        </mesh>
    </group>
));
Postbox.displayName = 'Postbox';

// ===== FOUNTAIN =====
const Fountain = React.memo<{ position: [number, number, number] }>(({ position }) => (
    <group position={position}>
        {/* Base pool */}
        <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[3, 3.5, 0.6, 16]} />
            <primitive object={SM.stone} attach="material" />
        </mesh>
        {/* Lower water - visible disc */}
        <mesh position={[0, 0.65, 0]}>
            <cylinderGeometry args={[2.8, 2.8, 0.1, 16]} />
            <primitive object={SM.water} attach="material" />
        </mesh>
        {/* Center column */}
        <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.4, 2.4, 12]} />
            <primitive object={SM.stone} attach="material" />
        </mesh>
        {/* Top bowl */}
        <mesh position={[0, 2.8, 0]} castShadow>
            <cylinderGeometry args={[1, 0.8, 0.4, 12]} />
            <primitive object={SM.stone} attach="material" />
        </mesh>
        <mesh position={[0, 2.95, 0]}>
            <cylinderGeometry args={[0.8, 0.8, 0.15, 12]} />
            <primitive object={SM.water} attach="material" />
        </mesh>
        {/* Bird perched on edge */}
        <group position={[0.7, 3.1, 0]} rotation={[0, -0.5, 0]} onClick={(e) => { e.stopPropagation(); playCritterSound('bird'); }}>
            <mesh position={[0, 0.1, 0]}>
                <sphereGeometry args={[0.12, 8, 8]} />
                <meshStandardMaterial color="#4a4a4a" />
            </mesh>
            <mesh position={[0, 0, 0.08]}>
                <sphereGeometry args={[0.08, 8, 8]} />
                <meshStandardMaterial color="#4a4a4a" />
            </mesh>
            <mesh position={[0, 0, 0.15]}>
                <coneGeometry args={[0.03, 0.08, 4]} />
                <meshStandardMaterial color="#ffa500" />
            </mesh>
        </group>
    </group>
));
Fountain.displayName = 'Fountain';

// ===== HORSE =====
// Redesigned v3: Detailed segmented model, clearer proportions
const Horse = React.memo<{ position: [number, number, number]; rotation?: number; color?: string }>(
    ({ position, rotation = 0, color = '#8d6e63' }) => {
        const [isExcited, setIsExcited] = React.useState(false);
        const [hearts, setHearts] = React.useState<{ id: number; pos: [number, number, number] }[]>([]);
        const groupRef = React.useRef<THREE.Group>(null);

        const handlePet = (e: any) => {
            e.stopPropagation();
            setIsExcited(true);
            playCritterSound('horse');
            const id = Date.now();
            setHearts(prev => [...prev, { id, pos: [0, 2.5, 0] }]);
        };

        const removeHeart = (id: number) => {
            setHearts(prev => prev.filter(h => h.id !== id));
        };

        // Animation
        useFrame((state) => {
            if (groupRef.current && isExcited) {
                const t = state.clock.elapsedTime * 15;
                groupRef.current.rotation.z = Math.sin(t) * 0.05; // Shake
                groupRef.current.position.y = Math.abs(Math.sin(t * 0.5)) * 0.1; // Rear up slightly
            } else if (groupRef.current) {
                groupRef.current.rotation.z = 0;
                groupRef.current.position.y = 0;
            }
        });

        React.useEffect(() => {
            if (isExcited) {
                const t = setTimeout(() => setIsExcited(false), 800);
                return () => clearTimeout(t);
            }
        }, [isExcited]);

        return (
            <group position={position} rotation={[0, rotation, 0]} scale={0.6} onClick={handlePet}>
                <group ref={groupRef}>
                    {/* Main Body Group */}
                    <group position={[0, 1.4, 0]}>
                        {/* Torso */}
                        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                            <cylinderGeometry args={[0.55, 0.6, 1.2, 12]} />
                            <meshStandardMaterial color={color} />
                        </mesh>
                        {/* Shoulders */}
                        <mesh position={[0, 0.1, 0.7]} castShadow>
                            <sphereGeometry args={[0.62, 12, 12]} />
                            <meshStandardMaterial color={color} />
                        </mesh>
                        {/* Hindquarters */}
                        <mesh position={[0, 0.15, -0.7]} castShadow>
                            <sphereGeometry args={[0.65, 12, 12]} />
                            <meshStandardMaterial color={color} />
                        </mesh>
                    </group>

                    {/* Neck - Max upright/proud */}
                    <group position={[0, 2.1, 0.9]} rotation={[0.4, 0, 0]}>
                        <mesh position={[0, 0.5, 0]} castShadow>
                            <cylinderGeometry args={[0.25, 0.45, 1.2, 12]} />
                            <meshStandardMaterial color={color} />
                        </mesh>
                        {/* Mane */}
                        <mesh position={[0, 0.4, -0.3]} rotation={[0, 0, 0]}>
                            <boxGeometry args={[0.1, 1.3, 0.2]} />
                            <meshStandardMaterial color="#3e2723" />
                        </mesh>
                    </group>

                    {/* Head */}
                    <group position={[0, 3.1, 1.6]} rotation={[0.3, 0, 0]}>
                        <mesh castShadow>
                            <boxGeometry args={[0.35, 0.35, 0.7]} />
                            <meshStandardMaterial color={color} />
                        </mesh>
                        <mesh position={[0, -0.05, 0.35]} castShadow>
                            <boxGeometry args={[0.25, 0.25, 0.4]} />
                            <meshStandardMaterial color="#5d4037" />
                        </mesh>
                        {/* Ears - Larger and more prominent */}
                        {[-0.12, 0.12].map((x, i) => (
                            <mesh key={i} position={[x, 0.35, -0.2]} rotation={[0.2, 0, x > 0 ? -0.3 : 0.3]}>
                                <coneGeometry args={[0.08, 0.2, 4]} />
                                <meshStandardMaterial color={color} />
                            </mesh>
                        ))}
                        {/* Eyes - Moved to side of head */}
                        {[-0.16, 0.16].map((x, i) => (
                            <mesh key={i} position={[x, 0.1, 0.1]}>
                                <sphereGeometry args={[0.065, 8, 8]} />
                                <meshStandardMaterial color="black" />
                            </mesh>
                        ))}
                        {/* Forelock */}
                        <mesh position={[0, 0.2, 0.2]} rotation={[0.2, 0, 0]}>
                            <boxGeometry args={[0.05, 0.2, 0.3]} />
                            <meshStandardMaterial color="#3e2723" />
                        </mesh>
                    </group>

                    {/* Legs */}
                    {/* Front Left */}
                    <group position={[-0.35, 1.4, 0.7]}>
                        <mesh position={[0, -0.4, 0]}><cylinderGeometry args={[0.12, 0.15, 0.8, 8]} /><meshStandardMaterial color={color} /></mesh>
                        <mesh position={[0, -1.1, 0]}><cylinderGeometry args={[0.1, 0.11, 0.7, 8]} /><meshStandardMaterial color={color} /></mesh>
                        <mesh position={[0, -1.5, 0]}><cylinderGeometry args={[0.12, 0.15, 0.15, 8]} /><meshStandardMaterial color="#1a1110" /></mesh>
                    </group>
                    {/* Front Right */}
                    <group position={[0.35, 1.4, 0.7]}>
                        <mesh position={[0, -0.4, 0]}><cylinderGeometry args={[0.12, 0.15, 0.8, 8]} /><meshStandardMaterial color={color} /></mesh>
                        <mesh position={[0, -1.1, 0]}><cylinderGeometry args={[0.1, 0.11, 0.7, 8]} /><meshStandardMaterial color={color} /></mesh>
                        <mesh position={[0, -1.5, 0]}><cylinderGeometry args={[0.12, 0.15, 0.15, 8]} /><meshStandardMaterial color="#1a1110" /></mesh>
                    </group>
                    {/* Back Left */}
                    <group position={[-0.35, 1.4, -0.7]}>
                        <mesh position={[0, -0.3, 0]}><cylinderGeometry args={[0.14, 0.18, 0.8, 8]} /><meshStandardMaterial color={color} /></mesh>
                        <mesh position={[0, -1.0, 0]}><cylinderGeometry args={[0.1, 0.12, 0.8, 8]} /><meshStandardMaterial color={color} /></mesh>
                        <mesh position={[0, -1.5, 0]}><cylinderGeometry args={[0.12, 0.15, 0.15, 8]} /><meshStandardMaterial color="#1a1110" /></mesh>
                    </group>
                    {/* Back Right */}
                    <group position={[0.35, 1.4, -0.7]}>
                        <mesh position={[0, -0.3, 0]}><cylinderGeometry args={[0.14, 0.18, 0.8, 8]} /><meshStandardMaterial color={color} /></mesh>
                        <mesh position={[0, -1.0, 0]}><cylinderGeometry args={[0.1, 0.12, 0.8, 8]} /><meshStandardMaterial color={color} /></mesh>
                        <mesh position={[0, -1.5, 0]}><cylinderGeometry args={[0.12, 0.15, 0.15, 8]} /><meshStandardMaterial color="#1a1110" /></mesh>
                    </group>

                    {/* Tail */}
                    <group position={[0, 1.7, -1.0]} rotation={[0.2, 0, 0]}>
                        <mesh position={[0, -0.4, -0.2]} rotation={[-0.2, 0, 0]}>
                            <cylinderGeometry args={[0.08, 0.15, 1.2, 8]} />
                            <meshStandardMaterial color="#3e2723" />
                        </mesh>
                    </group>
                </group>
                {/* Local Hearts */}
                {hearts.map(h => (
                    <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
                ))}
            </group>
        );
    });
Horse.displayName = 'Horse';

// ===== BLACKSMITH / FORGE =====
const Forge = React.memo<{ position: [number, number, number]; rotation?: number }>(
    ({ position, rotation = 0 }) => (
        <group position={position} rotation={[0, rotation, 0]}>
            {/* Main building */}
            <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[7, 5, 6]} />
                <primitive object={SM.timber} attach="material" />
            </mesh>
            {/* Pyramid roof - raised to clear walls */}
            <mesh position={[0, 6.0, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[5.5, 2.5, 4]} />
                <primitive object={SM.roofSlate} attach="material" />
            </mesh>
            {/* Large chimney */}
            <mesh position={[-2, 7, 0]} castShadow>
                <boxGeometry args={[1.5, 3, 1.5]} />
                <primitive object={SM.stone} attach="material" />
            </mesh>
            {/* Chimney smoke */}
            <ChimneySmoke position={[-2, 8.8, 0]} offset={2} />
            {/* Open front */}
            <mesh position={[0, 1.5, 3.01]}>
                <boxGeometry args={[4, 3, 0.1]} />
                <primitive object={SM.black} attach="material" />
            </mesh>
            {/* Anvil outside */}
            <mesh position={[2, 0.4, 4]} castShadow>
                <boxGeometry args={[0.6, 0.8, 0.4]} />
                <primitive object={SM.black} attach="material" />
            </mesh>
            {/* Sign */}
            <Text
                position={[0, 4.5, 3.1]}
                fontSize={0.35}
                color="#fef3c7"
                anchorX="center"
                anchorY="middle"
                font={FONT_URL}
            >
                BLACKSMITH
            </Text>
            {/* Hitched Horse */}
            <Horse position={[-4, 0, 4]} rotation={Math.PI / 4} color="#795548" />
        </group>
    )
);
Forge.displayName = 'Forge';



// ===== MAIN VILLAGE COMPONENT =====
export const VillageArea: React.FC = () => {
    // Selector optimization: Only re-render when night status CHANGES
    const isNight = useGameSimulationStore((state) => state.gameTime >= 20 || state.gameTime < 6);

    return (
        <group position={[-190, 0, 0]}>
            {/* Ground - raised to avoid z-fighting with world ground */}
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[70, 130]} />
                <primitive object={SM.grass} attach="material" />
            </mesh>

            {/* Cobblestone market square - raised above grass */}
            <mesh position={[0, 0.1, 10]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[25, 40]} />
                <primitive object={SM.cobble} attach="material" />
            </mesh>

            {/* === CHURCH === */}
            <ChurchBuilding position={[0, 0, -40]} rotation={0} isNight={isNight} />

            {/* === TOWN HALL === */}
            <TownHall position={[0, 0, 20]} rotation={Math.PI} />

            {/* === PUB === */}
            <Pub position={[-25, 0, -15]} rotation={Math.PI / 2} isNight={isNight} />

            {/* === SCHOOL === */}
            <School position={[22, 0, 40]} rotation={-Math.PI / 2} isNight={isNight} />

            {/* === FORGE === */}
            <Forge position={[-22, 0, -55]} rotation={Math.PI / 2} />

            {/* === SHOPS === */}
            <ShopBuilding position={[20, 0, 5]} rotation={-Math.PI / 2} wallColor="pink" signText="BAKER" awningColor="#f472b6" isNight={isNight} />
            <ShopBuilding position={[20, 0, -10]} rotation={-Math.PI / 2} wallColor="terracotta" signText="BUTCHER" awningColor="#dc2626" isNight={isNight} />
            <ShopBuilding position={[-20, 0, 30]} rotation={Math.PI / 2} wallColor="blue" signText="GENERAL STORE" awningColor="#3b82f6" isNight={isNight} />

            {/* === COTTAGES === */}
            <Cottage position={[-25, 0, -35]} rotation={Math.PI / 2} wallColor="cream" roofType="thatch" isNight={isNight} />
            <Cottage position={[25, 0, -35]} rotation={-Math.PI / 2} wallColor="pink" roofType="slate" isNight={isNight} />
            <Cottage position={[25, 0, -50]} rotation={-Math.PI / 2} wallColor="blue" roofType="thatch" isNight={isNight} />
            <Cottage position={[-25, 0, 45]} rotation={Math.PI / 2} wallColor="terracotta" roofType="tile" hasGarden={false} isNight={isNight} />
            <Cottage position={[25, 0, 55]} rotation={-Math.PI / 2} wallColor="cream" roofType="slate" isNight={isNight} />

            {/* === WISHING WELL === */}
            <WishingWell position={[-10, 0, -5]} />
            {/* Observer Cat on the Well Rim */}
            <Cat position={[-10, 0.8, -4.3]} rotation={2.5} color="#1a1a1a" />

            {/* === MARKET STALLS === */}
            <MarketStall position={[-8, 0, 10]} rotation={0} color1="#dc2626" />
            <MarketStall position={[8, 0, 10]} rotation={0} color1="#3b82f6" />
            <MarketStall position={[-8, 0, 2]} rotation={0} color1="#22c55e" />
            <MarketStall position={[8, 0, 2]} rotation={0} color1="#f59e0b" />

            {/* === FOUNTAIN in market square === */}
            <Fountain position={[0, 0, 6]} />

            {/* === DUCK POND === */}
            <DuckPond position={[20, 0, 25]} />

            {/* === STREET LAMPS === */}
            {[[-15, 20], [15, 20], [-15, -20], [15, -20], [-15, -45], [15, -45], [-15, 45], [15, 50]].map(([x, z], i) => (
                <VillageLamp key={i} position={[x, 0, z]} isNight={isNight} />
            ))}

            {/* === POSTBOX === */}
            <Postbox position={[12, 0, 25]} rotation={-Math.PI / 2} />

            {/* === BENCHES === */}
            {[[-5, 18], [5, 18], [-12, -25], [12, 35]].map(([x, z], i) => (
                <group key={i} position={[x, 0, z]} rotation={[0, i > 1 ? Math.PI / 2 : 0, 0]}>
                    <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[1.5, 0.08, 0.5]} /><primitive object={SM.timber} attach="material" /></mesh>
                    <mesh position={[0, 0.25, -0.2]} castShadow><boxGeometry args={[1.5, 0.5, 0.08]} /><primitive object={SM.timber} attach="material" /></mesh>
                    {[-0.6, 0.6].map((lx, li) => (
                        <mesh key={li} position={[lx, 0.2, 0]} castShadow><boxGeometry args={[0.08, 0.4, 0.5]} /><primitive object={SM.black} attach="material" /></mesh>
                    ))}
                </group>
            ))}

            {/* === TREES === */}
            {[[-30, -55], [30, -60], [-30, 55], [30, 65], [-30, 0], [30, 20], [-30, 25]].map(([x, z], i) => (
                <group key={i} position={[x, 0, z]}>
                    <mesh position={[0, 2.5, 0]} castShadow><cylinderGeometry args={[0.3, 0.4, 5, 8]} /><primitive object={SM.timber} attach="material" /></mesh>
                    <mesh position={[0, 6, 0]} castShadow><sphereGeometry args={[2.5, 10, 8]} /><meshStandardMaterial color="#22c55e" roughness={0.85} /></mesh>
                </group>
            ))}

            {/* Magical Nighttime Fireflies for Village */}
            <Fireflies
                count={50}
                bounds={{ minX: -40, maxX: 40, minY: 0.5, maxY: 6, minZ: -70, maxZ: 70 }}
                color="#ffeb3b"
            />
        </group>
    );
};
