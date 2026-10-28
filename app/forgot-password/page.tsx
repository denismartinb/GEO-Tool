import "@/app/ins/tokens.css";
import "@/app/ins/components.css";
import "@/app/ins/auth.css";
import { AuthPage } from "@/components/ins/auth/page";
import { ForgotFlow } from "./forgot-flow";

// Metadata lives in ./layout.tsx (SEO-POS-1, T10).
export default function ForgotPasswordPage() {
  return (
    <AuthPage>
      <ForgotFlow />
    </AuthPage>
  );
}
