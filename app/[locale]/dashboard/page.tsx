import {redirect} from "next/navigation";
import {getTranslations, getLocale} from "next-intl/server";
import {createServerClient} from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";

export default async function DashboardPage() {
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
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect(`/${locale}/not-invited`);
  }

  if (!profile.beta_consent_version) {
    redirect(`/${locale}/onboarding`);
  }

  const t = await getTranslations("Dashboard");

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex justify-between items-center pb-6 border-b">
          <h1 className="text-2xl font-bold">
            {t("welcome", {name: profile.full_name || profile.email})}
          </h1>
          <SignOutButton />
        </header>
        <div className="bg-gray-50 p-6 rounded-lg">
          <p className="text-gray-600">{t("placeholder")}</p>
        </div>
      </div>
    </main>
  );
}
