import React from 'react';

interface FairytaleCastleProps {
    position?: [number, number, number];
    scale?: number;
    rotation?: [number, number, number];
}

export const FairytaleCastle: React.FC<FairytaleCastleProps> = React.memo(
    ({
        position = [0, 0, 0] as [number, number, number],
        scale = 1,
        rotation = [0, 0, 0] as [number, number, number]
    }) => {
        // Neuschwanstein Palette
        const colors = {
            walls: '#e8e6e1', // Off-white limestone
            roofs: '#2b5a75', // Deep blue slate
            trim: '#c5a582', // Decorative sandstone trim
            rock: '#5d5d5d', // Grey mountain rock
            gold: '#ffd700', // Spires
        };

        return (
            <group position={position} scale={scale} rotation={rotation}>
                {/* ==================== BASE MOUNTAIN ==================== */}
                <mesh position={[0, -10, 0]} receiveShadow>
                    <cylinderGeometry args={[18, 25, 30, 7]} />
                    <meshStandardMaterial
                        color={colors.rock}
                        roughness={0.9}
                        flatShading
                    />
                </mesh>

                {/* ==================== MAIN KEEP (PALLAS) ==================== */}
                <group position={[2, 5, -2]}>
                    {/* Main Body */}
                    <mesh position={[0, 8, 0]} castShadow receiveShadow>
                        <boxGeometry args={[12, 16, 8]} />
                        <meshStandardMaterial color={colors.walls} roughness={0.6} />
                    </mesh>
                    {/* Roof */}
                    <mesh position={[0, 20, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                        <coneGeometry args={[9, 8, 4]} /> {/* Pyramidal roof */}
                        <meshStandardMaterial color={colors.roofs} roughness={0.7} />
                    </mesh>
                    {/* Windows */}
                    {[-1, 0, 1].map((y) => (
                        <group key={y} position={[0, 4 + y * 4, 4.1]}>
                            {[-3, 0, 3].map((x) => (
                                <mesh key={x} position={[x, 0, 0]}>
                                    <planeGeometry args={[1.2, 2]} />
                                    <meshStandardMaterial color="#2a2a2a" roughness={0.2} metalness={0.5} />
                                </mesh>
                            ))}
                        </group>
                    ))}
                </group>

                {/* ==================== TALL WATCHTOWER ==================== */}
                <group position={[-8, 5, 4]}>
                    {/* Tower Base */}
                    <mesh position={[0, 12, 0]} castShadow receiveShadow>
                        <cylinderGeometry args={[2.5, 3, 24, 8]} />
                        <meshStandardMaterial color={colors.walls} roughness={0.6} />
                    </mesh>
                    {/* Corbeling / Overhang */}
                    <mesh position={[0, 24, 0]} castShadow>
                        <cylinderGeometry args={[3.2, 2.5, 1, 8]} />
                        <meshStandardMaterial color={colors.trim} roughness={0.7} />
                    </mesh>
                    {/* Spire Roof */}
                    <mesh position={[0, 29, 0]} castShadow>
                        <coneGeometry args={[3.5, 12, 8]} />
                        <meshStandardMaterial color={colors.roofs} roughness={0.5} />
                    </mesh>
                    {/* Finial */}
                    <mesh position={[0, 35, 0]}>
                        <sphereGeometry args={[0.5]} />
                        <meshStandardMaterial color={colors.gold} metalness={0.8} roughness={0.2} />
                    </mesh>
                </group>

                {/* ==================== CURTAIN WALL (Gatehouse to Tower) ==================== */}
                {/* Diagonal wall connecting the gatehouse to the tall watchtower */}
                <group position={[-1, 5, 6]} rotation={[0, Math.atan2(4, 14) - Math.PI / 6, 0]}>
                    {/* Main wall section */}
                    <mesh position={[0, 2, 0]} castShadow receiveShadow>
                        <boxGeometry args={[15, 5, 1.5]} />
                        <meshStandardMaterial color={colors.walls} roughness={0.6} />
                    </mesh>
                    {/* Battlements / Crenellations - positioned along wall top */}
                    {[-6, -3, 0, 3, 6].map((x, i) => (
                        <mesh key={i} position={[x, 5.25, 0]} castShadow>
                            <boxGeometry args={[1.5, 1.5, 1.5]} />
                            <meshStandardMaterial color={colors.walls} roughness={0.6} />
                        </mesh>
                    ))}
                </group>

                {/* ==================== GATEHOUSE ==================== */}
                <group position={[6, 2, 8]}>
                    {/* Left Turret */}
                    <mesh position={[-3, 6, 0]} castShadow>
                        <cylinderGeometry args={[1.5, 1.8, 12, 8]} />
                        <meshStandardMaterial color={colors.walls} roughness={0.6} />
                    </mesh>
                    <mesh position={[-3, 13, 0]} castShadow>
                        <coneGeometry args={[2, 5, 8]} />
                        <meshStandardMaterial color={colors.roofs} roughness={0.5} />
                    </mesh>

                    {/* Right Turret */}
                    <mesh position={[3, 6, 0]} castShadow>
                        <cylinderGeometry args={[1.5, 1.8, 12, 8]} />
                        <meshStandardMaterial color={colors.walls} roughness={0.6} />
                    </mesh>
                    <mesh position={[3, 13, 0]} castShadow>
                        <coneGeometry args={[2, 5, 8]} />
                        <meshStandardMaterial color={colors.roofs} roughness={0.5} />
                    </mesh>

                    {/* Archway */}
                    <mesh position={[0, 5, 0]} castShadow>
                        <boxGeometry args={[4, 8, 2]} />
                        <meshStandardMaterial color={colors.walls} roughness={0.6} />
                    </mesh>
                    <mesh position={[0, 3, 1.1]}>
                        <circleGeometry args={[1.5, 32, 0, Math.PI]} />
                        <meshStandardMaterial color="#1a1a1a" />
                    </mesh>
                </group>

                {/* ==================== GRAND STAIRCASE ==================== */}
                {/* Stone steps leading up from ground level to the gatehouse */}
                <group position={[6, -5, 18]}>
                    {/* Generate 20 steps going down from castle to ground */}
                    {Array.from({ length: 20 }, (_, i) => (
                        <mesh
                            key={i}
                            position={[0, -i * 0.8, i * 1.2]}
                            castShadow
                            receiveShadow
                        >
                            <boxGeometry args={[5, 0.6, 1]} />
                            <meshStandardMaterial
                                color={i % 2 === 0 ? '#a0a0a0' : '#909090'}
                                roughness={0.8}
                            />
                        </mesh>
                    ))}
                    {/* Side walls / railings */}
                    <mesh position={[-2.8, -8, 12]} castShadow>
                        <boxGeometry args={[0.4, 2, 25]} />
                        <meshStandardMaterial color={colors.rock} roughness={0.9} />
                    </mesh>
                    <mesh position={[2.8, -8, 12]} castShadow>
                        <boxGeometry args={[0.4, 2, 25]} />
                        <meshStandardMaterial color={colors.rock} roughness={0.9} />
                    </mesh>
                </group>

                {/* ==================== SIDE HALL ==================== */}
                <group position={[-6, 3, -6]}>
                    <mesh position={[0, 6, 0]} castShadow>
                        <boxGeometry args={[10, 12, 6]} />
                        <meshStandardMaterial color={colors.walls} roughness={0.6} />
                    </mesh>
                    {/* Roof - rotated to lay flat as peaked roof (flipped right-side up) */}
                    <mesh position={[0, 14.5, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} castShadow>
                        <cylinderGeometry args={[4, 4, 10, 3]} />
                        <meshStandardMaterial color={colors.roofs} roughness={0.7} />
                    </mesh>
                </group>

                {/* ==================== SMALL TURRETS (Decor) ==================== */}
                {([
                    [-8, 5, -8],
                    [8, 5, -8],
                    [10, 10, 6]
                ] as [number, number, number][]).map((pos, i) => (
                    <group key={i} position={pos}>
                        <mesh position={[0, 3, 0]} castShadow>
                            <cylinderGeometry args={[1, 1, 6, 8]} />
                            <meshStandardMaterial color={colors.walls} roughness={0.6} />
                        </mesh>
                        <mesh position={[0, 7, 0]} castShadow>
                            <coneGeometry args={[1.4, 4, 8]} />
                            <meshStandardMaterial color={colors.roofs} roughness={0.5} />
                        </mesh>
                    </group>
                ))}
            </group>
        );
    }
);
