import { copyFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const modelsSource = join(root, "node_modules", "openwakeword-wasm-browser", "models");
const ortSource = join(root, "node_modules", "onnxruntime-web", "dist");
const modelsTarget = join(root, "ui", "public", "openwakeword", "models");
const ortTarget = join(root, "ui", "public", "ort");

await mkdir(modelsTarget, { recursive: true });
await mkdir(ortTarget, { recursive: true });

for (const name of ["melspectrogram.onnx", "embedding_model.onnx", "silero_vad.onnx"]) {
  await copyFile(join(modelsSource, name), join(modelsTarget, name));
}

const wakeWord = (await readdir(modelsSource)).find((name) => /^hey_.*_v0\.1\.onnx$/i.test(name));
if (!wakeWord) throw new Error(`No wake-word model found in ${modelsSource}`);
await copyFile(join(modelsSource, wakeWord), join(modelsTarget, "hey_pipo_v0.1.onnx"));

for (const name of [
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.mjs",
]) {
  await copyFile(join(ortSource, name), join(ortTarget, name));
}

console.log("[copy-models] copied wake-word and ONNX runtime assets");
