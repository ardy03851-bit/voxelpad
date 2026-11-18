export const CLIENT_NAME = "EaglercraftX_1.8_u53_Offline_Signed.html";
export const CLIENT_HASH = "e59ab8c477d7aad12cc4d1f148a2728e2278d384e9c91d2ba6aa4eed432fc171";
export const CLIENT_SIZE = 18002822;
export const GAME_NAMESPACE = "voxelpad-u53-client";
export const FILE_LIMIT = 24 * 1024 * 1024;
export const PROFILES = {
  battery: { label: "Battery Saver", chunks: 3, dpr: 1, particles: 2, fancy: false },
  balanced: { label: "Balanced", chunks: 4, dpr: 1.5, particles: 1, fancy: false },
  sharp: { label: "Sharp", chunks: 6, dpr: null, particles: 0, fancy: true },
};

const unsupported = () => new Error("This file isn’t the supported EaglercraftX 1.8 u53 signed offline build. Choose the original ZIP or its unmodified HTML.");
const brokenZip = () => new Error("That ZIP could not be read. Unzip it in Files, then choose the original HTML inside.");

export async function readLimited(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw brokenZip();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks).arrayBuffer();
}

export async function extractClient(zip) {
  const view = new DataView(zip);
  const length = view.byteLength;
  if (length < 22) throw brokenZip();
  let eocd = -1;
  for (let at = length - 22; at >= Math.max(0, length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === length) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0 || view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true)) throw brokenZip();
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directory = view.getUint32(eocd + 16, true);
  if (entries !== 1 || view.getUint16(eocd + 8, true) !== entries || directory + directorySize !== eocd || directorySize < 46 || view.getUint32(directory, true) !== 0x02014b50) throw brokenZip();
  const flags = view.getUint16(directory + 8, true);
  const method = view.getUint16(directory + 10, true);
  const compressedSize = view.getUint32(directory + 20, true);
  const expandedSize = view.getUint32(directory + 24, true);
  const nameSize = view.getUint16(directory + 28, true);
  const extraSize = view.getUint16(directory + 30, true);
  const commentSize = view.getUint16(directory + 32, true);
  const local = view.getUint32(directory + 42, true);
  if (46 + nameSize + extraSize + commentSize !== directorySize || local + 30 > directory || view.getUint32(local, true) !== 0x04034b50) throw brokenZip();
  const filename = new TextDecoder().decode(new Uint8Array(zip, directory + 46, nameSize));
  if ((flags & 1) || (method !== 0 && method !== 8) || expandedSize !== CLIENT_SIZE || filename !== CLIENT_NAME) throw unsupported();
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  if (start > directory || start + compressedSize > directory) throw brokenZip();
  const bytes = new Uint8Array(zip, start, compressedSize);
  if (method === 0) return bytes.slice().buffer;
  let inflater;
  try {
    inflater = new DecompressionStream("deflate-raw");
  } catch {
    throw new Error("This browser cannot unzip this file. In Files, tap the ZIP to extract it, then choose the HTML inside.");
  }
  try {
    return await readLimited(new Blob([bytes]).stream().pipeThrough(inflater), CLIENT_SIZE);
  } catch {
    throw brokenZip();
  }
}

