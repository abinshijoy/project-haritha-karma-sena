import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.SEED_ADMIN_PHONE || '+910000000000';
  const name = process.env.SEED_ADMIN_NAME || 'System Admin';

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { phone },
      data: { role: 'ADMIN', name, isActive: true },
    });
    console.log(`Admin user ensured: ${updated.phone} (${updated.id})`);
    return;
  }

  const admin = await prisma.user.create({
    data: { phone, name, role: 'ADMIN', isActive: true },
  });
  console.log(`Admin user created: ${admin.phone} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
