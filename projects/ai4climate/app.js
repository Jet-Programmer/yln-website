// Prototype constants retained from the original demo; not agronomically validated.
const crops = {
  tomato: {name:'Tomatoes', kc:1.15, stage:'Flowering', days:54, target:34, health:87, water:12},
  maize: {name:'Maize', kc:1.20, stage:'Mid-season', days:72, target:32, health:84, water:14},
  wheat: {name:'Wheat', kc:1.05, stage:'Heading', days:91, target:30, health:89, water:10},
  lettuce: {name:'Lettuce', kc:0.95, stage:'Vegetative', days:32, target:36, health:91, water:8}
};
const fields = ['soil','temp','humidity','wind','rain','et0'];
const sample = () => ({soil:31, temp:24, humidity:58, wind:11, rain:0, et0:4.8,
  location:'Central Valley, CA', lat:36.77, lon:-119.42, rows:1, date:null,
  source:'Illustrative sample', sources:Object.fromEntries(fields.map(f=>[f,'Illustrative sample · undated'])),
  dates:Object.fromEntries(fields.map(f=>[f,null])), kind:'sample'});
let current = sample();
let csvRows = [];
let inputRevision = 0;
const $ = id => document.getElementById(id);
const crop = () => crops[$('cropSelect').value];
const display = (n, digits=0) => Number.isFinite(n) ? n.toFixed(digits) : 'Unavailable';

