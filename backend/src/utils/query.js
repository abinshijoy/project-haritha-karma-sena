import { AppError } from './errors.js';

/** Clamp `?limit` and `?offset` to safe positive integers for Prisma. */
export function pagination(query = {}) {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const take = Math.min(
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50,
    100
  );
  const skip = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { take, skip };
}

/** Validate an enum query filter and return a clean 400 instead of a Prisma 500. */
export function enumFilter(value, allowed, label) {
  if (value === undefined || value === '') return undefined;
  const text = String(value);
  if (!allowed.includes(text)) {
    throw new AppError(`Invalid ${label}. Allowed values: ${allowed.join(', ')}`, 400);
  }
  return text;
}
