// Сценарии S056–S150 — серверные экшены по ролям (подделка сессии тем же HMAC) + доменные мутации.
import { vi, describe, it, expect, beforeEach } from "vitest";

// --- Моки Next-инфраструктуры (до импорта экшенов; vitest поднимает vi.mock вверх) ---
const H = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n === "ugp_session" && H.token ? { value: H.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error("REDIRECT:" + u);
  },
}));

import { prisma } from "@/lib/prisma";
import { makeToken, makeUser, makeEvent, makeCategory, makeAthlete, registerAthlete, uniq } from "./_harness";
import { selfRegister } from "@/app/athlete-actions";
import { registerGroup, togglePaidAction } from "@/app/coach-actions";
import { weighInAndAdmit, setWeighInLock, applyMerge, swapSeeds, moveAthleteSeed, findBracketConflicts, resolveConflict, addToAbsolute, generateAbsoluteBracket } from "@/app/organizer-actions";
import { createEvent, setEventStatus, addCategory, addPriceTier, createUser, assignRefereeToMat } from "@/app/admin-actions";
import { buildBracketAction, submitResultAction } from "@/app/actions";
import { signUpAction } from "@/app/auth-actions";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { submitResult, correctResult } from "@/lib/domain/results";

function actAs(userId: string) { H.token = makeToken(userId); }
function actAnon() { H.token = null; }

function fd(obj: Record<string, string | number | boolean | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === false) continue;
    f.append(k, v === true ? "1" : String(v));
  }
  return f;
}

/** FormData саморегистрации + мультивыбор categoryIds. */
function selfFd(base: Record<string, string | number | boolean | undefined>, catIds: string[]): FormData {
  const f = fd(base);
  for (const id of catIds) f.append("categoryIds", id);
  return f;
}

/** Событие REG_OPEN с тиром цен (первая 2000 / доп 1500) и набором категорий под само-выбор. */
async function regEvent() {
  const e = await makeEvent({ status: "REG_OPEN" });
  await prisma.priceTier.create({
    data: { eventId: e.id, name: "Ранняя", startsAt: new Date("2026-09-01"), priceFirstCategory: 2000, priceExtraCategory: 1500 },
  });
  const admM = { ageGroupCode: "adults", ageGroupLabel: "Взрослые", birthYearFrom: 1980, birthYearTo: 2008, sex: "M" };
  const light = await makeCategory(e.id, { ...admM, discipline: "nogi", weightMin: 0, weightMax: 77 });
  const lightGi = await makeCategory(e.id, { ...admM, discipline: "gi", weightMin: 0, weightMax: 77 });
  const heavy = await makeCategory(e.id, { ...admM, discipline: "nogi", weightMin: 77, weightMax: 94 });
  const female = await makeCategory(e.id, { ageGroupCode: "adults", ageGroupLabel: "Взрослые", birthYearFrom: 1980, birthYearTo: 2008, sex: "F", discipline: "nogi", weightMin: 0, weightMax: 64 });
  const kids = await makeCategory(e.id, { ageGroupCode: "kids-2015-2016", ageGroupLabel: "Дети", birthYearFrom: 2015, birthYearTo: 2016, sex: "M", discipline: "nogi", weightMin: 0, weightMax: 40 });
  const abs = await makeCategory(e.id, { ageGroupCode: "absolute", ageGroupLabel: "Абсолютка", birthYearFrom: 1980, birthYearTo: 2008, sex: "M", discipline: "nogi", isAbsolute: true, weightMin: null, weightMax: null });
  return { e, light, lightGi, heavy, female, kids, abs };
}

