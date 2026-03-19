export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

let _cachedClientId: string | null = null;

async function getGoogleClientId(): Promise<string> {
  if (_cachedClientId) return _cachedClientId;
  const buildTimeId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (buildTimeId) {
    _cachedClientId = buildTimeId;
    return buildTimeId;
  }
  const res = await fetch("/api/config");
  const data = await res.json();
  _cachedClientId = data.googleClientId;
  return data.googleClientId;
}

export const getLoginUrl = async () => {
  const clientId = await getGoogleClientId();
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return url.toString();
};
