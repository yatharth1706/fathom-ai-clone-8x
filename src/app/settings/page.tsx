import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/queries";

export const metadata = { title: "Settings · Notetaker" };

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        How new recordings are processed. This demo has no accounts, so settings are shared by everyone using it.
      </p>
      {settings ? (
        <SettingsForm initial={settings} />
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">Run the seed script first.</p>
      )}
    </div>
  );
}
