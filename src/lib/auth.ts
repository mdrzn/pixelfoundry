import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcryptjs";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const LOGIN_RATE_LIMIT = {
  name: "login",
  maxRequests: 10,
  windowSeconds: 300, // 10 attempts per 5 minutes per email
};

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt" as const,
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const { allowed } = checkRateLimit(LOGIN_RATE_LIMIT, credentials.email.toLowerCase());
        if (!allowed) {
          throw new Error("Too many login attempts. Please wait a few minutes and try again.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user?.hashedPassword) {
          return null;
        }

        const isValid = await compare(credentials.password, user.hashedPassword);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          credits: user.credits,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }: { session: Session; token: JWT }) {
      const tokenWithSub = token as JWT & { sub?: string };
      if (session.user && tokenWithSub.sub) {
        session.user.id = tokenWithSub.sub;
        session.user.role = token.role as string | undefined;
        session.user.credits = token.credits as number | undefined;
      }
      return session;
    },
    async jwt({ token }: { token: JWT }) {
      const tokenWithSub = token as JWT & { sub?: string };
      if (!tokenWithSub.sub) {
        return token;
      }

      const user = await prisma.user.findUnique({
        where: { id: tokenWithSub.sub },
        select: { role: true, credits: true },
      });

      token.role = user?.role;
      token.credits = user?.credits;
      return token;
    },
  },
};

