import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, usePlane, useSphere, useBox, useCylinder } from '@react-three/cannon';
import { OrbitControls, Stars, Sky, Html, Text } from '@react-three/drei';
import { Joystick } from 'react-joystick-component';
import confetti from 'canvas-confetti';
import * as THREE from 'three';

// --- 設定値 ---
const TEAMS = {
  JETS: { name: 'JETS RED', primary: '#e60012', secondary: '#ffffff', floor: '#e0c090', border: '#e60012', skin: '#ffdbac' },
  KINGS: { name: 'KINGS GOLD', primary: '#d4af37', secondary: '#002b5c', floor: '#e0c090', border: '#002b5c', skin: '#8d5524' },
  ALVARK: { name: 'ALVARK BLACK', primary: '#000000', secondary: '#c41230', floor: '#333333', border: '#c41230', skin: '#e0ac69' },
};

const BALL_RADIUS = 0.14; 
const HOOP_RADIUS = 0.35; 
const BALL_START_POS = [0, 2, 6];
const HOOP_POSITION = [0, 3.05, -12]; 

// --- 音声機能 ---
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
    osc.type = 'triangle'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'goal') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now); osc.stop(now + 0.5);
  } else if (type === 'buzzer') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.linearRampToValueAtTime(80, now + 1.0);
    gain.gain.setValueAtTime(0.8, now); gain.gain.linearRampToValueAtTime(0.01, now + 1.0);
    osc.start(now); osc.stop(now + 1.0);
  } else if (type === 'rim') {
    osc.type = 'square'; osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  }
};

// --- 見えない壁 ---
function Walls() {
  useBox(() => ({ type: 'Static', position: [8.5, 10, 0], args: [1, 20, 32] })); 
  useBox(() => ({ type: 'Static', position: [-8.5, 10, 0], args: [1, 20, 32] })); 
  useBox(() => ({ type: 'Static', position: [0, 10, 15.5], args: [18, 20, 1] })); 
  useBox(() => ({ type: 'Static', position: [0, 10, -15.5], args: [18, 20, 1] })); 
  return null;
}

// --- 選手モデル ---
function PlayerModel({ team, isShooting, isMoving }) {
  const leftLeg = useRef();
  const rightLeg = useRef();
  const bodyGroup = useRef();

  useFrame((state) => {
    if (isMoving && !isShooting) {
      const t = state.clock.elapsedTime * 15;
      if (leftLeg.current) leftLeg.current.rotation.x = Math.sin(t) * 0.8;
      if (rightLeg.current) rightLeg.current.rotation.x = Math.sin(t + Math.PI) * 0.8;
      if (bodyGroup.current) bodyGroup.current.position.y = Math.abs(Math.sin(t * 2)) * 0.1;
    } else {
      if (leftLeg.current) leftLeg.current.rotation.x = 0;
      if (rightLeg.current) rightLeg.current.rotation.x = 0;
      if (bodyGroup.current) bodyGroup.current.position.y = 0;
    }
  });

  return (
    <group ref={bodyGroup} position={[0, 0, 0.4]}> 
      <mesh position={[0, 0.9, 0]} castShadow><boxGeometry args={[0.5, 0.6, 0.25]} /><meshStandardMaterial color={team.primary} /></mesh>
      <Text position={[0, 0.9, -0.13]} rotation={[0, Math.PI, 0]} fontSize={0.3} color={team.secondary}>23</Text>
      <mesh position={[0, 1.45, 0]} castShadow><boxGeometry args={[0.25, 0.3, 0.25]} /><meshStandardMaterial color={team.skin} /></mesh>
      <mesh position={[0.3, isShooting ? 1.4 : 0.9, 0.1]} rotation={[isShooting ? Math.PI : 0, 0, 0]} castShadow><boxGeometry args={[0.12, 0.5, 0.12]} /><meshStandardMaterial color={team.skin} /></mesh>
      <mesh position={[-0.3, 0.9, 0]} castShadow><boxGeometry args={[0.12, 0.5, 0.12]} /><meshStandardMaterial color={team.skin} /></mesh>
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.52, 0.3, 0.26]} /><meshStandardMaterial color={team.secondary} /></mesh>
      <group position={[-0.15, 0.35, 0]} ref={leftLeg}>
        <mesh position={[0, -0.2, 0]}><boxGeometry args={[0.15, 0.4, 0.15]} /><meshStandardMaterial color="#333" /></mesh>
      </group>
      <group position={[0.15, 0.35, 0]} ref={rightLeg}>
        <mesh position={[0, -0.2, 0]}><boxGeometry args={[0.15, 0.4, 0.15]} /><meshStandardMaterial color="#333" /></mesh>
      </group>
    </group>
  );
}

