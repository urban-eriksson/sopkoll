import type { ReactNode } from "react";
import { AppHeader } from "./app-header";

/** Header + centred column. Every signed-in-style page uses this shell. */
export function Page({ back = false, children }: { back?: boolean; children: ReactNode }) {
  return (
    <>
      <AppHeader back={back} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
        {children}
      </main>
    </>
  );
}
