import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo");
  // дождаться редиректа прочь со страницы логина (успех ведёт на /coach или /)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 }),
    page.getByRole("button", { name: "Войти" }).click(),
  ]);
}

test("публичные страницы открываются", async ({ page }) => {
  for (const path of ["/", "/login", "/coaches", "/sponsors", "/privacy"]) {
    const res = await page.goto(path);
    expect(res?.status(), `status ${path}`).toBeLessThan(400);
  }
});

test("тренер входит и видит грид заявки группы", async ({ page }) => {
  await login(page, "coach@ugp.local");
  await page.waitForURL("**/coach");
  // «Заявить группу» встречается дважды (заголовок и кнопка грида) — берём заголовок
  await expect(page.getByRole("heading", { name: "Заявить группу" })).toBeVisible();
});

test("админ попадает в админку", async ({ page }) => {
  await login(page, "admin@ugp.local");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator("body")).not.toContainText("Не авторизован");
});

test("без авторизации /coach уводит на логин", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/coach");
  await page.waitForURL("**/login");
  await expect(page).toHaveURL(/\/login/);
});