// --- ボール＆プレイヤー制御 ---
function PlayerBall({ isResetting, setCameraTarget, team }) {
  const [ref, api] = useSphere(() => ({
    mass: 1, 
    position: BALL_START_POS, 
    args: [BALL_RADIUS],
    restitution: 0.7, // よく弾む
    friction: 0.5,
    linearDamping: 0.0, // 減衰なし（手動制御するため）
    angularDamping: 0.5,
  }));

  const playerGroupRef = useRef();
  const [movement, setMovement] = useState({ x: 0, z: 0 });
  const [charging, setCharging] = useState(false);
  const [power, setPower] = useState(0);
  const isShooting = useRef(false);
  
  // 速度管理用の参照
  const velocity = useRef([0, 0, 0]);
  useEffect(() => api.velocity.subscribe((v) => (velocity.current = v)), [api.velocity]);

  useEffect(() => {
    if (isResetting) {
      api.position.set(...BALL_START_POS);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
      isShooting.current = false;
      setCameraTarget(null);
      setCharging(false);
      setPower(0);
    }
  }, [isResetting]);

  useEffect(() => {
    window.handleMobileMove = (val) => setMovement({ x: val.x || 0, z: val.y ? -val.y : 0 });
    window.handleMobileChargeStart = () => setCharging(true);
    window.handleMobileChargeEnd = () => handleShoot();
  }, [power]); // power依存は不要だが念のため

  const handleShoot = () => {
    if (isShooting.current) return;
    setCharging(false);
    
    // パワーがある程度溜まっていないとキャンセル（誤操作防止）
    const shootPower = Math.min(power, 100) / 100;
    if (shootPower < 0.1) {
      setPower(0);
      return;
    }

    if (ref.current) {
      const currentPos = ref.current.position;
      
      // 目標（ゴール）
      const tx = HOOP_POSITION[0];
      const ty = HOOP_POSITION[1];
      const tz = HOOP_POSITION[2];

      // 距離計算
      const dx = tx - currentPos.x;
      const dy = ty - currentPos.y;
      const dz = tz - currentPos.z;
      
      // XZ平面の距離
      const distXZ = Math.sqrt(dx * dx + dz * dz);
      
      // 滞空時間（距離に応じて調整：遠いほど長く）
      const time = 0.6 + (distXZ * 0.05);
      
      // 重力補正（Cannon.jsの重力に合わせて計算）
      const g = 9.8;

      // 必要な初速度を計算
      // 水平速度 = 距離 / 時間
      const vx = dx / time;
      const vz = dz / time;
      // 垂直速度 = (高さ差 + 0.5 * g * t^2) / t
      const vy = (dy + 0.5 * g * time * time) / time;

      playSound('shoot');
      isShooting.current = true;
      setCameraTarget(ref);

      // 強制的に速度を上書き
      api.velocity.set(vx, vy, vz);
      api.angularVelocity.set(10, 0, 0); // バックスピン

      // 3秒後に操作復帰
      setTimeout(() => {
        isShooting.current = false;
        setCameraTarget(null);
      }, 3000);
    }
    setPower(0);
  };

  useFrame(() => {
    // 選手モデルの位置合わせ
    const pos = ref.current?.position;
    if (pos && playerGroupRef.current) {
      playerGroupRef.current.position.set(pos.x, 0, pos.z); 
      
      // 向き制御
      if (!isShooting.current && (movement.x !== 0 || movement.z !== 0)) {
         const moveAngle = Math.atan2(movement.x, movement.z);
         playerGroupRef.current.rotation.y = moveAngle;
      } else if (isShooting.current) {
         const dx = HOOP_POSITION[0] - pos.x;
         const dz = HOOP_POSITION[2] - pos.z;
         playerGroupRef.current.rotation.y = Math.atan2(dx, dz);
      }
    }

    // 移動処理（最重要修正箇所）
    if (!isShooting.current) {
      if (movement.x !== 0 || movement.z !== 0) {
        // 入力がある場合：速度を直接セットして動かす（これで確実に動く）
        const speed = 6; 
        // Y軸の速度（重力落下）は維持する
        api.velocity.set(movement.x * speed, velocity.current[1], movement.z * speed);
      } else {
        // 入力がない場合：摩擦で止める（XとZだけ減速）
        api.velocity.set(velocity.current[0] * 0.9, velocity.current[1], velocity.current[2] * 0.9);
      }
    }

    if (charging) setPower(p => Math.min(p + 2.5, 100));
  });

  const isMoving = (movement.x !== 0 || movement.z !== 0);

  return (
    <group>
      <mesh ref={ref} castShadow>
        <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
        <meshStandardMaterial color="#d65a18" roughness={0.2} metalness={0.1} />
        <mesh rotation={[0,0,0]}><torusGeometry args={[BALL_RADIUS, 0.005, 16, 32]} /><meshBasicMaterial color="#f0e68c"/></mesh>
        <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[BALL_RADIUS, 0.005, 16, 32]} /><meshBasicMaterial color="#f0e68c"/></mesh>
        {charging && (
          <Html position={[0, 0.8, 0]} center>
             <div style={{ width: '80px', height: '12px', border: '2px solid white', borderRadius: '6px', background: 'rgba(0,0,0,0.6)', overflow: 'hidden' }}>
               <div style={{ width: `${power}%`, height: '100%', background: `linear-gradient(90deg, limegreen, yellow, red)` }} />
             </div>
          </Html>
        )}
      </mesh>
      <group ref={playerGroupRef}>
        <PlayerModel team={team} isShooting={isShooting.current || charging} isMoving={isMoving} />
      </group>
    </group>
  );
}

