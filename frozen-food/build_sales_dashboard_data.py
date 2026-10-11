"""Build anonymized browser data from the six monthly sales workbooks."""
import argparse
import json
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "Tugas BI-Frozen food"
OUTPUT = Path(__file__).resolve().parent / "dashboard-web" / "src" / "data.json"
BASE = date(2020, 4, 1)
EXPECTED = {"rows": 6720, "revenue": 4_530_330_620, "customers": 181, "products": 297}


def clean_customer(value: object) -> tuple[str, str]:
    name = re.sub(r"\s+", " ", str(value or "").upper().strip())
    prefix_match = re.match(r"^([A-Z]{1,2})\s*-\s*", name)
    prefix = prefix_match.group(1) if prefix_match else "REGULER"
    customer = re.sub(r"^[A-Z]{1,2}\s*-\s*", "", name)
    return prefix, customer


def display_customer(name: str) -> str:
    if not name.strip():
        return "Name not recorded"
    return name.title().replace("Pt.", "PT.").replace("Cv.", "CV.")


def read_report_rows(path: Path) -> list[tuple[date, str, str, float, str, int, str]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    candidates: list[tuple[str, list[tuple[date, str, str, float, str, int, str]]]] = []
    try:
        for sheet in workbook.worksheets:
            rows = []
            for values in sheet.iter_rows(values_only=True):
                if len(values) < 8:
                    continue
                raw_date, raw_code, raw_product, raw_qty, raw_unit, _, raw_amount, raw_customer = values[:8]
                code = str(raw_code or "").strip()
                if not isinstance(raw_date, (date, datetime)) or not code or code.upper() == "KODEBARA":
                    continue
                if not raw_product or not isinstance(raw_qty, (int, float)) or not isinstance(raw_amount, (int, float)):
                    continue
                sale_date = raw_date.date() if isinstance(raw_date, datetime) else raw_date
                if sale_date.month not in range(4, 10) or sale_date.year != 2020:
                    continue
                rows.append((sale_date, code, str(raw_product).strip(), raw_qty, str(raw_unit or "").strip().upper(), int(raw_amount), str(raw_customer or "").strip()))
            if rows:
                candidates.append((sheet.title, rows))
    finally:
        workbook.close()
    if not candidates:
        raise ValueError(f"No sales report rows found in {path.name}")
    return max(candidates, key=lambda item: len(item[1]))[1]


def build(source: Path) -> dict[str, object]:
    files = sorted(source.glob("*.xlsx"))
    if len(files) != 6:
        raise ValueError(f"Expected six monthly workbooks in {source}, found {len(files)}")

    rows = [row for path in files for row in read_report_rows(path)]
    rows = [row for row in rows if row[5] > 0]
    normalized = [(*row[:3], *clean_customer(row[6]), *row[3:5], row[5]) for row in rows]

    plain_names = {row[4] for row in normalized}
    normalized = [
        (*row[:4], re.sub(r"^\(MITRAKU\)\s*", "", row[4]) if re.sub(r"^\(MITRAKU\)\s*", "", row[4]) in plain_names else row[4], *row[5:])
        for row in normalized
    ]
    normalized = [(*row[:4], row[4] or "Name not recorded", *row[5:]) for row in normalized]

    customer_revenue: dict[str, int] = defaultdict(int)
    product_revenue: dict[str, int] = defaultdict(int)
    for row in normalized:
        customer_revenue[row[4]] += row[7]
        product_revenue[row[2]] += row[7]

    customers = sorted(customer_revenue, key=lambda name: (-customer_revenue[name], name))
    products = sorted(product_revenue)
    brands = sorted({row[1].split("-", 1)[0].strip() for row in normalized})
    units = sorted({{"PAC": "PACK", "BALL": "BAL"}.get(row[6], row[6]) for row in normalized})
    customer_index = {name: index for index, name in enumerate(customers)}
    product_index = {name: index for index, name in enumerate(products)}
    brand_index = {name: index for index, name in enumerate(brands)}
    unit_index = {name: index for index, name in enumerate(units)}

    packed_rows = []
    for row in normalized:
        sale_date, code, product, quantity, unit, amount = row[0], row[1], row[2], row[5], row[6], row[7]
        brand = code.split("-", 1)[0].strip()
        unit = {"PAC": "PACK", "BALL": "BAL"}.get(unit, unit)
        packed_rows.append([
            (sale_date - BASE).days,
            customer_index[row[4]],
            product_index[product],
            brand_index[brand],
            quantity,
            unit_index[unit],
            amount,
            int(row[3] == "F"),
        ])
    packed_rows.sort(key=lambda row: (row[0], row[1], row[2]))

    result = {
        "base": BASE.isoformat(),
        "sourceFiles": [path.name for path in files],
        "customers": [display_customer(name) for name in customers],
        "products": products,
        "brands": brands,
        "units": units,
        "rows": packed_rows,
    }
    total = sum(row[6] for row in packed_rows)
    actual = {"rows": len(packed_rows), "revenue": total, "customers": len(customers), "products": len(products)}
    if actual != EXPECTED:
        raise ValueError(f"Workbook totals differ from the verified reference: {actual}")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE, help="folder containing April-September 2020 workbooks")
    args = parser.parse_args()
    data = build(args.source)
    OUTPUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    total = sum(row[6] for row in data["rows"])
    print(f"Built {OUTPUT} from {len(data['sourceFiles'])} workbooks")
    print(f"Sales lines: {len(data['rows']):,} | revenue: Rp{total:,} | customers: {len(data['customers']):,} | products: {len(data['products']):,}")