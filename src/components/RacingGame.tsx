import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import './RacingGame.css';

const VEHICLE_MODES = ['car', 'boat', 'plane', 'balloon', 'rocket', 'duck', 'snail', 'turtle', 'cat', 'dog'] as const;
type VehicleMode = (typeof VEHICLE_MODES)[number];
type RacingMode = VehicleMode | 'mixed';

interface Racer {
  entry: Entry;
  y: number;
  speed: number;
  color: string;
  finished: boolean;
  totalDistance?: number;
  previousSpeed?: number;
  spinAngle?: number;
  laneIndex: number;
  vehicleMode: VehicleMode;
  lateralPos?: number;
  lateralTarget?: number;
  lateralStartPos?: number;
  lateralStartTime?: number;
  lateralDuration?: number;
  knockedOut?: boolean;
  isFalling?: boolean;
  fallY?: number;
  fallVelocity?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  type: 'fire';
}

interface Obstacle {
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
}

interface Bird {
  x: number;
  y: number;
  vx: number;
  size: number;
}

interface Props {
  entries: Entry[]; // active racers only
  allEntries: Entry[]; // full list for lane labels
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  onWinner: (winner: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: string | null;
  mode: RacingMode;
}

export const RacingGame: React.FC<Props> = ({ entries, allEntries, eliminatedIds, winOrder, onWinner, onRaceComplete, onShowFinalStandings, isRacing, currentWinner, mode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [racers, setRacers] = useState<Racer[]>([]);
  const [raceState, setRaceState] = useState<'ready' | 'racing' | 'finished'>('ready');
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const [birds, setBirds] = useState<Bird[]>([]);
  const birdsRef = useRef<Bird[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [tickerTime, setTickerTime] = useState(0);
  const animationRef = useRef<number | undefined>(undefined);

  const CANVAS_WIDTH = 400;
  const CANVAS_HEIGHT = 600;
  const TRACK_PADDING = 30;
  const getTrackWidth = (laneCount: number) => {
    const minWidth = 200;
    const maxWidth = CANVAS_WIDTH * 0.9;
    const perLane = 22;
    return Math.min(maxWidth, Math.max(minWidth, laneCount * perLane));
  };
  const LABEL_AREA_HEIGHT = 0;
  const TRACK_TOP = TRACK_PADDING;
  const TRACK_BOTTOM = CANVAS_HEIGHT - TRACK_PADDING - LABEL_AREA_HEIGHT;
  const TRACK_HEIGHT = TRACK_BOTTOM - TRACK_TOP;
  const FINISH_LINE = TRACK_TOP + 15;
  const START_LINE = TRACK_BOTTOM - 15;
  const RACE_DURATION = 4500; // milliseconds

  useEffect(() => {
    let frameId: number;
    const animateTicker = (time: number) => {
      setTickerTime(time);
      frameId = requestAnimationFrame(animateTicker);
    };
    frameId = requestAnimationFrame(animateTicker);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const shuffleArray = <T,>(array: T[]) => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const assignMixedModes = (count: number): VehicleMode[] => {
    const assignments: VehicleMode[] = [];
    let pool = shuffleArray(VEHICLE_MODES);
    for (let i = 0; i < count; i++) {
      if (pool.length === 0) {
        pool = shuffleArray(VEHICLE_MODES);
      }
      assignments.push(pool.pop() as VehicleMode);
    }
    return assignments;
  };

  // Initialize racers only when entries change AND we're not in the middle of a race or showing results
  useEffect(() => {
    // Don't update racers if we're showing finished state or racing
    if (raceState === 'finished' || raceState === 'racing') {
      return;
    }

    // Always show at least 2 lanes
    const displayEntries = entries.length > 0 ? entries : [];
    
    const mixedModes = mode === 'mixed' ? assignMixedModes(displayEntries.length) : [];
    const newRacers = displayEntries.map((entry, index) => {
      const laneIndex = Math.max(allEntries.findIndex((e) => e.id === entry.id), 0);
      return {
        entry,
        y: START_LINE,
        speed: 0,
        color: generateColor(index, Math.max(displayEntries.length, 2)),
        finished: false,
        previousSpeed: 0,
        spinAngle: 0,
        laneIndex,
        vehicleMode: mode === 'mixed' ? mixedModes[index] : mode,
        lateralPos: laneIndex,
        lateralTarget: laneIndex,
        lateralStartPos: laneIndex,
        lateralStartTime: 0,
        lateralDuration: 0,
        knockedOut: false,
        isFalling: false,
        fallY: START_LINE,
        fallVelocity: 0,
      };
    });

    setRacers(newRacers);
    setObstacles([]);
    obstaclesRef.current = [];
    setBirds([]);
    birdsRef.current = [];
  }, [entries, raceState, allEntries, mode]);

  // Start race when isRacing becomes true
  useEffect(() => {
    if (isRacing && racers.length > 0) {
      // Reset positions when starting a new race
      const displayEntries = entries.length > 0 ? entries : [];
      const mixedModes = mode === 'mixed' ? assignMixedModes(displayEntries.length) : [];
      const newRacers = displayEntries.map((entry, index) => {
        const laneIndex = Math.max(allEntries.findIndex((e) => e.id === entry.id), 0);
        return {
          entry,
          y: START_LINE,
          speed: 0,
          color: generateColor(index, Math.max(displayEntries.length, 2)),
          finished: false,
          previousSpeed: 0,
          spinAngle: 0,
          laneIndex,
          vehicleMode: mode === 'mixed' ? mixedModes[index] : mode,
          lateralPos: laneIndex,
          lateralTarget: laneIndex,
          lateralStartPos: laneIndex,
          lateralStartTime: 0,
          lateralDuration: 0,
          knockedOut: false,
          isFalling: false,
          fallY: START_LINE,
          fallVelocity: 0,
        };
      });
      setRacers(newRacers);
      setObstacles([]);
      obstaclesRef.current = [];
      setBirds([]);
      birdsRef.current = [];
      setRaceState('racing');
    } else if (!isRacing && raceState === 'racing') {
      setRaceState('ready');
    }
  }, [isRacing, entries, allEntries, mode]);

  // Start race
  useEffect(() => {
    if (raceState !== 'racing' || racers.length === 0) return;

    const startTime = Date.now();
    const TRACK_LENGTH = START_LINE - FINISH_LINE;
    const totalLanes = Math.max(allEntries.length, 2);
    const trackWidth = getTrackWidth(totalLanes);
    const laneWidth = trackWidth / totalLanes;
    const trackLeft = (CANVAS_WIDTH - trackWidth) / 2;
    
    // Generate speed changes for each racer
    const racerSpeedProfiles = racers.map(() => {
      const numChanges = Math.floor(Math.random() * 3) + 2; // 2-4 speed changes
      const speeds: number[] = [];
      
      // Generate random speeds for each segment
      for (let i = 0; i < numChanges; i++) {
        speeds.push(Math.random() * 200 + 200); // 200-400 pixels per second
      }
      
      return { speeds, segmentDistance: TRACK_LENGTH / numChanges };
    });

    let finished = false;



    let lastFrameTime = startTime;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const deltaSeconds = Math.max(0.001, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const spawnChance = 0.02;
      const obstacleGate = Math.ceil(Math.max(allEntries.length, 1) / 3);
      const birdGate = Math.ceil((Math.max(allEntries.length, 1) * 2) / 3);
      const allowObstacles = winOrder.size >= obstacleGate;
      const allowBirds = winOrder.size >= birdGate;
      const updatedObstacles = obstaclesRef.current
        .map((obstacle) => ({
          ...obstacle,
          x: obstacle.x + obstacle.vx * deltaSeconds,
          y: obstacle.y + obstacle.vy * deltaSeconds,
        }))
        .filter((obstacle) => obstacle.y < START_LINE + 40);

      if (allowObstacles && Math.random() < spawnChance) {
        const size = 12 + Math.random() * 10;
        const driftDir = Math.random() < 0.5 ? -1 : 1;
        updatedObstacles.push({
          x: trackLeft + Math.random() * trackWidth,
          y: FINISH_LINE - 20,
          vx: driftDir * (40 + Math.random() * 60),
          vy: 260 + Math.random() * 160,
          size,
        });
      }

      obstaclesRef.current = updatedObstacles;
      setObstacles(updatedObstacles);

      const birdSpawnChance = 0.03;
      const updatedBirds = birdsRef.current
        .map((bird) => ({
          ...bird,
          x: bird.x + bird.vx * deltaSeconds,
        }))
        .map((bird) => {
          if (bird.x < trackLeft - 40) return { ...bird, x: trackLeft + trackWidth + 40 };
          if (bird.x > trackLeft + trackWidth + 40) return { ...bird, x: trackLeft - 40 };
          return bird;
        });

      if (allowBirds && updatedBirds.length < 7 && Math.random() < birdSpawnChance) {
        const size = 16 + Math.random() * 10;
        updatedBirds.push({
          x: trackLeft - 30,
          y: FINISH_LINE + 30 + Math.random() * (TRACK_HEIGHT - 60),
          vx: 160 + Math.random() * 120,
          size,
        });
      }

      birdsRef.current = updatedBirds;
      setBirds(updatedBirds);

      setRacers((prevRacers) => {
        const updated = prevRacers.map((racer, idx) => {
          if (racer.knockedOut) {
            const gravity = 900;
            const currentFallY = racer.isFalling ? (racer.fallY ?? racer.y) : START_LINE;
            const currentVelocity = racer.isFalling ? (racer.fallVelocity ?? 0) : 0;
            const nextVelocity = currentVelocity + gravity * deltaSeconds;
            const nextY = Math.min(START_LINE, currentFallY + nextVelocity * deltaSeconds);
            const landed = nextY >= START_LINE;

            return {
              ...racer,
              y: nextY,
              fallY: nextY,
              fallVelocity: landed ? 0 : nextVelocity,
              isFalling: landed ? false : true,
              totalDistance: 0,
              speed: 0,
              previousSpeed: 0,
              spinAngle: 0,
              finished: false,
            };
          }

          const profile = racerSpeedProfiles[idx];
          
          // Calculate distance by integrating through speed segments
          let totalDistance = 0;
          let timeRemaining = elapsed / 1000; // convert to seconds
          let segmentIndex = 0;
          
          while (timeRemaining > 0 && segmentIndex < profile.speeds.length) {
            const speed = profile.speeds[segmentIndex];
            const segmentEnd = (segmentIndex + 1) * profile.segmentDistance;
            const remainingInSegment = segmentEnd - (totalDistance % (profile.segmentDistance * profile.speeds.length));
            
            // Time to cross this segment at current speed
            const timeForSegment = remainingInSegment / speed;
            
            if (timeRemaining >= timeForSegment) {
              // Complete this segment
              totalDistance += remainingInSegment;
              timeRemaining -= timeForSegment;
              segmentIndex++;
            } else {
              // Partial segment
              totalDistance += speed * timeRemaining;
              timeRemaining = 0;
            }
          }
          
          const y = Math.max(START_LINE - totalDistance, FINISH_LINE);
          const isFinished = y <= FINISH_LINE;
          
          // Get current speed based on distance traveled
          const currentSegment = Math.floor(totalDistance / profile.segmentDistance);
          const currentSpeed = profile.speeds[Math.min(currentSegment, profile.speeds.length - 1)];
          const prevSpeed = racer.previousSpeed || currentSpeed;
          
          // Blue flame effects removed

          let lateralPos = racer.lateralPos ?? racer.laneIndex ?? idx;
          let lateralTarget = racer.lateralTarget ?? lateralPos;
          let lateralStartPos = racer.lateralStartPos ?? lateralPos;
          let lateralStartTime = racer.lateralStartTime ?? 0;
          let lateralDuration = racer.lateralDuration ?? 0;
          const lateralElapsed = elapsed - lateralStartTime;
          const lateralFinished = lateralDuration <= 0 || lateralElapsed >= lateralDuration;

          if (lateralFinished && Math.random() < 0.06) {
            const currentLane = Math.round(lateralPos);
            const stepOptions = [currentLane - 1, currentLane, currentLane + 1]
              .filter((lane) => lane >= 0 && lane < totalLanes);
            let nextTarget = stepOptions[Math.floor(Math.random() * stepOptions.length)];
            if (nextTarget === lateralTarget && stepOptions.length > 1) {
              nextTarget = stepOptions[(stepOptions.indexOf(nextTarget) + 1) % stepOptions.length];
            }
            lateralStartPos = lateralPos;
            lateralTarget = nextTarget;
            lateralStartTime = elapsed;
            lateralDuration = 350 + Math.random() * 650;
          }

          if (lateralDuration > 0) {
            const t = Math.min(1, Math.max(0, (elapsed - lateralStartTime) / lateralDuration));
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            lateralPos = lateralStartPos + (lateralTarget - lateralStartPos) * eased;
          }

          lateralPos = Math.max(0, Math.min(totalLanes - 1, lateralPos));

          return {
            ...racer,
            y,
            totalDistance,
            speed: currentSpeed,
            previousSpeed: currentSpeed,
            spinAngle: prevSpeed - currentSpeed > 20 ? (racer.spinAngle || 0) + (Math.random() - 0.5) * 0.4 : (racer.spinAngle || 0) * 0.95,
            finished: isFinished,
            lateralPos,
            lateralTarget,
            lateralStartPos,
            lateralStartTime,
            lateralDuration,
          };
        });

        const withCollisions = updated.map((r) => ({ ...r }));
        const collisionY = 14;
        const collisionX = laneWidth * 0.35;

        for (let i = 0; i < withCollisions.length; i++) {
          const racerA = withCollisions[i];
          if (racerA.finished || racerA.knockedOut) continue;
          const lanePosA = racerA.lateralPos ?? racerA.laneIndex;
          const xA = trackLeft + lanePosA * laneWidth + laneWidth / 2;

          for (let j = i + 1; j < withCollisions.length; j++) {
            const racerB = withCollisions[j];
            if (racerB.finished || racerB.knockedOut) continue;
            const lanePosB = racerB.lateralPos ?? racerB.laneIndex;
            const xB = trackLeft + lanePosB * laneWidth + laneWidth / 2;

            if (Math.abs(racerA.y - racerB.y) < collisionY && Math.abs(xA - xB) < collisionX) {
              const trailing = racerA.y > racerB.y ? racerA : racerB;
              trailing.knockedOut = true;
              trailing.isFalling = true;
              trailing.fallY = trailing.y;
              trailing.fallVelocity = 0;
              trailing.totalDistance = 0;
              trailing.speed = 0;
              trailing.previousSpeed = 0;
              trailing.spinAngle = 0;
              trailing.finished = false;
            }
          }
        }

        for (let i = 0; i < withCollisions.length; i++) {
          const racer = withCollisions[i];
          if (racer.finished || racer.knockedOut) continue;
          const lanePos = racer.lateralPos ?? racer.laneIndex;
          const x = trackLeft + lanePos * laneWidth + laneWidth / 2;
          const y = racer.y;

          const hitObstacle = updatedObstacles.find((obstacle) => {
            const dx = Math.abs(obstacle.x - x);
            const dy = Math.abs(obstacle.y - y);
            return dx < obstacle.size * 0.7 && dy < obstacle.size * 0.7;
          });

          if (hitObstacle) {
            racer.knockedOut = true;
            racer.isFalling = true;
            racer.fallY = racer.y;
            racer.fallVelocity = 0;
            racer.totalDistance = 0;
            racer.speed = 0;
            racer.previousSpeed = 0;
            racer.spinAngle = 0;
            racer.finished = false;
          }

          const hitBird = updatedBirds.find((bird) => {
            const dx = Math.abs(bird.x - x);
            const dy = Math.abs(bird.y - y);
            return dx < bird.size * 0.9 && dy < bird.size * 0.6;
          });

          if (hitBird) {
            racer.knockedOut = true;
            racer.isFalling = true;
            racer.fallY = racer.y;
            racer.fallVelocity = 0;
            racer.totalDistance = 0;
            racer.speed = 0;
            racer.previousSpeed = 0;
            racer.spinAngle = 0;
            racer.finished = false;
          }
        }

        // Check if anyone finished - use distance as tiebreaker
        if (!finished) {
          const finishers = withCollisions.filter((r) => r.finished);
          if (finishers.length > 0) {
            // Pick the one who traveled the farthest (tiebreaker for same-frame finishes)
            const firstFinisher = finishers.reduce((prev, current) => 
              (current.totalDistance || 0) > (prev.totalDistance || 0) ? current : prev
            );
            finished = true;
            setRaceState('finished');
            onWinner(firstFinisher.entry);
          }
        }

        return withCollisions;
      });

      const hasFalling = racers.some((r) => r.isFalling);
      if ((!finished && elapsed < RACE_DURATION) || hasFalling) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [raceState, racers.length, onWinner, allEntries.length]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Always show at least 2 lanes; keep lanes for all participants even if eliminated
    const numLanes = Math.max(allEntries.length, 2);
    const trackWidth = getTrackWidth(numLanes);
    const trackLeft = (canvas.width - trackWidth) / 2;
    const laneWidth = trackWidth / numLanes;

    // Draw track (vertical lanes)
    ctx.fillStyle = '#4a4a4a';
    for (let idx = 0; idx < numLanes; idx++) {
      const x = trackLeft + idx * laneWidth;
      ctx.fillRect(x, TRACK_TOP, laneWidth, TRACK_HEIGHT);
    }

    // Draw finish line with checkered pattern
    const finishLineHeight = 30;
    const checkerSize = 10;
    const finishLineWidth = trackWidth;
    
    // Draw checkered pattern
    for (let y = 0; y < finishLineHeight; y += checkerSize) {
      for (let x = 0; x < finishLineWidth; x += checkerSize) {
        const isBlack = ((Math.floor(y / checkerSize) + Math.floor(x / checkerSize)) % 2 === 0);
        ctx.fillStyle = isBlack ? '#000' : '#fff';
        ctx.fillRect(trackLeft + x, FINISH_LINE - finishLineHeight / 2 + y, checkerSize, checkerSize);
      }
    }

    // Draw "FINISH" text centered on the finish line
    ctx.save();
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText('FINISH', canvas.width / 2, FINISH_LINE);
    ctx.fillText('FINISH', canvas.width / 2, FINISH_LINE);
    ctx.restore();

    // Draw falling boulders
    obstacles.forEach((obstacle) => {
      ctx.save();
      ctx.fillStyle = '#5c5c5c';
      ctx.strokeStyle = '#2f2f2f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(obstacle.x, obstacle.y, obstacle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(obstacle.x - obstacle.size * 0.3, obstacle.y - obstacle.size * 0.3, obstacle.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw flying birds
    birds.forEach((bird) => {
      ctx.save();
      const bodyWidth = bird.size * 1.6;
      const bodyHeight = bird.size * 0.8;

      // Body
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.ellipse(bird.x, bird.y, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.arc(bird.x + bodyWidth / 2 - bird.size * 0.2, bird.y - bird.size * 0.2, bird.size * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.moveTo(bird.x + bodyWidth / 2 + bird.size * 0.15, bird.y - bird.size * 0.2);
      ctx.lineTo(bird.x + bodyWidth / 2 + bird.size * 0.5, bird.y);
      ctx.lineTo(bird.x + bodyWidth / 2 + bird.size * 0.1, bird.y + bird.size * 0.1);
      ctx.closePath();
      ctx.fill();

      // Wings
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bird.x - bodyWidth * 0.25, bird.y);
      ctx.quadraticCurveTo(bird.x - bodyWidth * 0.05, bird.y - bird.size * 0.9, bird.x + bodyWidth * 0.1, bird.y - bird.size * 0.1);
      ctx.moveTo(bird.x - bodyWidth * 0.15, bird.y);
      ctx.quadraticCurveTo(bird.x + bodyWidth * 0.05, bird.y - bird.size * 0.7, bird.x + bodyWidth * 0.25, bird.y - bird.size * 0.05);
      ctx.stroke();

      // Eye
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(bird.x + bodyWidth / 2 - bird.size * 0.25, bird.y - bird.size * 0.25, bird.size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const initialsFor = (name: string, extraLetters = 0) => {
      const words = name.split(' ').filter(Boolean);
      const base = words.map((part) => part[0]?.toUpperCase()).join('');
      if (extraLetters <= 0 || words.length === 0) return base;
      const extra = words[0].slice(1, 1 + extraLetters).toLowerCase();
      return base + extra;
    };

    const baseInitialsMap = new Map<string, number[]>();
    racers.forEach((racer, idx) => {
      const base = initialsFor(racer.entry.name);
      const existing = baseInitialsMap.get(base) ?? [];
      existing.push(idx);
      baseInitialsMap.set(base, existing);
    });

    const initialsByIndex = new Map<number, string>();
    baseInitialsMap.forEach((indexes, base) => {
      if (indexes.length === 1) {
        initialsByIndex.set(indexes[0], base);
      } else {
        indexes.forEach((idx) => {
          initialsByIndex.set(idx, initialsFor(racers[idx].entry.name, 1));
        });
      }
    });

    const secondaryMap = new Map<string, number[]>();
    initialsByIndex.forEach((value, idx) => {
      const existing = secondaryMap.get(value) ?? [];
      existing.push(idx);
      secondaryMap.set(value, existing);
    });

    secondaryMap.forEach((indexes, value) => {
      if (indexes.length > 1) {
        indexes.forEach((idx) => {
          initialsByIndex.set(idx, initialsFor(racers[idx].entry.name, 2));
        });
      }
    });

    // Draw racers
    racers.forEach((racer, index) => {
      const lanePosition = racer.lateralPos ?? racer.laneIndex;
      const laneX = trackLeft + lanePosition * laneWidth + laneWidth / 2;

      // Draw climbers with rotation to face upward
      ctx.save();
      ctx.translate(laneX, racer.y);
      
      const renderMode = mode === 'mixed' ? racer.vehicleMode : mode;

      // Add rocking motion for boats based on vertical position
      let totalRotation = -Math.PI / 2 + (racer.spinAngle || 0);
      if (renderMode === 'boat') {
        const rockAmount = Math.sin((racer.y + performance.now() / 500) * 0.02) * 0.15; // gentle rocking
        totalRotation += rockAmount;
      }
      
      ctx.rotate(totalRotation);
      
      // Flip boats horizontally so they face forward
      if (renderMode === 'boat') {
        ctx.scale(-1, 1);
      }
      
      ctx.translate(-laneX, -racer.y);
      if (renderMode === 'car') {
        ctx.save();
        ctx.translate(laneX, racer.y);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-laneX, -racer.y);
        drawClimber(ctx, laneX, racer.y, racer.color);
        ctx.restore();
      } else if (renderMode === 'boat') {
        ctx.save();
        ctx.translate(laneX, racer.y);
        ctx.rotate(-Math.PI / 2);
        ctx.translate(-laneX, -racer.y);
        drawMonkey(ctx, laneX, racer.y, racer.color);
        ctx.restore();
      } else if (renderMode === 'plane') {
        drawLizard(ctx, laneX, racer.y, racer.color);
      } else if (renderMode === 'balloon') {
        ctx.save();
        ctx.translate(laneX, racer.y);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-laneX, -racer.y);
        drawBalloon(ctx, laneX, racer.y, racer.color);
        ctx.restore();
      } else if (renderMode === 'rocket') {
        ctx.save();
        ctx.translate(laneX, racer.y);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-laneX, -racer.y);
        drawRocket(ctx, laneX, racer.y, racer.color);
        ctx.restore();
      } else if (renderMode === 'duck') {
        drawDuck(ctx, laneX, racer.y, racer.color);
      } else if (renderMode === 'snail') {
        drawSnail(ctx, laneX, racer.y, racer.color);
      } else if (renderMode === 'turtle') {
        drawTurtle(ctx, laneX, racer.y, racer.color);
      } else if (renderMode === 'cat') {
        drawCat(ctx, laneX, racer.y, racer.color);
      } else if (renderMode === 'dog') {
        drawDog(ctx, laneX, racer.y, racer.color);
      } else {
        drawClimber(ctx, laneX, racer.y, racer.color);
      }
      ctx.restore();

      // Draw initials above racer
      const initials = initialsByIndex.get(index) ?? initialsFor(racer.entry.name);
      if (initials) {
        ctx.save();
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeText(initials, laneX, racer.y - 14);
        ctx.fillText(initials, laneX, racer.y - 14);
        ctx.restore();
      }
    });

    // Static lane nameplates with placement
    const getOrdinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    // Labels removed for cleaner climbing wall

    // Particle effects removed

    return () => {};
  }, [racers, obstacles, birds, particles, allEntries, eliminatedIds, winOrder, tickerTime]);

  const drawClimber = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 6, 8, 12, 3);
    ctx.fill();

    // Head
    ctx.fillStyle = '#FFD9B3';
    ctx.beginPath();
    ctx.arc(x, y - 10, 4, 0, Math.PI * 2);
    ctx.fill();

    // Arms reaching
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 3);
    ctx.lineTo(x - 8, y - 8);
    ctx.moveTo(x + 3, y - 3);
    ctx.lineTo(x + 8, y - 8);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 6);
    ctx.lineTo(x - 6, y + 12);
    ctx.moveTo(x + 2, y + 6);
    ctx.lineTo(x + 6, y + 12);
    ctx.stroke();

    // Harness line removed
  };

  const drawMonkey = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(x, y - 6, 6, 0, Math.PI * 2);
    ctx.fill();

    // Face
    ctx.fillStyle = '#F2C19C';
    ctx.beginPath();
    ctx.ellipse(x, y - 5, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - 6, y - 6, 2.5, 0, Math.PI * 2);
    ctx.arc(x + 6, y - 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Tail curl
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 6, y + 6, 5, 0.3, Math.PI * 1.4);
    ctx.stroke();
  };

  const drawLizard = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.ellipse(x + 9, y, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 2);
    ctx.quadraticCurveTo(x - 14, y + 6, x - 10, y + 12);
    ctx.stroke();

    // Legs
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 4);
    ctx.lineTo(x - 6, y + 8);
    ctx.moveTo(x + 2, y + 4);
    ctx.lineTo(x + 6, y + 8);
    ctx.stroke();
  };

  const drawBoat = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const boatWidth = 22;  // horizontal width (length)
    const boatHeight = 7;  // vertical height (reduced from 14)
    
    // Draw boat hull with flat back, flat top, and curved nose
    // Drawing with bow on left so it points right after the flip
    ctx.fillStyle = color;
    ctx.beginPath();
    
    // Start at back-top corner (right when facing forward after flip) - 90 degree corner
    ctx.moveTo(x + boatWidth / 2, y - boatHeight / 2);
    
    // Top edge to nose with sharp 90 degree corner at top-left
    ctx.lineTo(x - boatWidth / 2 + 4, y - boatHeight / 2);
    
    // Sharp downward line from top-left corner
    ctx.lineTo(x - boatWidth / 2 + 4, y - boatHeight / 2 + 1.5);
    
    // Curved nose (front/bow) - left side before flip
    ctx.quadraticCurveTo(
      x - boatWidth / 2 - 2, y, // control point
      x - boatWidth / 2 + 4, y + boatHeight / 2
    );
    
    // Bottom flat section from nose to stern
    ctx.lineTo(x + boatWidth / 2, y + boatHeight / 2);
    
    // Flat back (stern) - right side before flip, close the path
    ctx.closePath();
    ctx.fill();

    // Draw deck (lighter section in the middle)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.moveTo(x + boatWidth / 2 - 4, y - boatHeight / 2 + 1.5);
    ctx.lineTo(x - boatWidth / 2 + 6, y - boatHeight / 2 + 1.5);
    ctx.quadraticCurveTo(
      x - boatWidth / 2 + 2, y,
      x - boatWidth / 2 + 6, y + boatHeight / 2 - 1.5
    );
    ctx.lineTo(x + boatWidth / 2 - 4, y + boatHeight / 2 - 1.5);
    ctx.closePath();
    ctx.fill();

    // Draw sail mast (vertical line)
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 2, y - boatHeight / 2);
    ctx.lineTo(x + 2, y - boatHeight / 2 - 12);
    ctx.stroke();

    // Draw sail (triangular) - flipped on vertical axis
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y - boatHeight / 2 - 12); // top of mast
    ctx.lineTo(x + 2, y - boatHeight / 2); // bottom of mast
    ctx.lineTo(x + 8, y - boatHeight / 2 - 6); // sail point (flipped)
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw boat outline with proper shape
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    // Start at back-top corner
    ctx.moveTo(x + boatWidth / 2, y - boatHeight / 2);
    
