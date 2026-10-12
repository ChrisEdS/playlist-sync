import { redirect } from "next/navigation";

export default function LegacyTransferRedirect() {
  redirect("/pairs/new");
}
