"use server";
import { prisma } from "@/lib/prisma";
import { allowedCategories, type SelectableCat } from "@/lib/domain/eligibility";
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
  belt: z.string().trim().optional().default(""),
  consent: z.coerce.boolean().default(false),
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

function toSelectable(c: {
  id: string; sex: string; discipline: string; birthYearFrom: number; birthYearTo: number;
  weightMin: number | null; weightMax: number | null; isOpenTop: boolean; isAbsolute: boolean;
  level: string; ageGroupCode: string;
}): SelectableCat {
  return {
    id: c.id, sex: c.sex as "M" | "F", discipline: c.discipline as "gi" | "nogi",
    birthYearFrom: c.birthYearFrom, birthYearTo: c.birthYearTo, weightMin: c.weightMin, weightMax: c.weightMax,
    isOpenTop: c.isOpenTop, isAbsolute: c.isAbsolute, level: c.level, ageGroupCode: c.ageGroupCode,
  };
}

/** Само-регистрация: атлет САМ выбирает категории (categoryIds[]). Вес — необязателен (для фильтра
 *  на клиенте); пояс — косметический. Сервер перепроверяет выбранные категории по жёстким правилам
 *  (пол + дети↔взрослые). Цена — по числу выбранных категорий (первая + доп×(N−1)). */
export async function selfRegister(formData: FormData): Promise<SelfRegisterResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, msg: parsed.error.issues[0]?.message ?? "неверные данные" };
  }
  const d = parsed.data;
  const categoryIds = [...new Set(formData.getAll("categoryIds").map(String).filter(Boolean))];
  const weightRaw = String(formData.get("weight") ?? "").trim();
  const declaredWeight = weightRaw ? Number(weightRaw) : null;

  if (!d.consent) return { ok: false, msg: "нужно согласие на обработку персональных данных" };
  if (!categoryIds.length) return { ok: false, msg: "выберите хотя бы одну категорию" };

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

  const cats = await prisma.category.findMany({ where: { eventId: d.eventId, mergedIntoId: null } });
  const selectable = cats.map(toSelectable);
  const birthYear = dob.getFullYear();
  const allowed = new Map(allowedCategories({ sex: d.sex, birthYear }, selectable).map((c) => [c.id, c]));

  // Серверная перепроверка: все выбранные категории должны быть допустимы этому атлету.
  const chosen = categoryIds.filter((id) => allowed.has(id));
  const rejected = categoryIds.filter((id) => !allowed.has(id));
  if (!chosen.length) return { ok: false, msg: "выбранные категории недоступны (пол/возраст)" };
  if (rejected.length) return { ok: false, msg: "часть выбранных категорий недоступна вам — обновите список" };

  const tiers: Tier[] = event.priceTiers.map((t) => ({
    name: t.name, startsAt: t.startsAt, priceFirstCategory: t.priceFirstCategory, priceExtraCategory: t.priceExtraCategory,
  }));
  const tier = selectTier(tiers, new Date()) ?? tiers[0];
  if (!tier) return { ok: false, msg: "цены не настроены для события" };
  const price = priceEntry(tier, { categoryCount: chosen.length });

  const disciplines = [...new Set(chosen.map((id) => allowed.get(id)!.discipline))];
  const absoluteAdded = chosen.some((id) => allowed.get(id)!.isAbsolute);

  const user = await getCurrentUser();

  try {
    let existingAth = user ? await prisma.athlete.findUnique({ where: { userId: user.id } }) : null;
    if (!existingAth) {
      existingAth = await prisma.athlete.findFirst({ where: { fullName: d.fullName, birthDate: dob } });
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
          ...(d.belt ? { belt: d.belt } : {}),
          ...(isMinor ? { parentName: d.parentName, parentConsent: true } : {}),
          ...(user && !existingAth.userId ? { userId: user.id } : {}),
        },
      });
    } else {
      const ath = await prisma.athlete.create({
        data: {
          fullName: d.fullName, birthDate: dob, sex: d.sex,
          belt: d.belt || null,
          userId: user?.id ?? null,
          parentName: isMinor ? d.parentName : null,
          parentConsent: isMinor ? true : false,
        },
      });
      athleteId = ath.id;
    }

    await prisma.consent.create({ data: { athleteId, type: "PERSONAL_DATA_152FZ", version: CONSENT_VERSION } });
    if (isMinor) {
      await prisma.consent.create({ data: { athleteId, type: "PARENTAL", version: CONSENT_VERSION } });
    }

    const entry = await prisma.eventEntry.create({
      data: {
        athleteId, eventId: d.eventId, source: "self",
        tierName: tier.name, disciplines: disciplines.join(","),
        absoluteAdded, priceTotal: price,
      },
    });
    for (const catId of chosen) {
      await prisma.registration.create({
        data: { entryId: entry.id, athleteId, categoryId: catId, declaredWeight, status: "ENTERED" },
      });
    }

    revalidatePath(`/event/${d.eventId}`);
    revalidatePath("/me");
    return {
      ok: true,
      categoryId: chosen[0],
      msg: `заявка принята: ${chosen.length} ${chosen.length === 1 ? "категория" : "категории(й)"} · ${price} ₽`,
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
