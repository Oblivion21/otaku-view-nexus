import { supabase } from "@/lib/supabase";

export const SITE_ACCESS_TOKEN_STORAGE_KEY = "otaku-view-nexus-access-token";

type UnlockSiteResponse = {
  ok: boolean;
  token?: string;
  error?: string;
};

type SiteAuthResponse = {
  authorized?: boolean;
  token?: string;
  error?: string;
};

async function invokeSiteAuth(body: Record<string, unknown>): Promise<SiteAuthResponse> {
  if (!supabase) {
    return { authorized: false, error: "Supabase is not configured." };
  }

  try {
    const { data, error } = await supabase.functions.invoke("site-auth", { body });
    if (error) {
      return { authorized: false, error: error.message };
    }

    return (data as SiteAuthResponse) || {};
  } catch (error: any) {
    return { authorized: false, error: error?.message || "Request failed." };
  }
}

export async function unlockSite(password: string): Promise<UnlockSiteResponse> {
  const response = await invokeSiteAuth({ action: "unlock", password });

  if (!response.authorized || !response.token) {
    return { ok: false, error: response.error || "Incorrect password." };
  }

  return { ok: true, token: response.token };
}

export async function verifySiteAccess(token: string): Promise<boolean> {
  const response = await invokeSiteAuth({ action: "verify", token });
  return response.authorized === true;
}

export function getStoredSiteAccessToken(): string | null {
  return window.sessionStorage.getItem(SITE_ACCESS_TOKEN_STORAGE_KEY);
}

export function storeSiteAccessToken(token: string) {
  window.sessionStorage.setItem(SITE_ACCESS_TOKEN_STORAGE_KEY, token);
}

export function clearStoredSiteAccessToken() {
  window.sessionStorage.removeItem(SITE_ACCESS_TOKEN_STORAGE_KEY);
}
