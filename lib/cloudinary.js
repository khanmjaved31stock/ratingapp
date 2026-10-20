import { v2 as cloudinary } from "cloudinary";

let configured = false;

function getCloudinary() {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error("Cloudinary credentials are not configured.");
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

export async function uploadPrivateImage(buffer, { folder }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new TypeError("Cloudinary image upload requires a non-empty Buffer.");
  }
  if (typeof folder !== "string" || !folder.trim()) {
    throw new TypeError("Cloudinary image upload requires a destination folder.");
  }

  const client = getCloudinary();
  return new Promise((resolve, reject) => {
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const resolveOnce = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const stream = client.uploader.upload_stream(
        {
          folder: folder.trim(),
          resource_type: "image",
          type: "authenticated",
          access_mode: "authenticated",
          overwrite: false,
          unique_filename: true,
          use_filename: false,
        },
        (error, result) => {
          if (error) {
            rejectOnce(error);
          } else if (!result?.public_id || !result.secure_url) {
            rejectOnce(new Error("Cloudinary returned an incomplete image upload response."));
          } else {
            resolveOnce({
              publicId: result.public_id,
              secureUrl: result.secure_url,
              format: result.format,
            });
          }
        },
      );

      stream.once("error", rejectOnce);
      stream.end(buffer);
    } catch (error) {
      rejectOnce(error);
    }
  });
}

export function privateImageUrl(publicId, expiresAtSeconds) {
  return getCloudinary().url(publicId, {
    resource_type: "image",
    type: "authenticated",
    secure: true,
    sign_url: true,
    expires_at: expiresAtSeconds,
  });
}

export async function uploadPrivateRaw(buffer, { folder, filename }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new TypeError("Cloudinary file upload requires a non-empty Buffer.");
  }
  if (
    typeof folder !== "string" ||
    !folder.trim() ||
    typeof filename !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.pdf$/i.test(filename)
  ) {
    throw new TypeError("Cloudinary file upload requires a safe PDF destination.");
  }

  const client = getCloudinary();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (error) return reject(error);
      if (!result?.public_id || !result.secure_url) {
        return reject(new Error("Cloudinary returned an incomplete file upload response."));
      }
      resolve({ publicId: result.public_id, secureUrl: result.secure_url });
    };

    try {
      const stream = client.uploader.upload_stream(
        {
          folder: folder.trim(),
          public_id: filename,
          resource_type: "raw",
          type: "authenticated",
          access_mode: "authenticated",
          overwrite: false,
          unique_filename: false,
          use_filename: false,
        },
        finish,
      );
      stream.once("error", (error) => finish(error));
      stream.end(buffer);
    } catch (error) {
      finish(error);
    }
  });
}

export function privateRawUrl(publicId, expiresAtSeconds, filename) {
  const safeFilename = typeof filename === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.pdf$/i.test(filename)
    ? filename
    : "help-guide.pdf";
  return getCloudinary().url(publicId, {
    resource_type: "raw",
    type: "authenticated",
    secure: true,
    sign_url: true,
    expires_at: expiresAtSeconds,
    flags: `attachment:${safeFilename}`,
  });
}

export async function deleteCloudinaryAsset(publicId) {
  return getCloudinary().uploader.destroy(publicId, {
    resource_type: "image",
    type: "authenticated",
    invalidate: true,
  });
}
