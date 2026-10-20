export function getSuperAdminBootstrapPassword(existingUser, password) {
  if (existingUser) {
    if (existingUser.role !== "superAdmin") {
      throw new Error("The Super Admin bootstrap email is already assigned to a non-admin account.");
    }
    return null;
  }

  if (!password) {
    throw new Error("SUPER_ADMIN_PASSWORD must be set before creating the Super Admin account.");
  }
  if (
    password.length < 12 ||
    password.length > 128 ||
    new TextEncoder().encode(password).byteLength > 72
  ) {
    throw new Error("Super Admin bootstrap credentials are invalid.");
  }

  return password;
}
