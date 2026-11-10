/**
 * Client-side view model for the Skills Room: grouping the flat card list
 * into the Domain/Group hierarchy the tree renders, plus the search filter
 * the grid and tree share. Pure and deterministic — mirrors the FounderOS
 * SkillHierarchy contract (counts, names, and groups are real; a query dims
 * non-matching leaves) over pipo's vault projection.
 */

export type SkillCardData = {
  id: string;
  name: string;
  app: string; // display domain ("General" when the vault app is empty)
  group: string; // display group (Recorded / Authored / Marketplace)
  description: string;
  enabled: boolean;
  integrity: "ok" | "unsigned" | "tampered";
  provenance: string;
  version: number;
  paramsCount: number;
  stepsCount: number;
  runCount: number;
  successRate: number | null;
  updatedAt: number;
  createdAt: number;
};

export type SkillGroupNode = {
  name: string;
  count: number;
  skills: SkillCardData[];
};

export type SkillDomainNode = {
  name: string;
  count: number;
  groups: SkillGroupNode[];
};

/** Split a "Domain/Group" path into its two levels (a bare label is its own domain). */
export function splitGroupPath(group: string): [string, string] {
  const i = group.indexOf("/");
  return i === -1 ? [group, group] : [group.slice(0, i), group.slice(i + 1)];
}

/**
 * Build the Domain → Group → skills tree. Domains sort by skill count desc
 * then name; groups likewise inside their domain (the FounderOS ordering, so
 * the busiest branches lead the tree).
 */
export function buildSkillTree(cards: SkillCardData[]): SkillDomainNode[] {
  const domains = new Map<string, Map<string, SkillCardData[]>>();
  for (const c of cards) {
    const [d, g] = splitGroupPath(`${c.app}/${c.group}`);
    const groups = domains.get(d) ?? new Map<string, SkillCardData[]>();
    const list = groups.get(g) ?? [];
    list.push(c);
    groups.set(g, list);
    domains.set(d, groups);
  }

  const countOf = (m: Map<string, SkillCardData[]>) => [...m.values()].reduce((s, l) => s + l.length, 0);
  return [...domains.keys()]
    .sort((a, b) => countOf(domains.get(b)!) - countOf(domains.get(a)!) || a.localeCompare(b))
    .map((name) => {
      const groups = domains.get(name)!;
      const nodes: SkillGroupNode[] = [...groups.keys()]
        .sort((a, b) => (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0) || a.localeCompare(b))
        .map((g) => ({ name: g, count: groups.get(g)!.length, skills: groups.get(g)! }));
      return { name, count: countOf(groups), groups: nodes };
    });
}

/** Case-insensitive substring match across the fields a card shows. */
export function skillMatches(card: SkillCardData, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  return (
    card.name.toLowerCase().includes(needle) ||
    card.description.toLowerCase().includes(needle) ||
    card.id.toLowerCase().includes(needle) ||
    card.app.toLowerCase().includes(needle) ||
    card.group.toLowerCase().includes(needle) ||
    card.provenance.toLowerCase().includes(needle)
  );
}

/** The grid's cards: query-filtered, grouped by domain (count-desc, then alpha). */
export function groupCardsForGrid(cards: SkillCardData[], q: string): { domain: string; cards: SkillCardData[] }[] {
  const visible = cards.filter((c) => skillMatches(c, q));
  const byDomain = new Map<string, SkillCardData[]>();
  for (const c of visible) {
    const list = byDomain.get(c.app) ?? [];
    list.push(c);
    byDomain.set(c.app, list);
  }
  return [...byDomain.keys()]
    .sort((a, b) => (byDomain.get(b)!.length - byDomain.get(a)!.length) || a.localeCompare(b))
    .map((domain) => ({ domain, cards: byDomain.get(domain)! }));
}

/** Status chip for a card: integrity first (it gates running), then enabled. */
export function skillStatus(card: SkillCardData): { label: string; tone: "ok" | "warn" | "fail" | "mut" } {
  if (card.integrity === "tampered") return { label: "tampered", tone: "fail" };
  if (card.integrity === "unsigned") return { label: "unsigned", tone: "warn" };
  if (!card.enabled) return { label: card.stepsCount === 0 ? "draft" : "disabled", tone: "mut" };
  return { label: "ready", tone: "ok" };
}
