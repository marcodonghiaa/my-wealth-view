export type Tone = "positive" | "negative" | "neutral";

// Colour carries alarm, so zero and noise-sized moves stay neutral instead of red or green.
export const toneOf = (value: number, deadBand = 0): Tone =>
  Math.abs(value) <= deadBand ? "neutral" : value > 0 ? "positive" : "negative";

export const TONE_TEXT: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-muted-foreground",
};

export const TONE_PILL: Record<Tone, string> = {
  positive: "border-positive/30 bg-positive/10 text-positive",
  negative: "border-negative/30 bg-negative/10 text-negative",
  neutral: "border-border bg-muted/40 text-muted-foreground",
};
