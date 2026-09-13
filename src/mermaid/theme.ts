export const macchiato = {
  base: "#24273a",
  surface0: "#363a4f",
  text: "#cad3f5",
  overlay0: "#6e738d",
  green: "#a6da95",
  red: "#ed8796",
  yellow: "#eed49f",
  mauve: "#c6a0f6",
} as const;

const p = macchiato;

export const initDirective = `%%{init: ${JSON.stringify({
  theme: "base",
  securityLevel: "strict",
  htmlLabels: false,
  themeVariables: {
    darkMode: true,
    background: p.base,
    primaryColor: p.surface0,
    primaryTextColor: p.text,
    primaryBorderColor: p.overlay0,
    secondaryColor: p.surface0,
    tertiaryColor: p.base,
    lineColor: p.overlay0,
    textColor: p.text,
    mainBkg: p.surface0,
    nodeBorder: p.overlay0,
    clusterBkg: p.base,
    clusterBorder: p.overlay0,
    titleColor: p.text,
    edgeLabelBackground: p.base,
  },
})}}%%`;

export const nodeClasses = [
  `classDef unchanged fill:${p.surface0},color:${p.text},stroke:${p.overlay0}`,
  `classDef added fill:${p.green},color:${p.base},stroke:${p.green}`,
  `classDef modified fill:${p.yellow},color:${p.base},stroke:${p.yellow}`,
  `classDef deleted fill:${p.red},color:${p.base},stroke:${p.red},stroke-dasharray:5 5`,
];

export const edgeStyles = {
  unchanged: `stroke:${p.overlay0},color:${p.text},stroke-width:1px`,
  added: `stroke:${p.green},color:${p.text},stroke-width:2px`,
  deleted: `stroke:${p.red},color:${p.text},stroke-width:2px,stroke-dasharray:5 5`,
  renamed: `stroke:${p.mauve},color:${p.text},stroke-width:2px,stroke-dasharray:2 3`,
} as const;
