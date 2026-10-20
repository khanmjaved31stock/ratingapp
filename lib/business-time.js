function datePartsAt(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function localMidnightToUtc(year, month, day, timeZone) {
  const localMidnight = Date.UTC(year, month - 1, day);
  let timestamp = localMidnight;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = datePartsAt(new Date(timestamp), timeZone);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const offset = representedAsUtc - timestamp;
    const nextTimestamp = localMidnight - offset;
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }
  return new Date(timestamp);
}

export function getBusinessDayRange(value = new Date(), timeZone = "UTC") {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("A valid date is required.");
  }
  const parts = datePartsAt(value, timeZone);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const start = localMidnightToUtc(year, month, day, timeZone);
  const end = localMidnightToUtc(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    timeZone,
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    start,
    end,
  };
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone.trim() || timeZone.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}
