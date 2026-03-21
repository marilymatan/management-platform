import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import crypto from "crypto";
import { ENV } from "./_core/env";

function getStoragePath(): string {
  return ENV.storagePath || "./data/uploads";
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "").replace(/\0/g, "");
}

function ensureWithinStorage(basePath: string, key: string): string {
  const filePath = path.join(basePath, key);
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(basePath);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export function sanitizeFilename(name: string): string {
  const basename = path.basename(name);
  const sanitized = basename
    .replace(/\0/g, "")
    .replace(/\.\./g, "")
    .replace(/[\/\\]/g, "")
    .replace(/[^a-zA-Z0-9._\- ]/g, "_")
    .replace(/\s+/g, "_");
  return sanitized || "unnamed";
}

export function generateSignedFileUrl(key: string, expiresInSec: number = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const data = `${key}:${exp}`;
  const secret = ENV.cookieSecret;
  const token = crypto.createHmac("sha256", secret).update(data).digest("hex");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `/api/files/${encodedKey}?token=${token}&exp=${exp}`;
}

export function verifyFileSignature(key: string, token: string, exp: string): boolean {
  const expNum = parseInt(exp, 10);
  if (isNaN(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const data = `${key}:${expNum}`;
  const secret = ENV.cookieSecret;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("hex");
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const basePath = getStoragePath();
  const key = normalizeKey(relKey);
  const filePath = ensureWithinStorage(basePath, key);
  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });
  const buffer = typeof data === "string"
    ? Buffer.from(data, "utf-8")
    : Buffer.from(data);
  await fsPromises.writeFile(filePath, buffer);
  const url = `/api/files/${key}`;
  return { key, url };
}

export async function createStorageWriteStream(relKey: string) {
  const basePath = getStoragePath();
  const key = normalizeKey(relKey);
  const filePath = ensureWithinStorage(basePath, key);
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  return {
    key,
    filePath,
    stream: fs.createWriteStream(filePath),
  };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return {
    key,
    url: generateSignedFileUrl(key),
  };
}

export async function storageRead(relKey: string): Promise<Buffer | null> {
  const basePath = getStoragePath();
  const key = normalizeKey(relKey);
  const filePath = ensureWithinStorage(basePath, key);
  try {
    await fsPromises.access(filePath);
  } catch {
    return null;
  }
  return fsPromises.readFile(filePath);
}

export async function storageDelete(relKey: string): Promise<void> {
  const basePath = getStoragePath();
  const key = normalizeKey(relKey);
  const filePath = ensureWithinStorage(basePath, key);
  try {
    await fsPromises.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}
