async function getVinxiHttp() {
  const importFn = new Function("m", "return import(m)");
  return importFn("vinxi/http");
}

export async function writeImpersonationCookie(token: string) {
  try {
    const { getEvent, setCookie } = await getVinxiHttp();
    const event = getEvent();
    if (event) {
      setCookie(event, "boutq_impersonation_token", token, {
        httpOnly: false, // Allowed to be read by client to show the warning banner
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }
  } catch (err) {
    console.error("Failed to write impersonation cookie:", err);
  }
}

export async function clearImpersonationCookie() {
  try {
    const { getEvent, deleteCookie } = await getVinxiHttp();
    const event = getEvent();
    if (event) {
      deleteCookie(event, "boutq_impersonation_token", {
        path: "/",
      });
    }
  } catch (err) {
    console.error("Failed to clear impersonation cookie:", err);
  }
}

export async function readImpersonationCookie(): Promise<string | undefined> {
  try {
    const { getEvent, getCookie } = await getVinxiHttp();
    const event = getEvent();
    if (!event) return undefined;
    return getCookie(event, "boutq_impersonation_token");
  } catch (err) {
    console.error("Failed to read impersonation cookie:", err);
    return undefined;
  }
}
