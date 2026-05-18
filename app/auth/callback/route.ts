import {NextResponse, type NextRequest} from "next/server";
import {createServerClient} from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const {searchParams, origin} = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const supabase = await createServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/he/sign-in`);
  }

  // Check if profile exists (created by trigger only if email is on invite list)
  const {data: profile} = await supabase
    .from("profiles")
    .select("beta_consent_version, preferred_language")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Not on invite list — sign them out and redirect
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/he/not-invited`);
  }

  const locale = profile.preferred_language || "he";

  if (!profile.beta_consent_version) {
    return NextResponse.redirect(`${origin}/${locale}/onboarding`);
  }

  return NextResponse.redirect(`${origin}/${locale}/dashboard`);
}
