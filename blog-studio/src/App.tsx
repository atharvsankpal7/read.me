import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
  AlertTriangle, Code2, Columns2, Download, FileCode2, FileText, FlaskConical, MessageSquareQuote, Palette,
  PanelLeftClose, PanelRightClose, Plus, Rocket, Save, Settings2, Shapes, Table2, Terminal, Brush,
} from "lucide-react";
import { api } from "./api";
import { assets } from "./assets";
import { buildPostHtml, formatDate, hasSimulation } from "../shared/build";
import type { PostSource, PostSummary, SiteConfig } from "../shared/types";
import { CodeEditor, type Lang } from "./components/CodeEditor";
import { MetaForm } from "./components/MetaForm";
import { NewPostDialog } from "./components/NewPostDialog";
import { Preview, type Device } from "./components/Preview";

type Tab = "article" | "details" | "simHtml" | "simJs" | "simCss" | "figJs" | "figCss";
type FileTab = Exclude<Tab, "article" | "details">;
const isFileTab = (t: Tab): t is FileTab => t !== "article" && t !== "details";
const TABS: { id: Tab; label: string; icon: typeof FileText; lang?: Lang; file?: string }[] = [
  { id: "article", label: "Article", icon: FileText, lang: "markdown", file: "post.md" },
  { id: "details", label: "Details", icon: Settings2 },
  { id: "simHtml", label: "Markup", icon: Code2, lang: "html", file: "sim.html" },
  { id: "simJs", label: "Script", icon: FileCode2, lang: "javascript", file: "sim.js" },
  { id: "simCss", label: "Styles", icon: Palette, lang: "css", file: "sim.css" },
  { id: "figJs", label: "Figures", icon: Shapes, lang: "javascript", file: "figures.js" },
  { id: "figCss", label: "Fig styles", icon: Brush, lang: "css", file: "figures.css" },
];

const SNIPPETS: { label: string; icon: typeof FileText; text: string }[] = [
  { label: "Simulation", icon: FlaskConical, text: "\n::simulation\n\n" },
  { label: "Figure", icon: Shapes, text: "\n::figure my-figure What the reader should notice in this figure.\n\n" },
  { label: "Callout", icon: MessageSquareQuote, text: "\n> [!TRY] Break it\n> Describe what the reader should do in the simulation.\n\n" },
  { label: "Code", icon: Terminal, text: "\n```ts\n\n```\n" },
  { label: "Table", icon: Table2, text: "\n| Setting | Value |\n| --- | --- |\n| acks | all |\n\n" },
];

function usePersist<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV] as const;
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

