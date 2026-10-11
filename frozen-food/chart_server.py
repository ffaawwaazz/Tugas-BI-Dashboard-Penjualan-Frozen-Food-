"""Serve filtered Matplotlib SVG charts for the local frozen-food dashboard."""
from __future__ import annotations

import io
import json
import os
import threading
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from matplotlib.backends.backend_svg import FigureCanvasSVG
from matplotlib.figure import Figure
from matplotlib.patches import Rectangle


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "dashboard-web" / "src" / "data.json"
BASE = date(2020, 4, 1)
MONTHS = {4: "April", 5: "Mei", 6: "Juni", 7: "Juli", 8: "Agustus", 9: "September"}
WEEKDAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
PALETTE = ["#478d70", "#e48a63", "#77b7aa", "#8298bf", "#dfbd63", "#b77887", "#8da57d", "#708d99"]
SVG_NS = "http://www.w3.org/2000/svg"
RENDER_LOCK = threading.Lock()


def read_data() -> tuple[list[list[float]], list[str], list[str], list[str], list[str]]:
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Dashboard data not found at {DATA_FILE}. Run build_sales_dashboard_data.py first.")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    if "sourceFiles" in data:
        return data["rows"], data["customers"], data["products"], data["brands"], data["units"]
    rows = [[row[0], row[1], row[2], row[3], row[4], row[5], row[7], row[8]] for row in data["rows"]]
    return rows, data["pelanggan"], data["produk"], data["merek"], data["satuan"]


def filtered_rows(query: dict[str, list[str]]) -> tuple[list[list[float]], tuple[list[str], list[str], list[str], list[str]]]:
    rows, customers, products, brands, units = read_data()
    month_values = query.get("months")
    selected = {int(value) for value in month_values[0].split(",") if value} if month_values else set(MONTHS)
    start = date.fromisoformat(query.get("start", [BASE.isoformat()])[0])
    end = date.fromisoformat(query.get("end", ["2020-09-30"])[0])
    if start > end:
        return [], (customers, products, brands, units)
    start_day, end_day = (start - BASE).days, (end - BASE).days
    result = [row for row in rows if start_day <= row[0] <= end_day and (BASE + timedelta(days=int(row[0]))).month in selected]
    return result, (customers, products, brands, units)


def compact_currency(value: float) -> str:
    if abs(value) >= 1_000_000_000:
        return f"Rp {value / 1_000_000_000:,.1f} miliar".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"Rp {value / 1_000_000:,.0f} jt".replace(",", "X").replace(".", ",").replace("X", ".")


def figure_svg(figure: Figure, tooltips: dict[str, str] | None = None) -> str:
    stream = io.StringIO()
    FigureCanvasSVG(figure).print_svg(stream)
    figure.clear()
    ET.register_namespace("", SVG_NS)
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    root = ET.fromstring(stream.getvalue())
    for element_id, text in (tooltips or {}).items():
        element = root.find(f".//*[@id='{element_id}']")
        if element is not None:
            element.set("tabindex", "0")
            element.set("role", "graphics-symbol")
            element.set("data-tooltip", text)
            element.set("aria-label", text)
    return ET.tostring(root, encoding="unicode")


def base_figure(height: float = 3.4) -> tuple[Figure, object]:
    figure = Figure(figsize=(8.2, height), dpi=120, layout="constrained")
    figure.patch.set_alpha(0)
    axes = figure.subplots()
    axes.set_facecolor("none")
    axes.tick_params(colors="#65766b", labelsize=9, length=0, pad=7)
    for spine in axes.spines.values():
        spine.set_visible(False)
    axes.grid(axis="x", color="#e7eee7", linewidth=.8)
    axes.set_axisbelow(True)
    return figure, axes


def rows_by_month(rows: list[list[float]]) -> dict[int, dict[str, float]]:
    result: dict[int, dict[str, float]] = defaultdict(lambda: {"revenue": 0, "lines": 0})
    for row in rows:
        month = (BASE.fromordinal(BASE.toordinal() + int(row[0]))).month
        result[month]["revenue"] += row[6]
        result[month]["lines"] += 1
    return result


