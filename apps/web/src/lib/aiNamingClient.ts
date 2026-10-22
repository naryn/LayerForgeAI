import { buildAiNamingPrompt, type AiNamingTask } from "./aiNaming";

export const AI_NAMING_MODEL_STORAGE_KEY = "layerforge.ai-naming.model";
export const AI_NAMING_API_KEY_STORAGE_KEY = "layerforge.ai-naming.api-key";
export const AI_NAMING_DEFAULT_TIMEOUT_MS = 120_000;
export const AI_NAMING_MIN_TIMEOUT_MS = 10_000;
export const AI_NAMING_MAX_TIMEOUT_MS = 300_000;

const SYSTEM_PROMPT =
  "你是 PSD 图层命名与合并复核助手。严格遵守用户给出的候选列表、路径、命名与合并规则，只输出一个合法 JSON 对象，不要输出 Markdown 围栏或解释文字。";

export interface AiNamingModelConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  rememberKey: boolean;
  jsonMode: boolean;
  timeoutMs: number;
}

export interface AiNamingModelPreset {
  id: "deepseek" | "openai" | "ollama" | "lmstudio";
  label: string;
  baseUrl: string;
  model: string;
  note: string;
}

export const AI_NAMING_MODEL_PRESETS: readonly AiNamingModelPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    note: "云端，需要 API Key",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    note: "云端，需要 API Key",
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:7b",
    note: "本地，无需 Key",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    note: "本地，无需 Key",
  },
];

export const DEFAULT_AI_NAMING_MODEL_CONFIG: AiNamingModelConfig = {
  baseUrl: "",
  model: "",
  apiKey: "",
  rememberKey: false,
  jsonMode: true,
  timeoutMs: AI_NAMING_DEFAULT_TIMEOUT_MS,
};

export interface AiNamingUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiNamingModelResult {
  text: string;
  model: string | null;
  usage: AiNamingUsage | null;
  durationMs: number;
}

export interface RequestAiNamingOptions {
  task: AiNamingTask;
  config: AiNamingModelConfig;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface ChatCompletionMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature: number;
  stream: false;
  response_format?: { type: "json_object" };
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function clampTimeout(value: number): number {
  if (!Number.isFinite(value)) return AI_NAMING_DEFAULT_TIMEOUT_MS;
  return Math.min(
    AI_NAMING_MAX_TIMEOUT_MS,
    Math.max(AI_NAMING_MIN_TIMEOUT_MS, Math.round(value)),
  );
}

export function normalizeAiNamingModelConfig(
  config: AiNamingModelConfig,
): AiNamingModelConfig {
  return {
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
    model: config.model.trim(),
    apiKey: config.apiKey.trim(),
    rememberKey: config.rememberKey === true,
    jsonMode: config.jsonMode !== false,
    timeoutMs: clampTimeout(config.timeoutMs),
  };
}

export function validateAiNamingModelConfig(config: AiNamingModelConfig): string[] {
  const normalized = normalizeAiNamingModelConfig(config);
  const errors: string[] = [];
  if (!normalized.baseUrl) {
    errors.push("请填写模型接口地址");
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(normalized.baseUrl);
    } catch {
      errors.push("模型接口地址不是合法 URL");
    }
    if (parsed) {
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.push("模型接口地址必须使用 http 或 https");
      }
      if (parsed.username || parsed.password) {
        errors.push("模型接口地址不能包含账号或密码");
      }
      if (parsed.search || parsed.hash) {
        errors.push("模型接口地址不能包含查询参数或片段");
      }
    }
  }
  if (!normalized.model) errors.push("请填写模型名称");
  return errors;
}

export function isAiNamingModelConfigured(config: AiNamingModelConfig): boolean {
  return validateAiNamingModelConfig(config).length === 0;
}

export function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v\d+[a-z0-9]*$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export function loadAiNamingModelConfig(
  storage?: KeyValueStorage | null,
): AiNamingModelConfig {
  const target = storage === undefined ? defaultStorage() : storage;
  if (!target) return { ...DEFAULT_AI_NAMING_MODEL_CONFIG };
  try {
    const raw = target.getItem(AI_NAMING_MODEL_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_NAMING_MODEL_CONFIG };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_AI_NAMING_MODEL_CONFIG };
    const rememberKey = parsed.rememberKey === true;
    return normalizeAiNamingModelConfig({
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      apiKey: rememberKey ? (target.getItem(AI_NAMING_API_KEY_STORAGE_KEY) ?? "") : "",
      rememberKey,
      jsonMode: parsed.jsonMode !== false,
      timeoutMs:
        typeof parsed.timeoutMs === "number"
          ? parsed.timeoutMs
          : AI_NAMING_DEFAULT_TIMEOUT_MS,
    });
  } catch {
    return { ...DEFAULT_AI_NAMING_MODEL_CONFIG };
  }
}

