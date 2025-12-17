import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, usePlane, useSphere, useBox, useCylinder } from '@react-three/cannon';
import { OrbitControls, Stars, Sky, Html, Float } from '@react-three/drei';
import { Joystick } from 'react-joystick-component';
import confetti from 'canvas-confetti';
import * as THREE from 'three';

// --- 設定値（アーケードライクな調整） ---
const BALL_RADIUS = 0.14; // リアルより少しだけ大きくして視認性確保（穴には入る）
const HOOP_RADIUS = 0.35; // リングを少し広げて入れやすくする
const BALL_START_POS = [0, 2, 6];

// --- 音声シンセサイザー（外部ファイル不要で音を鳴らす） ---
const playSound = (type) => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  if (type === 'shoot') {
    // シュート音：高い音から低い音へ（ヒュッ）
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'goal') {
    // ゴール音：和音っぽいキラキラ音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
    // 重低音バスドラム
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.setValueAtTime(150, now);
    osc2.frequency.exponentialRampToValueAtTime(0.01, now + 0.5);
    gain2.gain.setValueAtTime(0.8, now);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc2.start(now);
    osc2.stop(now + 0.5);
  }
};

// --- パーティクルシステム（炎のエフェクト） ---
function FireParticles({ position }) {
  const count = 50;
  const mesh = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    return new Array(count).fill(0).map(() => ({
      position: [Math.random() - 0.5, Math.random() * 2, Math.random() - 0.5],
      speed: Math.random() * 0.05 + 0.02,
      offset: Math.random() * 100
    }));
  }, []);

  useFrame((state) => {
    particles.forEach((particle, i) => {
      let { position, speed, offset } = particle;
      // 上昇アニメーション
      position[1] += speed;
      if (position[1] > 2) position[1] = 0; // ループ
      
      dummy.position.set(
        position[0] * 0.5 + Math.sin(state.clock.elapsedTime + offset) * 0.1,
        position[1],
        position[2] * 0.5 + Math.cos(state.clock.elapsedTime + offset) * 0.1
      );
      dummy.scale.setScalar(Math.max(0, 1 - position[1] / 2)); // 上に行くほど小さく
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, count]} position={position}>
      <planeGeometry args={[0.2, 0.2]} />
      <meshBasicMaterial color="#00ffff" blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={0.6} />
    </instancedMesh>
  );
}

// --- プレイヤーボール ---
function PlayerBall({ setBallPos, isResetting, setCameraTarget }) {
  const [ref, api] = useSphere(() => ({
    mass: 1,
    position: BALL_START_POS,
    args: [BALL_RADIUS],
    restitution: 0.7, // 少し弾みにくくして制御しやすく
    friction: 0.2,
    linearDamping: 0.1,
    angularDamping: 0.5,
  }));

  const [movement, setMovement] = useState({ x: 0, z: 0 });
  const [charging, setCharging] = useState(false);
  const [power, setPower] = useState(0);
  const isShooting = useRef(false);

  useEffect(() => {
    if (isResetting) {
      api.position.set(...BALL_START_POS);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
      isShooting.current = false;
      setCameraTarget(null); // カメラリセット
    }
  }, [isResetting]);

  useEffect(() => {
    window.handleMobileMove = (val) => setMovement({ x: val.x || 0, z: val.y ? -val.y : 0 });
    window.handleMobileChargeStart = () => setCharging(true);
    window.handleMobileChargeEnd = () => handleShoot();
  }, [power]);

  const handleShoot = () => {
    setCharging(false);
    const shootPower = Math.min(power, 100) / 100;
    
    if (shootPower > 0.1) {
      playSound('shoot'); // 音を鳴らす
      isShooting.current = true;
      setCameraTarget(ref); // カメラをボール追従モードに

      // 物理演算：斜め上への爆発的な力
      const forwardForce = 3 + (shootPower * 11); // 前への力（調整済み）
      const upForce = 5 + (shootPower * 8);       // 上への力
      
      api.velocity.set(0, upForce, -forwardForce);
      api.angularVelocity.set(15, 0, 0); // 強烈なバックスピン
    }
    setPower(0);
  };

  useFrame(() => {
    // シュートしていない時だけ移動可能
    if (!isShooting.current) {
      if (movement.x !== 0 || movement.z !== 0) {
        const speed = 15;
        api.applyForce([movement.x * speed, 0, movement.z * speed], [0, 0, 0]);
      }
      // 強制的に地面近くに留める（ドリブル感）
      // api.position.subscribe(p => { if(p[1] > 2) api.position.set(p[0], 2, p[2]) }); 
    }

    if (charging) setPower(p => Math.min(p + 2.5, 100)); // チャージ速度アップ
    
    const pos = ref.current?.position;
    if(pos) setBallPos([pos.x, pos.y, pos.z]);
  });

  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
      <meshStandardMaterial color="#e65100" roughness={0.2} metalness={0.1} />
      <mesh rotation={[0,0,0]}><torusGeometry args={[BALL_RADIUS, 0.008, 16, 32]} /><meshBasicMaterial color="black"/></mesh>
      
      {charging && (
        <Html position={[0, 0.5, 0]} center>
           <div style={{
             width: '80px', height: '12px', border: '2px solid white', 
             borderRadius: '6px', background: 'rgba(0,0,0,0.6)', overflow: 'hidden'
           }}>
             <div style={{
               width: `${power}%`, height: '100%', 
               background: `linear-gradient(90deg, limegreen, yellow, red)`,
               transition: 'width 0.05s linear'
             }} />
           </div>
           {power > 90 && <div style={{color:'red', fontWeight:'bold', fontSize:'12px', textAlign:'center'}}>MAX!</div>}
        </Html>
      )}
    </mesh>
  );
}

