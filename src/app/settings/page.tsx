import { Info } from "lucide-react";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/queries";

export const metadata = { title: "Settings · Notetaker" };

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Changes save automatically.</p>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-link/8 px-3 py-2 text-sm text-foreground/80">
        <Info className="mt-0.5 size-4 shrink-0 text-link" />
        This is a shared demo without accounts, so these settings apply to everyone using it.
      </p>
      {settings ? (
        <SettingsForm initial={settings} />
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">Run the seed script first.</p>
      )}
    </div>
  );
}