export function saveAiNamingModelConfig(
  config: AiNamingModelConfig,
  storage?: KeyValueStorage | null,
): boolean {
  const target = storage === undefined ? defaultStorage() : storage;
  if (!target) return false;
  const normalized = normalizeAiNamingModelConfig(config);
  try {
    target.setItem(
      AI_NAMING_MODEL_STORAGE_KEY,
      JSON.stringify({
        baseUrl: normalized.baseUrl,
        model: normalized.model,
        rememberKey: normalized.rememberKey,
        jsonMode: normalized.jsonMode,
        timeoutMs: normalized.timeoutMs,
      }),
    );
    if (normalized.rememberKey && normalized.apiKey) {
      target.setItem(AI_NAMING_API_KEY_STORAGE_KEY, normalized.apiKey);
    } else {
      target.removeItem(AI_NAMING_API_KEY_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearAiNamingModelConfig(storage?: KeyValueStorage | null): void {
  const target = storage === undefined ? defaultStorage() : storage;
  if (!target) return;
  try {
    target.removeItem(AI_NAMING_MODEL_STORAGE_KEY);
    target.removeItem(AI_NAMING_API_KEY_STORAGE_KEY);
  } catch {
    // Storage can be blocked in private mode; the in-memory config still works.
  }
}

export function buildAiNamingChatRequest(
  task: AiNamingTask,
  config: AiNamingModelConfig,
): ChatCompletionRequest {
  const normalized = normalizeAiNamingModelConfig(config);
  return {
    model: normalized.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildAiNamingPrompt(task, { direct: true }) },
    ],
    temperature: 0.2,
    stream: false,
    ...(normalized.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  };
}

export function extractChatCompletionText(payload: unknown): string {
  if (!isRecord(payload)) throw new Error("模型接口返回的 JSON 不是对象");
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("模型响应缺少 choices");
  }
  const first: unknown = choices[0];
  const message = isRecord(first) && isRecord(first.message) ? first.message : null;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("");
    if (text.trim()) return text;
  }
  throw new Error("模型响应没有文本内容");
}

function extractUsage(value: unknown): AiNamingUsage | null {
  if (!isRecord(value)) return null;
  const usage: AiNamingUsage = {};
  if (typeof value.prompt_tokens === "number") usage.promptTokens = value.prompt_tokens;
  if (typeof value.completion_tokens === "number") {
    usage.completionTokens = value.completion_tokens;
  }
  if (typeof value.total_tokens === "number") usage.totalTokens = value.total_tokens;
  return Object.keys(usage).length > 0 ? usage : null;
}

async function readHttpError(response: Response): Promise<string> {
  let detail = "";
  try {
    const raw = await response.text();
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed)) {
          if (isRecord(parsed.error) && typeof parsed.error.message === "string") {
            detail = parsed.error.message;
          } else if (typeof parsed.message === "string") {
            detail = parsed.message;
          }
        }
      } catch {
        detail = raw;
      }
    }
  } catch {
    // Ignore body read failures; the status code still explains the failure.
  }
  detail = detail.replace(/\s+/g, " ").trim().slice(0, 240);
  const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  return `模型接口返回 ${status}${detail ? `：${detail}` : ""}`;
}

function describeNetworkError(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message || reason.name;
  }
  return String(reason);
}

export async function requestAiNamingCompletion(
  options: RequestAiNamingOptions,
): Promise<AiNamingModelResult> {
  const config = normalizeAiNamingModelConfig(options.config);
  const errors = validateAiNamingModelConfig(config);
  if (errors.length > 0) throw new Error(errors.join("；"));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("当前环境不支持 fetch");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  const onAbort = (): void => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) controller.abort();

  const started = (options.now ?? Date.now)();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    let response: Response;
    try {
      response = await fetchImpl(resolveChatCompletionsUrl(config.baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(buildAiNamingChatRequest(options.task, config)),
        signal: controller.signal,
      });
    } catch (reason) {
      if (timedOut) {
        throw new Error(`模型请求超时（${Math.round(config.timeoutMs / 1000)} 秒）`);
      }
      if (options.signal?.aborted) throw new Error("模型请求已取消");
      throw new Error(`无法连接模型接口：${describeNetworkError(reason)}`);
    }
    if (!response.ok) throw new Error(await readHttpError(response));
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (timedOut) {
        throw new Error(`模型请求超时（${Math.round(config.timeoutMs / 1000)} 秒）`);
      }
      if (options.signal?.aborted) throw new Error("模型请求已取消");
      throw new Error("模型接口返回的不是 JSON");
    }
    const text = extractChatCompletionText(payload);
    return {
      text,
      model:
        isRecord(payload) && typeof payload.model === "string" ? payload.model : null,
      usage: isRecord(payload) ? extractUsage(payload.usage) : null,
      durationMs: Math.max(0, (options.now ?? Date.now)() - started),
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
