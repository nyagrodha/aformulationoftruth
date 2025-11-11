import React, { useEffect, useRef } from 'react';

export default function Bhairava() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Bhairava visual parameters
    const particles = [];
    const flames = [];
    const mandalas = [];
    let time = 0;

    // Particle system for energy field
    class Particle {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.life = 1;
        this.decay = Math.random() * 0.02 + 0.005;
        this.size = Math.random() * 3 + 1;
        this.color = {
          r: Math.random() * 100 + 155,
          g: Math.random() * 50,
          b: Math.random() * 50
        };
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.vy -= 0.02; // Upward drift
      }

      draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Flame effect
    class Flame {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.height = Math.random() * 100 + 50;
        this.width = Math.random() * 20 + 10;
        this.offset = Math.random() * Math.PI * 2;
        this.speed = Math.random() * 0.1 + 0.05;
      }

      update(time) {
        this.offset += this.speed;
      }

      draw(ctx, time) {
        const flicker = Math.sin(time * 10 + this.offset) * 5;
        const gradient = ctx.createLinearGradient(
          this.x, this.y,
          this.x, this.y - this.height
        );
        gradient.addColorStop(0, '#ff4500');
        gradient.addColorStop(0.5, '#ff8c00');
        gradient.addColorStop(1, '#ffff00');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(
          this.x + flicker,
          this.y - this.height / 2,
          this.width / 2,
          this.height / 2,
          0, 0, Math.PI * 2
        );
        ctx.fill();
      }
    }

    // Sacred geometry mandala
    class Mandala {
      constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.rotation = 0;
        this.layers = 6;
      }

      update() {
        this.rotation += 0.01;
      }

      draw(ctx, time) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Draw multiple layers
        for (let layer = 0; layer < this.layers; layer++) {
          const layerRadius = this.radius * (1 - layer * 0.15);
          const spokes = 8 + layer * 4;

          ctx.strokeStyle = `hsl(${(time * 50 + layer * 60) % 360}, 70%, 50%)`;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.7 - layer * 0.1;

          // Draw spokes
          for (let i = 0; i < spokes; i++) {
            const angle = (Math.PI * 2 * i) / spokes;
            const x1 = Math.cos(angle) * (layerRadius * 0.3);
            const y1 = Math.sin(angle) * (layerRadius * 0.3);
            const x2 = Math.cos(angle) * layerRadius;
            const y2 = Math.sin(angle) * layerRadius;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Draw connecting circles
            ctx.beginPath();
            ctx.arc(x2, y2, 3, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Central circle
          ctx.beginPath();
          ctx.arc(0, 0, layerRadius * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // Initialize elements
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Create flames around the perimeter
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const radius = Math.min(canvas.width, canvas.height) * 0.4;
      flames.push(new Flame(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius
      ));
    }

    // Create central mandala
    mandalas.push(new Mandala(centerX, centerY, 200));

    // Animation loop
    const animate = () => {
      time += 0.016;

      // Clear canvas with fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Create new particles from center
      if (Math.random() < 0.3) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 50;
        particles.push(new Particle(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius
        ));
      }

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
          particles.splice(i, 1);
        } else {
          particles[i].draw(ctx);
        }
      }

      // Update and draw flames
      flames.forEach(flame => {
        flame.update(time);
        flame.draw(ctx, time);
      });

      // Update and draw mandalas
      mandalas.forEach(mandala => {
        mandala.update();
        mandala.draw(ctx, time);
      });

      // Draw central fierce eye
      const eyeSize = 30 + Math.sin(time * 5) * 10;
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, eyeSize);
      gradient.addColorStop(0, '#ff0000');
      gradient.addColorStop(0.7, '#ff4500');
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, eyeSize, 0, Math.PI * 2);
      ctx.fill();

      // Draw pupil
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(centerX, centerY, eyeSize * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Energy waves
      for (let i = 0; i < 3; i++) {
        const waveRadius = 100 + i * 80 + Math.sin(time * 2 + i) * 20;
        ctx.strokeStyle = `hsla(${(time * 100 + i * 120) % 360}, 100%, 50%, ${0.5 - i * 0.15})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, waveRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const containerStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000',
    overflow: 'hidden',
    fontFamily: "'Orbitron', sans-serif"
  };

  const overlayStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    color: '#ff4500',
    textShadow: '0 0 20px #ff4500',
    zIndex: 10,
    pointerEvents: 'none'
  };

  const titleStyle = {
    fontSize: 'clamp(2rem, 6vw, 4rem)',
    fontWeight: 'bold',
    marginBottom: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.2em'
  };

  const subtitleStyle = {
    fontSize: 'clamp(1rem, 3vw, 1.5rem)',
    opacity: 0.8,
    marginTop: '2rem'
  };

  return (
    <div style={containerStyle}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1
        }}
      />
      <div style={overlayStyle}>
        <h1 style={titleStyle}>भैरव</h1>
        <h2 style={titleStyle}>Bhairava</h2>
        <p style={subtitleStyle}>The Fierce Guardian of Truth</p>
        <p style={{ ...subtitleStyle, marginTop: '1rem', fontSize: '0.9rem' }}>
          Check your email for the sacred link
        </p>
      </div>
    </div>
  );
}