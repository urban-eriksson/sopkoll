import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

type Platform = "standalone" | "ios" | "android" | "desktop";

export function detectPlatform(): Platform {
  if (window.matchMedia("(display-mode: standalone)").matches) return "standalone";
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "ios";
  if (/Android/.test(navigator.userAgent)) return "android";
  return "desktop";
}

/**
 * The app is built to live on a phone's home screen (iOS push requires it), so
 * anyone visiting in a browser gets install steps for their platform instead of
 * being funneled straight into the browser flow.
 */
export function HomeActions() {
  const platform = detectPlatform();

  if (platform === "standalone") {
    return (
      <div className="mt-8">
        <Button asChild size="lg">
          <Link to="/app">{t.home.open}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-md">
      <h2 className="font-heading text-xl font-semibold">{t.home.installHeading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.home.installHelp}</p>

      {platform !== "android" ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{t.home.iphone}</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/80">
            <li>{t.home.iosStep1}</li>
            <li>{t.home.iosStep2}</li>
            <li>{t.home.iosStep3}</li>
            <li>{t.home.installStepOpen}</li>
          </ol>
        </div>
      ) : null}

      {platform !== "ios" ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{t.home.android}</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/80">
            <li>{t.home.androidStep1}</li>
            <li>{t.home.androidStep2}</li>
            <li>{t.home.androidStep3}</li>
            <li>{t.home.installStepOpen}</li>
          </ol>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        {t.home.browsing}{" "}
        <Link to="/app" className="underline">
          {t.home.continueInBrowser}
        </Link>
        {platform === "desktop" ? t.home.desktopNote : "."}
      </p>
    </div>
  );
}
