// Display names for an agent's provider, model and thinking level, from a host's provider snapshot.
type Option = { id: string; label: string };
type Model = { id: string; label: string; aliases?: string[]; thinkingOptions?: Option[]; thinkingSet?: number };
type Entry = { provider: string; label?: string; iconSvg?: string; models?: Model[] };
export type ProviderSnapshot = {
  entries: Entry[];
  compactSnapshot?: { entries: Entry[]; thinkingSets: { options: Option[] }[] };
};
export type ProviderCatalog = Map<string, { label: string | null; iconSvg: string | null; models: Map<string, { label: string; thinking: Map<string, string> }> }>;

export function buildProviderCatalog(snapshot: ProviderSnapshot): ProviderCatalog {
  const catalog: ProviderCatalog = new Map();
  const sets = snapshot.compactSnapshot?.thinkingSets ?? [];
  for (const entry of [...(snapshot.compactSnapshot?.entries ?? []), ...snapshot.entries]) {
    const current = catalog.get(entry.provider) ?? { label: null, iconSvg: null, models: new Map() };
    current.label = entry.label ?? current.label;
    current.iconSvg = entry.iconSvg ?? current.iconSvg;
    for (const model of entry.models ?? []) {
      const options = model.thinkingOptions ?? (model.thinkingSet !== undefined ? sets[model.thinkingSet]?.options : undefined) ?? [];
      const value = { label: model.label, thinking: new Map(options.map((option) => [option.id, option.label])) };
      for (const id of [model.id, ...(model.aliases ?? [])]) current.models.set(id, value);
    }
    catalog.set(entry.provider, current);
  }
  return catalog;
}

const titleCase = (value: string) => value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function agentLabels(catalog: ProviderCatalog | null, agent: { provider: string; model: string | null; thinkingOptionId: string | null }) {
  const provider = catalog?.get(agent.provider);
  const model = agent.model ? provider?.models.get(agent.model) : undefined;
  return {
    provider: provider?.label ?? titleCase(agent.provider),
    iconSvg: provider?.iconSvg ?? null,
    model: model?.label ?? agent.model,
    thinking: agent.thinkingOptionId ? model?.thinking.get(agent.thinkingOptionId) ?? titleCase(agent.thinkingOptionId) : null,
  };
}
