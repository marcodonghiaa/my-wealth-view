import { CATEGORIES } from "../categories";

export type AppCategory = (typeof CATEGORIES)[number];

// Word starts, English and Italian, checked in order: the first group that matches wins.
const KEYWORDS: Array<[AppCategory, RegExp]> = [
  ["Groceries", /\b(grocer|supermerc|spesa|market)/],
  ["Dine Out", /\b(restaurant|ristorant|dining|bar\b|cafe|caffe|pizz|takeaway)/],
  ["Housing", /\b(rent|affitto|mutuo|mortgage|condomin)/],
  ["Transports", /\b(uber|taxi|train|treno|bus\b|fuel|benzina|transport|parking|parcheggio|metro)/],
  ["Health", /\b(pharmac|farmac|doctor|medic|dentist|salute|health|gym|palestra)/],
  ["Entertainment", /\b(netflix|spotify|cinema|movie|entertain|svago|game|subscri)/],
  ["Experiences", /\b(travel|viagg|hotel|holiday|vacanz|concert|event)/],
  ["Shopping", /\b(shop|cloth|abbigliament|amazon)/],
  ["Services", /\b(bill|bolletta|utilit|insurance|assicur|internet|phone|telefon)/],
  [
    "Taxes",
    /\b(tax(es)?\b|tasse|tassa|imposta|imposte|f24|agenzia (delle )?entrate|erario|irs\b|hmrc|inps|iva\b)/,
  ],
  ["Income", /\b(salary|stipendio|income|entrate)/],
  ["Transfer", /\b(transfer|trasferiment)/],
];

const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Maps a free-text category from a spreadsheet to one of the app's categories. */
export function suggestCategory(raw: string): AppCategory {
  const s = clean(raw);
  const exact = CATEGORIES.find((c) => c.toLowerCase() === s);
  if (exact) return exact;
  return KEYWORDS.find(([, pattern]) => pattern.test(s))?.[0] ?? "Others";
}
