const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export async function readPaymentProof(formData) {
  const file = formData.get("proof");
  if (
    typeof File === "undefined" ||
    !(file instanceof File) ||
    file.size <= 0 ||
    file.size > MAX_PROOF_BYTES
  ) {
    return { error: "Choose a payment proof image no larger than 5 MB." };
  }

  let bytes;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    console.error("Reading uploaded payment proof failed:", error);
    return { error: "The uploaded image could not be read. Please choose it again." };
  }
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp =
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";

  const detectedType = isJpeg
    ? "image/jpeg"
    : isPng
      ? "image/png"
      : isWebp
        ? "image/webp"
        : "";
  if (!detectedType || file.type?.toLowerCase() !== detectedType) {
    return { error: "Payment proof must be a valid JPEG, PNG, or WebP image." };
  }

  return { bytes };
}
