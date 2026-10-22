"use strict";

const state = {
  data: [], comparison: [], results: [], selectedMethod: "", seasonLength: 12,
  futurePeriods: 6, hwAlpha: 0.25, hwBeta: 0.10, hwGamma: 0.10,
  hwAutoOptimize: true, seasonalTrendAdjust: true, hwDiagnostics: null,
  trendDiagnostic: null, horizonDisplay: 6, futureXMethod: "Auto Forecast X",
  futureXRows: [], futureXForecast: [], futureXDiagnostics: [], warning: ""
};
const columns = ["Period","Date","Target_Y","X1","X2","X3","X4","X5"];

function setStatus(msg){ document.getElementById("status").textContent = msg; }
function num(v){ const x=Number(v); return Number.isFinite(x)?x:NaN; }
function fmt(x,d=4){ return Number.isFinite(x)?Number(x).toLocaleString("en-US",{maximumFractionDigits:d}):""; }
function mean(a){ const b=a.filter(Number.isFinite); return b.length?b.reduce((s,x)=>s+x,0)/b.length:NaN; }
function activateTab(id){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===id));
  document.querySelectorAll(".section").forEach(s=>s.classList.toggle("active",s.id===id));
}

async function checkBackend(){
  const badge=document.getElementById("backendBadge");
  const url=document.getElementById("backendUrl");
  if(url) url.textContent=await window.OSE_API_READY;
  try{
    const r=await window.oseFetch("/api/health",{cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const j=await r.json();
    badge.textContent=`Backend: ${j.status||"online"}`;
    badge.className="api-badge ok";
  }catch(e){
    badge.textContent="Backend: offline";
    badge.className="api-badge bad";
  }
}

function demoData(){
  const rows=[];
  for(let i=1;i<=36;i++){
    const season=[-8,-5,2,6,10,15,17,14,8,3,-3,-7][(i-1)%12];
    const x1=100+i*1.5, x2=50+8*Math.sin(i/4), x3=(i%6===0)?1:0;
    const y=220+3.2*i+0.55*x1+1.2*x2+season+12*x3+Math.sin(i)*4;
    rows.push({Period:i,Date:`202${Math.floor((i-1)/12)+3}-${String(((i-1)%12)+1).padStart(2,"0")}-01`,Target_Y:Math.round(y*10)/10,X1:Math.round(x1*10)/10,X2:Math.round(x2*10)/10,X3:x3,X4:season,X5:i});
  }
  return rows;
}

function renderTable(id, rows, editable=false){
  const table=document.getElementById(id);
  if(!rows||!rows.length){ table.innerHTML=""; return; }
  const cols=Object.keys(rows[0]);
  table.innerHTML="<thead><tr>"+cols.map(c=>`<th>${c}</th>`).join("")+"</tr></thead><tbody>"+
    rows.map((r,ri)=>"<tr>"+cols.map(c=>`<td ${editable?`contenteditable="true" data-r="${ri}" data-c="${c}"`:""}>${r[c]??""}</td>`).join("")+"</tr>").join("")+"</tbody>";
}
function renderInput(){ renderTable("inputTable",state.data,true); }
function readEditableInput(){
  const table=document.getElementById("inputTable");
  const th=[...table.querySelectorAll("thead th")].map(x=>x.textContent);
  if(!th.length) return state.data;
  return [...table.querySelectorAll("tbody tr")].map(tr=>{
    const obj={}; [...tr.children].forEach((td,i)=>obj[th[i]]=td.textContent.trim());
    columns.forEach(c=>{ if(!(c in obj)) obj[c]=""; }); return obj;
  });
}
function ensureFutureXRows(h){
  const current=state.futureXRows||[], out=[];
  for(let k=1;k<=h;k++){
    const p=current[k-1]||{};
    out.push({Period:`F${k}`,Date:"",X1:p.X1??"",X2:p.X2??"",X3:p.X3??"",X4:p.X4??"",X5:p.X5??""});
  }
  state.futureXRows=out; return out;
}
function renderFutureX(){
  const panel=document.getElementById("futureXPanel");
  const show=state.futureXMethod==="User Input / Scenario";
  panel.style.display=show?"block":"none";
  if(show){ ensureFutureXRows(state.futurePeriods); renderTable("futureXTable",state.futureXRows,true); }
}
function readEditableFutureX(){
  const table=document.getElementById("futureXTable");
  const th=[...table.querySelectorAll("thead th")].map(x=>x.textContent);
  if(!th.length) return state.futureXRows||[];
  state.futureXRows=[...table.querySelectorAll("tbody tr")].map(tr=>{const o={};[...tr.children].forEach((td,i)=>o[th[i]]=td.textContent.trim());return o;});
  return state.futureXRows;
}

function getOptions(){
  state.seasonLength=Math.max(2,Number(document.getElementById("seasonLength").value)||12);
  state.futurePeriods=Math.max(1,Number(document.getElementById("futurePeriods").value)||6);
  state.futureXMethod=document.getElementById("futureXMethod").value;
  state.hwAlpha=Math.min(.99,Math.max(.01,Number(document.getElementById("hwAlpha").value)||.25));
  state.hwBeta=Math.min(.99,Math.max(.01,Number(document.getElementById("hwBeta").value)||.10));
  state.hwGamma=Math.min(.99,Math.max(.01,Number(document.getElementById("hwGamma").value)||.10));
  state.hwAutoOptimize=!!document.getElementById("hwAutoOptimize").checked;
  state.seasonalTrendAdjust=!!document.getElementById("seasonalTrendAdjust").checked;
  renderFutureX();
  return {
    method: document.getElementById("methodSelect").value,
    season_length: state.seasonLength,
    future_periods: state.futurePeriods,
    future_x_method: state.futureXMethod,
    hw_alpha: state.hwAlpha, hw_beta: state.hwBeta, hw_gamma: state.hwGamma,
    hw_auto_optimize: state.hwAutoOptimize,
    seasonal_trend_adjust: state.seasonalTrendAdjust,
    future_x_rows: state.futureXMethod==="User Input / Scenario"?readEditableFutureX():[]
  };
}

async function runForecast({activate="compare",silent=false}={}){
  try{
    const rows=readEditableInput();
    if(rows.length<6) throw new Error("Cần tối thiểu khoảng 6 dòng dữ liệu để dự báo.");
    state.data=rows;
    const options=getOptions();
    setStatus("Running forecast on backend server...");
    const r=await window.oseFetch("/api/forecast",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({rows, ...options})
    });
    const payload=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(payload.detail||`Backend error HTTP ${r.status}`);
    state.comparison=payload.comparison||[];
    state.results=payload.results||[];
    state.selectedMethod=payload.selectedMethod||"";
    state.futureXForecast=payload.futureXForecast||[];
    state.futureXDiagnostics=payload.futureXDiagnostics||[];
    state.hwDiagnostics=payload.hwDiagnostics||null;
    state.trendDiagnostic=payload.trendDiagnostic||null;
    state.warning=payload.warning||"";
    const c=payload.calibration||{};
    if(Number.isFinite(c.hw_alpha)){ state.hwAlpha=c.hw_alpha; document.getElementById("hwAlpha").value=c.hw_alpha.toFixed(2); }
    if(Number.isFinite(c.hw_beta)){ state.hwBeta=c.hw_beta; document.getElementById("hwBeta").value=c.hw_beta.toFixed(2); }
    if(Number.isFinite(c.hw_gamma)){ state.hwGamma=c.hw_gamma; document.getElementById("hwGamma").value=c.hw_gamma.toFixed(2); }
    state.horizonDisplay=Math.min(state.horizonDisplay||state.futurePeriods,state.futurePeriods);
    renderComparison(); renderResults(); renderFutureXResults(); renderHWDiagnostics(); renderDashboard();
    const warnEl=document.getElementById("modelWarning");
    if(warnEl){ warnEl.style.display=state.warning?"block":"none"; warnEl.textContent=state.warning; }
    setStatus(`Forecast completed on backend. Displayed method: ${state.selectedMethod}. Best RMSE method: ${payload.bestMethod||"N/A"}. Future X method: ${state.futureXMethod}.`);
    if(activate) activateTab(activate);
  }catch(e){
    setStatus(`Error: ${e.message}`);
    if(!silent) alert(e.message);
  }
}

function renderComparison(){
  renderTable("comparisonTable",state.comparison.map(r=>({Method:r.Method,MAE:fmt(num(r.MAE),3),RMSE:fmt(num(r.RMSE),3),MAPE:fmt(num(r.MAPE),2),R2:fmt(num(r.R2),4),Details:r.Details||""})));
  const best=state.comparison.find(x=>Number.isFinite(num(x.RMSE)));
  document.getElementById("metricCards").innerHTML=[
    ["Selected Method",state.selectedMethod],["Best RMSE",best?fmt(num(best.RMSE),3):"N/A"],["Best Method",best?best.Method:"N/A"]
  ].map(x=>`<div class="metric"><div class="label">${x[0]}</div><div class="value">${x[1]}</div></div>`).join("");
}
function renderResults(){
  renderTable("resultsTable",state.results.map(r=>({Period:r.Period,Date:r.Date||"",Type:r.Type,Actual:fmt(num(r.Actual),3),Fitted:fmt(num(r.Fitted),3),Forecast:fmt(num(r.Forecast),3),Error:fmt(num(r.Error),3),Method:r.Method})));
}
function renderFutureXResults(){
  const diag=(state.futureXDiagnostics||[]).map(r=>({Variable:r.Variable,"Selected Method":r.Selected_Method,"Validation N":r.Validation_N||"","RMSE Hold":fmt(num(r.RMSE_Hold_Last),4),"RMSE MA":fmt(num(r.RMSE_Moving_Average),4),"RMSE SES":fmt(num(r.RMSE_SES),4),"RMSE Trend":fmt(num(r.RMSE_Linear_Trend),4),"RMSE Seasonal":fmt(num(r.RMSE_Seasonal_Repeat),4),"RMSE Trend+Seasonal":fmt(num(r.RMSE_Trend_Seasonal),4),"RMSE Holt":fmt(num(r.RMSE_Holt_Linear),4),"RMSE Holt-Winters":fmt(num(r.RMSE_Holt_Winters),4),"Best Validation RMSE":fmt(num(r.Best_Validation_RMSE),4)}));
  renderTable("futureXMethodTable",diag);
  renderTable("futureXForecastTable",(state.futureXForecast||[]).map(r=>({Period:r.Period,X1:fmt(num(r.X1),4),X2:fmt(num(r.X2),4),X3:fmt(num(r.X3),4),X4:fmt(num(r.X4),4),X5:fmt(num(r.X5),4)})));
}
function renderHWDiagnostics(){
  const panel=document.getElementById("hwDiagnosticsPanel"), d=state.hwDiagnostics;
  const show=state.selectedMethod==="Holt-Winters Additive"&&d&&d.rows;
  panel.style.display=show?"block":"none"; if(!show) return;
  document.getElementById("hwMetricCards").innerHTML=[
    ["HW alpha",fmt(num(d.alpha),3)],["HW beta",fmt(num(d.beta),3)],["HW gamma",fmt(num(d.gamma),3)],
    ["Final level",fmt(num(d.finalLevel),3)],["Final trend",fmt(num(d.finalTrend),3)],["Optimization",d.optimized?"Auto RMSE":"Manual"]
  ].map(x=>`<div class="metric"><div class="label">${x[0]}</div><div class="value">${x[1]}</div></div>`).join("");
  renderTable("hwComponentsTable",d.rows.map(r=>({Period:r.Period,Type:r.Type,Actual:fmt(num(r.Actual),3),Fitted:fmt(num(r.Fitted),3),Level:fmt(num(r.Level),3),Trend:fmt(num(r.Trend),3),Seasonal:fmt(num(r.Seasonal),3),Forecast:fmt(num(r.Forecast),3)})));
}

function lineChart(svgId,series){
  const svg=document.getElementById(svgId); svg.innerHTML=""; const W=760,H=320,m={l:52,r:16,t:20,b:40};
  const vals=[]; series.forEach(s=>s.data.forEach(v=>{if(Number.isFinite(v)) vals.push(v);}));
  if(!vals.length){svg.innerHTML='<text x="30" y="40">No data</text>';return;}
  const minY=Math.min(...vals),maxY=Math.max(...vals),pad=(maxY-minY)*.12||1,y0=minY-pad,y1=maxY+pad,n=Math.max(...series.map(s=>s.data.length));
  const X=i=>m.l+(i/Math.max(1,n-1))*(W-m.l-m.r),Y=v=>H-m.b-((v-y0)/(y1-y0))*(H-m.t-m.b);
  svg.innerHTML+=`<line x1="${m.l}" y1="${H-m.b}" x2="${W-m.r}" y2="${H-m.b}" stroke="#9ca3af"/><line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H-m.b}" stroke="#9ca3af"/>`;
  for(let g=0;g<5;g++){const v=y0+(y1-y0)*g/4,y=Y(v);svg.innerHTML+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y}" y2="${y}" stroke="#eef2f7"/><text x="8" y="${y+4}" font-size="11" fill="#6b7280">${fmt(v,0)}</text>`;}
  series.forEach(s=>{let d="";s.data.forEach((v,i)=>{if(Number.isFinite(v))d+=(d?"L":"M")+X(i)+","+Y(v)+" ";});svg.innerHTML+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`;s.data.forEach((v,i)=>{if(Number.isFinite(v))svg.innerHTML+=`<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="${s.color}"/>`;});});
}
function barChart(svgId,rows){
  const svg=document.getElementById(svgId);svg.innerHTML="";const W=760,H=320,m={l:50,r:16,t:20,b:86},vals=rows.map(r=>num(r.RMSE)).filter(Number.isFinite);
  if(!vals.length){svg.innerHTML='<text x="30" y="40">No RMSE data</text>';return;}const maxY=Math.max(...vals)*1.15,bw=(W-m.l-m.r)/rows.length;
  svg.innerHTML+=`<line x1="${m.l}" y1="${H-m.b}" x2="${W-m.r}" y2="${H-m.b}" stroke="#9ca3af"/><line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H-m.b}" stroke="#9ca3af"/>`;
  rows.forEach((r,i)=>{const rv=num(r.RMSE),h=Number.isFinite(rv)?(rv/maxY)*(H-m.t-m.b):0,x=m.l+i*bw+bw*.15,y=H-m.b-h;svg.innerHTML+=`<rect x="${x}" y="${y}" width="${bw*.7}" height="${h}" fill="#2563eb" opacity=".8"><title>${r.Method}: ${fmt(rv,3)}</title></rect><text transform="translate(${x+bw*.35},${H-m.b+12}) rotate(55)" font-size="10" text-anchor="start" fill="#374151">${String(r.Method).replace(" Regression","").replace(" Additive","")}</text>`;});
}
function renderForecastHorizon(){
  const fut=state.results.filter(r=>r.Type==="Future"),total=Math.max(1,fut.length||state.futurePeriods||1),n=Math.max(1,Math.min(Number(state.horizonDisplay)||total,total)),shown=fut.slice(0,n),vals=shown.map(r=>num(r.Forecast));
  lineChart("chartHorizon",[{data:vals,color:"#b45309"}]);
  renderTable("horizonTable",shown.map((r,i)=>({Horizon:i+1,Period:r.Period,Forecast:fmt(num(r.Forecast),3),Method:r.Method})));
  const finite=vals.filter(Number.isFinite),first=finite.length?finite[0]:NaN,last=finite.length?finite[finite.length-1]:NaN,avg=mean(finite),chg=Number.isFinite(first)&&Number.isFinite(last)?last-first:NaN;
  [["hFirst",first],["hLast",last],["hAvg",avg],["hChange",chg]].forEach(([id,v])=>document.getElementById(id).textContent=fmt(v,3));
  document.getElementById("horizonValue").textContent=`${n} periods`; const slider=document.getElementById("horizonSlider");slider.max=String(total);slider.value=String(n);
}
function renderDashboard(){
  const hist=state.results.filter(r=>r.Type==="Historical"),fut=state.results.filter(r=>r.Type==="Future"),actual=hist.map(r=>num(r.Actual)),fitted=hist.map(r=>num(r.Fitted)),future=Array(hist.length).fill(NaN).concat(fut.map(r=>num(r.Forecast)));
  lineChart("chartMain",[{data:actual.concat(Array(fut.length).fill(NaN)),color:"#2563eb"},{data:fitted.concat(Array(fut.length).fill(NaN)),color:"#059669"},{data:future,color:"#b45309"}]);
  lineChart("chartResidual",[{data:hist.map(r=>num(r.Error)),color:"#b91c1c"}]); renderForecastHorizon(); barChart("chartRMSE",state.comparison);
  const best=state.comparison.find(x=>Number.isFinite(num(x.RMSE))),selected=state.comparison.find(x=>x.Method===state.selectedMethod);
  document.getElementById("summaryText").value=`EXECUTIVE SUMMARY\nSelected method: ${state.selectedMethod}\nBest RMSE method: ${best?best.Method:"N/A"}\nSelected RMSE: ${selected?fmt(num(selected.RMSE),3):"N/A"}\nSelected MAPE: ${selected?fmt(num(selected.MAPE),2):"N/A"}%\nFuture periods: ${state.futurePeriods}\nFuture X method: ${state.futureXMethod}\nFuture X selected by variable: ${(state.futureXDiagnostics||[]).map(d=>d.Variable+"="+d.Selected_Method).join("; ")||"N/A"}\nHW alpha/beta/gamma: ${state.hwAlpha}/${state.hwBeta}/${state.hwGamma}\nHW parameter mode: ${state.hwAutoOptimize?"Auto optimize by RMSE":"Manual"}\nSeasonal anchor adjustment: ${state.seasonalTrendAdjust?"ON":"OFF"}\nTrend diagnostic: ${state.trendDiagnostic?(`R2=${fmt(num(state.trendDiagnostic.r2),3)}, slope=${fmt(num(state.trendDiagnostic.slope),3)}`):"N/A"}\n\nManagerial interpretation:\n- RMSE càng thấp thì sai số dự báo càng nhỏ.\n- MAPE giúp đọc sai số theo %.\n- Nếu dữ liệu có mùa vụ rõ, Trend + Seasonal hoặc Holt-Winters thường phù hợp.\n- Nếu có biến giải thích X1-X5 đáng tin cậy, Multiple Linear Regression phù hợp cho dự báo theo yếu tố đầu vào.`;
}

function createTemplate(){
  const ws=XLSX.utils.json_to_sheet(demoData()),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"ForecastData");
  const guide=XLSX.utils.aoa_to_sheet([["Column","Meaning"],["Period","Time index"],["Date","Date or month"],["Target_Y","Variable to forecast"],["X1-X5","Explanatory variables"]]);
  XLSX.utils.book_append_sheet(wb,guide,"Guide"); XLSX.writeFile(wb,"Forecasting_Template_MLR_Seasonal.xlsx");
}
function loadExcel(file){
  const reader=new FileReader();reader.onload=e=>{const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"}),sheet=wb.Sheets["ForecastData"]||wb.Sheets[wb.SheetNames[0]];state.data=XLSX.utils.sheet_to_json(sheet,{defval:""});renderInput();setStatus(`Loaded ${state.data.length} rows from Excel.`);activateTab("input");};reader.readAsArrayBuffer(file);
}
function exportResults(){
  if(!state.results.length){alert("No results. Run forecast first.");return;}
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.data),"Input_Data");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.comparison),"Model_Comparison");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.results),"Forecast_Results");
  if(state.futureXDiagnostics?.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.futureXDiagnostics),"Future_X_Methods");if(state.futureXForecast?.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.futureXForecast),"Future_X_Forecast");if(state.hwDiagnostics?.rows?.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.hwDiagnostics.rows),"HW_Components");XLSX.writeFile(wb,"Forecasting_Results_Fullstack.xlsx");
}

