# OSE Forecasting MLR Seasonal Frontend

Static frontend for the Forecasting MLR Seasonal Web App. Excel files are read in the browser; numeric/tabular forecasting inputs are sent to the FastAPI backend.

## Local run

```powershell
cd C:\ose-forecasting-mlr-seasonal-frontend
py -m http.server 5500 --bind 127.0.0.1 --directory .\public
```

Open `http://127.0.0.1:5500`.

By default, local frontend calls `http://127.0.0.1:8000`.
To test a deployed backend:

`http://127.0.0.1:5500/?api=https://YOUR-BACKEND.onrender.com`

## Deploy

Cloudflare Pages settings:
- Framework preset: None
- Build command: `exit 0`
- Build output directory: `public`
- Root directory: blank

Before deploying, edit `public/config.js` and set `ONLINE_API_URL` to the Render backend URL.
