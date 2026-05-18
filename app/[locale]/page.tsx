import {useTranslations, useLocale} from "next-intl";
import {Link} from "@/i18n/navigation";

export default function HomePage() {
  const t = useTranslations("HomePage");
  const currentLocale = useLocale();
  const otherLocale = currentLocale === "he" ? "en" : "he";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-6xl font-bold mb-4">{t("greeting")}</h1>
      <p className="text-xl mb-8 text-gray-600">{t("subtitle")}</p>
      <Link
        href="/"
        locale={otherLocale}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        {t("switchLanguage")}
      </Link>
    </main>
  );
}
