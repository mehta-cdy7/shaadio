import { z } from 'zod';

/** Request and response shapes for auth (API_DESIGN §10). Client-safe: shared with the forms. */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address.' }).max(254));

export const signupSchema = z.strictObject({
  name: z.string().trim().min(1, 'Enter your name.').max(80),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.strictObject({
  email,
  // No length rules at login: they would tell an attacker about the policy, not protect anything.
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const emptySchema = z.strictObject({});

export type UserResponse = { id: string; name: string; email: string };

export type MeResponse = {
  user: UserResponse;
  membership?: { role: 'ADMIN' | 'MANAGER'; label?: string };
  wedding?: { id: string; brideName: string; groomName: string; weddingDate: string };
};
