// A fictional team's workspaces for README screenshots (open the preview with ?showcase). Every name, repository, host
// and PR here is made up.
import { emptyDetails, parseGithubLink, workspaceKey } from "../shared/organization";
import { agent, changeOrganization, setAgents, setHostLabels, setWorkspaces, workspace } from "./host";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const project = (id: string) => ({ projectId: id, projectDisplayName: id, projectRootPath: `/Users/dev/acme/${id}` });
// Each workspace lives in a worktree of its project, shown as ~/acme/<project>/.worktrees/<workspace>.
const placed = (items: ReturnType<typeof workspace>[]) => items.map((item) => ({ ...item,
  directory: `/Users/dev/acme/${item.projectDisplayName}/.worktrees/${item.id}` }));
const pr = (repo: string, number: number) => `https://github.com/acme/${repo}/pull/${number}`;
const issue = (repo: string, number: number) => `https://github.com/acme/${repo}/issues/${number}`;
const status = (state: string, checks: string | null = null, review: string | null = null) =>
  ({ state, checks, review, updatedAt: ago(5), stale: false, error: null });
const running = { indicator: "running", indicatorLabel: "Running", status: "running" };
const needsInput = { indicator: "needs_input", indicatorLabel: "Needs input", status: "needs_input" };
const done = { indicator: "done", indicatorLabel: "Done", status: "done" };

