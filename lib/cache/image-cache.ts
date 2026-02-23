import { sha256 } from "@/lib/utils/hash";

type ImageCacheValue = {
  imageUrl: string;
};

type ImageCacheItem = {
  value: ImageCacheValue;
  expiresAt: number;
};

type RateLimitItem = {
  count: number;
  resetAt: number;
};

const IMAGE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const RATE_LIMIT_WINDOW_MS = 1000 * 60;
const RATE_LIMIT_MAX = 3;

const imageCache = new Map<string, ImageCacheItem>();
const imageRateLimit = new Map<string, RateLimitItem>();

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function toImageCacheHash(dishName: string, style: string, model: string, size: string): string {
  return sha256(`${normalize(dishName)}__${normalize(style)}__${normalize(model)}__${normalize(size)}`);
}

export function readImageCache(hash: string): ImageCacheValue | null {
  const cached = imageCache.get(hash);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    imageCache.delete(hash);
    return null;
  }
  return cached.value;
}

export function writeImageCache(hash: string, value: ImageCacheValue) {
  imageCache.set(hash, {
    value,
    expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
  });
}

export function checkImageRateLimit(ip: string, dishName: string) {
  const key = `${ip}__${normalize(dishName)}`;
  const now = Date.now();
  const existing = imageRateLimit.get(key);

  if (!existing || now > existing.resetAt) {
    imageRateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true as const, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false as const, remaining: 0, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  imageRateLimit.set(key, existing);
  return { allowed: true as const, remaining: RATE_LIMIT_MAX - existing.count };
}
