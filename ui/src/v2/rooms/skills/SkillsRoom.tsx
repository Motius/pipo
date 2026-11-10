import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Sparkles, X, Check, ArrowRight, ChevronDown, ChevronRight,
  Mail as MailIcon, Calendar as CalendarIcon, FileText as FileTextIcon,
  MessageSquare as MessageIcon, Code2 as CodeIcon, Globe as GlobeIcon,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "../../ui";
import { StatusChip, Drawer, DrawerLabel, DrawerText, FilterChip, EmptyState, Skeleton, type Tone } from "../../ui/roomkit";
import { MarkdownBody } from "../../thread/MarkdownBody";
import { RoomShell } from "../RoomShell";
import { useRoomActions } from "../useRoomActionBus";
import {
  buildSkillTree, groupCardsForGrid, skillMatches, skillStatus,
  type SkillCardData,
} from "./skill-view";
import "./SkillsRoom.css";

/**
 * Skills Room — the FounderOS /skills experience ported onto pipo's vault:
 * a Domain/Group hierarchy tree, a searchable card grid, an on-demand
 * SKILL.md reader (generated from the stored row so the two never drift),
 * and the "describe a new skill" intake composer that writes a real, signed,
 * disabled draft.
 */

type Proposal = {
  name: string;
  proposed: { domain: string; group: string; path: string };
  alternates: { domain: string; group: string; path: string }[];
};

/** The tool/nature a skill runs on, as an icon (app name first, then fallback). */
function skillIcon(card: SkillCardData): LucideIcon {
  const a = card.app.toLowerCase();
  if (a.includes("mail") || a.includes("gmail")) return MailIcon;
  if (a.includes("calendar") || a.includes("gcal")) return CalendarIcon;
  if (a.includes("notion") || a.includes("doc")) return FileTextIcon;
  if (a.includes("slack") || a.includes("discord") || a.includes("whatsapp") || a.includes("message") || a.includes("chat")) return MessageIcon;
  if (a.includes("github") || a.includes("git") || a.includes("code") || a.includes("vscode")) return CodeIcon;
  if (a.includes("browser") || a.includes("web") || a.includes("chrome")) return GlobeIcon;
  return Sparkles;
}

