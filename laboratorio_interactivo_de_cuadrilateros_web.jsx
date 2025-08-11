import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Ruler,
  RefreshCw,
  Shapes,
  Info,
  Download,
  Grid as GridIcon,
  Move,
  Scan,
  Sparkles,
} from "lucide-react";

// ============================
// Utilidades matemáticas
// ============================
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
const dot = (ax: number, ay: number, bx: number, by: number) => ax * bx + ay * by;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

const angleBetween = (ax: number, ay: number, bx: number, by: number) => {
  const d = Math.sqrt(ax * ax + ay * ay) * Math.sqrt(bx * bx + by * by) || 1;
  const cos = Math.min(1, Math.max(-1, dot(ax, ay, bx, by) / d));
  return toDeg(Math.acos(cos));
};

const nearly = (a: number, b: number, tolAbs = 1e-6) => Math.abs(a - b) <= tolAbs;

const angleAt = (prev: Pt, p: Pt, next: Pt) => {
  const v1 = { x: prev.x - p.x, y: prev.y - p.y };
  const v2 = { x: next.x - p.x, y: next.y - p.y };
  return angleBetween(v1.x, v1.y, v2.x, v2.y);
};

const isParallel = (v1: Vec, v2: Vec, tolDeg = 4) => {
  const a = angleBetween(v1.x, v1.y, v2.x, v2.y);
  const md = Math.min(a, 180 - a);
  return md <= tolDeg;
};

const isPerp = (v1: Vec, v2: Vec, tolDeg = 4) => {
  const a = angleBetween(v1.x, v1.y, v2.x, v2.y);
  return Math.abs(a - 90) <= tolDeg;
};

const relEqual = (a: number, b: number, tol = 0.05) => {
  const m = (Math.abs(a) + Math.abs(b)) / 2 || 1;
  return Math.abs(a - b) / m <= tol;
};

const shoelaceArea = (pts: Pt[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(s) / 2;
};

const polygonSelfIntersects = (pts: Pt[]) => {
  // Comprueba si segmentos no adyacentes se cruzan
  const segs = [
    [pts[0], pts[1]],
    [pts[1], pts[2]],
    [pts[2], pts[3]],
    [pts[3], pts[0]],
  ];
  const inter = (A: Pt, B: Pt, C: Pt, D: Pt) => {
    const d1x = B.x - A.x, d1y = B.y - A.y;
    const d2x = D.x - C.x, d2y = D.y - C.y;
    const denom = cross(d1x, d1y, d2x, d2y);
    if (Math.abs(denom) < 1e-9) return false; // paralelos
    const t = cross(C.x - A.x, C.y - A.y, d2x, d2y) / denom;
    const u = cross(C.x - A.x, C.y - A.y, d1x, d1y) / denom;
    return t > 0 && t < 1 && u > 0 && u < 1;
  };
  // pares no adyacentes: (0-1 con 2-3) y (1-2 con 3-0)
  return inter(segs[0][0], segs[0][1], segs[2][0], segs[2][1]) ||
         inter(segs[1][0], segs[1][1], segs[3][0], segs[3][1]);
};

const isConvex = (pts: Pt[]) => {
  const n = pts.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const z = cross(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y);
    if (Math.abs(z) > 1e-6) {
      if (sign === 0) sign = Math.sign(z);
      else if (Math.sign(z) !== sign) return false;
    }
  }
  return true;
};

// ============================
// Tipos
// ============================
type Pt = { x: number; y: number };
type Vec = { x: number; y: number };

type Props = {};

