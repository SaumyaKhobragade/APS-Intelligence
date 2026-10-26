# APS Intelligence Frontend

Next.js frontend for the APS Intelligence FastAPI application.

## Local setup

From `frontend/`:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The development server runs at `http://localhost:3000`. The default API URL is
`http://localhost:8000/api/v1`. Override it with:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

The shared client in `services/api-client.ts` handles versioned URL joining,
JSON request/response parsing, structured backend errors, network failures,
timeouts and binary downloads. Service adapters in `services/` translate the
backend contracts into the existing UI types.

## Live data and availability states

The pages use persisted backend data for the dashboard, Dataset Explorer, Model
Comparison, Threshold Optimization and Experiment History. Failure Prediction
loads model, policy, registry and promotion state before enabling inference.
Predictions are unavailable unless an approved model, active promotion and
compatible active decision policy are all present. Empty datasets, missing
artifacts, unavailable analytics and API errors are displayed explicitly; demo
prediction fallbacks are not used.

Validation, official-test, synthetic and production metrics remain separate in
the backend responses. The isolated Phase 9 validation candidate and Phase 10
official-test artifacts are not merged into the active local registry by the
frontend.

## Checks

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

`tests/api-client.test.ts` covers URL normalization, JSON headers, structured
errors, timeout/network mapping, empty responses and downloads. For a live
smoke check, start the backend from `backend/` and visit each route from the
navigation; the backend OpenAPI document is available at
`http://127.0.0.1:8000/docs`.
