import {useTranslations, useLocale} from "next-intl";
import {Link} from "@/i18n/navigation";

export default function HomePage() {
  const t = useTranslations("HomePage");
  const currentLocale = useLocale();
  const otherLocale = currentLocale === "he" ? "en" : "he";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-6xl font-bold">{t("brand")}</h1>
        <p className="text-xl text-gray-600">{t("tagline")}</p>
        <p className="text-sm text-gray-500">{t("betaNotice")}</p>

        <div className="pt-4 space-y-3">
          <Link
            href="/sign-in"
            className="block w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            {t("signIn")}
          </Link>
          <Link
            href="/"
            locale={otherLocale}
            className="block text-sm text-gray-600 hover:text-blue-600"
          >
            {t("switchLanguage")}
          </Link>
        </div>
      </div>
    </main>
  );
}
