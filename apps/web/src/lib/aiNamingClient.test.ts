import { describe, expect, it, vi } from "vitest";
import {
  AI_NAMING_API_KEY_STORAGE_KEY,
  AI_NAMING_DEFAULT_TIMEOUT_MS,
  AI_NAMING_MODEL_STORAGE_KEY,
  buildAiNamingChatRequest,
  clearAiNamingModelConfig,
  extractChatCompletionText,
  isAiNamingModelConfigured,
  loadAiNamingModelConfig,
  normalizeAiNamingModelConfig,
  requestAiNamingCompletion,
  resolveChatCompletionsUrl,
  saveAiNamingModelConfig,
  validateAiNamingModelConfig,
  type AiNamingModelConfig,
  type KeyValueStorage,
} from "./aiNamingClient";
import { AI_NAMING_REQUEST_SCHEMA, AI_NAMING_SCHEMA_VERSION } from "./aiNaming";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const config: AiNamingModelConfig = {
  baseUrl: " https://api.deepseek.com/v1/ ",
  model: " deepseek-chat ",
  apiKey: "sk-test",
  rememberKey: true,
  jsonMode: true,
  timeoutMs: 60_000,
};

const task = {
  schema: AI_NAMING_REQUEST_SCHEMA,
  schemaVersion: AI_NAMING_SCHEMA_VERSION,
  generatedAt: "2026-10-22T00:00:00.000Z",
  project: {
    name: "Demo",
    sourceFileName: "demo.psd",
    width: 400,
    height: 300,
    layerCount: 1,
  },
  candidates: [],
  mergeCandidates: [],
  outline: '- 0 [shape] "Layer 1"',
};

