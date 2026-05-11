import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getEntryImages, pickRandomEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import { plinkoTheme } from '../themes';
import './PlinkoGame.css';

interface Player {
  entry: Entry;
  selectedImageDataUrl?: string;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  finished: boolean;
  rotation: number;
  isOnFire: boolean;
  isIce: boolean;
  isGreen: boolean;
  isLightningStruck: boolean;
  lightningTriggerAt: number | null;
  lightningAnimUntil: number | null;
  frozenUntil: number | null;
  iceWallImmuneUntil: number | null;
  nextDuplicateAt: number;
  resumeVx: number;
  resumeVy: number;
  hitWall?: boolean;
}

type WallMode = 'none' | 'fire' | 'ice' | 'green';

interface Peg {
  x: number;
  y: number;
  radius: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface WinnerEffects {
  fire: boolean;
  ice: boolean;
  green: boolean;
  lightning: boolean;
}

interface Props {
  entries: Entry[];
  allEntries: Entry[];
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  onWinner: (winner: Entry, selectedImageDataUrl?: string, effects?: WinnerEffects) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  onAllDestroyed?: () => void;
  isRacing: boolean;
  currentWinner: string | null;
  currentWinnerImage?: string;
  currentWinnerImages?: string[];
  currentWinnerEffects?: WinnerEffects;
  mode: string; // Not used in Plinko but kept for compatibility
}

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const GRAVITY = 700; // pixels per second squared
const BOUNCE_DAMPING = 0.7;
const HORIZONTAL_DAMPING = 0.98;
const PLAYER_RADIUS = 12;
const PEG_RADIUS = 5;
const LEFT_MARGIN = 40;
const RIGHT_MARGIN = 40;
const FROZEN_DURATION_MS = 1000;
const ICE_WALL_FREEZE_MS = 500;
const ICE_WALL_IMMUNE_MS = 1000;
const MAX_BALL_COUNT = 40;
const GREEN_DUPLICATE_COOLDOWN_MS = 70;
const LIGHTNING_SHRINK_FACTOR = 0.5;
const LIGHTNING_SPREAD_START_MS = 700;
const LIGHTNING_SPREAD_END_MS = 4800;
const LIGHTNING_SPREAD_JITTER_MS = 280;
const LIGHTNING_ANIMATION_MS = 420;

export const PlinkoGame: React.FC<Props> = ({
  entries, 
  onWinner, 
  onRaceComplete, 
  onShowFinalStandings, 
  onAllDestroyed,
  isRacing, 
  currentWinner,
  currentWinnerImage,
  currentWinnerImages,
  currentWinnerEffects
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pegs, setPegs] = useState<Peg[]>([]);
  const [raceState, setRaceState] = useState<'ready' | 'racing' | 'finished'>('ready');
  const animationRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number>(0);
  const wallFireParticlesRef = useRef<Particle[]>([]);
  const wallIceParticlesRef = useRef<Particle[]>([]);
  const wallGreenParticlesRef = useRef<Particle[]>([]);
  const explosionParticlesRef = useRef<Particle[]>([]);
  const playerFireParticlesRef = useRef<Particle[]>([]);
  const playerIceParticlesRef = useRef<Particle[]>([]);
  const wallModeRef = useRef<WallMode>('none');
  const playerImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pendingWinnerRef = useRef<Player | null>(null);
  const pendingAllDestroyedRef = useRef(false);

  useEffect(() => {
    const nextImageUrls = new Set(entries.flatMap((entry) => getEntryImages(entry)));

    playerImagesRef.current.forEach((_, imageUrl) => {
      if (!nextImageUrls.has(imageUrl)) {
        playerImagesRef.current.delete(imageUrl);
      }
    });

    for (const imageUrl of nextImageUrls) {
      if (playerImagesRef.current.has(imageUrl)) {
        continue;
      }

      const image = new Image();
      image.src = imageUrl;
      playerImagesRef.current.set(imageUrl, image);
    }
  }, [entries]);

  // Generate Plinko pegs in a staggered grid pattern
  useEffect(() => {
    const generatedPegs: Peg[] = [];
    const rows = 5;
    const startY = 150;
    const endY = 450;
    const rowSpacing = (endY - startY) / (rows - 1);
    
    // Define play area with margins
    const playWidth = CANVAS_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
    const pegsPerRow = 8;
    const spacing = playWidth / (pegsPerRow - 1);
    
    for (let row = 0; row < rows; row++) {
      const y = startY + row * rowSpacing;
      const isEvenRow = row % 2 === 0;
      const offset = isEvenRow ? 0 : spacing / 2; // Stagger every other row
      const pegsInThisRow = isEvenRow ? pegsPerRow : pegsPerRow - 1;
      
      for (let i = 0; i < pegsInThisRow; i++) {
        generatedPegs.push({
          x: LEFT_MARGIN + (spacing * i) + offset,
          y,
          radius: PEG_RADIUS
        });
      }
    }
    
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPegs(generatedPegs);
  }, []);

  // Initialize players when entries change
  useEffect(() => {
    if (raceState === 'finished' || raceState === 'racing') {
      return;
    }

    // Shuffle entries to randomize starting positions
    const shuffledEntries = [...entries];
    for (let i = shuffledEntries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledEntries[i], shuffledEntries[j]] = [shuffledEntries[j], shuffledEntries[i]];
    }

    const playWidth = CANVAS_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
    const newPlayers: Player[] = shuffledEntries.map((entry, index) => {
      const spacing = playWidth / (shuffledEntries.length + 1);
      // Find original index for consistent color assignment
      const originalIndex = entries.findIndex(e => e.id === entry.id);
      return {
        entry,
        selectedImageDataUrl: pickRandomEntryImage(entry),
        radius: PLAYER_RADIUS,
        x: LEFT_MARGIN + spacing * (index + 1),
        y: 50,
        vx: 0,
        vy: 0,
        color: generateColor(originalIndex),
        finished: false,
        rotation: 0,
        isOnFire: false,
        isIce: false,
        isGreen: false,
        isLightningStruck: false,
        lightningTriggerAt: null,
        lightningAnimUntil: null,
        frozenUntil: null,
        iceWallImmuneUntil: null,
        nextDuplicateAt: 0,
        resumeVx: 0,
        resumeVy: 0
      };
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayers(newPlayers);
  }, [entries, raceState]);

  // Start race when isRacing becomes true
  useEffect(() => {
    if (isRacing && entries.length > 0) {
      // Randomly choose wall behavior for this run.
      const wallRoll = Math.random();
      wallModeRef.current = wallRoll < 0.25 ? 'fire' : wallRoll < 0.5 ? 'ice' : wallRoll < 0.75 ? 'green' : 'none';
      
      // Clear particles from previous race
      wallFireParticlesRef.current = [];
      wallIceParticlesRef.current = [];
      wallGreenParticlesRef.current = [];
      explosionParticlesRef.current = [];
      playerFireParticlesRef.current = [];
      playerIceParticlesRef.current = [];
      
      // Shuffle entries to randomize starting positions
      const shuffledEntries = [...entries];
      for (let i = shuffledEntries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledEntries[i], shuffledEntries[j]] = [shuffledEntries[j], shuffledEntries[i]];
      }

      // 50% chance to include a single fire ball this run
      const numFireBalls = shuffledEntries.length > 0 && Math.random() < 0.5 ? 1 : 0;
      const fireBallIndices = new Set<number>();
      while (fireBallIndices.size < numFireBalls) {
        fireBallIndices.add(Math.floor(Math.random() * shuffledEntries.length));
      }

      // 50% chance to include a single ice ball this run (cannot overlap with fire ball)
      const availableIceIndices = Array.from({ length: shuffledEntries.length }, (_, i) => i)
        .filter(i => !fireBallIndices.has(i));
      const numIceBalls = availableIceIndices.length > 0 && Math.random() < 0.5 ? 1 : 0;
      const iceBallIndices = new Set<number>();
      while (iceBallIndices.size < numIceBalls) {
        const randomIndex = availableIceIndices[Math.floor(Math.random() * availableIceIndices.length)];
        if (randomIndex !== undefined) {
          iceBallIndices.add(randomIndex);
        }
      }

      // 50% chance to include a single green ball this run (cannot overlap with fire/ice balls)
      const availableGreenIndices = Array.from({ length: shuffledEntries.length }, (_, i) => i)
        .filter(i => !fireBallIndices.has(i) && !iceBallIndices.has(i));
      const numGreenBalls = availableGreenIndices.length > 0 && Math.random() < 0.5 ? 1 : 0;
      const greenBallIndices = new Set<number>();
      while (greenBallIndices.size < numGreenBalls) {
        const randomIndex = availableGreenIndices[Math.floor(Math.random() * availableGreenIndices.length)];
        if (randomIndex !== undefined) {
          greenBallIndices.add(randomIndex);
        }
      }

      // Randomly strike 2-3 normal participants with lightning.
      // Balls with fire/ice/green effects are excluded.
      const lightningPool = Array.from({ length: shuffledEntries.length }, (_, i) => i)
        .filter(i => !fireBallIndices.has(i) && !iceBallIndices.has(i) && !greenBallIndices.has(i));
      const desiredLightningCount = shuffledEntries.length >= 3 ? 2 + Math.floor(Math.random() * 2) : 2;
      const lightningCount = Math.min(lightningPool.length, desiredLightningCount);
      const lightningIndices: number[] = [];
      while (lightningIndices.length < lightningCount && lightningPool.length > 0) {
        const pick = Math.floor(Math.random() * lightningPool.length);
        const selected = lightningPool.splice(pick, 1)[0];
        if (selected !== undefined) {
          lightningIndices.push(selected);
        }
      }

      // Spread lightning strikes out over the race instead of clustering at the beginning.
      for (let i = lightningIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lightningIndices[i], lightningIndices[j]] = [lightningIndices[j], lightningIndices[i]];
      }

      const lightningDelayByIndex = new Map<number, number>();
      if (lightningIndices.length > 0) {
        const spreadDuration = LIGHTNING_SPREAD_END_MS - LIGHTNING_SPREAD_START_MS;
        const step = lightningIndices.length > 1 ? spreadDuration / (lightningIndices.length - 1) : 0;

        lightningIndices.forEach((playerIndex, strikeOrder) => {
          const baseDelay = LIGHTNING_SPREAD_START_MS + step * strikeOrder;
          const jitter = (Math.random() * 2 - 1) * LIGHTNING_SPREAD_JITTER_MS;
          const finalDelay = Math.max(
            LIGHTNING_SPREAD_START_MS,
            Math.min(LIGHTNING_SPREAD_END_MS, Math.round(baseDelay + jitter))
          );
          lightningDelayByIndex.set(playerIndex, finalDelay);
        });
      }

      // Reset player positions with shuffled order
      const playWidth = CANVAS_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
      const raceStartAt = Date.now();
      const resetPlayers: Player[] = shuffledEntries.map((entry, index) => {
        const spacing = playWidth / (shuffledEntries.length + 1);
        const lightningDelay = lightningDelayByIndex.get(index);
        const willBeStruck = lightningDelay !== undefined;
        // Find original index for consistent color assignment
        const originalIndex = entries.findIndex(e => e.id === entry.id);
        return {
          entry,
          selectedImageDataUrl: pickRandomEntryImage(entry),
          radius: PLAYER_RADIUS,
          x: LEFT_MARGIN + spacing * (index + 1),
          y: 50,
          vx: 0,
          vy: 0,
          color: generateColor(originalIndex),
          finished: false,
          rotation: 0,
          isOnFire: fireBallIndices.has(index),
          isIce: iceBallIndices.has(index),
          isGreen: greenBallIndices.has(index),
          isLightningStruck: false,
          lightningTriggerAt: willBeStruck ? raceStartAt + lightningDelay : null,
          lightningAnimUntil: null,
          frozenUntil: null,
          iceWallImmuneUntil: null,
          nextDuplicateAt: 0,
          resumeVx: 0,
          resumeVy: 0
        };
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlayers(resetPlayers);
      setRaceState('racing');
    } else if (!isRacing && raceState === 'racing') {
      setRaceState('ready');
    }
  }, [isRacing, entries]);

  // Game loop
  useEffect(() => {
    if (raceState !== 'racing' || players.length === 0) return;

    let finished = false;
    lastFrameTimeRef.current = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaTime = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05); // Cap at 50ms
      lastFrameTimeRef.current = now;

      setPlayers((prevPlayers) => {
        let nextWallMode: WallMode | null = null;
        const fireWallsAreActive = wallModeRef.current === 'fire';
        const iceWallsAreActive = wallModeRef.current === 'ice';
        const greenWallsAreActive = wallModeRef.current === 'green';

        const updated = prevPlayers.map((player) => {
          if (player.finished) return player;

          // Apply gravity
          let {
            x,
            y,
            vx,
            vy,
            rotation,
            frozenUntil,
            iceWallImmuneUntil,
            resumeVx,
            resumeVy,
            radius,
            isLightningStruck,
            lightningTriggerAt,
            lightningAnimUntil
          } = player;

          // Lightning sequence: normal size -> bolt animation -> shrink.
          if (!isLightningStruck && lightningTriggerAt !== null && now >= lightningTriggerAt) {
            lightningTriggerAt = null;
            lightningAnimUntil = now + LIGHTNING_ANIMATION_MS;
          }

          if (!isLightningStruck && lightningAnimUntil !== null && now >= lightningAnimUntil) {
            isLightningStruck = true;
            radius = PLAYER_RADIUS * LIGHTNING_SHRINK_FACTOR;
            lightningAnimUntil = null;
          }

          if (frozenUntil !== null) {
            if (now < frozenUntil) {
              return {
                ...player,
                radius,
                isLightningStruck,
                lightningTriggerAt,
                lightningAnimUntil,
                vx: 0,
                vy: 0
              };
            }

            // Resume pre-freeze movement after the freeze duration ends.
            vx = resumeVx;
            vy = resumeVy;
            frozenUntil = null;
          }

          vy += GRAVITY * deltaTime;

          // Update position
          x += vx * deltaTime;
          y += vy * deltaTime;

          // Apply horizontal damping (air resistance)
          vx *= HORIZONTAL_DAMPING;

          // Check collision with pegs
          for (const peg of pegs) {
            const dx = x - peg.x;
            const dy = y - peg.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = radius + peg.radius;

            if (distance < minDist && distance > 0.1) {
              // Collision! Bounce off the peg
              const angle = Math.atan2(dy, dx);
              const overlap = minDist - distance;
              
              // Push player out of peg with a bit extra to prevent sticking
              x += Math.cos(angle) * (overlap + 1);
              y += Math.sin(angle) * (overlap + 1);

              // Calculate bounce velocity
              const speed = Math.sqrt(vx * vx + vy * vy);
              vx = Math.cos(angle) * speed * BOUNCE_DAMPING;
              vy = Math.sin(angle) * speed * BOUNCE_DAMPING;

              // Add random horizontal impulse to break symmetry and prevent sticking
              const randomImpulse = (Math.random() - 0.5) * 100;
              vx += randomImpulse * deltaTime;
              
              // Ensure minimum downward velocity to prevent getting stuck on top
              if (Math.abs(vy) < 50) {
                vy += 50 * Math.sign(vy || 1);
              }

              // Add some rotation for visual effect
              rotation += (Math.random() - 0.5) * 0.5;
            }
          }

          // Check walls (with margins matching peg area)
          let hitWall = false;
          if (x - radius < LEFT_MARGIN) {
            if (fireWallsAreActive && player.isIce) {
              nextWallMode = 'none';
              x = LEFT_MARGIN + radius;
              vx = Math.abs(vx) * BOUNCE_DAMPING;
            } else if (fireWallsAreActive && !player.isOnFire) {
              hitWall = true;
            } else if (iceWallsAreActive) {
              x = LEFT_MARGIN + radius;
              vx = Math.abs(vx) * BOUNCE_DAMPING;
              if (player.isOnFire) {
                nextWallMode = 'none';
              } else if (player.isGreen) {
                hitWall = true;
              } else if (!player.isIce && (iceWallImmuneUntil === null || now >= iceWallImmuneUntil) && frozenUntil === null) {
                resumeVx = vx;
                resumeVy = vy;
                vx = 0;
                vy = 0;
                frozenUntil = now + ICE_WALL_FREEZE_MS;
                iceWallImmuneUntil = now + ICE_WALL_FREEZE_MS + ICE_WALL_IMMUNE_MS;
              }
            } else if (greenWallsAreActive) {
              x = LEFT_MARGIN + radius;
              vx = Math.abs(vx) * BOUNCE_DAMPING;
              if (player.isOnFire || player.isIce) {
                nextWallMode = 'none';
              } else if (!player.isGreen) {
                player.isGreen = true;
              }
            } else {
              x = LEFT_MARGIN + radius;
              vx = Math.abs(vx) * BOUNCE_DAMPING;
              if (player.isOnFire) {
                nextWallMode = 'fire';
              } else if (player.isIce) {
                nextWallMode = 'ice';
              } else if (player.isGreen) {
                nextWallMode = 'green';
              }
            }
          } else if (x + radius > CANVAS_WIDTH - RIGHT_MARGIN) {
            if (fireWallsAreActive && player.isIce) {
              nextWallMode = 'none';
              x = CANVAS_WIDTH - RIGHT_MARGIN - radius;
              vx = -Math.abs(vx) * BOUNCE_DAMPING;
            } else if (fireWallsAreActive && !player.isOnFire) {
              hitWall = true;
            } else if (iceWallsAreActive) {
              x = CANVAS_WIDTH - RIGHT_MARGIN - radius;
              vx = -Math.abs(vx) * BOUNCE_DAMPING;
              if (player.isOnFire) {
                nextWallMode = 'none';
              } else if (player.isGreen) {
                hitWall = true;
              } else if (!player.isIce && (iceWallImmuneUntil === null || now >= iceWallImmuneUntil) && frozenUntil === null) {
                resumeVx = vx;
                resumeVy = vy;
                vx = 0;
                vy = 0;
                frozenUntil = now + ICE_WALL_FREEZE_MS;
                iceWallImmuneUntil = now + ICE_WALL_FREEZE_MS + ICE_WALL_IMMUNE_MS;
              }
            } else if (greenWallsAreActive) {
              x = CANVAS_WIDTH - RIGHT_MARGIN - radius;
              vx = -Math.abs(vx) * BOUNCE_DAMPING;
              if (player.isOnFire || player.isIce) {
                nextWallMode = 'none';
              } else if (!player.isGreen) {
                player.isGreen = true;
              }
            } else {
              x = CANVAS_WIDTH - RIGHT_MARGIN - radius;
              vx = -Math.abs(vx) * BOUNCE_DAMPING;
              if (player.isOnFire) {
                nextWallMode = 'fire';
              } else if (player.isIce) {
                nextWallMode = 'ice';
              } else if (player.isGreen) {
                nextWallMode = 'green';
              }
            }
          }

          return {
            ...player,
            x,
            y,
            vx,
            vy,
            rotation,
            radius,
            isLightningStruck,
            lightningTriggerAt,
            lightningAnimUntil,
            frozenUntil,
            iceWallImmuneUntil,
            resumeVx,
            resumeVy,
            finished: hitWall ? true : false, // Mark as finished to remove
            hitWall // Add flag to track wall collision
          };
        });

        if (nextWallMode !== null && nextWallMode !== wallModeRef.current) {
          wallModeRef.current = nextWallMode;
          if (nextWallMode !== 'fire') {
            wallFireParticlesRef.current = [];
          }
          if (nextWallMode !== 'ice') {
            wallIceParticlesRef.current = [];
          }
          if (nextWallMode !== 'green') {
            wallGreenParticlesRef.current = [];
          }
        }

        // Create explosion particles for balls that hit walls and filter them out
        const filteredUpdated = updated.filter((player: Player) => {
          if (player.hitWall) {
            // Create explosion particles
            const explosionCount = 20;
            const newExplosions: Particle[] = [];
            for (let i = 0; i < explosionCount; i++) {
              const angle = (Math.PI * 2 * i) / explosionCount + (Math.random() - 0.5) * 0.5;
              const speed = 50 + Math.random() * 100;
              newExplosions.push({
                x: player.x,
                y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50,
                life: 1,
                maxLife: 1,
                size: 3 + Math.random() * 4,
                color: ['#ff6b00', '#ff8800', '#ffaa00', '#ff0000'][Math.floor(Math.random() * 4)]
              });
            }
            explosionParticlesRef.current.push(...newExplosions);
            return false; // Remove ball
          }
          return true; // Keep ball
        });

        // Handle ball-to-ball collisions
        const spawnedGreenClones: Player[] = [];
        const duplicatedThisTick = new Set<Player>();
        for (let i = 0; i < filteredUpdated.length; i++) {
          for (let j = i + 1; j < filteredUpdated.length; j++) {
            const ballA = filteredUpdated[i];
            const ballB = filteredUpdated[j];
            
            // Skip if either ball has finished
            if (ballA.finished || ballB.finished) continue;
            
            const dx = ballB.x - ballA.x;
            const dy = ballB.y - ballA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = ballA.radius + ballB.radius;
            
            if (distance < minDist && distance > 0.1) {
              // Fire and ice balls destroy green balls on contact.
              if (ballA.isGreen && (ballB.isOnFire || ballB.isIce)) {
                ballA.finished = true;
                ballA.hitWall = true;
                continue;
              }
              if (ballB.isGreen && (ballA.isOnFire || ballA.isIce)) {
                ballB.finished = true;
                ballB.hitWall = true;
                continue;
              }

              // Ice balls should phase through currently frozen balls.
              if ((ballA.isIce && ballB.frozenUntil !== null) || (ballB.isIce && ballA.frozenUntil !== null)) {
                continue;
              }

              const freezeBall = (ball: Player) => {
                if (ball.frozenUntil === null) {
                  ball.resumeVx = ball.vx;
                  ball.resumeVy = ball.vy;
                }
                ball.vx = 0;
                ball.vy = 0;
                ball.frozenUntil = now + FROZEN_DURATION_MS;
              };

              // Fire + ice cancel each other and both become normal balls.
              if ((ballA.isOnFire && ballB.isIce) || (ballB.isOnFire && ballA.isIce)) {
                ballA.isOnFire = false;
                ballA.isIce = false;
                ballB.isOnFire = false;
                ballB.isIce = false;
              }

              // Ice ball freezes a normal ball for 1 second.
              if (ballA.isIce && !ballB.isIce && !ballB.isOnFire) {
                freezeBall(ballB);
              } else if (ballB.isIce && !ballA.isIce && !ballA.isOnFire) {
                freezeBall(ballA);
              }

              // Green balls duplicate when colliding with other balls.
              const trySpawnGreenClone = (
                source: Player,
                other: Player,
                normalX: number,
                normalY: number,
                direction: 1 | -1
              ) => {
                const activeBallCount = filteredUpdated.filter(p => !p.finished).length + spawnedGreenClones.length;
                if (
                  source.isGreen &&
                  !other.isGreen &&
                  activeBallCount < MAX_BALL_COUNT &&
                  now >= source.nextDuplicateAt &&
                  !duplicatedThisTick.has(source)
                ) {
                  source.nextDuplicateAt = now + GREEN_DUPLICATE_COOLDOWN_MS;
                  duplicatedThisTick.add(source);
                  spawnedGreenClones.push({
                    ...source,
                    x: source.x + normalX * source.radius * direction,
                    y: source.y + normalY * source.radius * direction,
                    vx: source.vx + normalX * (40 + Math.random() * 40) * direction,
                    vy: source.vy + normalY * (40 + Math.random() * 40) * direction,
                    finished: false,
                    rotation: source.rotation + (Math.random() - 0.5) * 0.4,
                    frozenUntil: null,
                    iceWallImmuneUntil: null,
                    nextDuplicateAt: now + GREEN_DUPLICATE_COOLDOWN_MS,
                    resumeVx: 0,
                    resumeVy: 0,
                    hitWall: false
                  });
                }
              };

              const normalX = dx / distance;
              const normalY = dy / distance;
              trySpawnGreenClone(ballA, ballB, normalX, normalY, -1);
              trySpawnGreenClone(ballB, ballA, normalX, normalY, 1);

              // Check if one ball is on fire and the other is not
              if (ballA.isOnFire && !ballB.isOnFire) {
                // Ball B gets destroyed by fire ball A
                ballB.finished = true;
                ballB.hitWall = true; // Reuse hitWall flag to trigger explosion
                continue;
              } else if (ballB.isOnFire && !ballA.isOnFire) {
                // Ball A gets destroyed by fire ball B
                ballA.finished = true;
                ballA.hitWall = true; // Reuse hitWall flag to trigger explosion
                continue;
              }
              
              // Normal collision (both on fire or both not on fire)
              const angle = Math.atan2(dy, dx);
              const overlap = minDist - distance;
              
              // Separate the balls
              const separationX = Math.cos(angle) * (overlap / 2 + 0.5);
              const separationY = Math.sin(angle) * (overlap / 2 + 0.5);
              
              ballA.x -= separationX;
              ballA.y -= separationY;
              ballB.x += separationX;
              ballB.y += separationY;
              
              // Calculate relative velocity
              const dvx = ballB.vx - ballA.vx;
              const dvy = ballB.vy - ballA.vy;
              
              // Calculate relative velocity in collision normal direction
              const dvn = dvx * Math.cos(angle) + dvy * Math.sin(angle);
              
              // Do not resolve if velocities are separating
              if (dvn > 0) continue;
              
              // Calculate impulse scalar (elastic collision)
              const impulse = dvn * BOUNCE_DAMPING;
              
              // Apply impulse to both balls
              const impulseX = impulse * Math.cos(angle);
              const impulseY = impulse * Math.sin(angle);
              
              ballA.vx += impulseX;
              ballA.vy += impulseY;
              ballB.vx -= impulseX;
              ballB.vy -= impulseY;
              
              // Add rotation for visual effect
              ballA.rotation += (Math.random() - 0.5) * 0.3;
              ballB.rotation += (Math.random() - 0.5) * 0.3;
            }
          }
        }

        if (spawnedGreenClones.length > 0) {
          filteredUpdated.push(...spawnedGreenClones);
        }

        // Filter out balls destroyed by fire balls and create explosions
        const afterCollisionUpdated = filteredUpdated.filter((player: Player) => {
          if (player.hitWall && player.finished) {
            // Create explosion particles for ball destroyed by fire ball
            const explosionCount = 20;
            const newExplosions: Particle[] = [];
            for (let i = 0; i < explosionCount; i++) {
              const angle = (Math.PI * 2 * i) / explosionCount + (Math.random() - 0.5) * 0.5;
              const speed = 50 + Math.random() * 100;
              newExplosions.push({
                x: player.x,
                y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50,
                life: 1,
                maxLife: 1,
                size: 3 + Math.random() * 4,
                color: ['#ff6b00', '#ff8800', '#ffaa00', '#ff0000'][Math.floor(Math.random() * 4)]
              });
            }
            explosionParticlesRef.current.push(...newExplosions);
            return false; // Remove ball
          }
          return true; // Keep ball
        });

        // Generate fire particles around player balls that are on fire
        for (const player of afterCollisionUpdated) {
          if (player.isOnFire && !player.finished) {
            // Generate fire particles around the ball
            if (Math.random() < 0.5) { // 50% chance each frame
              const numParticles = 2;
              for (let i = 0; i < numParticles; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = player.radius + Math.random() * 5;
                playerFireParticlesRef.current.push({
                  x: player.x + Math.cos(angle) * distance,
                  y: player.y + Math.sin(angle) * distance,
                  vx: Math.cos(angle) * (20 + Math.random() * 20) + player.vx * 0.5,
                  vy: Math.sin(angle) * (20 + Math.random() * 20) + player.vy * 0.5 - 30,
                  life: 0.3 + Math.random() * 0.4,
                  maxLife: 0.3 + Math.random() * 0.4,
                  size: 2 + Math.random() * 3,
                  color: ['#ff6b00', '#ff8800', '#ffaa00', '#ff0000'][Math.floor(Math.random() * 4)]
                });
              }
            }
          }

          if (player.isIce && !player.finished) {
            // Generate icy particles around the ball for the blue animation variant.
            if (Math.random() < 0.45) {
              const numParticles = 2;
              for (let i = 0; i < numParticles; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = player.radius + Math.random() * 4;
                playerIceParticlesRef.current.push({
                  x: player.x + Math.cos(angle) * distance,
                  y: player.y + Math.sin(angle) * distance,
                  vx: Math.cos(angle) * (12 + Math.random() * 20) + player.vx * 0.3,
                  vy: Math.sin(angle) * (12 + Math.random() * 20) + player.vy * 0.3,
                  life: 0.35 + Math.random() * 0.45,
                  maxLife: 0.35 + Math.random() * 0.45,
                  size: 1.5 + Math.random() * 2.5,
                  color: ['#8fd3ff', '#64b9ff', '#2f9cff', '#bde9ff'][Math.floor(Math.random() * 4)]
                });
              }
            }
          }
        }

        // Update player fire particles
        playerFireParticlesRef.current = playerFireParticlesRef.current
          .map(p => ({
            ...p,
            x: p.x + p.vx * deltaTime,
            y: p.y + p.vy * deltaTime,
            vy: p.vy + GRAVITY * deltaTime * 0.2,
            life: p.life - deltaTime
          }))
          .filter(p => p.life > 0);

        // Update player ice particles
        playerIceParticlesRef.current = playerIceParticlesRef.current
          .map(p => ({
            ...p,
            x: p.x + p.vx * deltaTime,
            y: p.y + p.vy * deltaTime,
            vy: p.vy + GRAVITY * deltaTime * 0.08,
            life: p.life - deltaTime
          }))
          .filter(p => p.life > 0);

        // Generate wall fire particles (only if fire walls are enabled)
        const fireWallsAreActiveForParticles = wallModeRef.current === 'fire';
        if (fireWallsAreActiveForParticles && Math.random() < 0.3) { // 30% chance each frame
          const newFireParticles: Particle[] = [];
          // Left wall fire
          for (let i = 0; i < 2; i++) {
            newFireParticles.push({
              x: LEFT_MARGIN + Math.random() * 5,
              y: Math.random() * CANVAS_HEIGHT,
              vx: -10 - Math.random() * 20,
              vy: -30 - Math.random() * 50,
              life: 0.5 + Math.random(),
              maxLife: 0.5 + Math.random(),
              size: 3 + Math.random() * 3,
              color: ['#ff6b00', '#ff8800', '#ffaa00'][Math.floor(Math.random() * 3)]
            });
          }
          // Right wall fire
          for (let i = 0; i < 2; i++) {
            newFireParticles.push({
              x: CANVAS_WIDTH - RIGHT_MARGIN - Math.random() * 5,
              y: Math.random() * CANVAS_HEIGHT,
              vx: 10 + Math.random() * 20,
              vy: -30 - Math.random() * 50,
              life: 0.5 + Math.random(),
              maxLife: 0.5 + Math.random(),
              size: 3 + Math.random() * 3,
              color: ['#ff6b00', '#ff8800', '#ffaa00'][Math.floor(Math.random() * 3)]
            });
          }
          wallFireParticlesRef.current.push(...newFireParticles);
        }

        if (wallModeRef.current === 'ice' && Math.random() < 0.3) {
          const newIceWallParticles: Particle[] = [];
          for (let i = 0; i < 2; i++) {
            newIceWallParticles.push({
              x: LEFT_MARGIN + Math.random() * 5,
              y: Math.random() * CANVAS_HEIGHT,
              vx: -6 - Math.random() * 14,
              vy: -10 - Math.random() * 30,
              life: 0.45 + Math.random() * 0.6,
              maxLife: 0.45 + Math.random() * 0.6,
              size: 2 + Math.random() * 3,
              color: ['#bde9ff', '#8fd3ff', '#64b9ff'][Math.floor(Math.random() * 3)]
            });
          }
          for (let i = 0; i < 2; i++) {
            newIceWallParticles.push({
              x: CANVAS_WIDTH - RIGHT_MARGIN - Math.random() * 5,
              y: Math.random() * CANVAS_HEIGHT,
              vx: 6 + Math.random() * 14,
              vy: -10 - Math.random() * 30,
              life: 0.45 + Math.random() * 0.6,
              maxLife: 0.45 + Math.random() * 0.6,
              size: 2 + Math.random() * 3,
              color: ['#bde9ff', '#8fd3ff', '#64b9ff'][Math.floor(Math.random() * 3)]
            });
          }
          wallIceParticlesRef.current.push(...newIceWallParticles);
        }

        if (wallModeRef.current === 'green' && Math.random() < 0.3) {
          const newGreenWallParticles: Particle[] = [];
          for (let i = 0; i < 2; i++) {
            newGreenWallParticles.push({
              x: LEFT_MARGIN + Math.random() * 5,
              y: Math.random() * CANVAS_HEIGHT,
              vx: -6 - Math.random() * 14,
              vy: -12 - Math.random() * 28,
              life: 0.45 + Math.random() * 0.7,
              maxLife: 0.45 + Math.random() * 0.7,
              size: 2 + Math.random() * 3,
              color: ['#95f7b5', '#6ee7a0', '#3ecf78'][Math.floor(Math.random() * 3)]
            });
          }
          for (let i = 0; i < 2; i++) {
            newGreenWallParticles.push({
              x: CANVAS_WIDTH - RIGHT_MARGIN - Math.random() * 5,
              y: Math.random() * CANVAS_HEIGHT,
              vx: 6 + Math.random() * 14,
              vy: -12 - Math.random() * 28,
              life: 0.45 + Math.random() * 0.7,
              maxLife: 0.45 + Math.random() * 0.7,
              size: 2 + Math.random() * 3,
              color: ['#95f7b5', '#6ee7a0', '#3ecf78'][Math.floor(Math.random() * 3)]
            });
          }
          wallGreenParticlesRef.current.push(...newGreenWallParticles);
        }

        // Update wall fire particles
        wallFireParticlesRef.current = wallFireParticlesRef.current
          .map(p => ({
            ...p,
            x: p.x + p.vx * deltaTime,
            y: p.y + p.vy * deltaTime,
            vy: p.vy + GRAVITY * deltaTime * 0.3, // Light gravity effect
            life: p.life - deltaTime
          }))
          .filter(p => p.life > 0);

        wallIceParticlesRef.current = wallIceParticlesRef.current
          .map(p => ({
            ...p,
            x: p.x + p.vx * deltaTime,
            y: p.y + p.vy * deltaTime,
            vy: p.vy + GRAVITY * deltaTime * 0.12,
            life: p.life - deltaTime
          }))
          .filter(p => p.life > 0);

        wallGreenParticlesRef.current = wallGreenParticlesRef.current
          .map(p => ({
            ...p,
            x: p.x + p.vx * deltaTime,
            y: p.y + p.vy * deltaTime,
            vy: p.vy + GRAVITY * deltaTime * 0.1,
            life: p.life - deltaTime
          }))
          .filter(p => p.life > 0);

        // Update explosion particles
        explosionParticlesRef.current = explosionParticlesRef.current
          .map(p => ({
            ...p,
            x: p.x + p.vx * deltaTime,
            y: p.y + p.vy * deltaTime,
            vy: p.vy + GRAVITY * deltaTime,
            life: p.life - deltaTime
          }))
          .filter(p => p.life > 0);

        // Check finish and stuck detection
        const finalUpdated = afterCollisionUpdated.map((player) => {
          if (player.finished) return player;

          const { x, rotation } = player;
          let { y, vx, vy } = player;

          // Check if reached bottom
          const finishY = CANVAS_HEIGHT - 30;
          const isFinished = y >= finishY;
          if (isFinished) {
            y = finishY;
            vy = 0;
            vx = 0;
          }

          // Detect stuck balls and give them a nudge
          if (!isFinished && y > 100) { // Only check after they've dropped a bit
            const totalSpeed = Math.sqrt(vx * vx + vy * vy);
            if (totalSpeed < 30) { // Ball is moving very slowly, likely stuck
              // Give a random horizontal nudge and ensure downward movement
              vx += (Math.random() - 0.5) * 80;
              vy = Math.max(vy, 100); // Ensure it's moving down
            }
          }

          return {
            ...player,
            x,
            y,
            vx,
            vy,
            rotation,
            finished: isFinished
          };
        });

        // Check if all balls were destroyed in fire mode
        const fireWallsAreActiveForFinish = wallModeRef.current === 'fire';
        if (!finished && fireWallsAreActiveForFinish && finalUpdated.length === 0) {
          finished = true;
          pendingAllDestroyedRef.current = true;
        }

        // Check if anyone finished
        if (!finished) {
          const finisher = finalUpdated.find((p) => p.finished);
          if (finisher) {
            finished = true;
            pendingWinnerRef.current = finisher;
          }
        }

        return finalUpdated;
      });

      // Call setRaceState and callbacks OUTSIDE the setPlayers updater so React
      // batches them with the parent's state changes (onWinner/onAllDestroyed).
      // This prevents the brief window where isRacing=false but raceState is still
      // 'racing', which would re-initialize players and flash images off the balls.
      if (pendingAllDestroyedRef.current) {
        pendingAllDestroyedRef.current = false;
        setRaceState('finished');
        if (onAllDestroyed) {
          onAllDestroyed();
        }
      } else if (pendingWinnerRef.current) {
        const winner = pendingWinnerRef.current;
        pendingWinnerRef.current = null;
        setRaceState('finished');
        onWinner(winner.entry, winner.selectedImageDataUrl, {
          fire: winner.isOnFire,
          ice: winner.isIce,
          green: winner.isGreen,
          lightning: winner.isLightningStruck || winner.lightningAnimUntil !== null
        });
      }

      if (!finished) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [raceState, players.length, pegs, onWinner]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    
    const draw = () => {
      const fireWallsAreActive = wallModeRef.current === 'fire';
      const iceWallsAreActive = wallModeRef.current === 'ice';
      const greenWallsAreActive = wallModeRef.current === 'green';
      const currentTime = Date.now();

      // Clear canvas with gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGradient.addColorStop(0, '#1a1a2e');
      bgGradient.addColorStop(1, '#16213e');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw side walls to show play area boundaries
    const wallGradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
    wallGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    wallGradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.05)');
    wallGradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.05)');
    wallGradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
    
    // Left wall
    ctx.fillStyle = fireWallsAreActive
      ? 'rgba(255, 108, 0, 0.22)'
      : iceWallsAreActive
        ? 'rgba(98, 190, 255, 0.2)'
        : greenWallsAreActive
          ? 'rgba(62, 207, 120, 0.2)'
          : 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(0, 0, LEFT_MARGIN, CANVAS_HEIGHT);
    
    // Right wall
    ctx.fillRect(CANVAS_WIDTH - RIGHT_MARGIN, 0, RIGHT_MARGIN, CANVAS_HEIGHT);
    
    // Draw wall borders
    ctx.strokeStyle = fireWallsAreActive
      ? 'rgba(255, 158, 76, 0.7)'
      : iceWallsAreActive
        ? 'rgba(146, 216, 255, 0.75)'
        : greenWallsAreActive
          ? 'rgba(129, 239, 172, 0.78)'
          : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LEFT_MARGIN, 0);
    ctx.lineTo(LEFT_MARGIN, CANVAS_HEIGHT);
    ctx.moveTo(CANVAS_WIDTH - RIGHT_MARGIN, 0);
    ctx.lineTo(CANVAS_WIDTH - RIGHT_MARGIN, CANVAS_HEIGHT);
    ctx.stroke();

    // Draw finish line
    const finishY = CANVAS_HEIGHT - 30;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(LEFT_MARGIN, finishY);
    ctx.lineTo(CANVAS_WIDTH - RIGHT_MARGIN, finishY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw wall fire particles
    for (const particle of wallFireParticlesRef.current) {
      const alpha = particle.life / particle.maxLife;
      ctx.fillStyle = particle.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#', '');
      // For hex colors, convert properly
      if (particle.color.startsWith('#')) {
        const r = parseInt(particle.color.slice(1, 3), 16);
        const g = parseInt(particle.color.slice(3, 5), 16);
        const b = parseInt(particle.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw wall ice particles
    for (const particle of wallIceParticlesRef.current) {
      const alpha = particle.life / particle.maxLife;
      if (particle.color.startsWith('#')) {
        const r = parseInt(particle.color.slice(1, 3), 16);
        const g = parseInt(particle.color.slice(3, 5), 16);
        const b = parseInt(particle.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw wall green particles
    for (const particle of wallGreenParticlesRef.current) {
      const alpha = particle.life / particle.maxLife;
      if (particle.color.startsWith('#')) {
        const r = parseInt(particle.color.slice(1, 3), 16);
        const g = parseInt(particle.color.slice(3, 5), 16);
        const b = parseInt(particle.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw explosion particles
    for (const particle of explosionParticlesRef.current) {
      const alpha = particle.life / particle.maxLife;
      // Convert hex to rgba
      if (particle.color.startsWith('#')) {
        const r = parseInt(particle.color.slice(1, 3), 16);
        const g = parseInt(particle.color.slice(3, 5), 16);
        const b = parseInt(particle.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw player fire particles
    for (const particle of playerFireParticlesRef.current) {
      const alpha = particle.life / particle.maxLife;
      // Convert hex to rgba
      if (particle.color.startsWith('#')) {
        const r = parseInt(particle.color.slice(1, 3), 16);
        const g = parseInt(particle.color.slice(3, 5), 16);
        const b = parseInt(particle.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw player ice particles
    for (const particle of playerIceParticlesRef.current) {
      const alpha = particle.life / particle.maxLife;
      if (particle.color.startsWith('#')) {
        const r = parseInt(particle.color.slice(1, 3), 16);
        const g = parseInt(particle.color.slice(3, 5), 16);
        const b = parseInt(particle.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText('FINISH', CANVAS_WIDTH / 2, finishY + 15);
    ctx.fillText('FINISH', CANVAS_WIDTH / 2, finishY + 15);

    // Draw pegs
    ctx.fillStyle = '#f39c12';
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 2;
    for (const peg of pegs) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Draw players
    for (const player of players) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.rotation);
      const lightningIsAnimating = player.lightningAnimUntil !== null;
      const lightningIntensity = lightningIsAnimating
        ? Math.max(0, Math.min(1, (player.lightningAnimUntil! - currentTime) / LIGHTNING_ANIMATION_MS))
        : 0;
      
      // Add glow effect for special balls
      if (player.isOnFire) {
        ctx.shadowColor = '#ff6b00';
        ctx.shadowBlur = 15;
      } else if (player.isIce) {
        ctx.shadowColor = '#67b8ff';
        ctx.shadowBlur = 14;
      } else if (player.isGreen) {
        ctx.shadowColor = '#2ecc71';
        ctx.shadowBlur = 14;
      } else if (lightningIsAnimating) {
        ctx.shadowColor = '#fff3b0';
        ctx.shadowBlur = 24;
      } else if (player.isLightningStruck) {
        ctx.shadowColor = '#ffd84d';
        ctx.shadowBlur = 12;
      }
      
      // Player circle
      ctx.fillStyle = player.isGreen ? '#2ecc71' : player.color;
      ctx.strokeStyle = player.isOnFire
        ? '#ff8800'
        : player.isIce
          ? '#6fc9ff'
          : player.isGreen
            ? '#7ff1ae'
            : player.isLightningStruck
              ? '#ffe070'
              : '#fff';
      ctx.lineWidth = player.isOnFire || player.isIce || player.isGreen ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
      ctx.fill();

      const cachedImage = player.selectedImageDataUrl
        ? playerImagesRef.current.get(player.selectedImageDataUrl)
        : undefined;
      if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0 && cachedImage.naturalHeight > 0) {
        const sourceSize = Math.min(cachedImage.naturalWidth, cachedImage.naturalHeight);
        const sx = (cachedImage.naturalWidth - sourceSize) / 2;
        const sy = (cachedImage.naturalHeight - sourceSize) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(player.radius - 1.5, 1), 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          cachedImage,
          sx,
          sy,
          sourceSize,
          sourceSize,
          -player.radius,
          -player.radius,
          player.radius * 2,
          player.radius * 2
        );
        ctx.restore();
      }

      ctx.stroke();

      if (lightningIsAnimating) {
        const topY = -player.y;
        const endY = -player.radius - 2;
        const segments = 7;
        let boltX = (Math.random() - 0.5) * 10;

        ctx.strokeStyle = 'rgba(255, 252, 225, 0.95)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(boltX, topY);
        for (let i = 1; i < segments; i++) {
          const t = i / segments;
          const y = topY + (endY - topY) * t;
          boltX += (Math.random() - 0.5) * 14;
          ctx.lineTo(boltX, y);
        }
        ctx.lineTo(0, endY);
        ctx.stroke();

        // Inner hot core for a brighter central strike.
        ctx.strokeStyle = 'rgba(255, 232, 130, 0.95)';
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.moveTo(0, topY);
        ctx.lineTo((Math.random() - 0.5) * 8, (topY + endY) * 0.5);
        ctx.lineTo(0, endY);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 232, 128, ${0.55 + (1 - lightningIntensity) * 0.35})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 9, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 250, 230, ${0.18 + (1 - lightningIntensity) * 0.18})`;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 13, 0, Math.PI * 2);
        ctx.fill();
      }

      if (player.frozenUntil !== null) {
        ctx.strokeStyle = '#b8ecff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Reset shadow
      ctx.shadowBlur = 0;

      if (!cachedImage || !cachedImage.complete || cachedImage.naturalWidth === 0 || cachedImage.naturalHeight === 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials = player.entry.name
          .split(' ')
          .map(word => word[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
        ctx.fillText(initials, 0, 0);
      }

      ctx.restore();
    }
    
    animId = requestAnimationFrame(draw);
    };
    
    animId = requestAnimationFrame(draw);
    
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [players, pegs]);

  const primaryWinnerEffect = getPrimaryWinnerEffect(currentWinnerEffects);
  const primaryWinnerEffectLabel = getWinnerEffectLabel(primaryWinnerEffect);

  return (
    <div className="racing-game">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="game-canvas" />

      <WinnerDialog
        theme={plinkoTheme}
        show={!!currentWinner && !isRacing}
        isFinals={entries.length === 0}
        winner={{
          name: currentWinner ?? '',
          imageDataUrl: currentWinnerImage,
          allImages: currentWinnerImages,
        }}
        headline="🎯 WINNER 🎯"
        finalsHeadline="🏆 PLINKO CHAMPION 🏆"
        nextLabel="▶ Next Drop"
        detailsNode={
          primaryWinnerEffect && primaryWinnerEffectLabel ? (
            <div className="winner-effect-pill-row" aria-label="Winner round effect">
              <span className={`winner-effect-pill ${primaryWinnerEffect}`}>{primaryWinnerEffectLabel}</span>
            </div>
          ) : undefined
        }
        onNext={onRaceComplete}
        onShowFinalStandings={() => onShowFinalStandings?.()}
      />
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars

function getPrimaryWinnerEffect(effects?: WinnerEffects): 'fire' | 'ice' | 'green' | 'lightning' | null {
  if (!effects) {
    return null;
  }

  if (effects.lightning) {
    return 'lightning';
  }
  if (effects.fire) {
    return 'fire';
  }
  if (effects.ice) {
    return 'ice';
  }
  if (effects.green) {
    return 'green';
  }
  return null;
}

function getWinnerEffectLabel(effect: 'fire' | 'ice' | 'green' | 'lightning' | null): string {
  switch (effect) {
    case 'fire':
      return '🔥 Fire';
    case 'ice':
      return '❄️ Ice';
    case 'green':
      return '🌱 Grow';
    case 'lightning':
      return '⚡ Lightning';
    default:
      return '';
  }
}