// --- ゴール ---
function Hoop({ onScore, team, shotClock }) {
  const [boardRef] = useBox(() => ({ type: 'Static', position: [0, 3.5, -12], args: [1.8, 1.05, 0.1] }));
  useCylinder(() => ({
    isTrigger: true, args: [0.25, 0.25, 0.1, 8], position: [0, 2.8, -11.6],
    onCollide: (e) => { if (e.body.name !== 'sensor') onScore(); }
  }));
  const segmentCount = 16;
  const positions = [];
  for (let i = 0; i < segmentCount; i++) {
    const angle = (i / segmentCount) * Math.PI * 2;
    positions.push([Math.cos(angle) * HOOP_RADIUS, 0, Math.sin(angle) * HOOP_RADIUS]);
  }
  return (
    <group>
      <group position={[0, 4.3, -11.9]}>
        <mesh><boxGeometry args={[0.8, 0.5, 0.1]} /><meshStandardMaterial color="#111" /></mesh>
        <Text position={[0, 0, 0.06]} fontSize={0.25} color={shotClock <= 5 ? "red" : "yellow"} anchorX="center" anchorY="middle">{Math.ceil(shotClock)}</Text>
      </group>
      <mesh ref={boardRef} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.05, 0.1]} />
        <meshStandardMaterial color="white" />
        <mesh position={[0, -0.35, 0.06]}><boxGeometry args={[0.59, 0.45, 0.01]} /><meshBasicMaterial color={team.primary} /></mesh>
      </mesh>
      <mesh position={[0, 3.05, -11.6]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[HOOP_RADIUS, 0.02, 16, 32]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      {positions.map((pos, i) => <RimSegment key={i} position={[pos[0], 3.05, -11.6 + pos[2]]} />)}
      <mesh position={[0, 1.75, -12.5]}><cylinderGeometry args={[0.15, 0.15, 3.5]} /><meshStandardMaterial color="#222" /></mesh>
    </group>
  );
}
function RimSegment({ position }) { useBox(() => ({ type: 'Static', position, args: [0.05, 0.05, 0.05], onCollide: () => playSound('rim') })); return null; }

// --- コート ---
function Court({ team }) {
  usePlane(() => ({ rotation: [-Math.PI / 2, 0, 0], position: [0, 0, 0], material: { friction: 0.1 } }));
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[15, 28]} /><meshStandardMaterial color={team.floor} /></mesh>
      <group position={[0, 0.01, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -7]}><ringGeometry args={[6.75, 6.85, 64, 1, Math.PI, Math.PI]} /><meshBasicMaterial color="white" side={2} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -9.1]}><planeGeometry args={[4.9, 5.8]} /><meshBasicMaterial color={team.primary} /></mesh>
        <mesh rotation={[-Math.PI / 0.5, 0, 0]} position={[0, 0, -14]}><planeGeometry args={[15, 2]} /><meshBasicMaterial color={team.border} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.7, 1.8, 64]} /><meshBasicMaterial color="white" /></mesh>
      </group>
    </group>
  );
}
function CameraController({ target }) {
  useFrame((state) => {
    if (target && target.current) {
      const t = target.current.position;
      state.camera.lookAt(t.x, t.y, t.z);
      state.camera.position.lerp(new THREE.Vector3(t.x, t.y + 4, t.z + 8), 0.05);
    } else {
      state.camera.position.lerp(new THREE.Vector3(0, 8, 16), 0.05);
      state.camera.lookAt(0, 2, -5);
    }
  });
  return null;
}