export default function App() {
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [draft, setDraft] = useState<PostSource | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [tab, setTab] = usePersist<Tab>("studio.tab", "article");
  const [device, setDevice] = usePersist<Device>("studio.device", "desktop");
  const [theme, setTheme] = usePersist<"light" | "dark">("studio.theme", "light");
  const [split, setSplit] = usePersist("studio.split", 0.42);
  const [mode, setMode] = usePersist<"both" | "editor" | "preview">("studio.mode", "both");
  const [lastSlug, setLastSlug] = usePersist<string | null>("studio.slug", null);
  const [built, setBuilt] = useState<{ html: string; warnings: string[]; minutes: number; bytes: number } | null>(null);
  const [version, setVersion] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "export">("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string; detail?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const scrollY = useRef(0);
  const view = useRef<EditorView | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const dirty = !!draft && JSON.stringify(draft) !== savedJson;

  const flash = useCallback((kind: "ok" | "err", text: string, detail?: string) => {
    setToast({ kind, text, detail });
    window.setTimeout(() => setToast((t) => (t && t.text === text ? null : t)), kind === "err" ? 7000 : 4200);
  }, []);

  const refreshList = useCallback(() => api.list().then(setPosts).catch((e) => flash("err", "Could not list posts", e.message)), [flash]);

  const open = useCallback(
    async (slug: string) => {
      if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
      try {
        const p = await api.get(slug);
        scrollY.current = 0;
        setDraft(p);
        setSavedJson(JSON.stringify(p));
        setLastSlug(slug);
      } catch (e) {
        flash("err", `Could not open ${slug}`, (e as Error).message);
      }
    },
    [dirty, flash, setLastSlug],
  );

  useEffect(() => {
    api.site().then(setSite).catch((e) => flash("err", "Could not load site.config.json", e.message));
    api.list().then((list) => {
      setPosts(list);
      const first = list.find((p) => p.slug === lastSlug) ?? list[0];
      if (first) open(first.slug);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- live build ---------- */
  useEffect(() => {
    if (!draft || !site) return;
    const id = window.setTimeout(() => {
      try {
        const b = buildPostHtml(draft, site, assets, { preview: true, forceTheme: theme, scrollY: scrollY.current });
        const real = buildPostHtml(draft, site, assets).html;
        setBuilt({ html: b.html, warnings: b.warnings, minutes: b.minutes, bytes: new Blob([real]).size });
        setVersion((v) => v + 1);
      } catch (e) {
        flash("err", "Build failed", (e as Error).message);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [draft, site, theme, refreshTick, flash]);

  /* ---------- actions ---------- */
  const save = useCallback(async () => {
    if (!draft) return false;
    setBusy("save");
    try {
      await api.save(draft);
      setSavedJson(JSON.stringify(draft));
      refreshList();
      return true;
    } catch (e) {
      flash("err", "Save failed", (e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }, [draft, flash, refreshList]);

  const exportPost = useCallback(async () => {
    if (!draft) return;
    if (!(await save())) return;
    setBusy("export");
    try {
      const r = await api.export(draft.slug);
      flash("ok", `Exported ${r.file}`, [`${kb(r.bytes)} single file, blogs/index.html updated`, ...r.warnings].join("\n"));
      refreshList();
    } catch (e) {
      flash("err", "Export failed", (e as Error).message);
    } finally {
      setBusy("");
    }
  }, [draft, save, flash, refreshList]);

  const finalHtml = () => (draft && site ? buildPostHtml(draft, site, assets).html : "");
  const download = () => {
    const html = finalHtml(); if (!html || !draft) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `${draft.slug}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const openTab = () => {
    const html = finalHtml(); if (!html) return;
    window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) exportPost(); else save().then((ok) => ok && flash("ok", "Saved"));
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    addEventListener("keydown", onKey);
    addEventListener("beforeunload", onUnload);
    return () => { removeEventListener("keydown", onKey); removeEventListener("beforeunload", onUnload); };
  }, [save, exportPost, flash, dirty]);

  const update = (patch: Partial<PostSource>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const insert = (text: string) => {
    const v = view.current; if (!v) return;
    const { from, to } = v.state.selection.main;
    v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
    v.focus();
  };

  /* ---------- split drag ---------- */
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const r = mainRef.current?.getBoundingClientRect(); if (!r) return;
      setSplit(Math.min(0.75, Math.max(0.22, (e.clientX - r.left) / r.width)));
    };
    const up = () => setDragging(false);
    addEventListener("pointermove", move); addEventListener("pointerup", up);
    return () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
  }, [dragging, setSplit]);

  const onScroll = useCallback((y: number) => { scrollY.current = y; }, []);
  const tabInfo = TABS.find((t) => t.id === tab)!;
  const sim = draft ? hasSimulation(draft) : false;
  const gridCols = useMemo(() => {
    if (mode === "editor") return "1fr 0px 0px";
    if (mode === "preview") return "0px 0px 1fr";
    return `${split}fr 6px ${1 - split}fr`;
  }, [mode, split]);

  return (
    <div className={`app ${dragging ? "dragging" : ""}`}>
      <aside className="side">
        <div className="logo"><span className="mark" aria-hidden="true" /><div><b>Blog Studio</b><span>posts → one HTML file</span></div></div>
        <button className="btn primary block" onClick={() => setCreating(true)}><Plus size={16} />New post</button>
        <div className="side-label">Posts</div>
        <ul className="posts">
          {posts.map((p) => (
            <li key={p.slug}>
              <button className={draft?.slug === p.slug ? "on" : ""} onClick={() => draft?.slug !== p.slug && open(p.slug)}>
                <b>{draft?.slug === p.slug ? draft.meta.title : p.meta.title}</b>
                <span className="row">
                  {p.meta.date && <span>{formatDate(p.meta.date)}</span>}
                  {p.hasSim && <span className="pill sim">sim</span>}
                  {p.meta.draft && <span className="pill">draft</span>}
                  {p.exported ? <span className="pill ok" title={p.exported}>exported</span> : <span className="pill muted">not exported</span>}
                </span>
              </button>
            </li>
          ))}
          {!posts.length && <li className="empty">No posts yet. Create one to start.</li>}
        </ul>
        <div className="side-foot">
          {site && <>Exports to <code>{site.outputDir.replace(/^\.\.\//, "")}/</code></>}
        </div>
      </aside>

      {draft ? (
        <section className="work">
          <header className="topbar">
            <div className="title">
              <b>{draft.meta.title || "Untitled"}</b>
              <span className={`state ${dirty ? "dirty" : ""}`}>{busy === "save" ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
            </div>
            <div className="seg" role="group" aria-label="Layout">
              <button className={mode === "editor" ? "on" : ""} onClick={() => setMode("editor")} title="Editor only"><PanelRightClose size={15} /></button>
              <button className={mode === "both" ? "on" : ""} onClick={() => setMode("both")} title="Editor and preview"><Columns2 size={15} /></button>
              <button className={mode === "preview" ? "on" : ""} onClick={() => setMode("preview")} title="Preview only"><PanelLeftClose size={15} /></button>
            </div>
            <button className="btn" onClick={() => save().then((ok) => ok && flash("ok", "Saved"))} disabled={!dirty || !!busy} title="Ctrl+S"><Save size={15} />Save</button>
            <button className="btn" onClick={download} title="Download the single HTML file"><Download size={15} />Download</button>
            <button className="btn primary" onClick={exportPost} disabled={!!busy} title="Save and write to blogs/ (Ctrl+Shift+S)"><Rocket size={15} />{busy === "export" ? "Exporting…" : "Export to blogs/"}</button>
          </header>

          <div className="main" ref={mainRef} style={{ gridTemplateColumns: gridCols }}>
            <div className="pane editor-pane">
              <nav className="tabs">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const has = isFileTab(t.id) ? draft[t.id].trim() : "";
                  return (
                    <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} title={t.file}>
                      <Icon size={14} />{t.label}{has ? <i className="dot" /> : null}
                    </button>
                  );
                })}
              </nav>
              {tab === "article" && (
                <div className="snips">
                  <span>Insert</span>
                  {SNIPPETS.map((s) => { const Icon = s.icon; return <button key={s.label} onClick={() => insert(s.text)}><Icon size={13} />{s.label}</button>; })}
                </div>
              )}
              {isFileTab(tab) && (
                <div className="snips file"><span>{draft.slug}/{tabInfo.file}</span>{tab === "simJs" && <span className="muted">runs with <code>root</code> and <code>Kit</code> in scope</span>}{tab === "figJs" && <span className="muted">register each figure with <code>Kit.figure(id, setup)</code></span>}</div>
              )}
              <div className="pane-body">
                {tab === "details" ? (
                  <MetaForm slug={draft.slug} meta={draft.meta} site={site} onChange={(meta) => update({ meta })} />
                ) : (
                  <CodeEditor
                    key={`${draft.slug}:${tab}`}
                    lang={tabInfo.lang!}
                    wrap={tab === "article"}
                    value={tab === "article" ? draft.body : draft[tab]}
                    onChange={(v) => update(tab === "article" ? { body: v } : { [tab]: v })}
                    onView={(v) => (view.current = v)}
                  />
                )}
              </div>
              <footer className="status">
                {built && <>
                  <span>{built.minutes} min read</span>
                  <span>{kb(built.bytes)}</span>
                  <span>{sim ? "with simulation" : "article only"}</span>
                  {built.warnings.length > 0 && <span className="warn" title={built.warnings.join("\n")}><AlertTriangle size={13} />{built.warnings[0]}</span>}
                </>}
              </footer>
            </div>
            <div className={`divider ${mode !== "both" ? "off" : ""}`} onPointerDown={(e) => { e.preventDefault(); setDragging(true); }} onDoubleClick={() => setSplit(0.42)} />
            <div className="pane">
              <Preview
                html={built?.html ?? ""}
                version={version}
                device={device}
                theme={theme}
                onDevice={setDevice}
                onTheme={setTheme}
                onRefresh={() => setRefreshTick((t) => t + 1)}
                onOpen={openTab}
                onScroll={onScroll}
              />
            </div>
          </div>
        </section>
      ) : (
        <section className="work empty-state">
          <div>
            <FlaskConical size={34} />
            <h1>Write a post with a simulation readers can break</h1>
            <p>Each post is markdown plus an optional simulation (markup, script, styles). The studio previews it live and exports one self-contained HTML file into your portfolio.</p>
            <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} />New post</button>
          </div>
        </section>
      )}

      {creating && (
        <NewPostDialog
          taken={posts.map((p) => p.slug)}
          onClose={() => setCreating(false)}
          onCreate={async (slug, title, starter) => {
            await api.create(slug, title, starter);
            setCreating(false);
            await refreshList();
            await open(slug);
            setTab("article");
          }}
        />
      )}

      {toast && (
        <div className={`toast ${toast.kind}`} role="status" onClick={() => setToast(null)}>
          <b>{toast.text}</b>
          {toast.detail && <pre>{toast.detail}</pre>}
        </div>
      )}
    </div>
  );
}