    // Top edge to nose with sharp corner
    ctx.lineTo(x - boatWidth / 2 + 4, y - boatHeight / 2);
    
    // Sharp downward line from top-left corner
    ctx.lineTo(x - boatWidth / 2 + 4, y - boatHeight / 2 + 1.5);
    
    ctx.quadraticCurveTo(
      x - boatWidth / 2 - 2, y,
      x - boatWidth / 2 + 4, y + boatHeight / 2
    );
    
    // Bottom edge back to stern
    ctx.lineTo(x + boatWidth / 2, y + boatHeight / 2);
    
    // Flat back
    ctx.closePath();
    ctx.stroke();

    // Draw water splash at back (stern wake) - moved to back of boat
    ctx.strokeStyle = '#4af';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + boatWidth / 2 - 1, y - 3);
    ctx.lineTo(x + boatWidth / 2 + 2, y - 4);
    ctx.moveTo(x + boatWidth / 2 - 1, y + 3);
    ctx.lineTo(x + boatWidth / 2 + 2, y + 4);
    ctx.stroke();
  };

  const drawPlane = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const planeWidth = 24;  // horizontal width (length)
    const planeHeight = 20;  // vertical height (wingspan)
    
    // Draw main fuselage (body)
    ctx.fillStyle = color;
    ctx.beginPath();
    // Pointed nose at front (right)
    ctx.moveTo(x + planeWidth / 2, y);
    // Top of fuselage
    ctx.lineTo(x + planeWidth / 2 - 6, y - 3);
    ctx.lineTo(x - planeWidth / 2, y - 3);
    // Tail
    ctx.lineTo(x - planeWidth / 2 - 2, y - 3);
    ctx.lineTo(x - planeWidth / 2, y);
    // Bottom of tail
    ctx.lineTo(x - planeWidth / 2 - 2, y + 3);
    // Bottom of fuselage
    ctx.lineTo(x - planeWidth / 2, y + 3);
    ctx.lineTo(x + planeWidth / 2 - 6, y + 3);
    ctx.closePath();
    ctx.fill();

    // Draw wings (horizontal across)
    ctx.fillStyle = color;
    ctx.beginPath();
    // Top wing
    ctx.moveTo(x - 2, y - 3);
    ctx.lineTo(x + 4, y - 3);
    ctx.lineTo(x + 4, y - planeHeight / 2);
    ctx.lineTo(x + 2, y - planeHeight / 2);
    ctx.lineTo(x - 2, y - planeHeight / 2 + 2);
    ctx.closePath();
    ctx.fill();
    
    // Bottom wing
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 3);
    ctx.lineTo(x + 4, y + 3);
    ctx.lineTo(x + 4, y + planeHeight / 2);
    ctx.lineTo(x + 2, y + planeHeight / 2);
    ctx.lineTo(x - 2, y + planeHeight / 2 - 2);
    ctx.closePath();
    ctx.fill();

    // Draw cockpit window
    ctx.fillStyle = '#4af';
    ctx.beginPath();
    ctx.arc(x + planeWidth / 2 - 8, y, 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw fuselage outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + planeWidth / 2, y);
    ctx.lineTo(x + planeWidth / 2 - 6, y - 3);
    ctx.lineTo(x - planeWidth / 2, y - 3);
    ctx.lineTo(x - planeWidth / 2 - 2, y - 3);
    ctx.lineTo(x - planeWidth / 2, y);
    ctx.lineTo(x - planeWidth / 2 - 2, y + 3);
    ctx.lineTo(x - planeWidth / 2, y + 3);
    ctx.lineTo(x + planeWidth / 2 - 6, y + 3);
    ctx.closePath();
    ctx.stroke();

    // Draw wing outlines
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 3);
    ctx.lineTo(x + 4, y - 3);
    ctx.lineTo(x + 4, y - planeHeight / 2);
    ctx.lineTo(x + 2, y - planeHeight / 2);
    ctx.lineTo(x - 2, y - planeHeight / 2 + 2);
    ctx.closePath();
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 3);
    ctx.lineTo(x + 4, y + 3);
    ctx.lineTo(x + 4, y + planeHeight / 2);
    ctx.lineTo(x + 2, y + planeHeight / 2);
    ctx.lineTo(x - 2, y + planeHeight / 2 - 2);
    ctx.closePath();
    ctx.stroke();

    // Draw jet stream / contrails at back
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - planeWidth / 2 - 2, y);
    ctx.lineTo(x - planeWidth / 2 - 8, y);
    ctx.stroke();
  };

  const drawBalloon = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const balloonRadiusX = 10;
    const balloonRadiusY = 13;
    const basketWidth = 8;
    const basketHeight = 6;

    // Balloon envelope
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y - 6, balloonRadiusX, balloonRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Balloon highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x - 3, y - 9, balloonRadiusX / 3, balloonRadiusY / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Basket
    ctx.fillStyle = '#8B5A2B';
    ctx.fillRect(x - basketWidth / 2, y + 8, basketWidth, basketHeight);

    // Basket outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - basketWidth / 2, y + 8, basketWidth, basketHeight);

    // Ropes
    ctx.strokeStyle = '#d2b48c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 2);
    ctx.lineTo(x - basketWidth / 2, y + 8);
    ctx.moveTo(x + 5, y + 2);
    ctx.lineTo(x + basketWidth / 2, y + 8);
    ctx.stroke();

    // Envelope outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y - 6, balloonRadiusX, balloonRadiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawRocket = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const rocketWidth = 10;
    const rocketHeight = 24;
    const finSize = 5;

    // Rocket body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - rocketWidth / 2, y - rocketHeight / 2, rocketWidth, rocketHeight, 4);
    ctx.fill();

    // Nose cone
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x, y - rocketHeight / 2 - 6);
    ctx.lineTo(x - rocketWidth / 2, y - rocketHeight / 2 + 2);
    ctx.lineTo(x + rocketWidth / 2, y - rocketHeight / 2 + 2);
    ctx.closePath();
    ctx.fill();

    // Window
    ctx.fillStyle = '#4af';
    ctx.beginPath();
    ctx.arc(x, y - 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // Side fins
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - rocketWidth / 2, y + rocketHeight / 4);
    ctx.lineTo(x - rocketWidth / 2 - finSize, y + rocketHeight / 2 - 2);
    ctx.lineTo(x - rocketWidth / 2, y + rocketHeight / 2 - 2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + rocketWidth / 2, y + rocketHeight / 4);
    ctx.lineTo(x + rocketWidth / 2 + finSize, y + rocketHeight / 2 - 2);
    ctx.lineTo(x + rocketWidth / 2, y + rocketHeight / 2 - 2);
    ctx.closePath();
    ctx.fill();

    // Flame exhaust
    ctx.fillStyle = '#FF6B00';
    ctx.beginPath();
    ctx.moveTo(x - 3, y + rocketHeight / 2);
    ctx.lineTo(x, y + rocketHeight / 2 + 8);
    ctx.lineTo(x + 3, y + rocketHeight / 2);
    ctx.closePath();
    ctx.fill();

    // Outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - rocketWidth / 2, y - rocketHeight / 2, rocketWidth, rocketHeight, 4);
    ctx.stroke();
  };

  const drawDuck = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const duckWidth = 20;
    const duckHeight = 12;

    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, duckWidth / 2, duckHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 3, y + 1, 5, 0, Math.PI * 1.2);
    ctx.stroke();

    // Outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, duckWidth / 2, duckHeight / 2, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath();
    ctx.arc(x - 8, y - 4, 5, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#F57C00';
    ctx.beginPath();
    ctx.moveTo(x - 13, y - 4);
    ctx.lineTo(x - 18, y - 2);
    ctx.lineTo(x - 13, y);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x - 8, y - 5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const drawSnail = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const bodyWidth = 24;
    const bodyHeight = 8;

    // Foot/body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - bodyWidth / 2, y + 1, bodyWidth, bodyHeight, 4);
    ctx.fill();

    // Head (front)
    ctx.beginPath();
    ctx.ellipse(x + bodyWidth / 2 - 2, y + 1, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(x - bodyWidth / 2, y + 1, bodyWidth, bodyHeight, 4);
    ctx.stroke();

    // Shell (bigger, distinct)
    ctx.fillStyle = '#F4E7C5';
    ctx.beginPath();
    ctx.arc(x - 6, y - 2, 7, 0, Math.PI * 2);
    ctx.fill();

    // Shell outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x - 6, y - 2, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Shell spiral
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - 6, y - 2, 4.5, 0.4, Math.PI * 1.9);
    ctx.stroke();

    // Antennae (stalks)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + bodyWidth / 2 - 3, y - 1);
    ctx.lineTo(x + bodyWidth / 2 + 3, y - 7);
    ctx.moveTo(x + bodyWidth / 2 - 5, y - 1);
    ctx.lineTo(x + bodyWidth / 2 + 1, y - 7);
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + bodyWidth / 2 + 3, y - 7, 1, 0, Math.PI * 2);
    ctx.arc(x + bodyWidth / 2 + 1, y - 7, 1, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawTurtle = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const shellWidth = 20;
    const shellHeight = 12;

    // Shell
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, shellWidth / 2, shellHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shell outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, shellWidth / 2, shellHeight / 2, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#8BC34A';
    ctx.beginPath();
    ctx.arc(x + 11, y - 1, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#7CB342';
    ctx.beginPath();
    ctx.arc(x - 6, y - 6, 2, 0, Math.PI * 2);
    ctx.arc(x - 6, y + 6, 2, 0, Math.PI * 2);
    ctx.arc(x + 2, y - 6, 2, 0, Math.PI * 2);
    ctx.arc(x + 2, y + 6, 2, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 12, y - 2, 1, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawCat = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const bodyWidth = 18;
    const bodyHeight = 10;

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(x + 10, y - 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 7, y - 8);
    ctx.lineTo(x + 9, y - 12);
    ctx.lineTo(x + 11, y - 8);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + 11, y - 8);
    ctx.lineTo(x + 13, y - 12);
    ctx.lineTo(x + 15, y - 8);
    ctx.closePath();
    ctx.fill();

    // Tail
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 2);
    ctx.quadraticCurveTo(x - 16, y - 2, x - 12, y - 8);
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 8.5, y - 3, 1, 0, Math.PI * 2);
    ctx.arc(x + 12, y - 3, 1, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawDog = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const bodyWidth = 20;
    const bodyHeight = 10;

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(x + 11, y - 1, 5, 0, Math.PI * 2);
    ctx.fill();

    // Ear
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(x + 9, y - 6, 3, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + 16, y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 18, y, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 2);
    ctx.quadraticCurveTo(x - 16, y + 4, x - 14, y + 10);
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 10, y - 2, 1, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  };

  return (
    <div className="racing-game">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="game-canvas" />

      {currentWinner && !isRacing && (
        <div className="winner-display">
          <div className="winner-banner">
            <h2>🏆 WINNER 🏆</h2>
            <p className="winner-name">{currentWinner}</p>
            {entries.length === 0 ? (
              <button onClick={onShowFinalStandings} className="final-standings-btn">
                🏆 Final Standings
              </button>
            ) : (
              <button onClick={onRaceComplete} className="next-race-btn">
                ▶ Next Race
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function generateColor(index: number, _total: number): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3',
    '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA',
    '#FF8B94', '#D4A5A5', '#9BC995', '#C7CEEA',
    '#FFB4A2', '#E5989B', '#B5838D', '#6D6875',
    '#FF1744', '#00B0FF', '#76FF03', '#FFD600',
    '#F50057', '#651FFF',
  ];
  return colors[index % colors.length];
}
