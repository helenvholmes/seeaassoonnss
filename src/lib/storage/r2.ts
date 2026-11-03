import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";
import { IMMUTABLE, type Storage } from "./index";

let client: S3Client | null = null;

function s3(): S3Client {
  const c = config.r2();
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    // R2 does not accept the checksum headers newer SDKs add to presigned uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export function r2Storage(): Storage {
  const c = config.r2();
  return {
    async createUpload(area, key, contentType, size) {
      const isPublic = area === "public";
      const url = await getSignedUrl(
        s3(),
        new PutObjectCommand({
          Bucket: isPublic ? c.publicBucket : c.privateBucket,
          Key: key,
          ContentType: contentType,
          ContentLength: size,
          ...(isPublic ? { CacheControl: IMMUTABLE } : {}),
        }),
        { expiresIn: 600 },
      );
      // Signed headers must be sent exactly as signed.
      return { url, method: "PUT", headers: { "content-type": contentType, ...(isPublic ? { "cache-control": IMMUTABLE } : {}) } };
    },
    async readPrivate(key) {
      const res = await s3().send(new GetObjectCommand({ Bucket: c.privateBucket, Key: key }));
      if (!res.Body) throw new Error(`Empty object ${key}`);
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async readPublicStart(key, length) {
      try {
        const res = await s3().send(new GetObjectCommand({ Bucket: c.publicBucket, Key: key, Range: `bytes=0-${length - 1}` }));
        return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
      } catch {
        return null;
      }
    },
    async writePublic(key, body, contentType) {
      await s3().send(new PutObjectCommand({ Bucket: c.publicBucket, Key: key, Body: body, ContentType: contentType, CacheControl: IMMUTABLE }));
    },
    publicBaseUrl: () => c.publicUrl,
  };
}
