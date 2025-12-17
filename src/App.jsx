import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, usePlane, useSphere, useBox } from '@react-three/cannon';
import { OrbitControls, Stars, Sky, Html } from '@react-three/drei';
import { Joystick } from 'react-joystick-component';

// --- 設定値 ---
const HOOP_POS = [0, 3.05, -12]; // ゴールの位置

// --- コンポーネント: プレイヤーボール (操作可能) ---
function PlayerBall({ setBallPos }) {
  const [ref, api] = useSphere(() => ({
    mass: 1,
    position: [0, 2, 5], // スタート位置を手前に変更
    args: [0.24],
    restitution: 0.8,
    friction: 0.1,
    linearDamping: 0.5, // 操作をやめたら止まるように空気抵抗をつける
  }));

  // 操作状態の管理
  const [movement, setMovement] = useState({ x: 0, z: 0 });
  const [charging, setCharging] = useState(false);
  const [power, setPower] = useState(0);

  // キーボード操作の監視
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'w') setMovement(m => ({ ...m, z: -1 }));
      if (e.key === 's') setMovement(m => ({ ...m, z: 1 }));
      if (e.key === 'a') setMovement(m => ({ ...m, x: -1 }));
      if (e.key === 'd') setMovement(m => ({ ...m, x: 1 }));
      if (e.code === 'Space') setCharging(true);
    };
    const handleKeyUp = (e) => {
      if (['w', 's'].includes(e.key)) setMovement(m => ({ ...m, z: 0 }));
      if (['a', 'd'].includes(e.key)) setMovement(m => ({ ...m, x: 0 }));
      if (e.code === 'Space') handleShoot();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [power]);

  // スマホUIからの操作を受け取る関数（window経由で呼べるようにする簡易ハック）
  useEffect(() => {
    window.handleMobileMove = (val) => {
      setMovement({ x: val.x || 0, z: val.y ? -val.y : 0 }); // ジョイスティックのYは逆
    };
    window.handleMobileChargeStart = () => setCharging(true);
    window.handleMobileChargeEnd = () => handleShoot();
  }, [power]);

  // シュート処理
  const handleShoot = () => {
    setCharging(false);
    // パワーに応じたシュート (最大パワー制限あり)
    const shootPower = Math.min(power, 100) / 100; 
    
    // ゴール方向へのベクトル計算（簡易）
    // 本来は現在位置から計算するが、今回はシンプルに「奥へ飛ばす」
    const forwardForce = 5 + (shootPower * 10); // 奥への力
    const upForce = 5 + (shootPower * 8);       // 上への力

    if (shootPower > 0.1) {
      api.velocity.set(0, upForce, -forwardForce);
      api.angularVelocity.set(10, 0, 0); // バックスピン
      console.log(`Shoot! Power: ${shootPower}`);
    }
    setPower(0);
  };

  // 毎フレームの更新処理
  useFrame((state) => {
    // 1. 移動処理
    const speed = 10;
    // 既存の速度を維持しつつ、操作入力を加算
    if (movement.x !== 0 || movement.z !== 0) {
      api.applyForce([movement.x * speed, 0, movement.z * speed], [0, 0, 0]);
    }

    // 2. パワーチャージ処理
    if (charging) {
      setPower((prev) => Math.min(prev + 2, 100)); // 1フレームごとにパワー増加
    }

    // 3. カメラ追従（簡易的）
    // ボールの現在の位置を取得してカメラを少し後ろに移動させる
    // (ref.currentが取れる場合のみ)
    const pos = ref.current?.position;
    if(pos) {
        setBallPos([pos.x, pos.y, pos.z]);
    }
  });

  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[0.24, 32, 32]} />
      <meshStandardMaterial color="#e65100" />
      <mesh rotation={[0,0,0]}><torusGeometry args={[0.24, 0.005, 16, 32]} /><meshBasicMaterial color="black"/></mesh>
      
      {/* 頭上のパワーメーター */}
      {charging && (
        <Html position={[0, 0.8, 0]} center>
          <div style={{
            width: '60px', 
            height: '10px', 
            border: '1px solid white', 
            background: 'rgba(0,0,0,0.5)'
          }}>
            <div style={{
              width: `${power}%`, 
              height: '100%', 
              background: power > 80 ? 'red' : 'limegreen'
            }} />
          </div>
        </Html>
      )}
    </mesh>
  );
}

