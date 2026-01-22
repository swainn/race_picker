import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import './RacingGame.css';

interface Racer {
  entry: Entry;
  x: number;
  speed: number;
  color: string;
  finished: boolean;
}

interface Props {
  entries: Entry[];
  onWinner: (winner: Entry) => void;
  onRaceComplete: () => void;
}

export const RacingGame: React.FC<Props> = ({ entries, onWinner, onRaceComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [racers, setRacers] = useState<Racer[]>([]);
  const [raceState, setRaceState] = useState<'ready' | 'racing' | 'finished'>('ready');
  const [winner, setWinner] = useState<Entry | null>(null);
  const animationRef = useRef<number | undefined>(undefined);

  const FINISH_LINE = 700;
  const RACE_DURATION = 4500; // milliseconds

  // Initialize racers
  useEffect(() => {
    if (entries.length === 0) return;

    const newRacers = entries.map((entry, index) => ({
      entry,
      x: 50,
      speed: 0,
      color: generateColor(index, entries.length),
      finished: false,
    }));

    setRacers(newRacers);
    setRaceState('ready');
    setWinner(null);
  }, [entries]);

  // Start race
  useEffect(() => {
    if (raceState !== 'racing' || racers.length === 0) return;

    const startTime = Date.now();
    const TRACK_LENGTH = FINISH_LINE - 50;
    
    // Generate speed changes for each racer
    const racerSpeedProfiles = racers.map(() => {
      const numChanges = Math.floor(Math.random() * 3) + 2; // 2-4 speed changes
      const speeds: number[] = [];
      
      // Generate random speeds for each segment
      for (let i = 0; i < numChanges; i++) {
        speeds.push(Math.random() * 200 + 80); // 80-280 pixels per second
      }
      
      return { speeds, segmentDistance: TRACK_LENGTH / numChanges };
    });

    let finished = false;

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

          return {
            ...racer,
            x,
            speed: currentSpeed,
            finished: isFinished,
          };
        });

        // Check if anyone finished
        if (!finished) {
          const firstFinisher = updated.find((r) => r.finished);
          if (firstFinisher) {
            finished = true;
            setWinner(firstFinisher.entry);
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

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [raceState, racers.length, onWinner]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw track
    ctx.fillStyle = '#505050';
    const trackTop = 30;
    const trackHeight = (canvas.height - 60) / racers.length;

    racers.forEach((_, idx) => {
      const y = trackTop + idx * trackHeight;
      ctx.fillRect(0, y, canvas.width, trackHeight);
      
      // Draw lane lines
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + trackHeight);
      ctx.lineTo(canvas.width, y + trackHeight);
      ctx.stroke();
    });

    // Draw finish line
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(FINISH_LINE, trackTop);
    ctx.lineTo(FINISH_LINE, canvas.height - 30);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw racers
    racers.forEach((racer, idx) => {
      const trackTop = 30;
      const trackHeight = (canvas.height - 60) / racers.length;
      const y = trackTop + idx * trackHeight + trackHeight / 2;

      // Draw car with wheels
      drawCar(ctx, racer.x, y, racer.color);

      // Name label
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(racer.entry.name.substring(0, 8), racer.x, y + 18);
    });

    return () => {};
  }, [racers]);

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

  const startRace = () => {
    if (entries.length > 0) {
      setRaceState('racing');
    }
  };

  const resetRace = () => {
    setRaceState('ready');
    setWinner(null);
    onRaceComplete();
  };

  return (
    <div className="racing-game">
      <canvas ref={canvasRef} width={800} height={400} className="game-canvas" />

      {raceState === 'ready' && (
        <button onClick={startRace} className="race-button">
          🏁 Start Race
        </button>
      )}

      {raceState === 'finished' && winner && (
        <div className="winner-display">
          <div className="winner-banner">
            <h2>🏆 WINNER 🏆</h2>
            <p className="winner-name">{winner.name}</p>
            <button onClick={resetRace} className="reset-button">
              Pick Another
            </button>
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
  ];
  return colors[index % colors.length];
}
