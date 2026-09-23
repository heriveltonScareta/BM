"use client";

import { useEffect } from "react";
import { EstadoErro } from "@/components/estados";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <EstadoErro onRetry={reset} />;
}
