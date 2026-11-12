// Just the cookie name — deliberately its own module, with no other
// imports. src/middleware.ts runs on the Edge runtime (no Node APIs, no
// Prisma) and needs this constant; @/lib/session now looks up the user in
// the database (see getSession's active-user check), which would pull
// Prisma into the edge middleware bundle if middleware imported it from
// there instead.
export const SESSION_COOKIE = "mcc_session";
