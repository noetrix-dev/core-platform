// Ícones autorais, um traço só (1.75, ponta reta) — feitos para o mundo
// gravado da estação. Sem lib de ícone, sem emoji.

type Name =
  | "prev"
  | "next"
  | "check"
  | "x"
  | "scissors"
  | "clock"
  | "plus"
  | "bell"
  | "user"
  | "phone"
  | "lock"
  | "chat"
  | "gear"
  | "cup"
  | "music";

const PATHS: Record<Name, React.ReactNode> = {
  prev: <polyline points="13,4 7,10 13,16" />,
  next: <polyline points="7,4 13,10 7,16" />,
  check: <polyline points="4,10.5 8.5,15 16,5" />,
  x: (
    <>
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </>
  ),
  scissors: (
    <>
      <circle cx="5" cy="5" r="2.4" />
      <circle cx="5" cy="15" r="2.4" />
      <line x1="7" y1="6.5" x2="17" y2="15" />
      <line x1="7" y1="13.5" x2="17" y2="5" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7" />
      <polyline points="10,5.5 10,10 13.5,12" />
    </>
  ),
  plus: (
    <>
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </>
  ),
  bell: (
    <>
      <path d="M6 15V9a4 4 0 0 1 8 0v6" />
      <line x1="4" y1="15" x2="16" y2="15" />
      <path d="M8.5 15a1.5 1.5 0 0 0 3 0" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4.5 16.5c1-3 4-4 5.5-4s4.5 1 5.5 4" />
    </>
  ),
  phone: (
    <path d="M6 3.5 8.5 4l1 3-1.6 1.4a9 9 0 0 0 3.7 3.7L13 13.5l3 1 .5 2.5c-6 1-12.5-5.5-11.5-11.5z" />
  ),
  lock: (
    <>
      <rect x="4.5" y="9" width="11" height="7.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </>
  ),
  chat: (
    <path d="M4 5h12v8H8l-4 3.5V5z" />
  ),
  gear: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M15.3 4.7l-1.6 1.6M6.3 13.7l-1.6 1.6" />
    </>
  ),
  cup: (
    <>
      <path d="M5 6h9v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V6z" />
      <path d="M14 7h2.5a1.5 1.5 0 0 1 0 3H14" />
      <line x1="5" y1="17.5" x2="14" y2="17.5" />
    </>
  ),
  music: (
    <>
      <path d="M8 14V4l8-1.6V12" />
      <circle cx="6" cy="14" r="2" />
      <circle cx="14" cy="12" r="2" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: Name;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
