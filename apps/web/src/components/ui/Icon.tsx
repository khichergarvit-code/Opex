const PATHS = {
  chat: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  users: 'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 10a2.4 2.4 0 1 0 0-4.8M17 14c2.5 0 4 1.8 4 4',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  bot: 'M12 3v3M6 8h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM9 13v1M15 13v1M9 17h6',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3zM9 12l2 2 4-4',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  coins: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  thumbs: 'M7 10v10H4V10h3zM7 10l4-7c1.5 0 2.5 1 2.2 2.6L12.6 9H19a2 2 0 0 1 2 2.4l-1.3 6.4A2 2 0 0 1 17.8 19H7',
  server: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  memory: 'M12 3a5 5 0 0 0-5 5c-2 .5-3 2-3 4s1 3.5 3 4c.5 2 2.5 3.5 5 3.5s4.5-1.5 5-3.5c2-.5 3-2 3-4s-1-3.5-3-4a5 5 0 0 0-5-5z',
  plus: 'M12 5v14M5 12h14',
  logout: 'M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  send: 'M5 12l14-8-4 16-3.5-6L5 12z',
  stop: 'M7 7h10v10H7z',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
