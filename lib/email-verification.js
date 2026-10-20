export function isEmailVerified(user) {
  return Boolean(user) &&
    (user.emailVerified === true || user.emailVerified === undefined);
}
