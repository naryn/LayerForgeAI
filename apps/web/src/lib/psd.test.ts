import { writePsdBuffer } from "ag-psd";
import { describe, expect, it } from "vitest";
import {
  colorModeLabel,
  inspectPsd,
  isPsdFileName,
  parsePsdHeader,
  PSD_HEADER_SIZE,
  sha256Hex,
} from "./psd";

interface HeaderOverrides {
  version: number;
  channels: number;
  height: number;
  width: number;
  depth: number;
  colorMode: number;
}

function headerBytes(
  overrides: Partial<HeaderOverrides> = {},
  signature = "8BPS",
): ArrayBuffer {
  const buffer = new ArrayBuffer(PSD_HEADER_SIZE);
  const view = new DataView(buffer);
  for (let index = 0; index < 4; index += 1) {
    view.setUint8(index, signature.charCodeAt(index));
  }
  view.setUint16(4, overrides.version ?? 1);
  view.setUint16(12, overrides.channels ?? 3);
  view.setUint32(14, overrides.height ?? 100);
  view.setUint32(18, overrides.width ?? 200);
  view.setUint16(22, overrides.depth ?? 8);
  view.setUint16(24, overrides.colorMode ?? 3);
  return buffer;
}

function layerData(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
}

// ag-psd returns a Uint8Array here, not an ArrayBuffer.
function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  const view = value instanceof Uint8Array ? value : new Uint8Array(value);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

describe("parsePsdHeader", () => {
  it("读取有效头部字段", () => {
    const header = parsePsdHeader(
      headerBytes({ version: 2, channels: 4, width: 3840, height: 3531, depth: 16, colorMode: 4 }),
    );
    expect(header.version).toBe(2);
    expect(header.channels).toBe(4);
    expect(header.width).toBe(3840);
    expect(header.height).toBe(3531);
    expect(header.depth).toBe(16);
    expect(header.colorMode).toBe(4);
    expect(header.colorModeLabel).toBe("CMYK");
    expect(header.fileSize).toBe(PSD_HEADER_SIZE);
  });

  it("拒绝不足 26 字节的缓冲区", () => {
    expect(() => parsePsdHeader(new ArrayBuffer(12))).toThrow(/不足 26 字节/);
  });

  it("拒绝错误的签名", () => {
    expect(() => parsePsdHeader(headerBytes({}, "8BPS".replace("B", "X")))).toThrow(
      /不是有效的 PSD/,
    );
  });

  it("拒绝不支持的版本号", () => {
    expect(() => parsePsdHeader(headerBytes({ version: 3 }))).toThrow(/不支持的 PSD 版本号/);
  });

  it("拒绝越界的通道数", () => {
    expect(() => parsePsdHeader(headerBytes({ channels: 0 }))).toThrow(/通道数超出范围/);
    expect(() => parsePsdHeader(headerBytes({ channels: 57 }))).toThrow(/通道数超出范围/);
  });

  it("拒绝越界的画布尺寸", () => {
    expect(() => parsePsdHeader(headerBytes({ width: 0 }))).toThrow(/画布尺寸超出范围/);
    expect(() => parsePsdHeader(headerBytes({ version: 1, width: 40_000 }))).toThrow(
      /画布尺寸超出范围/,
    );
  });

  it("允许 PSB 使用更大的尺寸上限", () => {
    expect(() => parsePsdHeader(headerBytes({ version: 2, width: 40_000 }))).not.toThrow();
  });

  it("拒绝不支持的位深与颜色模式", () => {
    expect(() => parsePsdHeader(headerBytes({ depth: 12 }))).toThrow(/不支持的位深/);
    expect(() => parsePsdHeader(headerBytes({ colorMode: 99 }))).toThrow(/不支持的颜色模式/);
  });
});

describe("colorModeLabel", () => {
  it("映射已知颜色模式", () => {
    expect(colorModeLabel(3)).toBe("RGB");
    expect(colorModeLabel(1)).toBe("Grayscale");
  });

  it("对未知模式给出可读回退", () => {
    expect(colorModeLabel(42)).toBe("Unknown (42)");
  });
});

describe("isPsdFileName", () => {
  it("识别 psd 与 psb 扩展名（不区分大小写）", () => {
    expect(isPsdFileName("a.psd")).toBe(true);
    expect(isPsdFileName("B.PSB")).toBe(true);
    expect(isPsdFileName("a.png")).toBe(false);
    expect(isPsdFileName("a.psd.png")).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("输出标准 SHA-256 十六进制摘要", async () => {
    const digest = await sha256Hex(new TextEncoder().encode("abc").buffer);
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("inspectPsd", () => {
  it("解析真实 PSD 头部与图层树且无警告", async () => {
    const buffer = toArrayBuffer(
      writePsdBuffer({
        width: 120,
        height: 80,
        children: [
          { name: "背景", imageData: layerData(120, 80) },
          { name: "组", children: [{ name: "组/文字", imageData: layerData(40, 20), top: 6, left: 8 }] },
        ],
      }),
    );

    const inspection = await inspectPsd(buffer);
    expect(inspection.warning).toBeUndefined();
    expect(inspection.header.width).toBe(120);
    expect(inspection.header.height).toBe(80);
    expect(inspection.layers.map((layer) => layer.name)).toEqual(["背景", "组"]);
    const group = inspection.layers[1];
    expect(group.kind).toBe("group");
    expect(group.children[0].path).toBe("1/0");
  });

  it("头部非法时直接抛出", async () => {
    await expect(inspectPsd(new ArrayBuffer(4))).rejects.toThrow(/不足 26 字节/);
  });
});