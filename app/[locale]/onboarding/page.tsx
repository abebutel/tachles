import {redirect} from "next/navigation";
import {getTranslations, getLocale} from "next-intl/server";
import {createServerClient} from "@/lib/supabase/server";
import OnboardingForm from "./form";

export default async function OnboardingPage() {
  const supabase = await createServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  const locale = await getLocale();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("beta_consent_version")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect(`/${locale}/not-invited`);
  }

  if (profile.beta_consent_version) {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("Onboarding");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p>{t("intro")}</p>
        <ul className="space-y-2 list-disc list-inside text-sm bg-gray-50 p-4 rounded-lg">
          <li>{t("consent1")}</li>
          <li>{t("consent2")}</li>
          <li>{t("consent3")}</li>
        </ul>
        <OnboardingForm />
      </div>
    </main>
  );
}
