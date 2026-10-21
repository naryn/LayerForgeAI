import type { LayerNode, PsdHeader } from "./domain";
import { normalizeLocalLayers, type AgLayerLike } from "./layers";

export const PSD_HEADER_SIZE = 26;

const COLOR_MODES: Record<number, string> = {
  0: "Bitmap",
  1: "Grayscale",
  2: "Indexed",
  3: "RGB",
  4: "CMYK",
  7: "Multichannel",
  8: "Duotone",
  9: "Lab",
};

export function colorModeLabel(colorMode: number): string {
  return COLOR_MODES[colorMode] ?? `Unknown (${colorMode})`;
}

export function isPsdFileName(fileName: string): boolean {
  return /\.(psd|psb)$/i.test(fileName);
}

export function parsePsdHeader(buffer: ArrayBuffer): PsdHeader {
  if (buffer.byteLength < PSD_HEADER_SIZE) {
    throw new Error("PSD 文件不完整：不足 26 字节头部");
  }
  const view = new DataView(buffer);
  const signature = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (signature !== "8BPS") {
    throw new Error(`不是有效的 PSD/PSB 文件：签名 ${JSON.stringify(signature)}`);
  }
  const version = view.getUint16(4);
  if (version !== 1 && version !== 2) {
    throw new Error(`不支持的 PSD 版本号：${version}`);
  }
  const channels = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  const depth = view.getUint16(22);
  const colorMode = view.getUint16(24);
  const maxDimension = version === 2 ? 300_000 : 30_000;
  if (channels < 1 || channels > 56) {
    throw new Error(`PSD 通道数超出范围：${channels}`);
  }
  if (width < 1 || height < 1 || width > maxDimension || height > maxDimension) {
    throw new Error(`PSD 画布尺寸超出范围：${width} × ${height}`);
  }
  if (![1, 8, 16, 32].includes(depth)) {
    throw new Error(`不支持的位深：${depth}`);
  }
  if (!(colorMode in COLOR_MODES)) {
    throw new Error(`不支持的颜色模式：${colorMode}`);
  }
  return {
    version,
    channels,
    height,
    width,
    depth,
    colorMode,
    colorModeLabel: colorModeLabel(colorMode),
    fileSize: buffer.byteLength,
  };
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前环境不支持 WebCrypto SHA-256");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface PsdInspection {
  header: PsdHeader;
  layers: LayerNode[];
  warning?: string;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 280 ? `${message.slice(0, 277)}…` : message;
}

export async function inspectPsd(buffer: ArrayBuffer): Promise<PsdInspection> {
  const header = parsePsdHeader(buffer);
  try {
    const { readPsd } = await import("ag-psd");
    const psd = readPsd(buffer, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
      skipLinkedFilesData: true,
      logMissingFeatures: false,
      throwForMissingFeatures: false,
      useImageData: true,
    });
    const layers = normalizeLocalLayers(psd.children as AgLayerLike[] | undefined);
    return { header, layers };
  } catch (error) {
    return {
      header,
      layers: [],
      warning: `图层树本地解析失败，仅读取文件头：${describeError(error)}`,
    };
  }
}
