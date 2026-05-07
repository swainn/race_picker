import { useEffect, useRef, useState } from 'react';

interface RunnerGameProps {
  open: boolean;
  onClose: () => void;
}

const CANVAS_W = 800;
const CANVAS_H = 300;
const GROUND_Y = 268;
const GRAVITY = 1.2;
const JUMP_VELOCITY = -18;
const SCROLL_SPEED = 6;
const HIGH_SCORE_KEY = 'wheel_runner_high_score';

interface Player {
  x: number;
  y: number;
  vy: number;
  w: number;
  h: number;
  jumping: boolean;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadHighScore(): number {
  try {
    const v = localStorage.getItem(HIGH_SCORE_KEY);
    return v ? Number.parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // ignore
  }
}

export function RunnerGame({ open, onClose }: RunnerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [highScore, setHighScore] = useState<number>(() => loadHighScore());

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const player: Player = {
      x: 60,
      y: GROUND_Y - 48,
      vy: 0,
      w: 32,
      h: 48,
      jumping: false,
    };
    let obstacles: Obstacle[] = [];
    let frame = 0;
    let score = 0;
    let gameOver = false;
    let nextObstacleFrame = 60;
    let rafId: number | null = null;
    let active = true;
    let localHighScore = loadHighScore();

    const resetGame = () => {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.jumping = false;
      obstacles = [];
      frame = 0;
      score = 0;
      gameOver = false;
      nextObstacleFrame = 60;
    };

    const spawnObstacle = () => {
      const obsHeight = 32 + Math.random() * 24;
      obstacles.push({
        x: CANVAS_W,
        y: GROUND_Y - obsHeight,
        w: 24 + Math.random() * 24,
        h: obsHeight,
      });
      nextObstacleFrame = frame + 40 + Math.floor(Math.random() * 60);
    };

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.fillStyle = '#333';
      ctx.fillRect(0, GROUND_Y, CANVAS_W, 32);

      ctx.fillStyle = '#ff7518';
      ctx.fillRect(player.x, player.y, player.w, player.h);

      ctx.fillStyle = '#fff';
      for (const obs of obstacles) {
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      }

      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(`Score: ${score}`, 24, 40);
      ctx.fillText(`High: ${localHighScore}`, 24, 70);

      if (gameOver) {
        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = '#ff7518';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over!', CANVAS_W / 2, 150);
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('Press Space to Restart, Esc to Exit', CANVAS_W / 2, 180);
      }
    };

    const update = () => {
      if (gameOver) return;
      frame += 1;
      score = Math.floor(frame / 5);

      player.vy += GRAVITY;
      player.y += player.vy;
      if (player.y > GROUND_Y - player.h) {
        player.y = GROUND_Y - player.h;
        player.vy = 0;
        player.jumping = false;
      }

      for (const obs of obstacles) {
        obs.x -= SCROLL_SPEED;
      }
      obstacles = obstacles.filter((obs) => obs.x + obs.w > 0);
      if (frame === nextObstacleFrame) spawnObstacle();

      for (const obs of obstacles) {
        if (
          player.x < obs.x + obs.w &&
          player.x + player.w > obs.x &&
          player.y < obs.y + obs.h &&
          player.y + player.h > obs.y
        ) {
          gameOver = true;
          if (score > localHighScore) {
            localHighScore = score;
            saveHighScore(localHighScore);
            setHighScore(localHighScore);
          }
        }
      }
    };

    const loop = () => {
      if (!active) return;
      draw();
      update();
      rafId = requestAnimationFrame(loop);
    };

    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (gameOver) {
          resetGame();
        } else if (!player.jumping) {
          player.vy = JUMP_VELOCITY;
          player.jumping = true;
        }
      }
    };

    resetGame();
    document.addEventListener('keydown', onKey);
    rafId = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="runner-game-overlay" role="dialog" aria-modal="true">
      <div className="runner-game-card">
        <div className="runner-game-header">
          <span className="runner-game-title">🏃 Runner</span>
          <span className="runner-game-hint">Space / ↑ to jump · Esc to exit</span>
          <button onClick={onClose} className="runner-game-close" aria-label="Close runner game">
            ✕
          </button>
        </div>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="runner-game-canvas" />
        <div className="runner-game-footer">High score: {highScore}</div>
      </div>
    </div>
  );
}
