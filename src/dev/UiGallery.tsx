import { useEffect, useState } from "react";
import { Plus, Search, Users, Inbox, Clock, CheckSquare, FileText, TrendingUp } from "lucide-react";
import {
  Page,
  PageHeader,
  EntityHeader,
  Tabs,
  StatGrid,
  StatTile,
  Toolbar,
  Surface,
  SplitLayout,
  FormGrid,
  Field,
  EmptyState,
} from "../components/layout";
import {
  applyViewSize,
  setStoredViewSizeMode,
  startViewSizeWatcher,
  useViewSize,
  type ViewSizeMode,
} from "../utils/viewSize";

/**
 * Dev-only gallery of the layout primitives (docs/VIEW-SIZE.md §6).
 * Open `/#ui-gallery` on the dev server. The frame below is a real
 * `.workspace` container, so the `ws-*` breakpoints react to the frame width
 * you pick, independent of the window.
 */

const MODES: { id: ViewSizeMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "compact", label: "Compact" },
  { id: "normal", label: "Normal" },
  { id: "big", label: "Big" },
];

// Frame widths in px. They match the workspace widths the QA spec drives.
const WIDTHS: { w: number | null; label: string }[] = [
  { w: 360, label: "360 phone" },
  { w: 768, label: "768 tablet" },
  { w: 1280, label: "1280 laptop" },
  { w: 1920, label: "1920 desktop" },
  { w: 2560, label: "2560 wide" },
  { w: null, label: "Fill window" },
];

const btn =
  "h-9 px-3 rounded-xl border text-ui font-semibold transition-all cursor-pointer active:scale-[0.98]";
const btnPrimary = `${btn} bg-slate-900 border-slate-900 text-white hover:bg-slate-800`;
const btnGhost = `${btn} bg-white border-slate-200 text-slate-700 hover:border-slate-300`;
const input =
  "h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-400";

