import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { createServerClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";
import UploadForm from "./upload-form";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const { data: profile } = await supabase
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

  const tDash = await getTranslations("Dashboard");
  const tUpload = await getTranslations("Upload");

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex justify-between items-center pb-6 border-b">
          <div>
            <h1 className="text-2xl font-bold">{tUpload("title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {tDash("welcome", { name: profile.full_name || profile.email })}
            </p>
          </div>
          <SignOutButton />
        </header>
        <UploadForm />
      </div>
    </main>
  );
}
