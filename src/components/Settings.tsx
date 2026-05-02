import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// ── Service definitions ────────────────────────────────────────────────────────

const SOCIAL_SERVICES = [
  { id: "twitter",   name: "Twitter / X",  icon: "𝕏",  placeholder: "Bearer token or API key" },
  { id: "linkedin",  name: "LinkedIn",      icon: "in", placeholder: "Access token" },
  { id: "instagram", name: "Instagram",     icon: "IG", placeholder: "Access token" },
  { id: "facebook",  name: "Facebook",      icon: "f",  placeholder: "Page access token" },
  { id: "tiktok",    name: "TikTok",        icon: "♪",  placeholder: "Access token" },
  { id: "youtube",   name: "YouTube",       icon: "▶",  placeholder: "API key or OAuth token" },
];

const CLOUD_LLM_SERVICES = [
  { id: "openai",    name: "OpenAI",        model: "GPT-4o",         placeholder: "sk-..." },
  { id: "anthropic", name: "Anthropic",     model: "Claude Sonnet",  placeholder: "sk-ant-..." },
  { id: "gemini",    name: "Google Gemini", model: "Gemini 1.5 Pro", placeholder: "AIza..." },
  { id: "mistral",   name: "Mistral",       model: "Mistral Large",  placeholder: "..." },
  { id: "groq",      name: "Groq",          model: "Llama 3.1",      placeholder: "gsk_..." },
];

