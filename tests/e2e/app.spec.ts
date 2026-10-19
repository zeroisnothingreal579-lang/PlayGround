import { expect, test } from "@playwright/test";

const projectName = () => `E2E Replica ${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function createProjectViaApi(
  request: import("@playwright/test").APIRequestContext,
  name: string,
) {
  const response = await request.post("/api/projects", {
    data: {
      name,
      targetUrl: "https://example.com",
      description: "A project created by the Playwright acceptance suite.",
      features: "- Public landing page\n- Pricing page",
      techStack: "Next.js, TypeScript, Tailwind",
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).project as { id: string; name: string };
}

test("dashboard, skills, and settings render without placeholders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("Skills available")).toBeVisible();

  await page.goto("/skills");
  await expect(page.getByRole("heading", { name: "Skills Library" })).toBeVisible();
  await expect(page.getByText("11 of 11 skills")).toBeVisible();
  await expect(page.getByRole("link", { name: "replica-recon" }).first()).toBeVisible();
  await expect(page.getByText("Needs: replica-recon").first()).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByText("Allow demo previews when no provider is configured"),
  ).toBeVisible();
  await expect(page.getByText(/Keys stay in server-side environment variables/)).toBeVisible();
});

test("creates a project through the UI and opens its workspace", async ({ page }) => {
  test.skip(test.info().project.name !== "chromium", "Full desktop workflow");

  const name = projectName();
  await page.goto("/projects/new");
  await page.getByLabel("Project name *").fill(name);
  await page.getByLabel("Target application URL").fill("https://example.com");
  await page
    .getByLabel("Project description")
    .fill("Acceptance test project for the Replica Studio workspace.");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText("Project workspace")).toBeVisible();
  await page.getByRole("tab", { name: /Files/ }).click();
  await expect(page.getByText("No files yet")).toBeVisible();

  await page.getByRole("button", { name: "New file" }).first().click();
  await page.getByLabel("File path").fill("notes/acceptance.md");
  await page.getByRole("button", { name: "Create file" }).click();
  await expect(page.getByLabel("Edit notes/acceptance.md")).toBeVisible();
  await page.getByLabel("Edit notes/acceptance.md").fill("# Acceptance\n\nEditor works.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("File saved")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Files/ }).click();
  await expect(page.getByLabel("Edit notes/acceptance.md")).toHaveValue(
    "# Acceptance\n\nEditor works.",
  );

  await page.getByRole("tab", { name: /Assistant/ }).click();
  await page
    .getByPlaceholder("Ask for the next artifact, a code change, or an explanation…")
    .fill("Create a starter preview for this project");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText("Demo preview — no model call was made.")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("saved: replica/demo-preview.md")).toBeVisible();
});

test("runs an individual skill in demo mode and exposes the result controls", async ({
  page,
  request,
}) => {
  test.skip(test.info().project.name !== "chromium", "Full desktop workflow");

  const project = await createProjectViaApi(request, projectName());
  await page.goto("/skills/replica-recon/run");

  await page.getByRole("combobox", { name: "Project" }).click();
  await page.getByRole("option", { name: project.name }).click();
  await page
    .getByLabel("Task / prompt")
    .fill("Map the public pages, note the primary flows, and write a recon artifact.");
  await page.getByRole("button", { name: "Run demo preview" }).click();

  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Demo preview — no AI call")).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole("button", { name: "Rerun" })).toBeVisible();

  await page.getByRole("tab", { name: /Logs/ }).click();
  await expect(page.getByText(/DEMO PREVIEW/)).toBeVisible();
  await page.getByRole("tab", { name: /Generated files/ }).click();
  await expect(page.getByText("replica/demo-preview.md").first()).toBeVisible();
});

test("starts the dependency-aware pipeline and completes every step", async ({
  page,
  request,
}) => {
  test.skip(test.info().project.name !== "chromium", "Full desktop workflow");

  await createProjectViaApi(request, projectName());
  await page.goto("/pipeline");
  await page
    .getByLabel("User requirements")
    .fill("Build a public landing page replica with a pricing section and a launch checklist.");
  await expect(page.getByText("11", { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Start full pipeline" }).click();

  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page.getByText("11/11 steps complete")).toBeVisible({ timeout: 45000 });
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: /Logs/ }).click();
  await expect(page.getByText("Pipeline completed successfully")).toBeVisible();
});
