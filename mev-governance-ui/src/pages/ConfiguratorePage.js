import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getConfiguratoreContracts,
  upsertConfiguratoreContract,
  getConfiguratoreRecords,
  upsertConfiguratoreRecord,
  deleteConfiguratoreRecord,
  analyzeInitiativeWithAi,
  getReleaseSchedules,
  getTowImpatto,
  getSharedApplications,
  putSharedApplications,
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
  buildTechnicalProfile,
} from "../configuratore/configuratoreCore";

const STEPS = ["Iniziativa", "Interventi", "Offerta", "Revisione"];

export default function ConfiguratorePage({ onUnauthorized, ambienteId, codiceContratto, role, roles }) {
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

  const [initiative, setInitiative] = useState({ code: "", title: "", system: "", contractType: "", release: "", requirements: "", description: "" });
  const [importedInterventions, setImportedInterventions] = useState([]);
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [contingency, setContingency] = useState(0);
  const [tow, setTow] = useState({});
  const [towPercentages, setTowPercentages] = useState({});
  const [priceMode] = useState("base");
  const [aiProposals, setAiProposals] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [archiveRecords, setArchiveRecords] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [showDescModal, setShowDescModal] = useState(false);
  const [releaseList, setReleaseList] = useState([]);
  const [towImpattoDb, setTowImpattoDb] = useState({});
  const [towImpattoSrc, setTowImpattoSrc] = useState("");
  const [economyNotes, setEconomyNotes] = useState("");
  const [sourceWorkbookName, setSourceWorkbookName] = useState("");
  const [mappedLoading, setMappedLoading] = useState(false);
  const [expandedOfferGroups, setExpandedOfferGroups] = useState(new Set()); // gruppi aperti in step 3

  // ── Sviluppo ──
  const [implementationFiles, setImplementationFiles] = useState([]);
  const [techProfile, setTechProfile] = useState(null);
  const [techProfileBusy, setTechProfileBusy] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [codeChangeTool, setCodeChangeTool] = useState("vscode");
  const [implementationBranch, setImplementationBranch] = useState("");
  const [implementationApprovalNotes, setImplementationApprovalNotes] = useState("");
  const [implementationTests, setImplementationTests] = useState("");
  const [devBusy, setDevBusy] = useState(false);

  // ── Applicativi ──
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationDraft, setApplicationDraft] = useState(null);
  const [applications, setApplications] = useState([]);
  const [showApplicativi, setShowApplicativi] = useState(false);
  const [appSyncBusy, setAppSyncBusy] = useState(false);     // salvataggio DB applicativi
  const [aiAppBusy, setAiAppBusy]     = useState(false);     // scheda AI per applicativo
  const [aiAppTarget, setAiAppTarget] = useState(null);      // applicativo selezionato per scheda AI

  // Utente con ruolo Admin E Developer → può generare schede AI applicativi
  const myRoles = (roles && roles.length > 0) ? roles : (role ? [role] : []);
  const isAdminDeveloper = myRoles.includes("Admin") && myRoles.includes("Developer");
  // SuperAdmin ha sempre accesso completo
  const canAiApp = isAdminDeveloper || myRoles.includes("SuperAdmin");

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

  // Sincronizza il lotto interno con l'ambiente attivo.
  // Il contratto builtin ha lotto "1" (Postali) e lotto "2" (TOW).
  // Gli ambienti con codiceContratto valorizzato appartengono al lotto TOW ("2").
  useEffect(() => {
    if (codiceContratto) {
      // Se il contratto builtin ha un lotto con questo codiceContratto, usa quello
      const match = builtinContract.lots.find(l => l.codiceContratto === codiceContratto);
      if (match) { setLot(match.lotId); return; }
      // Fallback: codiceContratto valorizzato → lotto 2 (TOW)
      setLot("2");
    }
    // Se codiceContratto è vuoto non cambiamo il lotto (resta quello precedente o "1")
  }, [codiceContratto]); // eslint-disable-line

  useEffect(() => {
    // Carica gli applicativi dal DB (condiviso) o localStorage.
    // Per il contratto builtin "poste-tet-2025" gli applicativi sono indipendenti
    // dal lotto attivo (lot_id="all" in DB) — il useEffect non dipende da `lot`.
    let alive = true;
    const isBuiltin = selectedContractId === "poste-tet-2025";
    // Per il builtin usa sempre "all" come lotKey (indipendente dal lotto attivo)
    const lotKey = isBuiltin ? "all" : lot;

    getSharedApplications(selectedContractId, lotKey)
      .then(dbApps => {
        if (!alive) return;
        if (dbApps && dbApps.length > 0) {
          setApplications(dbApps);
          setApplicationDraft(null);
          saveApplications(selectedContractId, lotKey, dbApps);
        } else {
          // Fallback: localStorage (prova lotto corrente, poi l'altro, poi DEFAULT)
          let local = applicationsFor(selectedContractId, lot, isBuiltin);
          if (!local.length && isBuiltin) {
            local = applicationsFor(selectedContractId, lot === "1" ? "2" : "1", true);
          }
          // Non sovrascrivere mai se abbiamo già dati in stato e il fallback è vuoto/peggiore
          setApplications(prev => (prev && prev.length > 0 && local.length === 0) ? prev : (local.length > 0 ? local : prev));
          setApplicationDraft(null);
        }
      })
      .catch(() => {
        if (!alive) return;
        let local = applicationsFor(selectedContractId, lot, isBuiltin);
        if (!local.length && isBuiltin) {
          local = applicationsFor(selectedContractId, lot === "1" ? "2" : "1", true);
        }
        setApplications(prev => (prev && prev.length > 0 && local.length === 0) ? prev : (local.length > 0 ? local : prev));
        setApplicationDraft(null);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContractId]); // ← NON dipende da `lot`: per il builtin gli applicativi sono condivisi tra lotti

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getConfiguratoreContracts(),
      getTowImpatto().catch((e) => { console.error("[TOW] getTowImpatto errore:", e); return null; }),
    ])
      .then(([c, imp]) => {
        if (!alive) return;
        setContracts(c);
        console.log("[TOW] getTowImpatto risposta:", imp);
        if (imp && typeof imp === "object" && Object.keys(imp).length > 0) {
          setTowImpattoDb(imp);
        } else {
          console.warn("[TOW] risposta vuota, retry 3s");
          setTimeout(() => {
            if (!alive) return;
            getTowImpatto().then(imp2 => {
              console.log("[TOW] retry risposta:", imp2);
              if (imp2 && typeof imp2 === "object" && Object.keys(imp2).length > 0)
                setTowImpattoDb(imp2);
            }).catch((e) => console.error("[TOW] retry errore:", e));
          }, 3000);
        }
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
  // isBuiltin: sincrono, non dipende da activeContract (che può essere null durante il caricamento)
  const isBuiltin = selectedContractId === "poste-tet-2025" || !!(activeContract?.builtin);

  // initiativeContractId: contract_id usato nel DB per le iniziative.
  // Usa il codiceContratto passato da App.js (es. "4490015980") — mai "poste-tet-2025".
  const initiativeContractId = useMemo(() => {
    if (codiceContratto) return codiceContratto;
    if (ambienteId) return String(ambienteId);
    return selectedContractId;
  }, [codiceContratto, ambienteId, selectedContractId]);

  // Quando il tipo contratto cambia in step 1 (initiative.contractType),
  // sincronizza towImpattoSrc e applica subito le percentuali al contratto/lotto corrente.
  useEffect(() => {
    const src = initiative.contractType || "";
    setTowImpattoSrc(src);
    if (!src) return;
    const imp = towImpattoDb[src];
    if (!imp) {
      console.warn(`[TOW] towImpattoDb non ha chiave "${src}". Chiavi disponibili:`, Object.keys(towImpattoDb));
      return;
    }
    const v1 = Number(imp[`TOW0${lot}.1`]) || 0;
    const v3 = Number(imp[`TOW0${lot}.3`]) || 0;
    const v4 = Number(imp[`TOW0${lot}.4`]) || 0;
    console.log(`[TOW] applico src=${src} lot=${lot} contract=${initiativeContractId}`, {v1,v3,v4});
    setTowPercentages(prev => {
      const next = {
        ...prev,
        [initiativeContractId]: {
          ...(prev?.[initiativeContractId] || {}),
          [lot]: { 1: v1, 3: v3, 4: v4 },
        },
      };
      console.log('[TOW] towPercentages dopo:', JSON.stringify(next));
      return next;
    });
  }, [initiative.contractType, towImpattoDb, initiativeContractId, lot]); // eslint-disable-line

  // Pre-popola towPercentages quando l'utente sceglie una fonte dal select "% da contratto" in step 3.
  // Gestito direttamente nell'onChange del select — nessun useEffect per evitare race condition.

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

  // eslint-disable-next-line no-unused-vars
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
        contract_id: initiativeContractId,
        lot_id: lot,
      });
      return data.records || [];
    } catch {
      return [];
    }
  }, [initiativeContractId, lot]);

  const persistInitiativeEvaluation = async (showMessage = true) => {
    if (!initiative.code && !initiative.title) {
      if (showMessage) toast("Inserisci almeno codice o titolo dell'iniziativa");
      return false;
    }
    const systems = [...new Set([initiative.system, ...importedInterventions.map((x) => x.sistema)].filter(Boolean))];
    const keyPart = appNorm(initiative.code || initiative.title).replace(/ /g, "-");
    // Se il record è stato aperto per modifica usa la sua chiave, altrimenti genera nuova
    const recordKey = editingRecordKey || `${initiativeContractId}|${lot}|initiative|${keyPart}`;
    const body = {
      record_key: recordKey,
      entity_type: "initiative_evaluation",
      contract_id: initiativeContractId,
      lot_id: String(lot),
      title: `${initiative.code ? initiative.code + " · " : ""}${initiative.title}`,
      payload: {
        version: 6,
        contractId: initiativeContractId,
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
        // Risultato del secondo parere AI (se presente, per non perderlo navigando)
        aiProposals: aiProposals || null,
        suggestions,
      },
    };
    try {
      await upsertConfiguratoreRecord(body);
      const isUpdate = !!editingRecordKey;
      if (showMessage) toast(isUpdate ? "Valutazione aggiornata con successo" : "Valutazione salvata e resa disponibile alle stime future");
      setEditingRecordKey(null); // reset dopo salvataggio
      loadArchive();
      return true;
    } catch (error) {
      toast("Salvataggio non riuscito: " + error.message);
      return false;
    }
  };

  // ── Reset / iniziativa ──
  const resetInitiative = () => {
    setInitiative({ code: "", title: "", system: "", contractType: "", release: "", requirements: "", description: "" });
    setImportedInterventions([]);
    setItems([]);
    setSuggestions([]);
    setTow({});
    // Azzera solo i valori del contratto/lotto corrente, così il useEffect li ripopola dai dati contratto
    setTowPercentages(prev => ({
      ...prev,
      [initiativeContractId]: { ...(prev?.[initiativeContractId] || {}), [lot]: { 1: 0, 3: 0, 4: 0 } }
    }));
    setDiscount(0);
    setContingency(0);
    setAiProposals(null);
    setEconomyNotes("");
    setSourceWorkbookName("");
    // Scheda tecnica / sviluppo
    setTechProfile(null);
    setImplementationFiles([]);
    setSelectedAppId("");
    setImplementationBranch("");
    setImplementationApprovalNotes("");
    setImplementationTests("");
    // Applicativi
    setApplicationDraft(null);
    setStep(1);
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
    // Se ci sono interventi importati dal workbook, usa runGapAnalysis
    // per ottenere il raggruppamento per ID_INTERVENTO (come in "Mostra dettaglio importato")
    if (importedInterventions.length > 0) {
      await runGapAnalysis(importedInterventions, items);
      setStep(2);
      return;
    }
    // Senza interventi importati: analisi testuale generica (suggestions senza interventionId)
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

    // ── Contesto applicativi: usa la lista corrente (dal DB, con schede AI) ──
    // Cerca prima gli applicativi che matchano il sistema dell'iniziativa,
    // poi include tutti se non trova match specifici.
    const initSystem = appNorm(initiative.system || "");
    const matchingApps = applications.filter(a =>
      initSystem && (
        appNorm(a.name).includes(initSystem) ||
        initSystem.includes(appNorm(a.name)) ||
        (a.systemAliases || []).some(alias => appNorm(alias).includes(initSystem) || initSystem.includes(appNorm(alias)))
      )
    );
    const appsForContext = matchingApps.length > 0 ? matchingApps : applications;

    const applicationContext = appsForContext.map(a => ({
      code:            a.code || "",
      name:            a.name,
      systemAliases:   a.systemAliases || [],
      technologies:    [
        ...(a.languages         || []),
        ...(a.databases         || []),
        ...(a.extraTechnologies || []),
        // Aggiungi dal profilo tecnico generato con AI se presente
        ...(a.techProfile?.technologies  || []),
        ...(a.techProfile?.frameworks    || []),
        ...(a.techProfile?.databases     || []),
        ...(a.techProfile?.integrations  || []),
      ].filter((v, i, arr) => v && arr.indexOf(v) === i), // deduplica
      notes:           a.notes || "",
      codeUrl:         a.codeUrl || "",
      codeLoadedAt:    a.codeLoadedAt || null,
      // Scheda tecnica da analisi codice sorgente
      techProfile:     a.techProfile ? {
        technologies:  a.techProfile.technologies  || [],
        frameworks:    a.techProfile.frameworks    || [],
        databases:     a.techProfile.databases     || [],
        integrations:  a.techProfile.integrations  || [],
        security:      a.techProfile.security      || [],
        infrastructure:a.techProfile.infrastructure|| [],
        totalFiles:    a.techProfile.totalFiles    || 0,
        readFiles:     a.techProfile.readFiles     || 0,
      } : null,
      // Scheda AI: tipi intervento tipici, mappature catalogo, rischi
      aiProfile:       a.aiProfile ? {
        interventionTypes: a.aiProfile.interventionTypes || [],
        catalogMappings:   a.aiProfile.catalogMappings   || [],
        risks:             a.aiProfile.risks             || [],
        techSummary:       a.aiProfile.techSummary       || "",
      } : null,
    }));

    return {
      contract: { id: selectedContractId, name: activeContract?.name || "" },
      lot,
      initiative,
      catalog: catalog.map((c) => ({
        id:          c.id,
        name:        c.nome,
        area:        c.ambito,
        description: c.descrizione || "",
        prices:      c.prezzi || c.price || {},
      })),
      excelInterventions: importedInterventions.map((x) => ({
        id:          x.interventionId || x.id,
        title:       x.titolo || x.title || "",
        description: x.descrizione || x.description || "",
        activity:    x.attivita || x.activity || "",
        quantity:    x.qty || x.quantity || 1,
        catalogId:   x.catalogId || x.idCatalogo || null,
        notes:       x.notes || "",
      })),
      currentSuggestions: suggestions.map((s) => ({
        catalogId:      s.id,
        selected:       s.selected,
        type:           s.type,
        complexity:     s.complexity,
        quantity:       s.qty,
        rationale:      s.reason,
        additionalInfo: s.additionalInfo || "",
        notes:          s.notes || "",
      })),
      // Applicativi con schede AI complete
      applicationContext,
      // Snippet codice sorgente per verifica tecnica
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
      const msg = err?.message || (err?.status ? `Errore ${err.status}` : String(err));
      const isAuthErr = msg.includes("401") || msg.includes("403")
        || msg.toLowerCase().includes("api key")
        || msg.toLowerCase().includes("authorization")
        || msg.toLowerCase().includes("bearer")
        || msg.toLowerCase().includes("chiave ai");
      if (isAuthErr) {
        setError("Chiave AI non valida o non configurata. Vai su Profilo utente (icona in alto a destra) → tab \"API Key AI\" e inserisci la tua API key Capgemini o OpenAI.");
      } else {
        setError("Analisi AI non riuscita: " + msg);
      }
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
          unit: it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: isBuiltin }),
        })),
        lot,
        contractId: initiativeContractId,
        archiveContractId: selectedContractId,
        tow5Share,
        towPercentages,
        tow,
        discount,
        contingency,
        catalog,
        priceMode,
        builtin: isBuiltin,
      }),
    [items, lot, initiativeContractId, selectedContractId, tow5Share, towPercentages, tow, discount, contingency, catalog, priceMode, activeContract] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const mappingCount = useMemo(() => importedInterventions.reduce((n, x) => n + (x.mappings?.length || 0), 0), [importedInterventions]);
  const tow5Total = useMemo(() => importedInterventions.reduce((n, x) => n + (Number(x.tow5) || 0), 0), [importedInterventions]);

  // ── Archivio ──
  const loadArchive = useCallback(() => {
    getConfiguratoreRecords({ entity_type: "initiative_evaluation", contract_id: initiativeContractId, lot_id: lot })
      .then((d) => setArchiveRecords(d.records || []))
      .catch((e) => { console.warn("loadArchive failed:", e); });
  }, [initiativeContractId, lot]);

  useEffect(() => { loadArchive(); }, [loadArchive]);

  // Reset completo al cambio contratto (cambio ambiente in App.js)
  const prevContractRef = useRef(null);
  useEffect(() => {
    if (prevContractRef.current !== null && prevContractRef.current !== initiativeContractId) {
      resetInitiative();
      setEditingRecordKey(null);
    }
    prevContractRef.current = initiativeContractId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiativeContractId]);

  // Carica le release del contratto selezionato per il campo Release in Step 1
  // Le release_calendar sono salvate con contract_id = ambienteId (es. "1"), non selectedContractId
  useEffect(() => {
    const cid = ambienteId ? String(ambienteId) : selectedContractId;
    if (!cid) return;
    getReleaseSchedules(cid)
      .then(d => setReleaseList((d.records || []).map(r => r.title || "").filter(Boolean).sort()))
      .catch(() => setReleaseList([]));
  }, [ambienteId, selectedContractId]); // eslint-disable-line

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

  const [editingRecordKey, setEditingRecordKey] = useState(null); // chiave del record aperto per modifica

   const reworkInitiative = (record) => {
    const payload = typeof record.payload === "string" ? safeParse(record.payload) : record.payload || {};
    // NON cambiare selectedContractId: è usato per caricare gli applicativi (sempre "poste-tet-2025").
    // Il contract_id del record è solo per identificare l'iniziativa nel DB — già gestito da
    // initiativeContractId (calcolato da codiceContratto/ambienteId) e da editingRecordKey.
    // setSelectedContractId(record.contract_id || payload.contractId || selectedContractId);
    setLot(String(record.lot_id || payload.lot || lot));
    if (payload.initiative) setInitiative(payload.initiative);
    if (payload.importedInterventions) setImportedInterventions(payload.importedInterventions);
    if (payload.items) setItems(payload.items);
    if (payload.suggestions) setSuggestions(payload.suggestions);
    if (payload.tow) setTow(payload.tow);
    if (payload.towPercentages) setTowPercentages(payload.towPercentages);
    if (payload.discount != null) setDiscount(payload.discount);
    if (payload.contingency != null) setContingency(payload.contingency);
    if (payload.economicNotes) setEconomyNotes(payload.economicNotes);
    if (payload.sourceWorkbookName) setSourceWorkbookName(payload.sourceWorkbookName);
    // Ripristina il risultato del secondo parere AI (se presente nel payload)
    setAiProposals(payload.aiProposals || null);
    // Memorizza la chiave del record esistente per sovrascrivere al salvataggio
    setEditingRecordKey(record.record_key || null);
    setStep(1);
    toast(`Valutazione "${record.title}" riaperta — modifica e premi "Salva valutazione" per aggiornarla`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Applicativi (port da addApplicationV39/saveApplication/delete r.159-160) ──

  // Salva applicativi sia in localStorage (offline) sia in DB (condivisione)
  const persistApplications = useCallback(async (contractId, lotId, apps) => {
    saveApplications(contractId, lotId, apps); // localStorage immediato
    setAppSyncBusy(true);
    try {
      await putSharedApplications(contractId, lotId, apps);
    } catch {
      toast("Attenzione: applicativi salvati solo in locale. Controlla la connessione.");
    } finally {
      setAppSyncBusy(false);
    }
  }, []); // eslint-disable-line

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
    persistApplications(selectedContractId, lot, next);
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
    persistApplications(selectedContractId, lot, next);
    setApplicationDraft(null);
    toast(`Applicativo ${applicationDraft.name} salvato${applicationDraft.code ? " con " + applicationDraft.code : ""}`);
  };

  const deleteApplication = (a) => {
    if (!window.confirm(`Eliminare l'applicativo ${a.name}?`)) return;
    const next = applications.filter((x) => applicationIdentity(x) !== applicationIdentity(a));
    setApplications(next);
    persistApplications(selectedContractId, lot, next);
    setApplicationDraft(null);
    toast("Applicativo eliminato");
  };

  const safeAppUrl = (url) => { try { const u = new URL(url, window.location.origin); return (u.protocol === "http:" || u.protocol === "https:") ? u.href : ""; } catch { return ""; } };

  // ── Feature 2: Genera scheda AI applicativo (solo Admin+Developer / SuperAdmin) ──
  // Carica codice sorgente + documentazione dell'applicativo selezionato,
  // chiama l'AI e aggiorna il profilo tecnico dell'applicativo in DB condiviso.
  const buildAiApplicationProfile = useCallback(async (targetApp) => {
    if (!targetApp) return;
    setAiAppBusy(true);
    setAiAppTarget(targetApp.id);
    try {
      // 1. Seleziona cartella sorgente
      const files = await new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.setAttribute("webkitdirectory", "");
        input.setAttribute("directory", "");
        input.onchange = () => resolve(input.files.length ? [...input.files] : []);
        input.oncancel = () => resolve([]);
        input.click();
      });
      if (!files.length) { setAiAppBusy(false); setAiAppTarget(null); return; }

      toast(`Analisi codice sorgente di ${targetApp.name} (${files.length} file)…`);

      // 2. Costruisce scheda tecnica locale (buildTechnicalProfile)
      const profile = await buildTechnicalProfile(
        files,
        {
          name: targetApp.name,
          applicationCode: targetApp.code || "",
          repositoryUrl: targetApp.codeUrl || "",
          systemAliases: targetApp.systemAliases || [targetApp.name],
        },
        catalog
      );

      // 3. Prepara snippet di codice per il contesto AI (max 40KB)
      const CODE_EXTS = /\.(js|jsx|ts|tsx|java|py|cs|go|rb|php|vue|html|css|xml|json|yaml|yml|md|sql)$/i;
      const relevant = files.filter(f => CODE_EXTS.test(f.name)).slice(0, 30);
      const MAX_TOTAL = 40000;
      let total = 0;
      const snippets = [];
      for (const f of relevant) {
        if (total >= MAX_TOTAL) break;
        try {
          const text = await f.text();
          const slice = text.slice(0, Math.min(3000, MAX_TOTAL - total));
          snippets.push({ file: f.webkitRelativePath || f.name, content: slice });
          total += slice.length;
        } catch {}
      }

      // 4. Chiama AI per arricchire la scheda con contesto dominio/interventi
      const aiCtx = {
        contract: { id: selectedContractId, name: activeContract?.name || "" },
        lot,
        initiative: { title: targetApp.name, system: targetApp.name, description: targetApp.notes || "" },
        catalog: catalog.map(c => ({ id: c.id, name: c.nome, area: c.ambito, description: c.descrizione || "" })),
        excelInterventions: [],
        currentSuggestions: [],
        sourceSnippets: snippets,
        techProfile: profile,
        task: "application_profile",
        instruction: `Analizza l'applicativo "${targetApp.name}" (codice ${targetApp.code || "N/A"}).
Sulla base del codice sorgente e del profilo tecnico rilevato, produci:
1. Lista interventi tipici necessari per evoluzioni/manutenzioni (ID_INTERVENTO, titolo, descrizione breve, categorie catalogo suggerite)
2. Mappatura precisa con le voci del catalogo (catalogId, tipo MODIFICA/REALIZZAZIONE, complessità tipica)
3. Dipendenze critiche e punti di attenzione per le iniziative
Rispondi in JSON strutturato con: { interventionTypes: [...], catalogMappings: [...], risks: [...], techSummary: "..." }`,
      };

      let aiEnrichment = null;
      try {
        const aiData = await analyzeInitiativeWithAi(aiCtx);
        aiEnrichment = aiData?.analysis || null;
      } catch {
        // AI non disponibile: procediamo con sola scheda tecnica locale
        toast("AI non disponibile: scheda salvata con sola analisi codice locale.");
      }

      // 5. Aggiorna l'applicativo con il profilo generato
      const updatedApp = {
        ...targetApp,
        techProfile:   profile,
        aiProfile:     aiEnrichment,
        codeLoadedAt:  new Date().toISOString(),
        languages:     profile.technologies?.length     ? profile.technologies     : targetApp.languages,
        databases:     profile.databases?.length        ? profile.databases        : targetApp.databases,
        extraTechnologies: profile.frameworks?.length   ? [...(profile.frameworks || []), ...(profile.integrations || [])] : targetApp.extraTechnologies,
      };

      const next = applications.map(a => a.id === targetApp.id ? updatedApp : a);
      setApplications(next);
      await persistApplications(selectedContractId, lot, next);

      toast(`Scheda AI di "${targetApp.name}" generata e condivisa con il team.`);
    } catch (err) {
      toast("Errore generazione scheda AI: " + (err.message || String(err)));
    } finally {
      setAiAppBusy(false);
      setAiAppTarget(null);
    }
  }, [applications, catalog, selectedContractId, lot, activeContract, persistApplications]); // eslint-disable-line

  // ── Analisi codice sorgente (scheda tecnica) ─────────────────────────────────
  const selectSourceFolder = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.onchange = async () => {
      if (!input.files.length) return;
      const name = initiative.system || initiative.title || "Applicativo";
      const applicationCode = initiative.code || "AP-000";
      setTechProfileBusy(true);
      setTechProfile(null);
      try {
        const profile = await buildTechnicalProfile(
          [...input.files],
          { name, applicationCode, repositoryUrl: "", systemAliases: [name] },
          catalog
        );
        setTechProfile(profile);
        // Riusa gli stessi file per lo step sviluppo
        setImplementationFiles([...input.files]);
        toast(`Analisi completata: ${profile.readFiles} file elaborati su ${profile.totalFiles} totali`);
      } catch (err) {
        toast("Analisi non riuscita: " + err.message);
      } finally {
        setTechProfileBusy(false);
      }
    };
    input.click();
  };

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
    if (!implementationFiles.length && !techProfile) {
      toast("Seleziona prima un applicativo in 'Applicativi e tecnologie'");
      return;
    }
    setDevBusy(true);
    try {
      const systems = evaluationSystems({ initiative, systems: [initiative.system], importedInterventions });
      const applicationCodes = evaluationApplicationCodes({ applicationContext: applicationContextFor(initiative.system, DEFAULT_APPLICATIONS[lot]) });
      // Se ci sono file fisici li uso, altrimenti uso i dati del profilo tecnico
      const hasFiles = implementationFiles.length > 0;
      const allPaths = hasFiles
        ? [...implementationFiles].map((f) => f.webkitRelativePath || f.name)
        : (techProfile?.filePaths || []);
      const sourcePaths = hasFiles
        ? [...implementationFiles]
            .filter((f) => sourceFileAllowed(f.name) && !ignoredSourcePath(f.webkitRelativePath || f.name))
            .map((f) => f.webkitRelativePath || f.name)
        : (techProfile?.filePaths || []).filter((p) => sourceFileAllowed(p) && !ignoredSourcePath(p));
      const folderName = hasFiles
        ? ((allPaths[0] || "").split("/")[0] || "repository")
        : (techProfile?.name || initiative.system || "repository");
      const request = {
        formatVersion: 3,
        generatedAt: new Date().toISOString(),
        source: "Configuratore MEV v1",
        targetTool: codeChangeTool,
        contractId: initiativeContractId,
        contractName: r.name || initiativeContractId,
        lot: String(lot),
        initiative,
        systems,
        applicationCodes,
        requirements: initiative.requirements || "",
        description: initiative.description || "",
        approvalNotes: implementationApprovalNotes,
        branch: implementationBranch,
        approvedInterventions: selected,
        excelInterventions: importedInterventions.map((x) => ({
          id:          x.id,
          title:       x.titolo || x.title || "",
          sistema:     x.sistema || "",
          componente:  x.componente || "",
          description: x.descrizione || x.description || "",
          activity:    x.attivita || x.activity || "",
          tow5:        x.tow5 || 0,
        })),
        techProfile: techProfile || null,
        repository: { folderName, totalFiles: allPaths.length, sourceFiles: sourcePaths.length, filePaths: allPaths, sourceFilePaths: sourcePaths },
      };
      const zip = new JSZip();
      zip.file("README_MODIFICA_CODICE.md", codeChangePrompt(request));
      zip.file("richiesta_modifica_codice.json", JSON.stringify(request, null, 2));
      zip.file("piano_sviluppo.md", implementationDocument({
        record: { payload, lot_id: lot, contract_id: selectedContractId, title: initiative.title },
        proposals: selected,
        branch: implementationBranch,
        approvalNotes: implementationApprovalNotes,
        tests: implementationTests,
        excelInterventions: importedInterventions.map((x) => ({
          id:          x.id,
          title:       x.titolo || x.title || "",
          sistema:     x.sistema || "",
          componente:  x.componente || "",
          description: x.descrizione || x.description || "",
          activity:    x.attivita || x.activity || "",
        })),
        techProfile: techProfile || null,
      }));
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
      excelInterventions: importedInterventions.map((x) => ({
        id:          x.id,
        title:       x.titolo || x.title || "",
        sistema:     x.sistema || "",
        componente:  x.componente || "",
        description: x.descrizione || x.description || "",
        activity:    x.attivita || x.activity || "",
      })),
      techProfile: techProfile || null,
    });
    downloadBlob(`piano_sviluppo_${code}.md`, new Blob([doc], { type: "text/markdown;charset=utf-8" }));
  };

  // ── Export ──
  const exportSnapshotJson = () => {
    const data = {
      version: 6,
      contractId: initiativeContractId,
      contractName: activeContract?.name || "",
      lot,
      priceMode,
      sourceWorkbookName,
      initiative,
      importedInterventions,
      items: items.map((it) => ({ ...it, unit: defaultPrice(it, { catalog, priceMode, builtin: isBuiltin }) })),
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
      const unit = it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: isBuiltin });
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
  if (loading) return <div role="status" aria-live="polite" style={{ padding: 40, margin: 24, borderRadius: 16, background: "#f4f7fb", color: "#174ea6" }}>Caricamento configuratore…</div>;

  const c = activeContract || builtinContract;
  // eslint-disable-next-line no-unused-vars
  const lots = c ? (c.lots || []).filter((l) => l.active !== false) : [];

  // Pill riassuntiva dell'iniziativa — mostrata in step 2, 3, 4
  const InitiativeBanner = () => {
    const hasData = initiative.code || initiative.title || initiative.system;
    if (!hasData) return null;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        background: "#f0f7ff", border: "1px solid #bfdbfe",
        borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 13,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Iniziativa</span>
        {initiative.code && (
          <span style={{ fontWeight: 800, color: "#1e293b" }}>{initiative.code}</span>
        )}
        {initiative.title && (
          <span style={{ color: "#334155" }}>{initiative.title}</span>
        )}
        {initiative.system && (
          <>
            <span style={{ color: "#94a3b8" }}>·</span>
            <span style={{ color: "#475569" }}>{initiative.system}</span>
          </>
        )}
        {initiative.release && (
          <>
            <span style={{ color: "#94a3b8" }}>·</span>
            <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, padding: "1px 7px", fontWeight: 600, fontSize: 11 }}>{initiative.release}</span>
          </>
        )}
        <button
          onClick={() => setStep(1)}
          style={{ marginLeft: "auto", fontSize: 11, padding: "3px 10px", background: "white", border: "1px solid #bfdbfe", borderRadius: 5, color: "#1a73e8", cursor: "pointer", fontWeight: 600 }}>
          ← Modifica
        </button>
      </div>
    );
  };

  return (
    <div style={{ padding: "clamp(16px, 2.5vw, 36px)", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", background: "#f5f7fa", color: "#172b4d", lineHeight: 1.5, minWidth: 0, maxWidth: 1600, margin: "0 auto", boxSizing: "border-box", overflowWrap: "anywhere" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid #dce3eb" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "clamp(22px, 3vw, 30px)", letterSpacing: "-0.7px", fontWeight: 750 }}>Configuratore Offerta TOW</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <span style={styles.badge}>Contratto {initiativeContractId}</span>
            <span style={styles.badge}>Lotto {lot}</span>
            <span style={styles.badge}>Catalogo · {catalog.length} voci</span>
          </div>
        </div>
        <button onClick={() => setShowContractForm((v) => !v)} style={btnStyles.secondary}>
          {showContractForm ? "Chiudi" : "⚙ Catalogo / Listino"}
        </button>
      </div>

      <div style={styles.eyebrow}>Contesto di lavoro</div>
      <section aria-label="Applicativi e archivio" style={{ background: "#edf1f6", padding: 12, borderRadius: 18, border: "1px solid #dce3eb", marginBottom: 28 }}>
      {/* APPLICATIVI E TECNOLOGIE PER LOTTO */}
      <div style={{ ...styles.card, marginTop: 0, marginBottom: 10, padding: 18 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, cursor: "pointer", userSelect: "none" }}
          onClick={() => setShowApplicativi(v => !v)}
        >
          <h3 style={{ margin: 0 }}>
            {showApplicativi ? "▾" : "▸"} Applicativi e tecnologie · Lotto {lot}
            {!showApplicativi && applications.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 400, color: "#64748b", marginLeft: 8 }}>({applications.length} configurati)</span>
            )}
          </h3>
          {showApplicativi && (
             <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }} onClick={e => e.stopPropagation()}>
               <input style={styles.input} placeholder="Cerca applicativo…" value={applicationSearch} onChange={(e) => setApplicationSearch(e.target.value)} />
               <button style={btnStyles.secondary} onClick={addApplicationV39}>Aggiungi applicativo</button>
               {appSyncBusy && (
                 <span style={{ fontSize: 11, color: "#1A6EBD", fontStyle: "italic" }}>⟳ Sincronizzazione DB…</span>
               )}
             </div>
           )}
        </div>
        {showApplicativi && (
        <>
        {applications.length === 0 ? (
          <p style={{ color: "#666", fontSize: 13 }}>Nessun applicativo configurato per questo lotto.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 12, marginTop: 16 }}>
            {applications
              .filter((a) => !appNorm(applicationSearch) || appNorm([a.name, a.code, (a.systemAliases || []).join(" "), (a.ambiti || []).join(" ")].join(" ")).includes(appNorm(applicationSearch)))
              .map((a, i) => {
                const tag = (props, arr) =>
                  (arr || []).length
                    ? `${props}: ${[...arr].join(" · ")}`
                    : "";
                const tags = [tag("OS", a.operatingSystems), tag("DBMS", a.databases), tag("Linguaggi", a.languages), tag("Extra", a.extraTechnologies)].filter(Boolean).join("<br>");
                return (
                   <div key={applicationIdentity(a) + "-" + i} style={{ ...styles.suggestion, flexDirection: "column", gap: 12 }}>
                     <div style={{ minWidth: 0, flex: 1 }}>
                       <strong>{esc(a.name || "Applicativo senza nome")}{a.code ? <span style={{ color: "#666", fontWeight: 400 }}> · {esc(a.code)}</span> : null}</strong>
                       {a.codeUrl ? <div style={styles.hint}><a href={safeAppUrl(a.codeUrl)} target="_blank" rel="noopener noreferrer">Repository</a></div> : null}
                       {(a.systemAliases || []).length ? <div style={styles.hint}>Sistema: {esc([...a.systemAliases].join(", "))}</div> : null}
                       <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                         {[...(a.languages || []), ...(a.databases || []), ...(a.operatingSystems || []), ...(a.extraTechnologies || [])].slice(0, 5).map((technology, ti) => <span key={ti} style={styles.badge}>{technology}</span>)}
                         {!tags && <span style={styles.hint}>Nessuna tecnologia indicata</span>}
                         <span style={{ ...styles.badge, background: a.aiProfile ? "#ecfdf3" : "#f1f3f6", color: a.aiProfile ? "#167347" : "#667085" }}>{a.aiProfile ? "✓ Scheda AI" : "○ Scheda AI assente"}</span>
                       </div>
                       {a.codeLoadedAt && (
                         <div style={{ fontSize: 11, color: "#166534", marginTop: 3 }}>
                           ✓ Scheda tecnica aggiornata il {new Date(a.codeLoadedAt).toLocaleDateString("it-IT")}
                           {a.aiProfile && <span style={{ marginLeft: 6, color: "#1A6EBD" }}>· AI: {(a.aiProfile?.interventionTypes?.length || 0)} tipi intervento rilevati</span>}
                         </div>
                       )}
                     </div>
                     <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                       {canAiApp && (
                         <button
                           style={{ ...btnStyles.secondary,
                             background: aiAppTarget === a.id ? "#FEF3C7" : a.aiProfile ? "#F0FDF4" : "#EFF6FF",
                             borderColor: aiAppTarget === a.id ? "#FCD34D" : a.aiProfile ? "#86EFAC" : "#93C5FD",
                             color: aiAppTarget === a.id ? "#92400E" : a.aiProfile ? "#166534" : "#1A6EBD",
                             opacity: (aiAppBusy && aiAppTarget !== a.id) ? 0.4 : 1,
                           }}
                           disabled={aiAppBusy}
                           title="Genera scheda AI: carica codice sorgente e documentazione per analisi intelligente"
                           onClick={() => buildAiApplicationProfile(a)}>
                           {aiAppTarget === a.id ? "⏳ Analisi AI…" : a.aiProfile ? "✓ Rigenera scheda AI" : "✨ Genera scheda AI"}
                         </button>
                       )}
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 }}>
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
             <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
               <button style={btnStyles.primary} onClick={saveApplicationDraft}>Salva applicativo</button>
               <button style={btnStyles.secondary} onClick={() => setApplicationDraft(null)}>Annulla</button>
             </div>
           </div>
         )}
         </>
        )}
       </div>

      {/* ── Valutazioni salvate + Nuova Iniziativa ── */}
      <div style={{ ...styles.card, marginBottom: 0, padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: showArchive && archiveRecords.length > 0 ? 10 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
              aria-expanded={showArchive}
              onClick={() => setShowArchive(v => !v)}>
              <span style={{ fontSize: 13, color: showArchive ? "#1a73e8" : "#102a47", fontWeight: 700 }}>
                {showArchive ? "▾" : "▸"} Archivio iniziative
              </span>
              <span style={{ fontSize: 12, color: "#667482" }}>
                {archiveRecords.length === 0 ? "Nessuna" : `${archiveRecords.length} iniziativ${archiveRecords.length === 1 ? "a" : "e"}`}
              </span>
            </button>
            {editingRecordKey && (
              <span style={{ fontSize: 11, background: "#fff8e1", color: "#92600a", border: "1px solid #f6c90e", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>
                In modifica
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnStyles.secondary} onClick={loadArchive}>↻ Aggiorna</button>
            <button
              style={{ ...btnStyles.primary, background: "linear-gradient(135deg,#102a47 0%,#1a73e8 100%)" }}
              onClick={() => {
                if (initiative.code || initiative.title || items.length > 0) {
                  if (!window.confirm("Avviare una nuova iniziativa? I dati non salvati andranno persi.")) return;
                }
                resetInitiative();
                setEditingRecordKey(null);
                setStep(1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}>
              + Nuova Iniziativa
            </button>
          </div>
        </div>
        {showArchive && archiveRecords.length > 0 && (
          <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {archiveRecords.map((rec) => {
              const payload = typeof rec.payload === "string" ? safeParse(rec.payload) : rec.payload || {};
              const ini = payload.initiative || {};
              const isCurrentlyEditing = editingRecordKey && editingRecordKey === rec.record_key;
              return (
                <div key={rec.Id || rec.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 14px", borderRadius: 10, gap: 10, flexWrap: "wrap",
                  background: isCurrentlyEditing ? "#fff8e1" : "#f8f9fa",
                  border: isCurrentlyEditing ? "1.5px solid #f6c90e" : "1px solid #e8ecf0",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#102a47", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {isCurrentlyEditing && <span style={{ color: "#92600a", marginRight: 6 }}>✏</span>}
                      {esc(ini.code || "—")} · {esc(ini.title || rec.title || "Senza titolo")}
                    </div>
                    <div style={{ fontSize: 11, color: "#667482", marginTop: 1 }}>
                      {esc(rec.contract_id || payload.contractId || "")}
                      {rec.lot_id ? ` · Lotto ${esc(rec.lot_id)}` : ""}
                      {ini.release ? ` · ${esc(ini.release)}` : ""}
                      {payload.items ? ` · ${payload.items.length} voci` : ""}
                      {payload.savedAt ? ` · ${new Date(payload.savedAt).toLocaleDateString("it-IT")}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button style={{ ...btnStyles.secondary, fontSize: 12, padding: "5px 12px" }} onClick={() => reworkInitiative(rec)}>
                      {isCurrentlyEditing ? "Già aperta" : "Apri"}
                    </button>
                    <button style={{ ...btnStyles.danger, fontSize: 12, padding: "10px 12px" }} onClick={() => deleteArchiveRecord(rec.Id || rec.id)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

       </section>
       <div style={styles.eyebrow}>Preparazione offerta</div>
       {/* Stepper */}
       <nav aria-label="Fasi di configurazione offerta" style={{ display: "flex", gap: 8, margin: "12px 0 20px", flexWrap: "wrap", alignItems: "stretch", padding: 12, background: "#fff", border: "1px solid #dce3eb", borderRadius: 14 }}>
         {STEPS.map((s, i) => {
           const complete = [Boolean((initiative.code || initiative.title) && initiative.system), suggestions.some((entry) => entry.selected) || items.length > 0, items.length > 0, false][i];
           return (
           <button aria-label={`${i + 1}. ${s}${complete ? ", dati presenti" : ""}`} aria-current={step === i + 1 ? "step" : undefined} key={s} onClick={() => go(i + 1)} style={step === i + 1 ? styles.stepActive : styles.step}>
             <span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, borderRadius: "50%", background: complete && step !== i + 1 ? "#dcfce7" : step === i + 1 ? "#1a73e8" : "#edf2f8", color: complete && step !== i + 1 ? "#167347" : step === i + 1 ? "#fff" : "#64748b", marginRight: 8 }}>{complete && step !== i + 1 ? "✓" : i + 1}</span>{s}
           </button>
         ); })}
         <button
           style={{ ...btnStyles.primary, marginLeft: "auto", background: "linear-gradient(135deg,#102a47 0%,#1a73e8 100%)" }}
           onClick={async () => {
             await persistInitiativeEvaluation(true);
             resetInitiative();
             setEditingRecordKey(null);
             setStep(1);
             window.scrollTo({ top: 0, behavior: "smooth" });
           }}>
           Salva e Chiudi
         </button>
       </nav>

      {error && (
        <p role="alert" style={{ color: "#b00020", fontSize: 13, background: "#fdecec", padding: "8px 12px", borderRadius: 6 }}>
          {error}
          <button style={{ marginLeft: 8, border: "none", background: "none", cursor: "pointer" }} onClick={() => setError("")}>✕</button>
        </p>
      )}

      <main style={{ minWidth: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: "#102a47", fontSize: 23, letterSpacing: "-0.5px" }}>{STEPS[step - 1]}</h2>
        <p style={styles.hint}>{["Definisci il contesto dell’iniziativa e collega i dati del cliente.", "Valuta gli interventi e integra le proposte del catalogo.", "Componi la valorizzazione e verifica il totale dell’offerta.", "Verifica il riepilogo e prepara i documenti finali."][step - 1]}</p>
      </div>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <input
                    style={{ ...styles.input, flex: 1, background: "#f4f7fb", color: "#334155" }}
                    value={initiative.system}
                    readOnly
                    title="Valorizzato dal file Excel importato"
                    placeholder="(da file Excel)"
                  />
                  <select
                    style={{ ...styles.input, flex: "1 1 160px", minWidth: 0 }}
                    value={selectedAppId}
                    onChange={(e) => {
                      const appId = e.target.value;
                      setSelectedAppId(appId);
                      if (!appId) return;
                      const app = applications.find((a) => String(a.id) === appId);
                      if (!app) return;
                      if (app.techProfile) setTechProfile(app.techProfile);
                      setImplementationFiles([]);
                      toast(`Applicativo "${app.name}" selezionato — profilo tecnico caricato`);
                    }}>
                    <option value="">Seleziona App…</option>
                    {applications.map((a) => (
                      <option key={a.id} value={String(a.id)}>{a.name}{a.code ? ` (${a.code})` : ""}</option>
                    ))}
                  </select>
                </div>
              </label>
               <label style={styles.label}>Tipo contratto
                 <select style={styles.input}
                   value={initiative.contractType || ""}
                   onChange={(e) => {
                     const val = e.target.value;
                     setInitiative((i) => ({ ...i, contractType: val }));
                     // Se towImpattoDb non è ancora caricato, forzalo ora
                     if (val && Object.keys(towImpattoDb).length === 0) {
                       getTowImpatto().then(imp => {
                         if (imp && typeof imp === "object" && Object.keys(imp).length > 0)
                           setTowImpattoDb(imp);
                       }).catch(() => {});
                     }
                   }}>
                   <option value="">— nessuno —</option>
                   {Object.keys(towImpattoDb).length > 0
                     ? Object.keys(towImpattoDb).map(k => <option key={k} value={k}>{k}</option>)
                     : ["BASE", "QDO"].map(k => <option key={k} value={k}>{k}</option>)
                   }
                 </select>
               </label>
                <label style={styles.label}>Release
                  {releaseList.length > 0 ? (
                    <>
                      <select style={styles.input}
                        value={releaseList.includes(initiative.release) || initiative.release === "" || initiative.release === "Da pianificare" || initiative.release === "TBD" ? initiative.release : "__altro__"}
                        onChange={(e) => {
                          if (e.target.value !== "__altro__") setInitiative((i) => ({ ...i, release: e.target.value }));
                          else setInitiative((i) => ({ ...i, release: "" }));
                        }}>
                        <option value="">— nessuna —</option>
                        <option value="Da pianificare">Da pianificare</option>
                        <option value="TBD">TBD (To Be Defined)</option>
                        {releaseList.map(r => <option key={r} value={r}>{r}</option>)}
                        <option value="__altro__">Altro (testo libero)…</option>
                      </select>
                      {(!releaseList.includes(initiative.release) && initiative.release !== "" && initiative.release !== "Da pianificare" && initiative.release !== "TBD") && (
                        <input style={{ ...styles.input, marginTop: 4 }}
                          value={initiative.release}
                          placeholder="Inserisci release (es. TBD, R2025-09…)"
                          onChange={(e) => setInitiative((i) => ({ ...i, release: e.target.value }))} />
                      )}
                    </>
                  ) : (
                    <input style={styles.input} value={initiative.release}
                      placeholder="es. R2025-04 oppure TBD (opzionale)"
                      onChange={(e) => setInitiative((i) => ({ ...i, release: e.target.value }))} />
                  )}
                </label>
              <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Requisiti
                <textarea style={styles.textarea} value={initiative.requirements} onChange={(e) => setInitiative((i) => ({ ...i, requirements: e.target.value }))} rows={2} />
              </label>
              <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span>Descrizione</span>
                  <button type="button"
                    style={{ fontSize: 11, padding: "2px 9px", border: "1px solid #bdc9d4", borderRadius: 5, background: "#f1f5f9", cursor: "pointer", color: "#334155" }}
                    onClick={() => setShowDescModal(true)}>
                    ⤢ Espandi
                  </button>
                </div>
                <textarea style={styles.textarea} value={initiative.description} onChange={(e) => setInitiative((i) => ({ ...i, description: e.target.value }))} rows={3} />
              </label>
              {/* Modale descrizione */}
              {showDescModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
                  onClick={() => setShowDescModal(false)}>
                  <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: "min(860px, 94vw)", boxSizing: "border-box", overflowY: "auto", maxHeight: "88dvh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <strong style={{ fontSize: 16, color: "#102a47" }}>Descrizione iniziativa</strong>
                      <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b", lineHeight: 1 }} onClick={() => setShowDescModal(false)}>✕</button>
                    </div>
                    <textarea
                      autoFocus
                      style={{ flex: 1, minHeight: "min(420px, 48dvh)", resize: "vertical", border: "1px solid #bdc9d4", borderRadius: 8, padding: "12px 14px", fontSize: 14, lineHeight: 1.6, fontFamily: "inherit" }}
                      value={initiative.description}
                      onChange={(e) => setInitiative((i) => ({ ...i, description: e.target.value }))}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                      <button style={btnStyles.primary} onClick={() => setShowDescModal(false)}>Chiudi</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button style={btnStyles.primary} onClick={analyze}>
                {importedInterventions.length > 0 ? `Analizza integrazioni (${importedInterventions.length} interventi)` : "Analizza e suggerisci"}
              </button>
              <button style={btnStyles.secondary} onClick={resetInitiative}>Reset</button>
            </div>
          </div>

          {/* ── Codice sorgente: scheda tecnica collassabile ── */}
          <div style={{ ...styles.card, background: "#eef5ff", borderColor: "#cbdcf5", borderLeft: "4px solid #1a73e8" }}>
            {!techProfile ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>⌘ Codice sorgente</div>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>— nessun profilo tecnico (seleziona un applicativo sopra)</span>
              </div>
            ) : (() => {
              const langs   = techProfile.technologies   || [];
              const ifaces  = techProfile.interfaces     || [];
              const integr  = techProfile.integrations   || [];
              const dbs     = techProfile.databases      || [];
              const testing = techProfile.testing        || [];
              const langStr = langs.slice(0, 5).join(", ") + (langs.length > 5 ? `, +${langs.length - 5} altri` : "");
              const counts  = [
                ifaces.length  ? `${ifaces.length} tipologi${ifaces.length === 1 ? "a" : "e"} di interfaccia` : null,
                integr.length  ? `${integr.length} integrazioni` : null,
                dbs.length     ? `${dbs.length} tecnologi${dbs.length === 1 ? "a" : "e"} dati` : null,
                testing.length ? "test automatici rilevati" : null,
              ].filter(Boolean).join("; ");
              const appName = techProfile.name || initiative.system || "Applicativo";
              const summary = `${appName}${langStr ? ` — basato principalmente su ${langStr}` : ""}${counts ? `. ${counts}` : ""}`;

              return (
                <details>
                  <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 8, userSelect: "none" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#102a47" }}>⌘ Codice sorgente</span>
                    <span style={{ fontSize: 12, color: "#475569", flex: 1 }}>{summary}</span>
                    <span style={{ fontSize: 11, color: "#1a73e8", flexShrink: 0 }}>▸ dettagli</span>
                  </summary>

                  <div style={{ marginTop: 14 }}>
                    {/* Header scheda */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Scheda tecnica memorizzata</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#102a47" }}>{techProfile.name} · {techProfile.applicationCode}</div>
                        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{techProfile.summary}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ background: "#dcfce7", color: "#16a34a", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700 }}>Disponibile per le stime</span>
                        <button
                          style={{ ...btnStyles.secondary, fontSize: 12 }}
                          disabled={techProfileBusy}
                          onClick={selectSourceFolder}>
                          {techProfileBusy ? "Analisi…" : `↻ Rianalizza (${techProfile.totalFiles} file)`}
                        </button>
                      </div>
                    </div>

                    {/* Metriche */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: 8, marginBottom: 14 }}>
                      {[
                        ["File nella cartella",  techProfile.totalFiles],
                        ["Sorgenti analizzati",  techProfile.readFiles],
                        ["File di test",         techProfile.testFiles],
                        ["Configurazioni",       techProfile.configFiles],
                      ].map(([label, val]) => (
                        <div key={label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#102a47" }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sezioni tecniche */}
                    {(() => {
                      const TagList = ({ items }) => items?.length ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px", marginTop: 4 }}>
                          {items.map((t) => (
                            <span key={t} style={{ background: "#e0e7ff", color: "#3730a3", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>{t}</span>
                          ))}
                        </div>
                      ) : <span style={{ color: "#94a3b8", fontSize: 11 }}>—</span>;

                      const Section = ({ title, items }) => items?.length ? (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: "#475569", marginBottom: 2 }}>{title}</div>
                          <TagList items={items} />
                        </div>
                      ) : null;

                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: "10px 16px", marginBottom: 12 }}>
                          <Section title="Linguaggi"               items={techProfile.technologies} />
                          <Section title="Framework e piattaforme" items={techProfile.frameworks} />
                          <Section title="Dati e persistenza"      items={techProfile.databases} />
                          <Section title="Integrazioni"            items={techProfile.integrations} />
                          <Section title="Interfacce e processi"   items={techProfile.interfaces} />
                          <Section title="Sicurezza"               items={techProfile.security} />
                          <Section title="Test"                    items={techProfile.testing} />
                          <Section title="Infrastruttura e build"  items={techProfile.infrastructure} />
                          <Section title="Componenti o moduli"     items={techProfile.components} />
                        </div>
                      );
                    })()}

                    {/* Segnali catalogo */}
                    {techProfile.catalogSignals?.length > 0 && (
                      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: "#92400e", marginBottom: 6 }}>
                          Indizi utili per il Catalogo del Lotto {lot}
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.7, color: "#78350f" }}>
                          {techProfile.catalogSignals.map((x) => (
                            <span key={x.id} style={{ display: "block" }}>
                              <strong>ID {x.id} · {x.name}</strong>{x.reason ? ` (${x.reason})` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rischi */}
                    {techProfile.risks?.length > 0 && (
                      <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 6, padding: "10px 12px" }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: "#9f1239", marginBottom: 4 }}>Verifiche tecniche consigliate</div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "#881337" }}>
                          {techProfile.risks.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              );
            })()}
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
                        <div role="region" aria-label="Dettaglio valori di catalogo" tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%", minWidth: 0, borderRadius: 10, border: "1px solid #e2e8f0" }}><table style={{ ...styles.table, fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: "#102a47", color: "#fff" }}>
                              <th style={{ padding: "10px 12px", textAlign: "left" }}>Componente</th>
                              <th style={{ padding: "10px 12px", textAlign: "left" }}>Tipo</th>
                              <th style={{ padding: "10px 12px", textAlign: "left" }}>Complessità</th>
                              <th style={{ padding: "10px 12px", textAlign: "right" }}>Q.tà</th>
                              <th style={{ padding: "10px 12px", textAlign: "right" }}>Prezzo unitario (€)</th>
                              <th style={{ padding: "10px 12px", textAlign: "right" }}>Totale (€)</th>
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
                                  <td style={{ padding: "10px 12px" }}>
                                    <div style={{ fontWeight: 600 }}>{esc(m.name)}</div>
                                    {m.detailDescription ? <div style={{ color: "#667482", fontSize: 11 }}>{esc(m.detailDescription)}</div> : null}
                                  </td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <select style={{ ...styles.input, fontSize: 11, padding: "3px 6px" }} value={m.type || "REALIZZAZIONE"}
                                      onChange={e => updMapping({ type: e.target.value, unit: null })}>
                                      <option>REALIZZAZIONE</option><option>MODIFICA</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <select style={{ ...styles.input, fontSize: 11, padding: "3px 6px" }} value={m.complexity || "Medio"}
                                      onChange={e => updMapping({ complexity: e.target.value, unit: null })}>
                                      {validC.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                    <input type="number" min={0} step={0.01} value={qty}
                                      onChange={e => updMapping({ qty: Number(e.target.value) || 0, total: (Number(e.target.value) || 0) * unit })}
                                      style={{ ...styles.input, width: 60, fontSize: 11, padding: "3px 6px", textAlign: "right" }} />
                                  </td>
                                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                    <input type="number" min={0} step={0.01} value={unit}
                                      onChange={e => updMapping({ unit: Number(e.target.value) || 0, total: qty * (Number(e.target.value) || 0) })}
                                      style={{ ...styles.input, width: 90, fontSize: 11, padding: "3px 6px", textAlign: "right" }} />
                                  </td>
                                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700 }}>
                                    {euro.format(qty * unit)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table></div>
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
          <InitiativeBanner />
          <div aria-busy={aiBusy} style={{ ...styles.card, marginBottom: 20, background: "#f5f3ff", borderColor: "#ddd6fe", borderTop: "3px solid #6366f1" }}>
            <h3 style={{ margin: "0 0 8px" }}>Supporto AI alla valutazione</h3>
            {!aiBusy && !aiProposals && <p style={styles.hint}>Richiedi un secondo parere sui dati dell'iniziativa. Le proposte AI verranno mostrate direttamente in cima a ogni gruppo negli interventi.</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong>{importedInterventions.length ? `${mappingCount} valorizzazioni già previste nell'Excel e ${suggestions.length} possibili integrazioni da valutare.` : `${suggestions.length} componenti candidate nel Catalogo Lotto ${lot}.`}</strong>
              <button style={btnStyles.primary} onClick={analyzeWithAi} disabled={aiBusy}
                title="Invia l'iniziativa al modello AI: riceverai un sommario e proposte di voci di catalogo da aggiungere/escludere/modificare">
                {aiBusy ? "Analisi AI in corso…" : aiProposals ? "Aggiorna parere AI" : "Secondo parere AI"}
              </button>
              {aiProposals && !aiBusy && (
                <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 600 }}>
                  ✓ {aiProposals.proposals.length} proposte AI attive · {aiProposals.model || "AI"}
                </span>
              )}
            </div>
            {aiBusy && (
              <div role="status" aria-live="polite" style={{ marginTop: 16, padding: "16px 18px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, fontSize: 12, color: "#92400e" }}>
                <strong>Analisi AI in corso</strong> — il modello sta esaminando l'iniziativa, gli interventi e il catalogo.<br/>
                <span style={{ color: "#78350f" }}>L'operazione può richiedere 1-2 minuti. Non chiudere la pagina.</span>
              </div>
            )}
            {aiProposals?.analysis?.summary && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#6366f1", fontWeight: 600 }}>Leggi il riepilogo AI</summary>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#374151", whiteSpace: "pre-wrap", background: "#f5f7ff", borderRadius: 6, padding: "10px 12px", border: "1px solid #c7d2fe" }}>
                  {aiProposals.analysis.summary}
                </p>
                {aiProposals.analysis?.warnings?.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11, color: "#92400e" }}>
                    {aiProposals.analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </details>
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

  // Proposte AI valide (voce esiste nel catalogo, non è "exclude")
  const aiPending = (aiProposals?.proposals || []).filter(p =>
    p.action !== "exclude" &&
    catalog.some(c => String(c.id) === String(p.catalogId)) &&
    // non già aggiunta come suggestion
    !suggestions.some(s => String(s.id) === String(p.catalogId))
  );

  return (
    <>
      {/* ── BLOCCO PROPOSTE AI – sempre in cima, prima dei gruppi ── */}
      {aiPending.length > 0 && (
        <div style={{ display: "grid", gap: 8, padding: "12px 14px", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 8, marginTop: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#5b21b6" }}>
            Proposte AI · {aiProposals.model || "AI"} — aggiungi quelle pertinenti
          </div>
          {aiPending.map((p, pi) => {
            const cc = catalog.find(c => String(c.id) === String(p.catalogId));
            if (!cc) return null;
            const conf = Math.round((Number(p.confidence) || 0) * 100);
            return (
              <div key={pi} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "16px", flexWrap: "wrap", background: "#fff", border: "1px solid #ddd8fe", borderRadius: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600, marginBottom: 2 }}>
                    ID {cc.id} · {esc(cc.ambito)}
                    {p.interventionId && p.interventionId.trim() && (
                      <span style={{ marginLeft: 8, background: "#e0e7ff", color: "#3730a3", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                        ID_INTERVENTO {p.interventionId}
                      </span>
                    )}
                    {conf > 0 && (
                      <span style={{ marginLeft: 8, background: conf >= 70 ? "#dcfce7" : "#fef9c3", color: conf >= 70 ? "#166534" : "#92400e", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>
                        Confidenza {conf}%
                      </span>
                    )}
                  </div>
                  <strong style={{ fontSize: 13, display: "block", marginBottom: 3 }}>{esc(cc.nome)}</strong>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {p.type || "MODIFICA"} · {p.complexity || "Medio"} · Q.tà {p.quantity || 1}
                  </div>
                  {p.rationale && (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#374151", background: "#ede9fe", borderRadius: 4, padding: "6px 8px", borderLeft: "3px solid #7c3aed" }}>
                      {p.rationale}
                    </p>
                  )}
                </div>
                <button
                  style={{ ...btnStyles.primary, background: "#7c3aed", border: "1px solid #6d28d9", whiteSpace: "nowrap", flexShrink: 0, fontSize: 12, padding: "6px 12px" }}
                  onClick={() => {
                    const catalogEntry = catalog.find(c => String(c.id) === String(p.catalogId));
                    if (!catalogEntry) return;
                    // Assegna al gruppo dell'interventionId se presente, altrimenti nessun gruppo
                    const intId = p.interventionId && p.interventionId.trim() !== "" ? p.interventionId.trim() : undefined;
                    setSuggestions(prev => [...prev, {
                      id: catalogEntry.id,
                      selected: true,
                      type: p.type === "REALIZZAZIONE" ? "REALIZZAZIONE" : "MODIFICA",
                      complexity: p.complexity || "Medio",
                      qty: Math.max(0.01, Number(p.quantity) || 1),
                      score: Math.round((Number(p.confidence) || 0) * 10),
                      reason: p.rationale || "",
                      additionalInfo: "Proposta AI",
                      interventionId: intId,
                    }]);
                  }}
                >
                  + Aggiungi
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── GRUPPI ESISTENTI ── */}
      {[...groups.entries()].map(([gid, items]) => {
    const inter = importedInterventions.find((x) => String(x.id) === String(gid));
    const isNoIntervention = gid === "__NOX__";
    const isManual = gid === "__MANUALE__";

    return (
      <details key={gid} open={isNoIntervention || isManual} style={{ ...styles.card, marginBottom: 10, padding: 0, border: "1px solid #dde1e6" }}>
        <summary style={{ cursor: "pointer", padding: "10px 14px", fontWeight: 700, fontSize: 13, background: "#f8f9fa", borderRadius: "8px 8px 0 0", listStyle: "none", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ flex: "0 0 auto", marginTop: 1 }}>▶</span>
          <span style={{ flex: 1 }}>
            {isNoIntervention
              ? <span style={{ color: "#1a73e8" }}>Voci di catalogo suggerite</span>
              : isManual
                ? <span style={{ color: "#1a73e8" }}>Voci aggiunte manualmente</span>
                : <span style={{ color: "#1a73e8" }}>ID_INTERVENTO {gid}</span>
            }
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
            const cc = catalog.find((x) => String(x.id) === String(s.id));
            if (!cc) return null;
            // CORRETTO: validComplexities(catalogEntry, typeString)
            const vals = validComplexities(cc, s.type);
            const unitPrice = defaultPrice(s, { catalog, priceMode, builtin: isBuiltin });
            const importoProposto = unitPrice * (s.qty || 1);
            return (
              <div key={i} style={{ ...styles.suggestion, border: s.selected ? "1px solid #1a73e8" : "1px solid #ddd", display: "grid", gap: 8, background: s.selected ? "#f0f7ff" : "#fff" }}>
                {/* Riga intestazione con checkbox */}
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" style={{ marginTop: 3, flex: "0 0 auto" }} checked={s.selected} onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, selected: e.target.checked } : q)))} />
                   <div style={{ flex: 1 }}>
                     <div style={{ color: "#667482", fontSize: 11, marginBottom: 2 }}>
                       ID {cc.id} · {esc(cc.ambito)}
                       {s.additionalInfo === "Proposta AI" && (
                         <span style={{ marginLeft: 8, background: "#ede9fe", color: "#6d28d9", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>✦ AI</span>
                       )}
                     </div>
                     <strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>{esc(cc.nome)}</strong>
                     {cc.descrizione && (
                       <p style={{ margin: "0 0 4px", fontSize: 12, color: "#444", lineHeight: 1.5, background: "#f4f6f8", borderRadius: 5, padding: "10px 12px" }}>
                         <span style={{ fontWeight: 600, color: "#102a47" }}>Voce catalogo: </span>{esc(cc.descrizione)}
                       </p>
                     )}
                     {s.reason && (
                       <p style={{ margin: 0, fontSize: 12, color: "#1a5276", lineHeight: 1.5, background: "#eaf4fb", borderRadius: 5, padding: "10px 12px", borderLeft: "3px solid #1a73e8" }}>
                         <span style={{ fontWeight: 600 }}>Motivo proposta: </span>{s.reason}
                       </p>
                     )}
                   </div>
                </label>

                {/* Tabella prezzi S/M/C */}
                <div style={{ overflowX: "auto" }}>
                  <div role="region" aria-label="Dettaglio valori di catalogo" tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%", minWidth: 0, borderRadius: 10, border: "1px solid #e2e8f0" }}><table style={{ ...styles.table, fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#102a47", color: "#fff" }}>
                        <th style={{ padding: "10px 12px", textAlign: "left" }}>Tipo</th>
                        <th style={{ padding: "10px 12px", textAlign: "left" }}>Complessità</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Pz. Semplice</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Pz. Medio</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Pz. Complesso</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Q.tà</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Importo proposto</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: "#f9fbfd" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <select style={{ ...styles.input, fontSize: 11, padding: "3px 5px", minWidth: 110 }} value={s.type}
                            onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, type: e.target.value } : q)))}>
                            <option>REALIZZAZIONE</option><option>MODIFICA</option>
                          </select>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <select style={{ ...styles.input, fontSize: 11, padding: "3px 5px" }} value={s.complexity}
                            onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, complexity: e.target.value } : q)))}>
                            {vals.length > 0
                              ? vals.map((v) => (<option key={v} value={v}>{v}</option>))
                              : <option value={s.complexity}>{s.complexity}</option>
                            }
                          </select>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: s.complexity === "Semplice" ? "#1a73e8" : "#444", fontWeight: s.complexity === "Semplice" ? 700 : 400 }}>
                          {cc.prezzi?.[s.type]?.Semplice != null ? euro.format(cc.prezzi[s.type].Semplice) : "–"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: s.complexity === "Medio" ? "#1a73e8" : "#444", fontWeight: s.complexity === "Medio" ? 700 : 400 }}>
                          {cc.prezzi?.[s.type]?.Medio != null ? euro.format(cc.prezzi[s.type].Medio) : "–"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: s.complexity === "Complesso" ? "#1a73e8" : "#444", fontWeight: s.complexity === "Complesso" ? 700 : 400 }}>
                          {cc.prezzi?.[s.type]?.Complesso != null ? euro.format(cc.prezzi[s.type].Complesso) : "–"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <input type="number" min="1" step={1} value={Math.round(s.qty || 1)}
                            onChange={(e) => setSuggestions((prev) => prev.map((q, j) => (j === s.__gi ? { ...q, qty: Math.max(1, Math.round(Number(e.target.value) || 1)) } : q)))}
                            style={{ ...styles.input, width: 60, fontSize: 11, padding: "3px 5px", textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#102a47" }}>
                          {euro.format(importoProposto)}
                        </td>
                      </tr>
                    </tbody>
                  </table></div>
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
  })}
    </>
  );
})()}
          </div>

           {/* Catalogo manuale — sezione collassabile */}
           <details style={styles.card}>
             <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
               <div>
                 <h3 style={{ margin: 0, fontSize: 15 }}>Aggiungi manualmente dal catalogo</h3>
                 <p style={{ margin: "2px 0 0", fontSize: 12, color: "#667482" }}>
                   {catalog.length} voci disponibili · Le voci aggiunte compaiono nelle "Possibili integrazioni" come selezionate.
                 </p>
               </div>
               <span style={{ fontSize: 12, color: "#1a73e8", fontWeight: 600, whiteSpace: "nowrap", marginLeft: 12 }}>
                 {suggestions.filter(s => s.interventionId === "__MANUALE__").length > 0
                   ? `${suggestions.filter(s => s.interventionId === "__MANUALE__").length} aggiunte`
                   : "Espandi"}
               </span>
             </summary>
             <div style={{ marginTop: 10, display: "grid", gap: 0, maxHeight: 420, overflow: "auto", border: "1px solid #dde1e6", borderRadius: 8 }}>
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
                       <button style={{ ...btnStyles.secondary, whiteSpace: "nowrap", fontSize: 12, padding: "10px 12px",
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
           </details>
        </div>
      )}

      {/* STEP 3: OFFERTA */}
      {step === 3 && (
        <div>
          <InitiativeBanner />
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
              <strong>Base TOW automatici: </strong>{euro.format(calculation.allocationBase)}
              <span style={{ fontSize: 12, color: '#52657d', marginLeft: 8 }}>
                (catalogo × {calculation.towMultiplier?.toFixed(5)})
              </span>
            </div>
          </div>

          {/* TOW automatici */}
           <div style={styles.card}>
             <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
               <h3 style={{ margin: 0 }}>TOW automatici (Lotto {lot})</h3>
               {Object.keys(towImpattoDb).length > 0 && (
                 <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
                   % da contratto:
                    <select
                      value={towImpattoSrc}
                      onChange={e => {
                        const src = e.target.value;
                        // Aggiorna anche initiative.contractType per coerenza con step 1
                        setInitiative(i => ({ ...i, contractType: src }));
                      }}
                     style={{ border: "1px solid #bdc9d4", borderRadius: 5, padding: "3px 8px", fontSize: 12, background: "#fff" }}>
                    <option value="">— nessuno —</option>
                    {Object.keys(towImpattoDb).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
              )}
             </div>
             <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px),1fr))" }}>
              {["1", "3", "4"].map((n) => {
                const k = `TOW0${lot}.${n}`;
                const amount = calculation.autoTow[k] || 0;
                const unit = towPricesMap[k] || 0;
                const qty = unit ? amount / unit : null;
                const pctCurrent = towPercentages?.[initiativeContractId]?.[lot]?.[n] ?? 0;
                const srcKey = towImpattoSrc || activeLot?.codiceContratto || "";
                const fromDb = srcKey && towImpattoDb[srcKey]?.[k];
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
                          [initiativeContractId]: {
                            ...(prev?.[initiativeContractId] || {}),
                            [lot]: { ...(prev?.[initiativeContractId]?.[lot] || { 1: 0, 3: 0, 4: 0 }), [n]: Number(e.target.value) || 0 },
                          },
                        }))}
                        style={{ width: 70, border: "1px solid #bdc9d4", borderRadius: 5, padding: "4px 6px", fontSize: 13, textAlign: "right" }}
                      />
                      <span style={{ fontSize: 12, color: "#444" }}>%</span>
                      {fromDb != null && (
                        <span style={{ fontSize: 10, color: "#7c3aed", marginLeft: 4 }} title={`Valore da Gestione Contratto (${srcKey}): ${fromDb}%`}>★</span>
                      )}
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
            <div role="region" aria-label="TOW manuali: quantità e importi" tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%" }}>
            <div style={{ display: "grid", minWidth: 560, gridTemplateColumns: "100px 130px 150px 1fr", gap: "4px 8px", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Nome TOW</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>QTA</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Valore Unit. €</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Totale</div>
            </div>
            {["2", "6"].map((n) => {
              const k = `TOW0${lot}.${n}`;
              return (
                <div key={n} style={{ display: "grid", minWidth: 560, gridTemplateColumns: "100px 130px 150px 1fr", gap: "4px 8px", alignItems: "center", marginBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>{k}</strong>
                  <input style={{ ...styles.input, width: "100%", boxSizing: "border-box" }} type="number" min="0" step=".001" value={tow[k] || 0} placeholder="Quantità"
                    onChange={(e) => setTow((t) => ({ ...t, [k]: Number(e.target.value) || 0 }))} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <input style={{ ...styles.input, width: "100%", boxSizing: "border-box" }} type="number" min="0" step=".01" value={towPricesMap[k] || tow[k + "_price"] || 0} placeholder="Prezzo unitario"
                      onChange={(e) => setTow((t) => ({ ...t, [k + "_price"]: Number(e.target.value) || 0 }))} />
                    <span style={{ fontSize: 10, color: "#64748b" }}>{euro.format(towPricesMap[k] || tow[k + "_price"] || 0)}</span>
                  </div>
                  <span style={{ fontWeight: 600 }}>{euro.format((tow[k] || 0) * (towPricesMap[k] || tow[k + "_price"] || 0))}</span>
                </div>
              );
            })}
          </div>
          </div>

          {/* Riga offerta */}
          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ margin: 0 }}>Voci di catalogo</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...btnStyles.ghost, fontSize: 12, padding: "4px 10px" }}
                  onClick={() => {
                    const groups = {};
                    items.forEach(it => { const g = it.interventionId || "—"; if (!groups[g]) groups[g] = true; });
                    setExpandedOfferGroups(new Set(Object.keys(groups)));
                  }}>
                  Espandi tutti
                </button>
                <button style={{ ...btnStyles.ghost, fontSize: 12, padding: "4px 10px" }}
                  onClick={() => setExpandedOfferGroups(new Set())}>
                  Chiudi tutti
                </button>
              </div>
            </div>
            {(() => {
              const groups = {};
              items.forEach(it => {
                const gid = it.interventionId || "—";
                if (!groups[gid]) groups[gid] = [];
                groups[gid].push(it);
              });
              return Object.entries(groups).map(([gid, gitems]) => {
                const isOpen = expandedOfferGroups.has(gid);
                const groupTotal = gitems.reduce((s, it) => {
                  const u = it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: isBuiltin });
                  return s + u * it.qty;
                }, 0);
                return (
                  <div key={gid} style={{ marginBottom: 6, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                    <div
                      onClick={() => setExpandedOfferGroups(prev => {
                        const next = new Set(prev);
                        isOpen ? next.delete(gid) : next.add(gid);
                        return next;
                      })}
                      style={{ padding: "9px 14px", background: "#f8fafc", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#102a47", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
                      <span>
                        <span style={{ fontSize: 11, color: "#64748b", marginRight: 8 }}>{isOpen ? "▼" : "▶"}</span>
                        ID_INTERVENTO: <span style={{ color: "#1a73e8" }}>{gid}</span>
                        <span style={{ fontWeight: 400, color: "#64748b", fontSize: 11, marginLeft: 8 }}>{gitems.length} voc{gitems.length === 1 ? "e" : "i"}</span>
                      </span>
                      <span style={{ color: "#0f172a" }}>{euro.format(groupTotal)}</span>
                    </div>
                    {isOpen && (
                      <div style={{ overflowX: "auto", maxWidth: "100%", minWidth: 0 }}>
                        <table style={{ ...styles.table, margin: 0, borderRadius: 0, border: "none" }}>
                          <thead>
                            <tr style={{ ...styles.thead, background: "#f1f5f9" }}>
                              <th style={{ padding: "10px 12px", fontSize: 12 }}>ID Catalogo / componente</th>
                              <th style={{ padding: "10px 12px", fontSize: 12 }}>Tipo</th>
                              <th style={{ padding: "10px 12px", fontSize: 12 }}>Complessità</th>
                              <th style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>Q.tà</th>
                              <th style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>Prezzo unitario</th>
                              <th style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>Totale</th>
                              <th style={{ padding: "10px 12px", fontSize: 12 }}>Note</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {gitems.map((it, rowIndex) => {
                              const cc = catalog.find((x) => String(x.id) === String(it.id));
                              const unit = it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: isBuiltin });
                              return (
                                <tr key={it.key} style={{ borderTop: "1px solid #e8edf3", background: rowIndex % 2 ? "#f8fafc" : "#fff" }}>
                                  <td style={{ padding: "10px 12px" }}>
                                    <strong>ID {it.id}</strong>
                                    <div style={{ color: "#666", fontSize: 12 }}>{esc(cc?.nome || "Voce manuale")}</div>
                                  </td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <select style={styles.input} value={it.type} onChange={(e) => updateItem(it.key, { type: e.target.value, unit: null })}>
                                      <option>REALIZZAZIONE</option><option>MODIFICA</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <select style={styles.input} value={it.complexity} onChange={(e) => updateItem(it.key, { complexity: e.target.value, unit: null })}>
                                      {validComplexities(cc, it.type).map((v) => <option key={v}>{v}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ padding: "10px 12px" }}><input style={{ ...styles.input, width: 64, textAlign: "right" }} type="number" min="0" value={it.qty} onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) || 0 })} /></td>
                                  <td style={{ padding: "10px 12px" }}><input style={{ ...styles.input, width: 110, textAlign: "right" }} type="number" min="0" step=".01" value={unit} onChange={(e) => updateItem(it.key, { unit: Number(e.target.value) || 0 })} /></td>
                                  <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}><strong>{euro.format(unit * it.qty)}</strong></td>
                                  <td style={{ padding: "10px 12px" }}><textarea style={{ ...styles.textarea, minWidth: 180 }} rows={2} placeholder="Razionali, vincoli o note" value={it.additionalInfo || ""} onChange={(e) => updateItem(it.key, { additionalInfo: e.target.value })} /></td>
                                  <td style={{ padding: "10px 12px" }}><button style={btnStyles.danger} onClick={() => removeItem(it.key)}>×</button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, padding: 20, borderRadius: 12, background: "#102a47", color: "#fff", gap: 16, flexWrap: "wrap" }}>
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
          <InitiativeBanner />
          {/* Banner modifica record esistente */}
          {editingRecordKey && (
            <div style={{ background: "#fff8e1", border: "1px solid #f6c90e", borderRadius: 8, padding: "10px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span><strong>Modalità modifica:</strong> stai aggiornando una valutazione esistente. "Salva valutazione" sovrascriverà il record originale.</span>
              <button onClick={() => setEditingRecordKey(null)} style={{ background: "none", border: "none", color: "#92600a", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Salva come nuovo</button>
            </div>
          )}
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 12px" }}>Revisione offerta</h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 140px),1fr))" }}>
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
            {(() => {
              // Raggruppa per interventionId; le voci senza interventionId vanno in gruppo "—"
              const groups = {};
              items.forEach(it => {
                const gid = it.interventionId || "—";
                if (!groups[gid]) groups[gid] = [];
                groups[gid].push(it);
              });
              return Object.entries(groups).map(([gid, gitems]) => {
                const groupTotal = gitems.reduce((s, it) => {
                  const unit = it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: isBuiltin });
                  return s + unit * it.qty;
                }, 0);
                return (
                  <details key={gid} style={{ marginBottom: 6, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                    <summary style={{ padding: "9px 14px", background: "#f8fafc", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#102a47", display: "flex", justifyContent: "space-between", listStyle: "none" }}>
                      <span>ID_INTERVENTO: <span style={{ color: "#1a73e8" }}>{gid}</span> <span style={{ fontWeight: 400, color: "#64748b", fontSize: 11, marginLeft: 8 }}>{gitems.length} voc{gitems.length === 1 ? "e" : "i"}</span></span>
                      <span style={{ color: "#0f172a" }}>{euro.format(groupTotal)}</span>
                    </summary>
                    <div role="region" aria-label="Dettaglio valori di catalogo" tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%", minWidth: 0, borderRadius: 10, border: "1px solid #e2e8f0" }}><table style={{ ...styles.table, margin: 0, borderRadius: 0, border: "none" }}>
                      <thead>
                        <tr style={{ ...styles.thead, background: "#f1f5f9" }}>
                          <th style={{ padding: "10px 12px", fontSize: 12 }}>ID</th>
                          <th style={{ padding: "10px 12px", fontSize: 12 }}>Voce</th>
                          <th style={{ padding: "10px 12px", fontSize: 12 }}>Tipo</th>
                          <th style={{ padding: "10px 12px", fontSize: 12 }}>Complessità</th>
                          <th style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>Q.tà</th>
                          <th style={{ padding: "10px 12px", fontSize: 12 }}>Razionale</th>
                          <th style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>Importo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gitems.map((it, rowIndex) => {
                          const cc = catalog.find((x) => String(x.id) === String(it.id));
                          const unit = it.unit ?? defaultPrice(it, { catalog, priceMode, builtin: isBuiltin });
                          return (
                            <tr key={it.key} style={{ borderTop: "1px solid #e8edf3", background: rowIndex % 2 ? "#f8fafc" : "#fff" }}>
                              <td style={{ padding: "10px 12px", fontSize: 12 }}>{it.id}</td>
                              <td style={{ padding: "10px 12px", fontSize: 12 }}>{esc(cc?.nome || "Voce manuale")}</td>
                              <td style={{ padding: "10px 12px", fontSize: 12 }}>{it.type}</td>
                              <td style={{ padding: "10px 12px", fontSize: 12 }}>{it.complexity}</td>
                              <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "center" }}>{it.qty}</td>
                              <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748b", maxWidth: 200 }}>{esc(it.reason || it.additionalInfo || "—")}</td>
                              <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right", fontWeight: 600 }}>{euro.format(unit * it.qty)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table></div>
                  </details>
                );
              });
            })()}
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

      </main>
      {/* SVILUPPO INIZIATIVA */}
      <details style={{ ...styles.card, marginTop: 28, background: "#edf1f6" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#102a47" }}>Sviluppo iniziativa</summary>
        <h3 style={{ margin: 0 }}>Richiesta di modifica codice</h3>
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
        </div>
        <label style={styles.label}>
          Note di approvazione
          <textarea style={styles.textarea} rows={2} value={implementationApprovalNotes} onChange={(e) => setImplementationApprovalNotes(e.target.value)} placeholder="Criteri di autorizzazione, vincoli, razionale…" />
        </label>
        <label style={styles.label}>
          Compilazione e test
          <textarea style={styles.textarea} rows={2} value={implementationTests} onChange={(e) => setImplementationTests(e.target.value)} placeholder="Comandi di build/test da eseguire (es. npm run build, dotnet test)…" />
        </label>
        {implementationFiles.length > 0 ? (
          <p style={styles.hint}>
            {implementationFiles.filter((f) => sourceFileAllowed(f.name) && !ignoredSourcePath(f.webkitRelativePath || f.name)).length} file sorgente presi in considerazione · quelli ignorati (node_modules, dist, build, vendor, bin/obj, minificati, lock) non vengono elencati.
          </p>
        ) : techProfile ? (
          <p style={styles.hint}>
            Repository: <strong>{techProfile.name || initiative.system}</strong> — profilo tecnico caricato dall'applicativo selezionato ({techProfile.totalFiles || 0} file totali, {techProfile.readFiles || 0} analizzati).
          </p>
        ) : (
          <p style={{ ...styles.hint, color: "#b00020" }}>
            Nessun applicativo selezionato — torna al passo 1 e seleziona un applicativo da "Applicativi e tecnologie".
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button style={btnStyles.primary} onClick={generateCodeChangeRequest} disabled={devBusy}>
            {devBusy ? "Genero il pacchetto…" : "Genera ZIP richiesta modifica codice"}
          </button>
          <button style={btnStyles.secondary} onClick={exportImplementation}>Esporta piano di sviluppo (MD)</button>
        </div>
      </details>

      {toastMsg && (
        <div role="status" aria-live="polite" style={styles.toast}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}

const styles = {
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "1.3px", textTransform: "uppercase", color: "#64748b", marginBottom: 10 },
  badge: { display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 6, background: "#eef2f6", color: "#475569", fontSize: 11, fontWeight: 600 },
  card: { background: "#fff", border: "1px solid #dce5ef", borderRadius: 12, padding: "clamp(16px, 2vw, 24px)", marginBottom: 20, minWidth: 0, boxSizing: "border-box", boxShadow: "0 1px 3px rgba(16,42,71,0.04)" },
  input: { padding: "10px 12px", minHeight: 42, minWidth: 0, maxWidth: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid #cbd5e1", background: "#fff", color: "#172b4d", fontSize: 14, fontFamily: "inherit", marginTop: 5 },
  inputFile: { marginBottom: 8, maxWidth: "100%" },
  textarea: { width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 14, marginTop: 5, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", color: "#172b4d", background: "#fff" },
  label: { display: "flex", flexDirection: "column", minWidth: 0, fontSize: 13, fontWeight: 500, color: "#40536d", gap: 4 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 20 },
  hint: { color: "#52657d", fontSize: 13, lineHeight: 1.6, marginTop: 6 },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 14 },
  suggestion: { border: "1px solid #dce5ef", borderRadius: 12, padding: 16, minWidth: 0, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap", background: "#fafcff" },
  step: { flex: "1 1 145px", textAlign: "left", padding: "12px", borderRadius: 8, border: "1px solid transparent", background: "#fff", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  stepActive: { flex: "1 1 145px", textAlign: "left", padding: "12px", borderRadius: 8, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#102a47", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  lotBtn: { padding: "10px 14px", borderRadius: 9, border: "1px solid #cbd5e1", background: "#fff", color: "#52657d", fontSize: 14, cursor: "pointer" },
  lotBtnActive: { padding: "10px 14px", borderRadius: 9, border: "1px solid #174ea6", background: "#eaf2ff", color: "#174ea6", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  table: { width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 14, lineHeight: 1.5, fontVariantNumeric: "tabular-nums" },
  thead: { background: "#edf2f8", color: "#40536d", textAlign: "left", fontSize: 12 },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", width: "max-content", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", background: "#17385e", color: "#fff", padding: "14px 20px", borderRadius: 12, fontSize: 14, boxShadow: "0 6px 24px rgba(0,0,0,.2)", zIndex: 1000 },
};

const btnStyles = {
  primary: { minHeight: 38, padding: "10px 16px", borderRadius: 9, border: "1px solid #174ea6", background: "#1a73e8", color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "inherit", cursor: "pointer" },
  secondary: { minHeight: 38, padding: "10px 16px", borderRadius: 9, border: "1px solid #cbd5e1", background: "#fff", color: "#29415e", fontWeight: 500, fontSize: 13, fontFamily: "inherit", cursor: "pointer" },
  danger: { minHeight: 38, padding: "10px 12px", borderRadius: 9, border: "1px solid #f1b9c0", background: "#fff1f2", color: "#a81832", fontSize: 13, fontFamily: "inherit", cursor: "pointer" },
};

