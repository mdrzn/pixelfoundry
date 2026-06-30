import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      hashedPassword: true,
      credits: true,
      role: true,
    },
  });
  console.log(users);
} catch (error) {
  console.error(error);
} finally {
  await prisma.$disconnect();
}
