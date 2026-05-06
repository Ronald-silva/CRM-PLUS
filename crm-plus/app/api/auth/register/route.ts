import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { checkRateLimit, REGISTER_LIMIT } from "@/lib/rate-limit";

const schema = z.object({
  companyName: z.string().min(2).max(255),
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let attempt = 0;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${slugify(base)}-${attempt}`;
  }
  return slug;
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, REGISTER_LIMIT);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { companyName, name, email, password } = parsed.data;

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "E-mail já cadastrado." },
      { status: 409 }
    );
  }

  const slug = await uniqueSlug(companyName);
  const passwordHash = await bcrypt.hash(password, 12);

  const tenant = await prisma.tenant.create({
    data: {
      name: companyName,
      slug,
      users: {
        create: {
          name,
          email,
          passwordHash,
          role: "owner",
        },
      },
    },
    include: { users: true },
  });

  return NextResponse.json(
    { tenantId: tenant.id, slug: tenant.slug },
    { status: 201 }
  );
}
