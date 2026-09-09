import { ArrowLeft, Plus, Settings, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/lib/i18n";
import { store } from "@/lib/store";

/**
 * Shared top bar. Sticky with safe-area padding so it sits under the iOS
 * status bar in standalone mode. Pass `back` on any page below the dashboard:
 * the wordmark keeps its place and its job (it already goes home) and gains a
 * leading arrow, so there is one obvious way back rather than two.
 */
export function AppHeader({ back = false }: { back?: boolean }) {
  const [confirmWipe, setConfirmWipe] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/app"
          aria-label={back ? t.nav.back : t.nav.home}
          className="group -ml-1 flex items-center gap-1.5 rounded-md py-1 pr-2 pl-1 font-heading text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {back ? (
            <ArrowLeft
              aria-hidden
              className="size-5 text-primary transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none"
            />
          ) : null}
          {t.brand}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t.nav.menu}>
              <Settings className="size-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/items/new">
                <Plus /> {t.nav.addItem}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <SlidersHorizontal /> {t.nav.settings}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmWipe(true)}>
              <Trash2 /> {t.nav.wipe}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Horizon line: the header's only decoration. */}
      <div
        aria-hidden
        className="h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
      />

      <AlertDialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.wipeDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.wipeDialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.wipeDialog.cancel}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                store.wipe();
                setConfirmWipe(false);
                navigate("/");
              }}
            >
              {t.wipeDialog.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
