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
    };
    return { message: error.message, guidance: guidance[error.code] ?? "Review the form and try again." };
  }
  if (error instanceof TypeError) {
    return { message: "The server could not be reached.", guidance: "Make sure the API is running, then try again." };
  }
  return { message: "Something went wrong.", guidance: "Check your details and try again." };
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let code = "unknown_error";
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as ApiError;
      if (Array.isArray(errorBody.detail)) {
        code = "validation_error";
        message = "Some fields need your attention.";
      } else if (typeof errorBody.detail === "object") {
        code = errorBody.detail.code;
        message = errorBody.detail.message;
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

export type AuthResponse = {
  user: UserPublic;
  message?: string;
};

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
};

export const authApi = {
  googleLoginUrl: `${API_URL}/api/v1/auth/google`,
  register: (data: {
    email: string;
    username: string;
    password: string;
    display_name?: string;
  }) => apiFetch<AuthResponse>("/api/v1/auth/register", { method: "POST", body: data }),

  login: (data: { email: string; password: string }) =>
    apiFetch<AuthResponse>("/api/v1/auth/login", { method: "POST", body: data }),

  logout: () => apiFetch<void>("/api/v1/auth/logout", { method: "POST" }),

  me: () => apiFetch<AuthResponse>("/api/v1/auth/me"),

  updateProfile: (data: { display_name?: string; bio?: string; avatar_url?: string }) =>
    apiFetch<UserPublic>("/api/v1/users/me", { method: "PATCH", body: data }),
};
