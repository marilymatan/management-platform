import type { Express, Request, Response } from "express";
import { exchangeCodeForTokens, saveGmailConnection, verifyGmailScopes } from "./gmail";
import { verifyOAuthState } from "./routers";
import { ENV } from "./_core/env";

export function registerGmailCallbackRoute(app: Express) {
  app.get("/api/gmail/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const error = typeof req.query.error === "string" ? req.query.error : null;

    if (error) {
      console.error("[Gmail OAuth] User denied access or error:", error);
      return res.redirect(302, "/expenses?gmail_error=" + encodeURIComponent(error));
    }

    if (!code || !state) {
      console.error("[Gmail OAuth] Missing code or state");
      return res.redirect(302, "/expenses?gmail_error=missing_params");
    }

    let userId: number;
    try {
      const payload = verifyOAuthState(state);
      userId = payload.userId as number;
      if (!userId || typeof userId !== "number") throw new Error("Invalid userId in state");
    } catch (err) {
      console.error("[Gmail OAuth] Invalid or expired state parameter");
      return res.redirect(302, "/expenses?gmail_error=invalid_state");
    }

    const redirectUri = `${ENV.appUrl}/api/gmail/callback`;

    try {
      const { accessToken, refreshToken, email, expiresAt } = await exchangeCodeForTokens(
        code,
        redirectUri
      );

      const hasReadScope = await verifyGmailScopes(accessToken);
      if (!hasReadScope) {
        console.error(`[Gmail OAuth] User did not grant gmail.readonly scope for userId=${userId}`);
        return res.redirect(
          302,
          "/expenses?gmail_error=" +
            encodeURIComponent("יש לאשר הרשאת קריאת מיילים כדי לסרוק חשבוניות. אנא נסה שוב ואשר את כל ההרשאות.")
        );
      }

      await saveGmailConnection(userId, accessToken, refreshToken, email, expiresAt);
      console.log(`[Gmail OAuth] Connected Gmail for userId=${userId}, email=${email}`);
      return res.redirect(302, "/expenses?gmail_connected=1");
    } catch (err) {
      console.error("[Gmail OAuth] Token exchange failed:", err);
      return res.redirect(302, "/expenses?gmail_error=connection_failed");
    }
  });
}
