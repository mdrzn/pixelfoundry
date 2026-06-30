import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// NextAuth v4 with App Router requires type assertion due to incomplete types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (NextAuth as any)(authOptions);

export { handler as GET, handler as POST };