const LOCAL_LLM_SERVICES = [
  {
    id: "ollama",
    name: "Ollama",
    description: "Run open models locally",
    defaultUrl: "http://localhost:11434",
    modelsEndpoint: "/api/tags",
    extractModels: (data: OllamaTagsResponse) => data.models?.map((m) => m.name) ?? [],
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    description: "OpenAI-compatible local server",
    defaultUrl: "http://localhost:1234/v1",
    modelsEndpoint: "/models",
    extractModels: (data: OpenAIModelsResponse) => data.data?.map((m) => m.id) ?? [],
  },
  {
    id: "jan",
    name: "Jan",
    description: "Open-source local AI assistant",
    defaultUrl: "http://localhost:1337/v1",
    modelsEndpoint: "/models",
    extractModels: (data: OpenAIModelsResponse) => data.data?.map((m) => m.id) ?? [],
  },
  {
    id: "llamacpp",
    name: "llama.cpp",
    description: "Lightweight local inference server",
    defaultUrl: "http://localhost:8080/v1",
    modelsEndpoint: "/models",
    extractModels: (data: OpenAIModelsResponse) => data.data?.map((m) => m.id) ?? [],
  },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface OllamaTagsResponse { models?: { name: string }[] }
interface OpenAIModelsResponse { data?: { id: string }[] }

interface LocalLlmConfig { baseUrl: string; model: string }

interface ApiKeyModal { serviceId: string; name: string; placeholder: string }
interface LocalModal {
  serviceId: string;
  name: string;
  defaultUrl: string;
  modelsEndpoint: string;
  extractModels: (data: any) => string[];
}

// ── Storage helpers ────────────────────────────────────────────────────────────

const ACTIVE_LLM_KEY  = "dosh-active-llm";
const LOCAL_CFG_KEY   = (id: string) => `dosh-local-llm-${id}`;

function loadLocalConfig(id: string): LocalLlmConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_CFG_KEY(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLocalConfig(id: string, cfg: LocalLlmConfig) {
  localStorage.setItem(LOCAL_CFG_KEY(id), JSON.stringify(cfg));
}

function removeLocalConfig(id: string) {
  localStorage.removeItem(LOCAL_CFG_KEY(id));
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Settings() {
  const [connectedKeys, setConnectedKeys]   = useState<Record<string, boolean>>({});
  const [localConfigs, setLocalConfigs]     = useState<Record<string, LocalLlmConfig | null>>({});
  const [loading, setLoading]               = useState(true);
  const [activeLlm, setActiveLlm]           = useState<string>(
    () => localStorage.getItem(ACTIVE_LLM_KEY) ?? "openai"
  );

  // Cloud API key modal
  const [apiKeyModal, setApiKeyModal]   = useState<ApiKeyModal | null>(null);
  const [secret, setSecret]             = useState("");

  // Local LLM config modal
  const [localModal, setLocalModal]     = useState<LocalModal | null>(null);
  const [localUrl, setLocalUrl]         = useState("");
  const [localModel, setLocalModel]     = useState("");
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [detecting, setDetecting]       = useState(false);
  const [detectError, setDetectError]   = useState("");

  useEffect(() => {
    checkAllCloudKeys();
    const configs: Record<string, LocalLlmConfig | null> = {};
    for (const svc of LOCAL_LLM_SERVICES) configs[svc.id] = loadLocalConfig(svc.id);
    setLocalConfigs(configs);
  }, []);

  const checkAllCloudKeys = async () => {
    const status: Record<string, boolean> = {};
    const all = [...SOCIAL_SERVICES, ...CLOUD_LLM_SERVICES];
    for (const svc of all) {
      try {
        await invoke("secure_get_key", { service: svc.id, account: "api_key" });
        status[svc.id] = true;
      } catch {
        status[svc.id] = false;
      }
    }
    setConnectedKeys(status);
    setLoading(false);
  };

  // ── Cloud API key handlers ─────────────────────────────────────────────────

  const handleSaveApiKey = async () => {
    if (!apiKeyModal) return;
    try {
      await invoke("secure_store_key", {
        service: apiKeyModal.serviceId,
        account: "api_key",
        secret,
      });
      setApiKeyModal(null);
      setSecret("");
      await checkAllCloudKeys();
    } catch (e) {
      alert(`Error saving key: ${e}`);
    }
  };

  const handleRemoveApiKey = async (serviceId: string, name: string) => {
    if (!confirm(`Remove credentials for ${name}?`)) return;
    try {
      await invoke("secure_delete_key", { service: serviceId, account: "api_key" });
      if (activeLlm === serviceId) handleSelectLlm("");
      await checkAllCloudKeys();
    } catch (e) {
      alert(`Error removing key: ${e}`);
    }
  };

  // ── Local LLM handlers ─────────────────────────────────────────────────────

  const openLocalModal = (svc: typeof LOCAL_LLM_SERVICES[number]) => {
    const existing = localConfigs[svc.id];
    setLocalUrl(existing?.baseUrl ?? svc.defaultUrl);
    setLocalModel(existing?.model ?? "");
    setDetectedModels([]);
    setDetectError("");
    setLocalModal(svc);
  };

  const handleDetectModels = async () => {
    if (!localModal) return;
    setDetecting(true);
    setDetectError("");
    setDetectedModels([]);
    try {
      const res = await fetch(`${localUrl.replace(/\/$/, "")}${localModal.modelsEndpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = localModal.extractModels(data);
      if (models.length === 0) throw new Error("No models found");
      setDetectedModels(models);
      if (!localModel) setLocalModel(models[0]);
    } catch (e: any) {
      setDetectError(e.message ?? "Could not reach server");
    } finally {
      setDetecting(false);
    }
  };

  const handleSaveLocalConfig = () => {
    if (!localModal || !localUrl.trim() || !localModel.trim()) return;
    const cfg: LocalLlmConfig = { baseUrl: localUrl.trim(), model: localModel.trim() };
    saveLocalConfig(localModal.serviceId, cfg);
    setLocalConfigs((prev) => ({ ...prev, [localModal.serviceId]: cfg }));
    setLocalModal(null);
  };

  const handleRemoveLocalConfig = (id: string, name: string) => {
    if (!confirm(`Remove configuration for ${name}?`)) return;
    removeLocalConfig(id);
    setLocalConfigs((prev) => ({ ...prev, [id]: null }));
    if (activeLlm === id) handleSelectLlm("");
  };

  // ── Active model ───────────────────────────────────────────────────────────

  const handleSelectLlm = (id: string) => {
    setActiveLlm(id);
    localStorage.setItem(ACTIVE_LLM_KEY, id);
  };

  const isLlmReady = (id: string) => {
    const isCloud = CLOUD_LLM_SERVICES.some((s) => s.id === id);
    return isCloud ? !!connectedKeys[id] : !!localConfigs[id];
  };

  if (loading) return <div className="p-8 text-neutral-400">Loading settings…</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-10">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Settings</h1>

      {/* ── Social Media ──────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Social Media Accounts</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Connect your accounts to publish and schedule posts.
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 overflow-hidden">
          {SOCIAL_SERVICES.map((svc) => (
            <div key={svc.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-900">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-sm font-bold text-neutral-700 dark:text-neutral-300 shrink-0">
                  {svc.icon}
                </span>
                <div>
                  <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{svc.name}</div>
                  {connectedKeys[svc.id] && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400">Connected</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {connectedKeys[svc.id] ? (
                  <>
                    <button
                      onClick={() => { setApiKeyModal({ serviceId: svc.id, name: svc.name, placeholder: svc.placeholder }); setSecret(""); }}
                      className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >Update</button>
                    <button
                      onClick={() => handleRemoveApiKey(svc.id, svc.name)}
                      className="text-xs px-3 py-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    >Disconnect</button>
                  </>
                ) : (
                  <button
                    onClick={() => { setApiKeyModal({ serviceId: svc.id, name: svc.name, placeholder: svc.placeholder }); setSecret(""); }}
                    className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                  >Connect</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI Model ──────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">AI Model</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Choose which model Dosh uses for writing assistance. Select the radio button to set the active model.
          </p>
        </div>

        {/* Cloud providers */}
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-600 mb-2 px-1">
          Cloud
        </p>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 overflow-hidden mb-4">
          {CLOUD_LLM_SERVICES.map((svc) => {
            const isActive    = activeLlm === svc.id;
            const isConnected = connectedKeys[svc.id];
            return (
              <div
                key={svc.id}
                className={`flex items-center justify-between px-4 py-3 transition-colors
                  ${isActive ? "bg-indigo-50 dark:bg-indigo-950/40" : "bg-white dark:bg-neutral-900"}`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => isConnected && handleSelectLlm(svc.id)}
                    title={isConnected ? "Set as active model" : "Add an API key first"}
                    className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors
                      ${isActive && isConnected
                        ? "border-indigo-600 bg-indigo-600"
                        : isConnected
                          ? "border-neutral-400 dark:border-neutral-600 hover:border-indigo-500"
                          : "border-neutral-300 dark:border-neutral-700 cursor-not-allowed opacity-40"}`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{svc.name}</span>
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">{svc.model}</span>
                    </div>
                    <div className="text-xs mt-0.5">
                      {isConnected
                        ? <span className="text-emerald-600 dark:text-emerald-400">API key saved{isActive ? " · Active" : ""}</span>
                        : <span className="text-neutral-400 dark:text-neutral-600">No API key</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <button
                        onClick={() => { setApiKeyModal({ serviceId: svc.id, name: svc.name, placeholder: svc.placeholder }); setSecret(""); }}
                        className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                      >Update key</button>
                      <button
                        onClick={() => handleRemoveApiKey(svc.id, svc.name)}
                        className="text-xs px-3 py-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                      >Remove</button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setApiKeyModal({ serviceId: svc.id, name: svc.name, placeholder: svc.placeholder }); setSecret(""); }}
                      className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                    >Add API key</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Local providers */}
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-600 mb-2 px-1">
          Local
        </p>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 overflow-hidden">
          {LOCAL_LLM_SERVICES.map((svc) => {
            const cfg      = localConfigs[svc.id];
            const isActive = activeLlm === svc.id;
            return (
              <div
                key={svc.id}
                className={`flex items-center justify-between px-4 py-3 transition-colors
                  ${isActive ? "bg-indigo-50 dark:bg-indigo-950/40" : "bg-white dark:bg-neutral-900"}`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => cfg && handleSelectLlm(svc.id)}
                    title={cfg ? "Set as active model" : "Configure first"}
                    className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors
                      ${isActive && cfg
                        ? "border-indigo-600 bg-indigo-600"
                        : cfg
                          ? "border-neutral-400 dark:border-neutral-600 hover:border-indigo-500"
                          : "border-neutral-300 dark:border-neutral-700 cursor-not-allowed opacity-40"}`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{svc.name}</span>
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">{svc.description}</span>
                    </div>
                    <div className="text-xs mt-0.5">
                      {cfg ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                          {cfg.model}{isActive ? " · Active" : ""}
                        </span>
                      ) : (
                        <span className="text-neutral-400 dark:text-neutral-600">Not configured</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cfg ? (
                    <>
                      <button
                        onClick={() => openLocalModal(svc)}
                        className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                      >Configure</button>
                      <button
                        onClick={() => handleRemoveLocalConfig(svc.id, svc.name)}
                        className="text-xs px-3 py-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                      >Remove</button>
                    </>
                  ) : (
                    <button
                      onClick={() => openLocalModal(svc)}
                      className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                    >Configure</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Cloud API key modal ───────────────────────────────────────────────── */}
      {apiKeyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold mb-1 text-neutral-900 dark:text-neutral-100">
              Connect {apiKeyModal.name}
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              Your key is stored securely in your system keychain and never leaves this device.
            </p>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
              placeholder={apiKeyModal.placeholder}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setApiKeyModal(null); setSecret(""); }}
                className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
              >Cancel</button>
              <button
                onClick={handleSaveApiKey}
                disabled={!secret.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Local LLM config modal ────────────────────────────────────────────── */}
      {localModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold mb-1 text-neutral-900 dark:text-neutral-100">
              Configure {localModal.name}
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
              Make sure {localModal.name} is running locally before saving.
            </p>

            {/* Base URL */}
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              Server URL
            </label>
            <input
              type="text"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder={localModal.defaultUrl}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2.5 text-sm font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />

            {/* Model */}
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              Model
            </label>
            <div className="flex gap-2 mb-1">
              {detectedModels.length > 0 ? (
                <select
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {detectedModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  placeholder="e.g. llama3.2, mistral, qwen2.5"
                  className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
              <button
                onClick={handleDetectModels}
                disabled={detecting || !localUrl.trim()}
                className="px-3 py-2.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {detecting ? "Detecting…" : "Detect models"}
              </button>
            </div>
            {detectedModels.length > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
                {detectedModels.length} model{detectedModels.length !== 1 ? "s" : ""} found
              </p>
            )}
            {detectError && (
              <p className="text-xs text-red-500 mb-3">{detectError} — is {localModal.name} running?</p>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setLocalModal(null)}
                className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
              >Cancel</button>
              <button
                onClick={handleSaveLocalConfig}
                disabled={!localUrl.trim() || !localModel.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
