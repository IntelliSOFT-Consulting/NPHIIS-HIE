// Side-effect CSS imports (e.g. `import "leaflet/dist/leaflet.css"`) carry no
// runtime export but TypeScript's bundler resolver still wants a declaration.
declare module "*.css";
