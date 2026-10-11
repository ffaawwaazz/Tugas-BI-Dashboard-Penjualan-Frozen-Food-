import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, RotateCcw, Snowflake } from "lucide-react";
import raw from "./data.json";
import styles from "./SalesDashboard.module.css";

type SaleRow = readonly [number, number, number, number, number, number, number, number];
type SalesData = { base: string; sourceFiles: string[]; customers: string[]; products: string[]; brands: string[]; units: string[]; rows: SaleRow[] };
type PublicSalesData = { base: string; pelanggan: string[]; produk: string[]; merek: string[]; satuan: string[]; rows: readonly number[][] };
const source = raw as unknown as SalesData | PublicSalesData;
const DATA: SalesData = "sourceFiles" in source ? source : {
  base: source.base,
  sourceFiles: ["Anonymized public dataset"],
  customers: source.pelanggan,
  products: source.produk,
  brands: source.merek,
  units: source.satuan,
  rows: source.rows.map(row => [row[0], row[1], row[2], row[3], row[4], row[5], row[7], row[8]] as SaleRow),
};
const MONTHS = [
  { id: 4, label: "April", short: "Apr" }, { id: 5, label: "Mei", short: "Mei" },
  { id: 6, label: "Juni", short: "Jun" }, { id: 7, label: "Juli", short: "Jul" },
  { id: 8, label: "Agustus", short: "Agu" }, { id: 9, label: "September", short: "Sep" },
];
const COLORS = ["#b5f66a", "#51d9d2", "#ff9c67", "#88a9ff", "#f4d35e", "#e98bb5"];
const WEEKDAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const WEEKDAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const START_DATE = "2020-04-01";
const END_DATE = "2020-09-30";
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const moneyAverage = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const rupiah = (amount: number) => money.format(amount).replace(/\u00a0/g, " ");
const rupiahAverage = (amount: number) => moneyAverage.format(amount).replace(/\u00a0/g, " ");
const rupiahCompact = (amount: number) => amount >= 1_000_000_000
  ? `Rp ${(amount / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} miliar`
  : `Rp ${(amount / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
const percent = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const monthForDay = (day: number) => new Date(Date.UTC(2020, 3, 1 + day)).getUTCMonth() + 1;
const dayFromDate = (value: string) => Math.round((Date.parse(`${value}T00:00:00Z`) - Date.UTC(2020, 3, 1)) / 864e5);
const weekdayForDay = (day: number) => (new Date(Date.UTC(2020, 3, 1 + day)).getUTCDay() + 6) % 7;
const dateLabel = (day: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(2020, 3, 1 + day));
const inputDateLabel = (value: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

function Kpi({ label, value, exact, delta, detail }: { label: string; value: string; exact?: string; delta: number | null; detail: string }) {
  return <article className={styles.kpi}>
    <div className={styles.kpiLabel}>{label}</div>
    <div className={styles.kpiValue}>{value}</div>
    {exact && <div className={styles.kpiExact}>{exact}</div>}
    <div className={styles.kpiFoot}>
      {delta === null ? <span className={styles.noDelta}>Perbandingan tidak tersedia</span> : <span className={delta >= 0 ? styles.positive : styles.negative}>
        {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{percent(delta)}
      </span>}
      <span>{detail}</span>
    </div>
  </article>;
}

function TrendChart({ data, total }: { data: { label: string; revenue: number; lines: number }[]; total: number }) {
  const width = 700, height = 250, left = 58, right = 16, top = 18, bottom = 34;
  const max = Math.max(1, ...data.map(item => item.revenue)) * 1.12;
  const x = (index: number) => data.length < 2 ? width / 2 : left + index * (width - left - right) / (data.length - 1);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const area = data.length ? `M ${x(0)} ${height - bottom} L ${data.map((item, index) => `${x(index)} ${y(item.revenue)}`).join(" L ")} L ${x(data.length - 1)} ${height - bottom} Z` : "";
  const tick = (value: number) => `${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt`;
  return <svg className={styles.trendSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tren omzet per bulan">
    {[0, .5, 1].map(fraction => {
      const value = max * fraction, lineY = y(value);
      return <g key={fraction}><line x1={left} x2={width - right} y1={lineY} y2={lineY} className={styles.chartGrid} /><text x={left - 8} y={lineY + 4} textAnchor="end" className={styles.axisText}>{tick(value)}</text></g>;
    })}
    <path d={area} className={styles.trendArea} />
    {data.length > 1 && <polyline points={data.map((item, index) => `${x(index)},${y(item.revenue)}`).join(" ")} className={styles.trendLine} />}
    {data.map((item, index) => <g key={item.label}>
      <circle cx={x(index)} cy={y(item.revenue)} r="5" className={styles.trendDot} tabIndex={0} aria-label={`${item.label}: ${rupiah(item.revenue)}, ${total ? (item.revenue / total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}% omzet, ${number.format(item.lines)} baris`}><title>{`${item.label}: ${rupiah(item.revenue)} · ${total ? (item.revenue / total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}% omzet · ${number.format(item.lines)} baris`}</title></circle>
      <text x={x(index)} y={height - 8} textAnchor="middle" className={styles.axisText}>{item.label.slice(0, 3)}</text>
    </g>)}
  </svg>;
}

function RevenueDonut({ brands }: { brands: { name: string; revenue: number; quantity?: number }[] }) {
  const total = brands.reduce((sum, brand) => sum + brand.revenue, 0);
  let cursor = 0;
  const stops = brands.map((brand, index) => {
    const start = cursor;
    cursor += total ? brand.revenue / total * 100 : 0;
    return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`;
  }).join(", ");
  return <div className={styles.donutLayout}>
    <div className={styles.donut} style={{ background: `conic-gradient(${stops})` }} aria-label="Komposisi omzet">
      <div className={styles.donutCenter}><strong>{rupiahCompact(total)}</strong><span>total omzet</span></div>
    </div>
    <ul className={styles.legend}>{brands.map((brand, index) => <li key={brand.name} tabIndex={0} title={`${brand.name}: ${rupiah(brand.revenue)} · ${total ? (brand.revenue / total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}%${brand.quantity === undefined ? "" : ` · ${number.format(brand.quantity)} unit`}`}>
      <i style={{ background: COLORS[index % COLORS.length] }} /><span>{brand.name}</span>
      <strong>{rupiah(brand.revenue)} · {total ? `${(brand.revenue / total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "0%"}{brand.quantity === undefined ? "" : ` · ${number.format(brand.quantity)} unit`}</strong>
    </li>)}</ul>
  </div>;
}

function BarRows({ items, total, label, display, tint = "dark" }: {
  items: { id: string; label: string; value: number; note?: string; tooltip?: string }[];
  total: number;
  label: string;
  display: (value: number) => string;
  tint?: "dark" | "light";
}) {
  const max = Math.max(1, ...items.map(item => item.value));
  return <div className={`${styles.barList} ${tint === "light" ? styles.barListLight : ""}`}>
    {items.map((item, index) => <div className={styles.barRow} key={item.id} tabIndex={0} title={item.tooltip ?? `${item.label}: ${display(item.value)} · ${total ? (item.value / total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}%`}>
      <div className={styles.barTop}><span className={styles.barName} title={item.label}>{item.label}</span><strong>{display(item.value)}</strong></div>
      {item.note && <div className={styles.barNote}>{item.note}</div>}
      <div className={styles.barTrack}><span style={{ width: `${Math.max(2, item.value / max * 100)}%`, background: COLORS[index % COLORS.length] }} /></div>
    </div>)}
    {!items.length && <p className={styles.empty}>No sales in the selected months.</p>}
    <span className={styles.srOnly}>{label}{total ? `; total ${display(total)}` : ""}</span>
  </div>;
}

function DailyBars({ days, total }: { days: { day: number; revenue: number; lines: number; customers: number }[]; total: number }) {
  const max = Math.max(1, ...days.map(item => item.revenue));
  return <div className={styles.dailyChart} role="group" aria-label="Grafik omzet harian">
    {days.map(item => <div key={item.day} className={styles.dailyBarCell} tabIndex={0} aria-label={`${dateLabel(item.day)}: omzet ${rupiah(item.revenue)}, ${total ? (item.revenue / total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}% bulan ini, ${number.format(item.lines)} baris, ${number.format(item.customers)} pelanggan aktif`} title={`${dateLabel(item.day)}\nOmzet: ${rupiah(item.revenue)} (${total ? (item.revenue / total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}% bulan ini)\nBaris penjualan: ${number.format(item.lines)}\nPelanggan aktif: ${number.format(item.customers)}`}>
      <span className={styles.dailyBarValue}>{item.revenue ? rupiahCompact(item.revenue) : "Rp0"}</span>
      <i style={{ height: `${Math.max(item.revenue ? 3 : 0, item.revenue / max * 100)}%` }} />
      <span className={styles.dailyBarDay}>{new Date(Date.UTC(2020, 3, item.day)).getUTCDate()}</span>
    </div>)}
  </div>;
}

function MatplotlibChart({ chart, alt, svg, fallback }: {
  chart: string;
  alt: string;
  svg?: string;
  fallback: ReactNode;
}) {
  const [tooltip, setTooltip] = useState<{ title: string; detail: string; x: number; y: number } | null>(null);
  const showTooltip = (target: EventTarget | null, container: HTMLDivElement) => {
    if (!(target instanceof Element)) return;
    const mark = target.closest<SVGElement>("[tabindex='0']");
    const tooltipText = mark?.getAttribute("data-tooltip");
    if (!mark || !tooltipText) { setTooltip(null); return; }
    const markBounds = mark.getBoundingClientRect();
    const containerBounds = container.getBoundingClientRect();
    const [heading, ...details] = tooltipText.split(": ");
    const tooltipAnchorY = markBounds.top - containerBounds.top - 8;
    setTooltip({
      title: heading,
      detail: details.join(": "),
      x: Math.max(112, Math.min(markBounds.left - containerBounds.left + markBounds.width / 2, containerBounds.width - 112)),
      y: Math.max(66, Math.min(tooltipAnchorY, containerBounds.height - 8)),
    });
  };
  return <div className={styles.chartFrame}>
    {svg ? <div className={styles.chartSvg}
      onPointerOver={event => showTooltip(event.target, event.currentTarget)}
      onPointerLeave={() => setTooltip(null)}
      onFocusCapture={event => showTooltip(event.target, event.currentTarget)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTooltip(null); }}
      >
      <div className={styles.chartMarkup} role="img" aria-label={alt} dangerouslySetInnerHTML={{ __html: svg }} />
      {tooltip && <div className={styles.chartTooltip} style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
        <strong>{tooltip.title}</strong><span>{tooltip.detail}</span>
      </div>}
    </div> : <div className={styles.chartFallback}>{fallback}</div>}
  </div>;
}

export function SalesDashboard() {
  const [selectedMonths, setSelectedMonths] = useState(MONTHS.map(month => month.id));
  const [dateStart, setDateStart] = useState(START_DATE);
  const [dateEnd, setDateEnd] = useState(END_DATE);
  const [behaviorMonth, setBehaviorMonth] = useState(9);
  const [matplotlibSvgs, setMatplotlibSvgs] = useState<Record<string, string>>({});
  const rows = DATA.rows;
  const fromDay = dayFromDate(dateStart);
  const toDay = dayFromDate(dateEnd);
  const selectedMonthKey = selectedMonths.join(",");

  const analysis = useMemo(() => {
    const included = new Set(selectedMonths);
    const chosen = rows.filter(row => row[0] >= fromDay && row[0] <= toDay && included.has(monthForDay(row[0])));
    const customers = new Set<number>(), baskets = new Set<string>();
    const productTotals = new Map<number, { quantity: number; units: Map<number, number> }>();
    const brandTotals = new Map<number, { revenue: number; lines: number }>(), customerTotals = new Map<number, number>();
    const unitTotals = new Map<number, { revenue: number; quantity: number }>();
    const tierTotals = [0, 0], daily = new Map<number, { revenue: number; lines: number; customers: Set<number> }>();
    const weekdayTotals = Array.from({ length: 7 }, () => ({ revenue: 0, lines: 0, customers: new Set<number>() }));
    const monthlyTotals = new Map<number, { revenue: number; lines: number; customers: Set<number>; baskets: Set<string> }>();
    let revenue = 0;
    for (const row of chosen) {
      const [day, customer, product, brand, quantity, unit, amount, isF] = row;
      revenue += amount; customers.add(customer); baskets.add(`${day}-${customer}`);
      const productTotal = productTotals.get(product) ?? { quantity: 0, units: new Map<number, number>() };
      productTotal.quantity += quantity;
      productTotal.units.set(unit, (productTotal.units.get(unit) ?? 0) + quantity);
      productTotals.set(product, productTotal);
      const brandTotal = brandTotals.get(brand) ?? { revenue: 0, lines: 0 };
      brandTotal.revenue += amount; brandTotal.lines += 1; brandTotals.set(brand, brandTotal);
      customerTotals.set(customer, (customerTotals.get(customer) ?? 0) + amount);
      tierTotals[isF ? 0 : 1] += amount;
      const dailyTotal = daily.get(day) ?? { revenue: 0, lines: 0, customers: new Set<number>() };
      dailyTotal.revenue += amount; dailyTotal.lines += 1; dailyTotal.customers.add(customer); daily.set(day, dailyTotal);
      const weekday = weekdayForDay(day);
      weekdayTotals[weekday].revenue += amount; weekdayTotals[weekday].lines += 1; weekdayTotals[weekday].customers.add(customer);
      const month = monthForDay(day);
      const monthTotal = monthlyTotals.get(month) ?? { revenue: 0, lines: 0, customers: new Set<number>(), baskets: new Set<string>() };
      monthTotal.revenue += amount; monthTotal.lines += 1; monthTotal.customers.add(customer); monthTotal.baskets.add(`${day}-${customer}`); monthlyTotals.set(month, monthTotal);
      const unitTotal = unitTotals.get(unit) ?? { revenue: 0, quantity: 0 };
      unitTotal.revenue += amount; unitTotal.quantity += quantity; unitTotals.set(unit, unitTotal);
    }
    const trend = [...monthlyTotals.entries()].sort((a, b) => a[0] - b[0]).map(([month, item]) => ({
      label: MONTHS.find(entry => entry.id === month)?.label ?? String(month), month, revenue: item.revenue, lines: item.lines,
    }));
    const products = [...productTotals.entries()].map(([id, item]) => ({
      id: String(id), label: DATA.products[id], value: item.quantity,
      note: [...item.units.entries()].sort((a, b) => b[1] - a[1]).map(([unit, quantity]) => `${number.format(quantity)} ${DATA.units[unit]}`).join(" · "),
    })).sort((a, b) => b.value - a.value).slice(0, 5);
    const brands = [...brandTotals.entries()].map(([id, item]) => ({ id, name: DATA.brands[id], revenue: item.revenue, lines: item.lines, average: item.revenue / item.lines })).sort((a, b) => b.revenue - a.revenue);
    const topBrands = brands.slice(0, 5);
    if (brands.length > 5) topBrands.push({ id: -1, name: "Merek lainnya", revenue: brands.slice(5).reduce((sum, brand) => sum + brand.revenue, 0), lines: brands.slice(5).reduce((sum, brand) => sum + brand.lines, 0), average: 0 });
    const averageByBrand = brands.slice().sort((a, b) => b.average - a.average).slice(0, 8).map(item => ({
      id: String(item.id), label: item.name, value: item.average,
      tooltip: `${item.name}: rata-rata ${rupiahAverage(item.average)} per baris dari ${number.format(item.lines)} baris · omzet ${rupiah(item.revenue)}`,
      note: `${number.format(item.lines)} baris · total ${rupiah(item.revenue)}`,
    }));
    const units = [...unitTotals.entries()].map(([id, item]) => ({ id, name: DATA.units[id], revenue: item.revenue, quantity: item.quantity })).sort((a, b) => b.revenue - a.revenue);
    const topUnits = units.slice(0, 5);
    if (units.length > 5) topUnits.push({ id: -1, name: "Satuan lainnya", revenue: units.slice(5).reduce((sum, item) => sum + item.revenue, 0), quantity: units.slice(5).reduce((sum, item) => sum + item.quantity, 0) });
    const topCustomers = [...customerTotals.entries()].map(([id, amount]) => ({ id: String(id), label: DATA.customers[id], value: amount }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
    const weekdays = weekdayTotals.map((item, index) => ({ ...item, name: WEEKDAYS[index], short: WEEKDAY_SHORT[index] }));
    const availableMonths = trend.map(item => item.month);
    const activeBehaviorMonth = availableMonths.includes(behaviorMonth) ? behaviorMonth : (availableMonths.at(-1) ?? behaviorMonth);
    const daysInMonth = new Date(Date.UTC(2020, activeBehaviorMonth, 0)).getUTCDate();
    const firstWeekday = (new Date(Date.UTC(2020, activeBehaviorMonth - 1, 1)).getUTCDay() + 6) % 7;
    const calendarDays = Array.from({ length: daysInMonth }, (_, index) => Math.round((Date.UTC(2020, activeBehaviorMonth - 1, index + 1) - Date.UTC(2020, 3, 1)) / 864e5));
    const dailyDays = calendarDays.filter(day => day >= fromDay && day <= toDay && included.has(monthForDay(day))).map(day => {
      const item = daily.get(day);
      return { day, revenue: item?.revenue ?? 0, lines: item?.lines ?? 0, customers: item?.customers.size ?? 0 };
    });
    const heatCells = Array.from({ length: daysInMonth }, (_, index) => {
      const day = calendarDays[index];
      const details = day === undefined ? undefined : daily.get(day);
      const date = new Date(Date.UTC(2020, activeBehaviorMonth - 1, index + 1));
      return { key: `${activeBehaviorMonth}-${index + 1}`, day: index + 1, weekday: (date.getUTCDay() + 6) % 7, week: Math.floor((index + firstWeekday) / 7) + 1, revenue: details?.revenue ?? 0, lines: details?.lines ?? 0, customers: details?.customers.size ?? 0, inRange: day >= fromDay && day <= toDay && included.has(activeBehaviorMonth) };
    });
    const monthlyValues = trend.map(item => {
      const value = monthlyTotals.get(item.month)!;
      return { month: item.month, revenue: value.revenue, lines: value.lines, customers: value.customers.size, averageBasket: value.revenue / value.baskets.size };
    });
    const peakDay = dailyDays.reduce<typeof dailyDays[number] | null>((best, item) => !best || item.revenue > best.revenue ? item : best, null);
    return { revenue, lines: chosen.length, customers: customers.size, baskets: baskets.size, trend, products, brands: topBrands, averageByBrand, units: topUnits, topCustomers, tierTotals, weekdays, heatCells, dailyDays, monthlyValues, activeBehaviorMonth, peakDay, availableMonths };
  }, [rows, selectedMonths, fromDay, toDay, behaviorMonth]);

  useEffect(() => {
    if (!analysis.lines) { setMatplotlibSvgs({}); return; }
    const controller = new AbortController();
    setMatplotlibSvgs({});
    const query = new URLSearchParams({ months: selectedMonthKey, start: dateStart, end: dateEnd, behaviorMonth: String(analysis.activeBehaviorMonth) });
    fetch(`/api/charts?${query.toString()}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Layanan Matplotlib tidak tersedia"); return response.json() as Promise<Record<string, string>>; })
      .then(setMatplotlibSvgs)
      .catch(() => setMatplotlibSvgs({}));
    return () => controller.abort();
  }, [selectedMonthKey, dateStart, dateEnd, analysis.activeBehaviorMonth, analysis.lines]);

  const toggleMonth = (id: number) => setSelectedMonths(current => current.includes(id) ? current.filter(month => month !== id) : [...current, id]);
  const latestMonth = analysis.monthlyValues.at(-1)?.month ?? null;
  const currentMonth = analysis.monthlyValues.at(-1);
  const priorMonth = latestMonth === null ? undefined : analysis.monthlyValues.find(item => item.month === latestMonth - 1);
  const growth = (metric: "revenue" | "lines" | "customers" | "basket") => {
    if (!currentMonth || !priorMonth) return null;
    const metricValue = (value: NonNullable<typeof currentMonth>) => metric === "revenue" ? value.revenue
      : metric === "lines" ? value.lines
        : metric === "customers" ? value.customers
          : value.averageBasket;
    const current = metricValue(currentMonth), previous = metricValue(priorMonth);
    return previous ? (current / previous - 1) * 100 : null;
  };
  const latestLabel = MONTHS.find(month => month.id === latestMonth)?.label ?? "periode terpilih";
  const selectedLabel = selectedMonths.length === MONTHS.length ? "Semua bulan" : selectedMonths.length
    ? selectedMonths.slice().sort((a, b) => a - b).map(id => MONTHS.find(month => month.id === id)?.short).join(" · ")
    : "Belum ada bulan dipilih";
  const maxHeat = Math.max(1, ...analysis.heatCells.map(cell => cell.revenue));
  const maxWeekday = Math.max(1, ...analysis.weekdays.map(item => item.revenue));

  return <main className={styles.page}>
    <header className={styles.stickyHeader}>
      <a className={styles.wordmark} href="#overview" aria-label="Ringkasan Frozen Food"><Snowflake size={18} /> FROZEN FOOD</a>
      <div className={styles.monthControl} role="group" aria-label="Filter bulan"><span>BULAN</span>
        {MONTHS.map(month => <button key={month.id} type="button" aria-pressed={selectedMonths.includes(month.id)} className={selectedMonths.includes(month.id) ? styles.monthActive : ""} onClick={() => toggleMonth(month.id)}>{month.label}</button>)}
      </div>
      <div className={styles.dateRange}><CalendarDays size={16} aria-hidden="true" /><label>Dari<input aria-label="Tanggal mulai" type="date" min={START_DATE} max={END_DATE} value={dateStart} onChange={event => { setDateStart(event.target.value); if (event.target.value > dateEnd) setDateEnd(event.target.value); }} /></label><span>sampai</span><label>Sampai<input aria-label="Tanggal akhir" type="date" min={dateStart} max={END_DATE} value={dateEnd} onChange={event => setDateEnd(event.target.value)} /></label></div>
      <button className={styles.resetButton} type="button" title="Atur ulang filter" aria-label="Atur ulang filter" onClick={() => { setSelectedMonths(MONTHS.map(month => month.id)); setDateStart(START_DATE); setDateEnd(END_DATE); setBehaviorMonth(9); }}><RotateCcw size={16} /></button>
    </header>

    <section className={styles.overview} id="overview">
      <div className={styles.intro}><div><span className={styles.eyebrow}>RINGKASAN PENJUALAN · 2020</span><h1>Frozen Food,<br /><em>lebih terukur.</em></h1><p>{inputDateLabel(dateStart)} sampai {inputDateLabel(dateEnd)} · {selectedLabel}</p></div>
        <div className={styles.sourceBadge}><span className={styles.liveDot} /> ENAM FILE BULANAN <b>·</b> {analysis.lines.toLocaleString("id-ID")} BARIS</div>
      </div>
      {selectedMonths.length === 0 || fromDay > toDay || analysis.lines === 0 ? <div className={styles.emptySelection}>Tidak ada penjualan pada kombinasi bulan dan tanggal ini. Ubah filter untuk melihat analisis.</div> : <>
        <div className={styles.kpis} aria-label="Indikator penjualan">
          <Kpi label="TOTAL OMZET" value={rupiahCompact(analysis.revenue)} exact={rupiah(analysis.revenue)} delta={growth("revenue")} detail={`Perubahan bulanan · ${latestLabel} dibanding bulan sebelumnya`} />
          <Kpi label="BARIS PENJUALAN" value={number.format(analysis.lines)} delta={growth("lines")} detail="Proksi transaksi · jumlah baris" />
          <Kpi label="RATA-RATA NILAI KERANJANG" value={rupiahCompact(analysis.baskets ? analysis.revenue / analysis.baskets : 0)} exact={rupiahAverage(analysis.baskets ? analysis.revenue / analysis.baskets : 0)} delta={growth("basket")} detail="Dikelompokkan per pelanggan + tanggal" />
          <Kpi label="PELANGGAN AKTIF" value={number.format(analysis.customers)} delta={growth("customers")} detail="Nama unik pada periode terpilih" />
        </div>

        <div className={styles.overviewGrid}>
          <article className={`${styles.panel} ${styles.halfPanel}`}>
            <div className={styles.panelHead}><div><span className={styles.panelIndex}>01 / TREN</span><h2>Omzet per bulan</h2></div><span className={styles.unitTag}>RUPIAH</span></div>
            <MatplotlibChart chart="trend" svg={matplotlibSvgs.trend} alt="Grafik garis omzet bulanan dari Matplotlib" fallback={<TrendChart data={analysis.trend} total={analysis.revenue} />} />
            <div className={styles.monthValues}>{analysis.trend.map(item => <div key={item.label} title={`${item.label}: ${rupiah(item.revenue)} · ${number.format(item.lines)} baris`}><span>{item.label}</span><strong>{rupiah(item.revenue)}</strong></div>)}</div>
            <div className={styles.chartFoot}><span>Total omzet periode</span><strong>{rupiah(analysis.revenue)}</strong></div>
          </article>
          <article className={`${styles.panel} ${styles.halfPanel}`}>
            <div className={styles.panelHead}><div><span className={styles.panelIndex}>02 / KOMPOSISI</span><h2>Omzet per merek</h2></div><span className={styles.unitTag}>DONAT</span></div>
            <MatplotlibChart chart="brand-donut" svg={matplotlibSvgs["brand-donut"]} alt="Diagram donat omzet per merek dari Matplotlib" fallback={<RevenueDonut brands={analysis.brands.map(item => ({ name: item.name, revenue: item.revenue }))} />} />
            <p className={styles.sourceNote}>Merek diambil dari awalan kode barang; data tidak memiliki kategori produk terpisah.</p>
          </article>
          <article className={`${styles.panel} ${styles.halfPanel}`}>
            <div className={styles.panelHead}><div><span className={styles.panelIndex}>03 / PRODUK TERLARIS</span><h2>Lima produk teratas menurut jumlah</h2></div><span className={styles.unitTag}>KUANTITAS</span></div>
            <MatplotlibChart chart="products" svg={matplotlibSvgs.products} alt="Grafik batang lima produk dengan jumlah terjual terbanyak" fallback={<BarRows items={analysis.products.map(item => ({ ...item, tooltip: `${item.label}: ${number.format(item.value)} unit tercatat · ${item.note}` }))} total={analysis.products.reduce((sum, item) => sum + item.value, 0)} label="Lima produk teratas berdasarkan kuantitas" display={value => number.format(value)} />} />
            <p className={styles.sourceNote}>Satuan mengikuti catatan sumber; dus, pack, dan satuan lain tidak dicampur sebagai konversi.</p>
          </article>
          <article className={`${styles.panel} ${styles.halfPanel}`}>
            <div className={styles.panelHead}><div><span className={styles.panelIndex}>04 / NILAI PESANAN</span><h2>Rata-rata omzet per baris menurut merek</h2></div><span className={styles.unitTag}>RUPIAH / BARIS</span></div>
            <MatplotlibChart chart="avg-brand" svg={matplotlibSvgs["avg-brand"]} alt="Grafik batang rata-rata omzet per baris menurut merek" fallback={<BarRows items={analysis.averageByBrand} total={analysis.revenue} label="Rata-rata omzet per baris menurut merek" display={rupiahCompact} />} />
            <p className={styles.sourceNote}>Rata-rata dihitung dari omzet dibagi jumlah baris penjualan per merek; bukan margin keuntungan.</p>
          </article>
        </div>
      </>}
    </section>

    <section className={styles.deepDive} aria-labelledby="deep-title">
      <div className={styles.deepIntro}><div><span className={styles.lightEyebrow}>ANALISIS LANJUTAN</span><h2 id="deep-title">Lihat lebih dekat.</h2></div><p>Pola penjualan harian dan kontribusi pelanggan pada rentang yang dipilih.</p></div>
      {selectedMonths.length > 0 && analysis.lines > 0 && <div className={styles.deepGrid}>
        <article className={`${styles.lightPanel} ${styles.heatPanel}`}>
          <div className={styles.panelHead}><div><span className={styles.lightIndex}>01 / WAKTU & PERILAKU</span><h3>Pola omzet per hari</h3></div><span className={styles.unitTagLight}>ARAHKAN KURSOR</span></div>
          <div className={styles.analysisControls}><label htmlFor="behavior-month">Pilih bulan</label><select id="behavior-month" value={analysis.activeBehaviorMonth} onChange={event => setBehaviorMonth(Number(event.target.value))}>{analysis.availableMonths.map(month => <option key={month} value={month}>{MONTHS.find(item => item.id === month)?.label}</option>)}</select><span>Hari tersibuk: <strong>{analysis.peakDay ? `${dateLabel(analysis.peakDay.day)} · ${rupiah(analysis.peakDay.revenue)}` : "belum ada penjualan"}</strong></span></div>
          <div className={styles.weekdayStrip}>{analysis.weekdays.map((item, index) => <div key={item.name} title={`${item.name}: ${rupiah(item.revenue)} · ${analysis.revenue ? (item.revenue / analysis.revenue * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}% omzet · ${number.format(item.lines)} baris · ${number.format(item.customers.size)} pelanggan`}><span>{item.short}</span><strong>{(item.revenue / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt</strong><i style={{ width: `${item.revenue / maxWeekday * 100}%`, background: COLORS[index % COLORS.length] }} /></div>)}</div>
          <MatplotlibChart chart="heatmap" svg={matplotlibSvgs.heatmap} alt={`Heatmap omzet berdasarkan hari pada ${MONTHS.find(item => item.id === analysis.activeBehaviorMonth)?.label}`} fallback={<div className={styles.heatWrap}><div className={styles.heatLabels}>{WEEKDAY_SHORT.map(day => <span key={day}>{day}</span>)}</div>
            <div className={styles.heatGrid}>{analysis.heatCells.map(cell => {
              const tooltip = cell.inRange
                ? `${WEEKDAYS[cell.weekday]}, ${cell.day} ${MONTHS.find(item => item.id === analysis.activeBehaviorMonth)?.label}: ${rupiah(cell.revenue)} · ${analysis.dailyDays.reduce((sum, item) => sum + item.revenue, 0) ? (cell.revenue / analysis.dailyDays.reduce((sum, item) => sum + item.revenue, 0) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}% omzet bulan · ${number.format(cell.lines)} baris · ${number.format(cell.customers)} pelanggan`
                : `${cell.day} ${MONTHS.find(item => item.id === analysis.activeBehaviorMonth)?.label}: di luar rentang tanggal terpilih`;
              return <span key={cell.key} tabIndex={0} aria-label={tooltip} title={tooltip} style={{ backgroundColor: cell.inRange ? (cell.revenue ? `rgba(13, 145, 129, ${.08 + cell.revenue / maxHeat * .78})` : "#e8eeea") : "#f5f7f4", gridColumn: cell.week, gridRow: cell.weekday + 1, opacity: cell.inRange ? 1 : .45 }} />;
            })}</div>
          </div>} />
          <div className={styles.heatLegend}><span>Omzet rendah</span><i /><i /><i /><i /><span>Omzet tinggi</span></div>
          <h4 className={styles.dailyTitle}>Rincian penjualan harian · {MONTHS.find(item => item.id === analysis.activeBehaviorMonth)?.label}</h4>
          <MatplotlibChart chart="daily" svg={matplotlibSvgs.daily} alt={`Grafik batang omzet harian bulan ${MONTHS.find(item => item.id === analysis.activeBehaviorMonth)?.label}`} fallback={<DailyBars days={analysis.dailyDays} total={analysis.dailyDays.reduce((sum, item) => sum + item.revenue, 0)} />} />
          <p className={styles.lightNote}>Arahkan kursor ke batang tanggal untuk melihat omzet, persentase dari omzet bulan, jumlah baris, dan pelanggan aktif. Jam transaksi tidak tersedia pada data.</p>
        </article>
        <article className={`${styles.lightPanel} ${styles.unavailablePanel}`}>
          <div className={styles.panelHead}><div><span className={styles.lightIndex}>02 / KOMPOSISI JUAL</span><h3>Omzet berdasarkan satuan</h3></div><span className={styles.unitTagLight}>DONAT</span></div>
          <MatplotlibChart chart="units" svg={matplotlibSvgs.units} alt="Diagram donat komposisi omzet menurut satuan" fallback={<RevenueDonut brands={analysis.units.map(item => ({ name: item.name, revenue: item.revenue, quantity: item.quantity }))} />} />
          <p className={styles.lightNote}>Menunjukkan bagian omzet dan kuantitas tercatat per satuan. Satuan berbeda tidak dijumlahkan sebagai barang yang setara.</p>
        </article>
        <article className={`${styles.lightPanel} ${styles.unavailablePanel}`}>
          <div className={styles.panelHead}><div><span className={styles.lightIndex}>03 / KONTRIBUSI</span><h3>Pelanggan dengan omzet terbesar</h3></div><span className={styles.unitTagLight}>RUPIAH</span></div>
          <MatplotlibChart chart="customers" svg={matplotlibSvgs.customers} alt="Grafik batang kontribusi omzet pelanggan terbesar" fallback={<BarRows items={analysis.topCustomers.map(item => ({ ...item, note: "Nama sesuai data sumber" }))} total={analysis.revenue} label="Kontribusi omzet pelanggan terbesar" display={rupiahCompact} tint="light" />} />
          <p className={styles.lightNote}>Nama pelanggan ditampilkan sesuai file sumber. Lokasi tidak tersedia untuk pemetaan wilayah.</p>
        </article>
        <article className={`${styles.lightPanel} ${styles.unavailablePanel}`}>
          <div className={styles.panelHead}><div><span className={styles.lightIndex}>04 / HARI TERPADAT</span><h3>Omzet per hari dalam seminggu</h3></div><span className={styles.unitTagLight}>RUPIAH</span></div>
          <MatplotlibChart chart="weekday" svg={matplotlibSvgs.weekday} alt="Grafik batang omzet menurut hari dalam seminggu" fallback={<BarRows items={analysis.weekdays.map(item => ({ id: item.name, label: item.name, value: item.revenue, tooltip: `${item.name}: ${rupiah(item.revenue)} · ${analysis.revenue ? (item.revenue / analysis.revenue * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}% omzet · ${number.format(item.lines)} baris · ${number.format(item.customers.size)} pelanggan` }))} total={analysis.revenue} label="Omzet menurut hari" display={rupiahCompact} tint="light" />} />
        </article>
      </div>}
      <footer className={styles.footer}>
        <div><span>METODE</span><p>Satu lembar rekap gabungan per workbook; baris dengan nilai penjualan nol atau negatif tidak dihitung. Semua enam file digunakan.</p></div>
        <div><span>PROKSI TRANSAKSI</span><p>Nomor nota tidak tersedia. Jumlah transaksi memakai hitungan baris; nilai keranjang mengelompokkan pelanggan dan tanggal.</p></div>
        <div><span>SUMBER DATA</span><p>{DATA.sourceFiles.join(" · ")}</p></div>
      </footer>
    </section>
  </main>;
}