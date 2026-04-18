import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "alchemypet" },
    update: {},
    create: {
      name: "Alchemypet Medicina Diagnóstica",
      slug: "alchemypet",
      plan: "PRO",
      active: true,
    },
  });

  const unit = await prisma.unit.upsert({
    where: { id: "unit-matriz" },
    update: {},
    create: {
      id: "unit-matriz",
      tenantId: tenant.id,
      name: "Matriz",
      active: true,
    },
  });

  const passwordHash = await bcrypt.hash("Ede300porcento$$", 12);

  const user = await prisma.user.upsert({
    where: { email: "fer.jorge@gmail.com" },
    update: { passwordHash, role: "SUPERADMIN", active: true },
    create: {
      tenantId: tenant.id,
      unitId: unit.id,
      name: "Fernando Jorge",
      email: "fer.jorge@gmail.com",
      passwordHash,
      role: "SUPERADMIN",
      active: true,
    },
  });

  console.log("✓ Tenant:", tenant.name);
  console.log("✓ Unidade:", unit.name);
  console.log("✓ Admin:", user.email, `(${user.role})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
