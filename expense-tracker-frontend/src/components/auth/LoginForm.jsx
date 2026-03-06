import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "@/store/useAuthStore";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const LoginForm = () => {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data) => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );
      setUser(userCredential.user);
      navigate("/dashboard");
    } catch (error) {
      setError("root", {
        message:
          error.code === "auth/user-not-found" || error.code === "auth/wrong-password"
            ? "Invalid email or password"
            : "Login failed. Try again.",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {errors.root && (
        <div className="alert alert-error shadow-lg">
          <span>{errors.root.message}</span>
        </div>
      )}

      <div className="form-control">
        <label className="label">
          <span className="label-text">Email</span>
        </label>
        <input
          type="email"
          placeholder="you@example.com"
          className={`input input-bordered w-full ${errors.email ? "input-error" : ""}`}
          {...register("email")}
        />
        {errors.email && <label className="label text-error">{errors.email.message}</label>}
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Password</span>
        </label>
        <input
          type="password"
          placeholder="••••••••"
          className={`input input-bordered w-full ${errors.password ? "input-error" : ""}`}
          {...register("password")}
        />
        {errors.password && <label className="label text-error">{errors.password.message}</label>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn btn-primary w-full"
      >
        {isSubmitting ? (
          <span className="loading loading-spinner"></span>
        ) : (
          "Login"
        )}
      </button>

      <p className="text-center text-sm">
        Don't have an account?{" "}
        <Link to="/signup" className="link text-primary">
          Sign up
        </Link>
      </p>
    </form>
  );
}
export default LoginForm;