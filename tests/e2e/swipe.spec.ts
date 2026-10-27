import { expect, test, type Page } from "@playwright/test";

const deck = (page: Page) => page.getByRole("region", { name: "Story deck" });
const topName = (page: Page) => deck(page).locator("article h2").first();

async function signInAsPatron(page: Page, name = "Eleanor V.") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(topName(page)).toBeVisible();
}

test("landing page loads with the live demo deck and demo labelling", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("clear");
  await expect(page.getByText(/^demo( data)?$/i).locator("visible=true").first()).toBeVisible();
  await expect(page.locator("#hero-deck article").first()).toBeVisible();
});

test("patron can swipe right, give, pass and undo", async ({ page }) => {
  await signInAsPatron(page);

  // Drag the top card to the right → the Give sheet opens.
  const first = await topName(page).innerText();
  const card = deck(page).locator("article").first();
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(x + i * 18, y + i * 2);
  await page.mouse.up();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /Give to/ })).toBeVisible();
  await sheet.getByRole("button", { name: /^Give \$|^Clear .* debt/ }).click();
  await expect(sheet.getByRole("heading", { name: "Thank you." })).toBeVisible();
  await sheet.getByRole("button", { name: "Keep swiping" }).click();
  await expect(sheet).toBeHidden();
  await expect(topName(page)).not.toHaveText(first);

  // Keyboard: pass, then undo brings the same card back.
  const beforePass = await topName(page).innerText();
  await page.keyboard.press("ArrowLeft");
  await expect(topName(page)).not.toHaveText(beforePass);
  await page.keyboard.press("z");
  await expect(topName(page)).toHaveText(beforePass);

  // Visible buttons mirror every gesture.
  await expect(page.getByRole("button", { name: "Pass (←)" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Clear it/ })).toBeEnabled();
});

test("impact dashboard shows totals", async ({ page }) => {
  await signInAsPatron(page, "Theo M.");
  await page.goto("/impact");
  await expect(page.getByText("Your impact")).toBeVisible();
  await expect(page.getByText("People helped")).toBeVisible();
});

test("seeker demo login lands on the request dashboard", async ({ page }) => {
  await page.goto("/login?role=seeker");
  await page.getByRole("button", { name: /part-funded/ }).click();
  await expect(page).toHaveURL(/\/seeker$/);
  await expect(page.getByRole("link", { name: /Manage/ }).first()).toBeVisible();
});
