"use strict";

const ONLINE_API_URL = "https://ose-forecasting-mlr-backend.onrender.com";
const queryApi = new URLSearchParams(window.location.search).get("api");
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

window.FORECAST_API_BASE = (
  queryApi || (isLocal ? "http://127.0.0.1:8000" : ONLINE_API_URL)
).replace(/\/$/, "");
