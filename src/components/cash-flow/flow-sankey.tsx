import { ResponsiveContainer, Sankey } from "recharts";
import {
  fitLabel,
  SANKEY_LAYOUT,
  SANKEY_LAYOUT_GAP,
  type FlowGraph,
  type FlowNode,
} from "@/lib/cash-flow";
import { formatEur } from "@/lib/transactions";
import { useIsMobile } from "@/lib/use-is-mobile";

/** Room for a two-line label and the gap under it, per node on the busier side. */
const ROW = 56;

interface NodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: FlowNode & { value: number; depth: number };
}

function FlowNodeShape({ x, y, width, height, payload, narrow }: NodeProps & { narrow: boolean }) {
  const isLeft = payload.depth === 0;
  const isHub = payload.kind === "hub";
  // On a phone there's no room for a label column on both sides: the payers' labels sit on
  // their own band instead, which is pale enough to read on.
  const layout = SANKEY_LAYOUT[narrow ? "phone" : "desktop"];
  const outside = isLeft && layout.outsideLeft;
  const onBand = isLeft && !outside;
  const labelX = outside ? x - SANKEY_LAYOUT_GAP : x + width + SANKEY_LAYOUT_GAP;
  const mid = y + height / 2;
  return (
    <g>
      {/* The full name, for a label cut to fit (hover, or long-press on a phone). */}
      <title>{`${payload.name} ${formatEur(payload.value)}`}</title>
      <rect x={x} y={y} width={width} height={Math.max(height, 1)} fill={payload.color} rx={1} />
      {!isHub && (
        <text
          x={labelX}
          y={mid}
          textAnchor={outside ? "end" : "start"}
          className="fill-foreground"
          style={{ fontSize: 12 }}
        >
          <tspan x={labelX} dy="-0.2em">
            {fitLabel(payload.name, layout.chars)}
          </tspan>
          <tspan
            x={labelX}
            dy="1.25em"
            // On a band, grey is too faint to read (4.35:1): use ink there.
            className={onBand ? "fill-foreground" : "fill-muted-foreground"}
            style={{ fontFamily: "var(--font-figure)", fontSize: 11 }}
          >
            {formatEur(payload.value)}
          </tspan>
        </text>
      )}
    </g>
  );
}

interface LinkProps {
  sourceX: number;
  targetX: number;
  sourceY: number;
  targetY: number;
  sourceControlX: number;
  targetControlX: number;
  linkWidth: number;
  payload: { source: FlowNode; target: FlowNode };
}

function FlowLinkShape({
  sourceX,
  targetX,
  sourceY,
  targetY,
  sourceControlX,
  targetControlX,
  linkWidth,
  payload,
}: LinkProps) {
  // Each band takes the colour of the side that isn't the hub, so a category reads the same here
  // as on Spending.
  const end = payload.target.kind === "hub" ? payload.source : payload.target;
  // A filled outline (top edge out, bottom edge back): a thick stroke on a steep curve folds
  // over itself, which broke the big "Saved" band on phones.
  const h = Math.max(linkWidth, 1) / 2;
  const edge = (dy: number) =>
    `${sourceX},${sourceY + dy} C${sourceControlX},${sourceY + dy} ${targetControlX},${targetY + dy} ${targetX},${targetY + dy}`;
  const back = `C${targetControlX},${targetY + h} ${sourceControlX},${sourceY + h} ${sourceX},${sourceY + h}`;
  return (
    <path
      d={`M${edge(-h)} L${targetX},${targetY + h} ${back} Z`}
      fill={end.color}
      // From the theme: 0.28 in light, stronger in dark where 0.28 turns muddy.
      style={{ fillOpacity: "var(--sankey-band-opacity)" }}
    />
  );
}

/**
 * Where the period's money came from and went: payers on the left, one hub, categories and what
 * was saved on the right. Labels sit outside the bands, so the side margins hold them.
 */
export function FlowSankey({ graph, label }: { graph: FlowGraph; label: string }) {
  const narrow = useIsMobile();
  const { left, right } = SANKEY_LAYOUT[narrow ? "phone" : "desktop"];
  const lefts = graph.links.filter((l) => graph.nodes[l.target]?.kind === "hub").length;
  const rights = graph.links.length - lefts;
  const height = Math.max(240, Math.max(lefts, rights) * ROW);
  // Screen readers get the breakdown in the name; the SVG's own text stays out of the tree.
  const side = (inbound: boolean) =>
    graph.links
      .filter((l) => (graph.nodes[l.target]?.kind === "hub") === inbound)
      .map((l) => `${graph.nodes[inbound ? l.source : l.target]?.name} ${formatEur(l.value)}`)
      .join(", ");
  return (
    <div
      role="img"
      aria-label={`${label} In: ${side(true)}. Out: ${side(false)}.`}
      style={{ height }}
    >
      <div aria-hidden="true" className="size-full">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={graph}
            sort={false}
            nodeWidth={8}
            nodePadding={30}
            linkCurvature={0.5}
            iterations={0}
            margin={{ top: 12, bottom: 12, left, right }}
            node={(props: NodeProps) => <FlowNodeShape {...props} narrow={narrow} />}
            link={(props: LinkProps) => <FlowLinkShape {...props} />}
          />
        </ResponsiveContainer>
      </div>
    </div>
  );
}
