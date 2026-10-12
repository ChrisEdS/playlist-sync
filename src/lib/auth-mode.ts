/** When true, app PIN gate is off (use Vercel Deployment Protection instead). */
export function isAppPinDisabled(): boolean {
  const flag = (process.env.DISABLE_APP_PIN || "").toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}
