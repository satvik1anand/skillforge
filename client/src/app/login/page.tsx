import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in | SkillForge",
  description: "Sign in to your SkillForge workspace.",
};

export default function LoginPage() {
  return <AuthForm mode="sign-in" />;
}