// ============================
// Componente principal
// ============================
export default function QuadrilateralLab(_: Props) {
  // Dimensiones del lienzo
  const W = 900;
  const H = 560;
  const gridStep = 40; // px

  const [pts, setPts] = useState<Pt[]>([
    { x: 200, y: 140 },
    { x: 700, y: 140 },
    { x: 640, y: 420 },
    { x: 260, y: 420 },
  ]);

  const [showGrid, setShowGrid] = useState(true);
  const [showLengths, setShowLengths] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const [showDiagonals, setShowDiagonals] = useState(true);
  const [snap, setSnap] = useState(false);
  const [arcScale, setArcScale] = useState(0.8);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIndex = useRef<number | null>(null);

  // ============================
  // Arrastrar vértices
  // ============================
  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    dragIndex.current = i;
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragIndex.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIndex.current === null) return;
    const rect = svgRef.current!.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    if (snap) {
      x = Math.round(x / gridStep) * gridStep;
      y = Math.round(y / gridStep) * gridStep;
    }
    setPts((old) => old.map((p, idx) => (idx === dragIndex.current ? { x, y } : p)));
  };

  // ============================
  // Cálculos geométricos
  // ============================
  const geom = useMemo(() => {
    const [A, B, C, D] = pts;
    const sides = [dist(A, B), dist(B, C), dist(C, D), dist(D, A)];
    const perimetro = sides.reduce((a, b) => a + b, 0);
    const angulos = [
      angleAt(D, A, B),
      angleAt(A, B, C),
      angleAt(B, C, D),
      angleAt(C, D, A),
    ];

    const vAB = { x: B.x - A.x, y: B.y - A.y };
    const vBC = { x: C.x - B.x, y: C.y - B.y };
    const vCD = { x: D.x - C.x, y: D.y - C.y };
    const vDA = { x: A.x - D.x, y: A.y - D.y };

    const oppPar = [isParallel(vAB, vCD), isParallel(vBC, vDA)];
    const bothOppPar = oppPar[0] && oppPar[1];
    const onePairParOnly = (oppPar[0] ? 1 : 0) + (oppPar[1] ? 1 : 0) === 1;

    const allRight = angulos.every((a) => Math.abs(a - 90) < 4);
    const allSidesEq = sides.every((s) => relEqual(s, sides[0]));

    const diagAC = dist(A, C);
    const diagBD = dist(B, D);

    const diagVecAC = { x: C.x - A.x, y: C.y - A.y };
    const diagVecBD = { x: D.x - B.x, y: D.y - B.y };
    const diagonalsPerp = isPerp(diagVecAC, diagVecBD);
    const diagonalsEq = relEqual(diagAC, diagBD, 0.03);

    const area = shoelaceArea(pts);

    const sumAng = angulos.reduce((a, b) => a + b, 0);

    const isIsoTrap = onePairParOnly && relEqual(sides[1], sides[3]); // BC == DA
    const hasRightAngle = angulos.some((a) => Math.abs(a - 90) < 4);

    const kiteAdjacentEq = (relEqual(sides[0], sides[1]) && relEqual(sides[2], sides[3])) ||
                           (relEqual(sides[1], sides[2]) && relEqual(sides[3], sides[0]));

    // Clasificación
    let tipo = "Trapezoide" as
      | "Cuadrado"
      | "Rectángulo"
      | "Rombo"
      | "Romboide"
      | "Paralelogramo"
      | "Trapecio"
      | "Trapecio isósceles"
      | "Trapecio rectángulo"
      | "Deltoide (cometa)"
      | "Trapezoide";

    if (bothOppPar) {
      if (allRight && allSidesEq) tipo = "Cuadrado";
      else if (allRight) tipo = "Rectángulo";
      else if (allSidesEq) tipo = "Rombo";
      else tipo = "Romboide"; // paralelogramo no-rectángulo/no-rombo
    } else if (onePairParOnly) {
      if (hasRightAngle) tipo = "Trapecio rectángulo";
      else if (isIsoTrap) tipo = "Trapecio isósceles";
      else tipo = "Trapecio";
    } else if (kiteAdjacentEq) {
      tipo = "Deltoide (cometa)";
    } else {
      tipo = "Trapezoide";
    }

    const selfX = polygonSelfIntersects(pts);
    const convex = !selfX && isConvex(pts);

    return {
      sides,
      perimetro,
      angulos,
      oppPar,
      bothOppPar,
      onePairParOnly,
      allRight,
      allSidesEq,
      diagAC,
      diagBD,
      diagonalsPerp,
      diagonalsEq,
      area,
      sumAng,
      tipo,
      hasRightAngle,
      isIsoTrap,
      kiteAdjacentEq,
      selfX,
      convex,
      vAB,
      vBC,
      vCD,
      vDA,
    };
  }, [pts]);

  // ============================
  // Presets / acciones
  // ============================
  const setPreset = (name: string) => {
    switch (name) {
      case "Cuadrado":
        setPts([
          { x: 300, y: 180 },
          { x: 580, y: 180 },
          { x: 580, y: 460 },
          { x: 300, y: 460 },
        ]);
        break;
      case "Rectángulo":
        setPts([
          { x: 260, y: 180 },
          { x: 660, y: 180 },
          { x: 600, y: 460 },
          { x: 200, y: 460 },
        ]);
        break;
      case "Rombo":
        setPts([
          { x: 420, y: 160 },
          { x: 640, y: 300 },
          { x: 480, y: 460 },
          { x: 260, y: 320 },
        ]);
        break;
      case "Romboide":
        setPts([
          { x: 260, y: 180 },
          { x: 640, y: 220 },
          { x: 600, y: 460 },
          { x: 220, y: 420 },
        ]);
        break;
      case "Trapecio isósceles":
        setPts([
          { x: 300, y: 220 },
          { x: 620, y: 220 },
          { x: 560, y: 440 },
          { x: 360, y: 440 },
        ]);
        break;
      case "Trapecio rectángulo":
        setPts([
          { x: 280, y: 220 },
          { x: 640, y: 220 },
          { x: 640, y: 460 },
          { x: 320, y: 460 },
        ]);
        break;
      case "Deltoide (cometa)":
        setPts([
          { x: 460, y: 140 },
          { x: 660, y: 320 },
          { x: 460, y: 480 },
          { x: 280, y: 320 },
        ]);
        break;
      case "Trapezoide":
        setPts([
          { x: 260, y: 220 },
          { x: 640, y: 260 },
          { x: 560, y: 480 },
          { x: 320, y: 420 },
        ]);
        break;
      default:
        break;
    }
  };

  const randomize = () => {
    const margin = 60;
    const rnd = () => Math.round((margin + Math.random() * (W - 2 * margin)) / gridStep) * gridStep;
    setPts([
      { x: rnd(), y: rnd() },
      { x: rnd(), y: rnd() },
      { x: rnd(), y: rnd() },
      { x: rnd(), y: rnd() },
    ]);
  };

  const makeParallelogram = () => {
    // Forzar D = A + (C - B)
    setPts(([A, B, C]) => [{ ...A }, { ...B }, { ...C }, { x: A.x + (C.x - B.x), y: A.y + (C.y - B.y) }]);
  };

  const makeTrapecioAB_CD = () => {
    // Forzar CD paralelo a AB, conservando C
    setPts(([A, B, C, D]) => {
      const v = { x: B.x - A.x, y: B.y - A.y };
      const len = Math.hypot(D.x - C.x, D.y - C.y) || 1;
      const vUnit = { x: v.x / (Math.hypot(v.x, v.y) || 1), y: v.y / (Math.hypot(v.x, v.y) || 1) };
      return [A, B, C, { x: C.x + vUnit.x * len, y: C.y + vUnit.y * len }];
    });
  };

  // ============================
  // Exportar imagen
  // ============================
  const downloadPNG = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = `data:image/svg+xml;base64,${svg64}`;

    const img = new Image();
    img.src = image64;
    await new Promise((res) => (img.onload = res));

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `cuadrilatero_${geom.tipo}.png`;
    a.click();
  };

  // ============================
  // Render helpers
  // ============================
  const gridLines = [] as JSX.Element[];
  if (showGrid) {
    for (let x = gridStep; x < W; x += gridStep) {
      gridLines.push(<line key={`vx${x}`} x1={x} y1={0} x2={x} y2={H} stroke="#e5e7eb" strokeWidth={1} />);
    }
    for (let y = gridStep; y < H; y += gridStep) {
      gridLines.push(<line key={`hz${y}`} x1={0} y1={y} x2={W} y2={y} stroke="#e5e7eb" strokeWidth={1} />);
    }
  }

  const [A, B, C, D] = pts;

  const drawAngleArc = (center: Pt, prev: Pt, next: Pt, r = 36, label?: string) => {
    const v1 = { x: prev.x - center.x, y: prev.y - center.y };
    const v2 = { x: next.x - center.x, y: next.y - center.y };
    const a1 = Math.atan2(v1.y, v1.x);
    const a2 = Math.atan2(v2.y, v2.x);
    // elegir recorrido menor
    let start = a1;
    let end = a2;
    let sweep = end - start;
    if (sweep <= -Math.PI) sweep += 2 * Math.PI;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
    const sw = sweep >= 0 ? 1 : 0;

    const p1 = { x: center.x + r * Math.cos(start), y: center.y + r * Math.sin(start) };
    const p2 = { x: center.x + r * Math.cos(end), y: center.y + r * Math.sin(end) };

    const path = `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} ${sw} ${p2.x} ${p2.y}`;
    const mid = { x: center.x + (r + 16) * Math.cos((start + end) / 2), y: center.y + (r + 16) * Math.sin((start + end) / 2) };

    return (
      <g>
        <path d={path} stroke="#9ca3af" fill="none" />
        {label && (
          <text x={mid.x} y={mid.y} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill="#374151">
            {label}
          </text>
        )}
      </g>
    );
  };

  const sideLabels = [
    { from: A, to: B, name: "AB" },
    { from: B, to: C, name: "BC" },
    { from: C, to: D, name: "CD" },
    { from: D, to: A, name: "DA" },
  ];

  const angleLabels = [
    { p: A, prev: D, next: B, name: "∠A", val: geom.angulos[0] },
    { p: B, prev: A, next: C, name: "∠B", val: geom.angulos[1] },
    { p: C, prev: B, next: D, name: "∠C", val: geom.angulos[2] },
    { p: D, prev: C, next: A, name: "∠D", val: geom.angulos[3] },
  ];

  const propList: { label: string; ok: boolean }[] = [
    { label: "Suma de ángulos ≈ 360°", ok: Math.abs(geom.sumAng - 360) < 1 },
    { label: "Pares de lados opuestos paralelos (2)", ok: geom.bothOppPar },
    { label: "Un solo par de lados paralelos", ok: geom.onePairParOnly },
    { label: "Todos los ángulos rectos", ok: geom.allRight },
    { label: "Todos los lados iguales", ok: geom.allSidesEq },
    { label: "Diagonales perpendiculares", ok: geom.diagonalsPerp },
    { label: "Diagonales iguales", ok: geom.diagonalsEq },
    { label: "Tiene algún ángulo recto", ok: geom.hasRightAngle },
    { label: "Trapecio isósceles (lados no paralelos iguales)", ok: geom.isIsoTrap },
    { label: "Deltoide (pares adyacentes de lados iguales)", ok: geom.kiteAdjacentEq },
  ];

  // ============================
  // UI
  // ============================
  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-white to-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Laboratorio interactivo de Cuadriláteros</h1>
          <Badge variant="secondary" className="ml-2">Explora • Arrastra • Aprende</Badge>
        </div>

        <Tabs defaultValue="lab" className="w-full">
          <TabsList className="grid grid-cols-3 md:w-[520px]">
            <TabsTrigger value="lab"><Shapes className="w-4 h-4 mr-2"/>Laboratorio</TabsTrigger>
            <TabsTrigger value="teoria"><Info className="w-4 h-4 mr-2"/>Teoría</TabsTrigger>
            <TabsTrigger value="datos"><Ruler className="w-4 h-4 mr-2"/>Medidas</TabsTrigger>
          </TabsList>

          {/* ================= LAB ================= */}
          <TabsContent value="lab" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2"><GridIcon className="w-5 h-5"/> Lienzo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative rounded-2xl bg-white shadow-sm overflow-hidden">
                    <svg
                      ref={svgRef}
                      width={W}
                      height={H}
                      viewBox={`0 0 ${W} ${H}`}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      className="block w-full h-auto"
                    >
                      {/* Grid */}
                      <g>{gridLines}</g>

                      {/* Diagonales */}
                      {showDiagonals && (
                        <g>
                          <line x1={A.x} y1={A.y} x2={C.x} y2={C.y} stroke="#c7d2fe" strokeWidth={2} />
                          <line x1={B.x} y1={B.y} x2={D.x} y2={D.y} stroke="#c7d2fe" strokeWidth={2} />
                        </g>
                      )}

                      {/* Lados */}
                      <polygon points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`} fill="#3b82f60d" stroke="#2563eb" strokeWidth={3} />

                      {/* Arcos de ángulo */}
                      {showAngles && (
                        <g>
                          {angleLabels.map((al, i) => (
                            <g key={i}>
                              {drawAngleArc(al.p, al.prev, al.next, 28 * arcScale, `${al.name} ${(al.val).toFixed(1)}°`)}
                            </g>
                          ))}
                        </g>
                      )}

                      {/* Etiquetas de lados */}
                      {showLengths && (
                        <g>
                          {sideLabels.map(({ from, to, name }, i) => {
                            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                            const len = dist(from, to).toFixed(1);
                            return (
                              <g key={i}>
                                <text x={mid.x} y={mid.y - 6} fontSize={12} textAnchor="middle" fill="#111827">{name}</text>
                                <text x={mid.x} y={mid.y + 10} fontSize={12} textAnchor="middle" fill="#374151">{len}</text>
                              </g>
                            );
                          })}
                        </g>
                      )}

                      {/* Vértices */}
                      {[A, B, C, D].map((p, i) => (
                        <g key={i} onPointerDown={onPointerDown(i)} className="cursor-grab active:cursor-grabbing">
                          <circle cx={p.x} cy={p.y} r={9} fill="#111827" />
                          <text x={p.x} y={p.y - 14} fontSize={12} textAnchor="middle" fill="#111827">{"ABCD"[i]}</text>
                        </g>
                      ))}
                    </svg>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-4">
                    <div className="flex items-center gap-2"><Switch checked={showGrid} onCheckedChange={setShowGrid}/> <span>Mostrar cuadrícula</span></div>
                    <div className="flex items-center gap-2"><Switch checked={snap} onCheckedChange={setSnap}/> <span>Encajar a la cuadrícula</span></div>
                    <div className="flex items-center gap-2"><Switch checked={showLengths} onCheckedChange={setShowLengths}/> <span>Longitudes</span></div>
                    <div className="flex items-center gap-2"><Switch checked={showAngles} onCheckedChange={setShowAngles}/> <span>Ángulos</span></div>
                    <div className="flex items-center gap-2"><Switch checked={showDiagonals} onCheckedChange={setShowDiagonals}/> <span>Diagonales</span></div>
                    <div className="flex items-center gap-3 w-64">
                      <span className="text-sm text-slate-600">Tamaño de arcos</span>
                      <Slider value={[arcScale]} min={0.4} max={1.4} step={0.05} onValueChange={(v) => setArcScale(v[0])}/>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Scan className="w-5 h-5"/> Clasificación</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      Tipo detectado:
                      <Badge variant="outline" className="text-base px-3 py-1 rounded-xl bg-blue-50 border-blue-200 text-blue-700">{geom.tipo}</Badge>
                    </div>
                    {geom.selfX && (
                      <div className="text-red-600 text-sm">Aviso: el cuadrilátero se cruza a sí mismo (forma de "X"). Arrastra los puntos para corregir.</div>
                    )}
                    {!geom.selfX && !geom.convex && (
                      <div className="text-amber-600 text-sm">El cuadrilátero es cóncavo.</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {propList.map((p, i) => (
                        <div key={i} className={`text-sm px-3 py-2 rounded-xl border ${p.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>{p.ok ? "✓" : "✗"} {p.label}</div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle>Acciones rápidas</CardTitle></CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={() => setPreset("Cuadrado")}>Cuadrado</Button>
                      <Button variant="secondary" onClick={() => setPreset("Rectángulo")}>Rectángulo</Button>
                      <Button variant="secondary" onClick={() => setPreset("Rombo")}>Rombo</Button>
                      <Button variant="secondary" onClick={() => setPreset("Romboide")}>Romboide</Button>
                      <Button variant="secondary" onClick={() => setPreset("Trapecio isósceles")}>Trapecio isósceles</Button>
                      <Button variant="secondary" onClick={() => setPreset("Trapecio rectángulo")}>Trapecio rectángulo</Button>
                      <Button variant="secondary" onClick={() => setPreset("Deltoide (cometa)")}>Deltoide</Button>
                      <Button variant="secondary" onClick={() => setPreset("Trapezoide")}>Trapezoide</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button onClick={randomize} className=""><RefreshCw className="w-4 h-4 mr-2"/>Aleatorio</Button>
                      <Button onClick={downloadPNG} variant="outline"><Download className="w-4 h-4 mr-2"/>Descargar PNG</Button>
                      <Button onClick={makeParallelogram} variant="outline">Forzar paralelogramo</Button>
                      <Button onClick={makeTrapecioAB_CD} variant="outline">Forzar trapecio (AB ∥ CD)</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ================= TEORIA ================= */}
          <TabsContent value="teoria">
            <Card>
              <CardHeader className="pb-1"><CardTitle>Resumen visual de teoría</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-700">Un <b>cuadrilátero</b> es un polígono de cuatro lados. La suma de sus ángulos interiores siempre es <b>360°</b>. Según sus lados y ángulos, se clasifican en: <b>cuadrado</b>, <b>rectángulo</b>, <b>rombo</b>, <b>romboide</b> (paralelogramo no regular), <b>trapecio</b> (un par de lados paralelos), <b>trapezoide</b> (ninguno paralelo) y <b>deltoide</b> (cometa).</p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-3 rounded-2xl border bg-white">
                    <h3 className="font-semibold mb-2">Teoremas y propiedades clave</h3>
                    <ul className="list-disc pl-5 space-y-1 text-slate-700">
                      <li><b>Suma de ángulos:</b> A + B + C + D = 360°.</li>
                      <li><b>Paralelogramos:</b> lados opuestos paralelos, ángulos consecutivos suplementarios (180°), diagonales se bisecan.</li>
                      <li><b>Cuadrado:</b> 4 lados iguales y 4 ángulos rectos; diagonales iguales y perpendiculares.</li>
                      <li><b>Rectángulo:</b> 4 ángulos rectos; diagonales iguales.</li>
                      <li><b>Rombo:</b> 4 lados iguales; diagonales perpendiculares.</li>
                      <li><b>Trapecio isósceles:</b> lados no paralelos iguales; ángulos de la misma base iguales; diagonales iguales.</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-2xl border bg-white">
                    <h3 className="font-semibold mb-2">Fórmulas útiles</h3>
                    <ul className="list-disc pl-5 space-y-1 text-slate-700">
                      <li><b>Perímetro:</b> P = AB + BC + CD + DA.</li>
                      <li><b>Área (coordenadas):</b> fórmula del zapatero (shoelace).</li>
                      <li><b>Paralelismo:</b> vectores paralelos si el ángulo entre ellos es 0° o 180°.</li>
                      <li><b>Perpendicularidad:</b> producto punto = 0 (ángulo 90°).</li>
                    </ul>
                  </div>
                </div>

                <div className="p-3 rounded-2xl border bg-white">
                  <h3 className="font-semibold mb-2">Cómo usar el laboratorio</h3>
                  <ol className="list-decimal pl-5 space-y-1 text-slate-700">
                    <li>Arrastra los vértices A, B, C y D para dar forma al cuadrilátero.</li>
                    <li>Activa/oculta cuadrícula, longitudes, ángulos y diagonales según lo necesites.</li>
                    <li>Usa los presets para ver casos canónicos.</li>
                    <li>Observa la <b>clasificación automática</b> y qué propiedades se cumplen (✓).</li>
                    <li>Descarga una imagen PNG de tu figura para pegarla en tu informe.</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= DATOS ================= */}
          <TabsContent value="datos">
            <Card>
              <CardHeader className="pb-1"><CardTitle>Medidas y cálculos</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="p-3 rounded-2xl border bg-white">
                  <h3 className="font-semibold mb-2">Lados</h3>
                  <ul className="text-slate-700 grid grid-cols-2 gap-y-1">
                    <li>AB = {geom.sides[0].toFixed(2)}</li>
                    <li>BC = {geom.sides[1].toFixed(2)}</li>
                    <li>CD = {geom.sides[2].toFixed(2)}</li>
                    <li>DA = {geom.sides[3].toFixed(2)}</li>
                  </ul>
                  <div className="mt-2 text-slate-700">Perímetro: <b>{geom.perimetro.toFixed(2)}</b></div>
                </div>
                <div className="p-3 rounded-2xl border bg-white">
                  <h3 className="font-semibold mb-2">Ángulos</h3>
                  <ul className="text-slate-700 grid grid-cols-2 gap-y-1">
                    <li>∠A = {geom.angulos[0].toFixed(1)}°</li>
                    <li>∠B = {geom.angulos[1].toFixed(1)}°</li>
                    <li>∠C = {geom.angulos[2].toFixed(1)}°</li>
                    <li>∠D = {geom.angulos[3].toFixed(1)}°</li>
                  </ul>
                  <div className="mt-2 text-slate-700">Suma: <b>{geom.sumAng.toFixed(1)}°</b></div>
                </div>
                <div className="p-3 rounded-2xl border bg-white">
                  <h3 className="font-semibold mb-2">Diagonales</h3>
                  <ul className="text-slate-700 grid grid-cols-2 gap-y-1">
                    <li>AC = {geom.diagAC.toFixed(2)}</li>
                    <li>BD = {geom.diagBD.toFixed(2)}</li>
                  </ul>
                  <div className="mt-2 text-slate-700">¿Perpendiculares? <b>{geom.diagonalsPerp ? "Sí" : "No"}</b></div>
                  <div className="text-slate-700">¿Iguales? <b>{geom.diagonalsEq ? "Sí" : "No"}</b></div>
                </div>
                <div className="p-3 rounded-2xl border bg-white">
                  <h3 className="font-semibold mb-2">Área</h3>
                  <div className="text-slate-700">Área (shoelace): <b>{geom.area.toFixed(2)}</b> unidades²</div>
                  <div className="text-slate-700 mt-2">Convexidad: <b>{geom.selfX ? "Autointersecado" : geom.convex ? "Convexo" : "Cóncavo"}</b></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
