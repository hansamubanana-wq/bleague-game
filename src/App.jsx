import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, usePlane, useSphere, useBox, useCylinder } from '@react-three/cannon';
import { OrbitControls, Stars, Sky, Html } from '@react-three/drei';
import { Joystick } from 'react-joystick-component';
import confetti from 'canvas-confetti';

// --- 設定値 ---
const BALL_START_POS = [0, 2, 6]; // スタート位置
const HOOP_POS = [0, 3.05, -12];  // ゴール位置

// --- コンポーネント: プレイヤーボール ---
function PlayerBall({ setBallPos, isResetting }) {
  const [ref, api] = useSphere(() => ({
    mass: 1,
    position: BALL_START_POS,
    args: [0.24],
    restitution: 0.8,
    friction: 0.1,
    linearDamping: 0.5,
  }));

  const [movement, setMovement] = useState({ x: 0, z: 0 });
  const [charging, setCharging] = useState(false);
  const [power, setPower] = useState(0);

  // リセット信号を受け取ったら位置を戻す
  useEffect(() => {
    if (isResetting) {
      api.position.set(...BALL_START_POS);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
    }
  }, [isResetting]);

  // キーボード操作
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

  // スマホ操作連携
  useEffect(() => {
    window.handleMobileMove = (val) => {
      setMovement({ x: val.x || 0, z: val.y ? -val.y : 0 });
    };
    window.handleMobileChargeStart = () => setCharging(true);
    window.handleMobileChargeEnd = () => handleShoot();
  }, [power]);

  const handleShoot = () => {
    setCharging(false);
    const shootPower = Math.min(power, 100) / 100; 
    const forwardForce = 5 + (shootPower * 12);
    const upForce = 5 + (shootPower * 9);

    if (shootPower > 0.1) {
      api.velocity.set(0, upForce, -forwardForce);
      api.angularVelocity.set(10, 0, 0);
    }
    setPower(0);
  };

  useFrame(() => {
    if (movement.x !== 0 || movement.z !== 0) {
      const speed = 10;
      api.applyForce([movement.x * speed, 0, movement.z * speed], [0, 0, 0]);
    }
    if (charging) {
      setPower((prev) => Math.min(prev + 2, 100));
    }
    // カメラ追従用座標更新
    const pos = ref.current?.position;
    if(pos) setBallPos([pos.x, pos.y, pos.z]);
  });

  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[0.24, 32, 32]} />
      <meshStandardMaterial color="#e65100" roughness={0.4} />
      <mesh rotation={[0,0,0]}><torusGeometry args={[0.24, 0.005, 16, 32]} /><meshBasicMaterial color="black"/></mesh>
      
      {charging && (
        <Html position={[0, 0.8, 0]} center>
          <div style={{ width: '60px', height: '10px', border: '1px solid white', background: 'rgba(0,0,0,0.5)' }}>
            <div style={{ width: `${power}%`, height: '100%', background: power > 80 ? 'red' : 'limegreen' }} />
          </div>
        </Html>
      )}
    </mesh>
  );
}

// --- ゴール判定用センサー ---
function NetSensor({ onScore }) {
  // リングの少し下に「見えない円柱」を配置し、触れたらゴールとみなす
  const [ref] = useCylinder(() => ({
    isTrigger: true, // 物理衝突せず、通り抜ける
    args: [0.2, 0.2, 0.1, 8], // 半径, 半径, 高さ, 分割
    position: [0, 2.9, -11.6], // リングの真下
    onCollide: (e) => {
      // ボールだけを感知
      if (e.body.name !== 'sensor') {
        onScore();
      }
    }
  }));
  return null; // 見えないので描画なし
}

// --- コンポーネント: ゴール ---
function Hoop({ onScore }) {
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
      <NetSensor onScore={onScore} />
      
      <mesh ref={boardRef} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.05, 0.1]} />
        <meshStandardMaterial color="white" />
        <mesh position={[0, -0.35, 0.06]}><boxGeometry args={[0.59, 0.45, 0.01]} /><meshBasicMaterial color="red" /></mesh>
      </mesh>
      
      {/* リング（見た目） */}
      <mesh position={[0, 3.05, -11.6]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RIM_RADIUS, 0.02, 16, 32]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      
      {/* リング（物理） */}
      {positions.map((pos, i) => <RimSegment key={i} position={[pos[0], 3.05, -11.6 + pos[2]]} />)}
      
      {/* 支柱 */}
      <mesh position={[0, 1.75, -12.5]}>
        <cylinderGeometry args={[0.1, 0.1, 3.5]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  );
}
function RimSegment({ position }) { useBox(() => ({ type: 'Static', position, args: [0.05, 0.05, 0.05] })); return null; }

