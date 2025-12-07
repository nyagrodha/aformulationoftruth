import React, { useEffect, useRef, useState } from 'react';

type IntroPhase = 'flickering' | 'dark' | 'pulsing' | 'scrolled';

type MediaElement =
  | {
      type: 'text';
      content: string;
      position: number;
      duration: number;
      style?: React.CSSProperties;
    }
  | {
      type: 'image' | 'video';
      src: string;
      position: number;
      duration: number;
      style?: React.CSSProperties;
    }
  | {
      type: 'audio';
      src: string;
      position: number;
      duration: number;
      style?: React.CSSProperties;
    };

const LongScrollShowcase = (): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [introPhase, setIntroPhase] = useState<IntroPhase>('flickering'); // 'flickering', 'dark', 'pulsing', 'scrolled'

  useEffect(() => {
    // Intro sequence timing - much faster, stranger sooner
    const flickerTimer = window.setTimeout(() => {
      setIntroPhase('dark');
    }, 800); // Flicker for less than a second

    const darkTimer = window.setTimeout(() => {
      setIntroPhase('pulsing');
    }, 1500); // Dark for only 0.7 seconds (800 + 700)

    return () => {
      window.clearTimeout(flickerTimer);
      window.clearTimeout(darkTimer);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight || 1;
      const progress = scrollTop / scrollHeight;
      setScrollProgress(progress);

      // Switch to scrolled mode once user starts scrolling
      if (scrollTop > 50 && introPhase !== 'scrolled') {
        setIntroPhase('scrolled');
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [introPhase]);

  const mediaElements: MediaElement[] = [
    {
      type: 'text',
      content: 'yaireva patanam dravyaih siddhistaireva coditaa',
      position: 5,
      duration: 95,
      style: { fontSize: '4rem', color: '#ff00ff', textAlign: 'center' },
    },
    {
      type: 'text',
      content: 'Memory-intimate architect of sound and meaning',
      position: 15,
      duration: 30,
      style: { fontSize: '2.5rem', color: '#00ffff', fontStyle: 'italic' },
    },
    {
      type: 'image',
      src: '',
      position: 25,
      duration: 40,
      style: { borderRadius: '20px', boxShadow: '0 0 30px #ff00ff' },
    },
    {
      type: 'text',
      content: 'For in happiness all that is earthly seeks its downfall',
      position: 35,
      duration: 25,
      style: { fontSize: '3rem', color: '#ccff00', textAlign: 'right' },
    },
    {
      type: 'image',
      src: '',
      position: 45,
      duration: 35,
      style: { borderRadius: '15px', maxWidth: '80vw' },
    },
    {
      type: 'text',
      content: '',
      position: 55,
      duration: 20,
      style: { fontSize: '2rem', color: '#ff6600', transform: 'rotate(-5deg)' },
    },
    {
      type: 'image',
      src: 'https://via.placeholder.com/800x600/00ffff/000000?text=Culture+II',
      position: 65,
      duration: 30,
      style: { borderRadius: '50%', boxShadow: '0 0 50px #00ffff' },
    },
    {
      type: 'text',
      content: '',
      position: 75,
      duration: 15,
      style: { fontSize: '2.8rem', color: '#ff00ff', textAlign: 'center' },
    },
    {
      type: 'audio',
      src: '',
      position: 80,
      duration: 15,
      style: {
        background: 'rgba(255,255,255,0.1)',
        padding: '2rem',
        borderRadius: '10px',
      },
    },
    {
      type: 'text',
      content: 'Only in good fortune is its downfall destined to find it',
      position: 85,
      duration: 15,
      style: {
        fontSize: '3.5rem',
        color: '#ccff00',
        textAlign: 'center',
        textShadow: '0 0 20px #ccff00',
      },
    },
  ];

  const isElementVisible = (element: MediaElement, progress: number): boolean => {
    const start = element.position / 100;
    const end = (element.position + element.duration) / 100;
    return progress >= start && progress <= end;
  };

  const getElementOpacity = (element: MediaElement, progress: number): number => {
    const start = element.position / 100;
    const end = (element.position + element.duration) / 100;
    const fadeIn = 0.02; // 2% fade in
    const fadeOut = 0.02; // 2% fade out

    if (progress < start) return 0;
    if (progress > end) return 0;

    if (progress < start + fadeIn) {
      return (progress - start) / fadeIn;
    }
    if (progress > end - fadeOut) {
      return (end - progress) / fadeOut;
    }
    return 1;
  };

  const renderMediaElement = (element: MediaElement, index: number): React.ReactNode => {
    if (!isElementVisible(element, scrollProgress)) return null;

    const opacity = getElementOpacity(element, scrollProgress);
    const baseStyle = {
      position: 'absolute' as const,
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      opacity,
      transition: 'opacity 0.1s ease-out',
      zIndex: 10 + index,
      ...(element.style ?? {}),
    };

    switch (element.type) {
      case 'text':
        return (
          <div key={`text-${index}`} style={baseStyle}>
            {element.content}
          </div>
        );

      case 'image':
        return (
          <img
            key={`image-${index}`}
            src={element.src}
            alt={`Media element ${index}`}
            style={{ ...baseStyle, maxWidth: '90vw', maxHeight: '90vh' }}
          />
        );

      case 'video':
        return (
          <video
            key={`video-${index}`}
            src={element.src}
            autoPlay
            muted
            loop
            style={{ ...baseStyle, maxWidth: '90vw', maxHeight: '90vh' }}
          />
        );

      case 'audio':
        return (
          <div key={`audio-${index}`} style={baseStyle}>
            <audio controls autoPlay loop>
              <source src={element.src} type="audio/mpeg" />
            </audio>
            <div
              style={{
                marginTop: '1rem',
                color: '#00ffff',
                fontSize: '1.2rem',
              }}
            >
              Ambient soundscape
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        height: "100vh",
        overflowY: "scroll",
        backgroundColor: "#000",
        fontFamily: "'Orbitron', sans-serif",
        scrollBehavior: "smooth",
        position: "relative",
      }}
    >
      {/* Main scroll content - 20000px for 4-5 minute scroll */}
      <div style={{ height: "20000px", position: "relative" }}>
        {/* Background that changes based on intro phase and scroll */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background:
              introPhase === "scrolled"
                ? `linear-gradient(
                  ${scrollProgress * 360}deg,
                  rgba(255,0,255,${0.1 + scrollProgress * 0.1}),
                  rgba(0,255,255,${0.1 + scrollProgress * 0.1}),
                  rgba(204,255,0,${0.1 + scrollProgress * 0.1})
                )`
                : introPhase === "dark"
                  ? "#000000"
                  : "#f5f5dc", // Warm white (beige)
            zIndex: 1,
            animation:
              introPhase === "flickering"
                ? "flicker 0.08s infinite linear"
                : introPhase === "pulsing"
                  ? "pulse-warm 2s infinite ease-in-out"
                  : "none",
          }}
        />

        {/* Persistent unsettling background element */}
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) rotate(${scrollProgress * 720}deg) scale(${1 + scrollProgress * 2})`,
            fontSize: "12rem",
            color: `rgba(255,0,255,${0.02 + scrollProgress * 0.08})`,
            zIndex: 2,
            textAlign: "center",
            pointerEvents: "none",
            transition: "transform 0.05s ease-out",
            fontWeight: "100",
          }}
        >
          ?
        </div>

        {/* Floating particles */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={`particle-${i}`}
            style={{
              position: "fixed",
              width: "4px",
              height: "4px",
              backgroundColor: ["#ff00ff", "#00ffff", "#ccff00"][i % 3],
              borderRadius: "50%",
              left: `${10 + i * 4}%`,
              top: `${20 + Math.sin(scrollProgress * Math.PI * 4 + i) * 30}%`,
              opacity: 0.6,
              zIndex: 5,
              boxShadow: `0 0 10px ${["#ff00ff", "#00ffff", "#ccff00"][i % 3]}`,
            }}
          />
        ))}

        {/* Media elements container - only show after intro */}
        {introPhase === "scrolled" && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 10,
            }}
          >
            {mediaElements.map((element, index) =>
              renderMediaElement(element, index),
            )}
          </div>
        )}

        {/* Scroll hint during pulsing phase */}
        {introPhase === "pulsing" && (
          <div
            style={{
              position: "fixed",
              bottom: "4rem",
              left: "50%",
              transform: "translateX(-50%)",
              color: "#8b4513",
              fontSize: "1.2rem",
              zIndex: 100,
              textAlign: "center",
              animation: "pulse 2s infinite",
              textShadow: "0 0 10px rgba(139, 69, 19, 0.5)",
            }}
          >
            ↓ Scroll slowly to experience the journey ↓
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes flicker {
          0% {
            background-color: #f5f5dc;
            opacity: 1;
          }
          3% {
            background-color: #ff0000;
            opacity: 0.1;
          }
          7% {
            background-color: #d3d3e6;
            opacity: 1;
          }
          12% {
            background-color: #000000;
            opacity: 0.3;
          }
          18% {
            background-color: #8080b3;
            opacity: 1;
          }
          25% {
            background-color: #ff00ff;
            opacity: 0.2;
          }
          35% {
            background-color: #303080;
            opacity: 1;
          }
          42% {
            background-color: #000000;
            opacity: 0.1;
          }
          50% {
            background-color: #202060;
            opacity: 1;
          }
          58% {
            background-color: #00ffff;
            opacity: 0.3;
          }
          67% {
            background-color: #101040;
            opacity: 1;
          }
          75% {
            background-color: #000000;
            opacity: 0.2;
          }
          83% {
            background-color: #080820;
            opacity: 1;
          }
          92% {
            background-color: #ff0000;
            opacity: 0.1;
          }
          100% {
            background-color: #040410;
            opacity: 1;
          }
        }

        @keyframes pulse-warm {
          0% {
            background-color: #f5f5dc;
            opacity: 0.8;
          }
          50% {
            background-color: #fff8dc;
            opacity: 1;
          }
          100% {
            background-color: #f5f5dc;
            opacity: 0.8;
          }
        }

        /* Custom scrollbar */
        div::-webkit-scrollbar {
          width: 8px;
        }

        div::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
        }

        div::-webkit-scrollbar-thumb {
          background: linear-gradient(45deg, #ff00ff, #00ffff);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
};

export default LongScrollShowcase;
