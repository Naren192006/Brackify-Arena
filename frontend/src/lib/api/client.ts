const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ApiError = {
  detail: { code: string; message: string } | Array<{ loc?: unknown; msg?: string }> | string;
};

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function getAuthError(error: unknown): { message: string; guidance: string } {
  if (error instanceof ApiRequestError) {
    const guidance: Record<string, string> = {
      email_exists: "This email is already registered. Sign in instead or use a different email.",
      username_exists: "That username is taken. Try adding numbers or underscores.",
      invalid_credentials: "Check your email and password. If you are new here, create an account first.",
      account_inactive: "This account is inactive. Contact support for help.",
      rate_limit_exceeded: "Too many attempts. Wait a few minutes and try again.",
      oauth_not_configured: "Google sign-in is not configured on this server. Use email and password for now.",
      validation_error: "Please review the requirements for the flagged field(s) above.",
    };
    return { message: error.message, guidance: guidance[error.code] ?? "Review the form and try again." };
  }
  if (error instanceof TypeError) {
    return { message: "The server could not be reached.", guidance: "Make sure the API is running, then try again." };
  }
  return { message: "Something went wrong.", guidance: "Check your details and try again." };
}

import { supabase } from "@/lib/supabase/client";

let cachedCsrfToken: string | null = null;

