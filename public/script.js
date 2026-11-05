const $=id=>document.getElementById(id);
const state={total:120,occupied:84,patients:96,admissions:18,discharges:12,forecast:null};
const names={dashboard:"Visão geral",previsao:"Previsões da IA",treinamento:"Treinar inteligência",leitos:"Gestão de leitos",historico:"Histórico",dados:"Simular cenário"};
const fmt=n=>new Intl.NumberFormat("pt-BR").format(n);
const riskClass=r=>r==="Alto"?"risk-high":r==="Médio"?"risk-medium":"risk-low";
const API_BASE = location.port && location.port !== "3000" ? "http://localhost:3000" : "";
async function api(url,options={}){
 let response;
 try{
  response=await fetch(API_BASE+url,{headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
 }catch(error){
  throw new Error("Não foi possível conectar ao servidor. Inicie o site pelo arquivo iniciar.bat ou execute node server.js e abra http://localhost:3000.");
 }
 const raw=await response.text();
 let data={};
 if(raw.trim()){
  try{data=JSON.parse(raw);}catch{
   throw new Error("O servidor respondeu em um formato inesperado. Feche o Live Server e abra http://localhost:3000 depois de iniciar o servidor Node.js.");
  }
 }
 if(!response.ok)throw new Error(data.error||`Erro do servidor (${response.status}).`);
 if(!raw.trim())throw new Error("O servidor enviou uma resposta vazia. Reinicie o servidor com node server.js.");
 return data;
}
function navigate(page){document.querySelectorAll(".page").forEach(p=>p.classList.remove("active-page"));$("page-"+page).classList.add("active-page");document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("pageCrumb").textContent=names[page];$("sidebar").classList.remove("open");if(page==="historico")loadHistory();if(page==="leitos")renderDepartments();if(page==="dashboard"||page==="previsao")setTimeout(drawForecastCharts,60);}
document.querySelectorAll(".nav-link").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.goto)));
$("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
function updateCurrent(){
 const available=state.total-state.occupied,pct=Math.round(state.occupied/state.total*100);
 $("occupiedCount").textContent=fmt(state.occupied);$("availableCount").textContent=fmt(available);$("occupancyRate").textContent=pct;
 $("totalBedsA").textContent=fmt(state.total);$("totalBedsB").textContent=fmt(state.total)+" leitos";
 $("legendOccupied").textContent=fmt(state.occupied);$("legendAvailable").textContent=fmt(available);$("donutPercent").textContent=pct+"%";
 $("occupancyDonut").style.background=`conic-gradient(#e879a6 0 ${pct}%,#eee9ff ${pct}% 100%)`;
 $("bedsTotalPage").textContent=fmt(state.total);$("bedsOccupiedPage").textContent=fmt(state.occupied);$("bedsAvailablePage").textContent=fmt(available);
 renderDepartments();
}
function renderDepartments(){
 const parts=[["Clínica médica",.38,42],["Pediatria",.20,24],["Cirurgia",.25,30],["Maternidade",.17,24]];
 $("departmentList").innerHTML=parts.map(([name,share,total])=>{const used=Math.min(total,Math.round(state.occupied*share));const pct=Math.round(used/total*100);return `<div class="department-row"><div><strong>${name}</strong><small>${used} de ${total} ocupados</small></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="department-value">${pct}%<small> ocupação</small></div></div>`}).join("");
}
function drawChart(canvasId,values,labels){
 const c=$(canvasId);if(!c)return;const rect=c.getBoundingClientRect();const dpr=window.devicePixelRatio||1;c.width=Math.max(300,rect.width)*dpr;c.height=Math.max(160,rect.height)*dpr;const ctx=c.getContext("2d");ctx.scale(dpr,dpr);const w=c.width/dpr,h=c.height/dpr,p={l:30,r:12,t:14,b:28},cw=w-p.l-p.r,ch=h-p.t-p.b;
 ctx.font="9px Nunito";ctx.fillStyle="#ae9aa7";ctx.strokeStyle="#f3eaf0";
 [0,25,50,75,100].forEach(v=>{let y=p.t+ch-(v/100)*ch;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();ctx.fillText(v+"%",1,y+3);});
 const pts=values.map((v,i)=>({x:p.l+i/(values.length-1)*cw,y:p.t+ch-v/100*ch}));
 ctx.beginPath();pts.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));ctx.strokeStyle="#e879a6";ctx.lineWidth=2.5;ctx.stroke();
 pts.forEach(pt=>{ctx.beginPath();ctx.arc(pt.x,pt.y,3.2,0,Math.PI*2);ctx.fillStyle="#e879a6";ctx.fill();});
 ctx.fillStyle="#a895a2";ctx.textAlign="center";labels.forEach((v,i)=>ctx.fillText(v,p.l+i/(labels.length-1)*cw,h-7));
}
function drawForecastCharts(){if(!state.forecast)return;const vals=[Math.round(state.occupied/state.total*100),...state.forecast.results.map(x=>x.occupancy)];drawChart("forecastChart",vals,["Agora","+1 dia","+2 dias","+3 dias"]);drawChart("forecastChartPage",vals,["Agora","+1 dia","+2 dias","+3 dias"]);}
function renderForecast(data){
 state.forecast=data;const results=data.results;
 $("riskLabel").textContent=results[0].risk;$("tomorrowOccupancy").textContent=results[0].occupancy.toFixed(1).replace(".",",")+"%";
 $("tomorrowText").textContent="Estimativa calculada pelo modelo treinado.";
 $("riskGauge").textContent=results[0].risk==="Alto"?"!":results[0].risk==="Médio"?"~":"✓";
 [["risk24",results[0]],["risk48",results[1]],["risk72",results[2]]].forEach(([id,r])=>{const el=$(id);el.textContent=r.risk;el.className=riskClass(r.risk);});
 $("forecastCards").innerHTML=results.map(r=>`<div class="forecast-card"><span>${r.day===1?"AMANHÃ":r.day+" DIAS"}</span><strong>${r.occupancy.toFixed(1).replace(".",",")}%</strong><b class="${riskClass(r.risk)}">Risco ${r.risk.toLowerCase()}</b><small>${r.date}</small></div>`).join("");
 drawForecastCharts();
}
async function generatePrediction(){
 const input={total_leitos:Number($("totalBedsInput").value),leitos_ocupados:Number($("occupiedInput").value),atendimentos:Number($("patientsInput").value),internacoes:Number($("admissionsInput").value),altas:Number($("dischargesInput").value)};
 if(input.total_leitos<1||input.leitos_ocupados<0||input.leitos_ocupados>input.total_leitos){$("formFeedback").textContent="Confira os valores: ocupados não pode ser maior que o total.";return;}
 Object.assign(state,{total:input.total_leitos,occupied:input.leitos_ocupados,patients:input.atendimentos,admissions:input.internacoes,discharges:input.altas});
 $("formFeedback").textContent="Consultando o modelo...";
 try{const result=await api("/api/predict",{method:"POST",body:JSON.stringify(input)});updateCurrent();renderForecast(result);$("formFeedback").textContent="Previsão calculada pelo modelo de Machine Learning!";}catch(err){$("formFeedback").textContent=err.message;}
}
$("dataForm").addEventListener("submit",e=>{e.preventDefault();generatePrediction();});
$("resetDemo").addEventListener("click",()=>{$("totalBedsInput").value=120;$("occupiedInput").value=84;$("patientsInput").value=96;$("admissionsInput").value=18;$("dischargesInput").value=12;Object.assign(state,{total:120,occupied:84,patients:96,admissions:18,discharges:12});updateCurrent();$("formFeedback").textContent="Cenário de exemplo restaurado. Gere uma nova previsão.";});
let selectedCSV="";
$("csvFile").addEventListener("change",e=>{const file=e.target.files[0];selectedCSV="";$("fileName").textContent=file?file.name:"Nenhum arquivo selecionado";if(!file)return;const reader=new FileReader();reader.onload=()=>selectedCSV=String(reader.result);reader.readAsText(file);});
function parseCSV(text){
 const lines=text.replace(/^\uFEFF/,"").trim().split(/\r?\n/);if(lines.length<31)throw new Error("O arquivo precisa ter pelo menos 30 registros, além do cabeçalho.");
 const headers=lines[0].split(/[;,]/).map(x=>x.trim().toLowerCase());
 const map={data:["data","date"],total_leitos:["total_leitos","total_beds","leitos_totais"],leitos_ocupados:["leitos_ocupados","occupied_beds","ocupados"],atendimentos:["atendimentos","visits","pacientes_atendidos"],internacoes:["internacoes","internações","admissions"],altas:["altas","discharges"]};
 const index={};for(const [key,aliases] of Object.entries(map))index[key]=headers.findIndex(h=>aliases.includes(h));
 const needed=["total_leitos","leitos_ocupados","atendimentos","internacoes","altas"];const missing=needed.filter(k=>index[k]<0);if(missing.length)throw new Error("Colunas ausentes: "+missing.join(", "));
 return lines.slice(1).filter(Boolean).map(line=>{const cells=line.split(/[;,]/).map(x=>x.trim());const row={};needed.forEach(k=>row[k]=Number(cells[index[k]]));row.data=index.data>=0?cells[index.data]:"";return row;});
}
async function trainWithRows(rows){
 $("trainFeedback").textContent="Treinando o modelo... aguarde.";
 try{const result=await api("/api/train",{method:"POST",body:JSON.stringify({rows})});$("trainFeedback").textContent=result.message+" Agora gere uma previsão na aba Simular cenário.";showTraining(result.trainingInfo);await loadStatus();}catch(err){$("trainFeedback").textContent=err.message;}
}
$("trainButton").addEventListener("click",()=>{try{if(!selectedCSV)throw new Error("Escolha um arquivo CSV primeiro.");trainWithRows(parseCSV(selectedCSV));}catch(err){$("trainFeedback").textContent=err.message;}});
$("useDemo").addEventListener("click",async()=>{try{$("trainFeedback").textContent="Carregando base de exemplo...";const res=await api("/api/demo-data");const rows=parseCSV(res.csv);await trainWithRows(rows);}catch(err){$("trainFeedback").textContent=err.message;}});
function showTraining(info){
 if(!info)return;$("trainedBadge").textContent="TREINADO";$("trainRecords").textContent=info.records;$("trainSamples").textContent=info.trainSamples;$("testSamples").textContent=info.testSamples;$("trainMae").textContent=info.mae+" p.p.";
 $("metricRecords").textContent=info.records;$("metricMae").textContent=info.mae+" p.p.";$("metricTest").textContent=info.testSamples;
}
async function loadStatus(){
 try{const s=await api("/api/status");$("modelStatusSide").textContent=s.trained?"Modelo treinado":"Modelo indisponível";if(s.trainingInfo)showTraining(s.trainingInfo);}catch{$("modelStatusSide").textContent="Servidor desconectado";}
}
async function loadHistory(){
 try{const {rows}=await api("/api/history");$("historyTable").innerHTML=rows.slice().reverse().map(r=>{const available=r.total_leitos-r.leitos_ocupados;return `<tr><td>${r.data||"Sem data"}</td><td>${r.leitos_ocupados}</td><td>${available}</td><td>${r.ocupacao.toFixed(1)}%</td><td>${r.atendimentos}</td></tr>`}).join("");}catch(err){$("historyTable").innerHTML=`<tr><td colspan="5">${err.message}</td></tr>`;}
}
const now=new Date();$("todayLabel").textContent=now.toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"});$("dateShort").textContent=now.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
updateCurrent();loadStatus();loadHistory();
window.addEventListener("resize",()=>{clearTimeout(window.chartTimer);window.chartTimer=setTimeout(drawForecastCharts,120);});
