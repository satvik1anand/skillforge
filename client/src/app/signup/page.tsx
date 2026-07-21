import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Create account | SkillForge",
  description: "Create your SkillForge workspace.",
};

export default function SignupPage() {
  return <AuthForm mode="sign-up" />;
}
