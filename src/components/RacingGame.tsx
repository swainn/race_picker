import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import './RacingGame.css';

const VEHICLE_MODES = ['car', 'boat', 'plane', 'balloon', 'rocket', 'duck', 'snail', 'turtle', 'cat', 'dog'] as const;
type VehicleMode = (typeof VEHICLE_MODES)[number];
type RacingMode = VehicleMode | 'mixed';

interface Racer {
  entry: Entry;
  x: number;
  speed: number;
  color: string;
  finished: boolean;
  totalDistance?: number;
  previousSpeed?: number;
  spinAngle?: number;
  laneIndex: number;
  vehicleMode: VehicleMode;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  type: 'smoke' | 'fire';
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
  const [particles, setParticles] = useState<Particle[]>([]);
  const [tickerTime, setTickerTime] = useState(0);
  const animationRef = useRef<number | undefined>(undefined);

  const FINISH_LINE = 700;
  const LABEL_PADDING = 24;
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
        x: 50,
        speed: 0,
        color: generateColor(index, Math.max(displayEntries.length, 2)),
        finished: false,
        previousSpeed: 0,
        spinAngle: 0,
        laneIndex,
        vehicleMode: mode === 'mixed' ? mixedModes[index] : mode,
      };
    });

    setRacers(newRacers);
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
          x: 50,
          speed: 0,
          color: generateColor(index, Math.max(displayEntries.length, 2)),
          finished: false,
          previousSpeed: 0,
          spinAngle: 0,
          laneIndex,
          vehicleMode: mode === 'mixed' ? mixedModes[index] : mode,
        };
      });
      setRacers(newRacers);
      setRaceState('racing');
    } else if (!isRacing && raceState === 'racing') {
      setRaceState('ready');
    }
  }, [isRacing, entries, allEntries, mode]);

  // Start race
  useEffect(() => {
    if (raceState !== 'racing' || racers.length === 0) return;

    const startTime = Date.now();
    const TRACK_LENGTH = FINISH_LINE - 50;
    const totalLanes = Math.max(allEntries.length, 2);
    
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

    const createSmokeParticles = (x: number, y: number) => {
      const newParticles: Particle[] = [];
      const particleCount = 8;
      
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
        const speed = 30 + Math.random() * 40;
        
        newParticles.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.6,
          maxLife: 0.6,
          type: 'smoke',
        });
      }
      
      setParticles((prev) => [...prev, ...newParticles]);
    };

    const createFireParticles = (x: number, y: number) => {
      const newParticles: Particle[] = [];
      const particleCount = 6;
      
      for (let i = 0; i < particleCount; i++) {
        // Fire shoots backward (in negative x direction) with upward bias
        const angle = Math.PI + (Math.random() - 0.5) * 0.8;
        const speed = 60 + Math.random() * 80;
        
        newParticles.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 4,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40, // upward bias
          life: 0.4,
          maxLife: 0.4,
          type: 'fire',
        });
      }
      
      setParticles((prev) => [...prev, ...newParticles]);
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;

      setRacers((prevRacers) => {
        const updated = prevRacers.map((racer, idx) => {
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
          
          const x = Math.min(50 + totalDistance, FINISH_LINE);
          const isFinished = x >= FINISH_LINE;
          
          // Get current speed based on distance traveled
          const currentSegment = Math.floor(totalDistance / profile.segmentDistance);
          const currentSpeed = profile.speeds[Math.min(currentSegment, profile.speeds.length - 1)];
          const prevSpeed = racer.previousSpeed || currentSpeed;
          
          // Check if car is slowing down significantly
          if (prevSpeed - currentSpeed > 20) {
            const trackHeight = (600 - 60) / totalLanes;
            const trackTop = 30;
            const laneIndex = racer.laneIndex ?? idx;
            const y = trackTop + laneIndex * trackHeight + trackHeight / 2;
            createSmokeParticles(racer.x, y);
          }

          // Check if car is speeding up significantly
          if (currentSpeed - prevSpeed > 20) {
            const trackHeight = (600 - 60) / totalLanes;
            const trackTop = 30;
            const laneIndex = racer.laneIndex ?? idx;
            const y = trackTop + laneIndex * trackHeight + trackHeight / 2;
            createFireParticles(racer.x, y);
          }

          return {
            ...racer,
            x,
            totalDistance,
            speed: currentSpeed,
            previousSpeed: currentSpeed,
            spinAngle: prevSpeed - currentSpeed > 20 ? (racer.spinAngle || 0) + (Math.random() - 0.5) * 0.4 : (racer.spinAngle || 0) * 0.95,
            finished: isFinished,
          };
        });

        // Check if anyone finished - use distance as tiebreaker
        if (!finished) {
          const finishers = updated.filter((r) => r.finished);
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

        return updated;
      });

      if (!finished && elapsed < RACE_DURATION) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    // Update particles
    const particleInterval = setInterval(() => {
      setParticles((prev) => {
        const dt = 0.016; // ~60fps
        return prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            life: p.life - dt,
            vy: p.vy + 100 * dt, // gravity
          }))
          .filter((p) => p.life > 0);
      });
    }, 16);

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      clearInterval(particleInterval);
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
    const trackTop = 30;
    const trackHeight = (canvas.height - 60) / numLanes;

    // Draw track
    ctx.fillStyle = '#505050';
    for (let idx = 0; idx < numLanes; idx++) {
      const y = trackTop + idx * trackHeight;
      ctx.fillRect(0, y, canvas.width, trackHeight);
      
      // Draw lane lines
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + trackHeight);
      ctx.lineTo(canvas.width, y + trackHeight);
      ctx.stroke();
    }

    // Draw finish line with checkered pattern
    const finishLineWidth = 30;
    const checkerSize = 10;
    const finishLineHeight = canvas.height - 60;
    
    // Draw checkered pattern
    for (let y = trackTop; y < trackTop + finishLineHeight; y += checkerSize) {
      for (let x = 0; x < finishLineWidth; x += checkerSize) {
        // Alternate black and white squares
        const isBlack = ((Math.floor(y / checkerSize) + Math.floor(x / checkerSize)) % 2 === 0);
        ctx.fillStyle = isBlack ? '#000' : '#fff';
        ctx.fillRect(FINISH_LINE - finishLineWidth / 2 + x, y, checkerSize, checkerSize);
      }
    }
    
    // Draw "FINISH" text vertically centered on the finish line
    ctx.save();
    ctx.translate(FINISH_LINE, trackTop + finishLineHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText('FINISH', 0, 0);
    ctx.fillText('FINISH', 0, 0);
    ctx.restore();

    // Draw racers
    racers.forEach((racer) => {
      const trackHeight = (canvas.height - 60) / numLanes;
      const laneY = trackTop + racer.laneIndex * trackHeight + trackHeight / 2;

      // Draw car or boat with rotation effect
      ctx.save();
      ctx.translate(racer.x, laneY);
      
      const renderMode = mode === 'mixed' ? racer.vehicleMode : mode;

      // Add rocking motion for boats based on horizontal position
      let totalRotation = racer.spinAngle || 0;
      if (renderMode === 'boat') {
        const rockAmount = Math.sin((racer.x + performance.now() / 500) * 0.02) * 0.15; // gentle rocking
        totalRotation += rockAmount;
      }
      
      ctx.rotate(totalRotation);
      
      // Flip boats horizontally so they face forward
      if (renderMode === 'boat') {
        ctx.scale(-1, 1);
      }
      
      ctx.translate(-racer.x, -laneY);
      if (renderMode === 'boat') {
        drawBoat(ctx, racer.x, laneY, racer.color);
      } else if (renderMode === 'plane') {
        drawPlane(ctx, racer.x, laneY, racer.color);
      } else if (renderMode === 'balloon') {
        drawBalloon(ctx, racer.x, laneY, racer.color);
      } else if (renderMode === 'rocket') {
        ctx.save();
        ctx.translate(racer.x, laneY);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-racer.x, -laneY);
        drawRocket(ctx, racer.x, laneY, racer.color);
        ctx.restore();
      } else if (renderMode === 'duck') {
        drawDuck(ctx, racer.x, laneY, racer.color);
      } else if (renderMode === 'snail') {
        drawSnail(ctx, racer.x, laneY, racer.color);
      } else if (renderMode === 'turtle') {
        drawTurtle(ctx, racer.x, laneY, racer.color);
      } else if (renderMode === 'cat') {
        drawCat(ctx, racer.x, laneY, racer.color);
      } else if (renderMode === 'dog') {
        drawDog(ctx, racer.x, laneY, racer.color);
      } else {
        drawCar(ctx, racer.x, laneY, racer.color);
      }
      ctx.restore();
    });

    // Static lane nameplates with placement
    const getOrdinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const labelAreaX = FINISH_LINE + LABEL_PADDING;
    const labelAreaWidth = canvas.width - labelAreaX - LABEL_PADDING;
    const labelAreaY = trackTop;
    const labelAreaHeight = finishLineHeight;

    ctx.save();
    ctx.beginPath();
    ctx.rect(labelAreaX, labelAreaY, labelAreaWidth, labelAreaHeight);
    ctx.clip();

    ctx.font = '12px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const labelData = allEntries.map((entry, laneIdx) => {
      const trackHeight = (canvas.height - 60) / numLanes;
      const y = trackTop + laneIdx * trackHeight + trackHeight / 2;
      const order = winOrder.get(entry.id);
      const isEliminated = eliminatedIds.includes(entry.id);
      const label = order ? `${entry.name} (${getOrdinal(order)})` : entry.name;
      const textWidth = ctx.measureText(label).width;
      return { label, y, isEliminated, textWidth };
    });

    const maxLabelWidth = Math.max(...labelData.map((item) => item.textWidth), 0);
    const speed = 30; // pixels per second
    const gap = Math.max(40, labelAreaWidth * 0.2);
    const cycle = maxLabelWidth + gap;
    const offset = ((tickerTime / 1000) * speed) % cycle;

    labelData.forEach(({ label, y, isEliminated }) => {
      ctx.fillStyle = isEliminated ? '#bfbfbf' : '#fff';
      const labelX = FINISH_LINE + LABEL_PADDING;
      const animatedX = labelX - offset;

      ctx.fillText(label, animatedX, y);
      ctx.fillText(label, animatedX + cycle, y);
    });

    ctx.restore();

    // Draw smoke particles
    particles.forEach((particle) => {
      const opacity = particle.life / particle.maxLife;
      
      if (particle.type === 'smoke') {
        ctx.fillStyle = `rgba(150, 150, 150, ${0.6 * opacity})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 4 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.type === 'fire') {
        // NOS-style blue flames
        const hue = 200 + Math.random() * 20; // blue-cyan range
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${0.85 * opacity})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 3 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner electric glow
        ctx.fillStyle = `hsla(195, 100%, 75%, ${0.55 * opacity})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    return () => {};
  }, [racers, particles, allEntries, eliminatedIds, winOrder, tickerTime]);

  const drawCar = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    const carWidth = 20;  // horizontal width (length)
    const carHeight = 12;  // vertical height
    const wheelRadius = 3;
    const wheelOffsetY = 6;  // wheels offset vertically

    // Draw wheels (top and bottom, visible on sides)
    ctx.fillStyle = '#000';  // Black wheels
    // Front top wheel
    ctx.beginPath();
    ctx.arc(x + 6, y - wheelOffsetY, wheelRadius, 0, Math.PI * 2);
    ctx.fill();
    // Front bottom wheel
    ctx.beginPath();
    ctx.arc(x + 6, y + wheelOffsetY, wheelRadius, 0, Math.PI * 2);
    ctx.fill();
    // Rear top wheel
    ctx.beginPath();
    ctx.arc(x - 6, y - wheelOffsetY, wheelRadius, 0, Math.PI * 2);
    ctx.fill();
    // Rear bottom wheel
    ctx.beginPath();
    ctx.arc(x - 6, y + wheelOffsetY, wheelRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw car body with rounded corners
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - carWidth / 2, y - carHeight / 2, carWidth, carHeight, 3);
    ctx.fill();

    // Draw spoiler at the back (left side)
    ctx.fillStyle = '#222';
    ctx.fillRect(x - carWidth / 2 - 3, y - carHeight / 2 + 2, 3, carHeight - 4);
    ctx.fillRect(x - carWidth / 2 - 5, y - carHeight / 2 + 1, 2, carHeight - 2);

    // Draw windshield (front window on the right side)
    ctx.fillStyle = '#4af';
    ctx.beginPath();
    ctx.roundRect(x + carWidth / 2 - 6, y - carHeight / 2 + 2, 4, carHeight - 4, 2);
    ctx.fill();

    // Draw rear window (back window on the left side)
    ctx.beginPath();
    ctx.roundRect(x - carWidth / 2 + 2, y - carHeight / 2 + 2, 4, carHeight - 4, 2);
    ctx.fill();

    // Car outline with rounded corners
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - carWidth / 2, y - carHeight / 2, carWidth, carHeight, 3);
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
      <canvas ref={canvasRef} width={840} height={600} className="game-canvas" />

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
