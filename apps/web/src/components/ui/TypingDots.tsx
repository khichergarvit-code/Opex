export function TypingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot h-1.5 w-1.5 rounded-full bg-accent-500"
          style={{ animation: 'dot-bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}
