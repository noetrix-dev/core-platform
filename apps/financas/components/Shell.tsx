import type { ReactNode } from "react";
import { Topbar } from "./Topbar";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <Topbar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
