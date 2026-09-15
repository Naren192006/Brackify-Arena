/**
 * Brackify Arena — Dedicated Admin Authentication & API Client.
 *
 * Isolated from Supabase player sessions and localStorage.
 * Uses HTTP-only cookie credentials ('admin_session') and CSRF protection.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type AdminRole = "super_admin" | "sub_admin";

export type AdminProfile = {
  id: string;
  email: string;
  role: AdminRole;
  permissions: string[];
  csrf_token?: string | null;
};

export type AdminUserRecord = {
  id: string;
  email: string;
  role: AdminRole;
  permissions: string[];
  active: boolean;
  last_login_at?: string | null;
  created_at: string;
  updated_at?: string;
};

let cachedCsrfToken: string | null = null;

export function getAdminCsrfFromCookie(): string | null {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)admin_csrf=([^;]*)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return cachedCsrfToken;
}

export async function getAdminCsrfToken(): Promise<string | null> {
  const cookieCsrf = getAdminCsrfFromCookie();
  if (cookieCsrf) {
    cachedCsrfToken = cookieCsrf;
    return cookieCsrf;
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/admin/csrf`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.csrf_token) {
        cachedCsrfToken = data.csrf_token;
        return cachedCsrfToken;
      }
    }
  } catch {
    // ignore offline errors
  }
  return null;
}

export async function adminApiFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
  if (isMutation && !requestHeaders["X-CSRF-Token"] && !requestHeaders["x-csrf-token"]) {
    const csrf = (await getAdminCsrfToken()) || getAdminCsrfFromCookie();
    if (csrf) {
      requestHeaders["X-CSRF-Token"] = csrf;
    }
  }

  if (!requestHeaders["Authorization"] && !requestHeaders["authorization"]) {
    try {
      const { supabase } = await import("@/lib/supabase/client");
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token && typeof token === "string" && token.split(".").length === 3) {
        requestHeaders["Authorization"] = `Bearer ${token.trim()}`;
      }
    } catch {
      // ignore
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include", // strictly sends and receives HttpOnly admin_session cookie
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorMsg = `Admin API error (${response.status})`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        if (typeof errorJson.detail === "string") {
          errorMsg = errorJson.detail;
        } else if (errorJson.detail.message) {
          errorMsg = errorJson.detail.message;
        } else {
          errorMsg = JSON.stringify(errorJson.detail);
        }
      }
    } catch {
      // parse fallback
    }
    const err = new Error(errorMsg) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Authentication API
// ---------------------------------------------------------------------------

export async function adminLogin(email: string, password: string): Promise<AdminProfile> {
  const result = await adminApiFetch<AdminProfile>("/api/v1/admin/login", {
    method: "POST",
    body: { email: email.trim(), password },
  });
  if (result.csrf_token) {
    cachedCsrfToken = result.csrf_token;
  }
  return result;
}

export async function adminLogout(): Promise<void> {
  try {
    await adminApiFetch<void>("/api/v1/admin/logout", { method: "POST" });
  } finally {
    cachedCsrfToken = null;
  }
}

export async function getAdminMe(): Promise<AdminProfile | null> {
  try {
    const profile = await adminApiFetch<AdminProfile>("/api/v1/admin/me");
    if (profile.csrf_token) {
      cachedCsrfToken = profile.csrf_token;
    }
    return profile;
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 401 || status === 403) {
        return null;
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Admin User Management API (Super Admin Only)
// ---------------------------------------------------------------------------

export async function listAdminUsersApi(): Promise<AdminUserRecord[]> {
  return adminApiFetch<AdminUserRecord[]>("/api/v1/admin/users");
}

export async function createAdminUserApi(data: {
  email: string;
  password: string;
  role?: AdminRole;
  permissions?: string[];
}): Promise<AdminUserRecord> {
  return adminApiFetch<AdminUserRecord>("/api/v1/admin/users", {
    method: "POST",
    body: data,
  });
}

export async function updateAdminUserApi(
  userId: string,
  data: {
    role?: AdminRole;
    permissions?: string[];
    active?: boolean;
    password?: string;
  }
): Promise<AdminUserRecord> {
  return adminApiFetch<AdminUserRecord>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteAdminUserApi(userId: string): Promise<void> {
  return adminApiFetch<void>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