export async function getValidAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) return null;

    let session = data.session;
    // Check if token expires within 45 seconds; proactively refresh if so
    if (session.expires_at && session.expires_at * 1000 - Date.now() < 45000) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data?.session) {
        session = refreshed.data.session;
      }
    }

    const token = session.access_token;
    // STRICT VALIDATION:
    // 1. Must be non-empty string
    // 2. Never null/undefined/"[object Object]"
    // 3. Must have exactly 3 parts separated by dots (header.payload.signature)
    if (
      typeof token === "string" &&
      token.trim() !== "" &&
      token !== "undefined" &&
      token !== "null" &&
      token !== "[object Object]" &&
      token.split(".").length === 3
    ) {
      return token.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export async function getCsrfToken(): Promise<string | null> {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  if (cachedCsrfToken) return cachedCsrfToken;

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/csrf`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.csrf_token === "string") {
        cachedCsrfToken = data.csrf_token;
        return cachedCsrfToken;
      }
    }
  } catch {
    // Ignore CSRF fetch errors if endpoint is offline
  }
  return null;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  retryOn401?: boolean;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, retryOn401 = true } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  // 1. Add Authorization: Bearer <access_token> only when token exists and has valid structure
  if (!requestHeaders["Authorization"] && !requestHeaders["authorization"]) {
    const token = await getValidAccessToken();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  // 2. Add X-CSRF-Token on state-changing methods (POST, PUT, PATCH, DELETE)
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
  if (isMutation && !requestHeaders["X-CSRF-Token"] && !requestHeaders["x-csrf-token"]) {
    const csrf = await getCsrfToken();
    if (csrf) {
      requestHeaders["X-CSRF-Token"] = csrf;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    throw netErr;
  }

  // 3. If 401 Unauthorized, automatically refresh session and retry once
  if (response.status === 401 && retryOn401) {
    try {
      const refreshResult = await supabase.auth.refreshSession();
      const newToken = refreshResult.data?.session?.access_token;
      if (
        newToken &&
        typeof newToken === "string" &&
        newToken.split(".").length === 3
      ) {
        requestHeaders["Authorization"] = `Bearer ${newToken.trim()}`;
        response = await fetch(`${API_URL}${path}`, {
          method,
          credentials: "include",
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });
      }
    } catch {
      // Refresh failed; proceed with original 401 response
    }
  }

  if (!response.ok) {
    let code = "unknown_error";
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as ApiError;
      if (Array.isArray(errorBody.detail)) {
        code = "validation_error";
        const messages = (errorBody.detail as any[])
          .map((item) => {
            const locParts = Array.isArray(item.loc)
              ? item.loc.filter((l: any) => l !== "body" && l !== "query" && l !== "path" && l !== "header")
              : [];
            const field = locParts.join(".");
            let msg = item.msg || "Invalid value";
            if (typeof msg === "string" && msg.startsWith("Value error, ")) {
              msg = msg.replace(/^Value error,\s*/, "");
            }
            return field ? `${field}: ${msg}` : msg;
          })
          .filter(Boolean);
        message = messages.length > 0 ? messages.join("; ") : "Validation failed";
      } else if (typeof errorBody.detail === "object" && errorBody.detail !== null) {
        code = (errorBody.detail as any).code || "error";
        message = (errorBody.detail as any).message || JSON.stringify(errorBody.detail);
      } else if (typeof errorBody.detail === "string") {
        message = errorBody.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiRequestError(response.status, code, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type UserPublic = {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  status: string;
  email_verified: boolean;
  created_at: string;
};

export type SupabaseSessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_in?: number | null;
  user_id?: string | null;
};

export type AuthResponse = {
  user: UserPublic;
  message?: string;
  supabase_session?: SupabaseSessionPayload | null;
};

/**
 * Adopt the backend-minted Supabase session so Supabase-gated pages
 * (/dashboard etc.) and RLS-keyed data access work after FastAPI login.
 * Best-effort: failures are logged and do not fail the auth flow.
 */
async function adoptSupabaseSession(payload: AuthResponse): Promise<void> {
  const session = payload?.supabase_session;
  if (!session?.access_token || !session?.refresh_token) return;
  try {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) console.warn("[auth] failed to adopt Supabase session:", error.message);
  } catch (err) {
    console.warn("[auth] Supabase setSession threw:", err);
  }
}

export type TournamentListItem = {
  id: string;
  slug: string;
  title: string;
  status: string;
  game_slug: string;
  game_name: string;
  banner_url: string | null;
  prize_pool_minor: number;
  entry_fee_minor: number;
  currency: string;
  starts_at: string;
  registration_deadline: string;
  capacity: number;
};

export type TournamentPage = {
  items: TournamentListItem[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
};

export const tournamentsApi = {
  list: (params: Record<string, string | number | undefined> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return apiFetch<TournamentPage>(`/api/v1/tournaments?${query.toString()}`);
  },
  cancelRegistration: (tournamentId: string, data: { team_id: string; user_id: string }) =>
    apiFetch<{ success: boolean; message: string }>(`/api/v1/tournaments/${tournamentId}/cancel-registration`, {
      method: "POST",
      body: data,
    }),
};

export const authApi = {
  googleLoginUrl: `${API_URL}/api/v1/auth/google`,
  register: async (data: {
    email: string;
    username: string;
    password: string;
    display_name?: string;
  }) => {
    const payload = await apiFetch<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: data,
    });
    await adoptSupabaseSession(payload);
    return payload;
  },

  login: async (data: { email: string; password: string }) => {
    const payload = await apiFetch<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: data,
    });
    await adoptSupabaseSession(payload);
    return payload;
  },

  logout: () => apiFetch<void>("/api/v1/auth/logout", { method: "POST" }),

  me: () => apiFetch<AuthResponse>("/api/v1/auth/me"),

  updateProfile: (data: { display_name?: string; bio?: string; avatar_url?: string }) =>
    apiFetch<UserPublic>("/api/v1/users/me", { method: "PATCH", body: data }),
};

export type CreateOrderResponse = {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
};

export type VerifyPaymentResponse = {
  paid: boolean;
};

export const paymentsApi = {
  createOrder: (data: { registration_id: string; amount_paise: number; user_id: string }) =>
    apiFetch<CreateOrderResponse>("/api/v1/payments/create-order", {
      method: "POST",
      body: data,
    }),

  verify: (data: {
    registration_id: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    user_id: string;
  }) =>
    apiFetch<VerifyPaymentResponse>("/api/v1/payments/verify", {
      method: "POST",
      body: data,
    }),
};

export type SubmitReportInput = {
  match_id: string;
  team1_score: number;
  team2_score: number;
  user_id: string;
  notes?: string | null;
  evidence_url?: string | null;
};

export type UpdateReportInput = {
  user_id: string;
  team1_score?: number | null;
  team2_score?: number | null;
  notes?: string | null;
  evidence_url?: string | null;
};

export const matchReportsApi = {
  submit: (data: SubmitReportInput) =>
    apiFetch<import("@/types/match").MatchReport>("/api/v1/match-reports/submit", {
      method: "POST",
      body: data,
    }),

  getByMatch: (matchId: string) =>
    apiFetch<import("@/types/match").MatchReport[]>(`/api/v1/match-reports/match/${matchId}`),

  update: (reportId: string, data: UpdateReportInput) =>
    apiFetch<import("@/types/match").MatchReport>(`/api/v1/match-reports/${reportId}`, {
      method: "PATCH",
      body: data,
    }),
};


