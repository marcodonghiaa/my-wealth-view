// "1 transaction", "2 transactions".
export const plural = (n: number, word = "transaction") => `${n} ${word}${n === 1 ? "" : "s"}`;
