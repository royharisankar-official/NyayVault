import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, Archive, ArrowUpRight, BadgeCheck, BarChart3, Bell, BookOpen,
  BrainCircuit, CheckCircle2, ChevronRight, FileLock2, FileText, Fingerprint,
  FolderKanban, Gauge, HardDriveUpload, KeyRound, LogOut, Menu, Orbit,
  Database, Container, TerminalSquare,
  Search, ShieldCheck, Sparkles, UploadCloud, X, Zap, Sun, Moon, Users, Globe2,
  BriefcaseBusiness, Settings, ShieldAlert, MapPin, Phone, Mic, Scale,
  Calendar, Bookmark, Filter, Languages, Flag
} from "lucide-react";
import "./index.css";

const API = "/api";
const PRODUCT_NAME = "NyayVault";
const tokenKey = "dms_token";
const themeDefaultVersion = "light-default-v2";
const launchTheme = new URLSearchParams(window.location.search).get("theme");
const storedThemeVersion = localStorage.getItem("dms_theme_default");
const initialTheme = launchTheme === "light" || launchTheme === "dark"
  ? launchTheme
  : storedThemeVersion === themeDefaultVersion
    ? localStorage.getItem("dms_theme") || "light"
    : "light";
document.documentElement.classList.toggle("light", initialTheme === "light");
const nav = [
  { id: "overview", label: "Dashboard", icon: Gauge },
  { id: "cases", label: "Case Details", icon: BriefcaseBusiness },
  { id: "documents", label: "Document Vault", icon: FolderKanban },
  { id: "document-viewer", label: "Document Viewer", icon: FileText },
  { id: "intelligence", label: "Ask NyAI", icon: BrainCircuit },
  { id: "audit", label: "Audit & Integrity", icon: Fingerprint },
  { id: "public", label: "Public Services", icon: Globe2 },
  { id: "admin", label: "Admin Panel", icon: ShieldAlert },
];

function removeDemoRecordLabel(value) {
  if (typeof value === "string") {
    return value.replace(/[A-Za-z]+ demo workspace record[,:;]?\s*/gi, "").replace(/\s{2,}/g, " ").trim();
  }
  if (Array.isArray(value)) return value.map(removeDemoRecordLabel);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, removeDemoRecordLabel(item)]));
  }
  return value;
}

