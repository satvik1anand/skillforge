import type { Metadata } from "next";

import { ConfirmationPending } from "@/components/auth/confirmation-pending";

export const metadata: Metadata = {
  title: "Confirm your email | SkillForge",
  description: "Confirm your SkillForge account email to open your workspace.",
};

export default function ConfirmationPendingPage() {
  return <ConfirmationPending />;
}
