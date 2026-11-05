export type Tone = "positive" | "negative" | "neutral";

// Colour carries alarm, so zero and noise-sized moves stay neutral instead of red or green.
export const toneOf = (value: number, deadBand = 0): Tone =>
  Math.abs(value) <= deadBand ? "neutral" : value > 0 ? "positive" : "negative";

export const TONE_TEXT: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-muted-foreground",
};
