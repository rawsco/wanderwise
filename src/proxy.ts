import { withAuth } from "next-auth/middleware";
import type { NextRequest } from "next/server";

export default withAuth(function proxy(_req: NextRequest) {
  return undefined;
});

export const config = {
  matcher: ["/trips/:path*", "/profiles/:path*"],
};