function maybeRefresh(){ if(state.results.length) runForecast({activate:"dashboard",silent:true}); }
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>activateTab(b.dataset.tab)));
document.getElementById("btnTemplate").addEventListener("click",createTemplate);
document.getElementById("btnLoad").addEventListener("click",()=>document.getElementById("fileInput").click());
document.getElementById("fileInput").addEventListener("change",e=>{if(e.target.files[0])loadExcel(e.target.files[0]);});
document.getElementById("btnDemo").addEventListener("click",()=>{state.data=demoData();renderInput();renderFutureX();setStatus("Demo data loaded. Click RUN Forecast.");activateTab("input");});
document.getElementById("btnRun").addEventListener("click",()=>runForecast({activate:"compare"}));
document.getElementById("btnExport").addEventListener("click",exportResults);
document.getElementById("methodSelect").addEventListener("change",maybeRefresh);
document.getElementById("futureXMethod").addEventListener("change",()=>{state.futureXMethod=document.getElementById("futureXMethod").value;renderFutureX();maybeRefresh();});
document.getElementById("seasonLength").addEventListener("change",maybeRefresh);
document.getElementById("futurePeriods").addEventListener("change",()=>{state.futurePeriods=Math.max(1,Number(document.getElementById("futurePeriods").value)||6);state.horizonDisplay=Math.min(state.horizonDisplay||state.futurePeriods,state.futurePeriods);renderFutureX();maybeRefresh();});
["hwAlpha","hwBeta","hwGamma","hwAutoOptimize","seasonalTrendAdjust"].forEach(id=>document.getElementById(id)?.addEventListener("change",maybeRefresh));
const horizonSlider=document.getElementById("horizonSlider");horizonSlider?.addEventListener("input",()=>{state.horizonDisplay=Math.max(1,Number(horizonSlider.value)||1);renderForecastHorizon();});
document.getElementById("btnApplyHorizon")?.addEventListener("click",()=>{const n=Math.max(1,Number(horizonSlider.value)||6);state.horizonDisplay=n;state.futurePeriods=n;document.getElementById("futurePeriods").value=String(n);runForecast({activate:"dashboard",silent:true});});

state.data=demoData();renderInput();state.futureXMethod=document.getElementById("futureXMethod").value;state.futurePeriods=Number(document.getElementById("futurePeriods").value)||6;state.horizonDisplay=state.futurePeriods;renderFutureX();checkBackend();

/* Server selector: Auto / Home / Render (config.js reads ?api=) */
(function initServerSelect() {
  const sel = document.getElementById("backendSelect");
  if (!sel) return;
  if (["localhost", "127.0.0.1"].includes(location.hostname)) { sel.hidden = true; return; }
  let pinned = new URLSearchParams(location.search).get("api");
  try { pinned = pinned || localStorage.getItem("ose_api"); } catch (e) {}
  sel.value = ["home", "render"].includes(pinned) ? pinned : "auto";
  sel.onchange = () => { const u = new URL(location.href); u.searchParams.set("api", sel.value); location.href = u.toString(); };
})();
