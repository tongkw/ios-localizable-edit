"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StringUnit = {
  state?: string;
  value?: string;
};

type LocalizationEntry = {
  stringUnit?: StringUnit;
  [key: string]: unknown;
};

type XcStringEntry = {
  localizations?: Record<string, LocalizationEntry>;
  extractionState?: string;
  comment?: string;
  [key: string]: unknown;
};

type XcStrings = {
  sourceLanguage?: string;
  strings: Record<string, XcStringEntry>;
  [key: string]: unknown;
};

const DEFAULT_JSON = `{
  "sourceLanguage": "en",
  "strings": {}
}`;

const LOCAL_STORAGE_KEY = "xcstrings-code";

function getAllLanguages(data: XcStrings): string[] {
  const languages = new Set<string>();
  for (const key of Object.keys(data.strings || {})) {
    const localizations = data.strings[key]?.localizations || {};
    for (const lang of Object.keys(localizations)) {
      languages.add(lang);
    }
  }
  return Array.from(languages).sort();
}

function ensureLanguagePresent(data: XcStrings, language: string) {
  for (const key of Object.keys(data.strings || {})) {
    const entry = (data.strings[key] = data.strings[key] || {});
    const localizations = (entry.localizations = entry.localizations || {});
    if (!localizations[language]) {
      localizations[language] = {
        stringUnit: { state: "needsLocalization", value: "" },
      };
    } else if (!localizations[language].stringUnit) {
      localizations[language].stringUnit = {
        state: "needsLocalization",
        value: "",
      };
    }
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export default function Home() {
  const [codeText, setCodeText] = useState<string>(DEFAULT_JSON);
  const [data, setData] = useState<XcStrings | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [isCodeExpanded, setIsCodeExpanded] = useState<boolean>(false);
  const [page, setPage] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(50);
  const [keyFilter, setKeyFilter] = useState<string>("");
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());

  const debounceCodeToDataTimer = useRef<number | null>(null);
  const debounceDataToCodeTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const hasLoadedFromStorageRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const languages = useMemo(() => {
    if (!data) return [] as string[];
    const langs = getAllLanguages(data);
    if (!langs.includes("pl")) {
      return [...langs, "pl"];
    }
    return langs;
  }, [data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let initialText = codeText;
    try {
      const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        initialText = saved;
        setCodeText(saved);
      }
    } catch {
      // ignore storage errors
    }
    try {
      const initial = JSON.parse(initialText) as XcStrings;
      if (!initial.strings || typeof initial.strings !== "object") {
        setParseError("Missing or invalid 'strings' property");
        setData(null);
      } else {
        const cloned = deepClone(initial);
        ensureLanguagePresent(cloned, "pl");
        setData(cloned);
        setParseError(null);
      }
    } catch (e: any) {
      setParseError(e?.message || "Invalid JSON");
      setData(null);
    }
    hasLoadedFromStorageRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLoadedFromStorageRef.current) return;
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, codeText);
    } catch {
      // ignore storage errors
    }
  }, [codeText]);

  function triggerFlash() {
    setIsFlashing(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setIsFlashing(false);
    }, 800);
  }

  function scheduleCodeToDataParse(nextCode: string) {
    if (debounceCodeToDataTimer.current)
      window.clearTimeout(debounceCodeToDataTimer.current);
    debounceCodeToDataTimer.current = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(nextCode) as XcStrings;
        if (
          !parsed ||
          typeof parsed !== "object" ||
          typeof parsed.strings !== "object"
        ) {
          throw new Error("Missing or invalid 'strings' property");
        }
        const cloned = deepClone(parsed);
        ensureLanguagePresent(cloned, "pl");
        setData(cloned);
        setPage(0);
        setParseError(null);
        triggerFlash();
      } catch (e: any) {
        setParseError(e?.message || "Invalid JSON");
        setData(null);
      }
    }, 500);
  }

  function scheduleDataToCodeSerialize(nextData: XcStrings) {
    if (debounceDataToCodeTimer.current)
      window.clearTimeout(debounceDataToCodeTimer.current);
    debounceDataToCodeTimer.current = window.setTimeout(() => {
      const serialized = JSON.stringify(nextData, null, 2);
      setCodeText(serialized);
      triggerFlash();
    }, 500);
  }

  function handleCellChange(keyName: string, lang: string, value: string) {
    if (!data) return;
    const nextData = deepClone(data);
    const entry = (nextData.strings[keyName] = nextData.strings[keyName] || {});
    const localizations = (entry.localizations = entry.localizations || {});
    const loc = (localizations[lang] = localizations[lang] || {
      stringUnit: { state: "needsLocalization", value: "" },
    });
    loc.stringUnit = loc.stringUnit || {
      state: "needsLocalization",
      value: "",
    };
    loc.stringUnit.value = value;
    if (!loc.stringUnit.state || loc.stringUnit.state === "needsLocalization") {
      loc.stringUnit.state = value ? "translated" : "needsLocalization";
    }
    ensureLanguagePresent(nextData, "pl");
    setData(nextData);
    scheduleDataToCodeSerialize(nextData);
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setCodeText(next);
    scheduleCodeToDataParse(next);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as XcStrings;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.strings !== "object"
      ) {
        throw new Error("Missing or invalid 'strings' property");
      }
      const cloned = deepClone(parsed);
      ensureLanguagePresent(cloned, "pl");
      setData(cloned);
      setCodeText(JSON.stringify(cloned, null, 2));
      setPage(0);
      setParseError(null);
      triggerFlash();
    } catch (err: any) {
      setParseError(err?.message || "Invalid JSON");
    } finally {
      // allow re-selecting the same file
      if (e.target) e.target.value = "";
    }
  }

  function handleDownload() {
    try {
      let exportData: XcStrings | null = null;
      if (data) {
        exportData = deepClone(data);
      } else {
        const parsed = JSON.parse(codeText) as XcStrings;
        if (
          !parsed ||
          typeof parsed !== "object" ||
          typeof parsed.strings !== "object"
        ) {
          throw new Error("Missing or invalid 'strings' property");
        }
        const cloned = deepClone(parsed);
        ensureLanguagePresent(cloned, "pl");
        exportData = cloned;
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Localizable.xcstrings";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Cannot export: fix JSON errors first.");
    }
  }

  const keys = useMemo(() => {
    if (!data) return [] as string[];
    // Preserve insertion order strictly
    return Object.keys(data.strings || {});
  }, [data]);

  const filteredKeys = useMemo(() => {
    const q = keyFilter.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => k.toLowerCase().includes(q));
  }, [keys, keyFilter]);

  // Initialize language selection once languages are known
  useEffect(() => {
    if (languages.length > 0 && selectedLangs.size === 0) {
      setSelectedLangs(new Set(languages));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages]);

  const shownLanguages = useMemo(() => {
    if (selectedLangs.size === 0) return [] as string[];
    return languages.filter((l) => selectedLangs.has(l));
  }, [languages, selectedLangs]);

  const totalKeys = filteredKeys.length;
  const totalPages = Math.max(1, Math.ceil(totalKeys / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedKeys = useMemo(() => {
    const start = currentPage * pageSize;
    const end = start + pageSize;
    return filteredKeys.slice(start, end);
  }, [filteredKeys, currentPage, pageSize]);

  const coverage = useMemo(() => {
    if (!data)
      return {} as Record<string, { done: number; total: number; pct: number }>;
    const totals: Record<string, { done: number; total: number; pct: number }> =
      {};
    for (const lang of languages) {
      totals[lang] = { done: 0, total: totalKeys, pct: 0 };
    }
    for (const keyName of filteredKeys) {
      for (const lang of languages) {
        const val =
          data.strings?.[keyName]?.localizations?.[lang]?.stringUnit?.value ??
          "";
        if (val && String(val).length > 0) {
          totals[lang].done += 1;
        }
      }
    }
    for (const lang of languages) {
      const t = totals[lang];
      t.pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
    }
    return totals;
  }, [data, languages, filteredKeys, totalKeys]);

  return (
    <div
      className={`min-h-screen p-4 sm:p-6 ${
        isFlashing ? "flash-highlight" : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-xl font-semibold">
          iOS .xcstrings Editor
        </h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xcstrings,application/json"
            className="hidden"
            onChange={handleImportChange}
          />
          <button
            className="text-sm rounded border border-black/[.08] dark:border-white/[.145] px-3 py-1 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a]"
            onClick={handleImportClick}
            title="Import .xcstrings JSON"
          >
            Import
          </button>
          <button
            className="text-sm rounded border border-black/[.08] dark:border-white/[.145] px-3 py-1 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a]"
            onClick={() => setIsCodeExpanded((v) => !v)}
          >
            {isCodeExpanded ? "Show Table" : "Expand Code"}
          </button>
          <button
            className="text-sm rounded border border-black/[.08] dark:border-white/[.145] px-3 py-1 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] disabled:opacity-50"
            onClick={handleDownload}
            disabled={!!parseError}
            title="Download as Localizable.xcstrings"
          >
            Download
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4 items-start">
        {!isCodeExpanded && (
          <section className="rounded border border-black/[.08] dark:border-white/[.145] overflow-hidden">
            <header className="px-3 py-2 border-b border-black/[.08] dark:border-white/[.145]">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Translations</div>
                {parseError && (
                  <div className="text-red-600 text-xs">{parseError}</div>
                )}
              </div>
              {!parseError && data && languages.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="opacity-70">Show languages:</span>
                    {languages.map((lang) => (
                      <label
                        key={lang}
                        className="inline-flex items-center gap-1"
                      >
                        <input
                          type="checkbox"
                          className="accent-black dark:accent-white"
                          checked={selectedLangs.has(lang)}
                          onChange={(e) => {
                            setSelectedLangs((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(lang);
                              else next.delete(lang);
                              return next;
                            });
                          }}
                        />
                        <span>{lang}</span>
                      </label>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <label className="opacity-70">Filter keys</label>
                    <input
                      type="text"
                      value={keyFilter}
                      onChange={(e) => {
                        setKeyFilter(e.target.value);
                        setPage(0);
                      }}
                      placeholder="substring..."
                      className="rounded border border-black/[.08] dark:border-white/[.145] px-2 py-1 bg-transparent text-xs"
                    />
                  </div>
                </div>
              )}
              {!parseError && data && totalKeys > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {languages.map((lang) => (
                    <div
                      key={lang}
                      className="rounded border border-black/[.08] dark:border-white/[.145] px-2 py-1"
                    >
                      <span className="font-medium mr-1">{lang}:</span>
                      <span>{coverage[lang]?.pct ?? 0}%</span>
                      <span className="opacity-60">
                        {" "}
                        ({coverage[lang]?.done ?? 0}/
                        {coverage[lang]?.total ?? 0})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </header>
            <div className="max-h-[70vh] overflow-auto">
              {parseError || !data ? (
                <div className="p-4 text-sm text-red-600">
                  Fix errors in the code panel to view the table.
                </div>
              ) : (
                <div className="divide-y-2 divide-black/[.12] dark:divide-white/[.18]">
                  {paginatedKeys.length === 0 && (
                    <div className="p-4 text-center text-xs text-black/60 dark:text-white/60">
                      No keys yet. Paste your .xcstrings JSON in the code panel.
                    </div>
                  )}
                  {paginatedKeys.map((keyName) => (
                    <div key={keyName} className="p-4">
                      <div className="mb-3 font-mono text-sm sm:text-base break-words">
                        {keyName || (
                          <span className="opacity-60">(empty key)</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {shownLanguages.map((lang) => {
                          const value =
                            data?.strings?.[keyName]?.localizations?.[lang]
                              ?.stringUnit?.value ?? "";
                          return (
                            <div key={lang}>
                              <label className="block text-[11px] opacity-70 mb-1">
                                {lang}
                              </label>
                              <textarea
                                className="w-full min-h-[64px] text-sm rounded border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-2 focus:outline-none focus:ring-1 focus:ring-black/30 dark:focus:ring-white/30 resize-y"
                                value={value}
                                onChange={(e) =>
                                  handleCellChange(
                                    keyName,
                                    lang,
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!parseError && data && totalKeys > pageSize && (
              <footer className="px-3 py-2 border-t border-black/[.08] dark:border-white/[.145] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border border-black/[.08] dark:border-white/[.145] px-2 py-1 disabled:opacity-50"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    Prev
                  </button>
                  <button
                    className="rounded border border-black/[.08] dark:border-white/[.145] px-2 py-1 disabled:opacity-50"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={currentPage >= totalPages - 1}
                  >
                    Next
                  </button>
                  <span className="ml-2">
                    Page {currentPage + 1} / {totalPages}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="opacity-70">Page size</label>
                  <select
                    className="rounded border border-black/[.08] dark:border-white/[.145] px-2 py-1 bg-transparent"
                    value={pageSize}
                    onChange={(e) => {
                      const val = Number(e.target.value || 50);
                      setPageSize(val);
                      setPage(0);
                    }}
                  >
                    {[25, 50, 100, 200].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </footer>
            )}
          </section>
        )}

        <section
          className={`rounded border border-black/[.08] dark:border-white/[.145] overflow-hidden ${
            isCodeExpanded ? "md:col-span-2" : ""
          }`}
        >
          <header className="px-3 py-2 border-b border-black/[.08] dark:border-white/[.145] flex items-center justify-between">
            <div className="font-medium">.xcstrings JSON</div>
            <div className="text-xs opacity-70">Debounced 0.5s</div>
          </header>
          <div className="max-w-[640px] md:max-w-[420px]">
            <textarea
              className="w-full h-[70vh] p-3 font-mono text-xs bg-transparent outline-none resize-y"
              spellCheck={false}
              value={codeText}
              onChange={handleCodeChange}
              placeholder="Paste your entire .xcstrings JSON here"
              aria-label="xcstrings json editor"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
