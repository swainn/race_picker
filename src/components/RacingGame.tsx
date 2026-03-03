import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import './RacingGame.css';

interface Player {
  entry: Entry;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  finished: boolean;
  rotation: number;
}

interface Peg {
  x: number;
  y: number;
  radius: number;
}

interface Props {
  entries: Entry[];
  allEntries: Entry[];
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  onWinner: (winner: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: string | null;
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

export const RacingGame: React.FC<Props> = ({ 
  entries, 
  onWinner, 
  onRaceComplete, 
  onShowFinalStandings, 
  isRacing, 
  currentWinner 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pegs, setPegs] = useState<Peg[]>([]);
  const [raceState, setRaceState] = useState<'ready' | 'racing' | 'finished'>('ready');
  const animationRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number>(0);

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
        x: LEFT_MARGIN + spacing * (index + 1),
        y: 50,
        vx: 0,
        vy: 0,
        color: generateColor(originalIndex, entries.length),
        finished: false,
        rotation: 0
      };
    });

    setPlayers(newPlayers);
  }, [entries, raceState]);

  // Start race when isRacing becomes true
  useEffect(() => {
    if (isRacing && players.length > 0) {
      // Shuffle entries to randomize starting positions
      const shuffledEntries = [...entries];
      for (let i = shuffledEntries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledEntries[i], shuffledEntries[j]] = [shuffledEntries[j], shuffledEntries[i]];
      }

      // Reset player positions with shuffled order
      const playWidth = CANVAS_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
      const resetPlayers: Player[] = shuffledEntries.map((entry, index) => {
        const spacing = playWidth / (shuffledEntries.length + 1);
        // Find original index for consistent color assignment
        const originalIndex = entries.findIndex(e => e.id === entry.id);
        return {
          entry,
          x: LEFT_MARGIN + spacing * (index + 1),
          y: 50,
          vx: 0,
          vy: 0,
          color: generateColor(originalIndex, entries.length),
          finished: false,
          rotation: 0
        };
      });
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
        const updated = prevPlayers.map((player) => {
          if (player.finished) return player;

          // Apply gravity
          let { x, y, vx, vy, rotation } = player;
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
            const minDist = PLAYER_RADIUS + peg.radius;

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
          if (x - PLAYER_RADIUS < LEFT_MARGIN) {
            x = LEFT_MARGIN + PLAYER_RADIUS;
            vx = Math.abs(vx) * BOUNCE_DAMPING;
          } else if (x + PLAYER_RADIUS > CANVAS_WIDTH - RIGHT_MARGIN) {
            x = CANVAS_WIDTH - RIGHT_MARGIN - PLAYER_RADIUS;
            vx = -Math.abs(vx) * BOUNCE_DAMPING;
          }

          return {
            ...player,
            x,
            y,
            vx,
            vy,
            rotation,
            finished: false
          };
        });

        // Handle ball-to-ball collisions
        for (let i = 0; i < updated.length; i++) {
          for (let j = i + 1; j < updated.length; j++) {
            const ballA = updated[i];
            const ballB = updated[j];
            
            // Skip if either ball has finished
            if (ballA.finished || ballB.finished) continue;
            
            const dx = ballB.x - ballA.x;
            const dy = ballB.y - ballA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = PLAYER_RADIUS * 2;
            
            if (distance < minDist && distance > 0.1) {
              // Collision detected!
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

        // Check finish and stuck detection
        const finalUpdated = updated.map((player) => {
          if (player.finished) return player;

          let { x, y, vx, vy, rotation } = player;

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

        // Check if anyone finished
        if (!finished) {
          const finisher = finalUpdated.find((p) => p.finished);
          if (finisher) {
            finished = true;
            setRaceState('finished');
            onWinner(finisher.entry);
          }
        }

        return finalUpdated;
      });

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
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(0, 0, LEFT_MARGIN, CANVAS_HEIGHT);
    
    // Right wall
    ctx.fillRect(CANVAS_WIDTH - RIGHT_MARGIN, 0, RIGHT_MARGIN, CANVAS_HEIGHT);
    
    // Draw wall borders
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
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
      
      // Player circle
      ctx.fillStyle = player.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Player initials
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

      ctx.restore();
    }
  }, [players, pegs]);

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
                ▶ Next Drop
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
