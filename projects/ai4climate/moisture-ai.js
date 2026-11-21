/* Browser inference for a locally trained forest. No service, API key or uploaded data transfer. */
(function(root) {
  'use strict';
  const features = ['soil_now','soil_1h_ago','soil_6h_ago','soil_24h_ago'];
  function validateModel(m) {
    if(m?.version!==1 || JSON.stringify(m.features)!==JSON.stringify(features) || !Array.isArray(m.trees) || !m.trees.length || m.trees.length>256)throw Error('Unsupported model artifact.');
    if(!Array.isArray(m.ranges) || m.ranges.length!==4 || m.ranges.some(r=>!Array.isArray(r)||r.length!==2||r.some(v=>!Number.isFinite(v))||r[0]<0||r[1]>100||r[0]>r[1]))throw Error('Invalid training ranges.');
    for(const t of m.trees) {
      const n=t.left?.length;
      if(!n || n>4096 || ['right','feature','threshold','value'].some(k=>!Array.isArray(t[k])||t[k].length!==n))throw Error('Invalid tree arrays.');
      for(let i=0;i<n;i++) {
        if(!Number.isFinite(t.value[i])||t.value[i]<0||t.value[i]>100||!Number.isFinite(t.threshold[i]))throw Error('Invalid tree values.');
        if(t.left[i]===-1 && t.right[i]===-1)continue;
        if(!Number.isInteger(t.feature[i])||t.feature[i]<0||t.feature[i]>=4 || [t.left[i],t.right[i]].some(j=>!Number.isInteger(j)||j<=i||j>=n))throw Error('Invalid tree branches.');
      }
    }
    if(!m.metadata || !Array.isArray(m.examples) || !m.examples.length)throw Error('Missing evaluation records.');
    for(const e of m.examples) {
      if(!Array.isArray(e.features)||e.features.length!==4||e.features.some(v=>!Number.isFinite(v)||v<0||v>100)||!Number.isFinite(e.observed)||e.observed<0||e.observed>100)throw Error('Invalid evaluation record.');
      const at=Date.parse(e.at.replace(' ','T')+'Z'), target=Date.parse(e.target_at.replace(' ','T')+'Z');
      if(!Number.isFinite(at)||target-at!==86400000)throw Error('Invalid prediction horizon.');
    }
    return m;
  }
  function predict(m, input, enforceRange=true) {
    if(!Array.isArray(input)||input.length!==4||input.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>100))return {status:'unavailable',value:null,reason:'Four complete valid sensor readings are required.'};
    if(enforceRange && input.some((v,i)=>v<m.ranges[i][0]||v>m.ranges[i][1]))return {status:'unavailable',value:null,reason:'Inputs fall outside the training ranges. No prediction is shown.'};
    let sum=0;
    for(const t of m.trees) {
      let i=0,steps=0;
      while(t.left[i]!==-1) {
        if(++steps>t.left.length)throw Error('Invalid tree cycle.');
        // scikit-learn casts inputs to float32 before comparing split thresholds.
        i=Math.fround(input[t.feature[i]])<=t.threshold[i]?t.left[i]:t.right[i];
      }
      sum+=t.value[i];
    }
    const value=sum/m.trees.length;
    if(!Number.isFinite(value)||value<0||value>100)throw Error('Invalid model result.');
    return {status:'predicted',value,reason:'Historical test example; not advice for the selected field.'};
  }
  let model=null, selection=0, lastReport={status:'not_loaded',applies_to_selected_field:false};
  const $=id=>document.getElementById(id);
  function render() {
    const e=model.examples[selection], result=predict(model,e.features);
    $('aiInputs').textContent=`Completed-hour sensor means: now ${e.features[0].toFixed(1)}, 1 h earlier ${e.features[1].toFixed(1)}, 6 h earlier ${e.features[2].toFixed(1)}, 24 h earlier ${e.features[3].toFixed(1)} (0–100 sensor scale).`;
    $('aiPrediction').textContent=result.value===null?'Unavailable':result.value.toFixed(1)+' / 100';
    $('aiObserved').textContent=e.observed.toFixed(1)+' / 100';
    $('aiPersistence').textContent=e.features[0].toFixed(1)+' / 100';
    $('aiResultNote').textContent=`Origin ${e.at}; target ${e.target_at} (source local clock). ${result.reason}`;
    lastReport={status:result.status,model_id:model.metadata.id,source:model.metadata.source,
      scope:model.metadata.scope,applies_to_selected_field:false,input_at:e.at,target_at:e.target_at,
      features:Object.fromEntries(features.map((f,i)=>[f,e.features[i]])),
      predicted_sensor_scale:result.value,observed_sensor_scale:e.observed,
      persistence_sensor_scale:e.features[0],evaluation:model.metadata.metrics,limitations:model.metadata.limitations};
  }
  async function load() {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    model=null;lastReport={status:'loading',applies_to_selected_field:false};
    $('aiLoad').disabled=true;$('aiResults').hidden=true;$('aiCase').disabled=true;
    $('aiStatus').textContent='Loading the trained model and held-out records…';
    try {
      const response=await fetch('models/moisture-model.json',{signal:controller.signal});
      if(!response.ok)throw Error(`Model file returned HTTP ${response.status}.`);
      model=validateModel(await response.json());selection=0;
      $('aiCase').replaceChildren(...model.examples.map((e,i)=>{
        const option=document.createElement('option');option.value=String(i);option.textContent=e.at;return option;
      }));
      const meta=model.metadata, metrics=meta.metrics;
      $('aiStatus').textContent=`Trained Random Forest · ${meta.train_rows} training examples · ${meta.test_rows} later test examples · one sector and season.`;
      $('aiMetrics').textContent=`Held-out mean absolute error: model ${metrics.model_mae_points.toFixed(2)} sensor-scale points; unchanged-reading baseline ${metrics.persistence_mae_points.toFixed(2)} points. ${metrics.beats_persistence?'The model has lower average error on this holdout.':'The model does not beat the simple baseline on this holdout.'} These are test errors, not confidence bounds or evidence of field readiness.`;
      $('aiCase').disabled=false;$('aiResults').hidden=false;render();
    } catch(e) {
      model=null;lastReport={status:'error',applies_to_selected_field:false};
      $('aiStatus').textContent=`Model unavailable: ${e.message} Serve this folder locally and retry.`;
    } finally { clearTimeout(timer);$('aiLoad').disabled=false; }
  }
  const api={validateModel,predict,report:()=>JSON.parse(JSON.stringify(lastReport))};
  if(typeof module!=='undefined')module.exports=api;
  root.MoistureAI=api;
  if(typeof document!=='undefined') {
    $('aiLoad').addEventListener('click',load);
    $('aiCase').addEventListener('change',()=>{if(model){selection=Number($('aiCase').value);render();}});
    load();
  }
})(globalThis);
