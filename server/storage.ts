import fs from "fs";
import path from "path";
import { ENV } from "./_core/env";

function getStoragePath(): string {
  const storagePath = ENV.storagePath || "./data/uploads";
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  return storagePath;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const basePath = getStoragePath();
  const key = normalizeKey(relKey);
  const filePath = path.join(basePath, key);

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const buffer = typeof data === "string"
    ? Buffer.from(data, "utf-8")
    : Buffer.from(data);

  fs.writeFileSync(filePath, buffer);

  const url = `/api/files/${key}`;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return {
    key,
    url: `/api/files/${key}`,
  };
}

export async function storageRead(relKey: string): Promise<Buffer | null> {
  const basePath = getStoragePath();
  const key = normalizeKey(relKey);
  const filePath = path.join(basePath, key);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath);
}

export async function storageDelete(relKey: string): Promise<void> {
  const basePath = getStoragePath();
  const key = normalizeKey(relKey);
  const filePath = path.join(basePath, key);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
