// three@0.185.1 does not publish TypeScript declarations. Keep the scaffold's
// dependency set closed by declaring only the package entrypoints it consumes.
declare module "three/webgpu" {
  export const Color: any;
  export const CylinderGeometry: any;
  export const DirectionalLight: any;
  export const Fog: any;
  export const HemisphereLight: any;
  export const IcosahedronGeometry: any;
  export const InstancedMesh: any;
  export const Mesh: any;
  export const MeshBasicNodeMaterial: any;
  export const MeshStandardNodeMaterial: any;
  export const Object3D: any;
  export const PerspectiveCamera: any;
  export const PointLight: any;
  export const Scene: any;
  export const TorusGeometry: any;
  export const TorusKnotGeometry: any;
  export const WebGLRenderTarget: any;
  export const WebGPURenderer: any;
}

declare module "three/tsl" {
  export const color: any;
  export const float: any;
  export const oscSine: any;
  export const uniform: any;
}

declare module "*.css";