export function loadShowcase() {
  const items = placed([
    workspace("apple-pay", "Add Apple Pay to checkout", { ...project("storefront"), ...running, branch: "feat/apple-pay",
      labels: ["checkout", "p1"], lastPromptAt: ago(3), statusEnteredAt: ago(3), createdAt: ago(240) }),
    workspace("cart-test", "Fix flaky cart totals test", { ...project("storefront"), ...needsInput, branch: "fix/cart-totals",
      labels: ["bug"], lastPromptAt: ago(18), statusEnteredAt: ago(9), createdAt: ago(400) }),
    workspace("invoices-v2", "Migrate invoices to the v2 API", { ...project("billing-api"), ...running, hostId: "build-box", branch: "feat/invoices-v2",
      labels: ["payments"], lastPromptAt: ago(7), statusEnteredAt: ago(7), createdAt: ago(900) }),
    workspace("webhooks", "Retry failed webhooks with backoff", { ...project("billing-api"), ...done, branch: "fix/webhook-retries",
      labels: ["payments"], lastPromptAt: ago(95), statusEnteredAt: ago(70), createdAt: ago(1500) }),
    workspace("dark-mode", "Dark mode for settings screens", { ...project("mobile-app"), ...done, branch: "feat/settings-dark-mode",
      labels: ["📱 iOS", "ui"], lastPromptAt: ago(160), statusEnteredAt: ago(130), createdAt: ago(2400) }),
    workspace("offline-sync", "Offline sync prototype", { ...project("mobile-app"), ...running, branch: "spike/offline-sync",
      labels: ["📱 Android", "spike"], lastPromptAt: ago(1), statusEnteredAt: ago(1), createdAt: ago(60) }),
    workspace("edge-cache", "Spike: edge caching for product pages", { ...project("storefront"), ...done, hostId: "build-box", branch: "spike/edge-cache",
      labels: ["spike"], lastPromptAt: ago(600), statusEnteredAt: ago(560), createdAt: ago(3000) }),
    workspace("search-rank", "Review: search ranking tweaks", { ...project("storefront"), ...done, branch: "feat/search-ranking",
      labels: ["review"], lastPromptAt: ago(45), statusEnteredAt: ago(40), createdAt: ago(800) }),
    workspace("tokens", "Audit button design tokens", { ...project("design-system"), ...done, branch: null,
      lastPromptAt: ago(1440 * 2), statusEnteredAt: ago(1440 * 2), createdAt: ago(1440 * 3) }),
  ]);
  setWorkspaces(items);
  setHostLabels({ local: "MacBook Pro", "build-box": "Build box" });
  // The Build box host's color, as Paseo's own host settings would store it.
  localStorage.setItem("@paseo:daemon-registry", JSON.stringify([{ serverId: "build-box", appearance: { color: "orange", badgeDisplay: "name" } }]));
  setAgents([
    agent("a1", "apple-pay", { provider: "codex", model: "gpt-5.5", thinkingOptionId: "medium", status: "running", lastActivityAt: ago(1) }),
    agent("a1-sub1", "apple-pay", { parentAgentId: "a1", status: "running" }), agent("a1-sub2", "apple-pay", { parentAgentId: "a1", status: "idle" }),
    agent("a2", "cart-test", { provider: "claude", model: "opus", thinkingOptionId: "high", status: "idle" }),
    agent("a3", "invoices-v2", { hostId: "build-box", provider: "claude", model: "opus", thinkingOptionId: "high", status: "running" }),
    agent("a4", "webhooks", { provider: "codex", model: "gpt-5.5", thinkingOptionId: "medium" }),
    agent("a5", "dark-mode", { provider: "claude", model: "opus", thinkingOptionId: "high" }),
    agent("a6", "offline-sync", { provider: "codex", model: "gpt-5.5", thinkingOptionId: "medium", status: "running" }),
    agent("a7", "search-rank", { provider: "claude", model: "opus", thinkingOptionId: "high" }),
  ]);
  const key = (id: string, host = "local") => workspaceKey(host, id);
  const details = (groupId: string | null, more: Partial<ReturnType<typeof emptyDetails>> = {}) => ({ ...emptyDetails(), groupId, ...more });
  changeOrganization((values) => ({ ...values,
    groups: [
      { id: "sprint", name: "🚀 This sprint", parentId: null, color: "blue" },
      { id: "checkout", name: "Checkout", parentId: "sprint" },
      { id: "payments", name: "Payments", parentId: "sprint", color: "green" },
      { id: "review", name: "👀 Ready for review", parentId: null, color: "yellow" },
      { id: "experiments", name: "🧪 Experiments", parentId: null, color: "purple" },
    ],
    workspaceOrder: [key("apple-pay"), key("cart-test"), key("invoices-v2", "build-box"), key("webhooks")],
    workspaces: {
      [key("apple-pay")]: details("checkout", { subtitle: "Wallet button behind the checkout flag.\nShip to 10% first.",
        links: [parseGithubLink(pr("storefront", 1284)), parseGithubLink(issue("storefront", 1251))] }),
      [key("cart-test")]: details("checkout", { links: [parseGithubLink(pr("storefront", 1279))] }),
      [key("invoices-v2", "build-box")]: details("payments", { subtitle: "Keep the v1 endpoints until March.", links: [parseGithubLink(pr("billing-api", 311))] }),
      [key("webhooks")]: details("payments", { links: [parseGithubLink(pr("billing-api", 305)), parseGithubLink(issue("billing-api", 298))] }),
      [key("dark-mode")]: details("review", { links: [parseGithubLink(pr("mobile-app", 87))] }),
      [key("search-rank")]: details("review", { links: [parseGithubLink(pr("storefront", 1270))] }),
      [key("offline-sync")]: details("experiments"),
      [key("edge-cache", "build-box")]: details("experiments", { links: [parseGithubLink(pr("storefront", 1262))] }),
    },
    savedSearches: [
      { id: "mine", name: "Needs me", query: "", filters: { statuses: ["needs_input"], tags: [], hostIds: [], projectKeys: [], prs: [] } },
      { id: "prs", name: "Open PRs", query: "", filters: { statuses: [], tags: [], hostIds: [], projectKeys: [], prs: ["open"] } },
    ],
  }));
  return {
    active: items[0].ref,
    index: {
      entries: [
        { id: "apple-pay", branch: "feat/apple-pay", labels: [], links: [], git: { dirty: true, ahead: 3, behind: 0 } },
        { id: "cart-test", branch: "fix/cart-totals", labels: [], links: [], git: { dirty: false, ahead: 1, behind: 2 } },
        { id: "offline-sync", branch: "spike/offline-sync", labels: [], links: [], git: { dirty: true, ahead: 0, behind: 0 } },
      ],
      github: {
        [pr("storefront", 1284)]: status("open", "pending", "pending"),
        [issue("storefront", 1251)]: status("open"),
        [pr("storefront", 1279)]: status("open", "failure", "changes_requested"),
        [pr("billing-api", 311)]: status("draft", "success", null),
        [pr("billing-api", 305)]: status("merged", "success", "approved"),
        [issue("billing-api", 298)]: status("closed"),
        [pr("mobile-app", 87)]: status("open", "success", "approved"),
        [pr("storefront", 1270)]: status("open", "success", "approved"),
        [pr("storefront", 1262)]: status("closed", null, null),
      },
    },
  };
}

// The merge celebration for the webhooks workspace, whose PR has merged (open the preview with ?showcase&celebrate).
export const showcaseCelebration = {
  id: "showcase-webhooks",
  workspaceName: "Retry failed webhooks with backoff",
  workspaceId: "webhooks",
  title: "Retry failed webhooks with exponential backoff",
  url: pr("billing-api", 305),
  issues: [{ number: 298, title: "Webhook deliveries are lost when a merchant's endpoint is briefly down",
    summary: "Failed deliveries now retry five times over an hour, with jitter, before landing in the dead-letter queue for replay." }],
};
