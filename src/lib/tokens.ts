export function generateInviteToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
