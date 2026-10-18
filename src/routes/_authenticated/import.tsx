import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ImportWizard } from "@/components/import/import-wizard";
import { SplitwisePanel } from "@/components/import/splitwise-panel";
import { SegmentedControl } from "@/components/segmented-control";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

type Source = "sheet" | "splitwise";

const SOURCES: Array<{ value: Source; label: string }> = [
  { value: "sheet", label: "Spreadsheet" },
  { value: "splitwise", label: "Splitwise" },
];

function ImportPage() {
  const [source, setSource] = useState<Source>("sheet");
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="ios-large-title">Import data</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Bring in past net worth or spending from a spreadsheet, or your share of a Splitwise
          group.
        </p>
      </header>
      <div className="mb-6">
        <SegmentedControl
          label="Where is the data from?"
          options={SOURCES}
          value={source}
          onChange={setSource}
        />
      </div>
      {source === "sheet" ? <ImportWizard /> : <SplitwisePanel />}
    </div>
  );
}