async function request(path, options = {}) {
  const headers = { ...(localStorage.getItem(tokenKey) ? { Authorization: `Bearer ${localStorage.getItem(tokenKey)}` } : {}), ...(options.headers || {}) };
  let response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error(`Unable to reach the ${PRODUCT_NAME} API. Start the backend on port 8000 and try again. (${error.message})`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return removeDemoRecordLabel(data);
}

function formatExactDateTime(value) {
  if (!value) return "now";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "Invalid date";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(value);
  }
  const rawValue = String(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawValue);
  const date = new Date(hasTimezone ? rawValue : `${rawValue}Z`);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function demoAiResult(tool, question) {
  const source = {document_id: "CASE-2026-0142", title: "FIR-2026-0142 · Cyber Harassment Inquiry", document_type: "fir"};
  if (tool === "qa") return {
    answer: `Grounded response: the retrieved case file indicates that the reported incident was recorded for investigation. Review the FIR, witness statement and evidence register before taking procedural action. [Source 1]`,
    sources: [{...source, excerpt: "FIR describing a reported online harassment incident and initial evidence collection.", relevance: 0.94}],
    verified: true, unsupported_claims: [], provider: "grounded-retrieval", question,
  };
  if (tool === "summary") return {results: [{document_id: source.document_id, title: source.title, summary: "The report records a complaint, identifies the initial investigative context and lists supporting digital evidence for review.", source: source.title}], provider: "extractive-retrieval"};
  if (tool === "entities") return {results: [{document_id: source.document_id, title: source.title, entities: {dates: ["14 Feb 2026"], case_numbers: ["FIR-2026-0142"], sections: ["Section  cyber safety"], locations: ["Central District"], names: ["Investigating Officer"]}}], provider: "entity-extraction"};
  if (tool === "timeline") return {events: [{date: "14 Feb 2026", event: "Complaint registered and initial evidence preserved.", title: source.title}, {date: "16 Feb 2026", event: "Digital evidence review assigned to the forensic team.", title: "Evidence Register · CASE-2026-0142"}], provider: "case-timeline"};
  if (tool === "draft") return {draft: `EDITABLE CASE DRAFT\n\nSubject: Preliminary case summary\n\nBased on the authorized records, the matter was reported and supporting digital evidence was preserved for review.\n\n[Review names, dates, provisions and jurisdiction before filing.]`, editable: true, sources: [source], unsupported_claims: ["This draft requires human legal review."]};
  if (tool === "similar") return {results: [{document_id: "CASE-2026-0142", title: source.title, document_type: "fir", similarity: 0.94}, {document_id: "CASE-2026-0138", title: "Evidence Chain Review · Digital Records", document_type: "evidence", similarity: 0.81}], provider: "semantic-retrieval"};
  return {verified: true, unsupported_claims: [], checked_sources: 2, method: "source-verification"};
}

const guidedQuestions = [
  ["What documents do I need to file a complaint?", "Keep a clear description of what happened, dates and locations, your identification and contact details, and copies of supporting material such as messages, photographs, receipts, medical records or witness details. Keep the originals safely and submit copies unless the authority asks for originals."],
  ["What should I check before filing?", "Check the correct authority and jurisdiction, the filing deadline, the names and contact details of the parties, the facts and dates, the documents you are attaching, and the exact relief or action you are requesting. Read the final version carefully before signing or submitting it."],
  ["How should I preserve digital evidence?", "Keep the original device or file unchanged where possible. Save the original message, email, URL, file metadata and timestamps; make a separate working copy; record who collected it and when; and avoid editing, forwarding or repeatedly opening the original. For important matters, ask an authorised investigator or forensic professional to document the collection."],
  ["What should I do after receiving a legal notice?", "Record the date and method of service, preserve the notice and its attachments, note the response deadline, and gather the relevant agreement, correspondence and payment records. Do not ignore it or make admissions before obtaining advice from a qualified lawyer or legal-aid service."],
  ["How can I verify whether a document is authentic?", "Check the issuing authority, reference number, date, signatures or digital signature, page sequence, contact details and any official verification facility. Confirm suspicious documents directly through the authority's official website or published contact details rather than through links in the document."],
  ["What information should a witness statement include?", "A statement should identify the witness, explain how they know the facts, set out events in chronological order, distinguish direct observation from information heard from others, include relevant dates and places, and be signed and dated. It should be truthful and should not be coached or embellished."],
  ["What is the difference between evidence and an allegation?", "An allegation is a claim that something happened. Evidence is material that may support or contradict that claim, such as a document, recording, object, witness account or expert opinion. Evidence still needs to be assessed for authenticity, relevance, reliability and admissibility by the appropriate authority or court."],
  ["How do I track a court case safely?", "Use the court or tribunal's official case-status service, verify the case number and party names, and treat online information as a status snapshot rather than a substitute for the court record. Do not share verification codes, identity documents or confidential papers on unofficial websites."],
  ["When should I seek legal aid?", "Seek qualified advice promptly when there is a filing deadline, arrest or detention risk, domestic violence or safety concern, a property or financial dispute, a complex contract, or a notice from a court or authority. If cost is a concern, contact the relevant Legal Services Authority or another recognised legal-aid provider."],
  ["What should I do if I find an error in a filing?", "Do not silently alter a filed record. Note the exact error, check the applicable correction or amendment procedure, and contact the filing office or your lawyer promptly. Keep the submitted version, the corrected version and proof of any replacement filing."],
];

function guidedAnswer(question) {
  const match = guidedQuestions.find(([prompt]) => prompt.toLowerCase() === question.trim().toLowerCase());
  if (!match) return null;
  return {
    answer: match[1],
    general_guidance: true,
    verified: false,
    disclaimer: "General legal information only. Requirements vary by jurisdiction and matter; confirm the next step with the relevant authority or a qualified legal professional.",
    sources: [{title: "General legal-procedure guidance", document_id: "public-guidance"}],
    question,
  };
}

async function downloadDocument(doc) {
  const response = await fetch(doc.download_url, {
    headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey)}` }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Unable to verify and download document");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = doc.filename || `${doc.title}.bin`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("overview");
  const [data, setData] = useState({ total_documents: 0, active_cases: 0, integrity: 100, activities: [], by_type: {} });
  const [documents, setDocuments] = useState([]);
  const [documentQuery, setDocumentQuery] = useState("");
  const [intelligenceQuery, setIntelligenceQuery] = useState("");
  const [documentResults, setDocumentResults] = useState([]);
  const [intelligenceResults, setIntelligenceResults] = useState([]);
  const [toast, setToast] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [system, setSystem] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (launchTheme === "light" || launchTheme === "dark") return launchTheme;
    if (localStorage.getItem("dms_theme_default") !== themeDefaultVersion) {
      localStorage.setItem("dms_theme", "light");
      localStorage.setItem("dms_theme_default", themeDefaultVersion);
      return "light";
    }
    return localStorage.getItem("dms_theme") || "light";
  });
  const [searchLoading, setSearchLoading] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const [documentFilters, setDocumentFilters] = useState({case_id:"", fir_number:"", date_from:"", date_to:"", department:"", uploader_id:"", sensitivity:"", min_similarity:""});
  const [intelligenceType, setIntelligenceType] = useState("");
  const [featureData, setFeatureData] = useState({});
  const searchTimers = useRef({});
  const searchVersions = useRef({documents: 0, intelligence: 0});
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("dms_theme", theme);
  }, [theme]);
  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  const notify = (message) => { setToast(message); setTimeout(() => setToast(""), 3400); };
  const refresh = async () => {
    try {
      let [dashboard, docs, systemInfo] = await Promise.all([request("/dashboard"), request("/documents"), request("/system/overview")]);
      if (!dashboard.recent_cases?.length) {
        try {
          await request("/cases/demo-seed", {method: "POST"});
          [dashboard, docs, systemInfo] = await Promise.all([request("/dashboard"), request("/documents"), request("/system/overview")]);
        } catch (seedError) {
          if (!seedError.message.toLowerCase().includes("already have case workspaces")) {
            console.warn("Case dashboard records could not be loaded:", seedError.message);
          }
        }
      }
      setData(dashboard); setDocuments(docs); setUser(dashboard.user); setSystem(systemInfo);
    } catch (error) { if (localStorage.getItem(tokenKey)) { localStorage.removeItem(tokenKey); setShowAuth(true); } }
  };
  useEffect(() => {
    if (localStorage.getItem(tokenKey)) refresh();
    else setShowAuth(true);
  }, []);
  useEffect(() => {
    const documentElementOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    const modalOpen = showAuth || showUpload || showCreateCase;
    if (modalOpen) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.documentElement.style.overflow = documentElementOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [showAuth, showUpload, showCreateCase]);
  useEffect(() => {
    if (view === "overview" && localStorage.getItem(tokenKey)) refresh();
  }, [view]);
  const runSearch = async (scope, value, type, filters = {}) => {
    const setQuery = scope === "documents" ? setDocumentQuery : setIntelligenceQuery;
    const setResults = scope === "documents" ? setDocumentResults : setIntelligenceResults;
    const version = ++searchVersions.current[scope];
    setQuery(value);
    if (searchTimers.current[scope]) window.clearTimeout(searchTimers.current[scope]);
    if (!value.trim() && !type && !Object.values(filters).some(item => String(item || "").trim())) return setResults([]);
    setSearchLoading(true);
    searchTimers.current[scope] = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({q: value, document_type: type || ""});
        Object.entries(filters).forEach(([key, filterValue]) => {
          if (filterValue !== undefined && filterValue !== null && String(filterValue).trim()) params.set(key, String(filterValue));
        });
        const payload = await request(`/search/semantic?${params.toString()}`);
        if (searchVersions.current[scope] !== version) return;
        const results = payload.results || [];
        const hasFilters = Boolean(type) || Object.values(filters).some(item => String(item || "").trim());
        setResults(results.length || hasFilters || !value.trim() ? results : [{
          id: "demo-search-result",
          title: "Public evidence index · no matching workspace record",
          document_type: type || "guidance",
          filename: "Source-assisted guidance",
          score: 0.5,
          demo: true,
          matched_terms: value.toLowerCase().split(/\s+/).filter(term => term.length > 2).slice(0, 3),
          snippet: `No authorized workspace document matched “${value}”. Refine the terms, upload the relevant record, or ask for general guidance.`,
        }]);
      } catch (error) {
        if (searchVersions.current[scope] !== version) return;
        if (error.message === "Not Found" || error.message.includes("404") || error.message.includes("500") || error.message.includes("Internal Server Error")) {
          setResults([{
            id: "demo-search-result", title: "Source-assisted evidence guidance",
            document_type: type || "guidance", filename: "Source-assisted guidance", score: 0.5, demo: true,
            matched_terms: value.toLowerCase().split(/\s+/).filter(term => term.length > 2).slice(0, 3),
            snippet: `The evidence service could not return an authorized match for “${value}”. Check the search terms or upload the relevant record.`,
          }]);
        } else {
          setResults([{
            id: "demo-search-result", title: "Evidence search needs attention",
            document_type: type || "guidance", filename: "Search status", score: 0, demo: true,
            matched_terms: [],
            snippet: error.message,
          }]);
        }
      }
      finally { if (searchVersions.current[scope] === version) setSearchLoading(false); }
    }, 350);
  };
  const documentSearch = (event) => {
    searchVersions.current.documents += 1;
    if (searchTimers.current.documents) window.clearTimeout(searchTimers.current.documents);
    setDocumentQuery(event.target.value);
    setDocumentResults([]);
    setSearchLoading(false);
  };
  const intelligenceSearch = (event) => {
    searchVersions.current.intelligence += 1;
    if (searchTimers.current.intelligence) window.clearTimeout(searchTimers.current.intelligence);
    setIntelligenceQuery(event.target.value);
    setIntelligenceResults([]);
    setSearchLoading(false);
  };
  const logout = async () => {
    try { await request("/auth/logout", {method: "POST"}); }
    catch (error) { console.warn("Logout audit could not be recorded:", error.message); }
    finally { localStorage.removeItem(tokenKey); setUser(null); setShowAuth(true); }
  };
  const loadFeature = async (kind) => {
    try {
      if (kind === "public") {
        const resources = await request(`/public/legal-resources?refresh=${Date.now()}`);
        setFeatureData(current => ({...current, public: resources}));
        notify("Public services refreshed");
        return;
      }
      const path = kind === "cases" ? "/secure/overview" : kind === "collaboration" ? "/notifications" : kind === "admin" ? "/admin/overview" : "/capabilities";
      const payload = kind === "settings"
        ? {capabilities: await request("/capabilities"), storage: await request("/integrations/cloud"), profile: await request("/auth/me")}
        : await request(path);
      setFeatureData(current => ({...current, [kind]: payload}));
    } catch (error) { notify(error.message); }
  };

  if (booting) return <LoadingScreen />;

  return <div className="min-h-screen overflow-x-hidden">
    <div className="fixed inset-0 pointer-events-none grid-noise opacity-30" />
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 sm:px-5 sm:py-4 lg:px-10">
        <div className="flex min-w-0 items-center gap-3"><div className="brand-mark shrink-0"><img src="/static/lexora-logo.png" alt="NyayVault logo" /></div><div className="min-w-0"><div className="font-black tracking-tight">Nyay<span className="text-mint">Vault</span></div><div className="hidden text-[10px] uppercase tracking-[.24em] text-slate-500 sm:block">Secure case intelligence</div></div></div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-400 lg:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-green-400 shadow-[0_0_12px_#4ade80]"/> All systems operational</div>
        <div className="flex shrink-0 items-center gap-2"><button aria-label="Toggle color theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="theme-toggle rounded-xl border border-white/10 p-2 text-slate-400 transition hover:border-mint/40 hover:text-mint">{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button><button onClick={() => setMobileNav(!mobileNav)} className="rounded-lg border border-white/10 p-2 lg:hidden"><Menu size={18}/></button><div className="hidden text-right sm:block"><div className="text-sm font-semibold">{user?.full_name || "Secure workspace"}</div><div className="text-xs text-slate-500">{user?.role || "authentication required"}</div></div><button onClick={logout} className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:border-red-300/40 hover:text-red-300"><LogOut size={17}/></button></div>
      </div>
    </header>
    <div className="mx-auto flex max-w-[1500px]">
      <aside className={`${mobileNav ? "fixed inset-x-4 top-20 z-20" : "hidden"} max-h-[calc(100vh-6rem)] w-64 shrink-0 overflow-y-auto rounded-2xl border border-white/10 bg-panel p-3 shadow-2xl lg:sticky lg:top-24 lg:block lg:h-[calc(100vh-7rem)] lg:max-h-none lg:overflow-visible lg:border-0 lg:bg-transparent lg:shadow-none`}>
        <div className="mb-7 px-3 pt-3 text-[10px] font-bold uppercase tracking-[.22em] text-slate-500">Workspace</div>
        <div className="workspace-nav space-y-1">{nav.map(({id,label,icon: Icon}) => <button key={id} onClick={() => {if (id === "document-viewer") setSelectedDocument(null); setView(id); setMobileNav(false)}} className={`workspace-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${view === id ? "bg-mint font-semibold text-ink shadow-lg shadow-mint/10" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon size={17}/>{label}{view === id && <ChevronRight size={15} className="ml-auto"/>}</button>)}</div>
        <div className="mt-8 rounded-2xl border border-mint/20 bg-mint/[.06] p-4"><Sparkles size={18} className="mb-3 text-mint"/><div className="text-sm font-semibold">Evidence shield</div><p className="mt-1 text-xs leading-5 text-slate-400">Files are encrypted, signed and hash-verified before release.</p><div className="mt-4 flex items-center gap-2 text-xs text-mint"><CheckCircle2 size={14}/> Protected by design</div></div>
      </aside>
      <main className="animate-reveal relative min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        {view === "overview" && <Overview data={data} onUpload={() => setShowUpload(true)} onCreateCase={() => setShowCreateCase(true)} setView={setView}/>}
        {view === "documents" && <Documents documents={documents} query={documentQuery} onSearch={documentSearch} runSearch={(value, type = documentType, filters = documentFilters) => runSearch("documents", value, type, filters)} filters={documentFilters} setFilters={setDocumentFilters} onUpload={() => setShowUpload(true)} onOpenDocument={(document) => { setSelectedDocument(document); setView("document-viewer"); }} searchResults={documentResults} searchType={documentType} setSearchType={setDocumentType} searchLoading={searchLoading}/>}
        {view === "document-viewer" && <DocumentViewer document={selectedDocument} onBack={() => setView("documents")} onReset={() => setSelectedDocument(null)} onUpload={() => setShowUpload(true)}/>}
        {view === "intelligence" && <Intelligence query={intelligenceQuery} onSearch={intelligenceSearch} runSearch={(value, type = intelligenceType) => runSearch("intelligence", value, type)} results={intelligenceResults} searchType={intelligenceType} setSearchType={setIntelligenceType} searchLoading={searchLoading}/>}
        {view === "audit" && <Audit data={data} notify={notify} refresh={refresh}/>}
        {view === "database" && <SystemPage kind="database" system={system}/>}
        {view === "docker" && <SystemPage kind="docker" system={system}/>}
        {view === "scripts" && <SystemPage kind="scripts" system={system}/>}
        {view === "cases" && <CaseWorkspace notify={notify}/>}
        {["collaboration", "public", "admin", "settings"].includes(view) && <FeatureHub kind={view} data={featureData[view]} load={() => loadFeature(view)} user={user} notify={notify}/>}
      </main>
    </div>
    {showAuth && <Auth onDone={() => {setShowAuth(false);refresh()}} notify={notify}/>}
    {showUpload && <Upload onClose={() => setShowUpload(false)} onDone={() => {setShowUpload(false);refresh();notify("Document encrypted and secured")}}/>}
    {showCreateCase && <CreateCase onClose={() => setShowCreateCase(false)} onDone={() => {setShowCreateCase(false);refresh();notify("Case workspace created")}}/>}
    {toast && <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-mint/30 bg-panel px-4 py-3 text-sm shadow-2xl"><CheckCircle2 size={16} className="text-mint"/>{toast}</div>}
  </div>;
}

const DEMO_CASES = [
  {
    id: "demo-142", case_number: "CASE-2026-0142", fir_number: "FIR-2026-0142",
    title: "Cyber Harassment Inquiry", status: "investigation",
    police_station: "Central Cyber Crime Unit", sensitivity: "highly_sensitive", document_count: 4,
    investigating_officer: {name: "Aarav Mehta", role: "investigator"},
    timeline: [
      {id: "demo-142-1", event_type: "fir_registered", notes: "Complaint registered and initial digital evidence preserved.", event_at: "2026-02-14T09:30:00"},
      {id: "demo-142-2", event_type: "investigation_started", notes: "Investigation assigned to the cyber crime response team.", event_at: "2026-02-15T11:00:00"},
      {id: "demo-142-3", event_type: "evidence_collected", notes: "Device image and platform records logged under chain of custody.", event_at: "2026-02-16T15:20:00"},
    ],
    team: [
      {user_id: "demo-officer", name: "Aarav Mehta", department: "Investigations", role: "investigator", access_level: "owner"},
      {user_id: "demo-forensics", name: "Mira Shah", department: "Forensic Lab", role: "forensic_officer", access_level: "contributor"},
    ],
    documents: [],
  },
  {
    id: "demo-138", case_number: "CASE-2026-0138", fir_number: "FIR-2026-0138",
    title: "Digital Evidence Chain Review", status: "court_filing",
    police_station: "North District Investigation Bureau", sensitivity: "confidential", document_count: 7,
    investigating_officer: {name: "Nisha Rao", role: "investigator"},
    timeline: [
      {id: "demo-138-1", event_type: "fir_registered", notes: "Investigation record opened after a financial fraud complaint.", event_at: "2026-01-28T10:15:00"},
      {id: "demo-138-2", event_type: "evidence_collected", notes: "Forensic team completed hash verification of seized media.", event_at: "2026-02-03T13:45:00"},
      {id: "demo-138-3", event_type: "charge_sheet_prepared", notes: "Charge-sheet review package prepared for prosecution.", event_at: "2026-02-19T16:10:00"},
      {id: "demo-138-4", event_type: "court_filing", notes: "Filing bundle marked ready for authorized court submission.", event_at: "2026-02-24T12:00:00"},
    ],
    team: [
      {user_id: "demo-prosecution", name: "Dev Menon", department: "Prosecution", role: "prosecutor", access_level: "approver"},
      {user_id: "demo-court", name: "Court Registry", department: "Judicial Services", role: "court_officer", access_level: "viewer"},
    ],
    documents: [],
  },
  {
    id: "demo-119", case_number: "CASE-2026-0119", fir_number: "FIR-2026-0119",
    title: "Digital Fraud Complaint", status: "active",
    police_station: "East District Economic Offences Wing", sensitivity: "restricted", document_count: 3,
    investigating_officer: {name: "Kabir Iyer", role: "investigator"},
    timeline: [
      {id: "demo-119-1", event_type: "fir_registered", notes: "Complaint accepted and case identity verified.", event_at: "2026-02-08T08:45:00"},
      {id: "demo-119-2", event_type: "investigation_started", notes: "Transaction trail review and witness scheduling initiated.", event_at: "2026-02-10T14:30:00"},
    ],
    team: [
      {user_id: "demo-economic", name: "Kabir Iyer", department: "Economic Offences Wing", role: "investigator", access_level: "owner"},
    ],
    documents: [],
  },
];

function CaseWorkspace({notify}) {
  const [cases, setCases] = useState(DEMO_CASES);
  const [selected, setSelected] = useState(DEMO_CASES[0].id);
  const [detail, setDetail] = useState(DEMO_CASES[0]);
  const [question, setQuestion] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [publicStatus, setPublicStatus] = useState(null);
  const [eventType, setEventType] = useState("evidence_collected");
  const [eventNotes, setEventNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const seedAttempted = useRef(false);
  const [collaborator, setCollaborator] = useState({user_id:"", department:"Forensic Lab", access_level:"contributor"});
  const loadCases = async (allowDemoSeed = true) => {
    try {
      const result = await request(`/cases/workspace?refresh=${Date.now()}`);
      if (result.length) {
        setCases(result);
        if (!selected || String(selected).startsWith("demo-")) setSelected(String(result[0].id));
      }
      if (!result.length && allowDemoSeed && !seedAttempted.current) {
        seedAttempted.current = true;
        setSeeding(true);
        try {
          await request("/cases/demo-seed", {method:"POST"});
          const seededCases = await request(`/cases/workspace?refresh=${Date.now()}`);
          if (seededCases.length) {
            setCases(seededCases);
            setSelected(String(seededCases[0].id));
          }
          notify("Case workspace records loaded");
        } catch (seedError) {
          notify(seedError.message);
        } finally {
          setSeeding(false);
        }
        return seededCases;
      }
      return result;
    } catch (error) {
      setCases(DEMO_CASES);
      setSelected(current => current || DEMO_CASES[0].id);
      notify("Showing illustrative case records");
      return DEMO_CASES;
    }
  };
  const loadDetail = async (caseId) => {
    if (!caseId) return;
    try { setDetail(await request(`/cases/${caseId}?refresh=${Date.now()}`)); }
    catch (error) {
      const demo = DEMO_CASES.find(item => String(item.id) === String(caseId));
      if (demo) setDetail(demo);
      else notify(error.message);
    }
  };
  const loadDemoCases = async () => {
    if (seeding) return;
    seedAttempted.current = true;
    setSeeding(true);
    try {
      const result = await request("/cases/demo-seed", {method:"POST"});
      await loadCases(false);
      notify(`${result.created} illustrative case records added`);
    } catch (error) { notify(error.message); } finally { setSeeding(false); }
  };
  const refreshCaseWorkspace = async () => {
    if (refreshing || seeding) return;
    setRefreshing(true);
    try {
      const refreshedCases = await loadCases(false);
      const selectedCase = refreshedCases.find(item => String(item.id) === String(selected)) || refreshedCases[0];
      if (selectedCase) {
        setSelected(String(selectedCase.id));
        await loadDetail(selectedCase.id);
      }
      setRefreshedAt(new Date());
      notify("Case workspace refreshed");
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => { loadCases(); }, []);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected]);
  useEffect(() => { setPublicStatus(null); }, [selected]);
  const addEvent = async () => {
    if (!eventNotes.trim()) return;
    setBusy(true);
    try {
      await request(`/cases/${selected}/events`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({event_type:eventType, notes:eventNotes})});
      setEventNotes(""); await loadDetail(selected); notify("Case timeline updated");
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const addTeamMember = async () => {
    if (busy) return;
    const userId = Number.parseInt(String(collaborator.user_id).trim(), 10);
    if (!Number.isInteger(userId) || userId < 1) {
      notify("Enter a valid authorized user ID");
      return;
    }
    if (String(selected).startsWith("demo-")) {
      notify("Refresh the case workspace before adding a collaborator");
      return;
    }
    if (!collaborator.department.trim()) {
      notify("Enter a department");
      return;
    }
    setBusy(true);
    try {
      await request(`/cases/${selected}/collaborators`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...collaborator, user_id:userId, department:collaborator.department.trim()})});
      setCollaborator({...collaborator, user_id:""}); await loadDetail(selected); notify("Controlled collaborator added");
    } catch (error) { notify(`Unable to add collaborator: ${error.message}`); }
    finally { setBusy(false); }
  };
  const askCase = async () => {
    if (!question.trim() || !detail) return;
    try {
      const result = await request("/ai/assistant", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({question, document_ids:detail.documents.map(item => item.id), language:"English", plain_language:false})});
      setAiResult(result);
    } catch (error) { notify(error.message); }
  };
  const publishPublicStatus = async () => {
    try {
      setPublicStatus(await request(`/cases/${selected}/publish-public-status`, {method:"POST"}));
      notify("Approved public status snapshot published");
    } catch (error) { notify(error.message); }
  };
  const selectedSummary = cases.find(item => String(item.id) === String(selected));
  const nextMilestone = detail?.status === "investigation"
    ? "Complete investigation and prepare the evidence package"
    : detail?.status === "court_filing"
      ? "Confirm filing bundle and court registry acceptance"
      : detail?.status === "active"
        ? "Review evidence and confirm the next case event"
        : "Review the case status with the authorized team";
  const latestEvent = detail?.timeline?.[detail.timeline.length - 1];
  return <><PageTitle eyebrow="CASE DETAILS" title="Case workspaces" subtitle="Review authorized case records, chronology, team access and grounded case intelligence." action={<div className="flex flex-col items-end gap-2"><button onClick={refreshCaseWorkspace} disabled={seeding || refreshing} className="rounded-xl border border-mint/25 px-4 py-2.5 text-sm font-semibold text-mint disabled:cursor-wait disabled:opacity-50">{refreshing ? "Refreshing..." : seeding ? "Loading…" : "Refresh"}</button>{refreshedAt && <span className="text-[10px] text-slate-500">Updated {formatExactDateTime(refreshedAt)}</span>}</div>}/>
    <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
      <section className="rounded-2xl border border-white/10 bg-panel/70 p-5"><div className="mb-4 flex items-center justify-between gap-3"><div className="text-xs font-bold uppercase tracking-widest text-slate-500">Authorized case list</div><span className="rounded-full bg-mint/10 px-2 py-1 text-[10px] text-mint">{cases.length} cases · workspace ready</span></div><div className="space-y-2">{cases.map(item => <button key={item.id} onClick={() => setSelected(String(item.id))} className={`w-full rounded-xl border p-4 text-left transition ${String(item.id) === String(selected) ? "border-mint/40 bg-mint/10" : "border-white/5 bg-white/[.03] hover:border-white/20"}`}><div className="flex items-center justify-between"><span className="font-mono text-xs text-electric">{item.case_number}</span><span className="text-[10px] uppercase text-mint">{item.status.replaceAll("_"," ")}</span></div><div className="mt-2 text-sm font-semibold">{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.fir_number || "No FIR number"} · {item.documents ?? item.document_count ?? 0} protected records</div></button>)}</div><div className="mt-4 border-t border-white/5 pt-3 text-[10px] uppercase tracking-widest text-slate-600">Illustrative case records · secure API sync enabled</div></section>
      <section className="space-y-5">{detail ? <><div className="rounded-2xl border border-white/10 bg-panel/70 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono text-xs text-electric">{detail.case_number}</div><h2 className="mt-2 text-2xl font-black">{detail.title}</h2><p className="mt-1 text-sm text-slate-400">{detail.fir_number || "FIR not recorded"} · {detail.police_station || "Police station not recorded"}</p></div><span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-bold uppercase text-mint">{detail.status.replaceAll("_"," ")}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-white/[.03] p-3"><div className="text-[10px] uppercase text-slate-500">Investigating officer</div><div className="mt-1 text-sm font-semibold">{detail.investigating_officer?.name || "Not assigned"}</div><div className="mt-1 text-[10px] text-slate-500">{detail.investigating_officer?.role?.replaceAll("_"," ") || "Team pending"}</div></div><div className="rounded-xl bg-white/[.03] p-3"><div className="text-[10px] uppercase text-slate-500">Sensitivity</div><div className="mt-1 text-sm font-semibold text-amber-300">{detail.sensitivity.replaceAll("_"," ")}</div><div className="mt-1 text-[10px] text-slate-500">Access-controlled workspace</div></div><div className="rounded-xl bg-white/[.03] p-3"><div className="text-[10px] uppercase text-slate-500">Protected records</div><div className="mt-1 text-sm font-semibold text-mint">{detail.documents.length}</div><div className="mt-1 text-[10px] text-slate-500">{detail.timeline.length} timeline events</div></div><div className="rounded-xl bg-white/[.03] p-3"><div className="text-[10px] uppercase text-slate-500">Team access</div><div className="mt-1 text-sm font-semibold text-electric">{detail.team.length} members</div><div className="mt-1 text-[10px] text-slate-500">Controlled collaboration</div></div></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-electric/20 bg-electric/5 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-electric">Next recommended milestone</div><p className="mt-2 text-sm leading-5 text-slate-200">{nextMilestone}</p></div><div className="rounded-2xl border border-white/10 bg-panel/70 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Latest verified event</div><p className="mt-2 text-sm font-semibold text-slate-200">{latestEvent?.event_type?.replaceAll("_"," ") || "No event recorded"}</p><p className="mt-1 text-[11px] text-slate-500">{latestEvent?.event_at ? formatExactDateTime(latestEvent.event_at) : "Awaiting update"}</p></div><div className="rounded-2xl border border-white/10 bg-panel/70 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Workspace dates</div><p className="mt-2 text-[11px] text-slate-400">Created: {detail.created_at ? formatExactDateTime(detail.created_at) : "Not available"}</p><p className="mt-1 text-[11px] text-slate-400">Updated: {detail.updated_at ? formatExactDateTime(detail.updated_at) : "Not available"}</p></div></div>
        <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-white/10 bg-panel/70 p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Case timeline</h3><p className="mt-1 text-xs text-slate-500">FIR registration through judgment</p></div><Activity size={17} className="text-mint"/></div><div className="space-y-3">{detail.timeline.map(item => <div key={item.id} className="flex gap-3"><div className="mt-1 h-2 w-2 rounded-full bg-mint shadow-[0_0_8px_#5ff0c1]"/><div><div className="text-sm font-semibold">{item.event_type.replaceAll("_"," ")}</div><div className="text-xs text-slate-400">{item.notes}</div><div className="mt-1 text-[10px] text-slate-600">{item.event_at ? new Date(item.event_at).toLocaleString() : "now"}</div></div></div>)}</div><div className="mt-4 border-t border-white/5 pt-4"><select value={eventType} onChange={event => setEventType(event.target.value)} className="mb-2 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-xs"><option value="fir_registered">FIR registered</option><option value="investigation_started">Investigation started</option><option value="evidence_collected">Evidence collected</option><option value="charge_sheet_prepared">Charge sheet prepared</option><option value="court_filing">Court filing</option><option value="judgment">Judgment</option></select><textarea value={eventNotes} onChange={event => setEventNotes(event.target.value)} placeholder="Add a verified case event note…" className="w-full rounded-lg border border-white/10 bg-ink p-3 text-xs" rows="2"/><button onClick={addEvent} disabled={busy} className="mt-2 rounded-lg bg-mint px-3 py-2 text-xs font-bold text-ink">Add timeline event</button></div></section>
        <section className="rounded-2xl border border-white/10 bg-panel/70 p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Case team</h3><p className="mt-1 text-xs text-slate-500">Controlled inter-agency access</p></div><Users size={17} className="text-electric"/></div><div className="space-y-2">{detail.team.map(member => <div key={`${member.user_id}-${member.department}`} className="flex items-center justify-between rounded-xl bg-white/[.03] p-3"><div><div className="text-sm font-semibold">{member.name}</div><div className="text-xs text-slate-500">{member.department} · {member.role}</div></div><span className="text-[10px] uppercase text-mint">{member.access_level}</span></div>)}</div><div className="mt-4 border-t border-white/5 pt-4"><input value={collaborator.user_id} onChange={event => setCollaborator({...collaborator,user_id:event.target.value})} placeholder="Authorized user ID" inputMode="numeric" className="mb-2 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-xs"/><div className="grid grid-cols-2 gap-2"><input value={collaborator.department} onChange={event => setCollaborator({...collaborator,department:event.target.value})} placeholder="Department" className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-xs"/><select value={collaborator.access_level} onChange={event => setCollaborator({...collaborator,access_level:event.target.value})} className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-xs"><option value="viewer">Viewer</option><option value="contributor">Contributor</option><option value="approver">Approver</option></select></div><button onClick={addTeamMember} disabled={busy} className="mt-2 rounded-lg border border-electric/25 px-3 py-2 text-xs font-semibold text-electric disabled:cursor-wait disabled:opacity-50">{busy ? "Adding..." : "Add collaborator"}</button></div></section></div>
        <section className="rounded-2xl border border-electric/20 bg-electric/5 p-5"><div className="mb-3 flex items-center gap-2"><BrainCircuit size={17} className="text-electric"/><div><h3 className="font-bold">Case-specific Ask</h3><p className="text-xs text-slate-500">Answers are limited to this case’s authorized documents.</p></div></div><div className="flex gap-2"><input value={question} onChange={event => setQuestion(event.target.value)} placeholder={`Ask about ${selectedSummary?.case_number || "this case"}…`} className="flex-1 rounded-lg border border-white/10 bg-ink px-3 py-3 text-sm"/><button onClick={askCase} className="rounded-lg bg-electric px-4 py-2 text-xs font-bold text-ink">Ask</button></div>{aiResult && <div className="mt-4 rounded-xl border border-white/10 bg-panel/80 p-4 text-sm"><p className="leading-6 text-slate-300">{aiResult.answer}</p><div className="mt-3 text-xs text-slate-500">{aiResult.sources?.length || 0} authorized source(s) · {aiResult.verified ? "verified against retrieved records" : "human review required"}</div></div>}<div className="mt-5 border-t border-white/10 pt-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold text-slate-300">Public status exchange</div><div className="text-[11px] text-slate-500">Publishes a safe snapshot only; the public tier never reads the secure repository.</div></div><button onClick={publishPublicStatus} className="rounded-lg border border-mint/25 px-3 py-2 text-xs font-semibold text-mint">Publish approved status</button></div>{publicStatus && <div className="mt-3 rounded-lg bg-mint/5 p-3 text-xs text-mint">Verification code: <span className="font-mono font-bold">{publicStatus.verification_code}</span> · Share this code with the authorized complainant.</div>}</div></section></> : <div className="rounded-2xl border border-white/10 bg-panel/70 p-10 text-center text-sm text-slate-500">Select an authorized case to open its workspace.</div>}</section>
    </div></>;
}

