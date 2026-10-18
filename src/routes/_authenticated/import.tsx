import { createFileRoute } from "@tanstack/react-router";
import { ImportWizard } from "@/components/import/import-wizard";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

function ImportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="ios-large-title">Import data</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Bring in past net worth or spending from a spreadsheet. Splitwise has its own page.
        </p>
      </header>
      <ImportWizard />
    </div>
  );
}
