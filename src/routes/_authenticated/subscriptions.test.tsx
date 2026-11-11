import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = Record<string, unknown>;
const { db, rpc, toast } = vi.hoisted(() => ({
  db: { rows: [] as Array<Row>, error: null as Error | null },
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    from: () => ({ select: () => Promise.resolve({ data: db.rows, error: db.error }) }),
  },
}));

import { Route } from "./subscriptions";

const Page = Route.options.component as () => React.JSX.Element;

const stream = (over: Row): Row => ({
  id: "s1",
  display_name: "Streamflix",
  category: "Entertainment",
  currency: "EUR",
  cadence: "monthly",
  typical_amount: 10,
  typical_amount_eur: 10,
  charge_count: 4,
  last_charged: "2099-12-01",
  next_expected: "2099-12-31",
  detected_status: "active",
  user_status: null,
  user_cadence: null,
  custom_interval_value: null,
  custom_interval_unit: null,
  ...over,
});

// Applies the RPC to the fake table, like the server would.
function serverApplies(patchFor: (action: string, args: Row) => Row) {
  rpc.mockImplementation((_fn: string, p: { p_stream: string; p_action: string; p_args: Row }) => {
    db.rows = db.rows.map((r) =>
      r["id"] === p.p_stream ? { ...r, ...patchFor(p.p_action, p.p_args) } : r,
    );
    return Promise.resolve({ error: null });
  });
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("mf.subscriptionsReveal.seen", "1"); // keep the one-time reveal out of these tests
  db.error = null;
  db.rows = [
    stream({}),
    stream({
      id: "s2",
      display_name: "Cloudbox",
      detected_status: "suggested",
      typical_amount: 5,
      typical_amount_eur: 5,
      charge_count: 3,
    }),
  ];
  serverApplies((action) => ({
    user_status: action === "dismiss" ? "dismissed" : action === "undismiss" ? null : "confirmed",
  }));
  const base = rpc.getMockImplementation()!;
  // Server rule: undismiss restores to confirmed when nothing was detected, else clears the status.
  rpc.mockImplementation((fn: string, p: { p_stream: string; p_action: string }) => {
    const r = db.rows.find((x) => x["id"] === p.p_stream);
    const res = base(fn, p);
    if (p.p_action === "undismiss" && r?.["detected_status"] == null)
      db.rows = db.rows.map((x) =>
        x["id"] === p.p_stream ? { ...x, user_status: "confirmed" } : x,
      );
    return res;
  });
});

