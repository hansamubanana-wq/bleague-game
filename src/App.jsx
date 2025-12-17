import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, usePlane, useSphere, useBox } from '@react-three/cannon';
import { OrbitControls, Stars, Sky } from '@react-three/drei';

// --- 設定値（リアルなスケール） ---
const BALL_RADIUS = 0.24; // バスケボールの半径 (m)
const HOOP_HEIGHT = 3.05; // リングの高さ (m)
const RIM_RADIUS = 0.45 / 2; // リングの半径 (m)

// --- コンポーネント: ボール ---
function Ball({ position }) {
  const [ref, api] = useSphere(() => ({
    mass: 0.6, // ボールの重さ 600g
    position: position,
    args: [BALL_RADIUS],
    restitution: 0.7, // 跳ね返り係数
    friction: 0.5,
  }));

  return (
    <mesh
      ref={ref}
      onClick={() => {
        // シュート！斜め上に力を加える
        api.velocity.set(0, 8, -6);
        api.angularVelocity.set(5, 0, 0); // バックスピン
      }}
      castShadow
    >
      <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
      <meshStandardMaterial color="#e65100" roughness={0.4} />
      {/* ボールのライン（装飾） */}
      <mesh rotation={[0, 0, 0]}>
         <torusGeometry args={[BALL_RADIUS, 0.01, 16, 32]} />
         <meshBasicMaterial color="black" />
      </mesh>
    </mesh>
  );
}

// --- コンポーネント: ゴール（リング + バックボード + 支柱） ---
function Hoop() {
  // 1. バックボード（物理）
  const [boardRef] = useBox(() => ({
    type: 'Static',
    position: [0, 3.5, -12], // コート端に配置
    args: [1.8, 1.05, 0.1], // 公式サイズに近い板
  }));

  // 2. リングの物理判定（重要：ボールが通るように「小さな箱」を円状に並べる）
  const segmentCount = 16;
  const positions = [];
  for (let i = 0; i < segmentCount; i++) {
    const angle = (i / segmentCount) * Math.PI * 2;
    const x = Math.cos(angle) * RIM_RADIUS;
    const z = Math.sin(angle) * RIM_RADIUS;
    positions.push([x, 0, z]);
  }

  return (
    <group>
      {/* バックボード可視化 */}
      <mesh ref={boardRef} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.05, 0.1]} />
        <meshStandardMaterial color="white" />
        {/* ボードの枠線 */}
        <mesh position={[0, -0.35, 0.06]}>
             <boxGeometry args={[0.59, 0.45, 0.01]} />
             <meshBasicMaterial color="red" />
        </mesh>
      </mesh>

      {/* リング（見た目） */}
      <mesh position={[0, HOOP_HEIGHT, -11.6]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RIM_RADIUS, 0.02, 16, 32]} />
        <meshStandardMaterial color="orange" />
      </mesh>

      {/* リング（物理判定）：見えない箱をリング状に配置 */}
      {positions.map((pos, i) => (
        <RimSegment key={i} position={[pos[0], HOOP_HEIGHT, -11.6 + pos[2]]} />
      ))}

      {/* 支柱（見た目だけ） */}
      <mesh position={[0, 1.75, -12.5]}>
        <cylinderGeometry args={[0.1, 0.1, 3.5]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  );
}

// リングを構成する小さな物理壁（見えない）
function RimSegment({ position }) {
  useBox(() => ({
    type: 'Static',
    position: position,
    args: [0.05, 0.05, 0.05], // 小さなブロック
  }));
  return null;
}

// --- コンポーネント: コート ---
function Court() {
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
    material: { friction: 0.1 } 
  }));

  return (
    <mesh ref={ref} receiveShadow>
      <planeGeometry args={[15, 28]} /> {/* Bリーグ/FIBA規定に近い比率 */}
      <meshStandardMaterial color="#d2b48c" />
      
      {/* センターサークル */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
         <ringGeometry args={[1.7, 1.8, 64]} />
         <meshBasicMaterial color="white" />
      </mesh>
      
      {/* 3ポイントライン（簡易） */}
      <mesh position={[0, 0.01, -9]} rotation={[-Math.PI / 2, 0, 0]}>
         <ringGeometry args={[6.75, 6.85, 64, 1, 0, Math.PI]} />
         <meshBasicMaterial color="white" />
      </mesh>
    </mesh>
  );
}

// --- メインアプリ ---
export default function App() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#111' }}>
      <Canvas shadows camera={{ position: [0, 5, 10], fov: 60 }}>
        {/* 照明と空 */}
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 20, 10]} intensity={1} castShadow />
        <Sky sunPosition={[100, 20, 100]} />

        <Physics gravity={[0, -9.8, 0]}>
          <Court />
          <Hoop />
          {/* ボールをフリースローライン付近に配置 */}
          <Ball position={[0, 2, -5]} />
        </Physics>

        <OrbitControls target={[0, 3, -12]} />
      </Canvas>
      
      <div style={{ position: 'absolute', bottom: 30, left: 30, color: 'white' }}>
        <h2>Phase 2: Shoot Practice</h2>
        <p>ボールをタップしてシュート！</p>
        <p>視点はドラッグで移動可能</p>
      </div>
    </div>
  );
}