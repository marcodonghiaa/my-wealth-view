import { useNavigate } from "@tanstack/react-router";
import { SegmentedControl } from "@/components/segmented-control";

type InvestingPage = "/portfolio" | "/crypto";

const PAGES: Array<{ value: InvestingPage; label: string }> = [
  { value: "/portfolio", label: "Portfolio" },
  { value: "/crypto", label: "Crypto" },
];

/**
 * Portfolio | Crypto on phones, where one Investing tab opens both. It changes the route, not local
 * state, so deep links, push links and Back keep working. The desktop sidebar lists both pages.
 */
export function InvestingSwitch({ current }: { current: InvestingPage }) {
  const navigate = useNavigate();
  return (
    <div className="mb-5 md:hidden">
      <SegmentedControl
        label="Investing"
        options={PAGES}
        value={current}
        onChange={(to) => {
          if (to !== current) void navigate({ to });
        }}
      />
    </div>
  );
}
