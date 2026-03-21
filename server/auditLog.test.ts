import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

import {
  audit,
  getClientIp,
  getRecentAuditLogs,
  getSecurityEvents,
  getUserAuditLogs,
} from "./auditLog";

function createSelectDb(result: unknown[]) {
  const limitMock = vi.fn().mockResolvedValue(result);
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({
    orderBy: orderByMock,
    where: whereMock,
  });
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: fromMock,
      }),
    },
    whereMock,
    orderByMock,
    limitMock,
  };
}

beforeEach(() => {
  getDbMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auditLog", () => {
  it("skips audit writes when the database is unavailable", async () => {
    getDbMock.mockResolvedValue(null);

    await audit({
      userId: 1,
      action: "login",
      resource: "auth",
    });

    expect(console.warn).toHaveBeenCalled();
  });

  it("writes normalized audit records when a database exists", async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    getDbMock.mockResolvedValue({
      insert: insertMock,
    });

    await audit({
      userId: 1,
      action: "connect_gmail",
      resource: "gmail",
      resourceId: "connection-1",
      ipAddress: "1.2.3.4",
      userAgent: "Vitest",
      details: "connected",
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        action: "connect_gmail",
        resource: "gmail",
        resourceId: "connection-1",
        ipAddress: "1.2.3.4",
        userAgent: "Vitest",
        details: "connected",
        status: "allowed",
      })
    );
  });

  it("swallows insert errors so the main flow does not fail", async () => {
    const valuesMock = vi.fn().mockRejectedValue(new Error("insert failed"));
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    getDbMock.mockResolvedValue({
      insert: insertMock,
    });

    await expect(
      audit({
        action: "logout",
        resource: "auth",
      })
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });

  it("extracts the client ip from forwarded headers and fallbacks", () => {
    expect(
      getClientIp({
        headers: {
          "x-forwarded-for": "5.6.7.8, 1.1.1.1",
        },
      })
    ).toBe("5.6.7.8");

    expect(
      getClientIp({
        headers: {
          "x-real-ip": ["9.9.9.9"],
        },
      })
    ).toBe("9.9.9.9");

    expect(
      getClientIp({
        headers: {},
        ip: "7.7.7.7",
      })
    ).toBe("7.7.7.7");

    expect(
      getClientIp({
        headers: {},
        socket: {
          remoteAddress: "6.6.6.6",
        },
      })
    ).toBe("6.6.6.6");

    expect(
      getClientIp({
        headers: {
          "x-forwarded-for": ["4.4.4.4", "3.3.3.3"],
        },
      })
    ).toBe("4.4.4.4");

    expect(
      getClientIp({
        headers: {
          "x-real-ip": "8.8.8.8",
        },
      })
    ).toBe("8.8.8.8");

    expect(
      getClientIp({
        headers: {},
      })
    ).toBe("unknown");
  });

  it("returns empty arrays from query helpers when the database is unavailable", async () => {
    getDbMock.mockResolvedValue(null);

    await expect(getRecentAuditLogs()).resolves.toEqual([]);
    await expect(getUserAuditLogs(1)).resolves.toEqual([]);
    await expect(getSecurityEvents()).resolves.toEqual([]);
  });

  it("builds query chains for recent logs, user logs and security events", async () => {
    const recent = createSelectDb(["recent"]);
    getDbMock.mockResolvedValueOnce(recent.db);
    await expect(getRecentAuditLogs(5)).resolves.toEqual(["recent"]);
    expect(recent.orderByMock).toHaveBeenCalled();
    expect(recent.limitMock).toHaveBeenCalledWith(5);

    const userLogs = createSelectDb(["user"]);
    getDbMock.mockResolvedValueOnce(userLogs.db);
    await expect(getUserAuditLogs(7, 3)).resolves.toEqual(["user"]);
    expect(userLogs.whereMock).toHaveBeenCalled();
    expect(userLogs.limitMock).toHaveBeenCalledWith(3);

    const securityEvents = createSelectDb(["security"]);
    getDbMock.mockResolvedValueOnce(securityEvents.db);
    await expect(getSecurityEvents(2)).resolves.toEqual(["security"]);
    expect(securityEvents.whereMock).toHaveBeenCalled();
    expect(securityEvents.limitMock).toHaveBeenCalledWith(2);
  });
});
