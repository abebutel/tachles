import {createServerClient as createSupabaseServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({name, value, options}) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookies can only be set in a
            // Route Handler or Server Action. The middleware will refresh the
            // session, so this is safe to ignore here.
          }
        },
      },
    },
  );
}
