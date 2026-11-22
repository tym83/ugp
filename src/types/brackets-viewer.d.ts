// The brackets-viewer package ships a UMD browser bundle (window.bracketsViewer);
// its package "main" points to a missing ESM entry, so we load the bundle dynamically.
declare module "brackets-viewer/dist/brackets-viewer.min.js";
