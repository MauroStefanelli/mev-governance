import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getConfiguratoreContracts,
  upsertConfiguratoreContract,
  getConfiguratoreRecords,
  upsertConfiguratoreRecord,
  deleteConfiguratoreRecord,
  analyzeInitiativeWithAi,
} from "../services/mevService";
import JSZip from "jszip";
import {
  euro,
  esc,
  appNorm,
  ensurePdfLoader,
  parseCatalogPdf,
  parseTowPriceFile,
  parseInitiativeWorkbook,
  applicationContextFor,
  scoreIntervention,
  reasonFor,
  validComplexities,
  defaultPrice,
  calc,
  suggestionRules,
  APP_DATA,
  DEFAULT_APPLICATIONS,
  codeChangePrompt,
  implementationDocument,
  sourceFileAllowed,
  ignoredSourcePath,
  evaluationSystems,
  evaluationApplicationCodes,
  applicationsFor,
  saveApplications,
  applicationIdentity,
} from "../configuratore/configuratoreCore";

const STEPS = ["Iniziativa", "Interventi", "Offerta", "Revisione"];

function ConfiguratorePage({ onUnauthorized }) {
  const [contracts, setContracts] = useState([]);
  const [selectedContractId, setSelectedContractId] = useState("poste-tet-2025");
  const [lot, setLot] = useState("1");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const [showContractForm, setShowContractForm] = useState(false);
  const [contractForm, setContractForm] = useState({ name: "", rulesFile: "", lots: [{ id: "1", name: "", catalogFile: null, priceFile: null, tow5Share: 65 }] });

  const [initiative, setInitiative] = useState({ code: "", title: "", system: "", release: "", requirements: "", description: "" });
  const [importedInterventions, setImportedInterventions] = useState([]);
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [contingency, setContingency] = useState(0);
  const [tow, setTow] = useState({});
  const [towPercentages, setTowPercentages] = useState({});
  const [priceMode] = useState("historical");
  const [aiProposals, setAiProposals] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [archiveRecords, setArchiveRecords] = useState([]);
  const [economyNotes, setEconomyNotes] = useState("");
  const [sourceWorkbookName, setSourceWorkbookName] = useState("");
  const [mappedLoading, setMappedLoading] = useState(false);

  // ── Sviluppo ──
  const [implementationFiles, setImplementationFiles] = useState([]);
  const [codeChangeTool, setCodeChangeTool] = useState("vscode");
  const [implementationBranch, setImplementationBranch] = useState("");
  const [implementationApprovalNotes, setImplementationApprovalNotes] = useState("");
  const [implementationTests, setImplementationTests] = useState("");
  const [devBusy, setDevBusy] = useState(false);

  // ── Applicativi ──
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationDraft, setApplicationDraft] = useState(null);
  const [applications, setApplications] = useState([]);

  const toastTimer = useRef(null);
  const toast = (m) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  };

  // ── Contratti ──
  const activeContract = useMemo(
    () => contracts.find((c) => c.contractId === selectedContractId) || contractToApp(contracts.find((c) => c.contractId === selectedContractId)) || null,
    [contracts, selectedContractId]
  );

  useEffect(() => { ensurePdfLoader().catch(() => {}); }, []);

  useEffect(() => {
    const current = applicationsFor(selectedContractId, lot, !!activeContract?.builtin);
    setApplications(current);
    setApplicationDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContractId, lot]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getConfiguratoreContracts(), getConfiguratoreRecords({ entity_type: "initiative_evaluation" })])
      .then(([c, r]) => {
        if (!alive) return;
        setContracts(c);
        setArchiveRecords(r.records || []);
      })
      .catch((err) => {
        if (err && (err.status === 401 || err.status === 403)) return onUnauthorized();
        setError("Impossibile caricare i dati del Configuratore Offerta");
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []); // eslint-disable-line

  const builtinContract = useMemo(() => {
    const catalogo = (APP_DATA.cataloghi || {})["1"] || [];
    const b = {
      contractId: "poste-tet-2025",
      name: "Poste TeT (built-in)",
      rulesFile: "",
      builtin: true,
      lots: [
        {
          lotId: "1",
          name: "Lotto 1 – Postali",
          catalog: catalogo,
          towPrices: (APP_DATA.tow_prices || {})["1"] || {},
          tow5Share: 65,
          active: true,
          codiceContratto: "",
        },
        {
          lotId: "2",
          name: "Lotto 2 – TOW",
          catalog: (APP_DATA.cataloghi || {})["2"] || catalogo,
          towPrices: (APP_DATA.tow_prices || {})["2"] || {},
          tow5Share: 65,
          active: true,
          codiceContratto: "",
        },
      ],
    };
    return b;
  }, []);

  function contractToApp(c) {
    if (!c) return null;
    return {
      contractId: c.contractId,
      name: c.name,
      rulesFile: c.rulesFile,
      builtin: !!c.builtin,
      lots: (c.lots || []).map((l) => ({
        lotId: String(l.lotId),
        name: l.name || `Lotto ${l.lotId}`,
        catalog: l.catalog || [],
        towPrices: l.towPrices || {},
        tow5Share: l.tow5Share ?? 65,
        active: l.active !== false,
        codiceContratto: l.codiceContratto || "",
        towImpact: l.towImpact || {},
      })),
    };
  }

  const allContracts = useMemo(() => {
    const list = contracts.map(contractToApp);
    return [builtinContract, ...list.filter((c) => c.contractId !== "poste-tet-2025")];
  }, [contracts, builtinContract]);

  const activeLot = useMemo(() => {
    const c = activeContract || builtinContract;
    if (!c) return null;
    const lots = (c.lots || []).filter((l) => l.active !== false && l.lotId === lot);
    return lots[0] || (c.lots || []).filter((l) => l.active !== false)[0] || c.lots?.[0] || null;
  }, [activeContract, builtinContract, lot]);

  const catalog = useMemo(() => activeLot?.catalog || [], [activeLot]);
  const towPricesMap = useMemo(() => activeLot?.towPrices || {}, [activeLot]);
  const tow5Share = useMemo(() => Number(activeLot?.tow5Share ?? 65), [activeLot]);

  // Pre-popola towPercentages dal towImpact del lotto quando cambia il contratto/lotto attivo.
  // Non sovrascrive se l'utente ha già modificato manualmente (solo al cambio di activeLot).
  useEffect(() => {
    if (!activeLot?.towImpact) return;
    const imp = activeLot.towImpact;
    if (Object.keys(imp).length === 0) return;
    setTowPercentages(prev => {
      const existing = prev?.[selectedContractId]?.[lot] || {};
      // Applica solo se l'utente non ha già impostato valori non-zero
      const hasUserValues = Object.values(existing).some(v => Number(v) > 0);
      if (hasUserValues) return prev;
      return {
        ...prev,
        [selectedContractId]: {
          ...(prev?.[selectedContractId] || {}),
          [lot]: { 1: Number(imp['1']) || 0, 3: Number(imp['3']) || 0, 4: Number(imp['4']) || 0 },
        },
      };
    });
  }, [activeLot]); // eslint-disable-line

  // ── Persist contratti ──
  const persistContract = async (contract) => {
    const lots = Object.fromEntries(
      (contract.lots || []).map((l) => [
        String(l.lotId),
        {
          name: l.name,
          catalogFile: l.catalogFile || "",
          priceFile: l.priceFile || "",
          tow5Share: l.tow5Share,
          active: l.active !== false,
          codiceContratto: l.codiceContratto || "",
        },
      ])
    );
    await upsertConfiguratoreContract({
      contract_id: contract.contractId,
      name: contract.name,
      rules_file: contract.rulesFile || "",
      builtin: !!contract.builtin,
      lot_states: lots,
    });
  };

  const handleSelectContract = async (id) => {
    setSelectedContractId(id);
    setLot((allContracts.find((c) => c.contractId === id)?.lots || [])[0]?.lotId || "1");
    setStep(1);
    resetInitiative();
  };

  // ── Form contratto ──
  const updateContractLotField = (idx, patch) => {
    setContractForm((f) => ({
      ...f,
      lots: f.lots.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const saveContract = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const lots = {};
      for (const box of contractForm.lots) {
        if (!box.catalogFile || !box.priceFile) throw new Error(`File mancanti per il Lotto ${box.id}`);
        const catalogData = await parseCatalogPdf(box.catalogFile, box.id);
        const towPriceData = await parseTowPriceFile(box.priceFile, box.id);
        lots[String(box.id)] = {
          lotId: String(box.id),
          name: box.name || `Lotto ${box.id}`,
          catalogFile: box.catalogFile.name,
          priceFile: box.priceFile.name,
          catalog: catalogData,
          towPrices: towPriceData,
          tow5Share: Number(box.tow5Share) || 0,
          active: true,
          codiceContratto: "",
        };
      }
      const contract = {
        contractId: "contract-" + Date.now(),
        name: contractForm.name.trim(),
        rulesFile: contractForm.rulesFile?.name || "",
        builtin: false,
        lots: Object.values(lots),
      };
      await persistContract(contract);
      const refreshed = await getConfiguratoreContracts();
      setContracts(refreshed);
      setShowContractForm(false);
      setContractForm({ name: "", rulesFile: "", lots: [{ id: "1", name: "", catalogFile: null, priceFile: null, tow5Share: 65 }] });
      toast("Contratto importato e salvato nel database");
    } catch (err) {
      toast("Configurazione non riuscita: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Sincronizzazioni DB del posto di lavoro ──
  const loadInitiativeHistory = useCallback(async () => {
    try {
      const data = await getConfiguratoreRecords({
        entity_type: "initiative_evaluation",
        contract_id: selectedContractId,
        lot_id: lot,
      });
      return data.records || [];
    } catch {
      return [];
    }
  }, [selectedContractId, lot]);

  const persistInitiativeEvaluation = async (showMessage = true) => {
    if (!initiative.code && !initiative.title) {
      if (showMessage) toast("Inserisci almeno codice o titolo dell'iniziativa");
      return false;
    }
    const systems = [...new Set([initiative.system, ...importedInterventions.map((x) => x.sistema)].filter(Boolean))];
    const keyPart = appNorm(initiative.code || initiative.title).replace(/ /g, "-");
    const body = {
      record_key: `${selectedContractId}|${lot}|initiative|${keyPart}`,
      entity_type: "initiative_evaluation",
      contract_id: selectedContractId,
      lot_id: String(lot),
      title: `${initiative.code ? initiative.code + " · " : ""}${initiative.title}`,
      payload: {
        version: 6,
        contractId: selectedContractId,
        contractName: activeContract?.name || "",
        lot,
        priceMode,
        sourceWorkbookName,
        initiative,
        importedInterventions,
        items,
        tow,
        discount,
        contingency,
        economicNotes: economyNotes,
        savedAt: new Date().toISOString(),
        systems,
      },
    };
    try {
      await upsertConfiguratoreRecord(body);
      if (showMessage) toast("Valutazione salvata e resa disponibile alle stime future");
      return true;
    } catch (error) {
      toast("Salvataggio non riuscito: " + error.message);
      return false;
    }
  };

  // ── Reset / iniziativa ──
  const resetInitiative = () => {
    setInitiative({ code: "", title: "", system: "", release: "", requirements: "", description: "" });
    setImportedInterventions([]);
    setItems([]);
    setSuggestions([]);
    setTow({});
    setDiscount(0);
    setContingency(0);
    setAiProposals(null);
    setEconomyNotes("");
    setSourceWorkbookName("");
  };

  // ── Step 1: import Excel ──
  const handleImportExcel = async (file) => {
    if (!file) return;
    setMappedLoading(true);
    try {
      const parsed = await parseInitiativeWorkbook(file, catalog);
      if (parsed.lot && allContracts.find((c) => c.contractId === selectedContractId)?.lots?.some((l) => l.active !== false && String(l.lotId) === parsed.lot)) {
        setLot(parsed.lot);
      }
      setImportedInterventions(parsed.interventions);
      setItems(parsed.items);
      setSuggestions([]);
      setSourceWorkbookName(parsed.fileName);
      setInitiative((i) => ({
        ...i,
        code: parsed.code || i.code,
        title: parsed.title || i.title,
        system: parsed.systems || i.system,
        requirements: parsed.requirements || i.requirements,
        description: parsed.description || i.description,
      }));
      toast(`${parsed.interventions.length} interventi e ${parsed.items.length} dettagli importati; verifico possibili integrazioni`);
      await runGapAnalysis(parsed.interventions, parsed.items);
    } catch (err) {
      toast("Importazione non riuscita: " + err.message);
    } finally {
      setMappedLoading(false);
    }
  };

  // ── Step 2: gap analysis (port da analyzeImportedGaps) ──
  const runGapAnalysis = async (interventions, already = items) => {
    const suggestions = [];
    for (const intervention of interventions) {
      const history = await loadInitiativeHistory();
      const historicalCounts = new Map();
      history.forEach((rec) => {
        const payload = typeof rec.payload === "string" ? safeParse(rec.payload) : rec.payload || {};
        const sys = payload.initiative?.system || rec.payload?.system || "";
        if (appNorm(sys) && appNorm(intervention.sistema) && appNorm(intervention.sistema).includes(appNorm(sys))) {
          (payload.items || []).forEach((x) => historicalCounts.set(x.id, (historicalCounts.get(x.id) || 0) + 1));
        }
      });
      const detailText = (intervention.mappings || []).flatMap((m) => [m.name, m.componentApplication, m.technology, m.unitName, m.detailDescription, m.ambit]).join(" ");
      const profileCatalogIds = [];
      const apps = applicationContextFor(intervention.sistema, DEFAULT_APPLICATIONS[lot]);
      apps.forEach((a) => {
        const techs = [...(a.languages || []), ...(a.databases || []), ...(a.extraTechnologies || [])];
        catalog.forEach((c) => {
          if (techs.some((t) => appNorm(t) && (appNorm(c.nome) + appNorm(c.descrizione)).includes(appNorm(t)))) profileCatalogIds.push(c.id);
        });
      });
      const appText = applicationsText(apps);
      const { scores } = scoreIntervention({ intervention, detailText, catalog, applicationContextText: appText, historicalCounts, profileCatalogIds });
      [...scores]
        .map(([id, score]) => ({ c: catalog.find((x) => x.id === id), score }))
        .filter((x) => x.c && !new Set((intervention.mappings || []).map((m) => m.catalogId)).has(x.c.id) && x.score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .forEach(({ c, score }) => {
          const source = [intervention.titolo, intervention.descrizione, intervention.attivita, detailText, appText].join(" ").toLowerCase();
          suggestions.push({
            id: c.id,
            selected: false,
            type: source.match(/modific|adegua|evoluz|rientro/) ? "MODIFICA" : "REALIZZAZIONE",
            complexity: "Medio",
            qty: 1,
            score,
            reason: `Possibile voce aggiuntiva per ${intervention.id}: ${reasonFor(c, source)}`,
            interventionId: intervention.id,
            interventionTitle: intervention.titolo,
          });
        });
    }
    setSuggestions(suggestions);
  };

  const safeParse = (s) => {
    try { return JSON.parse(s); } catch { return {}; }
  };

  const applicationsText = (apps) =>
    apps
      .map((a) => `${a.name || ""} ${[...(a.languages || []), ...(a.databases || []), ...(a.extraTechnologies || [])].join(" ")} ${a.notes || ""}`)
      .join(" ");

  // ── Step 2: analyze (port da analyze r.328) ──
  const analyze = async () => {
    const source = [initiative.title, initiative.system, initiative.description, applicationsText(applicationContextFor(initiative.system, DEFAULT_APPLICATIONS[lot]))].join(" ").toLowerCase();
    if (source.replace(/\s/g, "").length < 20) {
      toast("Inserisci una descrizione più dettagliata");
      return;
    }
    const scores = new Map();
    suggestionRules.forEach((r) => {
      const hits = r.words.filter((w) => source.includes(w));
      if (hits.length) r.ids.forEach((id) => scores.set(id, (scores.get(id) || 0) + hits.length * 2));
    });
    catalog.forEach((c) => {
      const hay = (c.nome + " " + c.ambito + " " + c.descrizione).toLowerCase();
      const tokens = [...new Set(source.match(/[a-zà-ù0-9]{5,}/g) || [])];
      const hits = tokens.filter((t) => hay.includes(t)).length;
      if (hits) scores.set(c.id, (scores.get(c.id) || 0) + Math.min(hits, 5));
    });
    let ranked = [...scores].map(([id, score]) => ({ c: catalog.find((x) => x.id === id), score })).filter((x) => x.c).sort((a, b) => b.score - a.score).slice(0, 10);
    if (!ranked.length) ranked = catalog.slice(0, 6).map((c) => ({ c, score: 1 }));
    setSuggestions(
      ranked.map(({ c, score }, i) => ({
        id: c.id,
        selected: i < Math.min(4, ranked.length),
        type: source.match(/modific|adegua|evoluz|rientro/) ? "MODIFICA" : "REALIZZAZIONE",
        complexity: "Medio",
        qty: 1,
        score,
        reason: reasonFor(c, source),
      }))
    );
    setStep(2);
  };

  // ── AI: secondo parere (port da aiAnalysisContext + analyzeWithAi) ──

  // Legge i file sorgente (max 40KB totali) per includerli nel contesto AI
  const readSourceSnippets = async () => {
    if (!implementationFiles.length) return [];
    const CODE_EXTS = /\.(js|jsx|ts|tsx|java|py|cs|go|rb|php|vue|html|css|xml|json|yaml|yml|md|sql)$/i;
    const relevant = [...implementationFiles].filter(f => CODE_EXTS.test(f.name)).slice(0, 30);
    const MAX_TOTAL = 40000; // ~40KB
    let total = 0;
    const snippets = [];
    for (const f of relevant) {
      if (total >= MAX_TOTAL) break;
      try {
        const text = await f.text();
        const slice = text.slice(0, Math.min(3000, MAX_TOTAL - total));
        snippets.push({ file: f.webkitRelativePath || f.name, content: slice, truncated: text.length > slice.length });
        total += slice.length;
      } catch { /* skip unreadable */ }
    }
    return snippets;
  };

  const buildAiContext = async () => {
    const sourceSnippets = await readSourceSnippets();
    return {
      contract: { id: selectedContractId, name: activeContract?.name || "" },
      lot,
      initiative,
      catalog: catalog.map((c) => ({ id: c.id, name: c.nome, area: c.ambito, description: c.descrizione || "", prices: c.prezzi || c.price || {} })),
      excelInterventions: importedInterventions.map((x) => ({
        id: x.interventionId || x.id,
        title: x.titolo || x.title || "",
        description: x.descrizione || x.description || "",
        activity: x.attivita || x.activity || "",
        quantity: x.qty || x.quantity || 1,
        catalogId: x.catalogId || x.idCatalogo || null,
        notes: x.notes || "",
      })),
      currentSuggestions: suggestions.map((s) => ({
        catalogId: s.id,
        selected: s.selected,
        type: s.type,
        complexity: s.complexity,
        quantity: s.qty,
        rationale: s.reason,
        additionalInfo: s.additionalInfo || "",
        notes: s.notes || "",
      })),
      applicationContext: applicationContextFor(initiative.system, DEFAULT_APPLICATIONS[lot]).map((a) => ({
        code: a.code,
        name: a.name,
        technologies: [...(a.languages || []), ...(a.databases || []), ...(a.extraTechnologies || [])],
        notes: a.notes || "",
        codeUrl: a.codeUrl || "",
      })),
      // Snippets del codice sorgente per verifica tecnica
      sourceCode: sourceSnippets,
      priorEvaluations: [],
    };
  };

  const analyzeWithAi = async () => {
    setAiBusy(true);
    setError("");
    try {
      const ctx = await buildAiContext();
      const data = await analyzeInitiativeWithAi(ctx);
      const proposals = (data.analysis?.proposals || [])
        .filter((p) => catalog.some((c) => String(c.id) === String(p.catalogId)))
        .map((p, i) => ({ ...p, apply: p.action !== "exclude", _index: i }));
      setAiProposals({ analysis: data.analysis, provider: data.provider, model: data.model, proposals });
    } catch (err) {
      setError("Analisi AI non riuscita: " + (err.message || err));
    } finally {
      setAiBusy(false);
    }
  };

  const applyAiProposals = () => {
    const next = [...suggestions];
    aiProposals.proposals
      .filter((p) => p.apply)
      .forEach((p) => {
        const catalogItem = catalog.find((x) => String(x.id) === String(p.catalogId));
        if (!catalogItem) return;
        let s = next.find((x) => String(x.id) === String(p.catalogId));
        if (!s) {
          s = { id: catalogItem.id, selected: true, type: "MODIFICA", complexity: "Medio", qty: 1, score: 0, reason: "" };
          next.push(s);
        }
        s.selected = true;
        s.type = p.type === "REALIZZAZIONE" ? "REALIZZAZIONE" : "MODIFICA";
        s.complexity = p.complexity || "Medio";
        s.qty = Math.max(0.01, Number(p.quantity) || 1);
        s.reason = p.rationale || s.reason;
        s.additionalInfo = [s.additionalInfo, p.additionalInfo, "Validato tramite secondo parere AI"].filter(Boolean).join(" · ");
      });
    setSuggestions(next);
    setAiProposals(null);
    toast("Proposte AI applicate; resta possibile modificarle manualmente");
  };

  // ── Step 3: compose (port da compose r.379) ──
  const compose = () => {
    const imported = items.filter((x) => x.imported);
    const added = suggestions.filter((s) => s.selected).map((s, i) => ({ ...s, key: Date.now() + i, unit: null, imported: false }));
    setItems([...imported, ...added]);
    setStep(3);
  };

  const addManualItem = (c) => {
    // In Step 2 aggiunge alle suggestions (selezionata); in Step 3 aggiunge direttamente agli items
    if (step === 2) {
      setSuggestions((prev) => {
        const existing = prev.find((s) => s.id === c.id);
        if (existing) {
          // Già presente: assicura che sia selezionata
          return prev.map((s) => s.id === c.id ? { ...s, selected: true } : s);
        }
        return [
          ...prev,
          {
            id: c.id,
            selected: true,
            type: "REALIZZAZIONE",
            complexity: validComplexities(c, "REALIZZAZIONE")[0] || "Medio",
            qty: 1,
            score: 1,
            reason: "Voce aggiunta manualmente dal catalogo.",
            interventionId: "__MANUALE__",
          },
        ];
      });
    } else {
      setItems((prev) => [
        ...prev,
        {
          id: c.id,
          type: "REALIZZAZIONE",
          complexity: validComplexities(c, "REALIZZAZIONE")[0] || "Medio",
          qty: 1,
          score: 0,
          reason: "Voce aggiunta manualmente dal catalogo.",
          key: Date.now(),
          unit: null,
          imported: false,
        },
      ]);
    }
  };

  const updateItem = (key, patch) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const removeItem = (key) => setItems((prev) => prev.filter((it) => it.key !== key));

  // ── Calcolo ──
  const calculation = useMemo(
    () =>
      calc({
        items: items.map((it) => ({
          ...it,
          unit: it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: !!activeContract?.builtin }),
        })),
        lot,
        contractId: selectedContractId,
        tow5Share,
        towPercentages,
        tow,
        discount,
        contingency,
        catalog,
        priceMode,
        builtin: !!activeContract?.builtin,
      }),
    [items, lot, selectedContractId, tow5Share, towPercentages, tow, discount, contingency, catalog, priceMode, activeContract]
  );

  const mappingCount = useMemo(() => importedInterventions.reduce((n, x) => n + (x.mappings?.length || 0), 0), [importedInterventions]);
  const tow5Total = useMemo(() => importedInterventions.reduce((n, x) => n + (Number(x.tow5) || 0), 0), [importedInterventions]);

  // ── Archivio ──
  const loadArchive = useCallback(() => {
    getConfiguratoreRecords({ entity_type: "initiative_evaluation" })
      .then((d) => setArchiveRecords(d.records || []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadArchive(); }, [loadArchive]);

  const deleteArchiveRecord = async (id) => {
    if (!window.confirm("Eliminare definitivamente questa iniziativa memorizzata?")) return;
    try {
      await deleteConfiguratoreRecord(id);
      loadArchive();
      toast("Iniziativa eliminata");
    } catch (error) {
      toast("Eliminazione non riuscita: " + error.message);
    }
  };

  const reworkInitiative = (record) => {
    const payload = typeof record.payload === "string" ? safeParse(record.payload) : record.payload || {};
    setSelectedContractId(record.contract_id || payload.contractId || selectedContractId);
    setLot(String(record.lot_id || payload.lot || lot));
    if (payload.initiative) setInitiative(payload.initiative);
    if (payload.importedInterventions) setImportedInterventions(payload.importedInterventions);
    if (payload.items) setItems(payload.items);
    if (payload.tow) setTow(payload.tow);
    if (payload.towPercentages) setTowPercentages(payload.towPercentages);
    if (payload.discount != null) setDiscount(payload.discount);
    if (payload.contingency != null) setContingency(payload.contingency);
    if (payload.economicNotes) setEconomyNotes(payload.economicNotes);
    if (payload.sourceWorkbookName) setSourceWorkbookName(payload.sourceWorkbookName);
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Applicativi (port da addApplicationV39/saveApplication/delete r.159-160) ──
  const addApplicationV39 = () => {
    const name = window.prompt("Nome dell'applicativo (es. NPSO)");
    if (!name) return;
    const existing = applications.find((a) => appNorm(a.name) === appNorm(name));
    if (existing) {
      setApplicationDraft({ ...existing });
      toast("Applicativo già esistente: puoi completare codice AP e repository");
      return;
    }
    const app = { id: "application-" + Date.now(), code: "", name: name.trim(), codeUrl: "", codeLoadedAt: null, systemAliases: [name.trim()], ambiti: [], components: [], operatingSystems: [], databases: [], languages: [], extraTechnologies: [], notes: "" };
    const next = [...applications, app];
    setApplications(next);
    saveApplications(selectedContractId, lot, next);
    setApplicationDraft(app);
    toast("Applicativo creato: associa ora codice AP e repository");
  };

  const saveApplicationDraft = () => {
    if (!applicationDraft) return;
    if (!applicationDraft.name) { toast("Inserisci il nome dell'applicativo"); return; }
    const idx = applications.findIndex((a) => applicationIdentity(a) === applicationIdentity(applicationDraft));
    const next = [...applications];
    if (idx >= 0) next[idx] = applicationDraft; else next.push(applicationDraft);
    setApplications(next);
    saveApplications(selectedContractId, lot, next);
    setApplicationDraft(null);
    toast(`Applicativo ${applicationDraft.name} salvato${applicationDraft.code ? " con " + applicationDraft.code : ""}`);
  };

  const deleteApplication = (a) => {
    if (!window.confirm(`Eliminare l'applicativo ${a.name}?`)) return;
    const next = applications.filter((x) => applicationIdentity(x) !== applicationIdentity(a));
    setApplications(next);
    saveApplications(selectedContractId, lot, next);
    setApplicationDraft(null);
    toast("Applicativo eliminato");
  };

  const safeAppUrl = (url) => { try { const u = new URL(url, window.location.origin); return (u.protocol === "http:" || u.protocol === "https:") ? u.href : ""; } catch { return ""; } };

  // ── Sviluppo: repository + ZIP richiesta codice (port da generateCodeChangeRequest r.244) ──
  const selectImplementationRepository = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.onchange = () => {
      if (!input.files.length) return;
      setImplementationFiles([...input.files]);
      toast("Repository collegato: " + input.files.length + " file selezionati");
    };
    input.click();
  };

  const approvedInterventionsFor = () =>
    [...suggestions.filter((s) => s.selected && s.approved !== false), ...items.filter((it) => it.selected || it.imported)].map((x, i) => ({
      key: x.key || "s" + i,
      id: x.id,
      name: catalog.find((c) => c.id === x.id)?.nome || x.name || x.id,
      type: x.type,
      complexity: x.complexity,
      quantity: x.qty,
      reason: x.reason || "",
      additionalInfo: x.additionalInfo || "",
      interventionId: x.interventionId || "",
    }));

  const generateCodeChangeRequest = async () => {
    const r = activeContract;
    const payload = {};
    const selected = approvedInterventionsFor();
    if (!r || !selected.length) {
      toast("Approva prima almeno un intervento");
      return;
    }
    if (!implementationFiles.length) {
      toast("Seleziona prima il repository di questa iniziativa");
      return;
    }
    setDevBusy(true);
    try {
      const systems = evaluationSystems({ initiative, systems: [initiative.system], importedInterventions });
      const applicationCodes = evaluationApplicationCodes({ applicationContext: applicationContextFor(initiative.system, DEFAULT_APPLICATIONS[lot]) });
      const allPaths = [...implementationFiles].map((f) => f.webkitRelativePath || f.name);
      const sourcePaths = [...implementationFiles]
        .filter((f) => sourceFileAllowed(f.name) && !ignoredSourcePath(f.webkitRelativePath || f.name))
        .map((f) => f.webkitRelativePath || f.name);
      const folderName = (allPaths[0] || "").split("/")[0] || "repository";
      const request = {
        formatVersion: 3,
        generatedAt: new Date().toISOString(),
        source: "Configuratore MEV v1",
        targetTool: codeChangeTool,
        contractId: selectedContractId,
        contractName: r.name || selectedContractId,
        lot: String(lot),
        initiative,
        systems,
        applicationCodes,
        requirements: initiative.requirements || "",
        description: initiative.description || "",
        approvalNotes: implementationApprovalNotes,
        branch: implementationBranch,
        approvedInterventions: selected,
        repository: { folderName, totalFiles: allPaths.length, sourceFiles: sourcePaths.length, filePaths: allPaths, sourceFilePaths: sourcePaths },
      };
      const zip = new JSZip();
      zip.file("README_MODIFICA_CODICE.md", codeChangePrompt(request));
      zip.file("richiesta_modifica_codice.json", JSON.stringify(request, null, 2));
      zip.file("piano_sviluppo.md", implementationDocument({ record: { payload, lot_id: lot, contract_id: selectedContractId, title: initiative.title }, proposals: selected, branch: implementationBranch, approvalNotes: implementationApprovalNotes, tests: implementationTests }));
      zip.file("elenco_file_repository.txt", allPaths.join("\n"));
      zip.file("VERIFICA_SELEZIONE.txt", [
        `Codice iniziativa: ${initiative.code || ""}`,
        `Titolo: ${initiative.title || ""}`,
        `Sistema/applicazione: ${systems.join(", ")}`,
        `Applicativi AP: ${applicationCodes.join(", ")}`,
        `Repository selezionato: ${folderName}`,
        `Interventi approvati: ${selected.length}`,
      ].join("\n"));
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const code = String(initiative.code || "iniziativa").replace(/[^a-z0-9_-]+/gi, "_");
      downloadBlob(`Richiesta_Modifica_Codice_${code}.zip`, blob);
      toast("Richiesta di modifica codice generata");
    } catch (error) {
      toast("Generazione non riuscita: " + error.message);
    } finally {
      setDevBusy(false);
    }
  };

  const exportImplementation = () => {
    const code = initiative.code || "iniziativa";
    const doc = implementationDocument({
      record: { payload: {}, lot_id: lot, contract_id: selectedContractId, title: initiative.title },
      proposals: approvedInterventionsFor(),
      branch: implementationBranch,
      approvalNotes: implementationApprovalNotes,
      tests: implementationTests,
    });
    downloadBlob(`piano_sviluppo_${code}.md`, new Blob([doc], { type: "text/markdown;charset=utf-8" }));
  };

  // ── Export ──
  const exportSnapshotJson = () => {
    const data = {
      version: 6,
      contractId: selectedContractId,
      contractName: activeContract?.name || "",
      lot,
      priceMode,
      sourceWorkbookName,
      initiative,
      importedInterventions,
      items: items.map((it) => ({ ...it, unit: defaultPrice(it, { catalog, priceMode, builtin: !!activeContract?.builtin }) })),
      tow,
      discount,
      contingency,
      economicNotes: economyNotes,
      calculation,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(`offerta_${appNorm(initiative.code || "iniziativa")}.json`, blob);
  };

  const exportCsv = () => {
    const sep = ";";
    const header = ["ID Catalogo", "Tipo", "Complessità", "Quantità", "Prezzo unitario", "Importo", "Intervento", "Razionale"].join(sep);
    const rows = items.map((it) => {
      const unit = it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: !!activeContract?.builtin });
      return [it.id, it.type, it.complexity, it.qty, unit, unit * it.qty, it.interventionId || "", (it.reason || "").replace(/\n/g, " ")].join(sep);
    });
    downloadBlob(`offerta_${appNorm(initiative.code || "iniziativa")}.csv`, new Blob(["\uFEFF" + [header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" }));
  };

  const downloadBlob = (name, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  };

  const go = (n) => {
    setStep(n);
    if (n === 4) persistInitiativeEvaluation(false);
  };

  // ── Render ──
  if (loading) return <div style={{ padding: 40 }}>Caricamento configuratore…</div>;

  const c = activeContract || builtinContract;
  const lots = c ? (c.lots || []).filter((l) => l.active !== false) : [];

  return (
    <div style={{ padding: 24, fontFamily: "inherit" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Configuratore Offerta TOW</h2>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
            {c?.name} · Lotto {lot} · {catalog.length} voci di catalogo
          </p>
        </div>
        <button onClick={() => setShowContractForm((v) => !v)} style={btnStyles.secondary}>
          {showContractForm ? "Chiudi form contratto" : "+ Nuovo contratto"}
        </button>
      </div>

      {/* Selezione contratto / lotto */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0 16px" }}>
        <select value={selectedContractId} onChange={(e) => handleSelectContract(e.target.value)} style={styles.input}>
          {allContracts.map((cc) => (
            <option key={cc.contractId} value={cc.contractId}>{cc.name}</option>
          ))}
        </select>
        {lots.map((l) => (
          <button
            key={l.lotId}
            onClick={() => { setLot(l.lotId); setStep(1); }}
            style={lot === l.lotId ? styles.lotBtnActive : styles.lotBtn}
          >
            {l.name || `Lotto ${l.lotId}`}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ color: "#b00020", fontSize: 13, background: "#fdecec", padding: "8px 12px", borderRadius: 6 }}>
          {error}
          <button style={{ marginLeft: 8, border: "none", background: "none", cursor: "pointer" }} onClick={() => setError("")}>✕</button>
        </p>
      )}

      {/* Form contratto */}
      {showContractForm && (
        <form onSubmit={saveContract} style={{ ...styles.card, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px" }}>Importa nuovo contratto</h3>
          <label style={styles.label}>
            Nome contratto
            <input style={styles.input} value={contractForm.name} onChange={(e) => setContractForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <label style={styles.label}>
            File regole (facoltativo)
            <input style={styles.input} type="file" accept=".pdf,.doc,.docx" onChange={(e) => setContractForm((f) => ({ ...f, rulesFile: e.target.files[0] }))} />
          </label>
          {contractForm.lots.map((l, idx) => (
            <div key={idx} style={{ ...styles.card, background: "#fafafa", marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>Lotto {l.id}</strong>
                <input style={{ ...styles.input, width: 180 }} placeholder="Nome lotto" value={l.name} onChange={(e) => updateContractLotField(idx, { name: e.target.value })} />
                <label style={styles.label}>
                  % TOW .5
                  <input style={{ ...styles.input, width: 80 }} type="number" value={l.tow5Share} onChange={(e) => updateContractLotField(idx, { tow5Share: Number(e.target.value) })} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                <label style={styles.label}>
                  Catalogo PDF (obbligatorio)
                  <input style={styles.input} type="file" accept=".pdf" onChange={(e) => updateContractLotField(idx, { catalogFile: e.target.files[0] })} />
                </label>
                <label style={styles.label}>
                  Listino TOW (PDF o XLSX, obbligatorio)
                  <input style={styles.input} type="file" accept=".pdf,.xlsx" onChange={(e) => updateContractLotField(idx, { priceFile: e.target.files[0] })} />
                </label>
              </div>
              <button type="button" style={{ marginTop: 8, ...btnStyles.danger }} onClick={() => setContractForm((f) => ({ ...f, lots: f.lots.filter((_, i) => i !== idx) }))} disabled={contractForm.lots.length <= 1}>
                Rimuovi lotto
              </button>
            </div>
          ))}
          <button type="button" style={{ margin: "10px 10px 0 0", ...btnStyles.secondary }} onClick={() => setContractForm((f) => ({ ...f, lots: [...f.lots, { id: String(f.lots.length + 1), name: "", catalogFile: null, priceFile: null, tow5Share: 65 }] }))}>
            + Aggiungi lotto
          </button>
          <button type="submit" style={{ marginTop: 10, ...btnStyles.primary }} disabled={saving}>
            {saving ? "Elaborazione documenti…" : "Importa e salva contratto"}
          </button>
        </form>
      )}

      {/* Stepper */}
      <div style={{ display: "flex", gap: 4, margin: "8px 0 20px", flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => go(i + 1)} style={step === i + 1 ? styles.stepActive : styles.step}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* STEP 1: INIZIATIVA */}
      {step === 1 && (
        <div>
          {/* Bottone import Excel visibile */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: mappedLoading ? "not-allowed" : "pointer",
              background: mappedLoading ? "#c8d6e5" : "linear-gradient(135deg, #102a47 0%, #1a73e8 100%)",
              color: "#fff", padding: "12px 24px", borderRadius: 8, fontSize: 15, fontWeight: 700,
              boxShadow: "0 2px 8px rgba(16,42,71,0.18)", border: "none",
              opacity: mappedLoading ? 0.7 : 1, transition: "opacity 0.2s" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {mappedLoading ? "Elaborazione in corso…" : "Importa Tabella di Offerta"}
              <input type="file" accept=".xlsx" style={{ display: "none" }} disabled={mappedLoading}
                onChange={(e) => { if (e.target.files[0]) handleImportExcel(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <p style={{ ...styles.hint, marginTop: 8, marginBottom: 0 }}>
              Carica il workbook dell'iniziativa (foglio con ID_INTERVENTO + foglio DettaglioInterventi).
            </p>
          </div>
          <div style={{ ...styles.card, marginTop: 12 }}>
            <h3 style={{ margin: "0 0 12px" }}>Dati iniziativa</h3>
            <div style={styles.grid2}>
              <label style={styles.label}>Codice
                <input style={styles.input} value={initiative.code} onChange={(e) => setInitiative((i) => ({ ...i, code: e.target.value }))} />
              </label>
              <label style={styles.label}>Titolo
                <input style={styles.input} value={initiative.title} onChange={(e) => setInitiative((i) => ({ ...i, title: e.target.value }))} />
              </label>
              <label style={styles.label}>Sistema / applicazione
                <input style={styles.input} value={initiative.system} onChange={(e) => setInitiative((i) => ({ ...i, system: e.target.value }))} />
              </label>
              <label style={styles.label}>Release
                <input style={styles.input} value={initiative.release} onChange={(e) => setInitiative((i) => ({ ...i, release: e.target.value }))} />
              </label>
              <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Requisiti
                <textarea style={styles.textarea} value={initiative.requirements} onChange={(e) => setInitiative((i) => ({ ...i, requirements: e.target.value }))} rows={2} />
              </label>
              <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Descrizione
                <textarea style={styles.textarea} value={initiative.description} onChange={(e) => setInitiative((i) => ({ ...i, description: e.target.value }))} rows={5} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button style={btnStyles.primary} onClick={analyze}>Analizza e suggerisci</button>
              <button style={btnStyles.secondary} onClick={resetInitiative}>Reset</button>
            </div>
          </div>

          {importedInterventions.length > 0 && (
            <div style={styles.card}>
              <strong>{importedInterventions.length} interventi, {mappingCount} valorizzazioni di catalogo, TOW .5 {euro.format(tow5Total)}.</strong>
              <details>
                <summary style={{ cursor: "pointer", margin: "8px 0", fontWeight: 600 }}>Mostra dettaglio importato</summary>
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  {importedInterventions.map((x, xi) => (
                    <div key={x.id} style={{ marginBottom: 16, border: "1px solid #dde1e6", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ background: "#f8f9fa", padding: "8px 12px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid #dde1e6" }}>
                        <span style={{ color: "#1a73e8" }}>ID_INTERVENTO {x.id}</span>
                        {x.titolo ? <span style={{ marginLeft: 8, color: "#222" }}>{esc(x.titolo)}</span> : null}
                        {x.descrizione ? <span style={{ marginLeft: 8, color: "#666", fontWeight: 400, fontSize: 12 }}>{esc(x.descrizione)}</span> : null}
                      </div>
                      {x.mappings.length > 0 ? (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "#102a47", color: "#fff" }}>
                              <th style={{ padding: "7px 10px", textAlign: "left" }}>Componente</th>
                              <th style={{ padding: "7px 10px", textAlign: "left" }}>Tipo</th>
                              <th style={{ padding: "7px 10px", textAlign: "left" }}>Complessità</th>
                              <th style={{ padding: "7px 10px", textAlign: "right" }}>Q.tà</th>
                              <th style={{ padding: "7px 10px", textAlign: "right" }}>Prezzo unitario (€)</th>
                              <th style={{ padding: "7px 10px", textAlign: "right" }}>Totale (€)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {x.mappings.map((m, mi) => {
                              const cc = catalog.find(c => c.id === m.catalogId || c.nome === m.name);
                              const validC = cc ? validComplexities(cc, m.type) : ["Semplice", "Medio", "Complesso"];
                              const unitPrice = m.unit ?? (m.qty ? (m.total || 0) / m.qty : 0);
                              const updMapping = (patch) => setImportedInterventions(prev => prev.map((iv, ivi) =>
                                ivi !== xi ? iv : { ...iv, mappings: iv.mappings.map((mm, mmi) => mmi !== mi ? mm : { ...mm, ...patch }) }
                              ));
                              const qty = m.qty ?? 1;
                              const unit = m.unit ?? unitPrice;
                              return (
                                <tr key={mi} style={{ background: mi % 2 ? "#f7f9fb" : "#fff", borderBottom: "1px solid #eef2f5" }}>
                                  <td style={{ padding: "6px 10px" }}>
                                    <div style={{ fontWeight: 600 }}>{esc(m.name)}</div>
                                    {m.detailDescription ? <div style={{ color: "#667482", fontSize: 11 }}>{esc(m.detailDescription)}</div> : null}
                                  </td>
                                  <td style={{ padding: "6px 10px" }}>
                                    <select style={{ ...styles.input, fontSize: 11, padding: "3px 6px" }} value={m.type || "REALIZZAZIONE"}
                                      onChange={e => updMapping({ type: e.target.value, unit: null })}>
                                      <option>REALIZZAZIONE</option><option>MODIFICA</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: "6px 10px" }}>
                                    <select style={{ ...styles.input, fontSize: 11, padding: "3px 6px" }} value={m.complexity || "Medio"}
                                      onChange={e => updMapping({ complexity: e.target.value, unit: null })}>
                                      {validC.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ padding: "6px 10px", textAlign: "right" }}>
                                    <input type="number" min={0} step={0.01} value={qty}
                                      onChange={e => updMapping({ qty: Number(e.target.value) || 0, total: (Number(e.target.value) || 0) * unit })}
                                      style={{ ...styles.input, width: 60, fontSize: 11, padding: "3px 6px", textAlign: "right" }} />
                                  </td>
                                  <td style={{ padding: "6px 10px", textAlign: "right" }}>
                                    <input type="number" min={0} step={0.01} value={unit}
                                      onChange={e => updMapping({ unit: Number(e.target.value) || 0, total: qty * (Number(e.target.value) || 0) })}
                                      style={{ ...styles.input, width: 90, fontSize: 11, padding: "3px 6px", textAlign: "right" }} />
                                  </td>
                                  <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>
                                    {euro.format(qty * unit)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ padding: "8px 12px", color: "#667482", fontSize: 12 }}>Nessuna valorizzazione di catalogo.</div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: INTERVENTI / SUGGERIMENTI */}
      {step === 2 && (
        <div>
          <div style={{ ...styles.card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong>{importedInterventions.length ? `${mappingCount} valorizzazioni già previste nell'Excel e ${suggestions.length} possibili integrazioni da valutare.` : `${suggestions.length} componenti candidate nel Catalogo Lotto ${lot}.`}</strong>
              <button style={btnStyles.primary} onClick={analyzeWithAi} disabled={aiBusy}>
                {aiBusy ? "Analisi AI…" : "Secondo parere AI"}
              </button>
            </div>
            {aiProposals && (
              <div style={{ ...styles.card, marginTop: 10, background: "#f0f7ff" }}>
                <div>
                  <small>Secondo parere AI · {aiProposals.model || "AI"}</small>
                  <p style={{ margin: "6px 0" }}>{esc(aiProposals.analysis?.summary || "Analisi completata.")}</p>
                </div>
                <div>
                  {aiProposals.proposals.map((p, i) => {
                    const cc = catalog.find((x) => String(x.id) === String(p.catalogId));
                    return (
                      <label key={i} style={{ display: "block", margin: "6px 0", fontSize: 13 }}>
                        <input type="checkbox" checked={p.apply} onChange={(e) => setAiProposals((prev) => ({ ...prev, proposals: prev.proposals.map((q, j) => (j === i ? { ...q, apply: e.target.checked } : q)) }))} />
                        {" "}ID {esc(p.catalogId)} · {esc(cc?.nome || "Voce catalogo")} — {esc(p.rationale || "")}
                        <div style={{ fontSize: 12, color: "#555" }}>
                          {esc(p.type || "MODIFICA")} · {esc(p.complexity || "Medio")} · Q.tà {esc(p.quantity || 1)} · Confidenza {Math.round((Number(p.confidence) || 0) * 100)}%
                        </div>
                      </label>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={btnStyles.primary} onClick={applyAiProposals} disabled={!aiProposals.proposals.length}>Applica proposte selezionate</button>
                    <button style={btnStyles.secondary} onClick={() => setAiProposals(null)}>Chiudi</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ ...styles.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ margin: 0 }}>Possibili integrazioni</h3>
              <button style={btnStyles.primary} onClick={compose} disabled={!suggestions.some((s) => s.selected)}>
                Vai all'offerta ({suggestions.filter((s) => s.selected).length} selezionate)
              </button>
            </div>
{(() => {
  const groups = new Map();
  suggestions.forEach((s, gi) => {
    const k = s.interventionId || "__NOX__";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ ...s, __gi: gi });
  });
  return [...groups.entries()].map(([gid, items]) => {
    const inter = importedInterventions.find((x) => String(x.id) === String(gid));
    return (
      <details key={gid} style={{ ...styles.card, marginBottom: 10, padding: 0, border: "1px solid #dde1e6" }}>
        <summary style={{ cursor: "pointer", padding: "10px 14px", fontWeight: 700, fontSize: 13, background: "#f8f9fa", borderRadius: "8px 8px 0 0", listStyle: "none", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ flex: "0 0 auto", marginTop: 1 }}>▶</span>
          <span style={{ flex: 1 }}>
            <span style={{ color: "#1a73e8" }}>ID_INTERVENTO {gid}</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: "#777", fontWeight: 400 }}>({items.length} voc{items.length === 1 ? "e" : "i"})</span>
            {inter?.titolo ? <span style={{ display: "block", color: "#222", fontWeight: 600, marginTop: 2 }}>{esc(inter.titolo)}</span> : null}
            {inter?.descrizione ? <span style={{ display: "block", color: "#555", fontWeight: 400, fontSize: 12, marginTop: 1 }}>{esc(inter.descrizione)}</span> : null}
          </span>
          <span style={{ fontSize: 11, color: items.some((x) => x.selected) ? "#1a73e8" : "#999", fontWeight: 700, flex: "0 0 auto" }}>
            {items.filter((x) => x.selected).length}/{items.length} selezionate
          </span>
        </summary>
        <div style={{ padding: "10px 14px", display: "grid", gap: 10 }}>
          {items.map((s, i) => {
            const cc = catalog.find((x) => x.id === s.id);
            if (!cc) return null;
            // CORRETTO: validComplexities(catalogEntry, typeString)
            const vals = validComplexities(cc, s.type);
            const unitPrice = defaultPrice(s, { catalog, priceMode, builtin: !!activeContract?.builtin });
            const importoProposto = unitPrice * (s.qty || 1);
            return (
              <div key={i} style={{ ...styles.suggestion, border: s.selected ? "1px solid #1a73e8" : "1px solid #ddd", display: "grid", gap: 8, background: s.selected ? "#f0f7ff" : "#fff" }}>
                {/* Riga intestazione con checkbox */}
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" style={{ marginTop: 3, flex: "0 0 auto" }} checked={s.selected} onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, selected: e.target.checked } : q)))} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#667482", fontSize: 11, marginBottom: 2 }}>ID {cc.id} · {esc(cc.ambito)}</div>
                    <strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>{esc(cc.nome)}</strong>
                    {cc.descrizione && (
                      <p style={{ margin: "0 0 4px", fontSize: 12, color: "#444", lineHeight: 1.5, background: "#f4f6f8", borderRadius: 5, padding: "5px 8px" }}>
                        <span style={{ fontWeight: 600, color: "#102a47" }}>Voce catalogo: </span>{esc(cc.descrizione)}
                      </p>
                    )}
                    {s.reason && (
                      <p style={{ margin: 0, fontSize: 12, color: "#1a5276", lineHeight: 1.5, background: "#eaf4fb", borderRadius: 5, padding: "5px 8px", borderLeft: "3px solid #1a73e8" }}>
                        <span style={{ fontWeight: 600 }}>Motivo proposta: </span>{esc(s.reason)}
                      </p>
                    )}
                  </div>
                </label>

                {/* Tabella prezzi S/M/C */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#102a47", color: "#fff" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left" }}>Tipo</th>
                        <th style={{ padding: "5px 8px", textAlign: "left" }}>Complessità</th>
                        <th style={{ padding: "5px 8px", textAlign: "right" }}>Pz. Semplice</th>
                        <th style={{ padding: "5px 8px", textAlign: "right" }}>Pz. Medio</th>
                        <th style={{ padding: "5px 8px", textAlign: "right" }}>Pz. Complesso</th>
                        <th style={{ padding: "5px 8px", textAlign: "right" }}>Q.tà</th>
                        <th style={{ padding: "5px 8px", textAlign: "right" }}>Importo proposto</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: "#f9fbfd" }}>
                        <td style={{ padding: "5px 8px" }}>
                          <select style={{ ...styles.input, fontSize: 11, padding: "3px 5px", minWidth: 110 }} value={s.type}
                            onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, type: e.target.value } : q)))}>
                            <option>REALIZZAZIONE</option><option>MODIFICA</option>
                          </select>
                        </td>
                        <td style={{ padding: "5px 8px" }}>
                          <select style={{ ...styles.input, fontSize: 11, padding: "3px 5px" }} value={s.complexity}
                            onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, complexity: e.target.value } : q)))}>
                            {vals.length > 0
                              ? vals.map((v) => (<option key={v} value={v}>{v}</option>))
                              : <option value={s.complexity}>{s.complexity}</option>
                            }
                          </select>
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right", color: s.complexity === "Semplice" ? "#1a73e8" : "#444", fontWeight: s.complexity === "Semplice" ? 700 : 400 }}>
                          {cc.prezzi?.[s.type]?.Semplice != null ? euro.format(cc.prezzi[s.type].Semplice) : "–"}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right", color: s.complexity === "Medio" ? "#1a73e8" : "#444", fontWeight: s.complexity === "Medio" ? 700 : 400 }}>
                          {cc.prezzi?.[s.type]?.Medio != null ? euro.format(cc.prezzi[s.type].Medio) : "–"}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right", color: s.complexity === "Complesso" ? "#1a73e8" : "#444", fontWeight: s.complexity === "Complesso" ? 700 : 400 }}>
                          {cc.prezzi?.[s.type]?.Complesso != null ? euro.format(cc.prezzi[s.type].Complesso) : "–"}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right" }}>
                          <input type="number" min="1" step={1} value={Math.round(s.qty || 1)}
                            onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, qty: Math.max(1, Math.round(Number(e.target.value) || 1)) } : q)))}
                            style={{ ...styles.input, width: 60, fontSize: 11, padding: "3px 5px", textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#102a47" }}>
                          {euro.format(importoProposto)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Campo note */}
                <textarea rows={2} placeholder="Note (condivisibili con altri interventi/iniziative)…"
                  value={s.notes || ""}
                  onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, notes: e.target.value } : q)))}
                  style={{ ...styles.textarea, fontSize: 12, marginTop: 0, borderColor: s.notes ? "#1a73e8" : "#dde1e6" }} />
              </div>
            );
          })}
        </div>
      </details>
    );
  });
})()}
          </div>

          {/* Catalogo manuale */}
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 4px" }}>Aggiungi manualmente dal catalogo</h3>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#667482" }}>
              Le voci aggiunte qui compaiono nelle "Possibili integrazioni" come selezionate.
            </p>
            <div style={{ display: "grid", gap: 0, maxHeight: 420, overflow: "auto", border: "1px solid #dde1e6", borderRadius: 8 }}>
              {catalog.map((cc, ci) => {
                const alreadyAdded = suggestions.some(s => s.id === cc.id);
                return (
                  <details key={cc.id} style={{ borderBottom: ci < catalog.length - 1 ? "1px solid #eef2f5" : "none" }}>
                    <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", cursor: "pointer", gap: 8, listStyle: "none",
                      background: alreadyAdded ? "#f0f7ff" : "#fff" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <small style={{ color: "#667482" }}>ID {cc.id} · {esc(cc.ambito)}</small>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{esc(cc.nome)}</div>
                        <div style={{ color: "#555", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {esc((cc.descrizione || "").slice(0, 100))}{cc.descrizione?.length > 100 ? "…" : ""}
                        </div>
                      </div>
                      <button style={{ ...btnStyles.secondary, whiteSpace: "nowrap", fontSize: 12, padding: "5px 10px",
                        background: alreadyAdded ? "#e8f0fe" : "#fff", color: alreadyAdded ? "#1a73e8" : "#334456",
                        border: alreadyAdded ? "1px solid #4285f4" : "1px solid #d8e0e8" }}
                        onClick={(e) => { e.preventDefault(); addManualItem(cc); }}>
                        {alreadyAdded ? "Già aggiunta" : "Aggiungi"}
                      </button>
                    </summary>
                    <div style={{ padding: "8px 14px 12px", background: "#f8f9fa", fontSize: 12, borderTop: "1px solid #eef2f5" }}>
                      <div style={{ color: "#444", lineHeight: 1.6, marginBottom: 8 }}>{esc(cc.descrizione || "Nessuna descrizione disponibile.")}</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {["REALIZZAZIONE", "MODIFICA"].map(tipo => {
                          const p = cc.prezzi?.[tipo] || {};
                          return Object.keys(p).length > 0 ? (
                            <div key={tipo} style={{ fontSize: 11, background: "#fff", border: "1px solid #dde1e6", borderRadius: 6, padding: "4px 8px" }}>
                              <strong style={{ color: "#102a47" }}>{tipo}:</strong>{" "}
                              {["Semplice","Medio","Complesso"].map(c => p[c] != null ? `${c} ${euro.format(p[c])}` : null).filter(Boolean).join(" · ")}
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: OFFERTA */}
      {step === 3 && (
        <div>
          <div style={{ ...styles.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ margin: 0 }}>Offerta economica — Lotto {lot}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnStyles.secondary} onClick={() => setStep(2)}>← Interventi</button>
                <button style={btnStyles.primary} onClick={() => go(4)}>Revisione →</button>
              </div>
            </div>
            <div style={{ ...styles.grid2, marginTop: 10 }}>
              <label style={styles.label}>Sconto (%) <input style={styles.input} type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} /></label>
              <label style={styles.label}>Contingenza (%) <input style={styles.input} type="number" step="0.01" value={contingency} onChange={(e) => setContingency(Number(e.target.value) || 0)} /></label>
            </div>
            <div style={{ marginTop: 10 }}>
              <strong>Base allocazione TOW .5: </strong>{euro.format(calculation.allocationBase)} ({tow5Share}%)
            </div>
          </div>

          {/* TOW automatici */}
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 10px" }}>TOW automatici (Lotto {lot})</h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))" }}>
              {["1", "3", "4"].map((n) => {
                const k = `TOW0${lot}.${n}`;
                const amount = calculation.autoTow[k] || 0;
                const unit = towPricesMap[k] || 0;
                const qty = unit ? amount / unit : null;
                const pctCurrent = towPercentages?.[selectedContractId]?.[lot]?.[n] ?? 0;
                return (
                  <div key={n} style={styles.card}>
                    <strong>{k}</strong>
                    <div style={{ color: "#666", fontSize: 12 }}>{unit ? `${euro.format(unit)} / unità` : "calcolo sul valore TOW .5"}</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0" }}>
                      <span style={{ fontSize: 12, color: "#444" }}>% impatto:</span>
                      <input
                        type="number" min={0} max={100} step={0.01}
                        value={pctCurrent}
                        onChange={(e) => setTowPercentages((prev) => ({
                          ...prev,
                          [selectedContractId]: {
                            ...(prev?.[selectedContractId] || {}),
                            [lot]: { ...(prev?.[selectedContractId]?.[lot] || { 1: 0, 3: 0, 4: 0 }), [n]: Number(e.target.value) || 0 },
                          },
                        }))}
                        style={{ width: 70, border: "1px solid #bdc9d4", borderRadius: 5, padding: "4px 6px", fontSize: 13, textAlign: "right" }}
                      />
                      <span style={{ fontSize: 12, color: "#444" }}>%</span>
                    </label>
                    <div style={{ fontWeight: 600 }}>{euro.format(amount)}</div>
                    <div style={{ color: "#666", fontSize: 12 }}>{qty === null ? "Quantità n.d." : `Quantità equivalente: ${qty.toLocaleString("it-IT", { maximumFractionDigits: 3 })}`}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TOW manuali 2 e 6 */}
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 10px" }}>TOW manuali</h3>
            {["2", "6"].map((n) => {
              const k = `TOW0${lot}.${n}`;
              return (
                <div key={n} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ width: 90 }}>{k}</strong>
                  <input style={{ ...styles.input, width: 120 }} type="number" min="0" step=".001" value={tow[k] || 0} placeholder="Quantità"
                    onChange={(e) => setTow((t) => ({ ...t, [k]: Number(e.target.value) || 0 }))} />
                  <input style={{ ...styles.input, width: 140 }} type="number" min="0" step=".01" value={towPricesMap[k] || tow[k + "_price"] || 0} placeholder="Prezzo unitario"
                    onChange={(e) => setTow((t) => ({ ...t, [k + "_price"]: Number(e.target.value) || 0 }))} />
                  <span>{euro.format((tow[k] || 0) * (towPricesMap[k] || tow[k + "_price"] || 0))}</span>
                </div>
              );
            })}
          </div>

          {/* Riga offerta */}
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 10px" }}>Voci di catalogo</h3>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th>ID Catalogo / componente</th><th>Tipo</th><th>Complessità</th><th>Q.tà</th><th>Prezzo unitario</th><th>Totale</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const cc = catalog.find((x) => x.id === it.id);
                  const unit = it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: !!activeContract?.builtin });
                  return (
                    <tr key={it.key}>
                      <td>
                        <strong>ID {it.id}</strong>
                        <div style={{ color: "#666", fontSize: 12 }}>{esc(cc?.nome || "Voce manuale")}</div>
                      </td>
                      <td>
                        <select style={styles.input} value={it.type} onChange={(e) => updateItem(it.key, { type: e.target.value, unit: null })}>
                          <option>REALIZZAZIONE</option>
                          <option>MODIFICA</option>
                        </select>
                      </td>
                      <td>
                        <select style={styles.input} value={it.complexity} onChange={(e) => updateItem(it.key, { complexity: e.target.value, unit: null })}>
                          {validComplexities(cc, it.type).map((v) => <option key={v}>{v}</option>)}
                        </select>
                      </td>
                      <td><input style={{ ...styles.input, width: 64 }} type="number" min="0" value={it.qty} onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) || 0 })} /></td>
                      <td><input style={{ ...styles.input, width: 90 }} type="number" min="0" step=".01" value={unit} onChange={(e) => updateItem(it.key, { unit: Number(e.target.value) || 0 })} /></td>
                      <td><strong>{euro.format(unit * it.qty)}</strong></td>
                      <td><textarea style={{ ...styles.textarea, minWidth: 180 }} rows={2} placeholder="Razionali, vincoli o note" value={it.additionalInfo || ""} onChange={(e) => updateItem(it.key, { additionalInfo: e.target.value })} /></td>
                      <td><button style={btnStyles.danger} onClick={() => removeItem(it.key)}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, gap: 8, flexWrap: "wrap" }}>
              <strong>Totale catalogo: {euro.format(calculation.cat)}</strong>
              <strong>Altri TOW: {euro.format(calculation.oth)}</strong>
              <strong style={{ fontSize: 16 }}>Totale offerta: {euro.format(calculation.total)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: REVISIONE */}
      {step === 4 && (
        <div>
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 12px" }}>Revisione offerta</h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
              <div style={styles.card}><span style={{ color: "#666" }}>Lotto</span><div><strong>{lot}</strong></div></div>
              <div style={styles.card}><span style={{ color: "#666" }}>Voci catalogo</span><div><strong>{items.length}</strong></div></div>
              <div style={styles.card}><span style={{ color: "#666" }}>Sconto</span><div><strong>{discount}%</strong></div></div>
              <div style={styles.card}><span style={{ color: "#666" }}>Contingenza</span><div><strong>{contingency}%</strong></div></div>
              <div style={styles.card}><span style={{ color: "#666" }}>Totale offerta</span><div><strong style={{ fontSize: 17 }}>{euro.format(calculation.total)}</strong></div></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={styles.label}>Note economiche
                <textarea style={styles.textarea} rows={3} value={economyNotes} onChange={(e) => setEconomyNotes(e.target.value)} />
              </label>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={{ margin: "0 0 10px" }}>Dettaglio righe</h3>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}><th>ID</th><th>Voce</th><th>Tipo · Complessità · Q.tà</th><th>Razionale</th><th>Importo</th></tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const cc = catalog.find((x) => x.id === it.id);
                  const unit = it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: !!activeContract?.builtin });
                  return (
                    <tr key={it.key}>
                      <td>{it.id}</td>
                      <td>{esc(cc?.nome || "Voce manuale")}</td>
                      <td>{it.type} · {it.complexity} · {it.qty}</td>
                      <td>{esc(it.reason || it.additionalInfo || "—")}</td>
                      <td>{euro.format(unit * it.qty)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btnStyles.primary} onClick={() => persistInitiativeEvaluation()}>Salva valutazione</button>
            <button style={btnStyles.secondary} onClick={() => setStep(3)}>← Offerta</button>
            <button style={btnStyles.secondary} onClick={exportSnapshotJson}>Esporta JSON</button>
            <button style={btnStyles.secondary} onClick={exportCsv}>Esporta CSV</button>
            <button style={btnStyles.secondary} onClick={() => window.print()}>Stampa</button>
          </div>
        </div>
      )}

      {/* APPLICATIVI E TECNOLOGIE PER LOTTO */}
      <div style={{ ...styles.card, marginTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Applicativi e tecnologie · Lotto {lot}</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={styles.input} placeholder="Cerca applicativo…" value={applicationSearch} onChange={(e) => setApplicationSearch(e.target.value)} />
            <button style={btnStyles.secondary} onClick={addApplicationV39}>Aggiungi applicativo</button>
          </div>
        </div>
        {applications.length === 0 ? (
          <p style={{ color: "#666", fontSize: 13 }}>Nessun applicativo configurato per questo lotto.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {applications
              .filter((a) => !appNorm(applicationSearch) || appNorm([a.name, a.code, (a.systemAliases || []).join(" "), (a.ambiti || []).join(" ")].join(" ")).includes(appNorm(applicationSearch)))
              .map((a, i) => {
                const tag = (props, arr) =>
                  (arr || []).length
                    ? `${props}: ${[...arr].join(" · ")}`
                    : "";
                const tags = [tag("OS", a.operatingSystems), tag("DBMS", a.databases), tag("Linguaggi", a.languages), tag("Extra", a.extraTechnologies)].filter(Boolean).join("<br>");
                return (
                  <div key={applicationIdentity(a) + "-" + i} style={styles.suggestion}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{esc(a.name || "Applicativo senza nome")}{a.code ? <span style={{ color: "#666", fontWeight: 400 }}> · {esc(a.code)}</span> : null}</strong>
                      {a.codeUrl ? <div style={styles.hint}><a href={safeAppUrl(a.codeUrl)} target="_blank" rel="noopener noreferrer">Repository</a></div> : null}
                      {(a.systemAliases || []).length ? <div style={styles.hint}>Sistema: {esc([...a.systemAliases].join(", "))}</div> : null}
                      <div style={styles.hint} dangerouslySetInnerHTML={{ __html: tags || "Nessuna tecnologia indicata" }} />
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={btnStyles.secondary} onClick={() => setApplicationDraft({ ...a })}>Modifica</button>
                      <button style={btnStyles.danger} onClick={() => deleteApplication(a)}>Elimina</button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {applicationDraft && (
          <div style={{ border: "1px solid #d7dce1", borderRadius: 8, padding: 12, marginTop: 12, background: "#fbfbfc" }}>
            <h4 style={{ margin: "0 0 8px" }}>Modifica applicativo</h4>
            <div style={styles.grid2}>
              <label style={styles.label}>Nome applicativo<input style={styles.input} value={applicationDraft.name || ""} onChange={(e) => setApplicationDraft({ ...applicationDraft, name: e.target.value })} /></label>
              <label style={styles.label}>Codice AP<input style={styles.input} value={applicationDraft.code || ""} onChange={(e) => setApplicationDraft({ ...applicationDraft, code: e.target.value.toUpperCase() })} placeholder="AP-00226" /></label>
            </div>
            <label style={styles.label}>Nomi riconosciuti nel campo Sistema (uno per riga)<textarea style={styles.textarea} rows={2} value={(applicationDraft.systemAliases || []).join("\n")} onChange={(e) => setApplicationDraft({ ...applicationDraft, systemAliases: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></label>
            <label style={styles.label}>Link al codice o repository
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                <input style={{ ...styles.input, marginTop: 0, flex: 1 }} value={applicationDraft.codeUrl || ""} onChange={(e) => setApplicationDraft({ ...applicationDraft, codeUrl: e.target.value })} placeholder="https://github.com/..." />
                <button type="button" style={{ ...btnStyles.secondary, whiteSpace: "nowrap", padding: "8px 12px" }}
                  onClick={() => {
                    const inp = document.createElement("input");
                    inp.type = "file"; inp.multiple = true;
                    inp.setAttribute("webkitdirectory", ""); inp.setAttribute("directory", "");
                    inp.onchange = () => {
                      if (!inp.files.length) return;
                      const rel = inp.files[0].webkitRelativePath || "";
                      const folder = rel.split("/")[0] || "cartella";
                      setApplicationDraft((d) => ({ ...d, codeUrl: folder + " (" + inp.files.length + " file)" }));
                      toast("Cartella collegata: " + folder + " — " + inp.files.length + " file");
                    };
                    inp.click();
                  }}>
                  Seleziona cartella
                </button>
              </div>
            </label>
            <label style={styles.label}>Tecnologie aggiuntive (una per riga)<textarea style={styles.textarea} rows={2} value={(applicationDraft.extraTechnologies || []).join("\n")} onChange={(e) => setApplicationDraft({ ...applicationDraft, extraTechnologies: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></label>
            <label style={styles.label}>Note integrative<textarea style={styles.textarea} rows={2} value={applicationDraft.notes || ""} onChange={(e) => setApplicationDraft({ ...applicationDraft, notes: e.target.value })} /></label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={btnStyles.primary} onClick={saveApplicationDraft}>Salva applicativo</button>
              <button style={btnStyles.secondary} onClick={() => setApplicationDraft(null)}>Annulla</button>
            </div>
          </div>
        )}
      </div>

      {/* SVILUPPO INIZIATIVA */}
      <div style={{ ...styles.card, marginTop: 28 }}>
        <h3 style={{ margin: 0 }}>Sviluppo iniziativa · richiesta di modifica codice</h3>
        <p style={styles.hint}>Autorizza gli interventi nello step Offerta/Revisione, collega il repository e genera il pacchetto di richiesta codice (ZIP) per lo strumento di sviluppo scelto.</p>
        <div style={{ ...styles.grid2, marginTop: 10 }}>
          <label style={styles.label}>
            Strumento previsto
            <select style={styles.input} value={codeChangeTool} onChange={(e) => setCodeChangeTool(e.target.value)}>
              <option value="vscode">Visual Studio Code</option>
              <option value="codex">Codex</option>
              <option value="other">Altro</option>
            </select>
          </label>
          <label style={styles.label}>
            Branch suggerito
            <input style={styles.input} value={implementationBranch} onChange={(e) => setImplementationBranch(e.target.value)} placeholder="feature/<codice>" />
          </label>
          <label style={styles.label}>
            Repository (cartella sorgente)
            <button style={btnStyles.secondary} onClick={selectImplementationRepository}>
              {implementationFiles.length ? `${implementationFiles.length} file selezionati` : "Scegli cartella…"}
            </button>
          </label>
        </div>
        <label style={styles.label}>
          Note di approvazione
          <textarea style={styles.textarea} rows={2} value={implementationApprovalNotes} onChange={(e) => setImplementationApprovalNotes(e.target.value)} placeholder="Criteri di autorizzazione, vincoli, razionale…" />
        </label>
        <label style={styles.label}>
          Compilazione e test
          <textarea style={styles.textarea} rows={2} value={implementationTests} onChange={(e) => setImplementationTests(e.target.value)} placeholder="Comandi di build/test da eseguire (es. npm run build, dotnet test)…" />
        </label>
        {implementationFiles.length > 0 && (
          <p style={styles.hint}>
            {implementationFiles.filter((f) => sourceFileAllowed(f.name) && !ignoredSourcePath(f.webkitRelativePath || f.name)).length} file sorgente presi in considerazione · quelli ignorati (node_modules, dist, build, vendor, bin/obj, minificati, lock) non vengono elencati.
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button style={btnStyles.primary} onClick={generateCodeChangeRequest} disabled={devBusy}>
            {devBusy ? "Genero il pacchetto…" : "Genera ZIP richiesta modifica codice"}
          </button>
          <button style={btnStyles.secondary} onClick={exportImplementation}>Esporta piano di sviluppo (MD)</button>
        </div>
      </div>

      {/* ARCHIVIO INIZIATIVE */}
      <div style={{ ...styles.card, marginTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Archivio iniziative calcolate</h3>
          <button style={btnStyles.secondary} onClick={loadArchive}>Aggiorna</button>
        </div>
        {archiveRecords.length === 0 ? (
          <p style={{ color: "#666", fontSize: 13 }}>Nessuna iniziativa memorizzata.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 360, overflow: "auto", marginTop: 10 }}>
            {archiveRecords.map((rec) => {
              const payload = typeof rec.payload === "string" ? safeParse(rec.payload) : rec.payload || {};
              const ini = payload.initiative || {};
              return (
                <div key={rec.id} style={styles.suggestion}>
                  <div>
                    <strong>{esc(ini.code || "Senza codice")} · {esc(ini.title || rec.title)}</strong>
                    <div style={{ color: "#666", fontSize: 12 }}>
                      {esc(rec.contract_id || payload.contractId || "")} / Lotto {esc(rec.lot_id || payload.lot || "—")} · {esc((payload.systems || []).join(", "))}
                      {payload.items ? ` · ${payload.items.length} voci` : ""}
                      {payload.savedAt ? ` · ${new Date(payload.savedAt).toLocaleDateString("it-IT")}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={btnStyles.secondary} onClick={() => reworkInitiative(rec)}>Riapri</button>
                    <button style={btnStyles.danger} onClick={() => deleteArchiveRecord(rec.id)}>Elimina</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toastMsg && (
        <div style={styles.toast}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "#fff",
    border: "1px solid #e3e6e9",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  input: {
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid #cbd2d9",
    fontSize: 13,
    marginTop: 4,
  },
  inputFile: {
    marginBottom: 6,
  },
  textarea: {
    width: "100%",
    padding: 7,
    borderRadius: 6,
    border: "1px solid #cbd2d9",
    fontSize: 13,
    marginTop: 4,
    fontFamily: "inherit",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    fontSize: 12,
    color: "#444",
    gap: 2,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  hint: { color: "#667", fontSize: 12, marginTop: 4 },
  checkRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13 },
  suggestion: {
    border: "1px solid #e0e4e8",
    borderRadius: 8,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
    flexWrap: "wrap",
    background: "#fcfcfd",
  },
  step: {
    padding: "7px 14px",
    borderRadius: 6,
    border: "1px solid #cbd2d9",
    background: "#fff",
    fontSize: 13,
    cursor: "pointer",
  },
  stepActive: {
    padding: "7px 14px",
    borderRadius: 6,
    border: "1px solid #1a73e8",
    background: "#e8f0fe",
    color: "#174ea6",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  lotBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #cbd2d9",
    background: "#fff",
    fontSize: 13,
    cursor: "pointer",
    opacity: 0.75,
  },
  lotBtnActive: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #1a73e8",
    background: "#e8f0fe",
    color: "#174ea6",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  thead: {
    background: "#f5f6f8",
    textAlign: "left",
    fontSize: 12,
  },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#174ea6",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 8,
    fontSize: 13,
    boxShadow: "0 4px 16px rgba(0,0,0,.2)",
    zIndex: 1000,
  },
};

const btnStyles = {
  primary: {
    padding: "8px 16px",
    borderRadius: 6,
    border: "none",
    background: "#1a73e8",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  secondary: {
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid #cbd2d9",
    background: "#fff",
    color: "#1f2a37",
    fontSize: 13,
    cursor: "pointer",
  },
  danger: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #d9a3a3",
    background: "#fdecec",
    color: "#b00020",
    fontSize: 13,
    cursor: "pointer",
  },
};

export default ConfiguratorePage;