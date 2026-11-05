const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const PORT = process.env.PORT || 3000;

let model = null;
let trainingInfo = null;
let history = [];
let lastForecast = [];

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 3) throw new Error("O CSV precisa ter pelo menos 2 linhas de dados.");
  const headers = lines[0].split(",").map(x => x.trim().toLowerCase());
  const aliases = {
    data: ["data", "date"],
    total_leitos: ["total_leitos", "total_beds", "leitos_totais"],
    leitos_ocupados: ["leitos_ocupados", "occupied_beds", "ocupados"],
    atendimentos: ["atendimentos", "visits", "pacientes_atendidos"],
    internacoes: ["internacoes", "admissions"],
    altas: ["altas", "discharges"]
  };
  const idx = {};
  for (const [key, names] of Object.entries(aliases)) {
    idx[key] = headers.findIndex(h => names.includes(h));
  }
  const required = ["total_leitos", "leitos_ocupados", "atendimentos", "internacoes", "altas"];
  const missing = required.filter(k => idx[k] < 0);
  if (missing.length) throw new Error("Colunas ausentes no CSV: " + missing.join(", "));
  return lines.slice(1).map(line => {
    const cells = line.split(",").map(x => x.trim());
    const row = {};
    for (const key of required) row[key] = Number(cells[idx[key]]);
    row.data = idx.data >= 0 ? cells[idx.data] : "";
    return row;
  });
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length < 30) throw new Error("Envie pelo menos 30 registros históricos para treinar o modelo.");
  return rows.map((r, i) => {
    const item = {};
    for (const key of ["total_leitos","leitos_ocupados","atendimentos","internacoes","altas"]) {
      item[key] = Number(r[key]);
      if (!Number.isFinite(item[key]) || item[key] < 0) throw new Error(`Valor inválido na linha ${i+1}: ${key}.`);
    }
    if (item.total_leitos <= 0 || item.leitos_ocupados > item.total_leitos) throw new Error(`Confira o total e os leitos ocupados na linha ${i+1}.`);
    item.data = r.data || "";
    return item;
  });
}

function weekdayFromDate(value, fallback) {
  if (value) {
    const d = new Date(value + "T12:00:00");
    if (!Number.isNaN(d.getTime())) return d.getDay();
  }
  return fallback % 7;
}

function featureFrom(row, nextWeekday) {
  const occupancy = row.leitos_ocupados / row.total_leitos * 100;
  return [occupancy, row.atendimentos, row.internacoes, row.altas, nextWeekday];
}

function dot(a,b) { return a.reduce((s,v,i)=>s+v*b[i],0); }
function mean(arr) { return arr.reduce((a,b)=>a+b,0)/arr.length; }
function std(arr) { const m=mean(arr); return Math.sqrt(mean(arr.map(x=>(x-m)**2))) || 1; }

function train(rows) {
  const samples=[];
  for(let i=0;i<rows.length-1;i++){
    const nextDay = weekdayFromDate(rows[i+1].data, i+1);
    const x=featureFrom(rows[i],nextDay);
    const y=rows[i+1].leitos_ocupados/rows[i+1].total_leitos*100;
    samples.push({x,y});
  }
  // Chronological holdout: final 20% is kept aside for evaluation.
  const split=Math.max(10,Math.floor(samples.length*0.8));
  const trainSet=samples.slice(0,split), testSet=samples.slice(split);
  const means=[], scales=[];
  for(let j=0;j<5;j++){
    const col=trainSet.map(s=>s.x[j]); means[j]=mean(col); scales[j]=std(col);
  }
  const norm=x=>x.map((v,j)=>(v-means[j])/scales[j]);
  const X=trainSet.map(s=>[1,...norm(s.x)]);
  const ys=trainSet.map(s=>s.y);
  const weights=[mean(ys),0,0,0,0,0];
  const rate=0.025, epochs=6500;
  for(let epoch=0;epoch<epochs;epoch++){
    const grads=new Array(6).fill(0);
    for(let i=0;i<X.length;i++){
      const error=dot(X[i],weights)-ys[i];
      for(let j=0;j<6;j++) grads[j]+=error*X[i][j];
    }
    for(let j=0;j<6;j++) weights[j]-=rate*(grads[j]/X.length);
  }
  const predict=x=>Math.max(0,Math.min(100,dot([1,...norm(x)],weights)));
  const errors=testSet.map(s=>Math.abs(predict(s.x)-s.y));
  const mae=errors.length?mean(errors):0;
  const baselineErrors=testSet.map(s=>Math.abs(s.x[0]-s.y));
  const baseline=baselineErrors.length?mean(baselineErrors):0;
  model={means,scales,weights};
  history=rows;
  trainingInfo={
    records: rows.length,
    samples: samples.length,
    trainSamples: trainSet.length,
    testSamples: testSet.length,
    mae: Number(mae.toFixed(2)),
    baselineMae: Number(baseline.toFixed(2)),
    trainedAt: new Date().toISOString(),
    features: ["ocupação atual (%)","atendimentos","internações","altas","dia da semana"]
  };
  return trainingInfo;
}

