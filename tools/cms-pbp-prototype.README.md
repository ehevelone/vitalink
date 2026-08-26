# CMS PBP Benefits Prototype

This is a research prototype only. It is not connected to the VitaLink app,
CRM, or production database.

## Goal

Prove whether VitaLink can:

1. Extract a Medicare Advantage plan identifier from card text.
2. Normalize it into contract / plan / segment parts.
3. Match it against CMS PBP Benefits JSON data.
4. Build a future medical copay snapshot.

## CMS Source

CMS page:

https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/benefits-data/pbp-benefits-2026-json

Download:

https://www.cms.gov/files/zip/pbp-benefits-2026-json.zip

## Test card text extraction

```powershell
cd "C:\vitalink build\VitaLink Site"
node tools\cms-pbp-extractor-test.js
```

Expected behavior:

- `UnitedHealthcare | Plan ID: H2802-001-0` becomes `H2802-001-000`
- `CMS H9802-001` becomes `H9802-001-000`

## Try CMS lookup

```powershell
cd "C:\vitalink build\VitaLink Site"
node tools\cms-pbp-prototype.js --plan H9802-001 --year 2026
```

If the CMS download is blocked by the shell, manually download:

https://www.cms.gov/files/zip/pbp-benefits-2026-json.zip

Save it here:

```text
C:\vitalink build\VitaLink Site\.cms-cache\pbp-benefits-2026-json.zip
```

Then rerun:

```powershell
node tools\cms-pbp-prototype.js --plan H9802-001 --year 2026
```

## Notes

ZIP alone may not be enough for a final user-facing match because some ZIP
codes cross county/service-area boundaries. The future production lookup should
use contract + plan + segment + year + ZIP/county where available.
