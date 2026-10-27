// App mark: forest tile with three rising mint bars (same art as public/icon-*.png).
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden className={className}>
      <rect width="1024" height="1024" rx="220" fill="#173F34" />
      <rect x="284" y="536" width="108" height="204" rx="54" fill="#D8ECDD" />
      <rect x="458" y="406" width="108" height="334" rx="54" fill="#D8ECDD" />
      <rect x="632" y="266" width="108" height="474" rx="54" fill="#D8ECDD" />
    </svg>
  );
}