function completion(content: unknown, extra: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-1",
      model: "deepseek-chat",
      choices: [{ index: 0, message: { role: "assistant", content } }],
      usage: { prompt_tokens: 120, completion_tokens: 20, total_tokens: 140 },
      ...extra,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("模型接口地址", () => {
  it("补齐 /v1 与 /chat/completions", () => {
    expect(resolveChatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(resolveChatCompletionsUrl("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(resolveChatCompletionsUrl("http://localhost:11434/v1/")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
    expect(resolveChatCompletionsUrl("https://open.bigmodel.cn/api/paas/v4")).toBe(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    );
    expect(
      resolveChatCompletionsUrl("https://example.com/v1/chat/completions"),
    ).toBe("https://example.com/v1/chat/completions");
  });

  it("校验必填项、协议与内嵌凭据", () => {
    expect(validateAiNamingModelConfig(config)).toEqual([]);
    expect(validateAiNamingModelConfig({ ...config, baseUrl: "", model: "" })).toEqual([
      "请填写模型接口地址",
      "请填写模型名称",
    ]);
    expect(
      validateAiNamingModelConfig({ ...config, baseUrl: "ftp://example.com/v1" }),
    ).toContain("模型接口地址必须使用 http 或 https");
    expect(
      validateAiNamingModelConfig({ ...config, baseUrl: "https://user:pass@example.com/v1" }),
    ).toContain("模型接口地址不能包含账号或密码");
    expect(
      validateAiNamingModelConfig({ ...config, baseUrl: "https://example.com/v1?key=x" }),
    ).toContain("模型接口地址不能包含查询参数或片段");
    expect(isAiNamingModelConfigured({ ...config, model: " " })).toBe(false);
  });
});

describe("模型配置持久化", () => {
  it("保存并读取地址、模型与记住的 Key", () => {
    const storage = memoryStorage();
    expect(saveAiNamingModelConfig(config, storage)).toBe(true);
    expect(loadAiNamingModelConfig(storage)).toEqual({
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      apiKey: "sk-test",
      rememberKey: true,
      jsonMode: true,
      timeoutMs: 60_000,
    });
    expect(storage.data.get(AI_NAMING_API_KEY_STORAGE_KEY)).toBe("sk-test");
  });

  it("取消记住 Key 时删除已保存的 Key", () => {
    const storage = memoryStorage({
      [AI_NAMING_API_KEY_STORAGE_KEY]: "sk-old",
    });
    saveAiNamingModelConfig({ ...config, rememberKey: false }, storage);
    expect(storage.data.has(AI_NAMING_API_KEY_STORAGE_KEY)).toBe(false);
    expect(loadAiNamingModelConfig(storage).apiKey).toBe("");
  });

  it("损坏或不可用的存储回退到默认配置", () => {
    const broken = memoryStorage({ [AI_NAMING_MODEL_STORAGE_KEY]: "{not json" });
    expect(loadAiNamingModelConfig(broken)).toEqual({
      baseUrl: "",
      model: "",
      apiKey: "",
      rememberKey: false,
      jsonMode: true,
      timeoutMs: AI_NAMING_DEFAULT_TIMEOUT_MS,
    });
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => loadAiNamingModelConfig(blocked)).not.toThrow();
    expect(saveAiNamingModelConfig(config, blocked)).toBe(false);
    expect(() => clearAiNamingModelConfig(blocked)).not.toThrow();
  });

  it("超时时间限制在 10–300 秒", () => {
    expect(normalizeAiNamingModelConfig({ ...config, timeoutMs: 1 }).timeoutMs).toBe(10_000);
    expect(
      normalizeAiNamingModelConfig({ ...config, timeoutMs: 999_999 }).timeoutMs,
    ).toBe(300_000);
  });
});

describe("请求构造与响应提取", () => {
  it("请求包含系统提示、任务提示、鉴权与 JSON 模式", () => {
    const request = buildAiNamingChatRequest(task, config);
    expect(request.model).toBe("deepseek-chat");
    expect(request.stream).toBe(false);
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.messages[0]?.role).toBe("system");
    expect(request.messages[1]?.content).toContain(AI_NAMING_REQUEST_SCHEMA);
    expect(request.messages[1]?.content).toContain('"candidates": []');
    expect(request.messages[1]?.content).toContain("直接返回上述 JSON 对象");
    expect(buildAiNamingChatRequest(task, { ...config, jsonMode: false })).not.toHaveProperty(
      "response_format",
    );
  });

  it("调用 chat/completions 并返回文本、模型与用量", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => completion('{"renames":[]}'));
    let now = 1000;
    const result = await requestAiNamingCompletion({
      task,
      config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => {
        now += 250;
        return now;
      },
    });
    expect(result).toEqual({
      text: '{"renames":[]}',
      model: "deepseek-chat",
      usage: { promptTokens: 120, completionTokens: 20, totalTokens: 140 },
      durationMs: 250,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    const request = init as RequestInit;
    expect(request.method).toBe("POST");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(request.body)).model).toBe("deepseek-chat");
  });

  it("本地模型可省略鉴权", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => completion("plain"));
    await requestAiNamingCompletion({
      task,
      config: { ...config, baseUrl: "http://localhost:11434/v1", apiKey: "" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("提取字符串与分段内容，拒绝空响应", () => {
    expect(
      extractChatCompletionText({
        choices: [{ message: { content: [{ type: "text", text: "a" }, { text: "b" }] } }],
      }),
    ).toBe("ab");
    expect(() => extractChatCompletionText({ choices: [] })).toThrow("choices");
    expect(() =>
      extractChatCompletionText({ choices: [{ message: { content: "  " } }] }),
    ).toThrow("没有文本内容");
  });

  it("把 HTTP 错误和网络错误转成可读信息", async () => {
    const failed = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { message: "invalid api key" } }), {
          status: 401,
          statusText: "Unauthorized",
        }),
    );
    await expect(
      requestAiNamingCompletion({
        task,
        config,
        fetchImpl: failed as unknown as typeof fetch,
      }),
    ).rejects.toThrow("模型接口返回 401 Unauthorized：invalid api key");

    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      requestAiNamingCompletion({
        task,
        config,
        fetchImpl: offline as unknown as typeof fetch,
      }),
    ).rejects.toThrow("无法连接模型接口：Failed to fetch");
  });

  it("超时后中止请求", async () => {
    vi.useFakeTimers();
    try {
      const hanging = vi.fn<typeof fetch>(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      );
      const pending = requestAiNamingCompletion({
        task,
        config: { ...config, timeoutMs: 10_000 },
        fetchImpl: hanging as unknown as typeof fetch,
      });
      const assertion = expect(pending).rejects.toThrow("模型请求超时（10 秒）");
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
