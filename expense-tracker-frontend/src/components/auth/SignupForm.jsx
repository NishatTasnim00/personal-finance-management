import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "@/store/useAuthStore";
import api from '@/lib/api';
import { useState } from "react";

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

const SignupForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = (data) => {
    setLoading(true);
    createUserWithEmailAndPassword(auth, data.email, data.password)
      .then((userCredential) => {
        const uid = userCredential.user.uid;
        // Save user to backend
        return api.post('/auth/register', {
          uid,
          email: data.email,
          name: data.name,
        });
      })
      .then(() => {
        // Success: update auth store and redirect
        setUser(auth.currentUser);
        navigate("/dashboard");
      })
      .catch((error) => {
        let message = "Signup failed. Please try again.";
        if (error.code === "auth/email-already-in-use") {
          message = "Email already in use.";
        } else if (error.code?.includes?.("auth/")) {
          message = error.message;
        } else if (error.message) {
          message = error.message;
        }
        setError("root", {message});
      })
      .finally(() => {
        setLoading(false)
      });
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
              <span className="label-text">Full Name</span>
            </label>
            <input
              type="text"
              placeholder="John Doe"
              className={`input input-bordered w-full ${
                errors.name ? "input-error" : ""
              }`}
              {...register("name")}
            />
            {errors.name && (
              <label className="label text-error">{errors.name.message}</label>
            )}
          </div>
          <div className="form-control">
            <label className="label">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              className={`input input-bordered w-full ${
                errors.email ? "input-error" : ""
              }`}
              {...register("email")}
            />
            {errors.email && (
              <label className="label text-error">{errors.email.message}</label>
            )}
          </div>
          <div className="form-control">
            <label className="label">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className={`input input-bordered w-full ${
                errors.password ? "input-error" : ""
              }`}
              {...register("password")}
            />
            {errors.password && (
              <label className="label text-error">
                {errors.password.message}
              </label>
            )}
          </div>
          <div className="form-control">
            <label className="label">Confirm Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className={`input input-bordered w-full ${
                errors.confirmPassword ? "input-error" : ""
              }`}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <label className="label text-error">
                {errors.confirmPassword.message}
              </label>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? (
              <span className="loading loading-spinner"></span>
            ) : (
              "Create Account"
            )}
          </button>
          <p className="text-center text-sm">
            Already have an account?{" "}
            <Link to="/login" className="link text-primary">
              Login
            </Link>
          </p>
        </form>
  );
};
export default SignupForm;
