export function requiresTermsAcceptance(user, legalContent) {
  return Boolean(
    user?.role === "user" &&
      legalContent?.requireReacceptance &&
      user.termsVersion !== (legalContent.termsVersion || "v1"),
  );
}