// ─────────────────────────────────────────────────────────────────────
describe("Саморегистрация: само-выбор категорий (S056–S073)", () => {
  const adult = { birthDate: "1995-05-05", sex: "M", consent: true };
  // Заявка теперь только для авторизованных → логиним атлета перед каждым сценарием.
  beforeEach(async () => { const u = await makeUser(["ATHLETE"]); actAs(u.id); });
  it("S056 взрослый сам выбирает категорию — заявка принята", async () => {
    const { e, light } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Иван Петров", ...adult }, [light.id]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.categoryId).toBe(light.id);
  });
  it("S057 две категории (ги+ноу-ги) → цена первая+доп (3500), 2 регистрации", async () => {
    const { e, light, lightGi } = await regEvent();
    await selfRegister(selfFd({ eventId: e.id, fullName: "Гай Ди", ...adult }, [light.id, lightGi.id]));
    const entry = await prisma.eventEntry.findFirst({ where: { athlete: { fullName: "Гай Ди" } } });
    expect(entry?.priceTotal).toBe(3500);
    expect(await prisma.registration.count({ where: { entryId: entry!.id } })).toBe(2);
  });
  it("S058 без согласия 152-ФЗ → отказ", async () => {
    const { e, light } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Без Согласия", birthDate: "1995-05-05", sex: "M", consent: false }, [light.id]));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/соглас/i);
  });
  it("S059 без выбора категории → отказ", async () => {
    const { e } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Без Категории", ...adult }, []));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/категори/i);
  });
  it("S060 несовершеннолетний без ФИО родителя → отказ", async () => {
    const { e, kids } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Дитя Малое", birthDate: "2016-05-05", sex: "M", consent: true }, [kids.id]));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/родител/i);
  });
  it("S061 несовершеннолетний с согласием родителя → принят + Consent PARENTAL", async () => {
    const { e, kids } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Дитя Годное", birthDate: "2016-05-05", sex: "M", consent: true, parentName: "Родитель Петров", parentConsent: true }, [kids.id]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.categoryId).toBe(kids.id);
    const ath = await prisma.athlete.findFirst({ where: { fullName: "Дитя Годное" }, include: { consents: true } });
    expect(ath?.consents.some((c) => c.type === "PARENTAL")).toBe(true);
  });
  it("S062 создаётся согласие PERSONAL_DATA_152FZ", async () => {
    const { e, light } = await regEvent();
    await selfRegister(selfFd({ eventId: e.id, fullName: "Согласный Пдн", ...adult }, [light.id]));
    const ath = await prisma.athlete.findFirst({ where: { fullName: "Согласный Пдн" }, include: { consents: true } });
    expect(ath?.consents.some((c) => c.type === "PERSONAL_DATA_152FZ")).toBe(true);
  });
  it("S063 регистрация закрыта (status≠REG_OPEN) → отказ", async () => {
    const { e, light } = await regEvent();
    await prisma.event.update({ where: { id: e.id }, data: { status: "REG_CLOSED" } });
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Поздно Пришёл", ...adult }, [light.id]));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/закрыт/i);
  });
  it("S064 повторная регистрация того же атлета → отказ (дубль)", async () => {
    const { e, light } = await regEvent();
    await selfRegister(selfFd({ eventId: e.id, fullName: "Дважды Заявка", ...adult }, [light.id]));
    const r2 = await selfRegister(selfFd({ eventId: e.id, fullName: "Дважды Заявка", ...adult }, [light.id]));
    expect(r2.ok).toBe(false);
    expect(r2.msg).toMatch(/уже заявлен/i);
  });
  it("S065 взрослый выбирает ДЕТСКУЮ категорию → отказ (граница дети↔взрослые)", async () => {
    const { e, kids } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Взрослый В Детской", ...adult }, [kids.id]));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/недоступн/i);
  });
  it("S066 отсутствуют тиры цен → отказ 'цены не настроены'", async () => {
    const e = await makeEvent({ status: "REG_OPEN" });
    const c = await makeCategory(e.id, { discipline: "nogi", sex: "M", weightMin: 0, weightMax: 77 });
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Без Цены", ...adult }, [c.id]));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/цены не настроены/i);
  });
  it("S067 несуществующее событие → отказ", async () => {
    const r = await selfRegister(selfFd({ eventId: "no-such", fullName: "Ноль Событий", ...adult }, ["x"]));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/не найдено/i);
  });
  it("S068 ФИО короче 2 символов → отказ валидации", async () => {
    const { e, light } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "И", ...adult }, [light.id]));
    expect(r.ok).toBe(false);
  });
  it("S069 само-выбор весовой ВЫШЕ своей (без веса) — заявка принята", async () => {
    const { e, heavy } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Хочу Тяжелее", ...adult }, [heavy.id]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.categoryId).toBe(heavy.id);
  });
  it("S070 выбор абсолютки создаёт регистрацию в абсолютную категорию", async () => {
    const { e, light, abs } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Абсолютный Боец", ...adult }, [light.id, abs.id]));
    expect(r.ok).toBe(true);
    const regs = await prisma.registration.findMany({ where: { athlete: { fullName: "Абсолютный Боец" } } });
    expect(regs.some((x) => x.categoryId === abs.id)).toBe(true);
  });
  it("S071 женщина выбирает женскую категорию — ок", async () => {
    const { e, female } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Мария Сила", birthDate: "1996-03-03", sex: "F", consent: true }, [female.id]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.categoryId).toBe(female.id);
  });
  it("S072 мужчина не может выбрать женскую категорию → отказ (граница пола)", async () => {
    const { e, female } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Муж В Женской", ...adult }, [female.id]));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/недоступн/i);
  });
  it("S073 пояс сохраняется как косметический шильдик, на логику не влияет", async () => {
    const { e, light } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Синий Пояс", ...adult, belt: "синий" }, [light.id]));
    expect(r.ok).toBe(true);
    const ath = await prisma.athlete.findFirst({ where: { fullName: "Синий Пояс" } });
    expect(ath?.belt).toBe("синий");
  });
  it("S073b без аккаунта (аноним) заявка отклоняется — регистрация на сайте обязательна", async () => {
    actAnon();
    const { e, light } = await regEvent();
    const r = await selfRegister(selfFd({ eventId: e.id, fullName: "Аноним Гость", ...adult }, [light.id]));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/войдите/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Регистрация тренером группы + оплата (S074–S089)", () => {
  async function coachOn() {
    const u = await makeUser(["COACH"]);
    actAs(u.id);
    return u;
  }
  it("S074 тренер регистрирует двух подопечных — обе строки ok", async () => {
    const { e } = await regEvent();
    await coachOn();
    const rows = JSON.stringify([
      { fullName: "Ученик Один", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true },
      { fullName: "Ученик Два", birthDate: "1999-02-02", sex: "M", weight: 74, gi: true, nogi: true },
    ]);
    const res = await registerGroup(rows, e.id);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(res).toHaveLength(2);
  });
  it("S075 строка без веса → ok:false для строки, остальные проходят", async () => {
    const { e } = await regEvent();
    await coachOn();
    const rows = JSON.stringify([
      { fullName: "Норм Ученик", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true },
      { fullName: "Без Веса", birthDate: "1998-01-01", sex: "M", weight: 0, gi: false, nogi: true },
    ]);
    const res = await registerGroup(rows, e.id);
    expect(res[0].ok).toBe(true);
    expect(res[1].ok).toBe(false);
  });
  it("S076 строка без дисциплины → ошибка строки", async () => {
    const { e } = await regEvent();
    await coachOn();
    const res = await registerGroup(JSON.stringify([{ fullName: "Без Раздела", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: false }]), e.id);
    expect(res[0].ok).toBe(false);
    expect(res[0].msg).toMatch(/раздел/i);
  });
  it("S077 регистрация на закрытое событие → throw", async () => {
    const { e } = await regEvent();
    await prisma.event.update({ where: { id: e.id }, data: { status: "REG_CLOSED" } });
    await coachOn();
    await expect(registerGroup(JSON.stringify([{ fullName: "Кто-то", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), e.id)).rejects.toThrow(/закрыта/i);
  });
  it("S078 повторная заявка того же атлета тем же тренером → ошибка строки (дубль)", async () => {
    const { e } = await regEvent();
    await coachOn();
    const row = [{ fullName: "Повтор Ученик", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }];
    await registerGroup(JSON.stringify(row), e.id);
    const res2 = await registerGroup(JSON.stringify(row), e.id);
    expect(res2[0].ok).toBe(false);
    expect(res2[0].msg).toMatch(/уже заявлен/i);
  });
  it("S079 registerGroup создаёт EventEntry source=coach с ценой", async () => {
    const { e } = await regEvent();
    await coachOn();
    await registerGroup(JSON.stringify([{ fullName: "Ценник Ученик", birthDate: "1998-01-01", sex: "M", weight: 70, gi: true, nogi: true }]), e.id);
    const entry = await prisma.eventEntry.findFirst({ where: { athlete: { fullName: "Ценник Ученик" } } });
    expect(entry?.source).toBe("coach");
    // 2 дисциплины = 2 категории → первая 2000 + доп 1500
    expect(entry?.priceTotal).toBe(3500);
  });
  it("S080 регистрации создаются в статусе ENTERED", async () => {
    const { e } = await regEvent();
    await coachOn();
    await registerGroup(JSON.stringify([{ fullName: "Статус Ученик", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), e.id);
    const reg = await prisma.registration.findFirst({ where: { athlete: { fullName: "Статус Ученик" } } });
    expect(reg?.status).toBe("ENTERED");
  });
  it("S081 перевес юниора → play-up (строка ok с пометкой)", async () => {
    const { e } = await regEvent();
    await coachOn();
    const res = await registerGroup(JSON.stringify([{ fullName: "Юниор Тяж", birthDate: "1995-05-05", sex: "M", weight: 85, gi: false, nogi: true }]), e.id);
    expect(res[0].ok).toBe(true);
  });
  it("S082 тренер отмечает заявку оплаченной (свою) — paidToCoach=true", async () => {
    const { e } = await regEvent();
    await coachOn();
    await registerGroup(JSON.stringify([{ fullName: "Оплата Ученик", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), e.id);
    const entry = await prisma.eventEntry.findFirst({ where: { athlete: { fullName: "Оплата Ученик" } } });
    await togglePaidAction(entry!.id, true);
    const after = await prisma.eventEntry.findUnique({ where: { id: entry!.id } });
    expect(after?.paidToCoach).toBe(true);
  });
  it("S083 снятие отметки оплаты (paid=false)", async () => {
    const { e } = await regEvent();
    await coachOn();
    await registerGroup(JSON.stringify([{ fullName: "Снять Оплату", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), e.id);
    const entry = await prisma.eventEntry.findFirst({ where: { athlete: { fullName: "Снять Оплату" } } });
    await togglePaidAction(entry!.id, true);
    await togglePaidAction(entry!.id, false);
    const after = await prisma.eventEntry.findUnique({ where: { id: entry!.id } });
    expect(after?.paidToCoach).toBe(false);
  });
  it("S084 IDOR: чужую заявку тренер оплатить НЕ может → throw", async () => {
    const { e } = await regEvent();
    const coachA = await makeUser(["COACH"]);
    actAs(coachA.id);
    await registerGroup(JSON.stringify([{ fullName: "Чужой Ученик", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), e.id);
    const entry = await prisma.eventEntry.findFirst({ where: { athlete: { fullName: "Чужой Ученик" } } });
    const coachB = await makeUser(["COACH"]);
    actAs(coachB.id);
    await expect(togglePaidAction(entry!.id, true)).rejects.toThrow(/не найдена или не ваша/i);
  });
  it("S085 организатор тоже может регистрировать группу", async () => {
    const { e } = await regEvent();
    const org = await makeUser(["ORGANIZER"]);
    actAs(org.id);
    const res = await registerGroup(JSON.stringify([{ fullName: "Орг Регнул", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), e.id);
    expect(res[0].ok).toBe(true);
  });
  it("S086 registerGroup от АТЛЕТА → throw (нет прав)", async () => {
    const { e } = await regEvent();
    const ath = await makeUser(["ATHLETE"]);
    actAs(ath.id);
    await expect(registerGroup(JSON.stringify([{ fullName: "X", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), e.id)).rejects.toThrow(/прав/i);
  });
  it("S087 registerGroup анонимно → throw (не авторизован)", async () => {
    const { e } = await regEvent();
    actAnon();
    await expect(registerGroup(JSON.stringify([{ fullName: "X", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), e.id)).rejects.toThrow();
  });
  it("S088 пустой список строк → пустой результат", async () => {
    const { e } = await regEvent();
    await coachOn();
    const res = await registerGroup(JSON.stringify([]), e.id);
    expect(res).toEqual([]);
  });
  it("S089 несуществующее событие → throw", async () => {
    await coachOn();
    await expect(registerGroup(JSON.stringify([{ fullName: "X", birthDate: "1998-01-01", sex: "M", weight: 70, gi: false, nogi: true }]), "no-such")).rejects.toThrow(/не найдено/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Взвешивание и допуск + лок (S090–S105)", () => {
  async function org() { const u = await makeUser(["ORGANIZER"]); actAs(u.id); return u; }
  async function setup(eventStatus = "REG_CLOSED", catOpts = {}) {
    const e = await makeEvent({ status: eventStatus });
    const c = await makeCategory(e.id, { discipline: "nogi", sex: "M", weightMin: 0, weightMax: 77, ...catOpts });
    const a = await makeAthlete();
    const { registration } = await registerAthlete(e.id, c.id, a.id, { declaredWeight: 75 });
    return { e, c, a, reg: registration };
  }
  it("S090 вес в норме → ADMITTED + WeighInAttempt(ok)", async () => {
    await org();
    const { reg } = await setup();
    const r = await weighInAndAdmit(reg.id, 76);
    expect(r).toMatchObject({ ok: true, status: "ADMITTED" });
    const after = await prisma.registration.findUnique({ where: { id: reg.id } });
    expect(after?.status).toBe("ADMITTED");
    expect(after?.actualWeight).toBe(76);
    const att = await prisma.weighInAttempt.findFirst({ where: { registrationId: reg.id } });
    expect(att?.ok).toBe(true);
  });
  it("S091 перевес при наличии старшей категории → перевод + ADMITTED", async () => {
    await org();
    const e = await makeEvent({ status: "REG_CLOSED" });
    const light = await makeCategory(e.id, { discipline: "nogi", sex: "M", weightMin: 0, weightMax: 77 });
    const heavy = await makeCategory(e.id, { discipline: "nogi", sex: "M", weightMin: 77, weightMax: 94 });
    const a = await makeAthlete();
    const { registration } = await registerAthlete(e.id, light.id, a.id, { declaredWeight: 75 });
    const r = await weighInAndAdmit(registration.id, 85);
    expect(r.ok).toBe(true);
    const after = await prisma.registration.findUnique({ where: { id: registration.id } });
    expect(after?.status).toBe("ADMITTED");
    expect(after?.categoryId).toBe(heavy.id);
  });
  it("S092 перевес без подходящей категории → OVERWEIGHT", async () => {
    await org();
    const { reg } = await setup("REG_CLOSED");
    const r = await weighInAndAdmit(reg.id, 120);
    expect(r).toMatchObject({ ok: false, status: "OVERWEIGHT" });
    const after = await prisma.registration.findUnique({ where: { id: reg.id } });
    expect(after?.status).toBe("OVERWEIGHT");
    const att = await prisma.weighInAttempt.findFirst({ where: { registrationId: reg.id, ok: false } });
    expect(att).toBeTruthy();
  });
  it("S093 взвешивание при LIVE (турнир идёт) → отказ", async () => {
    await org();
    const { reg } = await setup("LIVE");
    const r = await weighInAndAdmit(reg.id, 76);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/закрыто/i);
  });
  it("S094 взвешивание несуществующей регистрации → ошибка", async () => {
    await org();
    const r = await weighInAndAdmit("no-such", 76);
    expect(r).toMatchObject({ ok: false, status: "ERROR" });
  });
  it("S095 взвешивание при DRAFT разрешено", async () => {
    await org();
    const { reg } = await setup("DRAFT");
    const r = await weighInAndAdmit(reg.id, 70);
    expect(r.ok).toBe(true);
  });
  it("S096 взвешивание при REG_OPEN разрешено", async () => {
    await org();
    const { reg } = await setup("REG_OPEN");
    const r = await weighInAndAdmit(reg.id, 70);
    expect(r.ok).toBe(true);
  });
  it("S097 повторное взвешивание пишет вторую попытку", async () => {
    await org();
    const { reg } = await setup();
    await weighInAndAdmit(reg.id, 120); // перевес
    await weighInAndAdmit(reg.id, 76);  // норма
    const attempts = await prisma.weighInAttempt.count({ where: { registrationId: reg.id } });
    expect(attempts).toBe(2);
  });
  it("S098 вес ровно на границе категории (=max) допускается", async () => {
    await org();
    const { reg } = await setup();
    const r = await weighInAndAdmit(reg.id, 77);
    expect(r.ok).toBe(true);
  });
  it("S099 MAT_COORDINATOR может взвешивать", async () => {
    const u = await makeUser(["MAT_COORDINATOR"]); actAs(u.id);
    const { reg } = await setup();
    const r = await weighInAndAdmit(reg.id, 70);
    expect(r.ok).toBe(true);
  });
  it("S100 взвешивание от ТРЕНЕРА → throw (нет прав)", async () => {
    const u = await makeUser(["COACH"]); actAs(u.id);
    const { reg } = await setup();
    await expect(weighInAndAdmit(reg.id, 70)).rejects.toThrow(/прав/i);
  });
  it("S101 setWeighInLock из REG_CLOSED → LIVE (турнир стартует)", async () => {
    await org();
    const e = await makeEvent({ status: "REG_CLOSED" });
    const r = await setWeighInLock(e.id, true);
    expect(r.ok).toBe(true);
    const after = await prisma.event.findUnique({ where: { id: e.id } });
    expect(after?.status).toBe("LIVE");
  });
  it("S102 setWeighInLock из REG_OPEN → отказ (нельзя прыгнуть в LIVE)", async () => {
    await org();
    const e = await makeEvent({ status: "REG_OPEN" });
    const r = await setWeighInLock(e.id, true);
    expect(r.ok).toBe(false);
  });
  it("S103 разблокировать взвешивание после старта нельзя", async () => {
    await org();
    const e = await makeEvent({ status: "LIVE" });
    const r = await setWeighInLock(e.id, false);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/вернуть|идёт/i);
  });
  it("S104 setWeighInLock несуществующего события → ошибка", async () => {
    await org();
    const r = await setWeighInLock("no-such", true);
    expect(r.ok).toBe(false);
  });
  it("S105 setWeighInLock от АТЛЕТА → throw", async () => {
    const u = await makeUser(["ATHLETE"]); actAs(u.id);
    const e = await makeEvent({ status: "REG_CLOSED" });
    await expect(setWeighInLock(e.id, true)).rejects.toThrow(/прав/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Статусы события, категории, CRUD (S106–S117)", () => {
  async function admin() { const u = await makeUser(["ADMIN"]); actAs(u.id); return u; }
  it("S106 setEventStatus DRAFT→REG_OPEN", async () => {
    await admin();
    const e = await makeEvent({ status: "DRAFT" });
    await setEventStatus(e.id, "REG_OPEN");
    expect((await prisma.event.findUnique({ where: { id: e.id } }))?.status).toBe("REG_OPEN");
  });
  it("S107 setEventStatus недопустимый переход DRAFT→LIVE → throw", async () => {
    await admin();
    const e = await makeEvent({ status: "DRAFT" });
    await expect(setEventStatus(e.id, "LIVE")).rejects.toThrow(/недопустимый переход/i);
  });
  it("S108 setEventStatus в тот же статус → throw", async () => {
    await admin();
    const e = await makeEvent({ status: "DRAFT" });
    await expect(setEventStatus(e.id, "DRAFT")).rejects.toThrow(/уже установлен/i);
  });
  it("S109 архивация из REG_OPEN разрешена", async () => {
    await admin();
    const e = await makeEvent({ status: "REG_OPEN" });
    await setEventStatus(e.id, "ARCHIVED");
    expect((await prisma.event.findUnique({ where: { id: e.id } }))?.status).toBe("ARCHIVED");
  });
  it("S110 переоткрытие регистрации REG_CLOSED→REG_OPEN", async () => {
    await admin();
    const e = await makeEvent({ status: "REG_CLOSED" });
    await setEventStatus(e.id, "REG_OPEN");
    expect((await prisma.event.findUnique({ where: { id: e.id } }))?.status).toBe("REG_OPEN");
  });
  it("S111 createEvent валидный → создаётся + redirect", async () => {
    await admin();
    let redirected = false;
    try {
      await createEvent(fd({ name: "Новый Турнир", city: "Челябинск", date: "2026-12-01", matsCount: 4, status: "DRAFT" }));
    } catch (err) {
      if (String((err as Error).message).startsWith("REDIRECT:")) redirected = true; else throw err;
    }
    expect(redirected).toBe(true);
    const e = await prisma.event.findFirst({ where: { name: "Новый Турнир" } });
    expect(e).toBeTruthy();
    expect(await prisma.mat.count({ where: { eventId: e!.id } })).toBe(4);
  });
  it("S112 createEvent короткое имя → throw валидации", async () => {
    await admin();
    await expect(createEvent(fd({ name: "X", city: "Челябинск", date: "2026-12-01" }))).rejects.toThrow(/название/i);
  });
  it("S113 createEvent от АТЛЕТА → throw (нет прав)", async () => {
    const u = await makeUser(["ATHLETE"]); actAs(u.id);
    await expect(createEvent(fd({ name: "Запрещённый", city: "Челябинск", date: "2026-12-01" }))).rejects.toThrow(/прав/i);
  });
  it("S114 addCategory создаёт категорию", async () => {
    await admin();
    const e = await makeEvent({ status: "DRAFT" });
    await addCategory(e.id, fd({ ageGroupCode: "adults", ageGroupLabel: "Взрослые", birthYearFrom: 1980, birthYearTo: 2008, sex: "M", discipline: "nogi", weightMax: 88 }));
    const c = await prisma.category.findFirst({ where: { eventId: e.id } });
    expect(c?.weightMax).toBe(88);
  });
  it("S115 addPriceTier создаёт тир", async () => {
    await admin();
    const e = await makeEvent({ status: "DRAFT" });
    await addPriceTier(e.id, fd({ name: "Ранняя", startsAt: "2026-09-01", priceFirstCategory: 2000, priceExtraCategory: 1500 }));
    const t = await prisma.priceTier.findFirst({ where: { eventId: e.id } });
    expect(t?.priceFirstCategory).toBe(2000);
    expect(t?.priceExtraCategory).toBe(1500);
  });
  it("S116 createUser (ADMIN) создаёт пользователя; дубль email → throw", async () => {
    await admin();
    const email = uniq("new") + "@t.local";
    await createUser(fd({ fullName: "Новый Юзер", email, password: "secret" }));
    expect(await prisma.user.findUnique({ where: { email } })).toBeTruthy();
    await expect(createUser(fd({ fullName: "Дубль", email, password: "secret" }))).rejects.toThrow(/занят/i);
  });
  it("S117 createUser от ОРГАНИЗАТОРА → throw (только ADMIN)", async () => {
    const u = await makeUser(["ORGANIZER"]); actAs(u.id);
    await expect(createUser(fd({ fullName: "Некто", email: uniq("z") + "@t.local", password: "secret" }))).rejects.toThrow(/прав/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Сетка, посев, конфликты (S118–S129)", () => {
  async function org() { const u = await makeUser(["ORGANIZER"]); actAs(u.id); return u; }
  async function admittedCategory(n: number, opts: { sameClub?: boolean } = {}) {
    const e = await makeEvent({ status: "REG_CLOSED" });
    const c = await makeCategory(e.id, { discipline: "nogi", sex: "M", weightMin: 0, weightMax: 77 });
    const club = opts.sameClub ? await prisma.club.create({ data: { name: uniq("Club") } }) : null;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = await makeAthlete(club ? { clubId: club.id } : {});
      await registerAthlete(e.id, c.id, a.id, { status: "ADMITTED", seed: i + 1 });
      ids.push(a.id);
    }
    return { e, c, ids };
  }
  it("S118 buildBracketAction (организатор) строит сетку", async () => {
    await org();
    const { c } = await admittedCategory(5);
    await buildBracketAction(c.id);
    const cat = await prisma.category.findUnique({ where: { id: c.id } });
    expect(cat?.status).toBe("GENERATED");
    expect(await prisma.match.count({ where: { categoryId: c.id } })).toBeGreaterThan(0);
  });
  it("S119 buildBracketAction от АТЛЕТА → throw (нет прав события)", async () => {
    const { c } = await admittedCategory(4);
    const u = await makeUser(["ATHLETE"]); actAs(u.id);
    await expect(buildBracketAction(c.id)).rejects.toThrow(/прав/i);
  });
  it("S120 swapSeeds меняет посев двух атлетов", async () => {
    await org();
    const { c, ids } = await admittedCategory(4);
    const r = await swapSeeds(c.id, ids[0], ids[3]);
    expect(r.ok).toBe(true);
    const r1 = await prisma.registration.findFirst({ where: { categoryId: c.id, athleteId: ids[0] } });
    expect(r1?.seed).toBe(4);
  });
  it("S121 swapSeeds одинаковых атлетов → отказ", async () => {
    await org();
    const { c, ids } = await admittedCategory(4);
    const r = await swapSeeds(c.id, ids[0], ids[0]);
    expect(r.ok).toBe(false);
  });
  it("S122 moveAthleteSeed переставляет атлета на позицию", async () => {
    await org();
    const { c, ids } = await admittedCategory(4);
    const r = await moveAthleteSeed(c.id, ids[3], 1);
    expect(r.ok).toBe(true);
    const moved = await prisma.registration.findFirst({ where: { categoryId: c.id, athleteId: ids[3] } });
    expect(moved?.seed).toBe(1);
  });
  it("S123 moveAthleteSeed неверный номер (<1) → отказ", async () => {
    await org();
    const { c, ids } = await admittedCategory(4);
    const r = await moveAthleteSeed(c.id, ids[0], 0);
    expect(r.ok).toBe(false);
  });
  it("S124 правка посева после сыгранной схватки запрещена", async () => {
    await org();
    const { c, ids } = await admittedCategory(4);
    await buildBracketForCategory(c.id);
    const m = await prisma.match.findFirst({ where: { categoryId: c.id, status: { not: "COMPLETED" }, slotAAthleteId: { not: null }, slotBAthleteId: { not: null } } });
    await submitResult({ matchId: m!.id, winnerAthleteId: m!.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s124" });
    const r = await swapSeeds(c.id, ids[0], ids[1]);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/сыгран|результат/i);
  });
  it("S125 findBracketConflicts находит пару одноклубников в 1-м круге", async () => {
    await org();
    const { c } = await admittedCategory(4, { sameClub: true });
    await buildBracketForCategory(c.id);
    const { conflicts } = await findBracketConflicts(c.id);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].kind).toBe("club");
  });
  it("S126 resolveConflict без нейтрального атлета (все одноклубники) → отказ", async () => {
    await org();
    const { c, ids } = await admittedCategory(4, { sameClub: true });
    await buildBracketForCategory(c.id);
    const r = await resolveConflict(c.id, ids[0]);
    expect(r.ok).toBe(false);
  });
  it("S127 swapSeeds от СУДЬИ → throw (нужен ORGANIZER/ADMIN)", async () => {
    const { c, ids } = await admittedCategory(4);
    const u = await makeUser(["REFEREE"]); actAs(u.id);
    await expect(swapSeeds(c.id, ids[0], ids[1])).rejects.toThrow(/прав/i);
  });
  it("S128 buildBracket на 3 участниках создаёт матчи (min для сетки)", async () => {
    await org();
    const { c } = await admittedCategory(3);
    const res = await buildBracketForCategory(c.id);
    expect(res.matches).toBeGreaterThan(0);
  });
  it("S129 повторная сборка поверх сыгранного результата без force → throw", async () => {
    await org();
    const { c } = await admittedCategory(4);
    await buildBracketForCategory(c.id);
    const m = await prisma.match.findFirst({ where: { categoryId: c.id, status: { not: "COMPLETED" }, slotAAthleteId: { not: null }, slotBAthleteId: { not: null } } });
    await submitResult({ matchId: m!.id, winnerAthleteId: m!.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s129" });
    await expect(buildBracketForCategory(c.id)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Результаты, коррекция, идемпотентность (S130–S139)", () => {
  async function playable(n = 4) {
    const e = await makeEvent({ status: "LIVE" });
    const c = await makeCategory(e.id, { discipline: "nogi", sex: "M", weightMin: 0, weightMax: 77 });
    for (let i = 0; i < n; i++) {
      const a = await makeAthlete();
      await registerAthlete(e.id, c.id, a.id, { status: "ADMITTED", seed: i + 1 });
    }
    await buildBracketForCategory(c.id);
    return { e, c };
  }
  const ready = (categoryId: string) => prisma.match.findFirst({ where: { categoryId, status: { not: "COMPLETED" }, slotAAthleteId: { not: null }, slotBAthleteId: { not: null } } });
  it("S130 submitResult завершает матч и назначает победителя", async () => {
    const { c } = await playable();
    const m = (await ready(c.id))!;
    await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s130" });
    const after = await prisma.match.findUnique({ where: { id: m.id } });
    expect(after?.status).toBe("COMPLETED");
    expect(after?.winnerAthleteId).toBe(m.slotAAthleteId);
  });
  it("S131 идемпотентность по clientMutationId", async () => {
    const { c } = await playable();
    const m = (await ready(c.id))!;
    const r1 = await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s131" });
    const r2 = await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s131" });
    expect(r1.idempotent).toBe(false);
    expect(r2.idempotent).toBe(true);
  });
  it("S132 иммутабельность: другой результат на завершённом матче → throw", async () => {
    const { c } = await playable();
    const m = (await ready(c.id))!;
    await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s132a" });
    await expect(submitResult({ matchId: m.id, winnerAthleteId: m.slotBAthleteId!, winType: "POINTS", clientMutationId: "s132b" })).rejects.toThrow();
  });
  it("S133 победитель не из слотов → throw", async () => {
    const { c } = await playable();
    const m = (await ready(c.id))!;
    await expect(submitResult({ matchId: m.id, winnerAthleteId: "outsider", winType: "SUBMISSION", clientMutationId: "s133" })).rejects.toThrow();
  });
  it("S134 submitResultAction (судья события) проводит результат", async () => {
    const { e, c } = await playable();
    const ref = await makeUser(["REFEREE"], { eventId: e.id, scope: "EVENT" });
    actAs(ref.id);
    const m = (await ready(c.id))!;
    await submitResultAction(fd({ matchId: m.id, categoryId: c.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s134" }));
    expect((await prisma.match.findUnique({ where: { id: m.id } }))?.status).toBe("COMPLETED");
  });
  it("S135 submitResultAction от АТЛЕТА → throw (нет роли события)", async () => {
    const { c } = await playable();
    const u = await makeUser(["ATHLETE"]); actAs(u.id);
    const m = (await ready(c.id))!;
    await expect(submitResultAction(fd({ matchId: m.id, categoryId: c.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s135" }))).rejects.toThrow(/прав/i);
  });
  it("S136 correctResult гл. судьёй до игры зависимого — пере-продвигает победителя", async () => {
    const head = await makeUser(["ORGANIZER"]);
    const { c } = await playable();
    const semi = (await ready(c.id))!;
    await submitResult({ matchId: semi.id, winnerAthleteId: semi.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s136" });
    const dep = await prisma.match.findFirst({ where: { categoryId: c.id, OR: [{ slotAFromMatchId: semi.id }, { slotBFromMatchId: semi.id }] } });
    await correctResult({ matchId: semi.id, winnerAthleteId: semi.slotBAthleteId!, winType: "DECISION", headJudgeUserId: head.id, reason: "видео" });
    const semiAfter = await prisma.match.findUnique({ where: { id: semi.id } });
    expect(semiAfter?.winnerAthleteId).toBe(semi.slotBAthleteId);
    const depAfter = await prisma.match.findUnique({ where: { id: dep!.id } });
    const fed = depAfter!.slotAFromMatchId === semi.id ? depAfter!.slotAAthleteId : depAfter!.slotBAthleteId;
    expect(fed).toBe(semi.slotBAthleteId);
  });
  it("S137 correctResult создаёт AuditLog RESULT_CORRECT", async () => {
    const head = await makeUser(["ORGANIZER"]);
    const { c } = await playable();
    const semi = (await ready(c.id))!;
    await submitResult({ matchId: semi.id, winnerAthleteId: semi.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "s137" });
    await correctResult({ matchId: semi.id, winnerAthleteId: semi.slotBAthleteId!, winType: "DECISION", headJudgeUserId: head.id });
    const log = await prisma.auditLog.findFirst({ where: { action: "RESULT_CORRECT" } });
    expect(log).toBeTruthy();
  });
  it("S138 весь турнир доигрывается до конца (нет открытых матчей)", async () => {
    const { c } = await playable(5);
    for (let g = 0; g < 30; g++) {
      const m = await ready(c.id);
      if (!m) break;
      await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: `s138-${m.id}` });
    }
    expect(await ready(c.id)).toBeNull();
  });
  it("S139 результат с очками (POINTS) сохраняется", async () => {
    const { c } = await playable();
    const m = (await ready(c.id))!;
    await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "POINTS", scoreA: 6, scoreB: 2, clientMutationId: "s139" });
    const res = await prisma.result.findFirst({ where: { matchId: m.id } });
    expect(res).toMatchObject({ winType: "POINTS", scoreA: 6, scoreB: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Объединение категорий (S140–S143)", () => {
  async function org() { const u = await makeUser(["ORGANIZER"]); actAs(u.id); return u; }
  async function twoCats(sameEvent = true, compatible = true) {
    const e = await makeEvent({ status: "REG_CLOSED" });
    const e2 = sameEvent ? e : await makeEvent({ status: "REG_CLOSED" });
    const src = await makeCategory(e.id, { ageGroupCode: "adults", discipline: "nogi", sex: "M", weightMin: 0, weightMax: 70 });
    const tgt = await makeCategory((sameEvent ? e : e2).id, compatible
      ? { ageGroupCode: "adults", discipline: "nogi", sex: "M", weightMin: 70, weightMax: 88 }
      : { ageGroupCode: "adults", discipline: "gi", sex: "M", weightMin: 70, weightMax: 88 });
    return { e, src, tgt };
  }
  it("S140 applyMerge переносит регистрации и помечает source MERGED", async () => {
    await org();
    const { e, src, tgt } = await twoCats();
    const a = await makeAthlete();
    await registerAthlete(e.id, src.id, a.id, { status: "ENTERED" });
    const r = await applyMerge(src.id, tgt.id);
    expect(r.ok).toBe(true);
    expect((await prisma.category.findUnique({ where: { id: src.id } }))?.status).toBe("MERGED");
    expect(await prisma.registration.count({ where: { categoryId: tgt.id } })).toBe(1);
  });
  it("S141 self-merge (категория сама с собой) → отказ", async () => {
    await org();
    const { src } = await twoCats();
    const r = await applyMerge(src.id, src.id);
    expect(r.ok).toBe(false);
  });
  it("S142 merge несовместимых (разная дисциплина) → отказ", async () => {
    await org();
    const { src, tgt } = await twoCats(true, false);
    const r = await applyMerge(src.id, tgt.id);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/несовместим/i);
  });
  it("S143 merge из разных событий → отказ", async () => {
    await org();
    const { src, tgt } = await twoCats(false);
    const r = await applyMerge(src.id, tgt.id);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/разных событий/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Абсолютка (S144–S148)", () => {
  async function org() { const u = await makeUser(["ORGANIZER"]); actAs(u.id); return u; }
  async function setup() {
    const e = await makeEvent({ status: "REG_CLOSED" });
    const abs = await makeCategory(e.id, { ageGroupCode: "absolute", discipline: "nogi", sex: "M", isAbsolute: true, weightMin: null, weightMax: null });
    const regular = await makeCategory(e.id, { discipline: "nogi", sex: "M", weightMin: 0, weightMax: 77 });
    const a = await makeAthlete();
    await prisma.eventEntry.create({ data: { athleteId: a.id, eventId: e.id, source: "self" } });
    return { e, abs, regular, a };
  }
  it("S144 addToAbsolute добавляет атлета события в абсолютку (ADMITTED)", async () => {
    await org();
    const { abs, a } = await setup();
    const r = await addToAbsolute(abs.id, a.id);
    expect(r.ok).toBe(true);
    const reg = await prisma.registration.findFirst({ where: { categoryId: abs.id, athleteId: a.id } });
    expect(reg?.status).toBe("ADMITTED");
  });
  it("S145 повторное добавление в абсолютку → отказ", async () => {
    await org();
    const { abs, a } = await setup();
    await addToAbsolute(abs.id, a.id);
    const r = await addToAbsolute(abs.id, a.id);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/уже в абсолютке/i);
  });
  it("S146 addToAbsolute атлета не заявленного на событие → отказ", async () => {
    await org();
    const { abs } = await setup();
    const stranger = await makeAthlete();
    const r = await addToAbsolute(abs.id, stranger.id);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/не заявлен/i);
  });
  it("S147 addToAbsolute в обычную (не абсолютную) категорию → отказ", async () => {
    await org();
    const { regular, a } = await setup();
    const r = await addToAbsolute(regular.id, a.id);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/не абсолют/i);
  });
  it("S148 generateAbsoluteBracket строит сетку абсолютки (GENERATED)", async () => {
    await org();
    const { e, abs } = await setup();
    for (let i = 0; i < 4; i++) {
      const a = await makeAthlete();
      await prisma.eventEntry.create({ data: { athleteId: a.id, eventId: e.id, source: "self" } });
      await addToAbsolute(abs.id, a.id);
    }
    const r = await generateAbsoluteBracket(abs.id);
    expect(r.ok).toBe(true);
    expect((await prisma.category.findUnique({ where: { id: abs.id } }))?.status).toBe("GENERATED");
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Контроль доступа: привязка к событию (S149–S150)", () => {
  it("S149 организатор события A не может менять статус события B (event-scope)", async () => {
    const eventA = await makeEvent({ status: "DRAFT" });
    const eventB = await makeEvent({ status: "DRAFT" });
    const orgA = await makeUser(["ORGANIZER"], { eventId: eventA.id, scope: "EVENT" });
    actAs(orgA.id);
    await expect(setEventStatus(eventB.id, "REG_OPEN")).rejects.toThrow(/прав/i);
    // но своим событием — может
    await setEventStatus(eventA.id, "REG_OPEN");
    expect((await prisma.event.findUnique({ where: { id: eventA.id } }))?.status).toBe("REG_OPEN");
  });
  it("S150 assignRefereeToMat привязывает судью к ковру (REFEREE scope=EVENT)", async () => {
    const admin = await makeUser(["ADMIN"]); actAs(admin.id);
    const e = await makeEvent({ status: "REG_CLOSED" });
    const ref = await makeUser(["REFEREE"]);
    await assignRefereeToMat(ref.id, e.id, 2);
    const m = await prisma.membership.findFirst({ where: { userId: ref.id, eventId: e.id, role: "REFEREE" } });
    expect(m?.matNumber).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Регистрация аккаунта участника (S157–S159)", () => {
  const catchRedirect = async (fn: () => Promise<unknown>): Promise<string> => {
    try { await fn(); return ""; }
    catch (err) { const m = String((err as Error).message); return m.startsWith("REDIRECT:") ? m.slice("REDIRECT:".length) : (() => { throw err; })(); }
  };
  it("S157 signUpAction создаёт аккаунт участника (роль ATHLETE) и логинит", async () => {
    actAnon();
    const email = uniq("newath") + "@t.local";
    const dest = await catchRedirect(() => signUpAction(fd({ fullName: "Новый Участник", email, password: "secret1" })));
    expect(dest).toBe("/me");
    const u = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
    expect(u?.memberships.some((m) => m.role === "ATHLETE")).toBe(true);
  });
  it("S158 signUpAction: занятый email → понятная ошибка (redirect e=dup)", async () => {
    const email = uniq("dup") + "@t.local";
    await prisma.user.create({ data: { fullName: "Уже Есть", email, passwordHash: "x" } });
    const dest = await catchRedirect(() => signUpAction(fd({ fullName: "Дубликат", email, password: "secret1" })));
    expect(dest).toMatch(/signup\?e=dup/);
  });
  it("S159 signUpAction: слабый пароль → e=weak", async () => {
    const dest = await catchRedirect(() => signUpAction(fd({ fullName: "Слабый Пароль", email: uniq("w") + "@t.local", password: "123" })));
    expect(dest).toMatch(/signup\?e=weak/);
  });
});
