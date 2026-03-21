import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  exchangeCodeForTokensMock,
  saveGmailConnectionMock,
  verifyGmailScopesMock,
  verifyOAuthStateMock,
} = vi.hoisted(() => ({
  exchangeCodeForTokensMock: vi.fn(),
  saveGmailConnectionMock: vi.fn(),
  verifyGmailScopesMock: vi.fn(),
  verifyOAuthStateMock: vi.fn(),
}));

vi.mock("./gmail", () => ({
  exchangeCodeForTokens: exchangeCodeForTokensMock,
  saveGmailConnection: saveGmailConnectionMock,
  verifyGmailScopes: verifyGmailScopesMock,
}));

vi.mock("./routers", () => ({
  verifyOAuthState: verifyOAuthStateMock,
}));

vi.mock("./_core/env", () => ({
  ENV: {
    appUrl: "https://lumi.test",
  },
}));

import { registerGmailCallbackRoute } from "./gmailCallback";

function getHandler() {
  const app = {
    get: vi.fn(),
  };
  registerGmailCallbackRoute(app as any);
  return app.get.mock.calls[0][1];
}

function createResponse() {
  return {
    redirect: vi.fn(),
  };
}

beforeEach(() => {
  exchangeCodeForTokensMock.mockReset();
  saveGmailConnectionMock.mockReset();
  verifyGmailScopesMock.mockReset();
  verifyOAuthStateMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerGmailCallbackRoute", () => {
  it("redirects with the provider error when the user denies access", async () => {
    const handler = getHandler();
    const res = createResponse();

    await handler({ query: { error: "access_denied" } }, res);

    expect(res.redirect).toHaveBeenCalledWith(302, "/expenses?gmail_error=access_denied");
  });

  it("redirects when code or state are missing", async () => {
    const handler = getHandler();
    const res = createResponse();

    await handler({ query: { code: "abc" } }, res);

    expect(res.redirect).toHaveBeenCalledWith(302, "/expenses?gmail_error=missing_params");
  });

  it("redirects when the oauth state is invalid", async () => {
    verifyOAuthStateMock.mockImplementation(() => {
      throw new Error("bad state");
    });

    const handler = getHandler();
    const res = createResponse();

    await handler({ query: { code: "abc", state: "signed-state" } }, res);

    expect(res.redirect).toHaveBeenCalledWith(302, "/expenses?gmail_error=invalid_state");
  });

  it("keeps the default return path when the requested returnTo is unsafe", async () => {
    verifyOAuthStateMock.mockReturnValue({
      userId: 7,
      returnTo: "//evil.example.com",
    });
    exchangeCodeForTokensMock.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      email: "user@gmail.com",
      expiresAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    verifyGmailScopesMock.mockResolvedValue(true);

    const handler = getHandler();
    const res = createResponse();

    await handler({ query: { code: "abc", state: "signed-state" } }, res);

    expect(res.redirect).toHaveBeenCalledWith(302, "/expenses?gmail_connected=1");
  });

  it("redirects back with an explanatory error when readonly scope is missing", async () => {
    verifyOAuthStateMock.mockReturnValue({
      userId: 7,
      returnTo: "/chat",
    });
    exchangeCodeForTokensMock.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      email: "user@gmail.com",
      expiresAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    verifyGmailScopesMock.mockResolvedValue(false);

    const handler = getHandler();
    const res = createResponse();

    await handler({ query: { code: "abc", state: "signed-state" } }, res);

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      expect.stringContaining("/chat?gmail_error=")
    );
    expect(saveGmailConnectionMock).not.toHaveBeenCalled();
  });

  it("redirects with a connection error when token exchange fails", async () => {
    verifyOAuthStateMock.mockReturnValue({
      userId: 7,
      returnTo: "/chat",
    });
    exchangeCodeForTokensMock.mockRejectedValue(new Error("exchange failed"));

    const handler = getHandler();
    const res = createResponse();

    await handler({ query: { code: "abc", state: "signed-state" } }, res);

    expect(res.redirect).toHaveBeenCalledWith(302, "/chat?gmail_error=connection_failed");
  });

  it("saves the connection and appends a success flag to an existing query string", async () => {
    verifyOAuthStateMock.mockReturnValue({
      userId: 7,
      returnTo: "/chat?step=1",
    });
    exchangeCodeForTokensMock.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      email: "user@gmail.com",
      expiresAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    verifyGmailScopesMock.mockResolvedValue(true);

    const handler = getHandler();
    const res = createResponse();

    await handler({ query: { code: "abc", state: "signed-state" } }, res);

    expect(exchangeCodeForTokensMock).toHaveBeenCalledWith("abc", "https://lumi.test/api/gmail/callback");
    expect(saveGmailConnectionMock).toHaveBeenCalledWith(
      7,
      "access-token",
      "refresh-token",
      "user@gmail.com",
      new Date("2026-04-01T00:00:00.000Z")
    );
    expect(res.redirect).toHaveBeenCalledWith(302, "/chat?step=1&gmail_connected=1");
  });
});