// Forecast state is deliberately separate from observations and their calculations.
const FORECAST_MAX_AGE_MS = 6 * 60 * 60 * 1000; // UI refresh policy, not a skill/accuracy claim.
const emptyForecast = () => ({status:'idle',days:[],fetchedAt:null,attemptedAt:null,error:null});
let forecast = emptyForecast();
let forecastRequest = 0;
const weatherCodes = {
  0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',
  51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',56:'Light freezing drizzle',57:'Dense freezing drizzle',
  61:'Slight rain',63:'Moderate rain',65:'Heavy rain',66:'Light freezing rain',67:'Heavy freezing rain',
  71:'Slight snow',73:'Moderate snow',75:'Heavy snow',77:'Snow grains',80:'Slight rain showers',
  81:'Moderate rain showers',82:'Violent rain showers',85:'Slight snow showers',86:'Heavy snow showers',
  95:'Thunderstorm',96:'Thunderstorm with slight hail',99:'Thunderstorm with heavy hail'
};
function forecastDate(now,timezone) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=type=>parts.find(p=>p.type===type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function parseForecast(data,location,now=new Date()) {
  if(data?.error)throw Error('Open-Meteo rejected the forecast request.');
  if(typeof data?.timezone!=='string')throw Error('Forecast timezone is missing.');
  let today;
  try{today=forecastDate(now,data.timezone);}catch{throw Error('Forecast timezone is invalid.');}
  if(data.daily_units?.rain_sum!=='mm' || data.daily_units?.showers_sum!=='mm')throw Error('Forecast rainfall units are missing or not millimetres.');
  const daily=data.daily;
  if(!Array.isArray(daily?.time) || !daily.time.length)throw Error('No daily forecast dates returned.');
  const records=new Map();let previous='';
  for(let i=0;i<daily.time.length;i++) {
    const date=daily.time[i];
    if(typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || date<=previous)throw Error('Invalid or unordered forecast dates.');
    previous=date;
    const amount=key=>Array.isArray(daily[key]) && typeof daily[key][i]==='number' && Number.isFinite(daily[key][i]) && daily[key][i]>=0?daily[key][i]:null;
    const rain=amount('rain_sum'),showers=amount('showers_sum');
    const code=Array.isArray(daily.weather_code)?daily.weather_code[i]:null;
    records.set(date,{date,rain_mm:rain,showers_mm:showers,
      rainfall_mm:rain===null || showers===null || !Number.isFinite(rain+showers)?null:rain+showers,
      weather_code:Number.isInteger(code) && Object.hasOwn(weatherCodes,code)?code:null});
  }
  const days=Array.from({length:7},(_,i)=>{
    const date=new Date(Date.parse(today)+i*86400000).toISOString().slice(0,10);
    return records.get(date) || {date,rain_mm:null,showers_mm:null,rainfall_mm:null,weather_code:null};
  });
  if(!days.some(d=>records.has(d.date)))throw Error('No dates in the current seven-day forecast window.');
  return {status:'ready',source:'Open-Meteo forecast',latitude:location.lat,longitude:location.lon,
    timezone:data.timezone,fetchedAt:now.toISOString(),attemptedAt:now.toISOString(),days,error:null};
}
function forecastAdvisory(f,state,now=new Date()) {
  const unchanged='No automatic change to irrigation depth or timing.';
  if(f.status!=='ready')return `Forecast advisory unavailable${f.status==='loading'?' while loading':''}. ${unchanged}`;
  if(f.latitude!==state.lat || f.longitude!==state.lon)return `Forecast location does not match the selected field. Fetch matching forecasts. ${unchanged}`;
  if(!Number.isFinite(Date.parse(f.fetchedAt)) || now.getTime()-Date.parse(f.fetchedAt)>FORECAST_MAX_AGE_MS || forecastDate(now,f.timezone)!==f.days[0]?.date)return `Forecast needs refreshing before review (six-hour refresh policy or local day changed). ${unchanged}`;
  const known=f.days.filter(d=>d.rainfall_mm!==null),wet=known.filter(d=>d.rainfall_mm>0);
  let message;
  if(wet.length)message=`Rain is forecast on ${wet[0].date} (${forecastRainLabel(wet[0].rainfall_mm)} mm for the whole day). Rain could reduce later irrigation need if it reaches and remains in the root zone. Review updated forecasts and field measurements before considering a smaller or later irrigation; do not delay solely on this forecast.`;
  else if(known.length===7)message='The forecast reports 0 mm of rain plus showers on all seven days. This is not a guarantee of dry weather and does not establish a need to irrigate.';
  else message='Available days show no rain, but missing rainfall values prevent a complete outlook.';
  if(!known.length)message='Rainfall amounts are unavailable. Weather-condition labels alone cannot determine irrigation need.';
  else if(known.length<7 && wet.length)message+=` Rainfall is missing on ${7-known.length} day(s); no full-period total is inferred.`;
  const baseContext=state.kind==='empty'?'Base observations are missing; supply current field records.':`The base plan uses ${state.kind==='sample'?'sample':'uploaded/historical'} inputs; verify current soil conditions.`;
  return `${message} ${unchanged} ${baseContext} Forecast rain is not effective rainfall.`;
}
function forecastRainLabel(n) { return n>0 && n<0.1?'<0.1':n.toFixed(1); }
function renderForecast() {
  $('refreshForecast').disabled=forecast.status==='loading';
  $('refreshForecast').textContent=forecast.status==='loading'?'↻ Loading…':'↻ Fetch forecast';
  $('forecastLocation').textContent=`Selected coordinates: ${current.lat.toFixed(2)}°, ${current.lon.toFixed(2)}°`;
  $('forecastStatus').textContent=forecast.status==='error'?`Forecast unavailable: ${forecast.error}`:forecast.status==='loading'?'Fetching Open-Meteo forecast…':forecast.status==='ready'?`${forecast.days.filter(d=>d.rainfall_mm!==null).length}/7 days have rainfall amounts. Forecast estimates, not observations.`:'Not fetched. Fetch the forecast for the selected coordinates.';
  $('forecastFetched').textContent=forecast.fetchedAt?`Fetched ${forecast.fetchedAt} (UTC) · daily dates: ${forecast.timezone}`:forecast.attemptedAt?`Last attempted ${forecast.attemptedAt} (UTC)`:'No forecast fetch yet';
  const today=forecast.timezone?forecastDate(new Date(),forecast.timezone):null;
  $('forecastDays').innerHTML=forecast.days.map(d=>`<article class="forecast-day"><time datetime="${d.date}">${d.date}</time><small>${d.date===today?'Today · whole day':d.date<today?'Past forecast · refresh':'Future forecast'}</small><strong>${d.rainfall_mm===null?'Unavailable':forecastRainLabel(d.rainfall_mm).replace('<','&lt;')+' mm'}</strong><span>${d.rainfall_mm===null?'Rainfall data missing':'Rain + showers'}</span><p>${d.weather_code===null?'Conditions unavailable':weatherCodes[d.weather_code]}</p></article>`).join('');
  const advisory=forecastAdvisory(forecast,current);
  $('forecastAdvisory').textContent=advisory;
  $('recForecastNote').textContent=advisory;
}
function resetForecast() {forecastRequest++;forecast=emptyForecast();}
async function refreshForecast() {
  const request=++forecastRequest,location={lat:current.lat,lon:current.lon};
  forecast={...emptyForecast(),status:'loading',attemptedAt:new Date().toISOString()};renderForecast();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=rain_sum,showers_sum,weather_code&forecast_days=7&timezone=auto&precipitation_unit=mm`;
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok)throw Error(`Open-Meteo request failed (HTTP ${response.status}).`);
    const data=await response.json();
    if(request!==forecastRequest)return;
    forecast=parseForecast(data,location);
  }catch(e){
    if(request!==forecastRequest)return;
    forecast={...emptyForecast(),status:'error',attemptedAt:forecast.attemptedAt,error:e.name==='AbortError'?'Request timed out. Try again.':e.message};
  }finally{clearTimeout(timer);if(request===forecastRequest)renderForecast();}
}

// Retains the previous dashboard formula, explicitly as an unvalidated proxy.
function temperatureProxy(temp) {
  return Number.isFinite(temp) ? Math.max(1, .0023*(temp+17.8)*Math.sqrt(Math.max(1,temp-5))) : null;
}
function calculate(state, c) {
  const soilStatus = !Number.isFinite(state.soil) ? 'Unavailable' : state.soil<c.target ? 'Below demo target' : 'At/above demo target';
  const stress = !Number.isFinite(state.soil) ? 'Unavailable' : state.soil<c.target-8 ? 'High' : state.soil<c.target-3 ? 'Moderate' : 'Low';
  const balance = Number.isFinite(state.rain) && Number.isFinite(state.et0) ? state.rain-state.et0 : null;
  const aligned = state.kind==='sample' || (state.dates.soil && state.dates.soil===state.dates.rain);
  if (!Number.isFinite(state.soil) || !Number.isFinite(state.rain) || !aligned) {
    return {soilStatus, stress, balance, action:'Review inputs', amount:null, timing:'Not scheduled',
      explanation:'A plan requires soil moisture and rainfall for the same date. Missing, mixed-date or sample inputs cannot support an uploaded/historical plan.'};
  }
  const deficit = Math.max(0,c.target-state.soil);
  const candidate = Math.max(0,Math.round(c.water+deficit*.45-state.rain*.8));
  const irrigate = state.soil<c.target-5 && candidate>0;
  return {soilStatus, stress, balance, action:irrigate?'Irrigate Zone A':'Monitor Zone A',
    amount:irrigate?candidate:0, timing:irrigate?'After field verification':'No irrigation scheduled',
    explanation:irrigate
      ? `Prototype rule suggests ${candidate} mm for the input date. Verify present field conditions before acting; this is not a current forecast or a validated prescription.`
      : `No irrigation scheduled by the prototype rule (${candidate===0?'calculated depth is zero':'soil trigger not reached'}). Soil is ${soilStatus.toLowerCase()}. No future irrigation time is predicted.`};
}
function toast(message) {
  const t=$('toast'); t.textContent=message; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),5000);
}
function updateDashboard() {
  const c=crop(), result=calculate(current,c);
  document.querySelector('.recommendation-card').hidden=false;
  $('dismissedNotice').hidden=true;
  for (const [id,field] of Object.entries({tempNow:'temp',humidity:'humidity',wind:'wind',rain:'rain',soilMoisture:'soil'})) {
    $(id).textContent=field==='soil' && Number.isFinite(current.soil)?String(current.soil):display(current[field],field==='rain'?1:0);
    $(id).title=current.sources[field] || 'Not supplied';
  }
  $('locationLabel').textContent=current.location;
  $('soilSource').textContent=current.sources.soil || 'Not supplied';
  $('soilStatus').textContent=result.soilStatus;
  $('soilTarget').textContent=c.target+'% (demo)';
  $('soilMarker').style.left=Number.isFinite(current.soil)?current.soil+'%':'0%';
  $('soilStatus').className='status-pill '+(current.soil>=c.target?'good-pill':'demo-pill');
  $('growthStage').textContent=c.stage; $('growthDays').textContent=c.days; $('kcValue').textContent=c.kc.toFixed(2);
  $('healthScore').innerHTML=`${c.health}<span>/100 sample</span>`;
  $('healthTrack').style.width=c.health+'%';
  $('stressValue').textContent=result.stress;
  $('stressMeter').style.width=(({High:82,Moderate:58,Low:30})[result.stress] || 0)+'%';
  $('stressMeter').style.background=result.stress==='High'?'#d78069':result.stress==='Moderate'?'#e0ad5d':'#70b27c';
  $('stressPill').textContent=result.stress+' · demo rule';
  $('balanceValue').textContent=display(result.balance,1);
  $('balanceSource').textContent='Calculated · '+(current.date || (current.kind==='sample'?'sample':'unavailable'));
  $('balanceSource').title=`Rain: ${current.sources.rain || 'not supplied'}; demand: ${current.sources.et0 || 'not supplied'}`;
  $('nextIrrigation').textContent=result.amount===null?'Review':result.amount>0?'Conditional':'Monitor';
  $('nextDetail').textContent=result.timing;
  $('recTitle').textContent=result.action; $('recTime').textContent=result.timing;
  $('recAmount').textContent=result.amount===null?'Unavailable':result.amount+' mm';
  $('recConfidence').textContent='Not validated'; $('recExplanation').textContent=result.explanation;
  $('factorSoil').textContent=(Number.isFinite(current.soil)?String(current.soil):'Unavailable')+'% · '+result.soilStatus;
  $('factorWeather').textContent='Demand proxy '+display(current.et0,1)+' mm · '+(current.sources.et0 || 'not supplied');
  $('factorRain').textContent=display(current.rain,1)+' mm · '+(current.sources.rain || 'not supplied')+' · observation/sample; forecast shown separately';
  $('factorCrop').textContent=c.stage+' · sample profile';
  $('sourceStatus').textContent=current.kind==='sample'?'Sample data active':current.kind==='empty'?'No observations loaded':'Historical / uploaded inputs';
  $('sourceDetail').textContent=current.source;
  $('weatherTag').textContent=current.kind==='sample'?'SAMPLE':current.kind==='uploaded'?'UPLOADED':current.kind==='empty'?'NO DATA':'HISTORICAL / PARTIAL';
  const weatherFields=['temp','humidity','wind','rain'];
  const weatherSources=new Set(weatherFields.map(f=>current.sources[f] || 'not supplied'));
  $('weatherSource').textContent=weatherSources.size===1?[...weatherSources][0]:weatherFields.map(f=>`${f}: ${current.sources[f] || 'not supplied'}`).join('; ');
  $('dataPreview').textContent=`${current.rows} input record(s) · ${current.source} · ${current.date || (current.kind==='sample'?'undated sample':'no observation date')} · Calculated indicators use unvalidated rules`;
  $('todayLabel').textContent=new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  $('updatedAt').textContent='View calculated '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  renderForecast();
}

// Small RFC-style parser: quoted commas, escaped quotes and line endings are supported.
function csvParse(text) {
  text=text.replace(/^\uFEFF/,'');
  const records=[]; let row=[],value='',quoted=false,closed=false;
  const cell=()=>{row.push(value.trim());value='';closed=false;};
  const record=()=>{cell();if(row.length>1 || row.some(v=>v!==''))records.push(row);row=[];};
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted) {
      if(ch==='"' && text[i+1]==='"'){value+='"';i++;}
      else if(ch==='"'){quoted=false;closed=true;} else value+=ch;
    } else if(ch==='"') {
      if(value || closed)throw Error('Malformed CSV quotation.'); quoted=true;
    } else if(ch===',')cell();
    else if(ch==='\n' || ch==='\r'){if(ch==='\r' && text[i+1]==='\n')i++;record();}
    else {if(closed && ch.trim())throw Error('Unexpected text after a quoted value.');value+=ch;}
  }
  if(quoted)throw Error('Unclosed CSV quotation.');
  if(value || row.length || closed)record();
  if(records.length<2)throw Error('CSV needs a header and at least one data row.');
  const keys=records.shift().map(k=>k.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
  if(keys.some(k=>!k) || new Set(keys).size!==keys.length)throw Error('CSV has empty or duplicate headers.');
  return records.map((r,i)=>{
    if(r.length!==keys.length)throw Error(`Row ${i+2}: column count does not match header.`);
    if(r.some(v=>!v))throw Error(`Row ${i+2}: missing values are not allowed; omit unused columns.`);
    return Object.fromEntries(keys.map((k,j)=>[k,r[j]]));
  });
}
const csvSchema = {
  soil:{explicit:{soil_moisture_pct:'%',soil_moisture_fraction:'fraction'},aliases:['soil_moisture','moisture','soil_vwc','vwc','sm'],unit:'soil_moisture_unit',units:['%','fraction']},
  temp:{explicit:{temperature_c:'c'},aliases:['temperature','temp','t2m'],unit:'temperature_unit',units:['c']},
  humidity:{explicit:{humidity_pct:'%'},aliases:['humidity','relative_humidity','rh2m'],unit:'humidity_unit',units:['%']},
  rain:{explicit:{rainfall_mm:'mm'},aliases:['rainfall','rain','precipitation','prectotcorr'],unit:'rainfall_unit',units:['mm']},
  wind:{explicit:{wind_kmh:'km/h',wind_speed_m_s:'m/s'},aliases:['wind','wind_speed'],unit:'wind_unit',units:['km/h','m/s']},
  et0:{explicit:{et0_mm:'mm'},aliases:[],unit:'et0_unit',units:['mm']}
};
function validateCsv(text) {
  const rows=csvParse(text), headers=Object.keys(rows[0]);
  const allowed=new Set(['date','crop',...Object.values(csvSchema).flatMap(s=>[...Object.keys(s.explicit),...s.aliases,s.unit])]);
  for(const h of headers)if(!allowed.has(h))throw Error(`Unsupported column/unit: ${h}. See README CSV contract.`);
  if(!headers.includes('date'))throw Error('date is required (YYYY-MM-DD).');
  const chosen={};
  for(const [f,s] of Object.entries(csvSchema)) {
    const present=[...Object.keys(s.explicit),...s.aliases].filter(h=>headers.includes(h));
    if(present.length>1)throw Error(`Multiple columns for ${f}.`);
    if(present.length)chosen[f]=present[0];
    else if(headers.includes(s.unit))throw Error(`${s.unit} has no measurement column.`);
  }
  if(!Object.keys(chosen).length)throw Error('No supported measurement columns.');
  let previous='';
  const observations=rows.map((r,i)=>{
    const fail=msg=>{throw Error(`Row ${i+2}: ${msg}`);};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10)!==r.date)fail('invalid date; use YYYY-MM-DD.');
    if(r.date<=previous)fail('dates must be unique and strictly increasing (oldest first).');
    previous=r.date;
    if(r.crop && !Object.hasOwn(crops,r.crop.toLowerCase()))fail('unsupported crop; use tomato, maize, wheat or lettuce.');
    const obs={date:r.date,crop:r.crop?.toLowerCase()};
    for(const [f,h] of Object.entries(chosen)) {
      const s=csvSchema[f], explicit=s.explicit[h], unit=(r[s.unit] || explicit || '').toLowerCase();
      if(!s.units.includes(unit) || (explicit && unit!==explicit))fail(`invalid or missing ${s.unit} for ${h}.`);
      if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(r[h]))fail(`${h} must be numeric without unit suffixes.`);
      let n=Number(r[h]);
      if(!Number.isFinite(n))fail(`${h} must be finite.`);
      if(f==='soil' && unit==='fraction')n*=100;
      if((f==='soil' || f==='humidity') && (n<0 || n>100))fail(`${h} must be within ${unit==='fraction'?'0–1':'0–100'}.`);
      if(['rain','wind','et0'].includes(f) && n<0)fail(`${h} cannot be negative.`);
      if(f==='temp' && n< -273.15)fail('temperature is below absolute zero.');
      if(f==='wind' && unit==='m/s')n*=3.6;
      obs[f]=n;
    }
    return obs;
  });
  return {rows,observations};
}
function ingestCsv(text,name) {
  try {
    const {rows,observations}=validateCsv(text), r=observations.at(-1);
    const next={...current, sources:{}, dates:{}, source:`Uploaded CSV · ${name}`,kind:'uploaded',rows:rows.length,date:r.date};
    for(const f of fields) {
      next[f]=r[f]??null;
      if(next[f]!==null){next.sources[f]=`Uploaded ${name} · ${r.date}`;next.dates[f]=r.date;}
    }
    if(next.et0===null && next.temp!==null){next.et0=temperatureProxy(next.temp);next.sources.et0=`Calculated temperature proxy (unvalidated) · ${r.date}`;next.dates.et0=r.date;}
    if(r.crop)$('cropSelect').value=r.crop;
    csvRows=rows; current=next; inputRevision++;updateDashboard();
    toast(`Loaded ${rows.length} records. Showing ${r.date}; omitted measurements are unavailable.`);
    return true;
  } catch(e){toast('CSV rejected: '+e.message);return false;}
}
async function refreshWeather() {
  const b=$('refreshWeather'),revision=inputRevision,lat=current.lat,lon=current.lon;
  b.disabled=true; b.textContent='↻ Connecting…';
  try {
    const end=new Date(),start=new Date(end);start.setUTCDate(end.getUTCDate()-6);
    const fmt=d=>d.toISOString().slice(0,10).replaceAll('-','');
    const response=await fetch(`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,RH2M,WS10M,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&start=${fmt(start)}&end=${fmt(end)}&format=JSON`);
    if(!response.ok)throw Error('NASA request failed');
    const data=await response.json(),p=data.properties?.parameter || {};
    const valid=(value,min,max=Infinity)=>typeof value==='number' && Number.isFinite(value) && value>=min && value<=max;
    const dates=Object.keys(p.T2M || {}).filter(d=>/^\d{8}$/.test(d) && valid(p.T2M[d],-273.15) && valid(p.RH2M?.[d],0,100) && valid(p.WS10M?.[d],0) && valid(p.PRECTOTCORR?.[d],0)).sort();
    if(!dates.length)throw Error('No complete valid daily weather records.');
    if(revision!==inputRevision){toast('Weather response discarded because inputs changed.');return;}
    const d=dates.at(-1),date=`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,source=`NASA POWER historical daily · ${date}`;
    current={...current,temp:p.T2M[d],humidity:p.RH2M[d],wind:p.WS10M[d]*3.6,rain:p.PRECTOTCORR[d],
      et0:temperatureProxy(p.T2M[d]),kind:'historical',date,source,rows:dates.length,sources:{...current.sources},dates:{...current.dates}};
    for(const f of ['temp','humidity','wind','rain','et0']){current.sources[f]=f==='et0'?`Calculated temperature proxy (unvalidated) · ${date}`:source;current.dates[f]=date;}
    inputRevision++; updateDashboard(); toast('Historical weather loaded. Forecasts are separate; no live sensors are connected.');
  }catch(e){toast('Weather unchanged: '+e.message);}
  finally{b.disabled=false;b.textContent='↻ Refresh history';}
}
function buildReport() {
  const recommendation=calculate(current,crop());
  return {generated_at:new Date().toISOString(),prototype:'Fieldwise smart irrigation decision support',
    data_source:current.source,input_date:current.date,input_kind:current.kind,field_sources:{...current.sources},field_dates:{...current.dates},
    location:{name:current.location,latitude:current.lat,longitude:current.lon},crop:{...crop(),provenance:'Unvalidated sample profile'},
    latest_observation:{soil_moisture_pct:current.soil,temperature_c:current.temp,relative_humidity_pct:current.humidity,wind_kmh:current.wind,rainfall_mm:current.rain,demand_proxy_mm:current.et0},
    recommendation:{...recommendation,estimated_depth_mm:recommendation.amount,confidence:'Not validated'},
    research_model:globalThis.MoistureAI?.report() || {status:'not_loaded',applies_to_selected_field:false},
    weather_forecast:{...forecast,advisory:forecastAdvisory(forecast,current),rainfall_definition:'rain_sum + showers_sum (mm), excludes snow',refresh_policy_hours:6},
    disclaimer:'Prototype rules and equations are not scientifically validated. Historical/sample data is not a forecast. Verify local conditions; no physical controls or live sensors are connected.'};
}
function exportReport() {
  const blob=new Blob([JSON.stringify(buildReport(),null,2)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='fieldwise-irrigation-report.json';a.click();URL.revokeObjectURL(a.href);toast('Report exported.');
}
function dismissRecommendation() {
  document.querySelector('.recommendation-card').hidden=true;
  $('dismissedNotice').hidden=false;toast('Recommendation dismissed. Recalculate to show it again.');
}
function restoreSample() {resetForecast();current=sample();csvRows=[];inputRevision++;updateDashboard();toast('Illustrative sample restored.');}
async function showDashboardView(view) {
  const isForecast=view==='7d';
  $('latestInputsBtn').className=isForecast?'':'selected';
  $('sevenDayBtn').className=isForecast?'selected':'';
  $('latestInputsBtn').ariaPressed=String(!isForecast);
  $('sevenDayBtn').ariaPressed=String(isForecast);
  $(isForecast?'forecast':'field').scrollIntoView({behavior:'smooth',block:'start'});
  if(isForecast && forecast.status!=='loading') {
    const now=new Date();
    const needsRefresh=forecast.status!=='ready' || forecast.latitude!==current.lat || forecast.longitude!==current.lon ||
      now.getTime()-Date.parse(forecast.fetchedAt)>FORECAST_MAX_AGE_MS || forecastDate(now,forecast.timezone)!==forecast.days[0]?.date;
    if(needsRefresh)await refreshForecast();
  }
}
function initialize() {
  $('latestInputsBtn').addEventListener('click',()=>showDashboardView('latest'));
  $('sevenDayBtn').addEventListener('click',()=>showDashboardView('7d'));
  $('chartPeriod').addEventListener('click',()=>showDashboardView('7d'));
  $('cropSelect').addEventListener('change',updateDashboard);
  $('refreshWeather').addEventListener('click',refreshWeather);
  $('refreshForecast').addEventListener('click',refreshForecast);
  document.addEventListener('visibilitychange',renderForecast);
  setInterval(renderForecast,60000); // Update freshness notice without making network requests.
  $('exportBtn').addEventListener('click',exportReport);
  $('recalcBtn').addEventListener('click',()=>{updateDashboard();toast('Prototype recommendation recalculated.');});
  $('dismissRec').addEventListener('click',dismissRecommendation);
  $('csvUpload').addEventListener('change',async e=>{try{const f=e.target.files[0];if(f)ingestCsv(await f.text(),f.name);}catch{toast('Could not read CSV file.');}finally{e.target.value='';}});
  $('sampleBtn').addEventListener('click',restoreSample);
  $('locationEdit').addEventListener('click',()=>{
    $('latitudeInput').value=String(current.lat);
    $('longitudeInput').value=String(current.lon);
    $('locationDialog').showModal();
  });
  $('cancelLocation').addEventListener('click',()=>$('locationDialog').close());
  $('locationForm').addEventListener('submit',e=>{
    e.preventDefault();
    const lat=$('latitudeInput').value,lon=$('longitudeInput').value;
    if(!lat.trim() || !lon.trim() || !Number.isFinite(+lat) || !Number.isFinite(+lon) || Math.abs(+lat)>90 || Math.abs(+lon)>180){toast('Enter valid coordinates.');return;}
    current={...current,lat:+lat,lon:+lon,location:`${(+lat).toFixed(2)}°, ${(+lon).toFixed(2)}°`,source:'Coordinates changed · load matching records',kind:'empty',date:null,rows:0,sources:{},dates:{}};
    for(const f of fields)current[f]=null;
    $('locationDialog').close();
    csvRows=[];inputRevision++;resetForecast();updateDashboard();toast('Location updated; previous observations and forecasts cleared.');
  });
  document.addEventListener('dragover',e=>{if(e.target.closest('.upload-row'))e.preventDefault();});
  document.addEventListener('drop',async e=>{if(!e.target.closest('.upload-row'))return;e.preventDefault();const f=e.dataTransfer.files[0];if(!f?.name.toLowerCase().endsWith('.csv')){toast('Please drop a CSV file.');return;}try{ingestCsv(await f.text(),f.name);}catch{toast('Could not read CSV file.');}});
  updateDashboard();
}
if(typeof document!=='undefined')initialize();
if(typeof module!=='undefined')module.exports={crops,sample,calculate,temperatureProxy,csvParse,validateCsv,parseForecast,forecastAdvisory,forecastDate};