function FeatureHub({kind, data, load, user, notify}) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [audience, setAudience] = useState("citizen");
  const [publicMode, setPublicMode] = useState("question");
  const [trackCode, setTrackCode] = useState("");
  const [trackCase, setTrackCase] = useState("");
  const [publicFile, setPublicFile] = useState(null);
  const publicFileInput = useRef();
  const config = {
    cases: ["MY CASES", "Case workspaces", "Case overview, team access and timeline are available in one controlled workspace."],
    collaboration: ["COLLABORATION", "Authorized collaboration", "Track pending actions, notifications and controlled inter-department access."],
    public: ["PUBLIC ASK NYAI", "Legal assistance", "Public help is isolated from confidential investigation repositories."],
    admin: ["ADMINISTRATION", "System administration", "Users, roles, departments, security events and integrity records."],
    settings: ["SETTINGS", "Security settings", "Review capability status, MFA readiness, storage and deployment controls."],
  }[kind];
  if (kind === "public") return <PublicAskNyAI load={load} notify={notify}/>;
  const workspaceSummary = {
    cases: {stats: [["Active cases", "12", "3 updated today"], ["Pending actions", "08", "Across 4 departments"], ["Protected records", "284", "100% integrity checked"]], rows: [
      ["CASE-2026-0142", "Cyber harassment inquiry", "Investigation", "High"],
      ["CASE-2026-0138", "Evidence chain review", "Court filing", "Medium"],
      ["CASE-2026-0119", "Digital fraud complaint", "Charge sheet", "High"],
    ]},
    collaboration: {stats: [["Team members", "24", "Across 6 departments"], ["Pending approvals", "07", "2 due today"], ["Unread alerts", "03", "Requires review"]], rows: [
      ["Forensic Lab", "DNA report v3", "Awaiting approval", "Today"],
      ["Prosecution", "Charge sheet draft", "Shared securely", "Yesterday"],
      ["Court Registry", "Filing bundle", "Access granted", "2 days ago"],
    ]},
    public: {stats: [["Legal resources", "48", "Verified public guides"], ["Complaint drafts", "16", "Current workspace"], ["Case lookups", "31", "No private data exposed"]], rows: [
      ["Ask", "General legal guidance", "Available", "Public tier"],
      ["Complaint drafting", "Editable guided template", "Available", "Public tier"],
      ["Case tracking", "Verified case identifier", "Available", "Limited status"],
    ]},
    admin: {stats: [["Active users", "36", "4 roles configured"], ["Security events", "128", "Last 30 days"], ["Integrity anchors", "84", "Blockchain-ready records"]], rows: [
      ["RBAC policy", "Role permissions", "Operational", "System"],
      ["MFA coverage", "Privileged accounts", "92%", "Security"],
      ["Storage", "Encrypted object store", "Healthy", "Infrastructure"],
    ]},
    settings: {stats: [["Encryption", "AES-256", "Protected at rest"], ["Authentication", "JWT + MFA", "Role-aware access"], ["Storage", "Local / R2", "Cloud-ready"]], rows: [
      ["Document signatures", "Ed25519 verification", "Enabled", "Integrity"],
      ["OCR pipeline", "Tesseract-ready", "Available", "Intelligence"],
      ["Semantic search", "Vector retrieval", "Available", PRODUCT_NAME],
    ]},
  }[kind];
  const display = kind === "public" ? workspaceSummary : data || workspaceSummary;
  const action = async (path, body) => {
    try { setResult(await request(path, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)})); }
    catch (error) { notify(error.message); }
  };
  const setupMfa = async () => {
    try { setResult(await request("/auth/mfa/setup", {method: "POST"})); notify("MFA setup secret generated"); }
    catch (error) { notify(error.message); }
  };
  const createBackup = async () => {
    try { setResult(await request("/backups", {method: "POST"})); notify("Backup created successfully"); }
    catch (error) { notify(error.message); }
  };
  return <><PageTitle eyebrow={config[0]} title={config[1]} subtitle={config[2]} action={<button onClick={load} className="rounded-xl border border-mint/25 px-4 py-2.5 text-sm font-semibold text-mint">Refresh</button>}/>
    <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <section className="rounded-2xl border border-white/10 bg-panel/70 p-6">
        <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-mint/10 p-3 text-mint">{kind === "public" ? <Globe2 size={20}/> : kind === "admin" ? <ShieldAlert size={20}/> : <BriefcaseBusiness size={20}/>}</div><div><h2 className="font-bold">{config[1]}</h2><p className="text-xs text-slate-500">Workspace controls are connected to the secure API.</p></div></div>
        <div className="mb-4 rounded-lg border border-mint/15 bg-mint/5 px-3 py-2 text-[11px] text-mint">{data && kind !== "public" ? "LIVE CONNECTED DATA" : "WORKSPACE OVERVIEW · AVAILABLE DATA"}</div>
        {display?.stats && <div className="grid gap-3 sm:grid-cols-3">{display.stats.map(([label, value, detail]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-xs font-semibold text-slate-300">{label}</div><div className="mt-1 text-[11px] text-slate-500">{detail}</div></div>)}</div>}
        {display?.rows && <div className="mt-5 overflow-hidden rounded-xl border border-white/10"><div className="grid grid-cols-4 gap-3 bg-white/[.04] px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500"><span>Area</span><span>Item</span><span>Status</span><span>Scope</span></div>{display.rows.map(row => <div key={row.join("-")} className="grid grid-cols-4 gap-3 border-t border-white/5 px-4 py-3 text-xs text-slate-300"><span className="truncate font-semibold">{row[0]}</span><span className="truncate">{row[1]}</span><span className="text-mint">{row[2]}</span><span className="text-slate-500">{row[3]}</span></div>)}</div>}
        {data && kind === "cases" && <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Secure role</div><div className="text-lg font-bold text-mint">{data.role_label}</div><div className="mt-1 text-xs text-slate-500">{data.tier?.replace("_", " ")} tier · {data.assigned_cases} assigned cases · {data.authorized_documents} authorized documents</div></div>
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Role capabilities</div><div className="space-y-1 text-xs text-slate-300">{(data.capabilities || []).map(item => <div key={item} className="flex gap-2"><span className="text-mint">✓</span>{item}</div>)}</div></div>
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-4 sm:col-span-2"><div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Protected controls</div><div className="grid gap-2 sm:grid-cols-2">{(data.controls || []).map(item => <div key={item} className="rounded-lg bg-mint/5 px-3 py-2 text-xs text-slate-300">{item}</div>)}</div></div>
        </div>}
        {data && kind === "settings" && <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Capabilities</div><div className="space-y-1 text-xs text-slate-300">{Object.entries(data.capabilities || {}).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><span>{key.replaceAll("_", " ")}</span><span className={value ? "text-mint" : "text-amber-300"}>{value ? "Ready" : "Not configured"}</span></div>)}</div></div>
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Storage</div><div className="text-sm font-semibold text-slate-200">{data.storage?.active_provider || "local"}</div><div className="mt-1 text-xs text-slate-400">{data.storage?.message}</div><div className="mt-3 text-xs text-slate-500">{data.profile?.email}</div></div>
        </div>}
        {data && kind !== "settings" && <details className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-4"><summary className="cursor-pointer text-xs text-slate-400">View connected API payload</summary><pre className="mt-3 max-h-64 overflow-auto text-xs leading-6 text-slate-300">{JSON.stringify(data, null, 2)}</pre></details>}
        {result && <div className="mt-4 rounded-xl border border-mint/20 bg-mint/5 p-4 text-xs text-slate-300"><pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre></div>}
      </section>
      <section className="rounded-2xl border border-white/10 bg-panel/70 p-6">
        <h3 className="font-bold">Quick action</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Use the same controlled API surfaces used by the workspace.</p>
        {kind === "public" && <><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">{[["question", "Ask question"], ["complaint", "File complaint"], ["document", "Personal document"], ["track", "Track status"], ["resources", "Law library"]].map(([id, label]) => <button key={id} onClick={() => {setPublicMode(id); setResult(null);}} className={`rounded-lg border px-3 py-2 text-xs ${publicMode === id ? "border-electric bg-electric/10 text-electric" : "border-white/10 text-slate-400"}`}>{label}</button>)}</div>        {publicMode !== "track" && publicMode !== "resources" && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["citizen", "Citizen"], ["student", "Student"], ["lawyer", "Lawyer"], ["victim", "Victim / complainant"]].map(([id, label]) => <button key={id} onClick={() => setAudience(id)} className={`rounded-lg border px-3 py-2 text-xs ${audience === id ? "border-electric bg-electric/10 text-electric" : "border-white/10 text-slate-400"}`}>{label}</button>)}</div>}{publicMode === "question" && <><textarea value={input} onChange={event => setInput(event.target.value)} placeholder="Ask a general legal question. Try: What records should I preserve after an incident?" className="mt-4 min-h-28 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm outline-none"/><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => action("/public/legal-question", {question: input || "Explain my legal options", audience})} className="rounded-lg bg-electric px-3 py-2 text-xs font-bold text-ink">Ask NyAI</button><button onClick={() => action("/public/assistance", {question: input || "Guide me", audience})} className="rounded-lg border border-electric/25 px-3 py-2 text-xs text-electric">Plain-language guide</button></div></>}{publicMode === "complaint" && <><textarea value={input} onChange={event => setInput(event.target.value)} placeholder="Describe what happened, when, where and who was involved. Do not include confidential investigation records." className="mt-4 min-h-32 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm outline-none"/><button onClick={() => action("/public/complaint-draft", {facts: input || "My complaint facts", language: "English"})} className="mt-3 rounded-lg bg-mint px-3 py-2 text-xs font-bold text-ink">Create editable complaint</button></>}{publicMode === "document" && <><input ref={publicFileInput} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx" onChange={event => setPublicFile(event.target.files[0])}/><button onClick={() => publicFileInput.current.click()} className="mt-4 w-full rounded-xl border border-dashed border-mint/30 bg-mint/[.04] p-8 text-sm text-slate-300"><UploadCloud size={24} className="mx-auto mb-2 text-mint"/>{publicFile ? publicFile.name : "Choose a personal document for in-memory review"}</button><button disabled={!publicFile} onClick={async () => {const form = new FormData(); form.append("document", publicFile); try {setResult(await request("/public/personal-document/upload", {method:"POST", body:form}));} catch(error) {notify(error.message);}}} className="mt-3 rounded-lg border border-mint/25 px-3 py-2 text-xs font-semibold text-mint disabled:opacity-40">Review document securely</button><p className="mt-2 text-[11px] text-slate-500">Public uploads are not stored in the secure case repository.</p></>}{publicMode === "track" && <><input value={trackCase} onChange={event => setTrackCase(event.target.value)} placeholder="Case ID / case number" className="mt-4 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm"/><input value={trackCode} onChange={event => setTrackCode(event.target.value)} placeholder="Verification code supplied by the agency" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm"/><button onClick={() => action("/public/case-track", {case_number: trackCase || "CASE-2026-0142", verification_code: trackCode})} className="mt-3 rounded-lg bg-electric px-3 py-2 text-xs font-bold text-ink">View public status</button><p className="mt-2 text-[11px] text-slate-500">Only an agency-published status snapshot is queried; confidential documents remain private.</p></>}{publicMode === "resources" && <button onClick={async () => {try {setResult(await request("/public/legal-resources"));} catch(error) {notify(error.message);}}} className="mt-4 rounded-lg bg-electric px-3 py-2 text-xs font-bold text-ink">Open public law library</button>}{result && <div className="mt-5 rounded-xl border border-mint/20 bg-mint/5 p-4"><div className="mb-2 text-xs font-bold uppercase tracking-widest text-mint">Public result</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-300">{JSON.stringify(result, null, 2)}</pre></div>}</>}
        {kind === "cases" && <p className="mt-5 rounded-xl bg-white/[.03] p-4 text-xs text-slate-400">Case creation remains available through the secure API and existing upload workflow. Case-specific timelines and collaborators are retained with every case.</p>}
        {kind === "collaboration" && <p className="mt-5 rounded-xl bg-white/[.03] p-4 text-xs text-slate-400">Notifications, permissions, controlled sharing and collaborator records are audited for accountability.</p>}
        {kind === "admin" && <p className="mt-5 rounded-xl bg-white/[.03] p-4 text-xs text-slate-400">Administrator-only statistics include users, roles, security events and blockchain integrity records.</p>}
        {kind === "settings" && <div className="mt-5 space-y-3">
          <div className="rounded-xl bg-white/[.03] p-4 text-xs text-slate-400">Current signed-in role: <span className="font-semibold text-mint">{user?.role || "unknown"}</span>. Use the controls below to manage workspace security services.</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={setupMfa} className="rounded-lg border border-electric/25 px-3 py-2 text-xs font-semibold text-electric hover:bg-electric/10">Set up MFA</button>
            {user?.role === "admin" && <button onClick={createBackup} className="rounded-lg border border-mint/25 px-3 py-2 text-xs font-semibold text-mint hover:bg-mint/10">Create encrypted backup</button>}
          </div>
          {result?.secret && <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-200">Save this MFA secret for your authenticator: <span className="font-mono">{result.secret}</span></div>}
        </div>}
      </section>
    </div></>;
}

function PublicAskNyAI({load, notify}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const tabs = [
    ["assistant", "AI assistant", BrainCircuit],
    ["lawyers", "Find lawyers", Users],
    ["constitution", "Constitution", BookOpen],
    ["cases", "Case search", Search],
    ["call", "AI call bot", Phone],
    ["complaints", "Complaints", Flag],
    ["courts", "Find courts", MapPin],
    ["document", "Review document", FileText],
    ["track", "Track case", ShieldCheck],
    ["resources", "Law library", BookOpen],
  ];
  const lawyers = [
    {name:"Ananya Rao", type:"Private advocate", specialty:"Criminal law", city:"New Delhi", rating:4.9, fee:"₹2,500 - ₹7,500", available:"Today", languages:"English, Hindi"},
    {name:"Vikram Singh", type:"Legal aid counsel", specialty:"Consumer rights", city:"Gurugram", rating:4.7, fee:"Free / legal aid", available:"This week", languages:"Hindi, English"},
    {name:"Meera Iyer", type:"Private advocate", specialty:"Family law", city:"New Delhi", rating:4.8, fee:"₹1,500 - ₹5,000", available:"Tomorrow", languages:"English, Tamil, Hindi"},
    {name:"Arjun Malhotra", type:"Senior advocate", specialty:"Commercial law", city:"Noida", rating:4.6, fee:"₹5,000 - ₹15,000", available:"This week", languages:"English, Hindi"},
    {name:"Kavya Nair", type:"Private advocate", specialty:"Cyber law", city:"Bengaluru", rating:4.8, fee:"₹2,000 - ₹6,000", available:"Today", languages:"English, Malayalam, Hindi"},
    {name:"Rohan Deshpande", type:"Legal aid counsel", specialty:"Labour law", city:"Mumbai", rating:4.5, fee:"Free / legal aid", available:"This week", languages:"English, Marathi, Hindi"},
    {name:"Sara Khan", type:"Private advocate", specialty:"Property law", city:"Hyderabad", rating:4.7, fee:"₹2,500 - ₹8,000", available:"Tomorrow", languages:"English, Hindi, Urdu"},
    {name:"Nitin Kapoor", type:"Senior advocate", specialty:"Constitutional law", city:"New Delhi", rating:4.9, fee:"₹8,000 - ₹20,000", available:"Next week", languages:"English, Hindi"},
  ];
  const articles = [
    {id:"14", title:"Article 14 - Equality before law", part:"Part III · Fundamental Rights", text:"The State shall not deny to any person equality before the law or the equal protection of the laws within the territory of India."},
    {id:"19", title:"Article 19 - Freedom of speech", part:"Part III · Fundamental Rights", text:"All citizens shall have the right to freedom of speech and expression, subject to reasonable restrictions prescribed by law."},
    {id:"21", title:"Article 21 - Protection of life and personal liberty", part:"Part III · Fundamental Rights", text:"No person shall be deprived of his life or personal liberty except according to procedure established by law."},
    {id:"32", title:"Article 32 - Constitutional remedies", part:"Part III · Fundamental Rights", text:"The right to move the Supreme Court by appropriate proceedings for enforcement of fundamental rights is guaranteed."},
    {id:"15", title:"Article 15 - Prohibition of discrimination", part:"Part III · Fundamental Rights", text:"The State shall not discriminate against any citizen on grounds only of religion, race, caste, sex or place of birth."},
    {id:"16", title:"Article 16 - Equality of opportunity", part:"Part III · Fundamental Rights", text:"There shall be equality of opportunity for all citizens in matters relating to employment or appointment to any office under the State."},
    {id:"20", title:"Article 20 - Protection in criminal convictions", part:"Part III · Fundamental Rights", text:"No person shall be convicted except for violation of a law in force at the time of the act, nor be punished more than once for the same offence."},
    {id:"22", title:"Article 22 - Protection against arrest", part:"Part III · Fundamental Rights", text:"A person arrested must be informed of the grounds of arrest and produced before a magistrate within twenty-four hours."},
    {id:"25", title:"Article 25 - Freedom of conscience", part:"Part III · Fundamental Rights", text:"All persons are equally entitled to freedom of conscience and the right freely to profess, practise and propagate religion."},
    {id:"39A", title:"Article 39A - Equal justice and legal aid", part:"Part IV · Directive Principles", text:"The State shall ensure that opportunities for securing justice are not denied to any citizen by reason of economic or other disabilities."},
  ];
  const caseLaw = [
    {title:"Maneka Gandhi v. Union of India", court:"Supreme Court", year:"1978", topic:"Article 21 · Due process", summary:"Personal liberty and procedure established by law must be fair, just and reasonable."},
    {title:"Vishaka v. State of Rajasthan", court:"Supreme Court", year:"1997", topic:"Workplace safety", summary:"Laid down safeguards against sexual harassment at the workplace until legislation was enacted."},
    {title:"Puttaswamy v. Union of India", court:"Supreme Court", year:"2017", topic:"Right to privacy", summary:"Recognised privacy as a constitutionally protected fundamental right."},
    {title:"Kesavananda Bharati v. State of Kerala", court:"Supreme Court", year:"1973", topic:"Basic structure", summary:"Established that Parliament cannot alter the basic structure of the Constitution."},
    {title:"Shreya Singhal v. Union of India", court:"Supreme Court", year:"2015", topic:"Online speech", summary:"Struck down Section 66A of the Information Technology Act as unconstitutional."},
    {title:"Olga Tellis v. Bombay Municipal Corporation", court:"Supreme Court", year:"1985", topic:"Right to livelihood", summary:"Connected the right to livelihood with the protection of life under Article 21."},
    {title:"NALSA v. Union of India", court:"Supreme Court", year:"2014", topic:"Gender identity", summary:"Recognised constitutional protections and rights of transgender persons."},
    {title:"MC Mehta v. Union of India", court:"Supreme Court", year:"1987", topic:"Environmental law", summary:"Developed strict and absolute liability principles for hazardous industries."},
  ];
  const courts = [
    {name:"Supreme Court of India", type:"Supreme Court", city:"New Delhi", address:"Tilak Marg, New Delhi", distance:"4.2 km"},
    {name:"Delhi High Court", type:"High Court", city:"New Delhi", address:"Sher Shah Road, New Delhi", distance:"6.8 km"},
    {name:"Saket District Court", type:"District Court", city:"New Delhi", address:"Saket District Centre", distance:"9.1 km"},
    {name:"Gurugram Family Court", type:"Family Court", city:"Gurugram", address:"Civil Lines, Gurugram", distance:"22.4 km"},
    {name:"Tis Hazari District Court", type:"District Court", city:"New Delhi", address:"Chamber Road, Delhi", distance:"7.5 km"},
    {name:"National Consumer Disputes Commission", type:"Tribunal", city:"New Delhi", address:"A Wing, 5th Floor, Samrat Hotel", distance:"8.7 km"},
    {name:"Karkardooma District Court", type:"District Court", city:"New Delhi", address:"Shahdara, New Delhi", distance:"13.2 km"},
    {name:"Calcutta High Court", type:"High Court", city:"Kolkata, West Bengal", address:"3 Esplanade Row, Kolkata, West Bengal 700001", distance:"West Bengal"},
    {name:"City Civil Court, Kolkata", type:"City Civil Court", city:"Kolkata, West Bengal", address:"Kiran Shankar Roy Road, Kolkata, West Bengal 700001", distance:"West Bengal"},
    {name:"Alipore District and Sessions Court", type:"District Court", city:"Alipore, Kolkata, West Bengal", address:"18 Judges Court Road, Alipore, Kolkata, West Bengal 700027", distance:"West Bengal"},
    {name:"Bidhannagar District and Sessions Court", type:"District Court", city:"Bidhannagar, West Bengal", address:"DF Block, Sector 1, Bidhannagar, Kolkata, West Bengal 700064", distance:"West Bengal"},
    {name:"Howrah District Court", type:"District Court", city:"Howrah, West Bengal", address:"Howrah Court, Howrah, West Bengal 711101", distance:"West Bengal"},
    {name:"Siliguri District Court", type:"District Court", city:"Siliguri, West Bengal", address:"Court More, Siliguri, West Bengal 734001", distance:"West Bengal"},
    {name:"Durgapur Court", type:"District Court", city:"Durgapur, West Bengal", address:"City Centre, Durgapur, West Bengal 713216", distance:"West Bengal"},
    {name:"Asansol District Court", type:"District Court", city:"Asansol, West Bengal", address:"Court Compound, Asansol, West Bengal 713304", distance:"West Bengal"},
    {name:"Jalpaiguri District Court", type:"District Court", city:"Jalpaiguri, West Bengal", address:"Court Road, Jalpaiguri, West Bengal 735101", distance:"West Bengal"},
  ];
  const questionGuidance = [
    {category:"Immediate help", question:"What should I do after receiving a legal notice?", answer:"Read the notice carefully, note the deadline and identify who sent it. Do not ignore it or admit liability before getting advice. Preserve the envelope, attachments and proof of delivery.", steps:["Record the response deadline","Collect related agreements, messages and receipts","Ask a lawyer to review the notice before replying"]},
    {category:"Immediate help", question:"How can I file a complaint with the police?", answer:"Give the facts in date order, identify the people involved and attach available evidence. Ask for an acknowledgement or diary number. For an emergency, contact the local emergency service first.", steps:["Write a short factual timeline","Submit it at the appropriate police station or official portal","Keep the acknowledgement and follow-up date"]},
    {category:"Immediate help", question:"What evidence should I preserve after an incident?", answer:"Keep original files, screenshots with dates, medical records, receipts and witness details. Do not edit or repeatedly forward digital evidence. Store a backup and make a note of how and when it was collected.", steps:["Preserve originals and metadata","Create a dated evidence list","Share copies only with trusted authorities or counsel"]},
    {category:"Immediate help", question:"How do I check the status of a public case?", answer:"Use the official court or agency case-status portal with the case number, filing number or party name. Check the court and jurisdiction carefully because similar case numbers can exist.", steps:["Confirm the court and case number","Use the official government portal","Save the latest order or hearing date"]},
    {category:"Rights & safety", question:"What is the difference between bail and anticipatory bail?", answer:"Regular bail is generally sought after arrest or when a person is in custody. Anticipatory bail is advance protection requested when arrest is reasonably feared. The applicable test and conditions depend on the facts and current law.", steps:["Speak to a criminal-law lawyer promptly","Keep the FIR or complaint details ready","Follow every condition if relief is granted"]},
    {category:"Rights & safety", question:"How can I find free legal aid in my city?", answer:"Contact the District Legal Services Authority, State Legal Services Authority or an official legal-aid clinic. Eligibility can depend on income, vulnerability, gender, disability and the type of matter.", steps:["Carry identity and income or eligibility documents","Describe the issue and urgent deadlines","Ask for the assigned lawyer’s contact details"]},
    {category:"Rights & safety", question:"What documents are needed for a consumer complaint?", answer:"Keep the invoice, warranty, order confirmation, payment proof, communications with the seller and photographs or reports showing the defect. A clear timeline and the remedy requested make the complaint easier to assess.", steps:["Organise documents by date","Send a written complaint to the seller","Check the official consumer commission filing process"]},
    {category:"Rights & safety", question:"How do I respond to a cybercrime incident?", answer:"Secure the account, preserve messages and transaction records, and report promptly through the official cybercrime portal or local police. Do not pay an extortionist or delete the conversation before preserving it.", steps:["Change passwords and enable two-factor authentication","Contact your bank immediately for financial fraud","Report through cybercrime.gov.in or the appropriate authority"]},
    {category:"Rights & safety", question:"What are my rights when arrested?", answer:"Ask why you are being arrested, request that a family member or friend be informed, and seek legal representation. You should be produced before a magistrate within the legally required time. Do not sign documents you do not understand.", steps:["Stay calm and do not obstruct the process","Request a lawyer and medical examination where appropriate","Tell your lawyer about any urgent health or safety concern"]},
    {category:"Rights & safety", question:"How can I report online harassment?", answer:"Save the profile links, messages, timestamps and platform reports. Block or restrict the account after preserving evidence, and report serious threats, stalking or intimate-image abuse to the cybercrime portal or police.", steps:["Capture evidence without editing it","Use the platform’s report and safety tools","Escalate threats or immediate danger to authorities"]},
    {category:"Everyday law", question:"What is the process for filing an RTI application?", answer:"An RTI request should identify the public authority and ask specific records or information. Pay the prescribed fee unless exempt, submit it through the official channel and keep the acknowledgement.", steps:["Find the correct public information officer","Ask numbered, record-based questions","Track the response deadline and appeal if needed"]},
    {category:"Everyday law", question:"How do I register a rental agreement?", answer:"The process depends on the state, term and local rules. Check stamp duty, identity verification, police verification and registration requirements before signing. Both parties should retain the signed and registered copy.", steps:["Verify ownership and identity documents","Agree rent, deposit, repairs and notice terms in writing","Use the state registration portal or sub-registrar office"]},
    {category:"Everyday law", question:"What should I check before signing a contract?", answer:"Check the parties, scope, payment terms, deadlines, renewal, termination, liability, dispute forum and data-sharing clauses. Do not rely on verbal promises that are absent from the written contract.", steps:["Read every annexure and definition","Mark unclear or one-sided clauses","Obtain independent advice for high-value commitments"]},
    {category:"Everyday law", question:"How can I challenge an unfair bank charge?", answer:"First request the bank’s written explanation and the relevant tariff or agreement. Raise a formal complaint with the bank, keep the complaint number and escalate to the banking ombudsman or regulator if unresolved.", steps:["Collect statements and transaction references","Complain through the bank’s official grievance channel","Keep the response and escalation deadlines"]},
    {category:"Everyday law", question:"What is mediation and when should I use it?", answer:"Mediation is a voluntary, confidential process where a neutral mediator helps people explore a settlement. It can be useful when the parties need an efficient solution and are willing to negotiate.", steps:["Confirm that the dispute is suitable for settlement","Choose a neutral, qualified mediator","Record any settlement clearly and obtain legal review"]},
    {category:"Everyday law", question:"How do I protect my personal data online?", answer:"Use unique passwords, two-factor authentication and privacy settings. Share only necessary information, verify links and apps, and request correction or deletion through the organisation’s official privacy channel where applicable.", steps:["Review account sessions and app permissions","Avoid sending identity documents over informal channels","Report suspected misuse quickly"]},
    {category:"Family & work", question:"What are the basic steps in a divorce petition?", answer:"The correct process depends on the applicable personal law, grounds, residence and whether the matter is contested or mutual. Gather marriage, identity, residence and financial records and obtain advice before filing.", steps:["Confirm jurisdiction and applicable law","Prepare a complete asset, income and child-care picture","Discuss safety, maintenance and custody separately"]},
    {category:"Family & work", question:"How can I recover unpaid wages?", answer:"Collect the employment agreement, attendance, payslips, bank entries and written demands. Send a clear payment request and approach the labour authority or appropriate forum if the employer does not resolve the issue.", steps:["Calculate the amount and months outstanding","Make a written demand with a deadline","Check the limitation and local labour procedure"]},
    {category:"Family & work", question:"What should I do after a road accident?", answer:"Prioritise safety and medical care, call the police or emergency service, exchange required details and photograph the scene if safe. Notify the insurer promptly and do not make unsupported admissions about fault.", steps:["Get medical records and expense receipts","Record witnesses, vehicles and insurance details","Report the accident through the required channels"]},
    {category:"Family & work", question:"How can I verify a lawyer's credentials?", answer:"Ask for the lawyer’s full name, bar-enrolment details, office address, written fee terms and scope of work. Verify credentials through the relevant bar council or official directory and avoid paying into an unverified account.", steps:["Check enrolment and current contact details","Request a written engagement and receipt","Never share originals without a documented reason"]},
    {category:"Court process", question:"What is the limitation period for a civil claim?", answer:"There is no single limitation period: it depends on the claim, the event date, written acknowledgements and special statutes. A delay can permanently affect a remedy, so obtain advice as soon as possible.", steps:["Write down the key dates","Collect contracts, notices and acknowledgements","Ask counsel to calculate the applicable deadline"]},
    {category:"Family & work", question:"How do I file a domestic violence complaint?", answer:"If you are in immediate danger, contact emergency services or a trusted support person. You can approach the police, protection officer, legal-aid service or appropriate court for safety, residence, support and other relief.", steps:["Move to a safe place if necessary","Preserve medical records and threatening messages","Ask about protection orders and emergency support"]},
    {category:"Court process", question:"What is the difference between civil and criminal cases?", answer:"Civil cases generally seek remedies such as compensation, recovery or an injunction between parties. Criminal cases concern alleged offences prosecuted by the State and can involve investigation, trial and penalties. One incident may create both types of proceedings.", steps:["Identify the remedy you need","Preserve evidence and deadlines","Get advice before making admissions or signing settlements"]},
    {category:"Court process", question:"How can I obtain a certified court order?", answer:"Apply through the court’s copying section, e-court service or authorised filing channel using the case number and order date. Pay the prescribed fee and keep the application or receipt number for collection or download.", steps:["Confirm the exact order date and case number","Use only the court’s official service","Check that the certified copy is complete and legible"]},
  ];
  const questionBank = questionGuidance.map(item => item.question);
  const audienceQuestionMap = {
    citizen: new Set([
      questionBank[0], questionBank[1], questionBank[2], questionBank[3],
      questionBank[5], questionBank[6], questionBank[7], questionBank[8],
      questionBank[9], questionBank[10], questionBank[11], questionBank[12],
      questionBank[13], questionBank[14], questionBank[15], questionBank[18],
      questionBank[21], questionBank[22],
    ]),
    student: new Set([
      questionBank[2], questionBank[4], questionBank[5], questionBank[7],
      questionBank[9], questionBank[10], questionBank[12], questionBank[14],
      questionBank[15], questionBank[17], questionBank[19], questionBank[22],
      questionBank[23],
    ]),
    lawyer: new Set([
      questionBank[0], questionBank[3], questionBank[4], questionBank[5],
      questionBank[6], questionBank[10], questionBank[11], questionBank[12],
      questionBank[14], questionBank[16], questionBank[17], questionBank[18],
      questionBank[20], questionBank[22], questionBank[23],
    ]),
    victim: new Set([
      questionBank[1], questionBank[2], questionBank[3], questionBank[5],
      questionBank[6], questionBank[7], questionBank[8], questionBank[9],
      questionBank[17], questionBank[18], questionBank[20], questionBank[21],
      questionBank[22],
    ]),
  };
  const [tab, setTab] = useState("assistant");
  const [audience, setAudience] = useState("citizen");
  const [language, setLanguage] = useState("English");
  const [questionCategory, setQuestionCategory] = useState("Immediate help");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [publicError, setPublicError] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [lawyerQuery, setLawyerQuery] = useState("");
  const [lawyerType, setLawyerType] = useState("all");
  const [selectedLawyer, setSelectedLawyer] = useState(null);
  const [consultation, setConsultation] = useState({name:"", contact:"", preferredTime:"", matter:""});
  const [consultationSent, setConsultationSent] = useState(false);
  const [savedLawyers, setSavedLawyers] = useState(() => JSON.parse(localStorage.getItem("public_saved_lawyers") || "[]"));
  const [selectedArticle, setSelectedArticle] = useState("");
  const [articlePart, setArticlePart] = useState("all");
  const [bookmarks, setBookmarks] = useState(() => JSON.parse(localStorage.getItem("public_bookmarks") || "[]"));
  const [caseQuery, setCaseQuery] = useState("");
  const [courtQuery, setCourtQuery] = useState("");
  const [courtMapQuery, setCourtMapQuery] = useState("courts near New Delhi");
  const [courtLocation, setCourtLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [callRunning, setCallRunning] = useState(false);
  const [callTranscript, setCallTranscript] = useState([]);
  const [callLanguage, setCallLanguage] = useState("English");
  const [callerType, setCallerType] = useState("Citizen");
  const [libraryResources, setLibraryResources] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [complaint, setComplaint] = useState({name:"", category:"professional misconduct", facts:""});
  const [complaintSubmitted, setComplaintSubmitted] = useState(false);
  const [file, setFile] = useState(null);
  const [documentReviewBusy, setDocumentReviewBusy] = useState(false);
  const [track, setTrack] = useState({case_number:"", verification_code:""});
  const audienceQuestions = questionGuidance.filter(item => audienceQuestionMap[audience].has(item.question));
  const audienceCategories = [...new Set(audienceQuestions.map(item => item.category))];
  const visibleQuestions = audienceQuestions.filter(item => item.category === questionCategory);
  const changeAudience = (nextAudience) => {
    const nextQuestions = questionGuidance.filter(item => audienceQuestionMap[nextAudience].has(item.question));
    setAudience(nextAudience);
    setQuestionCategory(nextQuestions[0]?.category || "Immediate help");
    setQuestion("");
    setResult(null);
  };
  const publicAction = async (path, body) => {
    setPublicError("");
    try {
      const response = await request(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
      setResult(response);
      return response;
    } catch (error) {
      setPublicError(error.message);
      notify(error.message);
      return null;
    }
  };
  const reviewPublicDocument = async () => {
    if (!file || documentReviewBusy) return;
    setDocumentReviewBusy(true);
    setPublicError("");
    try {
      const form = new FormData();
      form.append("document", file);
      setResult(await request("/public/personal-document/upload", {method:"POST", body:form}));
    } catch (error) {
      setPublicError(error.message);
      notify(error.message);
    } finally {
      setDocumentReviewBusy(false);
    }
  };
  const loadLawLibrary = async () => {
    setLibraryLoading(true);
    setPublicError("");
    try {
      const response = await request(`/public/legal-resources?refresh=${Date.now()}`);
      setLibraryResources(response.resources || []);
    } catch (error) {
      setPublicError(error.message);
      notify(error.message);
    } finally {
      setLibraryLoading(false);
    }
  };
  const askPublicAssistant = async (mode = "question") => {
    const text = question.trim() || (mode === "guide" ? "Guide me" : "Explain my legal options");
    if (asking) return;
    setAsking(true);
    setChatMessages(current => [...current, {role:"user", text}]);
    try {
      const selectedGuidance = questionGuidance.find(item => item.question === text);
      let response = null;
      try {
        response = await request(mode === "guide" ? "/public/assistance" : "/public/legal-question", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({question:text, audience, language}),
        });
      } catch (error) {
        if (!selectedGuidance) {
          setPublicError(error.message);
          notify(error.message);
        }
      }
      if (!response && selectedGuidance) {
        response = {
          answer: selectedGuidance.answer,
          question: text,
          language,
          audience,
          next_steps: selectedGuidance.steps,
          offline_guidance: true,
        };
      }
      if (response?.answer) {
        const answer = selectedGuidance?.answer || response.answer;
        setChatMessages(current => [...current, {role:"assistant", text:answer}]);
        setResult({...response, answer, next_steps:selectedGuidance?.steps || []});
        setQuestion("");
      }
    } finally {
      setAsking(false);
    }
  };
  const filteredLawyers = lawyers.filter(item => (!lawyerQuery || `${item.name} ${item.specialty} ${item.city}`.toLowerCase().includes(lawyerQuery.toLowerCase())) && (lawyerType === "all" || item.type.toLowerCase().includes(lawyerType)));
  const articleParts = [...new Set(articles.map(item => item.part))];
  const filteredArticles = articles.filter(item => (articlePart === "all" || item.part === articlePart) && (!selectedArticle || item.id === selectedArticle));
  const filteredCases = caseLaw.filter(item => !caseQuery || `${item.title} ${item.topic} ${item.summary}`.toLowerCase().includes(caseQuery.toLowerCase()));
  const filteredCourts = courts.filter(item => !courtQuery || `${item.name} ${item.type} ${item.city} ${item.address}`.toLowerCase().includes(courtQuery.toLowerCase()));
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const mapQuery = courtMapQuery || courtQuery || "courts near New Delhi";
  const mapUrl = mapsApiKey
    ? `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(mapsApiKey)}&q=${encodeURIComponent(mapQuery)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
  const osmMapUrl = courtLocation
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${courtLocation.lng - 0.08}%2C${courtLocation.lat - 0.06}%2C${courtLocation.lng + 0.08}%2C${courtLocation.lat + 0.06}&layer=mapnik&marker=${courtLocation.lat}%2C${courtLocation.lng}`
    : "";
  const searchCourtLocation = async (searchOverride = "") => {
    const search = (searchOverride || courtQuery).trim();
    if (!search) {
      setLocationStatus("Enter a city, address or court name to search.");
      return;
    }
    setLocationBusy(true);
    setLocationStatus("Finding that location...");
    try {
      let places = [];
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(search)}`, {
          headers: {Accept: "application/json"},
        });
        if (response.ok) places = await response.json();
      } catch (error) {
        places = [];
      }
      if (!places.length) {
        const fallbackResponse = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(search)}`, {
          headers: {Accept: "application/json"},
        });
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          places = (fallbackData.features || []).map(item => ({
            lat: item.geometry?.coordinates?.[1],
            lon: item.geometry?.coordinates?.[0],
            display_name: [item.properties?.name, item.properties?.city, item.properties?.state, item.properties?.country].filter(Boolean).join(", "),
          }));
        }
      }
      if (!places.length) {
        setLocationStatus(`No map location was found for "${search}". Try a fuller address or city name.`);
        return;
      }
      const place = places[0];
      const location = {lat: Number(place.lat), lng: Number(place.lon)};
      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
        throw new Error("The location provider returned invalid coordinates");
      }
      setCourtLocation(location);
      setCourtMapQuery(place.display_name || search);
      setLocationStatus(`Showing map for ${place.display_name || search}.`);
    } catch (error) {
      setLocationStatus("Location search is temporarily unavailable. You can open the search directly in Google Maps.");
    } finally {
      setLocationBusy(false);
    }
  };
  const useApproximateNetworkLocation = async () => {
    setLocationBusy(true);
    setLocationStatus("Finding your approximate network location...");
    try {
      const response = await fetch("https://ipwho.is/");
      if (!response.ok) throw new Error("Network location lookup failed");
      const data = await response.json();
      if (!data.success || !Number.isFinite(Number(data.latitude)) || !Number.isFinite(Number(data.longitude))) {
        throw new Error("Network location was not available");
      }
      const location = {lat: Number(data.latitude), lng: Number(data.longitude)};
      setCourtLocation(location);
      setCourtQuery("");
      setCourtMapQuery(`${location.lat},${location.lng}`);
      setLocationStatus(`Showing approximate location near ${[data.city, data.region, data.country].filter(Boolean).join(", ")}. Enable device location for exact results.`);
    } catch (error) {
      setLocationStatus("Exact location is unavailable in this browser. Search a city or address to show it on the map.");
    } finally {
      setLocationBusy(false);
    }
  };
  const useCurrentLocation = () => {
    if (!window.isSecureContext) {
      setLocationStatus(`Location access requires a secure browser context. Open ${PRODUCT_NAME} at localhost or 127.0.0.1.`);
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("This browser does not provide location access.");
      return;
    }
    setLocationBusy(true);
    setLocationStatus("Requesting your location...");
    const applyLocation = position => {
      const location = {lat: position.coords.latitude, lng: position.coords.longitude};
      setCourtLocation(location);
      setCourtQuery("");
      setCourtMapQuery(`${location.lat},${location.lng}`);
      setLocationStatus("Location found. The map is centered on nearby courts.");
      setLocationBusy(false);
    };
    const handleError = error => {
      if (error.code === 3) {
        useApproximateNetworkLocation();
        return;
      }
      const messages = {
        1: "Location permission was denied. Allow location access in the browser address-bar settings and try again.",
        2: "Your location could not be determined. Check device location services and try again.",
      };
      if (error.code === 2) {
        useApproximateNetworkLocation();
      } else {
        setLocationStatus(messages[error.code] || "Unable to determine your location. Please try again.");
        setLocationBusy(false);
      }
    };
    navigator.geolocation.getCurrentPosition(applyLocation, handleError, {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000});
  };
  const toggleSavedLawyer = (name) => {
    const next = savedLawyers.includes(name) ? savedLawyers.filter(item => item !== name) : [...savedLawyers, name];
    setSavedLawyers(next); localStorage.setItem("public_saved_lawyers", JSON.stringify(next));
  };
  const toggleBookmark = (id) => {
    const next = bookmarks.includes(id) ? bookmarks.filter(item => item !== id) : [...bookmarks, id];
    setBookmarks(next); localStorage.setItem("public_bookmarks", JSON.stringify(next));
  };
  const submitConsultation = (event) => {
    event.preventDefault();
    if (!selectedLawyer || !consultation.name.trim() || !consultation.contact.trim() || !consultation.preferredTime) return;
    const request = {
      lawyer: selectedLawyer.name,
      specialty: selectedLawyer.specialty,
      ...consultation,
      createdAt: new Date().toISOString(),
    };
    const requests = JSON.parse(localStorage.getItem("public_consultation_requests") || "[]");
    localStorage.setItem("public_consultation_requests", JSON.stringify([request, ...requests].slice(0, 10)));
    setConsultationSent(true);
  };
  const simulateCall = () => {
    setCallRunning(true); setCallTranscript([`Connecting ${callerType.toLowerCase()} in ${callLanguage}…`, `Welcome to Public ${PRODUCT_NAME}. How can we help today?`, `${callerType}: I need help understanding how to preserve evidence.`, `${PRODUCT_NAME}: Keep originals, note dates and avoid altering the files.`, "Call classified: evidence-preservation guidance."]);
    window.setTimeout(() => setCallRunning(false), 2200);
  };
  const updateComplaint = (key, value) => setComplaint(current => ({...current, [key]:value}));
  const renderResult = result && <div aria-live="polite" className="mt-5 rounded-2xl border border-mint/20 bg-mint/5 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-bold uppercase tracking-widest text-mint">{PRODUCT_NAME} answer</div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-400">{result.language || language} · general information</span></div>{result.answer ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{result.answer}</p> : <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-300">{JSON.stringify(result, null, 2)}</pre>}{result.next_steps?.length > 0 && <div className="mt-5 border-t border-white/10 pt-4"><div className="text-[10px] font-bold uppercase tracking-widest text-electric">Suggested next steps</div><ol className="mt-2 grid gap-2 text-xs leading-5 text-slate-300 sm:grid-cols-3">{result.next_steps.map((step, index) => <li key={step} className="rounded-xl border border-white/10 bg-black/10 p-3"><span className="mr-2 font-bold text-electric">0{index + 1}</span>{step}</li>)}</ol></div>}<p className="mt-4 text-[10px] leading-5 text-slate-500">This is public legal information, not legal advice. Verify deadlines and current law with an authorised professional or official authority.</p></div>;
  const renderPublicError = publicError && <div role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-300/10 p-3 text-xs leading-5 text-red-200">{publicError}</div>;
  const refreshPublicServices = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
      setRefreshedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  };
  return <><PageTitle eyebrow={`PUBLIC ${PRODUCT_NAME.toUpperCase()}`} title="Legal help, without the barriers." subtitle="Explore public legal information, find professional help and prepare next steps. No confidential case repository is queried." action={<div className="flex flex-col items-end gap-2"><button type="button" onClick={refreshPublicServices} disabled={refreshing} className="rounded-xl border border-mint/25 px-4 py-2.5 text-sm font-semibold text-mint disabled:cursor-wait disabled:opacity-60">{refreshing ? "Refreshing..." : "Refresh public services"}</button>{refreshedAt && <span className="text-[10px] text-slate-500">Updated {formatExactDateTime(refreshedAt)}</span>}</div>}/>
    <div className="public-tab-nav mb-5 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-panel/70 p-2">{tabs.map(([id,label,Icon]) => <button key={id} onClick={() => {setTab(id);setResult(null)}} className={`public-tab flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${tab === id ? "bg-mint text-ink" : "text-slate-400"}`}><Icon size={15}/>{label}</button>)}</div>
    <section className="rounded-2xl border border-white/10 bg-panel/70 p-6">
      {tab === "assistant" && <><div className="rounded-2xl border border-mint/15 bg-gradient-to-br from-mint/10 via-white/[.03] to-electric/10 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-mint"><Sparkles size={17}/><span className="text-[10px] font-bold uppercase tracking-[.2em]">{PRODUCT_NAME} public guide</span></div><h2 className="mt-2 text-xl font-black tracking-tight">Guidance tailored for you.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Choose who you are to see questions and practical answers for your situation.</p></div><div className="min-w-[180px]"><label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Answer language</label><select aria-label="Answer language" value={language} onChange={event => setLanguage(event.target.value)} className="w-full rounded-xl border border-mint/20 bg-ink px-3 py-2.5 text-sm text-slate-200 outline-none"><option>English</option><option>Hindi</option><option>Bengali</option><option>Marathi</option><option>Tamil</option><option>Telugu</option><option>Kannada</option><option>Malayalam</option><option>Urdu</option></select></div></div></div><div className="public-audience-grid mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{["citizen","student","lawyer","victim"].map(item => <button key={item} onClick={() => changeAudience(item)} className={`public-audience-card rounded-xl border px-3 py-3 text-xs font-bold capitalize transition ${audience === item ? "border-electric bg-electric/10 text-electric shadow-lg shadow-electric/5" : "border-white/10 text-slate-400"}`}>{item}<span className="mt-1 block text-[10px] font-normal opacity-60">{audienceQuestionMap[item].size} tailored questions</span></button>)}</div><div className="mt-5 grid gap-5 lg:grid-cols-[190px_1fr]"><div className="flex gap-2 overflow-x-auto lg:block lg:space-y-2">{audienceCategories.map(category => <button key={category} onClick={() => setQuestionCategory(category)} className={`w-max rounded-xl border px-3 py-2 text-left text-xs font-semibold lg:block lg:w-full ${questionCategory === category ? "border-mint/30 bg-mint/10 text-mint" : "border-white/10 text-slate-400 hover:bg-white/5"}`}>{category}<span className="ml-2 text-[10px] opacity-60">{audienceQuestions.filter(item => item.category === category).length}</span></button>)}</div><div><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold">{audience === "citizen" ? "Citizen questions" : `${audience[0].toUpperCase()}${audience.slice(1)} questions`}</h3><p className="mt-1 text-xs text-slate-500">Select a question to fill the box, then click Ask for an answer.</p></div><span className="rounded-full bg-electric/10 px-2 py-1 text-[10px] text-electric">{visibleQuestions.length} questions</span></div><div className="grid gap-3 sm:grid-cols-2">{visibleQuestions.map(item => <button key={item.question} onClick={() => {setQuestion(item.question);setResult(null);setPublicError("");}} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-mint/40 hover:bg-mint/5 ${question === item.question ? "border-mint/35 bg-mint/5" : "border-white/10 bg-black/10"}`}><div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold leading-5 text-slate-200">{item.question}</span><ChevronRight size={15} className="mt-0.5 shrink-0 text-mint"/></div><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-500">Click to add this question to the assistant.</p></button>)}</div></div></div>{chatMessages.length > 0 && <div className="mt-5 max-h-64 space-y-2 overflow-auto rounded-2xl border border-white/10 bg-black/10 p-3">{chatMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`rounded-xl p-3 text-sm leading-6 ${message.role === "user" ? "ml-8 bg-electric/10 text-slate-200" : "mr-8 bg-mint/10 text-slate-200"}`}><div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{message.role === "user" ? "You" : PRODUCT_NAME}</div>{message.text}</div>)}</div>}<textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask a general legal question or choose a question card above" className="mt-5 min-h-32 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm outline-none"/><div className="mt-3 flex flex-wrap items-center gap-2">      <button disabled={asking} onClick={() => askPublicAssistant()} className="rounded-lg bg-electric px-4 py-2 text-xs font-bold text-ink disabled:cursor-wait disabled:opacity-60">{asking ? `${PRODUCT_NAME} is preparing…` : "Ask"}</button><button onClick={() => {if (!("webkitSpeechRecognition" in window)) return notify("Voice input is not supported in this browser"); const recognition = new window.webkitSpeechRecognition(); recognition.lang = "en-IN"; recognition.onresult = event => setQuestion(event.results[0][0].transcript); recognition.start();}} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300"><Mic size={14} className="mr-1 inline"/>Voice input</button><button onClick={() => {setQuestion(""); setChatMessages([]); setResult(null); setPublicError("");}} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Clear chat</button></div>{renderPublicError}{renderResult}</>}
      {tab === "lawyers" && <><div className="flex flex-wrap gap-2"><input value={lawyerQuery} onChange={event => setLawyerQuery(event.target.value)} placeholder="Search name, practice or city" className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm"/><select value={lawyerType} onChange={event => setLawyerType(event.target.value)} className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-xs"><option value="all">All lawyer types</option><option value="private">Private</option><option value="legal aid">Legal aid</option><option value="senior">Senior</option></select></div><div className="mt-5 grid gap-3 md:grid-cols-2">{filteredLawyers.map(item => <article key={item.name} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-start justify-between"><div><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-xs text-mint">{item.specialty} · {item.type}</p></div><button onClick={() => toggleSavedLawyer(item.name)} aria-label="Save lawyer" className={savedLawyers.includes(item.name) ? "text-amber-300" : "text-slate-500"}><Bookmark size={17} fill={savedLawyers.includes(item.name) ? "currentColor" : "none"}/></button></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400"><span>{item.city}</span><span>{item.rating} / 5 rating</span><span>{item.fee}</span><span>{item.available}</span></div><button onClick={() => {setSelectedLawyer(item); setConsultationSent(false);}} className="mt-4 w-full rounded-lg border border-electric/25 py-2 text-xs font-semibold text-electric">View profile and availability</button></article>)}</div>{selectedLawyer && <div className="mt-5 rounded-xl border border-electric/25 bg-electric/5 p-4"><div className="flex justify-between"><div><h3 className="font-bold">{selectedLawyer.name}</h3><p className="text-xs text-slate-400">{selectedLawyer.languages} · {selectedLawyer.fee}</p></div><button onClick={() => setSelectedLawyer(null)} className="text-slate-400"><X size={17}/></button></div><p className="mt-3 text-sm text-slate-300">Public profile: {selectedLawyer.specialty} counsel serving {selectedLawyer.city}. Verify credentials and fees directly before engaging.</p>{consultationSent ? <div className="mt-4 rounded-xl border border-mint/20 bg-mint/10 p-4 text-sm text-mint">Your consultation request for {selectedLawyer.name} has been prepared and saved on this device. Contact the lawyer directly to confirm availability.</div> : <form onSubmit={submitConsultation} className="mt-4 grid gap-3"><input required value={consultation.name} onChange={event => setConsultation(current => ({...current, name:event.target.value}))} placeholder="Your name" className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm outline-none"/><input required value={consultation.contact} onChange={event => setConsultation(current => ({...current, contact:event.target.value}))} placeholder="Phone or email" className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm outline-none"/><select required value={consultation.preferredTime} onChange={event => setConsultation(current => ({...current, preferredTime:event.target.value}))} className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm outline-none"><option value="">Preferred consultation time</option><option>Today</option><option>Tomorrow</option><option>This week</option><option>Next week</option></select><textarea value={consultation.matter} onChange={event => setConsultation(current => ({...current, matter:event.target.value}))} placeholder="Briefly describe what you need help with (optional)" rows="3" className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm outline-none"/><button type="submit" className="w-fit rounded-lg bg-electric px-3 py-2 text-xs font-bold text-ink"><Calendar size={14} className="mr-1 inline"/>Submit consultation request</button></form>}</div>}</>}
      {tab === "constitution" && <div className="space-y-5">
        <div className="rounded-2xl border border-mint/15 bg-gradient-to-br from-mint/10 via-white/[.03] to-electric/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-mint"><BookOpen size={18}/><span className="text-[10px] font-bold uppercase tracking-[.2em]">Constitution guide</span></div>
              <h2 className="mt-2 text-xl font-black tracking-tight">Understand your rights in plain language.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Choose an important constitutional article, save useful provisions, and open the official text when you need to read further.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3"><div className="text-xl font-black text-mint">{articles.length}</div><div className="text-[10px] text-slate-500">Articles</div></div>
              <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3"><div className="text-xl font-black text-amber-300">{bookmarks.length}</div><div className="text-[10px] text-slate-500">Saved</div></div>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Choose a constitutional article</span>
              <select aria-label="Choose a constitutional article" value={selectedArticle} onChange={event => setSelectedArticle(event.target.value)} className="w-full rounded-xl border border-white/10 bg-ink/60 px-3 py-2.5 text-sm outline-none focus:border-mint/40">
                <option value="">All constitutional articles</option>
                {articles.map(item => <option key={item.id} value={item.id}>Article {item.id} - {item.title.replace(`Article ${item.id} - `, "")}</option>)}
              </select>
            </label>
            <select aria-label="Filter constitutional part" value={articlePart} onChange={event => setArticlePart(event.target.value)} className="rounded-xl border border-white/10 bg-ink/60 px-3 py-2.5 text-sm outline-none focus:border-mint/40 sm:w-56">
              <option value="all">All parts</option>
              {articleParts.map(part => <option key={part} value={part}>{part.replace(" · ", " - ")}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-sm font-bold">Browse constitutional rights</h3><p className="mt-1 text-xs text-slate-500">{filteredArticles.length} {filteredArticles.length === 1 ? "result" : "results"} found</p></div>
          <button type="button" onClick={() => { setSelectedArticle(""); setArticlePart("all"); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 hover:border-mint/30 hover:text-mint">Reset filters</button>
        </div>
        {filteredArticles.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{filteredArticles.map(item => <article key={item.id} className="group rounded-2xl border border-white/10 bg-white/[.03] p-5 transition hover:-translate-y-0.5 hover:border-mint/30 hover:bg-mint/[.03]">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-mint">{item.part}</div><h3 className="mt-2 text-sm font-bold leading-5">{item.title}</h3></div><button type="button" aria-label={bookmarks.includes(item.id) ? `Remove ${item.title} bookmark` : `Save ${item.title}`} onClick={() => toggleBookmark(item.id)} className={`rounded-lg border p-2 transition ${bookmarks.includes(item.id) ? "border-amber-300/30 bg-amber-300/10 text-amber-300" : "border-white/10 text-slate-500 hover:text-amber-300"}`}><Bookmark size={16} fill={bookmarks.includes(item.id) ? "currentColor" : "none"}/></button></div>
          <p className="mt-4 text-sm leading-6 text-slate-300">{item.text}</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><span className="text-[10px] text-slate-500">Article {item.id} · General information</span><a href={`https://indiacode.gov.in/search?query=${encodeURIComponent(`${item.title} Constitution of India`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-electric hover:text-mint">Find Article {item.id} on India Code <ArrowUpRight size={13}/></a></div>
        </article>)}</div> :         <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center"><BookOpen size={22} className="mx-auto text-slate-500"/><h3 className="mt-3 text-sm font-bold">No article matches this filter</h3><p className="mt-1 text-xs text-slate-500">Choose another article or reset the filters.</p><button type="button" onClick={() => { setSelectedArticle(""); setArticlePart("all"); }} className="mt-4 rounded-lg bg-mint px-3 py-2 text-xs font-bold text-ink">Show all articles</button></div>}
      </div>}
      {tab === "cases" && <><div className="flex items-center gap-2"><Search size={18} className="text-electric"/><input value={caseQuery} onChange={event => setCaseQuery(event.target.value)} placeholder="Legal terms, sections or party names" className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm"/></div><div className="mt-5 space-y-3">{filteredCases.map(item => <article key={item.title} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{item.title}</h3><span className="text-xs text-mint">{item.year} · {item.court}</span></div><div className="mt-1 text-xs text-electric">{item.topic}</div><p className="mt-3 text-sm leading-6 text-slate-300">{item.summary}</p><button onClick={() => notify("Public citation saved for review")} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Save citation</button></article>)}</div></>}
      {tab === "call" && <><div className="grid gap-3 sm:grid-cols-3">{[["Calls today","12"],["Forwarded","3"],["Auto-resolved","9"]].map(([label,value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="text-2xl font-black text-mint">{value}</div><div className="mt-1 text-xs text-slate-400">{label}</div></div>)}</div><div className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-5"><div className="flex items-center gap-3"><div className="rounded-full bg-mint/10 p-3 text-mint"><Phone size={20}/></div><div><h3 className="font-bold">Simulate public helpline</h3><p className="text-xs text-slate-500">Multilingual intake, triage and safe hand-off.</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><select value={callerType} onChange={event => setCallerType(event.target.value)} className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-xs"><option>Citizen</option><option>Student</option><option>Victim / complainant</option><option>Lawyer</option></select><select value={callLanguage} onChange={event => setCallLanguage(event.target.value)} className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-xs"><option>English</option><option>Hindi</option><option>Marathi</option><option>Tamil</option><option>Telugu</option></select></div><button onClick={simulateCall} disabled={callRunning} className="mt-4 rounded-lg bg-mint px-4 py-2 text-xs font-bold text-ink">{callRunning ? "Call in progress…" : "Start simulated call"}</button>{callTranscript.length > 0 && <div className="mt-4 space-y-2 text-xs text-slate-300">{callTranscript.map((line,index) => <div key={`${line}-${index}`} className="rounded-lg bg-black/10 p-2">{line}</div>)}</div>}</div></>}
      {tab === "complaints" && <><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-mint/5 p-3"><div className="text-lg font-bold text-mint">16</div><div className="text-xs text-slate-500">Drafts prepared</div></div><div className="rounded-lg bg-electric/5 p-3"><div className="text-lg font-bold text-electric">8</div><div className="text-xs text-slate-500">Under review</div></div><div className="rounded-lg bg-amber-300/5 p-3"><div className="text-lg font-bold text-amber-300">4</div><div className="text-xs text-slate-500">Resolved examples</div></div></div><div className="grid gap-3 sm:grid-cols-2"><input value={complaint.name} onChange={event => updateComplaint("name", event.target.value)} placeholder="Lawyer or organisation name" className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm"/><select value={complaint.category} onChange={event => updateComplaint("category", event.target.value)} className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm"><option>professional misconduct</option><option>delay or non-response</option><option>fee dispute</option><option>service grievance</option></select></div><textarea value={complaint.facts} onChange={event => updateComplaint("facts", event.target.value)} placeholder="Describe what happened, when and where. Do not include confidential investigation records." className="mt-3 min-h-32 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm"/><button onClick={async () => {const response = await publicAction("/public/complaint-draft", {facts:`${complaint.name} - ${complaint.category}\n\n${complaint.facts || "Complaint facts for review"}`, language:"English"}); if (response) setComplaintSubmitted(true);}} className="mt-3 rounded-lg bg-mint px-4 py-2 text-xs font-bold text-ink">Create editable complaint draft</button>{complaintSubmitted && <div className="mt-3 rounded-lg border border-mint/20 bg-mint/5 p-3 text-xs text-mint">Draft created successfully. Review every fact and submit only through the appropriate official authority.</div>}{renderResult}</>}
      {tab === "document" && <><input type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx" onChange={event => {setFile(event.target.files[0]); setResult(null); setPublicError("");}} className="block w-full rounded-xl border border-dashed border-mint/30 bg-mint/[.04] p-8 text-sm text-slate-300"/><p className="mt-2 text-xs text-slate-500">{file ? file.name : "Choose a personal document for in-memory review. It is not saved to the secure repository."}</p><button disabled={!file || documentReviewBusy} onClick={reviewPublicDocument} className="mt-4 rounded-lg border border-mint/25 px-4 py-2 text-xs font-semibold text-mint disabled:cursor-wait disabled:opacity-40">{documentReviewBusy ? "Reviewing document..." : "Review document securely"}</button>{publicError && <div role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-300/10 p-3 text-xs leading-5 text-red-200">{publicError}</div>}{result && <div className="mt-5 rounded-2xl border border-mint/20 bg-mint/5 p-5"><div className="mb-4 flex items-center justify-between gap-3"><div className="text-xs font-bold uppercase tracking-widest text-mint">Document content review</div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-400">{result.review_required ? "Human review required" : "Review complete"}</span></div><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-black/10 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">Subject</div><div className="mt-1 text-sm font-semibold text-mint">{result.subject || "Not identified"}</div></div><div className="rounded-xl bg-black/10 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">File</div><div className="mt-1 truncate text-sm font-semibold">{result.filename}</div></div><div className="rounded-xl bg-black/10 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">Size</div><div className="mt-1 text-sm font-semibold">{result.size ? `${(result.size / 1024 / 1024).toFixed(2)} MB` : "Not available"}</div></div><div className="rounded-xl bg-black/10 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">Text extraction</div><div className="mt-1 text-sm font-semibold text-mint">{result.text_extracted ? `${result.ocr_text_length} characters` : "Not available"}</div></div></div>{result.topics?.length > 0 && <div className="mt-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Detected topics</div><div className="flex flex-wrap gap-2">{result.topics.map(topic => <span key={topic} className="rounded-full bg-electric/10 px-3 py-1 text-xs text-electric">{topic}</span>)}</div></div>}<p className="mt-4 text-sm leading-6 text-slate-200">{result.summary}</p>{result.important_dates?.length > 0 && <div className="mt-4 rounded-xl border border-electric/20 bg-electric/5 p-4"><div className="text-[10px] font-bold uppercase tracking-widest text-electric">Important dates found</div><div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">{result.important_dates.map(date => <span key={date}>{date}</span>)}</div></div>}{result.review_flags?.length > 0 && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/80"><div className="mb-2 font-bold uppercase tracking-widest text-amber-300">Review flags</div><ul className="list-disc space-y-1 pl-5">{result.review_flags.map(flag => <li key={flag}>{flag}</li>)}</ul></div>}{result.content_preview && <details className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4"><summary className="cursor-pointer text-xs font-semibold text-slate-300">View extracted content preview</summary><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-400">{result.content_preview}</p></details>}<p className="mt-4 text-[11px] text-slate-500">This upload was analyzed in memory only. Secure case records were not accessed or changed.</p></div>}</>}
      {tab === "track" && <><div className="grid gap-3 sm:grid-cols-2"><input value={track.case_number} onChange={event => setTrack(current => ({...current, case_number:event.target.value}))} placeholder="Case ID / case number" className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm"/><input value={track.verification_code} onChange={event => setTrack(current => ({...current, verification_code:event.target.value}))} placeholder="Agency verification code" className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm"/></div><button onClick={() => publicAction("/public/case-track", track)} className="mt-4 rounded-lg bg-electric px-4 py-2 text-xs font-bold text-ink">View public status</button><p className="mt-3 text-xs text-slate-500">Only an agency-published status snapshot is queried; confidential documents remain private.</p>{renderResult}</>}
      {tab === "resources" && <><div className="grid gap-3 sm:grid-cols-3">{(libraryResources.length ? libraryResources : [{title:"Complaint preparation guide", type:"guide", description:"Organise facts, dates and supporting documents before submitting a complaint."}, {title:"Evidence preservation checklist", type:"checklist", description:"Protect original files, messages, receipts and witness details."}, {title:"General legal information", type:"reference", description:"Start with public legal concepts and verify current rules with official sources."}]).map(item => <article key={item.title} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-start justify-between gap-3"><BookOpen size={18} className="shrink-0 text-mint"/><span className="rounded-full bg-electric/10 px-2 py-1 text-[10px] uppercase tracking-wider text-electric">{item.type}</span></div><h3 className="mt-3 text-sm font-bold">{item.title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{item.description || "Verified public reference material for general information."}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-electric hover:text-white">Open official source</a>}</article>)}</div><button onClick={loadLawLibrary} disabled={libraryLoading} className="mt-4 rounded-lg bg-electric px-4 py-2 text-xs font-bold text-ink disabled:cursor-wait disabled:opacity-60">{libraryLoading ? "Loading library..." : libraryResources.length ? "Refresh public law library" : "Load public law library"}</button>{publicError && <div role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-300/10 p-3 text-xs leading-5 text-red-200">{publicError}</div>}{libraryResources.length > 0 && <p className="mt-4 text-xs text-slate-500">Library loaded: {libraryResources.length} public resources.</p>}</>}
      {tab === "courts" && <><div className="flex flex-wrap items-center gap-2"><MapPin size={18} className="text-mint"/><input value={courtQuery} onChange={event => setCourtQuery(event.target.value)} onKeyDown={event => {if (event.key === "Enter") searchCourtLocation();}} placeholder="Search a court, city or exact address" className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm"/><button type="button" onClick={searchCourtLocation} disabled={locationBusy} className="rounded-lg bg-electric px-3 py-2 text-xs font-bold text-ink disabled:opacity-60">{locationBusy ? "Finding..." : "Search location"}</button><button type="button" onClick={useCurrentLocation} disabled={locationBusy} className="rounded-lg border border-mint/25 px-3 py-2 text-xs text-mint disabled:opacity-60">Use my location</button><a href={mapUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-electric/25 px-3 py-2 text-xs text-electric">Open in Google Maps</a></div>{locationStatus && <p role="status" className="mt-2 text-xs text-slate-400">{locationStatus}</p>}{!mapsApiKey && <div className="mt-3 rounded-lg border border-mint/20 bg-mint/5 p-3 text-xs leading-5 text-slate-300">Live map preview is available without a Google API key using OpenStreetMap. Google Maps remains available through the button above.</div>}            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">{mapsApiKey ? <iframe key={mapUrl} title="Live Google Maps court search" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-[360px] w-full border-0" /> : courtLocation ? <iframe key={osmMapUrl} title="Live OpenStreetMap court search" src={osmMapUrl} loading="lazy" className="h-[360px] w-full border-0" /> : <div className="flex h-[360px] items-center justify-center p-8 text-center"><div><MapPin size={34} className="mx-auto mb-3 text-mint"/><h3 className="font-bold">Search a location or use your current location</h3><p className="mt-2 max-w-md text-xs leading-5 text-slate-500">The map will show the exact searched place and nearby courts.</p></div></div>}</div>{courtLocation && <p className="mt-2 text-[11px] text-slate-500">Map coordinates: {courtLocation.lat.toFixed(5)}, {courtLocation.lng.toFixed(5)}</p>}<div className="mt-5 grid gap-3 md:grid-cols-2">{filteredCourts.map(item => <article key={item.name} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-start justify-between"><div><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-xs text-mint">{item.type} · {item.city}</p></div><Scale size={18} className="text-electric"/></div><p className="mt-3 text-sm text-slate-300">{item.address}</p><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{item.distance} away</span><button onClick={() => {setCourtQuery(item.name); searchCourtLocation(item.address);}} className="text-electric">Show on map</button></div></article>)}</div></>}
    </section>
    <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/70"><strong className="text-amber-200">Public service notice:</strong> {PRODUCT_NAME} provides general information and discovery support, not legal advice. Verify current law, court schedules, lawyer credentials and citations with official sources.</div>
  </>;
}

function Overview({ data, onUpload, onCreateCase, setView }) {
  const fallbackCases = [
    {id:"demo-142", case_number:"CASE-2026-0142", title:"Cyber Harassment Inquiry", status:"investigation", document_count:4, updated_at:"2026-02-16T15:20:00"},
    {id:"demo-138", case_number:"CASE-2026-0138", title:"Digital Evidence Chain Review", status:"court_filing", document_count:7, updated_at:"2026-02-24T12:00:00"},
    {id:"demo-119", case_number:"CASE-2026-0119", title:"Digital Fraud Complaint", status:"active", document_count:3, updated_at:"2026-02-10T14:30:00"},
  ];
  const displayCases = data.recent_cases?.length ? data.recent_cases : fallbackCases;
  const securityAlerts = data.security_alerts || [];
  const hasSecurityAlerts = securityAlerts.length > 0;
  const cards = [{label:"Documents secured", value:data.total_documents, icon:FileLock2, color:"text-mint"}, {label:"Active cases", value:data.active_cases || displayCases.length, icon:FolderKanban, color:"text-electric"}, {label:"Integrity score", value:`${data.integrity}%`, icon:BadgeCheck, color:"text-amber-300"}];
  return <><div className="mb-10 grid gap-8 lg:grid-cols-[1.35fr_.65fr]"><div className="pt-4"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/5 px-3 py-1.5 text-xs text-mint"><Orbit size={13}/> Secure intelligence workspace</div><h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">Every case file.<br/><span className="text-mint">One trusted source.</span></h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-400">A protected command center for legal records, investigation evidence and the people authorized to act on them.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={onUpload} className="flex items-center gap-2 rounded-xl bg-mint px-5 py-3 text-sm font-bold text-ink shadow-lg shadow-mint/10 transition hover:-translate-y-0.5"><UploadCloud size={17}/> Upload document</button><button onClick={() => setView("documents")} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-electric/30 hover:text-electric"><Search size={16}/> Search documents</button><button onClick={() => setView("intelligence")} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-electric/30 hover:text-electric">  <BrainCircuit size={16}/> Ask</button><button onClick={onCreateCase} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-electric/30 hover:text-electric"><FolderKanban size={16}/> Create new case</button><button onClick={() => setView("audit")} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-amber-300/30 hover:text-amber-300"><BadgeCheck size={16}/> Verify document</button></div></div><div className="float hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#153454] to-panel p-6 lg:block"><div className="flex items-center justify-between"><div className="text-xs uppercase tracking-[.2em] text-slate-400">Integrity monitor</div><Activity size={18} className="text-mint"/></div><div className="my-9 flex justify-center"><div className="relative flex h-44 w-44 items-center justify-center rounded-full border border-mint/30"><div className="absolute inset-3 rounded-full border border-mint/20"/><div className="absolute inset-7 rounded-full border border-mint/10"/><div className="text-center"><div className="text-4xl font-black text-mint">{data.integrity}%</div><div className="text-xs text-slate-400">verified</div></div></div></div><div className="flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-slate-400"><Zap size={14} className="text-amber-300"/> Chain of custody is active</div></div></div><div className="grid gap-4 sm:grid-cols-3">{cards.map(({label,value,icon:Icon,color}) => <div key={label} className="rounded-2xl border border-white/10 bg-panel/75 p-5 transition hover:-translate-y-1 hover:border-white/20"><div className={`mb-7 flex items-center justify-between ${color}`}><Icon size={20}/><span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.16em] text-slate-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400 shadow-[0_0_8px_#4ade80]"/>Live</span></div><div className="text-3xl font-black">{value}</div><div className="mt-1 text-sm text-slate-400">{label}</div></div>)}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><section className="rounded-2xl border border-white/10 bg-panel/60 p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Pending actions</h2><p className="mt-1 text-xs text-slate-500">Items requiring an authorized response</p></div><span className="rounded-full bg-amber-300/10 px-2 py-1 text-xs text-amber-300">{data.pending_actions || 0}</span></div><div className="space-y-2"><div className="flex items-center gap-3 rounded-xl bg-white/[.03] p-3 text-xs"><Bell size={15} className="text-amber-300"/><span className="flex-1">Review pending document approvals</span><span className="text-slate-500">today</span></div><div className="flex items-center gap-3 rounded-xl bg-white/[.03] p-3 text-xs"><Activity size={15} className="text-electric"/><span className="flex-1">Confirm case timeline updates</span><span className="text-slate-500">queue</span></div></div></section><section className={`rounded-2xl border p-6 ${hasSecurityAlerts ? "border-red-300/15 bg-red-300/5" : "border-mint/15 bg-mint/[.03]"}`}><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Security alerts</h2><p className="mt-1 text-xs text-slate-500">Integrity and access signals</p></div><ShieldAlert size={18} className={hasSecurityAlerts ? "text-red-300" : "text-mint"}/></div>{hasSecurityAlerts ? securityAlerts.map(alert => <div key={alert.title} className="rounded-xl border border-red-300/15 bg-red-300/5 p-3 text-xs"><div className="font-semibold text-red-300">{alert.title}</div><div className="mt-1 text-slate-400">{alert.message}</div></div>) : <div className="rounded-xl bg-mint/[.06] p-3 text-xs text-mint">No active security alerts. Integrity chain is healthy.</div>}</section></div>  <section className="mt-4 rounded-2xl border border-white/10 bg-panel/60 p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Recent cases</h2><p className="mt-1 text-xs text-slate-500">Case ID, title, status, records and last update</p></div><button onClick={() => setView("cases")} className="text-xs text-mint">Open case workspace <ArrowUpRight size={13} className="inline"/></button></div>{displayCases.length ? <div className="space-y-2">{displayCases.map(item => <div key={item.id} className="grid gap-2 rounded-xl border border-white/5 bg-white/[.03] p-3 sm:grid-cols-[1fr_1.45fr_.7fr_.65fr_1fr] sm:items-center"><span className="font-mono text-xs text-electric">{item.case_number}</span><span className="truncate text-sm font-semibold">{item.title}</span><span className="text-xs text-mint">{item.status.replaceAll("_"," ")}</span><span className="text-xs text-slate-500">{item.document_count || 0} records</span><span className="text-xs text-slate-500">{item.updated_at ? new Date(item.updated_at).toLocaleString() : "Awaiting update"}</span>  </div>)}</div> : <div className="rounded-xl bg-white/[.03] p-4 text-center text-xs text-slate-500">No assigned cases yet. Create a case workspace to begin.</div>}</section><section className="mt-4 rounded-2xl border border-white/10 bg-panel/60 p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Recent activity</h2><p className="mt-1 text-xs text-slate-500">Immutable events across your workspace</p></div><button onClick={() => setView("audit")} className="text-xs text-mint">View audit trail <ArrowUpRight size={13} className="inline"/></button></div><ActivityList items={data.activities}/></section></>;
}

function ActivityList({items=[]}) { return <div className="space-y-3">{items.length ? items.map((item,index) => <div key={index} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[.02] p-3"><div className="rounded-lg bg-mint/10 p-2 text-mint"><Fingerprint size={15}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{item.action.replace(".", " · ")}</div><div className="text-xs text-slate-500">{item.user} · {formatExactDateTime(item.created_at)}</div></div><CheckCircle2 size={15} className="text-mint"/></div>) : <div className="py-8 text-center text-sm text-slate-500">No activity yet. Upload a document to create your first event.</div>}</div>; }

function Documents({documents, query, onSearch, runSearch, filters, setFilters, onUpload, onOpenDocument, searchResults, searchType, setSearchType, searchLoading}) {
  const updateFilter = (key, value) => setFilters(current => ({...current, [key]: value}));
  const applyFilters = () => runSearch(query, searchType, filters);
  const hasActiveFilters = Boolean(searchType) || Object.values(filters).some(value => String(value || "").trim());
  return <><PageTitle eyebrow="DOCUMENT VAULT" title="Protected records" subtitle="Search, inspect and release files with a verified chain of custody." action={<button onClick={onUpload} className="flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-bold text-ink"><UploadCloud size={16}/> Add document</button>}/>
    <div className="mb-5 rounded-2xl border border-white/10 bg-panel p-3">
      <div className="flex items-center gap-3 px-2"><Search size={17} className="text-slate-500"/><input value={query} onChange={onSearch} placeholder="Try “witness statement about vehicle identification”" className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-slate-600"/>{searchLoading && <span className="text-xs text-electric">Searching…</span>}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3"><span className="text-[10px] uppercase tracking-widest text-slate-600">Filter</span>{["", "investigation", "fir", "charge_sheet", "witness", "evidence", "forensic", "court_filing", "judgment"].map(type => <button key={type} onClick={() => { setSearchType(type); runSearch(query, type, filters); }} className={`rounded-lg px-3 py-1.5 text-xs ${searchType === type ? "bg-electric/15 text-electric" : "text-slate-500 hover:bg-white/5"}`}>{type || "All types"}</button>)}</div>
      <div className="mt-3 grid gap-2 border-t border-white/5 pt-3 sm:grid-cols-2 lg:grid-cols-4"><input value={filters.case_id} onChange={event => updateFilter("case_id", event.target.value)} placeholder="Case ID" className="rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs outline-none"/><input value={filters.fir_number} onChange={event => updateFilter("fir_number", event.target.value)} placeholder="FIR number" className="rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs outline-none"/><input value={filters.department} onChange={event => updateFilter("department", event.target.value)} placeholder="Department" className="rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs outline-none"/><input value={filters.uploader_id} onChange={event => updateFilter("uploader_id", event.target.value)} placeholder="Uploader ID" type="number" min="1" className="rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs outline-none"/>      <label className="grid gap-1 text-[10px] font-semibold text-slate-500"><span>Uploaded from</span><input value={filters.date_from} onChange={event => updateFilter("date_from", event.target.value)} type="date" title="Uploaded from" aria-label="Uploaded from" className="w-full rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs font-normal text-slate-300 outline-none"/></label><label className="grid gap-1 text-[10px] font-semibold text-slate-500"><span>Uploaded to</span><input value={filters.date_to} onChange={event => updateFilter("date_to", event.target.value)} type="date" title="Uploaded to" aria-label="Uploaded to" className="w-full rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs font-normal text-slate-300 outline-none"/></label><select value={filters.sensitivity} onChange={event => updateFilter("sensitivity", event.target.value)} className="rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs outline-none"><option value="">Any sensitivity</option><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option><option value="highly_sensitive">Highly sensitive</option></select><select value={filters.min_similarity} onChange={event => updateFilter("min_similarity", event.target.value)} className="rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-xs outline-none"><option value="">Any semantic similarity</option><option value="0.25">25% or higher</option><option value="0.5">50% or higher</option><option value="0.75">75% or higher</option></select><button onClick={applyFilters} className="rounded-lg bg-electric px-3 py-2 text-xs font-bold text-ink sm:col-span-2 lg:col-span-4">Apply metadata and semantic filters</button></div>
    </div>
    {(query || hasActiveFilters) && <div className="mb-6 rounded-xl border border-electric/20 bg-electric/5 p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-electric"><BrainCircuit size={14}/> Filtered document matches</div><span className="text-xs text-slate-500">{searchResults.length} found</span></div>{searchResults.length ? searchResults.slice(0,5).map((item) => <div key={item.id} className="border-t border-white/5 py-3"><div className="flex justify-between text-sm"><span className="font-medium">{item.title}</span><span className="text-slate-400">{Math.round(item.score * 100)}% relevant</span></div><p className="mt-1 text-xs text-slate-500">{item.snippet || item.filename}</p></div>) : <p className="text-sm text-slate-500">No records match the selected search and filters.</p>}</div>}
    <div className="grid gap-3">{documents.length ? documents.map((doc) => <DocumentRow key={doc.id} doc={doc} onOpen={() => onOpenDocument(doc)}/>) : <Empty icon={Archive} text="Your vault is ready for its first protected record."/>}</div></>;
}
function DocumentRow({doc, onOpen}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const [versions, setVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const handleDownload = async () => {
    setBusy(true);
    setError("");
    try {
      await downloadDocument(doc);
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setBusy(false);
    }
  };
  const analyze = async () => {
    try {
      const [classification, summary] = await Promise.all([
        request(`/documents/${doc.id}/classify`, {method: "POST"}),
        request(`/documents/${doc.id}/summarize`, {method: "POST"}),
      ]);
      setAnalysis({...summary, classification: classification.classification});
    } catch (analysisError) { setError(analysisError.message); }
  };
  const aiSummary = async () => {
    try {
      const result = await request(`/documents/${doc.id}/summarize/gemini`, {method: "POST"});
      setAnalysis(current => ({...result, classification: current?.classification || doc.classification || doc.document_type}));
    } catch (summaryError) { setError(summaryError.message); }
  };
  const share = async () => {
    const recipient = window.prompt("Share with email or department:");
    if (!recipient) return;
    try {
      const result = await request(`/documents/${doc.id}/share`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({shared_with: recipient, permission: "download"}),
      });
      setShareUrl(`${window.location.origin}${result.url}`);
    } catch (shareError) { setError(shareError.message); }
  };
  const loadVersions = async () => {
    try {
      const result = await request(`/documents/${doc.id}/versions`);
      setVersions(result);
      setShowVersions(true);
    } catch (versionError) { setError(versionError.message); }
  };
  const downloadVersion = async (version) => {
    try {
      await downloadDocument({
        ...doc,
        download_url: `${API}/documents/${doc.id}/versions/${version.version}/download`,
        filename: `${doc.title}.v${version.version}${doc.filename?.includes(".") ? `.${doc.filename.split(".").pop()}` : ""}`,
      });
    } catch (versionError) { setError(versionError.message); }
  };
  return <div className="document-row flex min-w-0 flex-col gap-4 rounded-2xl border border-white/10 bg-panel/70 p-5 transition hover:border-mint/25 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-start gap-4"><div className="shrink-0 rounded-xl bg-mint/10 p-3 text-mint"><FileText size={21}/></div><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="rounded bg-mint/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-mint">{doc.document_type}</span><span className="rounded bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">{doc.sensitivity || "confidential"}</span>{doc.encrypted && <FileLock2 size={13} className="text-electric"/>}{doc.signed && <BadgeCheck size={14} className="text-amber-300"/>}</div>  <h3 className="break-words font-semibold">{doc.title}</h3><p className="document-metadata break-words text-xs text-slate-500">{doc.filename} · SHA-256 {doc.sha256?.slice(0,12)}… · v{doc.version} · uploaded {doc.created_at ? new Date(doc.created_at).toLocaleString() : "unknown"}</p>{analysis &&   <div className="mt-2 rounded-lg bg-electric/5 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-electric">{analysis.provider === "gemini" ? "Gemini Summary" : "AI analysis"} · {analysis.classification}</span><span className="text-[10px] uppercase text-mint">{analysis.provider || "local-analytical"} · {analysis.confidence || "medium"} confidence</span></div><p className="mt-2 text-slate-300">{analysis.summary}</p>{analysis.key_points?.length > 0 && <div className="mt-3"><div className="font-semibold text-slate-300">Key points</div><ul className="mt-1 list-disc space-y-1 pl-4 text-slate-400">{analysis.key_points.map(point => <li key={point}>{point}</li>)}</ul></div>}{analysis.entities && <div className="mt-3 grid gap-1 text-slate-400 sm:grid-cols-2">{Object.entries(analysis.entities).filter(([,items]) => items?.length).map(([label, items]) => <div key={label}><span className="font-semibold capitalize text-slate-300">{label.replaceAll("_", " ")}:</span> {items.join(", ")}</div>)}</div>}{analysis.risk_flags?.length > 0 && <div className="mt-3"><div className="font-semibold text-amber-300">Risk flags</div><ul className="mt-1 list-disc space-y-1 pl-4 text-slate-400">{analysis.risk_flags.map(flag => <li key={flag}>{flag}</li>)}</ul></div>}{analysis.recommended_actions?.length > 0 && <div className="mt-3"><div className="font-semibold text-mint">Recommended actions</div><ul className="mt-1 list-disc space-y-1 pl-4 text-slate-400">{analysis.recommended_actions.map(action => <li key={action}>{action}</li>)}</ul></div>}{analysis.open_questions?.length > 0 && <div className="mt-3"><div className="font-semibold text-electric">Open questions</div><ul className="mt-1 list-disc space-y-1 pl-4 text-slate-400">{analysis.open_questions.map(question => <li key={question}>{question}</li>)}</ul></div>}{analysis.limitations?.length > 0 && <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-slate-500">{analysis.limitations.join(" ")}</p>}</div>}{showVersions && <div className="mt-2 rounded-lg border border-white/5 bg-white/[.03] p-2 text-xs"><div className="mb-2 font-semibold text-slate-300">Version history</div>{versions.length ? versions.map(version => <div key={version.id} className="flex items-center justify-between border-t border-white/5 py-1.5">  <span>v{version.version} · {version.sha256.slice(0,10)}… {version.is_current && <span className="text-mint">(current)</span>}</span><button onClick={() => downloadVersion(version)} className="text-electric hover:text-white">Download</button></div>) : <span className="text-slate-500">No version records yet.</span>}</div>}{shareUrl && <p className="mt-2 break-all text-[11px] text-mint">Share link: {shareUrl}</p>}{error && <p className="mt-1 text-xs text-red-300">{error}</p>}</div></div>  <div className="document-actions flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0"><button onClick={onOpen} className="rounded-lg border border-mint/25 px-3 py-2 text-xs font-semibold text-mint hover:bg-mint/10">Open viewer</button><button onClick={analyze} className="rounded-lg border border-electric/20 px-3 py-2 text-xs font-semibold text-electric hover:bg-electric/10">AI analyze</button><button onClick={aiSummary} className="rounded-lg border border-purple-300/25 px-3 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-300/10">Gemini Summary</button><button onClick={loadVersions} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-electric/30 hover:text-electric">Versions</button><button onClick={share} className="rounded-lg border border-mint/20 px-3 py-2 text-xs font-semibold text-mint hover:bg-mint/10">Share</button><button onClick={handleDownload} disabled={busy} className="flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-mint/30 hover:text-mint disabled:cursor-wait disabled:opacity-60">{busy ? "Verifying…" : "Verify & download"} <ArrowUpRight size={14}/></button></div></div>;
}

function DocumentViewer({document, onBack, onReset, onUpload}) {
  const [verification, setVerification] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const loadVerification = async () => {
    try {
      const current = await request(`/documents/${document.id}/verify`);
      if (current.sha256?.valid && current.signature?.valid && !current.blockchain?.anchored) {
        await request(`/documents/${document.id}/anchor`, {method: "POST"});
        setVerification(await request(`/documents/${document.id}/verify?refresh=${Date.now()}`));
      } else {
        setVerification(current);
      }
    }
    catch (error) { setVerification({error: error.message}); }
  };
  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const response = await fetch(document.download_url, {
        headers: {Authorization: `Bearer ${localStorage.getItem(tokenKey)}`},
      });
      if (!response.ok) throw new Error("Preview verification failed");
      const blob = await response.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) { setVerification({error: error.message}); }
    finally { setPreviewLoading(false); }
  };
  useEffect(() => {
    setVerification(null);
    setPreviewUrl("");
    if (document?.id) loadVerification();
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [document?.id]);
  if (!document) return <><PageTitle eyebrow="DOCUMENT VIEWER" title="Select a protected record" subtitle="Open a document from the vault to inspect its metadata and integrity status." action={<button onClick={onUpload} className="rounded-xl bg-mint px-4 py-2.5 text-sm font-bold text-ink">Upload document</button>}/><Empty icon={FileText} text="Choose Open viewer from the Document Vault."/></>;
  const fileType = document.filename?.split(".").pop()?.toLowerCase();
  const canEmbed = ["pdf", "png", "jpg", "jpeg", "gif"].includes(fileType);
  return <><PageTitle eyebrow="DOCUMENT VIEWER" title={document.title} subtitle="Preview + metadata + SHA-256 + blockchain verification + signature status." action={<div className="flex flex-wrap gap-2"><button onClick={onReset} className="rounded-xl border border-mint/25 px-4 py-2.5 text-sm font-semibold text-mint hover:bg-mint/10">Home</button><button onClick={onBack} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300">Back to vault</button></div>}/><div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><section className="rounded-2xl border border-white/10 bg-panel/70 p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Secure preview</h2><button onClick={loadPreview} disabled={previewLoading} className="rounded-lg bg-mint px-3 py-2 text-xs font-bold text-ink">{previewLoading ? "Verifying…" : "Load preview"}</button></div>{previewUrl && canEmbed ? <iframe title="Secure document preview" src={previewUrl} className="h-[430px] w-full rounded-xl bg-white"/> : <div className="flex min-h-[390px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[.02] p-8 text-center"><div><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-mint/10 text-mint"><FileText size={38}/></div><h2 className="mt-5 text-lg font-bold">{document.filename}</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{previewUrl ? "This file type is securely verified but does not support embedded browser preview." : "Load preview to decrypt, verify and display this protected record."}</p></div></div>}</section><section className="space-y-4"><div className="rounded-2xl border border-white/10 bg-panel/70 p-5"><h2 className="mb-4 font-bold">Document metadata</h2><div className="space-y-3 text-sm">{[["Type", document.document_type], ["Sensitivity", document.sensitivity || "confidential"], ["Version", `v${document.version}`], ["Uploaded", document.created_at ? new Date(document.created_at).toLocaleString() : "Unknown"], ["Case", document.case_id || "Unassigned"], ["Storage", document.storage_provider || "local encrypted storage"]].map(([label,value]) => <div key={label} className="flex justify-between gap-3 border-b border-white/5 pb-2"><span className="text-slate-500">{label}</span><span className="max-w-[220px] text-right font-medium">{value}</span></div>)}</div></div><div className="rounded-2xl border border-mint/20 bg-mint/5 p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-mint">Verification status</h2><button onClick={loadVerification} className="text-xs text-mint">Recheck</button></div>{verification?.error ? <p className="text-xs text-red-300">{verification.error}</p> : <div className="space-y-3 text-sm"><div className="flex justify-between gap-3"><span className="text-slate-500">SHA-256</span><span className={verification?.sha256?.valid ? "text-mint" : "text-amber-300"}>{verification?.sha256?.valid ? "Verified" : "Checking…"}</span></div><div className="truncate font-mono text-[10px] text-slate-500">{verification?.sha256?.calculated || document.sha256 || "Pending"}</div><div className="flex justify-between"><span className="text-slate-500">Blockchain</span><span className="text-electric">{verification?.blockchain?.anchored ? "Anchored" : "Anchor pending"}</span></div><div className="text-[10px] text-slate-500">{verification?.blockchain?.transaction_id || "No transaction anchor yet"}</div><div className="flex justify-between"><span className="text-slate-500">Digital signature</span><span className={verification?.signature?.valid ? "text-mint" : "text-amber-300"}>{verification?.signature?.valid ? "Ed25519 verified" : "Checking…"}</span></div></div>}</div></section></div></>;
}

function Intelligence({query, onSearch, runSearch, results, searchType, setSearchType, searchLoading}) {
  const suggestions = ["witness statement about vehicle identification", "forensic report with DNA evidence", "FIR mentioning financial fraud", "court filing with urgent notice"];
  const [recent, setRecent] = useState(() => JSON.parse(localStorage.getItem("dms_recent_searches") || "[]"));
  const tool = "qa";
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState("English");
  const [aiResult, setAiResult] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const submit = (event) => { event.preventDefault(); if (!query.trim()) return; const next = [query, ...recent.filter(item => item !== query)].slice(0,5); setRecent(next); localStorage.setItem("dms_recent_searches", JSON.stringify(next)); runSearch(query); };
  const runAiTool = async (event) => {
    event?.preventDefault();
    if (!question.trim()) return;
    setAiBusy(true);
    try {
      const curatedAnswer = guidedAnswer(question);
      if (curatedAnswer) {
        setAiResult(curatedAnswer);
        return;
      }
      const path = "/ai/assistant";
      const body = {question, language, plain_language: true};
      setAiResult(await request(path, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}));
    } catch (error) {
      if (error.message.includes("Not authenticated") || error.message.includes("Authentication required") || error.message.includes("401")) {
        setAiResult({error: `Please sign in to the secure workspace before using grounded case intelligence. Public legal guidance is available in Public ${PRODUCT_NAME}.`});
      } else if (error.message === "Not Found" || error.message.includes("404") || error.message.includes("500") || error.message.includes("Internal Server Error")) {
        setAiResult(demoAiResult(tool, question));
      } else {
        setAiResult({
          answer: "The secure assistant could not retrieve a live case response. Please check your authorized records and try again.",
          general_guidance: true,
          disclaimer: "Live retrieval was unavailable, so no unsupported case-specific claim was shown.",
        });
      }
    }
    finally { setAiBusy(false); }
  };
  return <>  <PageTitle eyebrow="ASK" title="Grounded case intelligence" subtitle="Retrieve authorized evidence first, then analyze it with citations, verification flags and human-review safeguards."/>
    <div className="rounded-3xl border border-electric/20 bg-gradient-to-br from-electric/10 via-panel to-panel p-6 sm:p-10">
      <div className="mb-7 flex items-start gap-3"><div className="rounded-xl bg-electric/15 p-3 text-electric"><BrainCircuit size={25}/></div><div><h2 className="font-bold">How can I help?</h2><p className="mt-1 text-sm text-slate-400">Ask about legal procedures, case documents, evidence, filings or next steps.</p></div></div>
      <form onSubmit={runAiTool} className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-ink/50 px-4 py-4"><Search size={18} className="text-slate-500"/>      <input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask anything about your legal work…" className="w-full bg-transparent outline-none placeholder:text-slate-600"/></div>      <button disabled={aiBusy} className="rounded-xl bg-electric px-5 py-3 text-sm font-bold text-ink">{aiBusy ? "Thinking…" : "Ask"}</button></form>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-slate-400"><label className="flex items-center gap-2">Answer language<select aria-label="Secure answer language" value={language} onChange={event => setLanguage(event.target.value)} className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-xs text-slate-200 outline-none"><option>English</option><option>Hindi</option><option>Bengali</option><option>Marathi</option><option>Tamil</option><option>Telugu</option><option>Kannada</option><option>Malayalam</option><option>Urdu</option></select></label><span className="text-slate-600">Answers use authorized records when available.</span></div>
      {aiResult?.error && <div className="mb-6 rounded-xl border border-red-300/20 bg-red-300/5 p-4 text-sm text-red-200">{aiResult.error}</div>}
      <div className="mb-5"><div className="mb-2 text-xs font-semibold text-slate-400">Try asking</div><div className="grid gap-2 sm:grid-cols-2">{guidedQuestions.map(([prompt]) => <button key={prompt} type="button" onClick={() => {setQuestion(prompt); setAiResult(null);}} className="rounded-xl border border-white/10 px-3 py-2 text-left text-[11px] leading-5 text-slate-400 transition hover:border-electric/40 hover:text-electric">{prompt}</button>)}</div></div>
      {aiResult && !aiResult.error && <div className="mb-8 rounded-2xl border border-mint/20 bg-mint/5 p-5 text-sm"><div className="mb-3 flex items-center gap-2"><CheckCircle2 size={16} className="text-mint"/><span className="font-bold text-mint">{aiResult.verified ? "Answer ready" : "Guidance ready"}</span></div>{(aiResult.demo || aiResult.general_guidance) && <p className="mb-4 text-xs text-amber-300">This is general guidance. Confidential case information was not exposed.</p>}{aiResult.answer && <p className="whitespace-pre-wrap leading-7 text-slate-200">{aiResult.answer}</p>}{aiResult.disclaimer && <p className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-500">{aiResult.disclaimer}</p>}{aiResult.sources?.length > 0 && <details className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-400"><summary className="cursor-pointer">View supporting sources</summary><div className="mt-2 space-y-1">{aiResult.sources.map(source => <div key={source.document_id || source.title}>{source.title}</div>)}</div></details>}</div>}
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row"><div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-ink/50 px-4 py-4"><Search size={18} className="text-slate-500"/><input value={query} onChange={onSearch} placeholder="What are you looking for?" className="w-full bg-transparent outline-none placeholder:text-slate-600"/>{searchLoading && <span className="text-xs text-electric">Working…</span>}</div><button className="rounded-xl bg-electric px-5 py-3 text-sm font-bold text-ink">Search evidence</button></form>
      <div className="mt-5 flex flex-wrap gap-2">{suggestions.map(item => <button key={item} onClick={() => {setRecent([item, ...recent.filter(value => value !== item)].slice(0,5)); runSearch(item);}} className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-400 transition hover:border-electric hover:bg-electric hover:text-ink focus-visible:border-electric focus-visible:bg-electric focus-visible:text-ink focus-visible:outline-none">{item}</button>)}</div>
      <div className="mt-5 flex items-center gap-2 border-t border-white/5 pt-4"><span className="text-[10px] uppercase tracking-widest text-slate-600">Type</span>{["", "fir", "charge_sheet", "witness", "evidence", "forensic", "court_filing", "judgment"].map(type => <button key={type} onClick={() => {setSearchType(type); if (query) runSearch(query, type)}} className={`rounded-lg px-2.5 py-1 text-xs ${searchType === type ? "bg-electric/15 text-electric" : "text-slate-500 hover:bg-white/5"}`}>{type || "All"}</button>)}</div>
      {recent.length > 0 && <div className="mt-5"><div className="mb-2 text-[10px] uppercase tracking-widest text-slate-600">Recent searches</div><div className="flex flex-wrap gap-2">{recent.map(item => <button key={item} onClick={() => runSearch(item)} className="flex items-center gap-1 rounded-lg bg-white/[.04] px-3 py-2 text-xs text-slate-400 transition hover:bg-electric hover:text-ink focus-visible:bg-electric focus-visible:text-ink focus-visible:outline-none"><Search size={11}/>{item}</button>)}</div></div>}
      {results.length ? <div className="mt-8 space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Ranked evidence</h3><span className="text-xs text-slate-500">{results.length} result{results.length === 1 ? "" : "s"}</span></div>{results.map(item => <div key={item.id} className="rounded-xl border border-white/5 bg-white/[.03] p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><FileText size={16} className="text-electric"/><div className="font-semibold">{item.title}</div><span className="rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase text-slate-500">{item.document_type}</span>{item.demo && <span className="rounded bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase text-amber-300">Source-assisted</span>}</div><p className="mt-2 text-xs leading-5 text-slate-400">{item.snippet || item.filename}</p>{item.matched_terms?.length > 0 && <div className="mt-2 text-[11px] text-mint">Matched: {item.matched_terms.join(", ")}</div>}</div><div className="shrink-0 text-right"><div className="text-lg font-bold text-electric">{Math.round(item.score * 100)}%</div><div className="text-[10px] text-slate-500">relevance</div></div></div></div>)}</div> : <div className="mt-8 grid gap-3 sm:grid-cols-3"><MiniFeature icon={Sparkles} label="OCR-aware" text="Search text extracted from images."/><MiniFeature icon={Zap} label="Explainable" text="See matched terms and relevance."/><MiniFeature icon={Orbit} label="Local-first" text="Keep sensitive evidence in your workspace."/></div>}
    </div></>;
}
function MiniFeature({icon:Icon,label,text}) { return <div className="rounded-xl border border-white/5 bg-white/[.03] p-4"><Icon size={17} className="mb-4 text-mint"/><div className="text-sm font-semibold">{label}</div><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>; }
function Audit({data,notify,refresh}) {
  const [entries,setEntries] = useState([]);
  const [verification,setVerification] = useState(null);
  const load = async () => { try { setEntries(await request("/audit")); } catch(error) { notify(error.message); } };
  useEffect(() => { load(); }, []);
  const anchor = async () => { try { await request("/blockchain/anchor",{method:"POST"}); await load(); await refresh(); notify("Audit head anchored successfully"); } catch(error) { notify(error.message); } };
  const verify = async () => { try { setVerification(await request("/audit/verify")); await load(); } catch(error) { notify(error.message); } };
  return <><PageTitle eyebrow="AUDIT & INTEGRITY" title="Evidence provenance" subtitle="Every action is linked. Every release is verified." action={<div className="flex gap-2"><button onClick={verify} className="rounded-xl border border-electric/30 px-4 py-2.5 text-sm font-semibold text-electric">Verify chain</button><button onClick={anchor} className="flex items-center gap-2 rounded-xl border border-mint/30 px-4 py-2.5 text-sm font-semibold text-mint"><Fingerprint size={16}/> Anchor audit head</button></div>}/><div className="mb-6 grid gap-4 sm:grid-cols-3"><MiniFeature icon={FileLock2} label="AES-GCM" text="Encrypted at rest"/><MiniFeature icon={BadgeCheck} label="Ed25519" text="Signed on ingestion"/><MiniFeature icon={Fingerprint} label="SHA-256 chain" text="Tamper evident history"/></div>{verification && <div className={`mb-5 rounded-xl border p-4 text-sm ${verification.valid ? "border-mint/20 bg-mint/5 text-mint" : "border-red-300/20 bg-red-300/5 text-red-200"}`}>{verification.valid ? `Audit chain valid · ${verification.entries} entries checked` : `Audit chain broken at entry ${verification.broken_at}`}</div>}<section className="rounded-2xl border border-white/10 bg-panel/70 p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Immutable audit events</h2><p className="mt-1 text-xs text-slate-500">Login, document access, sharing, AI and administrative activity</p></div><span className="text-xs text-slate-500">{entries.length} loaded</span></div><div className="space-y-2">{entries.length ? entries.map(item => <div key={item.id} className="grid gap-2 rounded-xl border border-white/5 bg-white/[.03] p-3 sm:grid-cols-[1.3fr_.8fr_1fr_1.6fr] sm:items-center"><span className="text-xs font-semibold text-mint">{item.action}</span><span className="text-xs text-electric">{item.entity_type} #{item.entity_id || "—"}</span><span className="text-[11px] text-slate-400" title={item.created_at || ""}>{formatExactDateTime(item.created_at)}</span><span className="truncate font-mono text-[10px] text-slate-600">{item.entry_hash}</span></div>) : <ActivityList items={data.activities}/>}</div></section></>;
}
function PageTitle({eyebrow,title,subtitle,action}) { return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-3 text-[10px] font-bold tracking-[.22em] text-mint">{eyebrow}</div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1><p className="mt-2 text-sm text-slate-400">{subtitle}</p></div>{action}</div>; }
function Empty({icon:Icon,text}) { return <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-slate-500"><Icon size={28} className="mx-auto mb-3 opacity-50"/><p className="text-sm">{text}</p></div>; }

function SystemPage({ kind, system }) {
  const database = system?.database;
  const deployment = system?.deployment;
  const pages = {
    database: {
      eyebrow: "DATABASE OPERATIONS", title: "Data foundation", subtitle: "Live database health and record counts from the connected API.",
      icon: Database, cards: [
        ["Engine", database?.engine || "loading", "Connection driver"],
        ["Status", database?.status || "loading", "Live session"],
        ["Tables", database?.tables?.length || 0, "Managed tables"]
      ]
    },
    docker: {
      eyebrow: "CONTAINER DEPLOYMENT", title: "Ship consistently", subtitle: "The repository includes a production-shaped API and PostgreSQL Compose stack.",
      icon: Container, cards: [
        ["Container", deployment?.container_ready ? "Ready" : "Checking", "Dockerfile"],
        ["Database", "PostgreSQL 16", "Compose service"],
        ["Storage", "Named volumes", "Uploads and database"]
      ]
    },
    scripts: {
      eyebrow: "AUTOMATION SCRIPTS", title: "Repeatable operations", subtitle: "Use the checked-in PowerShell scripts to build, run and stop the workspace.",
      icon: TerminalSquare, cards: [
        ["Development", "Ready", "start-dev.ps1"],
        ["Frontend", "Ready", "build-frontend.ps1"],
        ["Docker", "Ready", "start-docker.ps1"]
      ]
    }
  };
  const page = pages[kind]; const Icon = page.icon;
  return <><PageTitle eyebrow={page.eyebrow} title={page.title} subtitle={page.subtitle} /><div className="grid gap-4 sm:grid-cols-3">{page.cards.map(([label,value,detail]) => <div key={label} className="rounded-2xl border border-white/10 bg-panel/70 p-5"><Icon size={19} className="mb-7 text-mint"/><div className="text-2xl font-black">{value}</div><div className="mt-1 text-sm text-slate-300">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>)}</div>{kind === "database" && <section className="mt-6 rounded-2xl border border-white/10 bg-panel/70 p-6"><h2 className="mb-4 font-bold">Managed tables</h2><div className="grid gap-2 sm:grid-cols-2">{(database?.tables || []).map(table => <div key={table} className="flex justify-between rounded-xl bg-white/[.03] px-4 py-3 text-sm"><span>{table}</span><span className="text-mint">active</span></div>)}</div><div className="mt-6 grid gap-3 sm:grid-cols-4">{Object.entries(database?.counts || {}).map(([name,count]) => <div key={name} className="rounded-xl border border-white/5 p-3"><div className="text-xl font-bold">{count}</div><div className="text-xs text-slate-500">{name}</div></div>)}</div></section>}{kind === "docker" && <CodePanel lines={["docker compose up --build", "http://localhost:8000", "docker compose down"]}/>} {kind === "scripts" && <div className="mt-6 grid gap-4 md:grid-cols-3"><CodePanel title="Development" lines={[".\\scripts\\start-dev.ps1"]}/><CodePanel title="Frontend build" lines={[".\\scripts\\build-frontend.ps1"]}/><CodePanel title="Docker stack" lines={[".\\scripts\\start-docker.ps1",".\\scripts\\stop-docker.ps1"]}/></div>}</>;
}

function CodePanel({ title = "Deployment commands", lines }) { return <section className="mt-6 rounded-2xl border border-white/10 bg-[#06101d] p-6"><h2 className="mb-4 font-bold">{title}</h2>{lines.map(line => <div key={line} className="mb-2 rounded-lg border border-white/5 bg-white/[.03] px-4 py-3 font-mono text-xs text-mint">{line}</div>)}</section>; }

function LoadingScreen() {
  return <div className="boot-screen">
    <div className="boot-grid" />
    <div className="boot-orbit boot-orbit-one" />
    <div className="boot-orbit boot-orbit-two" />
    <div className="boot-content">
    <div className="boot-mark boot-electric boot-logo">
      <div className="boot-mark-glow" />
      <div className="boot-electric-ring" />
      <img src="/static/lexora-logo.png" alt="NyayVault logo" />
    </div>
    <div className="boot-loader" aria-label="Loading secure workspace">
      <div className="boot-loader-flash" />
    </div>
    <div className="boot-brand">Nyay<span>Vault</span></div>
    <div className="boot-kicker">SECURE CASE INTELLIGENCE</div>
    <div className="boot-status"><span className="boot-status-dot" /> Establishing protected workspace</div>
      <div className="boot-pulse">ENCRYPTED · VERIFIED · READY</div>
    </div>
  </div>;
}

function Auth({onDone,notify}) {
  const [register,setRegister] = useState(true);
  const [forgot,setForgot] = useState(false);
  const [resetToken,setResetToken] = useState("");
  const [loading,setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [registrationNotice, setRegistrationNotice] = useState("");
  const submitResetRequest = async (event) => {
    event.preventDefault();
    setLoading(true);
    setAuthError("");
    setResetNotice("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const email = String(values.email || "").trim().toLowerCase();
    try {
      const result = await request("/auth/password-reset/request", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email}),
      });
      if (result.reset_token) {
        setResetToken(result.reset_token);
        setRegisteredEmail(email);
        setResetNotice("Reset token generated. Copy it below, then choose your new password.");
        notify("Reset token generated. It expires in 15 minutes.");
      } else {
        setResetNotice("No active account was found for that email. Register the account first, then request a reset.");
        notify(result.message);
      }
    } catch (error) {
      setAuthError(error.message);
    } finally { setLoading(false); }
  };
  const submitReset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setAuthError("");
    setResetNotice("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirm_password) {
      setAuthError("Passwords do not match");
      setLoading(false);
      return;
    }
    try {
      await request("/auth/password-reset/confirm", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({token: resetToken, password: String(values.password || "")}),
      });
      setForgot(false);
      setRegister(false);
      setResetToken("");
      notify("Password updated. Please sign in.");
    } catch (error) {
      setAuthError(error.message);
    } finally { setLoading(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setAuthError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.email = String(values.email || "").trim().toLowerCase();
    values.password = String(values.password || "");
    try {
      if (register) {
        await request("/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)});
        setRegisteredEmail(values.email);
        setRegister(false);
        setRegistrationNotice("Registration successful. Your account is ready. Sign in below to continue.");
        notify("Account created. Please sign in with your new account.");
        return;
      }
      const result = await request("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:values.email,password:values.password})});
      localStorage.setItem(tokenKey,result.access_token);
      onDone();
    } catch(error) {
      const message = error.message || "Unable to authenticate";
      setAuthError(message);
      notify(message);
    } finally {setLoading(false)}
  };
  return <div className="auth-shell">
    <div className="auth-ambient auth-ambient-one" />
    <div className="auth-ambient auth-ambient-two" />
    <div className="auth-grid" />
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-badge"><span className="auth-live-dot" /> PRIVATE EVIDENCE NETWORK</div>
        <h1>Move cases forward.<br /><span>Keep trust intact.</span></h1>
        <p className="auth-story-copy">A secure command center for sensitive legal records, investigation evidence, and the teams authorized to act on them.</p>
        <div className="auth-feature-list">
          <div><span><ShieldCheck size={16}/></span><div><strong>Protected by design</strong><small>AES encryption and signed document release</small></div></div>
          <div><span><Fingerprint size={16}/></span><div><strong>Chain of custody</strong><small>Hash-linked activity history for every action</small></div></div>
          <div><span><BrainCircuit size={16}/></span><div><strong>Intelligence at speed</strong><small>OCR and semantic search across your vault</small></div></div>
        </div>
        <div className="auth-story-footer"><span className="auth-check"><CheckCircle2 size={14}/> Integrity monitor active</span><span className="auth-mono">NYAYVAULT / 01</span></div>
      </section>
      <section className="auth-card">
        <div className="auth-card-top"><div className="auth-card-icon"><KeyRound size={19}/></div><div><div className="font-bold">Secure access</div><div className="text-xs text-slate-500">{PRODUCT_NAME} workspace</div></div><div className="auth-lock"><FileLock2 size={15}/></div></div>
        <div className="auth-card-kicker">{forgot ? "ACCOUNT RECOVERY" : register ? "NEW WORKSPACE IDENTITY" : "AUTHORIZED PERSONNEL ONLY"}</div>
        <h2>{forgot ? (resetToken ? "Set a new password" : "Forgot your password?") : register ? "Create your account" : "Welcome back"}</h2>
        <p className="auth-card-copy">{forgot ? (resetToken ? "Choose a new password for your workspace account." : "Enter your work email to generate a one-time reset token.") : register ? "Set up an authorized workspace identity." : "Sign in to continue to your protected evidence workspace."}</p>
        {registrationNotice && !register && !forgot && <div role="status" className="mt-4 rounded-xl border border-mint/25 bg-mint/10 px-3 py-3 text-xs leading-5 text-mint"><div className="font-bold">Registration successful</div><div className="mt-1 text-slate-400">{registrationNotice.replace("Registration successful. ", "")}</div></div>}
        {forgot && !resetToken && <form key="forgot-request" onSubmit={submitResetRequest} className="auth-form">
          <label>Work email<input name="email" required type="email" autoComplete="email" placeholder="name@organization.gov" /></label>
          <button type="submit" disabled={loading}>{loading ? "Generating…" : "Generate reset token"} <ArrowUpRight size={15}/></button>
        </form>}
        {resetNotice && <div role="status" className={`mt-4 rounded-xl border px-3 py-2 text-xs leading-5 ${resetToken ? "border-mint/20 bg-mint/5 text-mint" : "border-amber-300/20 bg-amber-300/10 text-amber-200"}`}>{resetNotice}</div>}
        {forgot && resetToken && <form key="forgot-confirm" onSubmit={submitReset} className="auth-form">
          <label>One-time reset token<input value={resetToken} readOnly onFocus={event => event.target.select()} className="font-mono text-[11px]" aria-label="One-time reset token" /></label>
          <label>New password<input name="password" required minLength="8" type="password" autoComplete="new-password" placeholder="Minimum 8 characters" /></label>
          <label>Confirm password<input name="confirm_password" required minLength="8" type="password" autoComplete="new-password" placeholder="Repeat your new password" /></label>
          <button type="submit" disabled={loading}>{loading ? "Updating…" : "Update password"} <ArrowUpRight size={15}/></button>
        </form>}
        {!forgot && <form key={register ? "register" : "login"} onSubmit={submit} className="auth-form">
          {register && <label>Full name<input name="full_name" required placeholder="Your name" /></label>}
          {register && <label>Role<select name="role" defaultValue="investigator"><option value="police">Police officer</option><option value="investigator">Investigator</option><option value="forensic_officer">Forensic officer</option><option value="prosecutor">Prosecutor</option><option value="judicial_user">Judicial user</option><option value="court_officer">Court officer</option></select></label>}
          {register && <label>Department<select name="department" defaultValue="investigations"><option value="investigations">Investigations</option><option value="police">Police</option><option value="forensics">Forensics</option><option value="prosecution">Prosecution</option><option value="court">Court</option><option value="public">Public assistance</option></select></label>}
          <label>Work email<input name="email" required type="email" autoComplete="email" defaultValue={!register ? registeredEmail : ""} placeholder="name@organization.gov" /></label>
          <label>Password<input name="password" required minLength="8" type="password" autoComplete={register ? "new-password" : "current-password"} placeholder="Minimum 8 characters" /></label>
          <button type="submit" disabled={loading}>{loading ? "Authenticating…" : <>{register ? "Create account" : "Enter secure workspace"} <ArrowUpRight size={15}/></>}</button>
        </form>
        }
        {authError && <div role="alert" className="mt-3 rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{authError}</div>}
        <div className="auth-note"><ShieldCheck size={14}/> Your session is protected with role-based access control.</div>
        {forgot ? <button type="button" onClick={() => { setForgot(false); setResetToken(""); setAuthError(""); }} className="auth-switch">Back to sign in <ChevronRight size={13}/></button> : <>{!register && <button type="button" onClick={() => { setForgot(true); setAuthError(""); }} className="auth-switch">Forgot password? <ChevronRight size={13}/></button>}<button type="button" onClick={() => { setRegister(!register); setAuthError(""); }} className="auth-switch">{register ? "I already have an account" : "Create a new account"} <ChevronRight size={13}/></button></>}
      </section>
    </div>
  </div>;
}

function CreateCase({onClose,onDone}) { const [busy,setBusy] = useState(false); const submit = async (event) => { event.preventDefault(); setBusy(true); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await request("/cases",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)}); onDone(); } catch(error) { alert(error.message); } finally { setBusy(false); } }; return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-5 backdrop-blur-md"><form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-white/10 bg-panel p-7 shadow-2xl"><div className="mb-6 flex items-start justify-between"><div><div className="mb-2 text-[10px] font-bold tracking-[.2em] text-mint">CASE WORKSPACE</div><h2 className="text-2xl font-black">Create new case</h2><p className="mt-1 text-sm text-slate-400">Start a controlled case record for authorized teams.</p></div><button type="button" onClick={onClose} className="text-slate-500 hover:text-white"><X/></button></div><div className="grid gap-3 sm:grid-cols-2"><input required name="case_number" placeholder="Case ID e.g. CASE-2026-0142" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"/><input name="fir_number" placeholder="FIR number (optional)" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"/><input required name="title" placeholder="Case title" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"/><input name="police_station" placeholder="Police station" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"/><select name="sensitivity" defaultValue="confidential" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"><option value="restricted">Restricted</option><option value="confidential">Confidential</option><option value="highly_sensitive">Highly sensitive</option></select><select name="status" defaultValue="active" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"><option value="active">Active</option><option value="pending">Pending</option><option value="closed">Closed</option></select></div><button disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-mint py-3 text-sm font-bold text-ink disabled:opacity-40">{busy ? "Creating secure workspace…" : "Create case workspace"}</button></form></div>; }

function Upload({onClose,onDone}) {
  const input = useRef();
  const [file,setFile] = useState(null);
  const [title,setTitle] = useState("");
  const [type,setType] = useState("investigation");
  const [caseId,setCaseId] = useState("");
  const [sensitivity,setSensitivity] = useState("confidential");
  const [description,setDescription] = useState("");
  const [tags,setTags] = useState("");
  const [cases,setCases] = useState([]);
  const [busy,setBusy] = useState(false);
  useEffect(() => { request("/cases").then(setCases).catch(() => setCases([])); }, []);
  const submit = async (event) => {
    event.preventDefault();
    if(!file) return;
    setBusy(true);
    const form = new FormData();
    form.append("document",file);
    form.append("title",title || file.name.replace(/\.[^.]+$/,""));
    form.append("document_type",type);
    form.append("sensitivity",sensitivity);
    form.append("description",description);
    form.append("tags",tags);
    if (caseId) form.append("case_id",caseId);
    try { await request("/documents/upload",{method:"POST",body:form}); onDone(); }
    catch(error) { alert(error.message); }
    finally {setBusy(false);}
  };
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/80 p-5 backdrop-blur-md"><form onSubmit={submit} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-panel p-7 shadow-2xl"><div className="mb-6 flex items-start justify-between"><div><div className="mb-2 text-[10px] font-bold tracking-[.2em] text-mint">SECURE INGESTION</div><h2 className="text-2xl font-black">Add legal record</h2><p className="mt-1 text-sm text-slate-400">OCR, encryption, hashing and signature are applied before storage.</p></div><button type="button" onClick={onClose} className="text-slate-500 hover:text-white"><X/></button></div><button type="button" onClick={() => input.current.click()} className="w-full rounded-2xl border border-dashed border-mint/30 bg-mint/[.04] p-8 text-center transition hover:bg-mint/[.08]"><UploadCloud size={30} className="mx-auto mb-3 text-mint"/><div className="text-sm font-semibold">{file ? file.name : "Choose a file to protect"}</div><div className="mt-1 text-xs text-slate-500">PDF, DOCX, image or text · up to 25 MB</div></button><input ref={input} type="file" hidden accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" onChange={event => setFile(event.target.files[0])}/><div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Document title" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none focus:border-mint/50"/><select value={type} onChange={event => setType(event.target.value)} className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"><option value="fir">FIR report</option><option value="witness">Witness / victim statement</option><option value="evidence">Evidence / call record</option><option value="forensic">Forensic report</option><option value="charge_sheet">Charge sheet</option><option value="court_filing">Court filing</option><option value="judgment">Judgment</option><option value="investigation">Investigation record</option></select><select value={caseId} onChange={event => setCaseId(event.target.value)} className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"><option value="">No case association</option>{cases.map(item => <option key={item.id} value={item.id}>{item.case_number} · {item.title}</option>)}</select><select value={sensitivity} onChange={event => setSensitivity(event.target.value)} className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none"><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option><option value="highly_sensitive">Highly sensitive</option></select><input value={tags} onChange={event => setTags(event.target.value)} placeholder="Tags: cybercrime, exhibit-A, urgent" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none sm:col-span-2"/><textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Description or handling notes" rows="3" className="rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm outline-none sm:col-span-2"/></div><button disabled={!file || busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-mint py-3 text-sm font-bold text-ink disabled:opacity-40">{busy ? "OCR, encrypting and signing…" : <><FileLock2 size={16}/> Protect document</>}</button></form></div>;
}

createRoot(document.getElementById("root")).render(<App />);
