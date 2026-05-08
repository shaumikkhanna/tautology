"use client";

import { usePathname } from "next/navigation";
import { ClickSound } from "@/components/ClickSound";

type AppShellProps = Readonly<{
  children: React.ReactNode;
  footer: React.ReactNode;
  header: React.ReactNode;
}>;

export function AppShell({ children, footer, header }: AppShellProps) {
  const pathname = usePathname();

  if (pathname.startsWith("/play/")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ClickSound />
      {header}
      <main className="flex flex-1 flex-col">{children}</main>
      {footer}
    </div>
  );
}