// --- センサー＆ゴール ---
function Hoop({ onScore, isOnFire }) {
  const [boardRef] = useBox(() => ({ type: 'Static', position: [0, 3.5, -12], args: [1.8, 1.05, 0.1] }));
  
  // センサー：リングの少し下
  useCylinder(() => ({
    isTrigger: true, args: [0.25, 0.25, 0.1, 8], position: [0, 2.8, -11.6],
    onCollide: (e) => { if (e.body.name !== 'sensor') onScore(); }
  }));

  // リングの物理衝突（16個のブロックで円を作る）
  const segmentCount = 16;
  const positions = [];
  for (let i = 0; i < segmentCount; i++) {
    const angle = (i / segmentCount) * Math.PI * 2;
    positions.push([Math.cos(angle) * HOOP_RADIUS, 0, Math.sin(angle) * HOOP_RADIUS]);
  }

  return (
    <group>
      {/* 燃える演出 */}
      {isOnFire && <FireParticles position={[0, 3.05, -11.6]} />}

      <mesh ref={boardRef} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.05, 0.1]} />
        <meshStandardMaterial color={isOnFire ? "#333" : "white"} />
        <mesh position={[0, -0.35, 0.06]}><boxGeometry args={[0.59, 0.45, 0.01]} /><meshBasicMaterial color={isOnFire ? "#00ffff" : "red"} /></mesh>
      </mesh>
      
      {/* リング見た目 */}
      <mesh position={[0, 3.05, -11.6]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[HOOP_RADIUS, 0.02, 16, 32]} />
        <meshStandardMaterial color={isOnFire ? "#00ffff" : "orange"} emissive={isOnFire ? "#00aaaa" : "black"} />
      </mesh>

      {/* リング物理壁 */}
      {positions.map((pos, i) => <RimSegment key={i} position={[pos[0], 3.05, -11.6 + pos[2]]} />)}
      
      {/* 支柱 */}
      <mesh position={[0, 1.75, -12.5]}>
        <cylinderGeometry args={[0.15, 0.15, 3.5]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}
function RimSegment({ position }) { useBox(() => ({ type: 'Static', position, args: [0.05, 0.05, 0.05] })); return null; }

// --- コート ---
function Court() {
  usePlane(() => ({ rotation: [-Math.PI / 2, 0, 0], position: [0, 0, 0], material: { friction: 0.1 } }));
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[15, 28]} />
        <meshStandardMaterial color="#e0c090" />
      </mesh>
      {/* ライン（浮かせ処理済み） */}
      <group position={[0, 0.01, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -7]}>
           <ringGeometry args={[6.75, 6.85, 64, 1, Math.PI, Math.PI]} />
           <meshBasicMaterial color="white" side={2} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -9.1]}>
           <planeGeometry args={[4.9, 5.8]} />
           <meshBasicMaterial color="#a03000" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
           <ringGeometry args={[1.7, 1.8, 64]} />
           <meshBasicMaterial color="white" />
        </mesh>
      </group>
    </group>
  );
}

// --- カメラ制御 ---
function CameraController({ target }) {
  useFrame((state) => {
    if (target && target.current) {
      // ターゲット（ボール）を追う
      const t = target.current.position;
      state.camera.lookAt(t.x, t.y, t.z);
      // カメラ位置も少し近づける（簡易的）
      state.camera.position.lerp(new THREE.Vector3(t.x, t.y + 3, t.z + 6), 0.05);
    } else {
      // 通常時
      state.camera.position.lerp(new THREE.Vector3(0, 8, 15), 0.05);
      state.camera.lookAt(0, 2, -5);
    }
  });
  return null;
}