function predictOne(features) {
  if(!model) throw new Error("Treine o modelo antes de gerar previsões.");
  const normalized=features.map((v,j)=>(v-model.means[j])/model.scales[j]);
  const value=model.weights[0]+normalized.reduce((s,v,j)=>s+v*model.weights[j+1],0);
  return Math.max(0,Math.min(100,value));
}

function makeForecast(input) {
  if(!model || !history.length) throw new Error("Ainda não há modelo treinado.");
  const last=history[history.length-1];
  const total=Number(input.total_leitos);
  let occupancy=Number(input.leitos_ocupados)/total*100;
  if(!Number.isFinite(occupancy) || total<=0 || occupancy<0 || occupancy>100) throw new Error("Confira o total de leitos e a quantidade ocupada.");
  const avg=(key)=>mean(history.slice(-14).map(r=>r[key]));
  const visits=Number(input.atendimentos ?? avg("atendimentos"));
  const admissions=Number(input.internacoes ?? avg("internacoes"));
  const discharges=Number(input.altas ?? avg("altas"));
  const baseDate=new Date();
  const results=[];
  for(let day=1;day<=3;day++){
    const future=new Date(baseDate); future.setDate(baseDate.getDate()+day);
    const features=[occupancy,visits,admissions,discharges,future.getDay()];
    const predicted=predictOne(features);
    const risk=predicted>=85?"Alto":predicted>=70?"Médio":"Baixo";
    results.push({day, date:future.toLocaleDateString("pt-BR"), occupancy:Number(predicted.toFixed(1)), risk});
    occupancy=predicted;
  }
  lastForecast=results;
  return {results, inputs:{total_leitos:total,leitos_ocupados:Number(input.leitos_ocupados),atendimentos:visits,internacoes:admissions,altas:discharges}};
}

function send(res,status,data,headers={}) {
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",...headers});
  res.end(JSON.stringify(data));
}
function serveStatic(req,res) {
  let pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  if(pathname==="/") pathname="/index.html";
  const file=path.normalize(path.join(PUBLIC,pathname));
  if(!file.startsWith(PUBLIC)) return send(res,403,{error:"Acesso negado."});
  fs.readFile(file,(err,content)=>{
    if(err) return send(res,404,{error:"Arquivo não encontrado."});
    const ext=path.extname(file);
    const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".ico":"image/x-icon"};
    res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream"});
    res.end(content);
  });
}
function readBody(req) {
  return new Promise((resolve,reject)=>{
    let body="";
    req.on("data",chunk=>{body+=chunk;if(body.length>5_000_000) reject(new Error("Arquivo muito grande."));});
    req.on("end",()=>{try{resolve(JSON.parse(body||"{}"));}catch{reject(new Error("JSON inválido."));}});
    req.on("error",reject);
  });
}

const server=http.createServer(async(req,res)=>{
  if(req.method==="GET" && req.url==="/api/status"){
    return send(res,200,{trained:!!model,trainingInfo,historyCount:history.length,latest:history.at(-1)||null,lastForecast});
  }
  if(req.method==="POST" && req.url==="/api/train"){
    try{
      const body=await readBody(req);
      const rows=validateRows(body.rows);
      const info=train(rows);
      return send(res,200,{message:"Modelo treinado com sucesso.",trainingInfo:info});
    }catch(err){return send(res,400,{error:err.message});}
  }
  if(req.method==="POST" && req.url==="/api/predict"){
    try{
      const body=await readBody(req);
      return send(res,200,makeForecast(body));
    }catch(err){return send(res,400,{error:err.message});}
  }
  if(req.method==="GET" && req.url==="/api/history"){
    return send(res,200,{rows:history.slice(-30).map(r=>({...r,ocupacao:Number((r.leitos_ocupados/r.total_leitos*100).toFixed(1))}))});
  }
  if(req.method==="GET" && req.url==="/api/demo-data"){
    try { const csv=fs.readFileSync(path.join(ROOT,"data","historico_exemplo.csv"),"utf8"); return send(res,200,{csv}); }
    catch(err) { return send(res,500,{error:"Base de demonstração indisponível."}); }
  }
  if(req.method==="GET" && req.url==="/api/demo-csv"){
    try { const csv=fs.readFileSync(path.join(ROOT,"data","historico_exemplo.csv"),"utf8"); res.writeHead(200,{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=historico_exemplo.csv"}); return res.end(csv); }
    catch(err) { return send(res,500,{error:"Base de demonstração indisponível."}); }
  }
  if(req.method==="GET") return serveStatic(req,res);
  return send(res,405,{error:"Método não permitido."});
});

// Start with the included, explicitly synthetic sample so the demonstration works immediately.
try{
  const csv=fs.readFileSync(path.join(ROOT,"data","historico_exemplo.csv"),"utf8");
  train(parseCSV(csv));
}catch(err){console.error("Não foi possível carregar a base de demonstração:",err.message);}
server.listen(PORT,()=>console.log(`Hospital Sem Lotação rodando em http://localhost:${PORT}`));