export async function verifyClient(bytes) {
  if (bytes.byteLength !== CLIENT_SIZE) throw unsupported();
  if (!globalThis.crypto?.subtle) throw new Error("File verification requires a secure browser page. Open the public HTTPS site in Safari.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hex !== CLIENT_HASH) throw unsupported();
  return bytes;
}

export async function importClient(file) {
  const zip = /\.zip$/i.test(file.name);
  if (!zip && !/\.html?$/i.test(file.name)) throw new Error("Choose the signed offline ZIP or its HTML file. A server JAR cannot run in your browser.");
  if (file.size > FILE_LIMIT) throw new Error("That file exceeds the 24 MiB import limit. Choose the original signed offline client.");
  const bytes = await file.arrayBuffer();
  return verifyClient(zip ? await extractClient(bytes) : bytes);
}

export function normalizeSettings(settings) {
  const profile = Object.hasOwn(PROFILES, settings?.profile) ? settings.profile : "balanced";
  const opacity = typeof settings?.opacity === "number" && Number.isFinite(settings.opacity)
    ? Math.min(100, Math.max(40, Math.round(settings.opacity / 5) * 5)) : 85;
  return { profile, opacity };
}

export function mergeOptions(previous, settings) {
  const { profile, opacity } = normalizeSettings(settings);
  const spec = PROFILES[profile];
  const values = {
    renderDistance: spec.chunks, particles: spec.particles, fancyGraphics: spec.fancy,
    renderClouds: "false", enableVsyncEag: true, enableDynamicLights: false,
    shaders: false, fxaa: false, touchControlOpacity: opacity / 100,
  };
  const retained = previous.split(/\r?\n/).filter(line => line && !Object.hasOwn(values, line.split(":", 1)[0]));
  return [...retained, ...Object.entries(values).map(([key, value]) => `${key}:${value}`), ""].join("\n");
}

async function decodeOptions(encoded) {
  if (!encoded || encoded.length > 180_000) return "";
  try {
    const compressed = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new TextDecoder().decode(await readLimited(stream, 256_000));
  } catch {
    return "";
  }
}

async function encodeOptions(text) {
  // A gzip member with a stored DEFLATE block is enough for a small options file;
  // CompressionStream is used where available to preserve larger existing configs.
  if (typeof CompressionStream === "function") {
    const compressed = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    return btoa(Array.from(new Uint8Array(compressed), byte => String.fromCharCode(byte)).join(""));
  }
  const data = new TextEncoder().encode(text);
  if (data.length > 65535) throw new Error("This browser cannot apply these game settings. Update Safari and try again.");
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  const gzip = new Uint8Array(23 + data.length);
  gzip.set([31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 1], 0);
  const view = new DataView(gzip.buffer);
  view.setUint16(11, data.length, true);
  view.setUint16(13, data.length ^ 0xffff, true);
  gzip.set(data, 15);
  view.setUint32(15 + data.length, ~crc, true);
  view.setUint32(19 + data.length, data.length, true);
  return btoa(Array.from(gzip, byte => String.fromCharCode(byte)).join(""));
}

function installGameAdapter(config) {
  const { dpr, options, namespace, token } = config;
  const defaults = window.eaglercraftXOptsHints || {};
  Object.assign(defaults, {
    localStorageNamespace: namespace,
    worldsDB: "voxelpad-u53-worlds",
    resourcePacksDB: "voxelpad-u53-packs",
    relays: [],
    checkRelaysForUpdates: false,
    enableUpdateSvc: false,
    allowBootMenu: false,
    hooks: {
      localStorageLoaded(key) {
        return key === "g" || key === `${namespace}.g` ? options : null;
      },
    },
  });
  window.eaglercraftXOptsHints = defaults;
  if (dpr !== null) {
    const original = window.devicePixelRatio || 1;
    try {
      Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => Math.min(original, dpr) });
    } catch { /* Browser does not allow an override; game options still apply. */ }
  }
  window.addEventListener("load", () => {
    document.getElementById("skipCountdown")?.click();
    const observer = new MutationObserver(() => {
      const canvas = document.querySelector("#game_frame canvas");
      if (!canvas || canvas.width < 32 || canvas.height < 32) return;
      observer.disconnect();
      parent.postMessage({ voxelpad: "canvas", token }, "*");
    });
    observer.observe(document.getElementById("game_frame"), { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height"] });
  });
}

export async function buildGame(bytes, settings, token, saved = "") {
  // Verify at the point of execution, even if the bytes came from device storage.
  await verifyClient(bytes);
  const normalized = normalizeSettings(settings);
  const previous = await decodeOptions(saved);
  const options = await encodeOptions(mergeOptions(previous, normalized));
  const config = { options, dpr: PROFILES[normalized.profile].dpr, namespace: GAME_NAMESPACE, token };
  const original = new TextDecoder().decode(bytes);
  const headEnd = original.indexOf("</head>");
  const charsetEnd = original.indexOf("/>", original.indexOf('<meta charset="UTF-8"')) + 2;
  if (headEnd < 0 || charsetEnd < 2) throw unsupported();
  // This capability applies only to the one pinned local build. It cannot load
  // remote scripts, connect to game servers, or submit forms from inside the frame.
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline' blob: data:; img-src blob: data:; font-src blob: data:; media-src blob: data:; worker-src blob: data:; frame-src blob: data:; connect-src blob: data:;">`;
  const adapter = `<script>(${installGameAdapter.toString()})(${JSON.stringify(config).replace(/</g, "\\u003c")});</script>`;
  return new Blob([original.slice(0, charsetEnd), csp, original.slice(charsetEnd, headEnd), adapter, original.slice(headEnd)], { type: "text/html;charset=utf-8" });
}
