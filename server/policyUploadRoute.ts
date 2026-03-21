import Busboy from "busboy";
import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { audit } from "./auditLog";
import { sdk } from "./_core/sdk";
import { createAnalysis } from "./db";
import { policyAnalysisWorker } from "./policyAnalysisWorker";
import { createStorageWriteStream, storageDelete } from "./storage";

const MAX_POLICY_FILES = 10;
const MAX_POLICY_FILE_SIZE = 20 * 1024 * 1024;

type UploadedPolicyFile = {
  name: string;
  size: number;
  fileKey: string;
  mimeType: string;
};

function isPdfHeader(buffer: Buffer) {
  return buffer.length >= 5 && buffer.toString("utf8", 0, 5) === "%PDF-";
}

function isJpegHeader(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPngHeader(buffer: Buffer) {
  return buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a;
}

function isWebpHeader(buffer: Buffer) {
  return buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP";
}

function detectMimeType(buffer: Buffer) {
  if (isPdfHeader(buffer)) return "application/pdf";
  if (isJpegHeader(buffer)) return "image/jpeg";
  if (isPngHeader(buffer)) return "image/png";
  if (isWebpHeader(buffer)) return "image/webp";
  return null;
}

function normalizeUploadFilename(filename: string, detectedMimeType: string) {
  const cleanName = filename.trim() || "policy";
  const hasExtension = /\.[a-z0-9]+$/i.test(cleanName);
  if (hasExtension) return cleanName;
  if (detectedMimeType === "image/jpeg") return `${cleanName}.jpg`;
  if (detectedMimeType === "image/png") return `${cleanName}.png`;
  if (detectedMimeType === "image/webp") return `${cleanName}.webp`;
  return `${cleanName}.pdf`;
}

function getExtensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".pdf";
}

function createPolicyValidationStream() {
  let totalBytes = 0;
  let header = Buffer.alloc(0);
  return new Transform({
    transform(chunk, _encoding, callback) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_POLICY_FILE_SIZE) {
        callback(new Error("קובץ חורג ממגבלת 20MB"));
        return;
      }
      if (header.length < 12) {
        const needed = 12 - header.length;
        header = Buffer.concat([header, chunk.subarray(0, needed)]);
        if (header.length >= 12 && !detectMimeType(header)) {
          callback(new Error("ניתן להעלות רק PDF או תמונה תקינה של מסמך"));
          return;
        }
      }
      callback(null, chunk);
    },
    flush(callback) {
      if (!totalBytes) {
        callback(new Error("לא התקבלו נתונים בקובץ"));
        return;
      }
      if (!detectMimeType(header)) {
        callback(new Error("ניתן להעלות רק PDF או תמונה תקינה של מסמך"));
        return;
      }
      callback();
    },
  });
}

async function parsePolicyUploadRequest(req: Request, sessionId: string) {
  const uploadedFiles: UploadedPolicyFile[] = [];
  const storedFileKeys: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const parser = Busboy({
      headers: req.headers,
      limits: {
        files: MAX_POLICY_FILES,
        fileSize: MAX_POLICY_FILE_SIZE,
      },
    });
    const fileTasks: Promise<void>[] = [];
    let fileCount = 0;

    const fail = (error: Error) => {
      reject(error);
    };

    parser.on("file", (fieldName, file, info) => {
      if (fieldName !== "files") {
        file.resume();
        return;
      }
      fileCount += 1;
      const task = (async () => {
        const incomingName = info.filename?.trim() || "policy";
        const reportedMimeType = info.mimeType === "image/jpeg"
          || info.mimeType === "image/png"
          || info.mimeType === "image/webp"
          || info.mimeType === "application/pdf"
          ? info.mimeType
          : "application/pdf";
        const normalizedFilename = normalizeUploadFilename(incomingName, reportedMimeType);
        const extension = normalizedFilename.includes(".")
          ? normalizedFilename.slice(normalizedFilename.lastIndexOf("."))
          : getExtensionForMimeType(reportedMimeType);
        const fileKey = `policies/${sessionId}/${nanoid(24)}${extension}`;
        let fileSize = 0;
        const sizeTracker = new Transform({
          transform(chunk, _encoding, callback) {
            fileSize += chunk.length;
            callback(null, chunk);
          },
        });
        try {
          const storageTarget = await createStorageWriteStream(fileKey);
          await pipeline(file, createPolicyValidationStream(), sizeTracker, storageTarget.stream);
          uploadedFiles.push({
            name: normalizedFilename,
            size: fileSize,
            fileKey,
            mimeType: reportedMimeType,
          });
          storedFileKeys.push(fileKey);
        } catch (error) {
          await storageDelete(fileKey).catch(() => {});
          throw error;
        }
      })().catch((error) => {
        parser.destroy(error instanceof Error ? error : new Error(String(error)));
        throw error;
      });
      fileTasks.push(task);
    });

    parser.on("filesLimit", () => {
      parser.destroy(new Error(`ניתן להעלות עד ${MAX_POLICY_FILES} קבצים בכל פעם`));
    });

    parser.on("error", (error) => {
      void Promise.allSettled(fileTasks).then(() => fail(error instanceof Error ? error : new Error(String(error))));
    });

    parser.on("finish", () => {
      Promise.all(fileTasks)
        .then(() => {
          if (!fileCount || uploadedFiles.length === 0) {
            reject(new Error("לא נבחרו קבצים להעלאה"));
            return;
          }
          resolve();
        })
        .catch((error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });

    req.pipe(parser);
  }).catch(async (error) => {
    await Promise.all(storedFileKeys.map((fileKey) => storageDelete(fileKey).catch(() => {})));
    throw error;
  });

  return uploadedFiles;
}

export function registerPolicyUploadRoute(app: Express) {
  app.post("/api/policies/upload", async (req: Request, res: Response) => {
    if (!req.headers["content-type"]?.includes("multipart/form-data")) {
      res.status(415).json({
        error: "Unsupported Media Type",
        message: "יש להעלות קבצים בפורמט multipart/form-data",
      });
      return;
    }

    try {
      const user = await sdk.authenticateRequest(req);
      const sessionId = nanoid(16);
      const uploadedFiles = await parsePolicyUploadRequest(req, sessionId);
      await createAnalysis({
        sessionId,
        userId: user.id,
        files: uploadedFiles,
        status: "pending",
      });
      await audit({
        userId: user.id,
        action: "upload_file",
        resource: "file",
        resourceId: sessionId,
        details: JSON.stringify({
          fileCount: uploadedFiles.length,
          fileNames: uploadedFiles.map((file) => file.name),
        }),
      });
      policyAnalysisWorker.nudge();
      res.status(201).json({
        sessionId,
        files: uploadedFiles,
      });
    } catch (error: any) {
      const message = error?.message || "שגיאה בהעלאת הקבצים";
      const statusCode = message === "Invalid session cookie" ? 401 : 400;
      res.status(statusCode).json({
        error: statusCode === 401 ? "Unauthorized" : "Bad Request",
        message,
      });
    }
  });
}
