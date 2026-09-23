import { ClipboardList } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ClipboardList className="size-5" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="font-semibold">Boletins de Medição</p>
          <p className="text-xs text-muted-foreground">Medição, aprovação e faturamento</p>
        </div>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
