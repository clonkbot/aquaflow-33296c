import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Float, Text, Html, ContactShadows } from '@react-three/drei'
import { Suspense, useState, useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

// Types
interface Pin {
  id: number
  position: [number, number, number]
  removed: boolean
  color: string
}

interface WaterParticle {
  id: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  active: boolean
}

interface Level {
  id: number
  name: string
  pins: Pin[]
  waterStart: [number, number, number]
  goalPosition: [number, number, number]
  walls: { position: [number, number, number]; size: [number, number, number]; rotation?: number }[]
  hint: string
}

const LEVELS: Level[] = [
  {
    id: 1,
    name: "First Flow",
    pins: [
      { id: 1, position: [0, 1, 0], removed: false, color: '#00fff7' },
    ],
    waterStart: [0, 3, 0],
    goalPosition: [0, -2, 0],
    walls: [
      { position: [-1.5, 0, 0], size: [0.2, 4, 1] },
      { position: [1.5, 0, 0], size: [0.2, 4, 1] },
    ],
    hint: "Click the pin to let water flow!"
  },
  {
    id: 2,
    name: "Double Trouble",
    pins: [
      { id: 1, position: [-0.5, 1.5, 0], removed: false, color: '#00fff7' },
      { id: 2, position: [0.5, 0, 0], removed: false, color: '#ff6b6b' },
    ],
    waterStart: [-0.5, 3, 0],
    goalPosition: [1.5, -2, 0],
    walls: [
      { position: [-1.5, 1, 0], size: [0.2, 3, 1] },
      { position: [0, 0.5, 0], size: [1.5, 0.2, 1] },
      { position: [1.5, -0.5, 0], size: [0.2, 3, 1] },
      { position: [0, -1.5, 0], size: [0.2, 2, 1] },
    ],
    hint: "Order matters! Blue first, then red."
  },
  {
    id: 3,
    name: "Cascade",
    pins: [
      { id: 1, position: [0, 2, 0], removed: false, color: '#00fff7' },
      { id: 2, position: [-1, 0.5, 0], removed: false, color: '#4ecdc4' },
      { id: 3, position: [1, -1, 0], removed: false, color: '#ff6b6b' },
    ],
    waterStart: [0, 3.5, 0],
    goalPosition: [1.5, -2.5, 0],
    walls: [
      { position: [-1.5, 2, 0], size: [0.2, 2.5, 1] },
      { position: [1.5, 2, 0], size: [0.2, 2.5, 1] },
      { position: [0.5, 1, 0], size: [2, 0.2, 1] },
      { position: [-1.5, -0.5, 0], size: [0.2, 2, 1] },
      { position: [0, -0.5, 0], size: [2, 0.2, 1] },
      { position: [2, -1.5, 0], size: [0.2, 2.5, 1] },
    ],
    hint: "Follow the path: top, left, right!"
  },
];

// Glowing Pin Component
function Pin({
  position,
  color,
  removed,
  onClick,
  id
}: {
  position: [number, number, number]
  color: string
  removed: boolean
  onClick: () => void
  id: number
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)
  const [scale, setScale] = useState(1)

  useFrame((state) => {
    if (removed) {
      if (scale > 0.01) {
        setScale(s => s * 0.85)
      }
    } else {
      const pulse = Math.sin(state.clock.elapsedTime * 3 + id) * 0.1 + 1
      meshRef.current.scale.setScalar(hovered ? 1.2 : pulse)
      if (glowRef.current) {
        glowRef.current.scale.setScalar(hovered ? 1.8 : 1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2)
      }
    }
  })

  if (removed && scale < 0.05) return null

  return (
    <group position={position} scale={scale}>
      {/* Glow effect */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} />
      </mesh>

      {/* Main pin body */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          if (!removed) onClick()
        }}
        onPointerOver={() => {
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        <capsuleGeometry args={[0.15, 0.4, 8, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.8 : 0.4}
          metalness={0.3}
          roughness={0.2}
        />
      </mesh>

      {/* Pin head */}
      <mesh position={[0, 0.35, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1 : 0.5}
          metalness={0.5}
          roughness={0.1}
        />
      </mesh>
    </group>
  )
}

// Water Particle System
function WaterSystem({
  particles,
  active
}: {
  particles: WaterParticle[]
  active: boolean
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const tempMatrix = new THREE.Matrix4()
  const tempColor = new THREE.Color()

  useFrame(() => {
    if (!meshRef.current) return

    particles.forEach((particle, i) => {
      if (particle.active) {
        tempMatrix.setPosition(particle.position.x, particle.position.y, particle.position.z)
        const scale = 0.08 + Math.random() * 0.04
        tempMatrix.scale(new THREE.Vector3(scale, scale, scale))
        meshRef.current.setMatrixAt(i, tempMatrix)

        // Color based on velocity
        const speed = particle.velocity.length()
        tempColor.setHSL(0.5 + speed * 0.1, 0.8, 0.6)
        meshRef.current.setColorAt(i, tempColor)
      } else {
        tempMatrix.setPosition(0, -100, 0)
        tempMatrix.scale(new THREE.Vector3(0, 0, 0))
        meshRef.current.setMatrixAt(i, tempMatrix)
      }
    })

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true
    }
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particles.length]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial
        color="#00fff7"
        emissive="#00fff7"
        emissiveIntensity={0.3}
        transparent
        opacity={0.8}
        metalness={0.1}
        roughness={0.3}
      />
    </instancedMesh>
  )
}

// Wall Component
function Wall({
  position,
  size,
}: {
  position: [number, number, number]
  size: [number, number, number]
  rotation?: number
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color="#1a3a5c"
        metalness={0.6}
        roughness={0.3}
        transparent
        opacity={0.85}
      />
    </mesh>
  )
}

// Goal Area
function Goal({ position, reached }: { position: [number, number, number]; reached: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5
      const pulse = reached ? 1.5 : 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1
      meshRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <group position={position}>
      {/* Glow ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.6, 0.08, 8, 32]} />
        <meshStandardMaterial
          color={reached ? "#4ecdc4" : "#ff9f43"}
          emissive={reached ? "#4ecdc4" : "#ff9f43"}
          emissiveIntensity={reached ? 1 : 0.5}
        />
      </mesh>

      {/* Goal marker */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh ref={meshRef}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial
            color={reached ? "#4ecdc4" : "#ff9f43"}
            emissive={reached ? "#4ecdc4" : "#ff9f43"}
            emissiveIntensity={reached ? 1.2 : 0.6}
            metalness={0.8}
            roughness={0.1}
          />
        </mesh>
      </Float>
    </group>
  )
}

// Water Source
function WaterSource({ position, active }: { position: [number, number, number]; active: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime
      const pulse = active ? 1.2 : 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1
      ringRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <group position={position}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.05, 8, 32]} />
        <meshStandardMaterial
          color="#00fff7"
          emissive="#00fff7"
          emissiveIntensity={active ? 0.8 : 0.3}
        />
      </mesh>
      {active && (
        <pointLight color="#00fff7" intensity={2} distance={3} />
      )}
    </group>
  )
}

// Main Game Scene
function GameScene({
  level,
  pins,
  onPinClick,
  particles,
  waterActive,
  goalReached
}: {
  level: Level
  pins: Pin[]
  onPinClick: (id: number) => void
  particles: WaterParticle[]
  waterActive: boolean
  goalReached: boolean
}) {
  return (
    <>
      {/* Environment */}
      <Environment preset="night" />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} color="#ffffff" />
      <pointLight position={[0, 5, 0]} intensity={0.5} color="#00fff7" />

      {/* Background particles effect */}
      <Float speed={0.5} rotationIntensity={0.2}>
        <mesh position={[4, 2, -3]}>
          <icosahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#4ecdc4" emissive="#4ecdc4" emissiveIntensity={0.5} transparent opacity={0.5} />
        </mesh>
      </Float>
      <Float speed={0.8} rotationIntensity={0.3}>
        <mesh position={[-4, -1, -2]}>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color="#ff6b6b" emissive="#ff6b6b" emissiveIntensity={0.5} transparent opacity={0.5} />
        </mesh>
      </Float>

      {/* Walls */}
      {level.walls.map((wall, i) => (
        <Wall key={i} position={wall.position} size={wall.size} rotation={wall.rotation} />
      ))}

      {/* Pins */}
      {pins.map((pin) => (
        <Pin
          key={pin.id}
          id={pin.id}
          position={pin.position}
          color={pin.color}
          removed={pin.removed}
          onClick={() => onPinClick(pin.id)}
        />
      ))}

      {/* Water Source */}
      <WaterSource position={level.waterStart} active={waterActive} />

      {/* Water Particles */}
      <WaterSystem particles={particles} active={waterActive} />

      {/* Goal */}
      <Goal position={level.goalPosition} reached={goalReached} />

      {/* Floor reflection */}
      <ContactShadows
        position={[0, -3, 0]}
        opacity={0.5}
        scale={15}
        blur={2}
        far={5}
        color="#00fff7"
      />

      {/* Level name */}
      <Text
        position={[0, 4.5, 0]}
        fontSize={0.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font="https://fonts.gstatic.com/s/fredoka/v14/X7nP4b87HvSqjb_WIi2yDCRwoQ.woff"
      >
        {level.name}
      </Text>
    </>
  )
}

// UI Overlay Components
function GameUI({
  level,
  currentLevel,
  onRestart,
  onNextLevel,
  goalReached,
  pinsRemaining
}: {
  level: Level
  currentLevel: number
  onRestart: () => void
  onNextLevel: () => void
  goalReached: boolean
  pinsRemaining: number
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 md:p-6">
        <div className="flex justify-between items-start max-w-4xl mx-auto">
          {/* Level indicator */}
          <div className="bg-[#0a1628]/80 backdrop-blur-md rounded-2xl px-4 py-2 md:px-6 md:py-3 border border-[#00fff7]/30">
            <p className="text-[#00fff7] text-xs md:text-sm uppercase tracking-widest">Level</p>
            <p className="text-white text-2xl md:text-3xl font-bold" style={{ fontFamily: 'Fredoka, sans-serif' }}>
              {currentLevel}/{LEVELS.length}
            </p>
          </div>

          {/* Pins remaining */}
          <div className="bg-[#0a1628]/80 backdrop-blur-md rounded-2xl px-4 py-2 md:px-6 md:py-3 border border-[#4ecdc4]/30">
            <p className="text-[#4ecdc4] text-xs md:text-sm uppercase tracking-widest">Pins</p>
            <p className="text-white text-2xl md:text-3xl font-bold" style={{ fontFamily: 'Fredoka, sans-serif' }}>
              {pinsRemaining}
            </p>
          </div>
        </div>
      </div>

      {/* Hint */}
      <div className="absolute bottom-24 md:bottom-28 left-0 right-0 flex justify-center px-4">
        <div className="bg-[#0a1628]/70 backdrop-blur-md rounded-full px-4 py-2 md:px-6 md:py-3 border border-white/10">
          <p className="text-white/70 text-sm md:text-base text-center" style={{ fontFamily: 'Fredoka, sans-serif' }}>
            💡 {level.hint}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="absolute bottom-32 md:bottom-36 left-0 right-0 flex justify-center gap-3 md:gap-4 pointer-events-auto px-4">
        <button
          onClick={onRestart}
          className="bg-[#ff6b6b] hover:bg-[#ff5252] text-white px-4 py-2 md:px-6 md:py-3 rounded-full text-sm md:text-base font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#ff6b6b]/30"
          style={{ fontFamily: 'Fredoka, sans-serif' }}
        >
          🔄 Restart
        </button>

        {goalReached && currentLevel < LEVELS.length && (
          <button
            onClick={onNextLevel}
            className="bg-[#4ecdc4] hover:bg-[#3dbdb5] text-white px-4 py-2 md:px-6 md:py-3 rounded-full text-sm md:text-base font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#4ecdc4]/30 animate-pulse"
            style={{ fontFamily: 'Fredoka, sans-serif' }}
          >
            Next Level ➡️
          </button>
        )}
      </div>

      {/* Victory overlay */}
      {goalReached && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-bounce">
            <p className="text-4xl md:text-6xl mb-2">🎉</p>
            <p
              className="text-[#4ecdc4] text-2xl md:text-4xl font-bold drop-shadow-lg"
              style={{
                fontFamily: 'Fredoka, sans-serif',
                textShadow: '0 0 20px rgba(78, 205, 196, 0.5)'
              }}
            >
              Level Complete!
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Main App
export default function App() {
  const [currentLevel, setCurrentLevel] = useState(0)
  const [pins, setPins] = useState<Pin[]>(LEVELS[0].pins.map(p => ({ ...p })))
  const [particles, setParticles] = useState<WaterParticle[]>([])
  const [waterActive, setWaterActive] = useState(false)
  const [goalReached, setGoalReached] = useState(false)

  const level = LEVELS[currentLevel]
  const particleCount = 200

  // Initialize particles
  useEffect(() => {
    const newParticles: WaterParticle[] = []
    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        position: new THREE.Vector3(0, -100, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        active: false
      })
    }
    setParticles(newParticles)
  }, [])

  // Water physics simulation
  useEffect(() => {
    if (!waterActive) return

    const interval = setInterval(() => {
      setParticles(prev => {
        const newParticles = [...prev]
        const gravity = -0.015
        const damping = 0.98

        // Spawn new particles at water source
        const inactiveParticle = newParticles.find(p => !p.active)
        if (inactiveParticle && Math.random() > 0.3) {
          inactiveParticle.position.set(
            level.waterStart[0] + (Math.random() - 0.5) * 0.3,
            level.waterStart[1],
            level.waterStart[2] + (Math.random() - 0.5) * 0.2
          )
          inactiveParticle.velocity.set(
            (Math.random() - 0.5) * 0.02,
            -0.05,
            (Math.random() - 0.5) * 0.01
          )
          inactiveParticle.active = true
        }

        // Update active particles
        newParticles.forEach(particle => {
          if (!particle.active) return

          // Apply gravity
          particle.velocity.y += gravity
          particle.velocity.multiplyScalar(damping)

          // Update position
          particle.position.add(particle.velocity)

          // Wall collisions
          level.walls.forEach(wall => {
            const wx = wall.position[0]
            const wy = wall.position[1]
            const hw = wall.size[0] / 2
            const hh = wall.size[1] / 2

            const px = particle.position.x
            const py = particle.position.y

            if (px > wx - hw - 0.1 && px < wx + hw + 0.1 &&
                py > wy - hh - 0.1 && py < wy + hh + 0.1) {
              // Bounce off wall
              if (Math.abs(px - wx) > Math.abs(py - wy) * (wall.size[0] / wall.size[1])) {
                particle.velocity.x *= -0.5
                particle.position.x = px < wx ? wx - hw - 0.12 : wx + hw + 0.12
              } else {
                particle.velocity.y *= -0.3
                particle.position.y = py < wy ? wy - hh - 0.12 : wy + hh + 0.12
                particle.velocity.x += (Math.random() - 0.5) * 0.02
              }
            }
          })

          // Pin collisions (only for non-removed pins)
          pins.forEach(pin => {
            if (pin.removed) return
            const dx = particle.position.x - pin.position[0]
            const dy = particle.position.y - pin.position[1]
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 0.35) {
              particle.velocity.y *= -0.3
              particle.velocity.x = dx * 0.1
              particle.position.y = pin.position[1] + 0.36
            }
          })

          // Check goal
          const gx = level.goalPosition[0]
          const gy = level.goalPosition[1]
          const gdist = Math.sqrt(
            Math.pow(particle.position.x - gx, 2) +
            Math.pow(particle.position.y - gy, 2)
          )
          if (gdist < 0.8) {
            setGoalReached(true)
          }

          // Deactivate if out of bounds
          if (particle.position.y < -5 || Math.abs(particle.position.x) > 5) {
            particle.active = false
            particle.position.set(0, -100, 0)
          }
        })

        return newParticles
      })
    }, 16)

    return () => clearInterval(interval)
  }, [waterActive, level, pins])

  const handlePinClick = useCallback((id: number) => {
    setPins(prev => prev.map(p =>
      p.id === id ? { ...p, removed: true } : p
    ))

    // Start water after first pin is removed
    setTimeout(() => setWaterActive(true), 300)
  }, [])

  const handleRestart = useCallback(() => {
    setPins(LEVELS[currentLevel].pins.map(p => ({ ...p })))
    setWaterActive(false)
    setGoalReached(false)
    setParticles(prev => prev.map(p => ({
      ...p,
      active: false,
      position: new THREE.Vector3(0, -100, 0)
    })))
  }, [currentLevel])

  const handleNextLevel = useCallback(() => {
    const nextLevel = currentLevel + 1
    if (nextLevel < LEVELS.length) {
      setCurrentLevel(nextLevel)
      setPins(LEVELS[nextLevel].pins.map(p => ({ ...p })))
      setWaterActive(false)
      setGoalReached(false)
      setParticles(prev => prev.map(p => ({
        ...p,
        active: false,
        position: new THREE.Vector3(0, -100, 0)
      })))
    }
  }, [currentLevel])

  const pinsRemaining = pins.filter(p => !p.removed).length

  return (
    <div
      className="w-screen h-screen relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0a1628 0%, #1a3a5c 50%, #0a1628 100%)'
      }}
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-96 h-96 rounded-full opacity-10 blur-3xl animate-pulse"
          style={{
            background: 'radial-gradient(circle, #00fff7 0%, transparent 70%)',
            top: '10%',
            left: '20%'
          }}
        />
        <div
          className="absolute w-64 h-64 rounded-full opacity-10 blur-3xl"
          style={{
            background: 'radial-gradient(circle, #ff6b6b 0%, transparent 70%)',
            bottom: '20%',
            right: '15%',
            animation: 'pulse 3s ease-in-out infinite 1s'
          }}
        />
      </div>

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <GameScene
            level={level}
            pins={pins}
            onPinClick={handlePinClick}
            particles={particles}
            waterActive={waterActive}
            goalReached={goalReached}
          />
          <OrbitControls
            enablePan={false}
            enableZoom={true}
            minDistance={5}
            maxDistance={15}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 2}
          />
        </Suspense>
      </Canvas>

      {/* UI Overlay */}
      <GameUI
        level={level}
        currentLevel={currentLevel + 1}
        onRestart={handleRestart}
        onNextLevel={handleNextLevel}
        goalReached={goalReached}
        pinsRemaining={pinsRemaining}
      />

      {/* Title */}
      <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
        <h1
          className="text-3xl md:text-5xl font-bold text-transparent bg-clip-text"
          style={{
            fontFamily: 'Fredoka, sans-serif',
            background: 'linear-gradient(135deg, #00fff7 0%, #4ecdc4 50%, #00fff7 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            textShadow: '0 0 40px rgba(0, 255, 247, 0.3)'
          }}
        >
          AquaFlow
        </h1>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-3 md:bottom-4 left-0 right-0 text-center">
        <p
          className="text-white/40 text-xs md:text-sm"
          style={{ fontFamily: 'Fredoka, sans-serif' }}
        >
          Requested by @imjastory · Built by @clonkbot
        </p>
      </footer>
    </div>
  )
}
