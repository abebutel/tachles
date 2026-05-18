"use server";

import {getTranslations} from "next-intl/server";
import {createServerClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";

export async function sendMagicLink(
  email: string,
): Promise<{error?: string}> {
  const t = await getTranslations("SignIn");

  // Check invite list using service-role (bypasses RLS)
  const admin = createAdminClient();
  const {data: invite} = await admin
    .from("beta_invites")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!invite) {
    return {error: t("notInvitedError")};
  }

  // Email is invited — send the magic link
  const supabase = await createServerClient();
  const {error} = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return {error: error.message};
  }

  return {};
}
