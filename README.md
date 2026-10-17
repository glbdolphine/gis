# Sylhet School GIS

Offline-first web app for mapping schools across the 13 upazilas of Sylhet district, checking GPS quality, and measuring distance to fiber POPs. All data stays in the browser (IndexedDB).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Layout

```
src/
├── types/gis.ts                 interfaces, defaults, AppApi
├── data/sylhetGeoData.ts        13 upazilas (approximate bounds), gazetteer, geo helpers
├── services/
│   ├── db.ts                    IndexedDB, backup/restore
│   ├── geocoding.ts             gazetteer + Nominatim candidates, ranking, rate-limited queue
│   ├── fileParser.ts            xlsx/csv parsing, column auto-detect, exporters
│   └── coverage.ts              nearest POP, quality tiers, per-upazila stats
├── components/
│   ├── ui.tsx                   shared buttons, cards, modal
│   ├── map/                     GisMap (Leaflet), mapIcons (SVG markers)
│   └── views/                   the eight views
├── App.tsx                      shell, state, navigation
└── index.css                    Tailwind, Leaflet styling, Bengali font
```

## Known limits

- **Upazila boundaries are approximate rectangles**, not official polygons. They are used for bounds checks and fallback centres only. Swap `polygon` in `sylhetGeoData.ts` for real BBS/LGED GeoJSON when you have it.
- **The gazetteer is small** (about 30 places, mostly Sylhet city). Coordinates are approximate, so confirm important points in GPS verification. Extend `GAZETTEER` for better offline matching.
- **Online geocoding** uses a Nominatim-compatible endpoint. The public OSM server allows 1 request/second and asks for light use; keep the rate limit at 1 or point Settings at your own instance.
- **Distances are straight-line**, not along roads or fiber.
- **POP nodes and routes start empty.** Enter only infrastructure you have records for.
- Base-map tiles need internet; everything else works offline.
