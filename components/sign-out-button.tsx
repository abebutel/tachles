"use client";

import {useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export default function SignOutButton() {
  const t = useTranslations("Dashboard");
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
    >
      {t("signOut")}
    </button>
  );
}
