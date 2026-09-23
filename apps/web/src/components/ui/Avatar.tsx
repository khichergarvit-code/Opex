function initialsFor(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0]![0], parts[1]![0]] : [local[0], local[1] ?? ''];
  return chars.join('').toUpperCase();
}

export function Avatar({ email, size = 32 }: { email: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-100 font-semibold text-accent-700"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={email}
    >
      {initialsFor(email)}
    </div>
  );
}
