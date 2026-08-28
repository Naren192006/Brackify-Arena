import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  const redirectUrl = new URL(next, request.url);
  let response = NextResponse.redirect(redirectUrl);

  if (!code) {
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("error", "oauth_code_missing");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[supabase] OAuth exchange failed", {
        code: error.code,
        message: error.message,
      });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "oauth_exchange_failed");
    if (process.env.NODE_ENV !== "production") {
      loginUrl.searchParams.set("detail", error.message.slice(0, 160));
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
