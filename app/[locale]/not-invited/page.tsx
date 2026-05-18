import {getTranslations} from "next-intl/server";
import SignOutButton from "@/components/sign-out-button";

export default async function NotInvitedPage() {
  const t = await getTranslations("NotInvited");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-gray-600">{t("message")}</p>
        <SignOutButton />
      </div>
    </main>
  );
}
