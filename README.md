# BI projects

A collection of analysis and dashboard projects. Each project lives in its own folder.

| Project | What it is | Demo |
|---|---|---|
| [`frozen-food/`](frozen-food/) | Frozen food sales dashboard, April to September 2020 (Vite + React + [Arc UI](https://uiarc.dev)) | [GitHub Pages](https://farhanwew.github.io/bi-projects/) |

## About the data

The raw workbooks and analysis notebook are **not** in this repo. Local workbook data is generated into the ignored `frozen-food/dashboard-web/src/data.json`, with customer names retained. The public build uses anonymized `data.publik.json` instead; amounts, dates and product names are unchanged.

## Running the frozen-food dashboard

For the attached April-September workbooks (from `frozen-food/`):

```bash
uv run python build_sales_dashboard_data.py
```

Run the local Matplotlib chart service in one terminal, then Vite in another:

```bash
uv run python chart_server.py
```

```bash
cd dashboard-web
npm install
npm run dev
```

The local dashboard requests filtered SVG charts from Matplotlib. If that service is not running, the browser charts remain available as a fallback. GitHub Pages continues to use the anonymized dataset and browser fallback.

For an anonymized preview without the workbooks:

```bash
cd frozen-food/dashboard-web
npm install
cp src/data.publik.json src/data.json
npm run dev
```

Every push to `main` that touches `frozen-food/dashboard-web/` is deployed to GitHub Pages by `.github/workflows/deploy-frozen-food.yml`.

# Tugas-BI-Dashboard-Penjualan-Frozen-Food-