// --- メインアプリ ---
export default function App() {
  const [ballPos, setBallPos] = useState(BALL_START_POS);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [showGoalEffect, setShowGoalEffect] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const lastScoreTime = useRef(0);

  // コンボ（On Fire）判定
  const isOnFire = combo >= 2;

  const handleScore = () => {
    const now = Date.now();
    if (now - lastScoreTime.current < 2000) return;
    lastScoreTime.current = now;

    playSound('goal'); // 音！

    // スコア計算（コンボボーナス）
    const points = isOnFire ? 4 : 2;
    setScore(s => s + points);
    setCombo(c => c + 1);
    setShowGoalEffect(true);

    // 紙吹雪
    confetti({
      particleCount: isOnFire ? 300 : 100,
      spread: isOnFire ? 150 : 70,
      colors: isOnFire ? ['#00ffff', '#ffffff'] : ['#ff0000', '#ffffff', '#000000']
    });

    setTimeout(() => {
      setShowGoalEffect(false);
      setIsResetting(true);
      setTimeout(() => setIsResetting(false), 100);
    }, 2500);
  };

  // 外した時のコンボリセット（簡易判定：ボールが手前に戻ってきたらリセット）
  // ※今回は厳密にやると難しいので、リセット時にコンボ継続時間をチェックなどのロジックを入れるが
  // 簡易的に「時間経過」でコンボが切れるようにするならここに追加
  
  return (
    <div style={{ width: '100%', height: '100%', background: '#111', overflow: 'hidden' }}>
      <Canvas shadows fov={60}>
        <CameraController target={cameraTarget} />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 20, 10]} intensity={1} castShadow />
        <Sky sunPosition={[100, 20, 100]} />
        
        <Physics gravity={[0, -9.8, 0]}>
          <Court />
          <Hoop onScore={handleScore} isOnFire={isOnFire} />
          <PlayerBall setBallPos={setBallPos} isResetting={isResetting} setCameraTarget={setCameraTarget} />
        </Physics>
      </Canvas>
      
      {/* UI: スコアボード */}
      <div style={{
        position: 'absolute', top: 20, width: '100%', textAlign: 'center', pointerEvents: 'none',
        color: isOnFire ? '#00ffff' : 'white', textShadow: isOnFire ? '0 0 10px #00ffff' : '2px 2px 0 #000'
      }}>
        <h1 style={{ fontSize: '4rem', margin: 0, fontFamily: 'Impact' }}>
          {score} <span style={{ fontSize: '1.5rem' }}>PTS</span>
        </h1>
        {isOnFire && <div style={{ fontSize: '1.5rem', fontWeight:'bold', animation:'pulse 0.5s infinite'}}>🔥 ON FIRE! (x2) 🔥</div>}
      </div>

      {/* UI: ゴール演出 */}
      {showGoalEffect && (
        <div style={{
          position: 'absolute', top: '40%', width: '100%', textAlign: 'center', pointerEvents: 'none',
          color: isOnFire ? '#00ffff' : '#ffd700', textShadow: '0 0 20px orange',
          animation: 'pop 0.5s ease-out'
        }}>
          <h1 style={{ fontSize: '6rem', margin: 0, fontWeight: '900', fontStyle: 'italic' }}>GOAL!!</h1>
        </div>
      )}
      
      {/* 操作UI */}
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
            width: '90px', height: '90px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.5)',
            background: 'linear-gradient(135deg, #ff6b00, #ff4500)', 
            color: 'white', fontWeight: 'bold', fontSize: '18px',
            boxShadow: '0 4px 15px rgba(255, 69, 0, 0.6)',
            transition: 'transform 0.1s',
          }}
          onMouseDown={() => window.handleMobileChargeStart && window.handleMobileChargeStart()}
          onMouseUp={() => window.handleMobileChargeEnd && window.handleMobileChargeEnd()}
          onTouchStart={(e) => { e.preventDefault(); window.handleMobileChargeStart && window.handleMobileChargeStart() }}
          onTouchEnd={(e) => { e.preventDefault(); window.handleMobileChargeEnd && window.handleMobileChargeEnd() }}
        >
          SHOOT
        </button>
      </div>
      
      {/* スタイル定義（CSSアニメーション用） */}
      <style>{`
        @keyframes pop { 0% { transform: scale(0); opacity:0; } 50% { transform: scale(1.2); } 100% { transform: scale(1); opacity:1; } }
        @keyframes pulse { 0% { opacity: 0.8; } 50% { opacity: 1; text-shadow: 0 0 20px cyan; } 100% { opacity: 0.8; } }
      `}</style>
    </div>
  );
}