describe("Subscriptions page", () => {
  it("lists a review queue and totals only active streams", async () => {
    renderPage();
    const queue = await screen.findByRole("region", { name: "To review" });
    expect(within(queue).getByText("To review (1)")).toBeInTheDocument();
    expect(within(queue).getByText("Cloudbox")).toBeInTheDocument();
    expect(within(queue).getByText("Monthly · 3 charges")).toBeInTheDocument();
    expect(screen.getByLabelText("Estimated monthly cost")).toHaveTextContent("€10.00");
  });

  it("hides the queue when nothing needs review and shows the empty state without streams", async () => {
    db.rows = [];
    renderPage();
    expect(await screen.findByText("No subscription charges found yet.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "To review" })).toBeNull();
  });

  it("Confirm calls the rpc and moves the stream to the active total", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Cloudbox" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("stream_action", {
        p_stream: "s2",
        p_action: "confirm",
        p_args: {},
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Estimated monthly cost")).toHaveTextContent("€15.00"),
    );
    expect(screen.queryByRole("region", { name: "To review" })).toBeNull();
  });

  it("Not a subscription dismisses, and the Undo toast restores the stream", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cloudbox is not a subscription" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "To review" })).toBeNull());
    expect(screen.getByText("Dismissed (1)")).toBeInTheDocument();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("stream_action", {
        p_stream: "s2",
        p_action: "dismiss",
        p_args: {},
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    toast.success.mock.calls[0]![1].action.onClick();
    await waitFor(() => expect(screen.getByText("Cloudbox")).toBeInTheDocument());
    expect(rpc).toHaveBeenLastCalledWith("stream_action", {
      p_stream: "s2",
      p_action: "undismiss",
      p_args: {},
    });
  });

  it("the trash button dismisses an active stream with an Undo toast", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Streamflix" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Removed Streamflix", expect.anything()),
    );
    expect(screen.getByLabelText("Estimated monthly cost")).toHaveTextContent("—");
  });

  it("a preset frequency sends the lowercase cadence", async () => {
    renderPage();
    fireEvent.click(await screen.findByTitle("Monthly — auto-detected"));
    fireEvent.click(await screen.findByRole("button", { name: "Yearly" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("stream_action", {
        p_stream: "s1",
        p_action: "set_cadence",
        p_args: { cadence: "yearly" },
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Billing frequency saved"));
  });

  it("a custom frequency sends custom_value and custom_unit", async () => {
    renderPage();
    fireEvent.click(await screen.findByTitle("Monthly — auto-detected"));
    fireEvent.click(await screen.findByRole("button", { name: /Custom/ }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "weeks" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("stream_action", {
        p_stream: "s1",
        p_action: "set_cadence",
        p_args: { custom_value: 2, custom_unit: "weeks" },
      }),
    );
  });

  it("rolls back and reports when the rpc fails", async () => {
    rpc.mockResolvedValue({ error: new Error("nope") });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Cloudbox" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(await screen.findByRole("region", { name: "To review" })).toBeInTheDocument();
  });

  it("shows stopped streams outside the total", async () => {
    db.rows = [stream({ last_charged: "2020-01-01", next_expected: "2020-02-01" })];
    renderPage();
    expect(await screen.findByText("Stopped (1)")).toBeInTheDocument();
    expect(screen.getByLabelText("Estimated monthly cost")).toHaveTextContent("—");
  });

  it("shows the native amount for a non-EUR stream and a dash without a monthly amount", async () => {
    db.rows = [
      stream({ currency: "USD", typical_amount: 12, typical_amount_eur: 11 }),
      stream({ id: "s3", display_name: "Mystery", cadence: null }),
    ];
    renderPage();
    expect(await screen.findByText(/\$12\.00/)).toBeInTheDocument();
    expect(screen.getByText("Mystery")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows an error when the streams can't be loaded", async () => {
    db.error = new Error("boom");
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });

  it("shows the pencil only for a manual cadence, not after plain Confirm", async () => {
    db.rows = [
      stream({ user_status: "confirmed" }),
      stream({ id: "s4", display_name: "Manualbox", user_cadence: "monthly" }),
    ];
    renderPage();
    expect(await screen.findByTitle("Monthly — auto-detected")).toBeInTheDocument();
    expect(screen.getByTitle("Monthly — manually set")).toBeInTheDocument();
  });

  it("rejects an out-of-range custom interval", async () => {
    renderPage();
    fireEvent.click(await screen.findByTitle("Monthly — auto-detected"));
    fireEvent.click(await screen.findByRole("button", { name: /Custom/ }));
    fireEvent.change(screen.getByLabelText("Interval"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("Interval"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refetches only after the last of several in-flight actions settles", async () => {
    const resolvers: Array<() => void> = [];
    rpc.mockImplementation(() => new Promise((res) => resolvers.push(() => res({ error: null }))));
    db.rows = [stream({ id: "a", display_name: "Aaa" }), stream({ id: "b", display_name: "Bbb" })];
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove Aaa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Bbb" }));
    await waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[0]!();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(spy).not.toHaveBeenCalled();
    resolvers[1]!();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  describe("Dismissed section", () => {
    it("is hidden when nothing is dismissed", async () => {
      renderPage();
      await screen.findByText("Streamflix");
      expect(screen.queryByText(/Dismissed \(/)).not.toBeInTheDocument();
    });

    it("Restore returns a detected stream to Active", async () => {
      db.rows = [stream({ id: "d1", display_name: "Oldplan", user_status: "dismissed" })];
      renderPage();
      expect(await screen.findByText("Dismissed (1)")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Restore Oldplan" }));
      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith("stream_action", {
          p_stream: "d1",
          p_action: "undismiss",
          p_args: {},
        }),
      );
      await waitFor(() => expect(screen.queryByText(/Dismissed \(/)).not.toBeInTheDocument());
      expect(screen.getByText("Oldplan")).toBeInTheDocument();
      expect(screen.getByLabelText("Estimated monthly cost")).toHaveTextContent("€10.00");
    });

    it("Restore returns a suggested stream to To review", async () => {
      db.rows = [
        stream({
          id: "d4",
          display_name: "Maybe",
          detected_status: "suggested",
          user_status: "dismissed",
        }),
      ];
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "Restore Maybe" }));
      const queue = await screen.findByRole("region", { name: "To review" });
      expect(within(queue).getByText("Maybe")).toBeInTheDocument();
    });

    it("Restore of a row with no detected status confirms it into Active", async () => {
      db.rows = [
        stream({
          id: "d5",
          display_name: "Manual",
          detected_status: null,
          user_status: "dismissed",
        }),
      ];
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "Restore Manual" }));
      await waitFor(() => expect(screen.queryByText(/Dismissed \(/)).not.toBeInTheDocument());
      expect(screen.getByText("Manual")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "To review" })).toBeNull();
      expect(screen.getByLabelText("Estimated monthly cost")).toHaveTextContent("€10.00");
    });

    it("null cadence shows no cost and no picker", async () => {
      db.rows = [
        stream({
          id: "d2",
          display_name: "Mystery",
          user_status: "dismissed",
          cadence: null,
          typical_amount_eur: 0,
        }),
      ];
      renderPage();
      const row = (await screen.findByText("Mystery")).closest("li")!;
      expect(row).not.toHaveTextContent("€");
      expect(within(row).queryByText("Set frequency")).not.toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Restore Mystery" })).toBeInTheDocument();
    });

    it("known cadence shows the monthly cost", async () => {
      db.rows = [stream({ id: "d3", display_name: "Oldplan", user_status: "dismissed" })];
      renderPage();
      const row = (await screen.findByText("Oldplan")).closest("li")!;
      expect(row).toHaveTextContent("€10.00");
    });
  });

  it("monthly total shows a dash when no active stream has a frequency", async () => {
    db.rows = [stream({ cadence: null })];
    renderPage();
    await screen.findByText("Streamflix");
    const total = screen.getByLabelText("Estimated monthly cost");
    expect(total).toHaveTextContent("—");
    expect(total).not.toHaveTextContent("€0.00");
  });

  it("monthly total adds a note for streams without a frequency", async () => {
    db.rows = [stream({}), stream({ id: "s9", display_name: "Nofreq", cadence: null })];
    renderPage();
    await screen.findByText("Nofreq");
    const total = screen.getByLabelText("Estimated monthly cost");
    expect(total).toHaveTextContent("€10.00");
    expect(total).toHaveTextContent("+ 1 without a frequency");
  });
});

// protects=the calendar is one tap from the list; fails_when=the view switch is gone or the list stays
describe("List / Calendar", () => {
  beforeEach(() => {
    db.rows = [stream({})];
    db.error = null;
  });

  it("switches to the calendar and back", async () => {
    renderPage();
    await screen.findByText("Streamflix");
    fireEvent.click(screen.getByRole("radio", { name: "Calendar" }));
    expect(await screen.findByRole("region", { name: "Recurring calendar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Streamflix" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(await screen.findByRole("button", { name: "Remove Streamflix" })).toBeTruthy();
  });
});
