import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Hobby plan: max 1 cron run per day. Upgrade to Pro for */15.
  crons: [{ path: "/api/cron/sync", schedule: "0 4 * * *" }],
};
