import {NextResponse, type NextRequest} from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import {createServerClient} from "@supabase/ssr";
import {routing} from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Run i18n middleware first to set up locale routing
  const response = intlMiddleware(request);

  // Then refresh Supabase session on the response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({name, value, options}) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Refreshes the session if needed; ignores result here
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Match all pathnames except for /api, /_next, /_vercel, /auth (callback), and static assets
  matcher: ["/((?!api|trpc|_next|_vercel|auth|.*\\..*).*)"],
};