// --- メインアプリ ---
export default function App() {
  const [score, setScore] = useState(0);
  const [team, setTeam] = useState(TEAMS.JETS);
  const [showGoalEffect, setShowGoalEffect] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [shotClock, setShotClock] = useState(24.0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setShotClock((prev) => {
        if (prev <= 0) return 0;
        return Math.max(0, prev - 0.1);
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPaused]);

  useEffect(() => {
    if (shotClock <= 0 && !isResetting && !isPaused) handleBuzzerBeater();
  }, [shotClock]);

  const handleBuzzerBeater = () => {
    playSound('buzzer'); setIsPaused(true); setIsResetting(true);
    setTimeout(() => { setIsResetting(false); setShotClock(24.0); setIsPaused(false); }, 2000);
  };

  const handleScore = () => {
    playSound('goal'); setScore(s => s + 2); setShowGoalEffect(true);
    confetti({ particleCount: 200, spread: 80, colors: [team.primary, team.secondary, '#ffffff'] });
    setIsPaused(true);
    setTimeout(() => {
      setShowGoalEffect(false); setIsResetting(true);
      setTimeout(() => { setIsResetting(false); setShotClock(24.0); setIsPaused(false); setCameraTarget(null); }, 100);
    }, 2000);
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#222', overflow: 'hidden' }}>
      <Canvas shadows fov={60}>
        <color attach="background" args={['#222']} />
        <CameraController target={cameraTarget} />
        <ambientLight intensity={0.7} />
        <spotLight position={[0, 20, 0]} angle={0.6} penumbra={0.5} intensity={1.5} castShadow />
        <pointLight position={[10, 10, 10]} intensity={0.8} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <Physics gravity={[0, -9.8, 0]}>
          <Court team={team} />
          <Walls />
          <Hoop onScore={handleScore} team={team} shotClock={shotClock} />
          <PlayerBall isResetting={isResetting} setCameraTarget={setCameraTarget} team={team} />
        </Physics>
      </Canvas>
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {Object.keys(TEAMS).map((key) => (
          <button key={key} onClick={() => setTeam(TEAMS[key])} style={{ background: TEAMS[key].primary, color: TEAMS[key].secondary, border: `2px solid ${TEAMS[key].secondary}`, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Impact' }}>{TEAMS[key].name}</button>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 20, width: '100%', textAlign: 'center', pointerEvents: 'none', color: 'white', textShadow: '2px 2px 0 #000' }}>
        <div style={{ background: `linear-gradient(to bottom, ${team.primary}, black)`, display:'inline-block', padding:'10px 40px', borderRadius:'0 0 20px 20px', border:'2px solid white' }}>
          <h2 style={{ margin:0, fontSize:'1rem', letterSpacing:'2px'}}>{team.name}</h2>
          <h1 style={{ fontSize: '3.5rem', margin: 0, fontFamily: 'Impact' }}>{score}</h1>
        </div>
      </div>
      {shotClock <= 0 && <div style={{ position: 'absolute', top: '40%', width: '100%', textAlign: 'center', pointerEvents: 'none', color: 'red', textShadow: '0 0 20px red', animation: 'pop 0.2s infinite' }}><h1 style={{ fontSize: '5rem', margin: 0, fontWeight: '900' }}>24 SEC!!</h1></div>}
      {showGoalEffect && <div style={{ position: 'absolute', top: '40%', width: '100%', textAlign: 'center', pointerEvents: 'none', color: team.primary, textShadow: '0 0 20px white', animation: 'pop 0.5s ease-out' }}><h1 style={{ fontSize: '6rem', margin: 0, fontWeight: '900', fontStyle: 'italic' }}>GOAL!!</h1></div>}
      <div style={{ position: 'absolute', bottom: 30, left: 30, zIndex: 10 }}><Joystick size={100} baseColor="rgba(255, 255, 255, 0.2)" stickColor={team.primary} move={(e) => window.handleMobileMove && window.handleMobileMove(e)} stop={() => window.handleMobileMove && window.handleMobileMove({x:0, y:0})} /></div>
      <div style={{ position: 'absolute', bottom: 50, right: 30, zIndex: 10 }}><button style={{ width: '90px', height: '90px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.5)', background: `linear-gradient(135deg, ${team.primary}, #000)`, color: 'white', fontWeight: 'bold', fontSize: '18px', boxShadow: `0 4px 15px ${team.primary}`, transition: 'transform 0.1s', }} onMouseDown={() => window.handleMobileChargeStart && window.handleMobileChargeStart()} onMouseUp={() => window.handleMobileChargeEnd && window.handleMobileChargeEnd()} onTouchStart={(e) => { e.preventDefault(); window.handleMobileChargeStart && window.handleMobileChargeStart() }} onTouchEnd={(e) => { e.preventDefault(); window.handleMobileChargeEnd && window.handleMobileChargeEnd() }}>SHOOT</button></div>
      <style>{`@keyframes pop { 0% { transform: scale(0); opacity:0; } 50% { transform: scale(1.2); } 100% { transform: scale(1); opacity:1; } }`}</style>
    </div>
  );
}