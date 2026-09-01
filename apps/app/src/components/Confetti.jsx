import { useEffect, useRef } from "react";

const COLORS = ["#00F5FF", "#FF00AA", "#7B2CFF", "#ffffff", "#ffd76a"];

export default function Confetti({ onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext("2d");
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * c.width,
      y: -20 - Math.random() * c.height * 0.4,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI,
      vx: (Math.random() - 0.5) * 2.4,
      vy: 2 + Math.random() * 3,
      col: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: 1 + Math.random() * 3,
    }));
    let frames = 0;
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.rot * 0.04;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.col;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frames++;
      if (frames < 110) raf = requestAnimationFrame(draw);
      else onDone();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return <canvas id="confetti" ref={ref}></canvas>;
}
