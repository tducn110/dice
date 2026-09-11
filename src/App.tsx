import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useWinkIntegration } from "./integrations/wink/useWinkIntegration"
import { preloadCriticalResources, preloadNonCriticalResources } from "./utils/game-loader";
import { completeGameLoading, onGameLoadingDismiss, setGameLoadingProgress } from "./utils/loading-controller";


// ─── PIXEL ART CURSOR ────────────────────────────────────────────────────────
// 0=transparent  1=outline(dark)  2=fill(light)
const ARROW_MAP = [
  [1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0],
  [1, 2, 1, 0, 0, 0, 0],
  [1, 2, 2, 1, 0, 0, 0],
  [1, 2, 2, 2, 1, 0, 0],
  [1, 2, 2, 2, 2, 1, 0],
  [1, 2, 2, 2, 2, 2, 1],
  [1, 2, 2, 2, 2, 1, 0],
  [1, 2, 2, 1, 1, 0, 0],
  [1, 2, 1, 0, 0, 0, 0],
  [1, 1, 0, 0, 0, 0, 0],
]

function PixelCursor({
  scale = 3,
  clicking = false,
  outline = "#111111",
  fill = "#f4f0d8",
}: {
  scale?: number
  clicking?: boolean
  outline?: string
  fill?: string
}) {
  const W = 7 * scale,
    H = 11 * scale
  const dy = clicking ? scale : 0
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", imageRendering: "pixelated" }}
    >
      {ARROW_MAP.map((row, r) =>
        row.map((v, c) =>
          v === 0 ? null : (
            <rect
              key={`${r}-${c}`}
              x={c * scale}
              y={r * scale + dy}
              width={scale}
              height={scale}
              fill={v === 1 ? outline : fill}
            />
          ),
        ),
      )}
    </svg>
  )
}

