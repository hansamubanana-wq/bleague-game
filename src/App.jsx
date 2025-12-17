import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, usePlane, useSphere } from '@react-three/cannon';
import { OrbitControls, Stars } from '@react-three/drei';

// --- コンポーネント: ボール ---
function Ball({ position }) {
  // 物理演算（球体）の設定
  const [ref, api] = useSphere(() => ({
    mass: 1, // 重さ
    position: position,
    args: [0.5], // 半径
    restitution: 0.8, // 跳ね返り係数（よく跳ねる）
  }));

  return (
    <mesh
      ref={ref}
      onClick={() => {
        // クリック/タップしたら上方向に力を加える（シュートの基礎）
        api.velocity.set(0, 10, 0);
      }}
      castShadow
    >
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial color="orange" roughness={0.4} />
    </mesh>
  );
}

// --- コンポーネント: コート（床） ---
function Court() {
  // 物理演算（平面）の設定
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0], // 横倒しにする
    position: [0, 0, 0],
    material: { friction: 0.1 } // 摩擦
  }));

  return (
    <mesh ref={ref} receiveShadow>
      <planeGeometry args={[30, 15]} /> {/* バスケットコートに近い比率 */}
      <meshStandardMaterial color="#d2b48c" /> {/* 木目っぽい色 */}
      {/* 簡易的なライン描画（白いメッシュを重ねる） */}
      <mesh position={[0, 0.01, 0]} rotation={[0, 0, 0]}>
         <ringGeometry args={[1.0, 1.1, 32]} />
         <meshBasicMaterial color="white" />
      </mesh>
    </mesh>
  );
}

// --- メインアプリ ---
export default function App() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      {/* 3Dキャンバスの設定 */}
      <Canvas shadows camera={{ position: [0, 10, 20], fov: 50 }}>
        <color attach="background" args={['#202020']} />
        
        {/* 環境設定 */}
        <ambientLight intensity={0.5} />
        <spotLight 
          position={[10, 20, 10]} 
          angle={0.3} 
          penumbra={1} 
          intensity={1} 
          castShadow 
        />
        <Stars />

        {/* 物理演算の世界 */}
        <Physics>
          <Court />
          <Ball position={[0, 5, 0]} />
        </Physics>

        {/* カメラ操作（開発用：マウスでぐりぐり動かせる） */}
        <OrbitControls />
      </Canvas>
      
      {/* UIレイヤー */}
      <div style={{
        position: 'absolute', 
        top: 20, 
        left: 20, 
        color: 'white', 
        pointerEvents: 'none'
      }}>
        <h1>B-LEAGUE GAME DEV</h1>
        <p>Phase 1: Physics Test</p>
        <p>ボールをタップすると跳ねます</p>
      </div>
    </div>
  );
}