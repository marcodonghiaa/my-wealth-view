import { createFileRoute } from "@tanstack/react-router";
import { CryptoPage } from "../_authenticated/crypto";

export const Route = createFileRoute("/demo/crypto")({
  component: CryptoPage,
});