// ─── DICE DOT MAPS ───────────────────────────────────────────────────────────
const DOTS: Record<number, [number, number][]> = {
  0: [],
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 22],
    [72, 22],
    [28, 50],
    [72, 50],
    [28, 78],
    [72, 78],
  ],
}
const OPP: Record<number, number> = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1 }
function getAdj(top: number): [number, number] {
  const av = [1, 2, 3, 4, 5, 6].filter((v) => v !== top && v !== OPP[top])
  return [av[0] ?? 2, av[1] ?? 3]
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Phase = "idle" | "rolling" | "bouncing"
type Tier = "basic" | "bronze" | "silver" | "gold" | "cursed"

const FC: Record<Tier, {
  top: string
  right: string
  left: string
  dot: string
  ds: string
  stroke: string
}> = {
  basic: {
    top: "#f9f9f9",
    right: "#c4c4c4",
    left: "#949494",
    dot: "#1a1a2e",
    ds: "#2a2a3e",
    stroke: "#707070",
  },
  bronze: {
    top: "#ffd090",
    right: "#b86820",
    left: "#7a4010",
    dot: "#2a1200",
    ds: "#3a1a00",
    stroke: "#804010",
  },
  silver: {
    top: "#ddeeff",
    right: "#7888c0",
    left: "#4858a0",
    dot: "#0a0a3e",
    ds: "#1a1a4e",
    stroke: "#5060a0",
  },
  gold: {
    top: "#fff480",
    right: "#c89800",
    left: "#7a5800",
    dot: "#2a1a00",
    ds: "#3a2000",
    stroke: "#b08000",
  },
  cursed: {
    top: "#1e0808",
    right: "#130404",
    left: "#090202",
    dot: "#ff3333",
    ds: "#bb1111",
    stroke: "#550000",
  },
}

interface Die {
  id: number
  slot: number
  value: number
  phase: Phase
  tier: Tier
  crit: boolean
  autoFlash: boolean
}

interface FloatText {
  id: number
  x: number
  y: number
  text: string
  color: string
  big?: boolean
}

// ─── SLOT POSITIONS (% of table W/H) ─────────────────────────────────────────
const SLOTS: [number, number][] = [
  [0.5, 0.45],
  [0.28, 0.35],
  [0.72, 0.35],
  [0.5, 0.7],
  [0.16, 0.6],
  [0.84, 0.6],
  [0.16, 0.28],
  [0.84, 0.28],
  [0.5, 0.18],
  [0.33, 0.78],
  [0.67, 0.78],
  [0.1, 0.45],
  [0.9, 0.45],
]

// Die purchase cost per index (ownedCount - 1 → 0-based)
const DIE_COSTS = [
  30, 100, 350, 1100, 3500, 11000, 35000, 110000, 350000, 1100000, 3500000,
  11000000,
]

// ─── UPGRADES ─────────────────────────────────────────────────────────────────
interface Upg {
  id: string
  name: string
  tag: string
  costs: number[]
  labels: string[]
}
const UPGRADES: Upg[] = [
  // ROLL (0-4)
  {
    id: "multiplier",
    name: "VALUE BOOST",
    tag: "MULT",
    costs: [25, 80, 220, 600, 1500, 4000],
    labels: ["x2", "x3", "x4", "x5", "x6", "x7"],
  },
  {
    id: "lucky",
    name: "LUCKY FACE",
    tag: "LUCK",
    costs: [100, 350, 900],
    labels: ["+20% high", "+40% high", "+60% high"],
  },
  {
    id: "crit",
    name: "CRIT HIT",
    tag: "CRIT",
    costs: [150, 420, 950, 2400],
    labels: ["15% x3", "30% x3", "50% x3", "70% x3"],
  },
  {
    id: "echo",
    name: "ECHO ROLL",
    tag: "ECHO",
    costs: [200, 600, 1500],
    labels: ["20% on 6", "40% on 6", "65% on 6"],
  },
  {
    id: "chain",
    name: "CHAIN LINK",
    tag: "CHNK",
    costs: [130, 420, 1100],
    labels: ["+30% match", "+60% match", "+100% match"],
  },
  // AUTO (5-9)
  {
    id: "autoRoll",
    name: "AUTO ROLLER",
    tag: "AUTO",
    costs: [150, 500, 1400, 3500],
    labels: ["1 roller", "2 rollers", "3 rollers", "5 rollers"],
  },
  {
    id: "rollSpeed",
    name: "ROLL SPEED",
    tag: "SPDD",
    costs: [80, 250, 700, 1800, 4500],
    labels: ["7s", "5s", "3s", "2s", "1s"],
  },
  {
    id: "heat",
    name: "HEAT METER",
    tag: "HEAT",
    costs: [260, 750, 1900],
    labels: ["20 fills", "13 fills", "8 fills"],
  },
  {
    id: "rarity",
    name: "RARITY UP",
    tag: "RARE",
    costs: [200, 850, 3200, 8000],
    labels: ["bronze", "silver", "gold", "more gold"],
  },
  {
    id: "jackpotAmp",
    name: "JACKPOT AMP",
    tag: "JKPT",
    costs: [500, 1600, 4500],
    labels: ["x1.5 jackpot", "x2 jackpot", "x3 jackpot"],
  },
  // GUARD (10-14)
  {
    id: "lock",
    name: "COMBO LOCK",
    tag: "LOCK",
    costs: [300, 900, 2200],
    labels: ["5 rolls", "7 rolls", "immune"],
  },
  {
    id: "ward",
    name: "CURSE WARD",
    tag: "WARD",
    costs: [250, 700, 1800],
    labels: ["-50% dmg", "-80% dmg", "immune"],
  },
  {
    id: "polish",
    name: "DICE POLISH",
    tag: "PLSH",
    costs: [180, 520, 1300],
    labels: ["-200ms roll", "-350ms roll", "-500ms roll"],
  },
  {
    id: "floor",
    name: "VALUE FLOOR",
    tag: "FLOR",
    costs: [350, 1100, 3000],
    labels: ["min 2", "min 3", "min 4"],
  },
  {
    id: "heatBoost",
    name: "HEAT BOOST",
    tag: "HBST",
    costs: [400, 1200, 3500],
    labels: ["fills faster", "2x fill", "3x fill"],
  },
]

const TABS = ["ROLL", "AUTO", "GUARD"] as const
type Tab = typeof TABS[number]
const TAB_SLICE: Record<Tab, [number, number]> = {
  ROLL: [0, 5],
  AUTO: [5, 10],
  GUARD: [10, 15],
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
let uid = 0
let rollSeq = 0 // global roll counter (for curse every 15th)

function rollVal(luckyLevel: number, floor: number): number {
  const r = Math.random()
  let v: number
  if (luckyLevel === 0) v = Math.ceil(r * 6)
  else {
    const bias = [0.4, 0.55, 0.72][luckyLevel - 1] ?? 0.72
    v = r < bias ? (Math.random() < 0.5 ? 5 : 6) : Math.ceil(Math.random() * 4)
  }
  return Math.max(v, floor)
}

function pickTier(rarityLevel: number, isCursed: boolean): Tier {
  if (isCursed) return "cursed"
  const r = Math.random()
  if (rarityLevel >= 4 && r < 0.18) return "gold"
  if (rarityLevel >= 3 && r < 0.15) return "gold"
  if (rarityLevel >= 2 && r < 0.28) return "silver"
  if (rarityLevel >= 1 && r < 0.45) return "bronze"
  return "basic"
}

function fmt(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${Math.floor(n)}`
}

// ─── ISO DICE COMPONENT ───────────────────────────────────────────────────────
function IsoDice({
  value,
  tier,
  fs = 42,
  crit = false,
  hovered = false,
  flash = false,
}: {
  value: number
  tier: Tier
  fs?: number
  crit?: boolean
  hovered?: boolean
  flash?: boolean
}) {
  const W = fs * 2,
    H = fs * 2,
    c = FC[tier]
  const [rv, lv] = value > 0 ? getAdj(value) : [2, 3]
  const r = fs * 0.088,
    dv = (p: number) => (p / 100) * fs
  const A = [fs, 0],
    B = [W, fs / 2],
    C = [fs, fs],
    D = [0, fs / 2]
  const E = [W, H - fs / 2],
    F = [fs, H],
    G = [0, H - fs / 2]
  const ln = (p1: number[], p2: number[], k: string) => (
    <line key={k} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} />
  )
  interface DotsProps {
    dots: [number, number][]
    op?: number
  }
  const Dots = ({ dots, op = 1 }: DotsProps) => (
    <>
      {dots.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={dv(cx)}
          cy={dv(cy)}
          r={r}
          fill={c.dot}
          opacity={op}
        />
      ))}
    </>
  )
  const topColor = flash ? "#c8ffc8" : hovered ? "#e0f5e0" : c.top
  const edgeColor = crit
    ? "#ff6600"
    : tier === "cursed"
      ? "#ff2222"
      : tier === "gold"
        ? "#d4a000"
        : c.stroke

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block" }}
    >
      {flash && <rect width={W} height={H} fill="rgba(100,255,100,0.08)" />}
      {crit && <rect width={W} height={H} fill="rgba(255,80,0,0.07)" />}
      {/* Left face */}
      <g transform={`matrix(1 0.5 0 1 0 ${fs / 2})`}>
        <rect width={fs} height={fs} fill={c.left} />
        {value > 0 && <Dots dots={DOTS[lv] || []} op={0.52} />}
      </g>
      {/* Right face */}
      <g transform={`matrix(1 -0.5 0 1 ${fs} ${fs})`}>
        <rect width={fs} height={fs} fill={c.right} />
        {value > 0 && <Dots dots={DOTS[rv] || []} op={0.7} />}
      </g>
      {/* Top face */}
      <g transform={`matrix(1 0.5 -1 0.5 ${fs} 0)`}>
        <rect width={fs} height={fs} fill={topColor} />
        {value === 0 ? (
          <text
            x={fs / 2}
            y={fs / 2 + 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={c.dot}
            fontSize={fs * 0.38}
            fontFamily="Oswald,sans-serif"
            fontWeight="700"
          >
            ?
          </text>
        ) : (
          <Dots dots={DOTS[value] || []} op={1} />
        )}
      </g>
      {/* Edges */}
      <g
        stroke={edgeColor}
        strokeWidth={crit || tier === "cursed" ? "1.5" : "1"}
        fill="none"
        opacity="0.62"
      >
        {ln(A, B, "ab")}
        {ln(B, C, "bc")}
        {ln(C, D, "cd")}
        {ln(D, A, "da")}
        {ln(B, E, "be")}
        {ln(C, F, "cf")}
        {ln(D, G, "dg")}
        {ln(E, F, "ef")}
        {ln(F, G, "fg")}
      </g>
      {tier === "gold" && (
        <g stroke="#ffd700" strokeWidth="1.8" fill="none" opacity="0.5">
          {ln(A, B, "ga")}
          {ln(B, C, "gb")}
          {ln(C, D, "gc")}
          {ln(D, A, "gd")}
        </g>
      )}
      {tier === "cursed" && (
        <g stroke="#ff0000" strokeWidth="1.5" fill="none" opacity="0.55">
          {ln(A, B, "ca")}
          {ln(B, C, "cb")}
          {ln(C, D, "cc")}
          {ln(D, A, "cd2")}
        </g>
      )}
    </svg>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  // Unified PapaStudio loading screen lifecycle barrier
  useEffect(() => {
    setGameLoadingProgress(25);
    const criticalPromise = preloadCriticalResources((pct) => {
      setGameLoadingProgress(Math.min(95, pct));
    });
    void Promise.allSettled([criticalPromise]).then(() => {
      completeGameLoading();
    });
    const unbind = onGameLoadingDismiss(() => {
      preloadNonCriticalResources();
    });
    return unbind;
  }, []);

  const { t, i18n } = useTranslation()
  const currentLanguage = i18n.resolvedLanguage?.startsWith("en") ? "en" : "vi"
  const nextLanguage = currentLanguage === "vi" ? "en" : "vi"
  const [money, setMoney] = useState(0)
  const [totalEarned, setTotalEarned] = useState(0)
  const wink = useWinkIntegration()
  const roundStartedRef = useRef(false)
  const lastSubmittedScoreRef = useRef(0)

  useEffect(() => {
    if (totalEarned > lastSubmittedScoreRef.current + 500) {
      lastSubmittedScoreRef.current = totalEarned
      wink.submitFinalScore({ score: Math.floor(totalEarned) })
    }
  }, [totalEarned, wink])

  useEffect(() => {
    return () => {
      if (roundStartedRef.current) {
        wink.gameplayStop()
        roundStartedRef.current = false
      }
    }
  }, [wink])
  const [dice, setDice] = useState<Die[]>([
    {
      id: uid++,
      slot: 0,
      value: 0,
      phase: "idle",
      tier: "basic",
      crit: false,
      autoFlash: false,
    },
  ])
  const [floats, setFloats] = useState<FloatText[]>([])
  const [upgLvl, setUpgLvl] = useState<Record<string, number>>(
    Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
  )
  const [streak, setStreak] = useState(0)
  const [heatLevel, setHeatLevel] = useState(0)
  const [heatExploding, setHeatExploding] = useState(false)
  const [jackpotActive, setJackpotActive] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [coldStreak, setColdStreak] = useState(0)
  const [coldDebuffEnd, setColdDebuffEnd] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>("ROLL")
  const [prestigeBonus, setPrestigeBonus] = useState(0)
  const [prestigeCount, setPrestigeCount] = useState(0)
  const [tick, setTick] = useState(0)
  const [cursorPos, setCursorPos] = useState({ x: -200, y: -200 })
  const [cursorClick, setCursorClick] = useState(false)
  const [autoCursors, setAutoCursors] = useState<{
    id: number
    x: number
    y: number
  }[]>([])

  const tableRef = useRef<HTMLDivElement>(null)
  const dieElsRef = useRef<Record<number, HTMLDivElement | null>>({}) // DOM refs per die

  // Mutable snapshot refs
  const upgRef = useRef(upgLvl)
  upgRef.current = upgLvl
  const streakRef = useRef(streak)
  streakRef.current = streak
  const heatRef = useRef(heatLevel)
  heatRef.current = heatLevel
  const moneyRef = useRef(money)
  moneyRef.current = money
  const diceRef = useRef(dice)
  diceRef.current = dice
  const coldRef = useRef(coldStreak)
  coldRef.current = coldStreak
  const debuffRef = useRef(coldDebuffEnd)
  debuffRef.current = coldDebuffEnd
  const presRef = useRef(prestigeBonus)
  presRef.current = prestigeBonus
  const rollDieRef = useRef<(
    id: number,
    isAuto?: boolean,
    isEcho?: boolean,
  ) => void>(() => {})

  // ── float helper ─────────────────────────────────────────────────────────
  const addFloat = useCallback(
    (x: number, y: number, text: string, color: string, big = false) => {
      const id = uid++
      setFloats((p) => [...p, { id, x, y, text, color, big }])
      setTimeout(() => setFloats((p) => p.filter((f) => f.id !== id)), 1600)
    },
    [],
  )

  // get a die's pixel centre on the table
  interface Pos {
    x: number
    y: number
  }
  const getDiePos = (dieId: number): Pos | null => {
    const el = dieElsRef.current[dieId]
    const tb = tableRef.current
    if (!el || !tb) return null
    const er = el.getBoundingClientRect(),
      tr = tb.getBoundingClientRect()
    return {
      x: er.left - tr.left + er.width / 2,
      y: er.top - tr.top + er.height / 2,
    }
  }

  // ── heat burst ───────────────────────────────────────────────────────────
  const triggerHeatBurst = useCallback(() => {
    const mult = (1 + upgRef.current.multiplier) * (1 + presRef.current)
    const bonus = 80 * mult
    setMoney((m) => m + bonus)
    setTotalEarned((t) => t + bonus)
    setHeatLevel(0)
    heatRef.current = 0
    setHeatExploding(true)
    setShaking(true)
    if (tableRef.current) {
      const { width, height } = tableRef.current.getBoundingClientRect()
      addFloat(
        width / 2,
        height / 3,
        `HEAT BURST  +${fmt(bonus)}`,
        "#ff8800",
        true,
      )
    }
    setTimeout(() => {
      setHeatExploding(false)
      setShaking(false)
    }, 1400)
  }, [addFloat])

  // ── ROLL DIE ─────────────────────────────────────────────────────────────
  const rollDie = useCallback(
    (dieId: number, isAuto = false, isEcho = false) => {
      if (wink.hostPaused) return
      if (!roundStartedRef.current) {
        wink.gameplayStart()
        roundStartedRef.current = true
      }
      const die = diceRef.current.find((d) => d.id === dieId)
      if (!die || die.phase !== "idle") return

      const lvls = upgRef.current
      const mult = (1 + lvls.multiplier) * (1 + presRef.current)
      const critC = [0, 0.15, 0.3, 0.5, 0.7][Math.min(lvls.crit, 4)]
      const echoC = [0, 0.2, 0.4, 0.65][Math.min(lvls.echo, 3)]
      const chainM = [0, 0.3, 0.6, 1.0][Math.min(lvls.chain, 3)]
      const heatPR =
        lvls.heat > 0
          ? (100 / [20, 13, 8][lvls.heat - 1]) *
            ([1, 2, 3][Math.min(lvls.heatBoost, 2)] || 1)
          : 0
      const wardD = [0, 0.5, 0.8, 1.0][Math.min(lvls.ward, 3)]
      const coldTh =
        lvls.lock >= 3 ? Infinity : [4, 5, 7][Math.min(lvls.lock, 2)]
      const floorV = [0, 2, 3, 4][Math.min(lvls.floor, 3)]
      const rollMs = 960 - [0, 200, 350, 500][Math.min(lvls.polish, 3)]

      // Every 15th roll globally is cursed
      rollSeq++
      const isCursed = rollSeq % 15 === 0
      const tier = pickTier(lvls.rarity, isCursed)
      const value = rollVal(lvls.lucky, isCursed ? 1 : floorV)
      const crit = !isCursed && Math.random() < critC

      // Auto-cursor flash at die position (screen coords for fixed-position render)
      if (isAuto) {
        const el = dieElsRef.current[dieId]
        if (el) {
          const er = el.getBoundingClientRect()
          const acId = uid++
          setAutoCursors((p) => [
            ...p,
            {
              id: acId,
              x: er.left + er.width / 2 - 10,
              y: er.top + er.height / 2 - 8,
            },
          ])
          setTimeout(
            () => setAutoCursors((p) => p.filter((c) => c.id !== acId)),
            750,
          )
        }
      }

      // Kick animation
      setDice((p) =>
        p.map((d) =>
          d.id === dieId ? { ...d, phase: "rolling", autoFlash: isAuto } : d,
        ),
      )

      setTimeout(
        () =>
          setDice((p) =>
            p.map((d) =>
              d.id === dieId
                ? { ...d, phase: "bouncing", value, tier, crit }
                : d,
            ),
          ),
        420,
      )

      setTimeout(
        () => {
          setDice((p) =>
            p.map((d) =>
              d.id === dieId ? { ...d, phase: "idle", autoFlash: false } : d,
            ),
          )

          const pos = getDiePos(dieId)
          const px = pos?.x ?? 200,
            py = pos?.y ?? 200

          // ── cursed roll ──
          if (tier === "cursed") {
            const deduct = value * mult * (1 - wardD)
            if (deduct > 0) {
              setMoney((m) => Math.max(0, m - deduct))
              addFloat(px, py - 16, `-${fmt(deduct)}`, "#ff3333")
            } else {
              addFloat(px, py - 16, "WARDED", "#4aaa4a")
            }
            return
          }

          // ── base earnings ──
          let earned = value * mult * (crit ? 3 : 1)

          // ── cold streak ──
          let newCold = coldRef.current
          if (value <= 2) {
            newCold++
            setColdStreak(newCold)
            coldRef.current = newCold
          } else {
            newCold = 0
            setColdStreak(0)
            coldRef.current = 0
          }
          if (newCold >= coldTh && lvls.lock < 3) {
            const end = Date.now() + 12000
            setColdDebuffEnd(end)
            debuffRef.current = end
            setColdStreak(0)
            coldRef.current = 0
            addFloat(px, py - 55, "COLD STREAK  -50%", "#60a0ff", true)
            setShaking(true)
            setTimeout(() => setShaking(false), 500)
          }
          const isDebuffed = debuffRef.current > Date.now()
          if (isDebuffed) earned *= 0.5

          // ── chain bonus ──
          let bonus = 0
          if (chainM > 0) {
            const others = diceRef.current.filter(
              (d) =>
                d.id !== dieId &&
                d.phase === "idle" &&
                d.value === value &&
                d.tier !== "cursed",
            )
            if (others.length > 0) {
              bonus = value * mult * chainM * others.length
              addFloat(
                px,
                py - 38,
                `CHAIN x${others.length + 1}  +${fmt(bonus)}`,
                "#f59e0b",
              )
            }
          }

          // ── jackpot: roll 6 and 2+ other dice already show 6 ──
          if (value === 6) {
            const sixCount = diceRef.current.filter(
              (d) => d.id !== dieId && d.value === 6 && d.tier !== "cursed",
            ).length
            if (sixCount >= 2) {
              const jAmp = [1, 1.5, 2, 3][Math.min(lvls.jackpotAmp, 3)]
              const jBonus = 120 * mult * jAmp
              bonus += jBonus
              setJackpotActive(true)
              setShaking(true)
              addFloat(px, py - 75, `JACKPOT  +${fmt(jBonus)}`, "#ffd700", true)
              setTimeout(() => {
                setJackpotActive(false)
                setShaking(false)
              }, 2200)
            }
          }

          // ── streak ──
          if (value >= 5) {
            const ns = streakRef.current + 1
            setStreak(ns)
            streakRef.current = ns
            if (ns >= 5) {
              bonus += ns * mult * 2
              addFloat(
                px,
                py - 50,
                `STREAK x${ns}  +${fmt(ns * mult * 2)}`,
                "#a78bfa",
              )
            }
          } else {
            setStreak(0)
            streakRef.current = 0
          }

          // ── heat ──
          if (heatPR > 0 && value >= 5) {
            const prev = heatRef.current,
              next = Math.min(100, prev + heatPR)
            setHeatLevel(next)
            heatRef.current = next
            if (next >= 100 && prev < 100) triggerHeatBurst()
          }

          // ── crit float ──
          if (crit) addFloat(px, py - 22, "CRIT  x3", "#ff6600")

          const total = earned + bonus
          setMoney((m) => m + total)
          setTotalEarned((t) => t + total)

          const color =
            value === 6 ? "#ffd700" : value >= 4 ? "#86efac" : "#a0c0a0"
          addFloat(px, py - 14, `+${fmt(total)}`, color)

          // ── echo ──
          if (!isEcho && value === 6 && Math.random() < echoC) {
            addFloat(px, py - 34, "ECHO", "#86efac")
            setTimeout(() => rollDieRef.current(dieId, false, true), 1600)
          }
        },
        rollMs,
      )
    },
    [addFloat, triggerHeatBurst],
  )
  rollDieRef.current = rollDie

  // ── auto-roller ──────────────────────────────────────────────────────────
  useEffect(() => {
    const count = [0, 1, 2, 3, 5][Math.min(upgLvl.autoRoll, 4)]
    if (count === 0) return
    const ms = [10000, 7000, 5000, 3000, 2000, 1000][
      Math.min(upgLvl.rollSpeed, 5)
    ]

    const t = setInterval(() => {
      if (wink.hostPaused) return
      const idle = diceRef.current.filter((d) => d.phase === "idle")
      if (idle.length === 0) return
      // shuffle and pick up to `count` dice
      const picks = idle.sort(() => Math.random() - 0.5).slice(0, count)
      picks.forEach((d, i) =>
        setTimeout(() => rollDieRef.current(d.id, true), i * 120),
      )
    }, ms)
    return () => clearInterval(t)
  }, [upgLvl.autoRoll, upgLvl.rollSpeed])

  // ── tick for cold-debuff visual refresh ─────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // ── cursor tracking ──────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) =>
      setCursorPos({ x: e.clientX, y: e.clientY })
    const onDown = () => setCursorClick(true)
    const onUp = () => setCursorClick(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mousedown", onDown)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  // ── buy a new die ────────────────────────────────────────────────────────
  const buyDie = useCallback(() => {
    const owned = diceRef.current.length
    if (owned >= SLOTS.length) return
    const cost = DIE_COSTS[owned - 1]
    if (moneyRef.current < cost) return
    setMoney((m) => m - cost)
    setDice((p) => [
      ...p,
      {
        id: uid++,
        slot: owned,
        value: 0,
        phase: "idle",
        tier: "basic",
        crit: false,
        autoFlash: false,
      },
    ])
  }, [])

  // ── buy upgrade ──────────────────────────────────────────────────────────
  const buyUpgrade = useCallback(
    (id: string) => {
      const def = UPGRADES.find((u) => u.id === id)!
      const lv = upgLvl[id]
      if (lv >= def.costs.length) return
      const cost = def.costs[lv]
      if (moneyRef.current < cost) return
      setMoney((m) => m - cost)
      setUpgLvl((ul) => ({ ...ul, [id]: ul[id] + 1 }))
    },
    [upgLvl],
  )

  // ── prestige ─────────────────────────────────────────────────────────────
  const doPrestige = () => {
    setMoney(0)
    setTotalEarned(0)
    setStreak(0)
    setColdStreak(0)
    setColdDebuffEnd(0)
    setHeatLevel(0)
    setUpgLvl(Object.fromEntries(UPGRADES.map((u) => [u.id, 0])))
    setPrestigeCount((p) => p + 1)
    setPrestigeBonus((b) => {
      presRef.current = b + 0.5
      return b + 0.5
    })
    setDice([
      {
        id: uid++,
        slot: 0,
        value: 0,
        phase: "idle",
        tier: "basic",
        crit: false,
        autoFlash: false,
      },
    ])
    rollSeq = 0
  }

  // ── derived ──────────────────────────────────────────────────────────────
  const ownedCount = dice.length
  const nextDieCost = DIE_COSTS[ownedCount - 1]
  const canBuyDie = ownedCount < SLOTS.length && money >= nextDieCost
  const effectiveMult = (1 + upgLvl.multiplier) * (1 + prestigeBonus)
  const rollerCount = [0, 1, 2, 3, 5][Math.min(upgLvl.autoRoll, 4)]
  const rollInterval = [10, 7, 5, 3, 2, 1][Math.min(upgLvl.rollSpeed, 5)]
  const isDebuffed = coldDebuffEnd > Date.now() && tick >= 0
  const PRESTIGE_REQ = [5000, 30000, 180000, 1000000]
  const canPrestige = totalEarned >= PRESTIGE_REQ[Math.min(prestigeCount, 3)]

  return (
    <>
      <div
        className={[
          "game-root",
          shaking ? "shake" : "",
          isDebuffed ? "cold-debuff" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* ── HUD ── */}
        <header className="hud">
          <div className="hud-left">
            <div className="money-display">{fmt(money)}</div>
            <div className="hud-sub">total {fmt(totalEarned)}</div>
            {prestigeCount > 0 && (
              <div className="prestige-badge">
                P{prestigeCount} +{prestigeBonus.toFixed(1)}x
              </div>
            )}
          </div>

          <div className="hud-center">
            {upgLvl.heat > 0 && (
              <div className="heat-wrap">
                <span className="heat-label">HEAT</span>
                <div className={`heat-bar${heatExploding ? " exploding" : ""}`}>
                  <div
                    className="heat-fill"
                    style={{ width: `${heatLevel}%` }}
                  />
                  {heatLevel >= 88 && <div className="heat-pulse" />}
                </div>
                <span className="heat-pct">{Math.floor(heatLevel)}%</span>
              </div>
            )}
            <div className="hud-badges">
              {streak >= 3 && (
                <span className="badge badge-streak">STREAK x{streak}</span>
              )}
              {isDebuffed && (
                <span className="badge badge-cold">COLD -50%</span>
              )}
              {coldStreak >= 2 && !isDebuffed && (
                <span className="badge badge-coldwarn">cold x{coldStreak}</span>
              )}
            </div>
          </div>

          <div className="hud-right">
            <button
              className="hud-pill"
              type="button"
              aria-label={t("settings.language")}
              onClick={() => void i18n.changeLanguage(nextLanguage)}
            >
              {nextLanguage.toUpperCase()}
            </button>
            <div className="hud-pill">x{effectiveMult.toFixed(1)}</div>
            <div className="hud-pill">{ownedCount} dice</div>
            {rollerCount > 0 && (
              <div className="hud-pill hud-pill-active">
                {rollerCount} auto / {rollInterval}s
              </div>
            )}
            {canPrestige && (
              <button className="prestige-btn" onClick={doPrestige}>
                PRESTIGE&nbsp;<span className="prestige-gain">+0.5x</span>
              </button>
            )}
          </div>
        </header>

        {/* ── TABLE ── */}
        <div ref={tableRef} className="table-area">
          {/* Owned dice */}
          {dice.map((d) => {
            const [sx, sy] = SLOTS[d.slot]
            return (
              <div
                key={d.id}
                ref={(el) => {
                  dieElsRef.current[d.id] = el
                }}
                className={[
                  "die-slot",
                  d.phase === "idle" && d.value > 0 ? "die-ready" : "",
                  d.phase === "rolling" ? "die-busy rolling-anim" : "",
                  d.phase === "bouncing" ? "die-busy die-bounce" : "",
                  d.tier === "gold" ? "die-gold" : "",
                  d.tier === "cursed" ? "die-cursed" : "",
                  d.autoFlash ? "die-auto" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  left: `calc(${sx * 100}% - 42px)`,
                  top: `calc(${sy * 100}% - 56px)`,
                }}
                onClick={() => rollDie(d.id)}
              >
                <IsoDice
                  value={d.value}
                  tier={d.tier}
                  fs={42}
                  crit={d.crit}
                  flash={d.autoFlash}
                />
                {d.phase === "rolling" && (
                  <div className="die-spinning-overlay" />
                )}
                {d.phase === "idle" && d.value === 0 && (
                  <div className="die-tap-hint">CLICK</div>
                )}
                {d.phase === "idle" && d.value > 0 && (
                  <div className="die-value-label">{d.value}</div>
                )}
              </div>
            )
          })}

          {/* Floating texts */}
          {floats.map((f) => (
            <div
              key={f.id}
              className={`float-text${f.big ? " float-big" : ""}`}
              style={{ left: f.x, top: f.y, color: f.color }}
            >
              {f.text}
            </div>
          ))}

          {/* Jackpot overlay */}
          {jackpotActive && (
            <div className="jackpot-overlay">
              <div className="jackpot-text">JACKPOT</div>
            </div>
          )}
          {heatExploding && (
            <div className="heat-overlay">
              <div className="heat-burst-text">HEAT BURST</div>
            </div>
          )}

          {/* Buy Die button */}
          <div className="buy-die-area">
            {ownedCount < SLOTS.length ? (
              <button
                className={`buy-die-btn${canBuyDie ? "" : " locked"}`}
                onClick={buyDie}
                disabled={!canBuyDie}
              >
                <span className="buy-die-label">BUY DIE</span>
                <span className="buy-die-cost">{fmt(nextDieCost ?? 0)}</span>
              </button>
            ) : (
              <div className="buy-die-max">MAX DICE</div>
            )}
          </div>

          {/* Table hint */}
          <div className="table-hint">CLICK A DIE TO ROLL IT</div>
        </div>

        {/* ── SHOP ── */}
        <nav className="shop">
          <div className="shop-tabs">
            {TABS.map((tab) => (
              <button
                key={tab}
                className={`shop-tab${activeTab === tab ? " active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="shop-grid">
            {UPGRADES.slice(...TAB_SLICE[activeTab]).map((upg) => {
              const lv = upgLvl[upg.id]
              const maxed = lv >= upg.costs.length
              const cost = upg.costs[lv]
              const canAfford = !maxed && money >= cost
              return (
                <button
                  key={upg.id}
                  className={`upgrade-btn${
                    maxed ? " maxed" : canAfford ? " affordable" : ""
                  }`}
                  onClick={() => buyUpgrade(upg.id)}
                  disabled={maxed || !canAfford}
                >
                  <div className="upg-tag">{upg.tag}</div>
                  <div className="upgrade-info">
                    <div className="upgrade-name">{upg.name}</div>
                    <div className="upgrade-desc">
                      {maxed ? "MAXED" : upg.labels[lv]}
                    </div>
                  </div>
                  <div className="upgrade-right">
                    <div className="upgrade-cost">
                      {maxed ? "MAX" : fmt(cost)}
                    </div>
                    <div className="upgrade-pips">
                      {Array.from({ length: upg.costs.length }, (_, i) => (
                        <div
                          key={i}
                          className={`pip${i < lv ? " filled" : ""}`}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      {/* ── Custom pixel cursor (always visible) ── */}
      <div
        className="cursor-elem"
        style={{ transform: `translate(${cursorPos.x}px,${cursorPos.y}px)` }}
      >
        <PixelCursor clicking={cursorClick} scale={3} />
      </div>

      {/* ── Auto-roller cursor flashes (appear when auto-roller fires) ── */}
      {autoCursors.map((c) => (
        <div
          key={c.id}
          className="auto-cursor-elem"
          style={{ transform: `translate(${c.x}px,${c.y}px)` }}
        >
          <PixelCursor
            clicking={true}
            scale={3}
            outline="#004400"
            fill="#88ff88"
          />
        </div>
      ))}
    </>
  )
}