// --- コンポーネント: コート（修正版） ---
function Court() {
  // 物理演算用の床
  usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
    material: { friction: 0.1 }
  }));

  return (
    <group>
      {/* 見た目用の床 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[15, 28]} />
        <meshStandardMaterial color="#d2b48c" />
      </mesh>
      
      {/* 修正ポイント: ラインを y=0.01 に浮かせて表示 */}
      {/* 3ポイントライン */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -7]}>
         <ringGeometry args={[6.75, 6.85, 64, 1, Math.PI, Math.PI]} />
         <meshBasicMaterial color="white" side={2} />
      </mesh>
      
      {/* キー（制限区域） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -9.1]}>
         <planeGeometry args={[4.9, 5.8]} />
         <meshBasicMaterial color="#a0522d" />{/* ペイントエリアの色 */}
      </mesh>
      
      {/* センターサークル */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
         <ringGeometry args={[1.7, 1.8, 64]} />
         <meshBasicMaterial color="white" />
      </mesh>
    </group>
  );
}

// --- メインアプリ ---
export default function App() {
  const [ballPos, setBallPos] = useState(BALL_START_POS);
  const [score, setScore] = useState(0);
  const [showGoalEffect, setShowGoalEffect] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const lastScoreTime = useRef(0); // 連続ゴール防止用

  // ゴール時の処理
  const handleScore = () => {
    const now = Date.now();
    if (now - lastScoreTime.current < 2000) return; // 2秒以内の連続検知は無視
    lastScoreTime.current = now;

    // スコア加算
    setScore(s => s + 2);
    setShowGoalEffect(true);

    // 紙吹雪エフェクト発動！
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#ff0000', '#ffffff', '#000000'] // Bリーグっぽい色
    });

    // 2秒後に演出を消してボールをリセット
    setTimeout(() => {
      setShowGoalEffect(false);
      setIsResetting(true);
      setTimeout(() => setIsResetting(false), 100); // フラグを戻す
    }, 2000);
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#111', overflow: 'hidden' }}>
      <Canvas shadows camera={{ position: [0, 8, 15], fov: 60 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 20, 10]} intensity={1} castShadow />
        <Sky sunPosition={[100, 20, 100]} />
        <Physics gravity={[0, -9.8, 0]}>
          <Court />
          <Hoop onScore={handleScore} />
          <PlayerBall setBallPos={setBallPos} isResetting={isResetting} />
        </Physics>
        <OrbitControls target={[0, 2, -5]} />
      </Canvas>
      
      {/* UI: スコアボード */}
      <div style={{
        position: 'absolute', top: 20, width: '100%', textAlign: 'center',
        pointerEvents: 'none', color: 'white', textShadow: '2px 2px 0 #000'
      }}>
        <h1 style={{ fontSize: '4rem', margin: 0, fontFamily: 'Impact, sans-serif' }}>
          {score} <span style={{ fontSize: '1.5rem' }}>PTS</span>
        </h1>
      </div>

      {/* UI: ゴール演出 */}
      {showGoalEffect && (
        <div style={{
          position: 'absolute', top: '40%', width: '100%', textAlign: 'center',
          pointerEvents: 'none', color: '#ffd700', textShadow: '0 0 20px orange',
          animation: 'pop 0.5s ease-out'
        }}>
          <h1 style={{ fontSize: '6rem', margin: 0, fontWeight: '900', fontStyle: 'italic' }}>GOAL!!</h1>
        </div>
      )}
      
      {/* UI: スマホ操作 */}
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
            border: 'none', background: 'linear-gradient(135deg, #ff6b00, #ff4500)', 
            color: 'white', fontWeight: 'bold', fontSize: '16px',
            boxShadow: '0 4px 15px rgba(255, 69, 0, 0.6)'
          }}
          onMouseDown={() => window.handleMobileChargeStart && window.handleMobileChargeStart()}
          onMouseUp={() => window.handleMobileChargeEnd && window.handleMobileChargeEnd()}
          onTouchStart={(e) => { e.preventDefault(); window.handleMobileChargeStart && window.handleMobileChargeStart() }}
          onTouchEnd={(e) => { e.preventDefault(); window.handleMobileChargeEnd && window.handleMobileChargeEnd() }}
        >
          SHOOT
        </button>
      </div>
    </div>
  );
}