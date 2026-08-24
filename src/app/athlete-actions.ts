"use server";
import { prisma } from "@/lib/prisma";
import { nativeCategory, type Cat } from "@/lib/domain/eligibility";
import { selectTier, priceEntry, type Tier } from "@/lib/domain/pricing";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CONSENT_VERSION = "152-fz-v1";

const schema = z.object({
  eventId: z.string().min(1),
  fullName: z.string().trim().min(2, "укажите ФИО"),
  birthDate: z.string().min(1, "укажите дату рождения"),
  sex: z.enum(["M", "F"]),
  weight: z.coerce.number().positive("укажите вес"),
  gi: z.coerce.boolean().default(false),
  nogi: z.coerce.boolean().default(false),
  absolute: z.coerce.boolean().default(false),
  consent: z.coerce.boolean(),
  parentName: z.string().trim().optional().default(""),
  parentConsent: z.coerce.boolean().default(false),
});

export type SelfRegisterResult =
  | { ok: true; msg: string; categoryId: string }
  | { ok: false; msg: string };

/** Возраст (полных лет) на дату dob относительно ref. */
function ageYears(dob: Date, ref = new Date()): number {
  let a = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) a--;
  return a;
}

export async function selfRegister(formData: FormData): Promise<SelfRegisterResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, msg: parsed.error.issues[0]?.message ?? "неверные данные" };
  }
  const d = parsed.data;

  // Согласие на обработку ПДн (152-ФЗ) — обязательно
  if (!d.consent) return { ok: false, msg: "нужно согласие на обработку персональных данных" };

  const disciplines = [d.gi ? "gi" : null, d.nogi ? "nogi" : null].filter(Boolean) as ("gi" | "nogi")[];
  if (!disciplines.length) return { ok: false, msg: "выберите раздел: ги и/или ноу-ги" };

  const dob = new Date(d.birthDate);
  if (Number.isNaN(dob.getTime())) return { ok: false, msg: "неверная дата рождения" };
  const isMinor = ageYears(dob) < 18;
  if (isMinor) {
    if (!d.parentName) return { ok: false, msg: "для несовершеннолетнего укажите ФИО родителя" };
    if (!d.parentConsent) return { ok: false, msg: "нужно согласие родителя/законного представителя" };
  }

  const event = await prisma.event.findUnique({ where: { id: d.eventId }, include: { priceTiers: true } });
  if (!event) return { ok: false, msg: "событие не найдено" };
  if (event.status !== "REG_OPEN") return { ok: false, msg: "регистрация на это событие закрыта" };

  const cats = await prisma.category.findMany({ where: { eventId: d.eventId, isAbsolute: false } });
  const catMap: Cat[] = cats.map((c) => ({
    id: c.id, sex: c.sex as "M" | "F", discipline: c.discipline as "gi" | "nogi",
    birthYearFrom: c.birthYearFrom, birthYearTo: c.birthYearTo, weightMin: c.weightMin, weightMax: c.weightMax,
    isOpenTop: c.isOpenTop, isAbsolute: c.isAbsolute, level: c.level,
  }));

  const birthYear = dob.getFullYear();
  const ainfo = { sex: d.sex, birthYear, weight: d.weight };
  const chosen: { disc: "gi" | "nogi"; catId: string }[] = [];
  const notes: string[] = [];
  for (const disc of disciplines) {
    let nc = nativeCategory(ainfo, disc, catMap);
    if (!nc) {
      nc = nativeCategory(ainfo, disc, catMap, { allowPlayUp: true });
      if (nc) notes.push(`${disc}: перевес/нет своей → старшая группа`);
    }
    if (!nc) return { ok: false, msg: `нет категории ${disc} для ${d.sex}, ${birthYear} г.р., ${d.weight} кг` };
    chosen.push({ disc, catId: nc.id });
  }

  // абсолютка: подбираем абсолютную категорию по полу+ближайшему разделу, если она есть
  let absoluteCatId: string | null = null;
  const absoluteAdded = d.absolute;
  if (absoluteAdded) {
    const absCat = await prisma.category.findFirst({
      where: { eventId: d.eventId, isAbsolute: true, sex: d.sex, discipline: disciplines[0] },
    });
    absoluteCatId = absCat?.id ?? null;
  }

  const tiers: Tier[] = event.priceTiers.map((t) => ({
    name: t.name, startsAt: t.startsAt, priceOneDivision: t.priceOneDivision,
    priceBothDivisions: t.priceBothDivisions, absoluteSurcharge: t.absoluteSurcharge,
  }));
  const tier = selectTier(tiers, new Date()) ?? tiers[0];
  if (!tier) return { ok: false, msg: "цены не настроены для события" };
  const price = priceEntry(tier, { disciplines, absoluteAdded });

  const user = await getCurrentUser();

  try {
    // если у авторизованного атлета уже есть профиль — переиспользуем; иначе дедуп по ФИО+дата
    let existingAth =
      user ? await prisma.athlete.findUnique({ where: { userId: user.id } }) : null;
    if (!existingAth) {
      existingAth = await prisma.athlete.findFirst({
        where: { fullName: d.fullName, birthDate: dob },
      });
    }

    let athleteId: string;
    if (existingAth) {
      const dup = await prisma.eventEntry.findUnique({
        where: { athleteId_eventId: { athleteId: existingAth.id, eventId: d.eventId } },
      });
      if (dup) return { ok: false, msg: "вы уже заявлены на это событие" };
      athleteId = existingAth.id;
      await prisma.athlete.update({
        where: { id: existingAth.id },
        data: {
          sex: d.sex,
          ...(isMinor ? { parentName: d.parentName, parentConsent: true } : {}),
          ...(user && !existingAth.userId ? { userId: user.id } : {}),
        },
      });
    } else {
      const ath = await prisma.athlete.create({
        data: {
          fullName: d.fullName,
          birthDate: dob,
          sex: d.sex,
          userId: user?.id ?? null,
          parentName: isMinor ? d.parentName : null,
          parentConsent: isMinor ? true : false,
        },
      });
      athleteId = ath.id;
    }

    // Consent-строки (152-ФЗ + согласие родителя для несовершеннолетних)
    await prisma.consent.create({
      data: { athleteId, type: "PERSONAL_DATA_152FZ", version: CONSENT_VERSION },
    });
    if (isMinor) {
      await prisma.consent.create({
        data: { athleteId, type: "PARENTAL", version: CONSENT_VERSION },
      });
    }

    const entry = await prisma.eventEntry.create({
      data: {
        athleteId, eventId: d.eventId, source: "self",
        tierName: tier.name, disciplines: disciplines.join(","),
        absoluteAdded, priceTotal: price,
      },
    });
    for (const ch of chosen) {
      await prisma.registration.create({
        data: { entryId: entry.id, athleteId, categoryId: ch.catId, declaredWeight: d.weight, status: "ENTERED" },
      });
    }
    if (absoluteCatId) {
      await prisma.registration.create({
        data: { entryId: entry.id, athleteId, categoryId: absoluteCatId, declaredWeight: d.weight, status: "ENTERED" },
      });
    }

    revalidatePath(`/event/${d.eventId}`);
    revalidatePath("/me");
    const note = notes.length ? ` · ${notes.join("; ")}` : "";
    return {
      ok: true,
      categoryId: chosen[0].catId,
      msg: `заявка принята: ${disciplines.join("+")}${absoluteAdded ? "+абсолютка" : ""} · ${price} ₽${note}`,
    };
  } catch (err) {
    return { ok: false, msg: String((err as Error).message) };
  }
}

