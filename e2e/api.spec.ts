import { test, expect } from "@playwright/test";

test.describe("API endpoints", () => {
  test("GET /api/config returns google client id", async ({ request }) => {
    const response = await request.get("/api/config");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("googleClientId");
  });

  test("tRPC endpoint is reachable", async ({ request }) => {
    const response = await request.get("/api/trpc/policy.getAnalysis?input=%7B%22sessionId%22%3A%22nonexistent%22%7D");
    expect([200, 401, 400]).toContain(response.status());
  });

  test("static file endpoint rejects requests without token", async ({
    request,
  }) => {
    const response = await request.get("/api/files/test.pdf");
    expect(response.status()).toBe(403);
  });

  test("static file endpoint rejects invalid token", async ({ request }) => {
    const response = await request.get(
      "/api/files/test.pdf?token=invalid&exp=9999999999"
    );
    expect(response.status()).toBe(403);
  });
});
