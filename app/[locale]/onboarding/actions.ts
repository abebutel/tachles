"use server";

import {redirect} from "next/navigation";
import {getLocale} from "next-intl/server";
import {createServerClient} from "@/lib/supabase/server";

const BETA_CONSENT_VERSION = process.env.BETA_CONSENT_VERSION || "1.0";

export async function acceptConsent() {
  const supabase = await createServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  const locale = await getLocale();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  await supabase
    .from("profiles")
    .update({
      beta_consent_version: BETA_CONSENT_VERSION,
      beta_consent_accepted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  redirect(`/${locale}/dashboard`);
}
