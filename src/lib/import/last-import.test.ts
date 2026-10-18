import { describe, expect, it } from "vitest";
import { clearLastImport, loadLastImport, refreshKeys, saveLastImport } from "./last-import";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
}

const last = { batchId: "b1", count: 3 };

describe("last import memory", () => {
  // protects=Undo survives leaving the page; fails_when=a saved import is lost, mixed up between
  // kinds or users, or garbage in storage crashes the page; no_claim=other browsers or devices
  it("remembers the last import per user and kind", () => {
    const store = fakeStorage();
    saveLastImport(store, "u1", "spend", last);
    expect(loadLastImport(store, "u1", "spend")).toEqual(last);
    expect(loadLastImport(store, "u1", "net_worth")).toBeNull();
    expect(loadLastImport(store, "u2", "spend")).toBeNull();
  });

  it("forgets it once cleared", () => {
    const store = fakeStorage();
    saveLastImport(store, "u1", "spend", last);
    clearLastImport(store, "u1", "spend");
    expect(loadLastImport(store, "u1", "spend")).toBeNull();
  });

  it("ignores broken stored data", () => {
    const store = fakeStorage();
    store.setItem("import:last:u1:spend", "{nope");
    expect(loadLastImport(store, "u1", "spend")).toBeNull();
    store.setItem("import:last:u1:spend", JSON.stringify({ batchId: 5 }));
    expect(loadLastImport(store, "u1", "spend")).toBeNull();
  });

  it("works without storage", () => {
    expect(loadLastImport(null, "u1", "spend")).toBeNull();
    expect(() => saveLastImport(null, "u1", "spend", last)).not.toThrow();
  });
});

describe("refreshKeys", () => {
  it("lists only the queries each kind of import changes", () => {
    expect(refreshKeys("net_worth")).toContainEqual(["net-worth-history"]);
    expect(refreshKeys("spend")).toContainEqual(["spend-by-category"]);
    expect(refreshKeys("spend")).not.toContainEqual(["net-worth-history"]);
    expect(refreshKeys("spend")).toContainEqual(["welcome-facts"]);
  });

  it("lists the spending and income screens a Splitwise import changes", () => {
    const keys = refreshKeys("splitwise");
    for (const k of [
      "spend-by-category",
      "reports-spend",
      "category-transactions",
      "income-vs-expenses",
      "reports-income-expenses",
      "transactions",
      "splitwise-balances",
    ]) {
      expect(keys).toContainEqual([k]);
    }
    expect(keys).not.toContainEqual(["net-worth-history"]);
  });

  it("keeps the Splitwise memory apart from the spreadsheet ones", () => {
    const store = fakeStorage();
    saveLastImport(store, "u1", "splitwise", last);
    expect(loadLastImport(store, "u1", "splitwise")).toEqual(last);
    expect(loadLastImport(store, "u1", "spend")).toBeNull();
  });
});
