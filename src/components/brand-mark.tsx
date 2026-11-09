// App mark: the Alopex fox head, drawn in currentColor; eyes and mask are cut out so it
// sits on any surface (same art as public/icon-*.png).
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={`text-foreground ${className}`}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M9 7Q10 6 11 7L25 21H39L53 7Q54 6 55 7L56 30Q56 33 54 35L35 55Q32 58 29 55L10 35Q8 33 8 30ZM14 34Q22 33 27 40L32 47L37 40Q42 33 50 34L36 50Q32 54 28 50ZM20.5 29a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0ZM38.5 29a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0ZM29 46H35L32 50Z"
      />
    </svg>
  );
}
