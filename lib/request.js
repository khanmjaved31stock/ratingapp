export function isSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      .trim();
    const host = (forwardedHost || request.headers.get("host") || "").toLowerCase();
    const forwardedProtocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      .trim()
      .toLowerCase();
    const protocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);

    return (
      originUrl.origin === requestUrl.origin ||
      (host !== "" &&
        ["http", "https"].includes(protocol) &&
        originUrl.protocol === `${protocol}:` &&
        originUrl.host.toLowerCase() === host)
    );
  } catch {
    return false;
  }
}

export async function readJsonBody(request, { maxBytes = 8192 } = {}) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("JSON body limit must be a positive safe integer.");
  }
  if (contentLength > maxBytes) {
    return { error: "Request is too large." };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { error: "Invalid request body." };
  }

  try {
    const chunks = [];
    let totalLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalLength += value.byteLength;
      if (totalLength > maxBytes) {
        await reader.cancel();
        return { error: "Request is too large." };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: "Invalid request body." };
    }
    return { body };
  } catch {
    return { error: "Invalid JSON request body." };
  } finally {
    reader.releaseLock();
  }
}

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

export function validPassword(value) {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 128 &&
    new TextEncoder().encode(value).byteLength <= 72
  );
}