const Section = ({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) => (
  <section id={id} className="flex flex-col gap-3">
    <div>
      <h3 className="type-panel-title text-slate-900">{title}</h3>
      <p className="type-meta text-slate-500">{note}</p>
    </div>
    <div className="rounded-3xl border border-dashed border-slate-300 p-4 ws-sm:p-6">{children}</div>
  </section>
);

export default function UiGallery() {
  const { mode, size, scale } = useViewSize();
  const [frame, setFrame] = useState<number | null>(1280);
  const [tab, setTab] = useState("timeline");

  useEffect(() => startViewSizeWatcher(), []);

  const pickMode = (m: ViewSizeMode) => {
    setStoredViewSizeMode(m);
    applyViewSize(m);
  };

  const tabs = [
    { key: "timeline", icon: <Clock />, label: "History" },
    { key: "tasks", icon: <CheckSquare />, label: "Tasks", count: 4 },
    { key: "files", icon: <FileText />, label: "Files", count: 12 },
    { key: "leads", label: "Active leads", count: 3 },
    { key: "fin", icon: <TrendingUp />, label: "Financial report" },
    { key: "inv", label: "Invoices & billing", count: 9 },
  ];

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {/* Controls: outside the workspace, so they stay the same while you test. */}
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <strong className="text-ui text-slate-900">UI gallery</strong>
        <div className="flex items-center gap-1">
          <span className="type-meta mr-1 text-slate-500">View size</span>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pickMode(m.id)}
              className={`${btn} ${mode === m.id ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-700"}`}
            >
              {m.label}
            </button>
          ))}
          <span className="type-meta ml-2 text-slate-500">
            now {size} · scale {scale}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="type-meta mr-1 text-slate-500">Workspace width</span>
          {WIDTHS.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setFrame(o.w)}
              className={`${btn} ${frame === o.w ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-700"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <main className="workspace bg-slate-50 rounded-3xl" style={frame ? { maxWidth: frame } : undefined}>
          <Page className="gap-10">
            <Section id="page-header" title="PageHeader" note="Title + subtitle left, actions right. Actions wrap under the title below ws-md.">
              <PageHeader
                icon={<Users className="text-slate-700" />}
                title="Clients"
                subtitle="Companies and people you work with, with their open leads and invoices"
                actions={
                  <>
                    <button type="button" className={btnGhost}>Export</button>
                    <button type="button" className={btnPrimary}><Plus className="inline size-4 mr-1" />New client</button>
                  </>
                }
              />
              <div className="mt-6">
                <PageHeader title="Header without icon or actions" subtitle="The same component, nothing on the right" />
              </div>
            </Section>

            <Section id="entity-header" title="EntityHeader" note="Detail views: back · avatar · title, badges and meta beneath, actions right.">
              <EntityHeader
                onBack={() => {}}
                backLabel="Back to clients"
                avatar={<div className="flex size-12 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold">AC</div>}
                title="Acme Components s.r.o. with a deliberately long company name to test truncation"
                badges={<span className="rounded-full bg-emerald-50 px-2 py-0.5 type-meta font-semibold text-emerald-700">Active</span>}
                meta="Bratislava · since 2021"
                actions={<button type="button" className={btnGhost}>Edit</button>}
                primaryAction={<button type="button" className={btnPrimary}>New invoice</button>}
              />
            </Section>

            <Section id="tabs" title="Tabs" note="One pill style. Never wraps: scrolls sideways when it does not fit (shrink the width to see it).">
              <Tabs items={tabs} value={tab} onChange={setTab} />
            </Section>

            <Section id="stat-grid" title="StatGrid + StatTile" note="Two columns, then every tile in one row from ws-lg.">
              <StatGrid count={4}>
                <StatTile label="Open leads" value="128" delta="+12 this week" icon={<Inbox />} />
                <StatTile label="Pipeline value" value="€ 482 300" delta="38 deals" icon={<TrendingUp />} />
                <StatTile label="Won (30 d)" value="€ 91 750" delta="+8.4 %" />
                <StatTile label="Overdue invoices" value="7" delta="€ 12 480" />
              </StatGrid>
            </Section>

            <Section id="toolbar" title="Toolbar" note="Search takes the remaining width; filters size to their content; primary action sits right.">
              <Toolbar
                search={
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${input} pl-9`} placeholder="Search…" />
                  </div>
                }
                filters={
                  <>
                    <select className={input}>
                      <option>All statuses</option>
                      <option>Qualified, awaiting proposal</option>
                    </select>
                    <select className={input}>
                      <option>Any owner</option>
                    </select>
                  </>
                }
                trailing={<button type="button" className={btnGhost}>Table</button>}
                primary={<button type="button" className={btnPrimary}><Plus className="inline size-4 mr-1" />New lead</button>}
              />
            </Section>

            <Section id="surface" title="Surface" note="Card, and one inset level inside it. Padding steps up at ws-sm.">
              <Surface>
                <div className="type-card-title text-slate-900">Card</div>
                <p className="type-body mb-4 text-slate-600">Body text at the current view size.</p>
                <Surface tone="inset">
                  <div className="type-label text-slate-700">Inset</div>
                  <p className="type-meta text-slate-500">Second level, never a third.</p>
                </Surface>
              </Surface>
            </Section>

            <Section id="split-layout" title="SplitLayout" note="Stacked below ws-lg; nav column from ws-lg; third rail column from ws-2xl.">
              <SplitLayout
                nav={
                  <Surface padding="none" className="p-2">
                    {["Profile", "Security", "Notifications", "Appearance"].map((l, i) => (
                      <div key={l} className={`rounded-xl px-3 py-2 text-ui ${i === 0 ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-600"}`}>{l}</div>
                    ))}
                  </Surface>
                }
                rail={<Surface><div className="type-card-title">Rail</div><p className="type-meta text-slate-500">Visible from ws-2xl only.</p></Surface>}
              >
                <Surface>
                  <div className="type-card-title text-slate-900">Main pane</div>
                  <p className="type-body text-slate-600">Takes the remaining width, no cap.</p>
                </Surface>
              </SplitLayout>
            </Section>

            <Section id="form-grid" title="FormGrid + Field" note="One column, two from ws-md, three from ws-2xl when dense.">
              <FormGrid dense>
                <Field label="Company name" hint="As on the invoice"><input className={input} defaultValue="Acme Components" /></Field>
                <Field label="Tax ID" error="Not a valid tax ID"><input className={input} defaultValue="12 3" /></Field>
                <Field label="Country"><select className={input}><option>Slovakia</option></select></Field>
                <Field label="Address" span="full"><input className={input} defaultValue="Hlavná 1, Bratislava" /></Field>
                <Field label="E-mail"><input className={input} /></Field>
                <Field label="Phone"><input className={input} /></Field>
              </FormGrid>
            </Section>

            <Section id="empty-state" title="EmptyState" note="Centred in its pane: icon, title, one line, one action.">
              <EmptyState
                icon={<Inbox />}
                title="No leads yet"
                body="Leads you create or import will show up here."
                action={<button type="button" className={btnPrimary}>Add a lead</button>}
              />
            </Section>

            <Section id="type" title="Type roles" note="The scale itself. Compare the three view sizes on this block.">
              <div className="flex flex-col gap-1 text-slate-800">
                <div className="type-page-title">type-page-title · Page title</div>
                <div className="type-panel-title">type-panel-title · Section title</div>
                <div className="type-card-title">type-card-title · Card title</div>
                <div className="type-body">type-body · Body text for paragraphs and descriptions.</div>
                <div className="type-label">type-label · Field label</div>
                <div className="type-meta">type-meta · Secondary information</div>
                <div className="type-overline">type-overline · Overline</div>
                <div className="type-metric">type-metric · 1 234</div>
              </div>
            </Section>
          </Page>
        </main>
      </div>
    </div>
  );
}