def render_chart(chart: str, rows: list[list[float]], dictionaries: tuple[list[str], list[str], list[str], list[str]], behavior_month: int = 9) -> str:
    customers, products, brands, units = dictionaries
    total = sum(row[6] for row in rows)
    tips: dict[str, str] = {}

    if chart == "trend":
        by_month = rows_by_month(rows)
        months = sorted(by_month)
        figure, axes = base_figure(3.2)
        values = [by_month[month]["revenue"] for month in months]
        x_values = list(range(len(months)))
        if values:
            axes.fill_between(x_values, values, color="#80b79a", alpha=.18)
            axes.plot(x_values, values, color="#478d70", linewidth=2.8, marker="o", markersize=6)
            for index, month in enumerate(months):
                axes.annotate(compact_currency(values[index]), (index, values[index]), xytext=(0, 10), textcoords="offset points", ha="center", color="#3d7058", fontsize=8)
                tips[f"mpl-point-{index}"] = f"{MONTHS[month]}: Rp {values[index]:,.0f} · {values[index] / total * 100:.1f}% omzet · {int(by_month[month]['lines']):,} baris" if total else ""
            axes.set_xticks(x_values, [MONTHS[month] for month in months])
            for index, line in enumerate(axes.lines):
                line.set_gid(f"mpl-point-{index}")
        axes.yaxis.set_major_formatter(lambda value, _: compact_currency(value))
        axes.set_ylabel("Omzet", color="#65766b", fontsize=9)
        return figure_svg(figure, tips)

    if chart in {"brand-donut", "units"}:
        field = 3 if chart == "brand-donut" else 5
        names = brands if field == 3 else units
        sums: dict[int, dict[str, float]] = defaultdict(lambda: {"revenue": 0, "quantity": 0})
        for row in rows:
            item = int(row[field])
            sums[item]["revenue"] += row[6]
            sums[item]["quantity"] += row[4]
        ranked = sorted(sums.items(), key=lambda item: item[1]["revenue"], reverse=True)
        visible = ranked[:6]
        if len(ranked) > 6:
            visible = visible[:5] + [(-1, {"revenue": sum(value["revenue"] for _, value in ranked[5:]), "quantity": sum(value["quantity"] for _, value in ranked[5:])})]
        figure = Figure(figsize=(8.2, 3.5), dpi=120, layout="constrained")
        figure.patch.set_alpha(0)
        axes = figure.subplots()
        axes.set_facecolor("none")
        values = [item["revenue"] for _, item in visible]
        labels = [names[index] if index >= 0 else ("Merek lainnya" if field == 3 else "Satuan lainnya") for index, _ in visible]
        if values and sum(values):
            wedges, _, _ = axes.pie(values, startangle=90, counterclock=False, colors=PALETTE[:len(values)],
                                   wedgeprops={"width": .37, "edgecolor": "white", "linewidth": 2}, autopct="%1.1f%%", pctdistance=.8,
                                   textprops={"color": "#40574a", "fontsize": 10})
            axes.text(0, .08, compact_currency(sum(values)), ha="center", va="center", color="#29483a", fontsize=14, fontweight="bold")
            axes.text(0, -.12, "total omzet", ha="center", va="center", color="#718277", fontsize=9)
            for index, (wedge, label, amount, (_, item)) in enumerate(zip(wedges, labels, values, visible)):
                quantity = f" · {int(item['quantity']):,} unit" if field == 5 else ""
                tips[f"mpl-slice-{index}"] = f"{label}: Rp {amount:,.0f} · {amount / total * 100:.1f}% omzet{quantity}" if total else label
                wedge.set_gid(f"mpl-slice-{index}")
            legend = [f"{label}  ·  Rp {item['revenue']:,.0f}  ·  {item['revenue'] / total * 100:.1f}%" + (f"  ·  {int(item['quantity']):,} unit" if field == 5 else "") for label, (_, item) in zip(labels, visible)]
            axes.legend(wedges, legend, loc="center left", bbox_to_anchor=(1.02, .5), frameon=False, fontsize=9, labelcolor="#40574a", handlelength=1, labelspacing=.85)
        axes.set_aspect("equal")
        return figure_svg(figure, tips)

    if chart in {"products", "avg-brand", "customers", "weekday"}:
        figure, axes = base_figure(3.4 if chart in {"products", "avg-brand", "customers"} else 3.0)
        if chart == "products":
            sums: dict[int, dict[str, object]] = defaultdict(lambda: {"quantity": 0, "unit": Counter()})
            for row in rows:
                sums[int(row[2])]["quantity"] += row[4]
                sums[int(row[2])]["unit"][int(row[5])] += row[4]
            ranked = sorted(sums.items(), key=lambda item: item[1]["quantity"], reverse=True)[:5]
            labels = [products[index] for index, _ in ranked][::-1]
            values = [item["quantity"] for _, item in ranked][::-1]
            bars = axes.barh(labels, values, color=PALETTE[:len(values)], height=.62)
            for index, (bar, (product_id, item)) in enumerate(zip(bars, ranked[::-1])):
                unit_text = " · ".join(f"{int(quantity):,} {units[unit_id]}" for unit_id, quantity in item["unit"].most_common())
                tips[f"mpl-bar-{index}"] = f"{products[product_id]}: {int(item['quantity']):,} unit tercatat · {unit_text}"
                bar.set_gid(f"mpl-bar-{index}")
                axes.text(bar.get_width(), bar.get_y() + bar.get_height() / 2, f"  {int(bar.get_width()):,}", va="center", color="#40574a", fontsize=8)
            axes.grid(axis="x", color="#e7eee7", linewidth=.8)
            axes.grid(axis="y", visible=False)
            axes.set_xlabel("Jumlah sesuai satuan yang tercatat", color="#65766b", fontsize=8)
        elif chart == "avg-brand":
            stats: dict[int, list[float]] = defaultdict(lambda: [0, 0])
            for row in rows:
                stats[int(row[3])][0] += row[6]
                stats[int(row[3])][1] += 1
            ranked = sorted(stats.items(), key=lambda item: item[1][0] / item[1][1], reverse=True)[:8][::-1]
            labels = [brands[index] for index, _ in ranked]
            values = [item[0] / item[1] for _, item in ranked]
            bars = axes.barh(labels, values, color=PALETTE[:len(values)], height=.62)
            for index, (bar, (brand_id, item)) in enumerate(zip(bars, ranked)):
                average = item[0] / item[1]
                tips[f"mpl-bar-{index}"] = f"{brands[brand_id]}: rata-rata Rp {average:,.2f} per baris · {int(item[1]):,} baris · omzet Rp {item[0]:,.0f}"
                bar.set_gid(f"mpl-bar-{index}")
                axes.text(bar.get_width(), bar.get_y() + bar.get_height() / 2, f"  {compact_currency(average)}", va="center", color="#40574a", fontsize=8)
            axes.grid(axis="x", color="#e7eee7", linewidth=.8)
            axes.grid(axis="y", visible=False)
            axes.set_xlabel("Rata-rata omzet per baris", color="#65766b", fontsize=8)
        elif chart == "customers":
            sums: dict[int, float] = defaultdict(float)
            for row in rows:
                sums[int(row[1])] += row[6]
            ranked = sorted(sums.items(), key=lambda item: item[1], reverse=True)[:8][::-1]
            labels = [customers[index] for index, _ in ranked]
            values = [amount for _, amount in ranked]
            bars = axes.barh(labels, values, color=PALETTE[:len(values)], height=.62)
            for index, (bar, (customer_id, amount)) in enumerate(zip(bars, ranked)):
                tips[f"mpl-bar-{index}"] = f"{customers[customer_id]}: Rp {amount:,.0f} · {amount / total * 100:.1f}% omzet" if total else customers[customer_id]
                bar.set_gid(f"mpl-bar-{index}")
                axes.text(bar.get_width(), bar.get_y() + bar.get_height() / 2, f"  {compact_currency(amount)}", va="center", color="#40574a", fontsize=8)
            axes.grid(axis="x", color="#e7eee7", linewidth=.8)
            axes.grid(axis="y", visible=False)
            axes.set_xlabel("Kontribusi omzet", color="#65766b", fontsize=8)
        else:
            weekday_totals = [0.0] * 7
            weekday_lines = [0] * 7
            weekday_customers = [set() for _ in range(7)]
            for row in rows:
                weekday = ((BASE.toordinal() + int(row[0])) % 7 + 6) % 7
                weekday_totals[weekday] += row[6]
                weekday_lines[weekday] += 1
                weekday_customers[weekday].add(int(row[1]))
            bars = axes.bar(WEEKDAYS, weekday_totals, color=PALETTE[:7], width=.68)
            axes.grid(axis="y", color="#e7eee7", linewidth=.8)
            axes.grid(axis="x", visible=False)
            axes.yaxis.set_major_formatter(lambda value, _: compact_currency(value))
            for index, bar in enumerate(bars):
                tips[f"mpl-bar-{index}"] = f"{WEEKDAYS[index]}: Rp {weekday_totals[index]:,.0f} · {weekday_totals[index] / total * 100:.1f}% omzet · {weekday_lines[index]:,} baris · {len(weekday_customers[index])} pelanggan" if total else WEEKDAYS[index]
                bar.set_gid(f"mpl-bar-{index}")
                axes.annotate(compact_currency(weekday_totals[index]), (bar.get_x() + bar.get_width() / 2, bar.get_height()), xytext=(0, 4), textcoords="offset points", ha="center", fontsize=7, color="#40574a")
        return figure_svg(figure, tips)

    if chart in {"heatmap", "daily"}:
        from datetime import timedelta

        calendar_days = [BASE + timedelta(days=offset) for offset in range(183) if (BASE + timedelta(days=offset)).month == behavior_month]
        daily: dict[int, dict[str, object]] = defaultdict(lambda: {"revenue": 0, "lines": 0, "customers": set()})
        for row in rows:
            item = daily[int(row[0])]
            item["revenue"] += row[6]
            item["lines"] += 1
            item["customers"].add(int(row[1]))
        daily_values = [daily[(day - BASE).days] for day in calendar_days]
        month_total = sum(item["revenue"] for item in daily_values)
        if chart == "heatmap":
            figure = Figure(figsize=(5.8, 3.25), dpi=120, layout="constrained")
            figure.patch.set_alpha(0)
            axes = figure.subplots()
            axes.set_facecolor("none")
            axes.grid(False)
            first_weekday = calendar_days[0].weekday()
            week_count = (first_weekday + len(calendar_days) + 6) // 7
            axes.set_xticks(range(week_count), [f"Pekan {index + 1}" for index in range(week_count)])
            axes.set_yticks(range(7), WEEKDAYS)
            axes.set_xlim(-.5, week_count - .5)
            axes.set_ylim(6.5, -.5)
            axes.tick_params(colors="#65766b", labelsize=9, length=0, pad=7)
            for spine in axes.spines.values():
                spine.set_visible(False)
            maximum = max([item["revenue"] for item in daily_values] or [0]) or 1
            from matplotlib import colormaps
            color_map = colormaps["YlGn"]
            for index, (day, item) in enumerate(zip(calendar_days, daily_values)):
                weekday = day.weekday()
                week = (first_weekday + day.day - 1) // 7
                value = item["revenue"]
                color = color_map(.12 + .78 * value / maximum) if value else "#edf2ed"
                rectangle = Rectangle((week - .48, weekday - .46), .96, .92, facecolor=color, edgecolor="white", linewidth=1.5, joinstyle="round")
                rectangle.set_gid(f"mpl-day-{index}")
                axes.add_patch(rectangle)
                axes.text(week, weekday, str(day.day), ha="center", va="center", fontsize=9, color="#284739" if value / maximum < .62 else "white")
                tips[f"mpl-day-{index}"] = f"{WEEKDAYS[weekday]}, {day.day} {MONTHS[behavior_month]}: Rp {value:,.0f} · {value / month_total * 100:.1f}% omzet bulan · {int(item['lines']):,} baris · {len(item['customers'])} pelanggan" if month_total else f"{day.day} {MONTHS[behavior_month]}: tidak ada penjualan"
            axes.set_aspect("auto")
        else:
            figure, axes = base_figure(3.1)
            values = [item["revenue"] for item in daily_values]
            bars = axes.bar([day.day for day in calendar_days], values, color="#478d70", width=.72)
            axes.grid(axis="y", color="#e7eee7", linewidth=.8)
            axes.grid(axis="x", visible=False)
            axes.set_xlim(.4, len(calendar_days) + .6)
            axes.set_xticks(range(1, len(calendar_days) + 1, 2))
            axes.set_xlabel(f"Tanggal · {MONTHS[behavior_month]}", color="#65766b", fontsize=8)
            axes.yaxis.set_major_formatter(lambda value, _: compact_currency(value))
            for index, (bar, day, item) in enumerate(zip(bars, calendar_days, daily_values)):
                tips[f"mpl-day-{index}"] = f"{day.day} {MONTHS[behavior_month]}: Rp {item['revenue']:,.0f} · {item['revenue'] / month_total * 100:.1f}% omzet bulan · {int(item['lines']):,} baris · {len(item['customers'])} pelanggan" if month_total else f"{day.day} {MONTHS[behavior_month]}: tidak ada penjualan"
                bar.set_gid(f"mpl-day-{index}")
        return figure_svg(figure, tips)

    raise ValueError(f"Unknown chart: {chart}")


class ChartHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path not in {"/api/chart", "/api/charts"}:
            self.send_error(404)
            return
        query = parse_qs(parsed.query, keep_blank_values=True)
        behavior_month = int(query.get("behaviorMonth", ["9"])[0])
        try:
            rows, dictionaries = filtered_rows(query)
            with RENDER_LOCK:
                if parsed.path == "/api/charts":
                    chart_names = ["trend", "brand-donut", "products", "avg-brand", "heatmap", "daily", "units", "customers", "weekday"]
                    payload = json.dumps({name: render_chart(name, rows, dictionaries, behavior_month) for name in chart_names}, separators=(",", ":")).encode("utf-8")
                else:
                    chart = query.get("chart", [""])[0]
                    payload = render_chart(chart, rows, dictionaries, behavior_month).encode("utf-8")
        except (ValueError, KeyError, IndexError) as error:
            self.send_error(400, str(error))
            return
        except Exception as error:
            self.send_error(500, str(error))
            return
        self.send_response(200)
        content_type = "application/json; charset=utf-8" if parsed.path == "/api/charts" else "image/svg+xml; charset=utf-8"
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    host = os.environ.get("CHART_HOST", "127.0.0.1")
    port = int(os.environ.get("CHART_PORT", "5174"))
    print(f"Matplotlib chart service listening at http://{host}:{port}")
    ThreadingHTTPServer((host, port), ChartHandler).serve_forever()