/** Клиентский помощник ищет атлета по имени для /me/search (без авторизации). */
export async function findMyEntries(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const athletes = await prisma.athlete.findMany({
    where: { fullName: { contains: q } },
    include: {
      club: true,
      registrations: {
        include: { category: { include: { event: true } } },
      },
    },
    take: 20,
  });
  return athletes.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    club: a.club?.name ?? null,
    events: [
      ...new Map(
        a.registrations.map((r) => [r.category.eventId, { id: r.category.eventId, name: r.category.event.name }])
      ).values(),
    ],
    categories: a.registrations.map((r) => ({
      id: r.categoryId,
      label: `${r.category.ageGroupLabel} · ${r.category.discipline}`,
      event: r.category.event.name,
    })),
  }));
}

/** Поиск участников/клубов на странице события. */
export async function searchEventParticipants(eventId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const regs = await prisma.registration.findMany({
    where: {
      category: { eventId },
      OR: [
        { athlete: { fullName: { contains: q } } },
        { athlete: { club: { name: { contains: q } } } },
      ],
    },
    include: {
      athlete: { include: { club: true } },
      category: true,
    },
    take: 40,
  });
  // дедуп по атлет+категория
  const seen = new Set<string>();
  const out: { athlete: string; club: string | null; categoryId: string; category: string }[] = [];
  for (const r of regs) {
    const key = `${r.athleteId}:${r.categoryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      athlete: r.athlete.fullName,
      club: r.athlete.club?.name ?? null,
      categoryId: r.categoryId,
      category: `${r.category.ageGroupLabel} · ${r.category.sex === "M" ? "муж" : "жен"} · ${r.category.discipline}`,
    });
  }
  return out;
}
