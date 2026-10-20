export function getRequestIp(request) {
  const address =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  return address.slice(0, 64);
}