// --- その他の環境コンポーネント（前回と同じ） ---
function Hoop() {
  const [boardRef] = useBox(() => ({ type: 'Static', position: [0, 3.5, -12], args: [1.8, 1.05, 0.1] }));
  const RIM_RADIUS = 0.45 / 2;
  const segmentCount = 16;
  const positions = [];
  for (let i = 0; i < segmentCount; i++) {
    const angle = (i / segmentCount) * Math.PI * 2;
    positions.push([Math.cos(angle) * RIM_RADIUS, 0, Math.sin(angle) * RIM_RADIUS]);
  }

  return (
    <group>
      <mesh ref={boardRef} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.05, 0.1]} />
        <meshStandardMaterial color="white" />
        <mesh position={[0, -0.35, 0.06]}><boxGeometry args={[0.59, 0.45, 0.01]} /><meshBasicMaterial color="red" /></mesh>
      </mesh>
      <mesh position={[0, 3.05, -11.6]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RIM_RADIUS, 0.02, 16, 32]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      {positions.map((pos, i) => <RimSegment key={i} position={[pos[0], 3.05, -11.6 + pos[2]]} />)}
    </group>
  );
}
function RimSegment({ position }) { useBox(() => ({ type: 'Static', position, args: [0.05, 0.05, 0.05] })); return null; }
function Court() {
  const [ref] = usePlane(() => ({ rotation: [-Math.PI / 2, 0, 0], position: [0, 0, 0], material: { friction: 0.1 } }));
  return (
    <mesh ref={ref} receiveShadow>
      <planeGeometry args={[15, 28]} />
      <meshStandardMaterial color="#d2b48c" />
      <mesh position={[0, 0.01, -9]} rotation={[-Math.PI / 2, 0, 0]}>
         <ringGeometry args={[6.75, 6.85, 64, 1, 0, Math.PI]} />
         <meshBasicMaterial color="white" />
      </mesh>
    </mesh>
  );
}

// --- メインUIとアプリ構成 ---
export default function App() {
  // カメラ制御用ステート
  const [ballPos, setBallPos] = useState([0, 2, 5]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#111', overflow: 'hidden' }}>
      <Canvas shadows camera={{ position: [0, 8, 15], fov: 60 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 20, 10]} intensity={1} castShadow />
        <Sky sunPosition={[100, 20, 100]} />
        <Physics gravity={[0, -9.8, 0]}>
          <Court />
          <Hoop />
          <PlayerBall setBallPos={setBallPos} />
        </Physics>
        {/* カメラはボールの方を向き続けるが、位置は固定（酔い防止のため今は固定） */}
        <OrbitControls target={[0, 2, -5]} />
      </Canvas>
      
      {/* --- UIレイヤー (スマホ操作用) --- */}
      <div style={{ position: 'absolute', bottom: 30, left: 30, zIndex: 10 }}>
        <Joystick 
          size={100} 
          baseColor="rgba(255, 255, 255, 0.3)" 
          stickColor="rgba(255, 255, 255, 0.8)"
          move={(e) => window.handleMobileMove && window.handleMobileMove(e)} 
          stop={() => window.handleMobileMove && window.handleMobileMove({x:0, y:0})}
        />
      </div>

      <div style={{ position: 'absolute', bottom: 50, right: 30, zIndex: 10 }}>
        <button 
          style={{
            width: '80px', height: '80px', borderRadius: '50%', 
            border: 'none', background: 'rgba(255, 100, 0, 0.8)', 
            color: 'white', fontWeight: 'bold', fontSize: '16px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
          }}
          onMouseDown={() => window.handleMobileChargeStart && window.handleMobileChargeStart()}
          onMouseUp={() => window.handleMobileChargeEnd && window.handleMobileChargeEnd()}
          onTouchStart={(e) => { e.preventDefault(); window.handleMobileChargeStart && window.handleMobileChargeStart() }}
          onTouchEnd={(e) => { e.preventDefault(); window.handleMobileChargeEnd && window.handleMobileChargeEnd() }}
        >
          SHOOT
        </button>
      </div>

      <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', pointerEvents: 'none' }}>
        <h3>Phase 3: Dribble & Shot Meter</h3>
        <p>PC: [WASD] to Move, [Space] Hold/Release to Shoot</p>
        <p>Mobile: Left Stick to Move, Right Button to Shoot</p>
      </div>
    </div>
  );
}