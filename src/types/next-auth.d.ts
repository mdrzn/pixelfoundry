declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role?: string;
      credits?: number;
    };
  }

  interface User {
    role?: string;
    credits?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    credits?: number;
  }
}
