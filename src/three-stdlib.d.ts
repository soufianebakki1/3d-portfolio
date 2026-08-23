// The installed `three-stdlib` package points `types` at an `index.d.ts` that is
// missing from node_modules, so every import from it resolved to `any` and broke
// `tsc -b` (and therefore `npm run build` and any Vercel deploy).
//
// These loaders are re-exports of the upstream three.js ones, which @types/three
// already types properly - so point the module at those instead of falling back
// to `any`.
declare module "three-stdlib" {
  export { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  export { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
  export { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
}
