import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const ipHeader = (req as unknown as { headers?: { get?: (k: string) => string | null } })?.headers;
        const ip =
          (ipHeader?.get?.("x-forwarded-for")?.split(",")[0].trim() ||
            ipHeader?.get?.("x-real-ip") ||
            "unknown");

        const ipLimit = await rateLimit({ key: `login:ip:${ip}`, windowSec: 900, max: 10 });
        if (!ipLimit.allowed) return null;

        const emailLimit = await rateLimit({ key: `login:email:${email}`, windowSec: 3600, max: 10 });
        if (!emailLimit.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { tenant: true },
        });

        if (!user || !user.passwordHash || !user.active) return null;
        if (!user.tenant.active) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          tenantId: user.tenantId,
          unitId: user.unitId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role as string;
        token.tenantId = (user as { tenantId?: string }).tenantId as string;
        token.unitId = (user as { unitId?: string }).unitId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string;
      session.user.unitId = token.unitId as string | undefined;
      return session;
    },
  },
});
