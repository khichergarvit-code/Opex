import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { User, Mail, Lock, ArrowRight } from "lucide-react";
import Logo from "@/components/Logo";
import AuthField from "@/components/AuthField";
import GoogleButton from "@/components/GoogleButton";

export default function SignUp() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-soft"
      >
        <div className="flex flex-col items-center text-center">
          <Logo size={34} />
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-muted">
            Start building with private AI infrastructure
          </p>
        </div>

        <form className="mt-7 flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
          <AuthField icon={User} placeholder="Full name" />
          <AuthField icon={Mail} type="email" placeholder="Work email" />
          <AuthField icon={Lock} password placeholder="Password" />
          <AuthField icon={Lock} password placeholder="Confirm password" />

          <label className="flex items-start gap-2 pt-1 text-sm text-muted">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-line accent-brand-600"
            />
            <span>
              I agree to the{" "}
              <a href="#" className="font-semibold text-brand-600 hover:text-brand-700">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="font-semibold text-brand-600 hover:text-brand-700">
                Privacy Policy
              </a>
            </span>
          </label>

          <Link
            to="/dashboard"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-brand-700"
          >
            Create account <ArrowRight size={16} />
          </Link>
        </form>

        <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
          <span className="h-px flex-1 bg-line" />
          Or sign up with
          <span className="h-px flex-1 bg-line" />
        </div>

        <GoogleButton label="Sign up with Google" />

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
