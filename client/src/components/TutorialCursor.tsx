import { useEffect, useState } from "react";

interface TutorialCursorProps {
  x: number;
  y: number;
  visible: boolean;
  clicking: boolean;
}

export function TutorialCursor({ x, y, visible, clicking }: TutorialCursorProps) {
  const [ripple, setRipple] = useState(false);

  useEffect(() => {
    if (clicking) {
      setRipple(true);
      const timer = setTimeout(() => setRipple(false), 400);
      return () => clearTimeout(timer);
    }
  }, [clicking]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 99999,
        pointerEvents: "none",
        transition: "left 0.5s cubic-bezier(0.4, 0, 0.2, 1), top 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Cursor pointer SVG */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{
          filter: "drop-shadow(1px 2px 3px rgba(0,0,0,0.4))",
          transform: "translate(-2px, -2px)",
        }}
      >
        <path
          d="M5 3L19 12L12 13L9 20L5 3Z"
          fill="black"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {/* Click ripple */}
      {ripple && (
        <div
          style={{
            position: "absolute",
            top: -8,
            left: -8,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "3px solid #f97316",
            animation: "tutorial-ripple 0.4s ease-out forwards",
          }}
        />
      )}
      <style>{`
        @keyframes tutorial-ripple {
          0% {
            transform: scale(0.3);
            opacity: 1;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