type LoadedSkill = {
  id: string;
  name: string;
  app: string;
  description: string;
  match: { domains?: string[]; processNames?: string[]; keywords?: string[] };
  params: Array<{ name: string; type: string; description: string; required: boolean; default?: string; secret?: boolean }>;
  steps: Array<{ action: string; ref?: { name?: string }; value?: string; note?: string; effect?: string }>;
  provenance: string;
  version: number;
  enabled: boolean;
  integrity: "ok" | "unsigned" | "tampered";
  runCount: number;
  successCount: number;
  verifiedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type RoomBodyMode = "inline" | "expanded";

export function SkillsRoomBody({ mode }: { mode: RoomBodyMode }) {
  const [skills, setSkills] = useState<SkillCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { skills?: SkillCardData[] }) => {
        if (cancelled) return;
        setSkills(Array.isArray(data?.skills) ? data.skills : []);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load skills"); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  const tree = useMemo(() => buildSkillTree(skills ?? []), [skills]);
  const gridGroups = useMemo(() => groupCardsForGrid(skills ?? [], query), [skills, query]);
  const matchCount = useMemo(() => (skills ?? []).filter((s) => skillMatches(s, query)).length, [skills, query]);

  useRoomActions("skills", (action, args) => {
    switch (action) {
      case "search": setQuery(typeof args.query === "string" ? args.query : ""); return true;
      case "open": {
        const name = typeof args.name === "string" ? args.name : "";
        if (!name || !(skills ?? []).some((s) => s.name === name)) return false;
        setOpenSlug(name);
        return true;
      }
      default: return false;
    }
  });

  const toggleDomain = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const sourceNote = skills === null
    ? "loading…"
    : error
      ? error
      : `${skills.length} skills · live from the vault`;

  return (
    <div className={`rk-skills rk-skills--${mode}`}>
      <div className="rk-skills__bar">
        <div className="rk-skills__search">
          <Icon icon={Search} size="sm" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills"
            spellCheck={false}
            aria-label="Search skills"
          />
          {query !== "" && (
            <button className="rk-skills__clear" onClick={() => setQuery("")} aria-label="Clear search">×</button>
          )}
        </div>
        <NewSkillIntake onCreated={refetch} existingNames={(skills ?? []).map((s) => s.name)} />
      </div>
      <p className="rk-skills__note">
        {sourceNote}
        {query.trim() !== "" && ` · ${matchCount} match${matchCount === 1 ? "" : "es"} for “${query.trim()}”`}
      </p>

      {error && skills === null ? (
        <div className="rk-skills__empty"><EmptyState title="Skills: Unavailable">{error}</EmptyState></div>
      ) : skills === null ? (
        <div className="rk-skills__empty"><Skeleton lines={6} /></div>
      ) : skills.length === 0 ? (
        <div className="rk-skills__empty">
          <EmptyState title="No skills yet">
            Record one by demonstration (“record a skill…”), or describe a new one above and pipo will draft it.
          </EmptyState>
        </div>
      ) : (
        <div className="rk-skills__cols">
          {/* Hierarchy tree — Domain → Group → skill (search dims non-matches). */}
          <div className="rk-skills__tree" aria-label="Skill hierarchy">
            {tree.map((domain) => {
              const isOpen = !collapsed.has(domain.name);
              return (
                <div className="rk-skills__domain" key={domain.name}>
                  <button
                    className="rk-skills__domain-head"
                    onClick={() => toggleDomain(domain.name)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronDown size={13} strokeWidth={1.7} /> : <ChevronRight size={13} strokeWidth={1.7} />}
                    <span className="rk-skills__domain-name">{domain.name}</span>
                    <span className="rk-skills__count">{domain.count}</span>
                  </button>
                  {isOpen && domain.groups.map((group) => (
                    <div key={group.name} className="rk-skills__group">
                      <div className="rk-skills__group-label">{group.name}</div>
                      {group.skills.map((s) => {
                        const dim = !skillMatches(s, query);
                        return (
                          <button
                            key={s.id}
                            className={`rk-skills__leaf${openSlug === s.name ? " rk-skills__leaf--on" : ""}${dim ? " rk-skills__leaf--dim" : ""}`}
                            onClick={() => setOpenSlug(s.name)}
                          >
                            <span className="rk-skills__leaf-dot" data-tone={skillStatus(s).tone} />
                            <span className="rk-skills__leaf-name">{s.name}</span>
                            {s.stepsCount > 0 && <span className="rk-skills__count">{s.stepsCount}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* The library — compact cards grouped by domain. */}
          <div className="rk-skills__library">
            {gridGroups.length === 0 ? (
              <div className="rk-skills__empty">
                <EmptyState title="No skills match">
                  Nothing matches “{query.trim()}”. Clear the search to see the whole library.
                </EmptyState>
              </div>
            ) : (
              gridGroups.map(({ domain, cards }) => (
                <section className="rk-skills__section" key={domain}>
                  <div className="rk-skills__section-head">
                    <span className="rk-skills__section-title">{domain}</span>
                    <span className="rk-skills__count">{cards.length}</span>
                  </div>
                  <div className="rk-skills__grid">
                    {cards.map((c) => {
                      const Ic = skillIcon(c);
                      const status = skillStatus(c);
                      return (
                        <button
                          key={c.id}
                          className="rk-skills__card"
                          onClick={() => setOpenSlug(c.name)}
                          title={`${c.name} — open SKILL.md`}
                        >
                          <span className="rk-skills__card-head">
                            <Ic className="rk-skills__card-icon" size={15} strokeWidth={1.7} />
                            <span className="rk-skills__card-name">{c.name}</span>
                            <span className="rk-skills__card-dot" data-tone={status.tone} />
                          </span>
                          <span className="rk-skills__card-desc">{c.description || "No description."}</span>
                          <span className="rk-skills__card-meta">
                            <span>{c.group.toLowerCase()}</span>
                            <span>·</span>
                            <span>{c.stepsCount} step{c.stepsCount === 1 ? "" : "s"}</span>
                            {c.runCount > 0 && (
                              <>
                                <span>·</span>
                                <span>{c.successRate ?? 0}% over {c.runCount}</span>
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      )}

      {openSlug && (
        <SkillReader
          name={openSlug}
          onClose={() => setOpenSlug(null)}
        />
      )}
    </div>
  );
}

export function SkillsRoom() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { total?: number } | null) => { if (!cancelled && data && typeof data.total === "number") setCount(data.total); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const subtitle = count === null ? "loading…" : `${count} ${count === 1 ? "skill" : "skills"} · live from the vault`;
  return (
    <RoomShell title="Skills" subtitle={subtitle} breadcrumb={["Skills"]}>
      <SkillsRoomBody mode="expanded" />
    </RoomShell>
  );
}

/* ── The reader: one skill's generated SKILL.md, fetched on demand ── */

function SkillReader({ name, onClose }: { name: string; onClose: () => void }) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ app: string; enabled: boolean; integrity: string; version: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setMarkdown(null);
    setFailed(false);
    fetch(`/api/skills/${encodeURIComponent(name)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        return body as { skill: LoadedSkill; markdown: string };
      })
      .then((body) => {
        if (cancelled) return;
        setMarkdown(body.markdown);
        setMeta({ app: body.skill.app || "(any)", enabled: body.skill.enabled, integrity: body.skill.integrity, version: body.skill.version });
      })
      .catch(() => { if (!cancelled) { setFailed(true); setMarkdown(`SKILL.md could not be read for “${name}”.`); } });
    return () => { cancelled = true; };
  }, [name]);

  const tone: Tone = meta?.integrity === "ok" ? "ok" : meta?.integrity === "unsigned" ? "hold" : "fail";

  return (
    <div className="rk-skills__overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`SKILL.md for ${name}`}>
      <div className="rk-skills__pop" onClick={(e) => e.stopPropagation()}>
        <div className="rk-skills__pop-head">
          <span className="rk-skills__pop-path">
            <Sparkles size={14} strokeWidth={1.7} />
            <span className="rk-skills__pop-name">{name}</span>
            {meta && (
              <span className="rk-skills__pop-meta">
                <StatusChip tone={tone}>{meta.integrity}</StatusChip>
                <span>{meta.app}</span>
                <span>·</span>
                <span>v{meta.version}</span>
                {!meta.enabled && <span>·</span>}
                {!meta.enabled && <span className="rk-skills__pop-draft">draft — not runnable</span>}
              </span>
            )}
          </span>
          <button className="rk-skills__pop-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.7} />
          </button>
        </div>
        <div className="rk-skills__pop-body">
          {markdown === null ? (
            <Drawer empty="Loading SKILL.md…" />
          ) : (
            <SkillMarkdown markdown={markdown} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Split the generated SKILL.md into its YAML frontmatter (rendered as a mono
 * block — MarkdownBody would collapse the single newlines into one paragraph)
 * and the prose body. No frontmatter → the whole text is body.
 */
function SkillMarkdown({ markdown }: { markdown: string }) {
  const m = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return <MarkdownBody text={markdown} />;
  return (
    <>
      <pre className="rk-skills__fm">{m[1]}</pre>
      <MarkdownBody text={markdown.slice(m[0].length)} />
    </>
  );
}

/* ── New-skill intake: describe → propose placement → create a real draft ── */

function NewSkillIntake({ onCreated, existingNames }: { onCreated: () => void; existingNames: string[] }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [chosen, setChosen] = useState(0);
  const [created, setCreated] = useState<{ name: string; path: string } | null>(null);

  // Conflict feedback before the network round-trip: the same rule the API
  // enforces (409), surfaced the moment the name is typed.
  const localConflict = name.trim() !== ""
    && existingNames.some((n) => n.toLowerCase() === name.trim().toLowerCase());

  function reset() {
    setDescription("");
    setName("");
    setError(null);
    setProposal(null);
    setChosen(0);
    setCreated(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function propose() {
    setError(null);
    if (description.trim().length < 8) {
      setError("Describe it in a bit more detail — at least a sentence.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/skills/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: description.trim(), name: name.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setProposal(body as Proposal);
      setChosen(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    const placement = [proposal.proposed, ...proposal.alternates][chosen];
    if (!placement) { setError("Pick a placement first."); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/skills/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: proposal.name,
          description: description.trim(),
          app: placement.domain === "General" ? undefined : placement.domain,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setCreated({ name: body.name, path: body.path });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="rk-skills__intake-chip" onClick={() => setOpen(true)}>
        <span className="rk-skills__intake-pen" aria-hidden>✎</span>
        Describe a new skill
      </button>
    );
  }

  const placements = proposal ? [proposal.proposed, ...proposal.alternates] : [];

  return (
    <div className="rk-skills__intake" role="form" aria-label="Describe a new skill">
      <div className="rk-skills__intake-head">
        <span className="rk-skills__intake-title">Describe a new skill</span>
        <button className="rk-skills__pop-close" onClick={close} aria-label="Close">
          <X size={15} strokeWidth={1.7} />
        </button>
      </div>

      {created ? (
        <div className="rk-skills__intake-done">
          <div className="rk-skills__intake-done-row">
            <Check size={15} strokeWidth={1.7} />
            <span>Draft created at <code>{created.path}</code></span>
          </div>
          <DrawerLabel>what now</DrawerLabel>
          <DrawerText>
            It’s a stub — disabled and empty, so nothing can run it. Flesh it out or re-record it by
            demonstration; it already shows in the hierarchy below.
          </DrawerText>
          <button className="rk-skills__intake-primary" onClick={close}>Done</button>
        </div>
      ) : (
        <>
          <textarea
            className="rk-skills__intake-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should this skill do?"
            rows={3}
            disabled={busy}
            aria-label="Skill description"
          />
          <input
            className="rk-skills__intake-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional — kebab-case, e.g. invoice-chaser)"
            disabled={busy}
            aria-label="Skill name (optional)"
          />
          {localConflict && !error && (
            <p className="rk-skills__intake-error">a skill named “{name.trim()}” already exists</p>
          )}
          {error && <p className="rk-skills__intake-error">{error}</p>}

          {!proposal ? (
            <button className="rk-skills__intake-primary" onClick={propose} disabled={busy || localConflict}>
              {busy ? "Proposing…" : "Propose placement"}
              {!busy && <ArrowRight size={14} strokeWidth={1.7} />}
            </button>
          ) : (
            <div className="rk-skills__intake-placements">
              <p className="rk-skills__intake-where">
                Will be created at <code>{placements[chosen]?.path}</code>
              </p>
              <div className="rk-skills__intake-choices">
                {placements.map((p, i) => (
                  <FilterChip key={`${p.domain}/${p.group}`} on={i === chosen} onClick={() => setChosen(i)}>
                    {i === 0 ? "Proposed: " : "Alternate: "}
                    {p.domain}/{p.group}
                  </FilterChip>
                ))}
              </div>
              <div className="rk-skills__intake-row">
                <button className="rk-skills__intake-primary" onClick={confirm} disabled={busy}>
                  {busy ? "Creating…" : "Create draft skill"}
                </button>
                <button className="rk-skills__intake-back" onClick={() => setProposal(null)} disabled={busy}>
                  Back
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
