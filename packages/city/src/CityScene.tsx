import { useMemo, useState } from 'react';
import type { CityDistrict, CityViewModel } from '@birdview/contracts';

export interface CitySelection { districtId: string; entityId?: string; label: string; }
export interface CitySceneProps {
  model: CityViewModel; focusedDistrictId?: string | null; table?: boolean;
  onFocus?: (district: CityDistrict) => void; onAsk?: (selection: CitySelection) => void;
}
const palette = ['#9ebee9','#acd4c0','#c6bae4','#e4c99f','#ddb2b3','#b8ccd5','#cdc5a5','#afc9c9'];
const hash = (value: string) => [...value].reduce((v, c) => (v * 31 + c.charCodeAt(0)) >>> 0, 7);
function Building({ x, y, size, height, roof }: {x:number;y:number;size:number;height:number;roof:string}) {
  const depth = size, w = size;
  return <g aria-hidden="true">
    <polygon points={`${x-w},${y-depth/2} ${x},${y} ${x+w},${y-depth/2} ${x},${y-depth}`} fill="#677c9824" transform="translate(6 3)" />
    <polygon points={`${x-w},${y-depth/2-height} ${x},${y-height} ${x},${y} ${x-w},${y-depth/2}`} fill="#d8e0e7" stroke="#b8c6d6" strokeWidth=".7" />
    <polygon points={`${x},${y-height} ${x+w},${y-depth/2-height} ${x+w},${y-depth/2} ${x},${y}`} fill="#f8fafb" stroke="#c4d0dd" strokeWidth=".7" />
    <polygon points={`${x-w},${y-depth/2-height} ${x},${y-height-depth} ${x+w},${y-depth/2-height} ${x},${y-height}`} fill={roof} stroke="#bdcad8" strokeWidth=".7" />
    {Array.from({length:Math.max(1,Math.floor(height/12))},(_,i)=><g key={i}>
      <path d={`M ${x-w+4} ${y-height-depth/2+8+i*12} l ${w-8} ${(w-8)/2} v 5 l ${-w+8} ${(-w+8)/2} Z`} fill="#7894ae" />
      <path d={`M ${x+4} ${y-height+8+i*12} l ${w-8} ${-(w-8)/2} v 5 l ${-w+8} ${(w-8)/2} Z`} fill="#97afc7" />
    </g>)}
  </g>;
}
export function CityScene({ model, focusedDistrictId, table = false, onFocus, onAsk }: CitySceneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const districts = model.districts.slice(0, 8);
  const selected = districts.find(d => d.id === selectedId) || districts.find(d => d.id === focusedDistrictId);
  const geometry = useMemo(() => {
    const columns = Math.min(2, Math.max(1, districts.length));
    return districts.map((district,index) => ({ district, x:(index%columns+.5)*600/columns, y:100+Math.floor(index/columns)*230, width:Math.min(270,600/columns-20), tint:palette[hash(district.module)%palette.length] }));
  }, [model]);
  function select(district: CityDistrict) { setSelectedId(district.id); onFocus?.(district); }
  return <div className="bv-city-scene" data-city-scene>
    {table ? <div className="bv-city-table-scroll"><table className="bv-table"><thead><tr><th>Zona</th><th>Indicador</th><th>Valor</th><th>Atención</th></tr></thead><tbody>{districts.map(d=><tr key={d.id}><td><button className="bv-text-button" onClick={()=>select(d)}>{d.name}</button></td><td>{d.metricLabel}</td><td>{d.formatted}</td><td>{d.alertCount ? `${d.alertCount} pendientes` : 'Sin alertas'}</td></tr>)}</tbody></table></div> : <svg className="bv-city-svg" viewBox={`0 0 600 ${Math.ceil(districts.length/2)*230+50}`} role="group" aria-label={`Ciudad de tu empresa. ${districts.length} zonas autorizadas. La altura de los edificios es decorativa.`}>
      <defs><filter id="birdview-city-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#5a7195" floodOpacity=".13" /></filter></defs>
      {geometry.map(({district:d,x,y,width,tint})=>{
        const h=width/2, active = d.id === focusedDistrictId || d.id === selectedId;
        const nodes=d.entities.slice(0,6);
        return <g key={d.id} className={`bv-city-district ${active ? 'is-focused':''}`} role="button" tabIndex={0} aria-label={`${d.name}: ${d.formatted}. ${d.alertCount} avisos. Abrir detalle.`} onClick={()=>select(d)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(d);}}}>
          <title>{`${d.name} · ${d.metricLabel}: ${d.formatted} · Actualizado ${new Date(model.asOf).toLocaleDateString('es-ES')}`}</title>
          <polygon points={`${x},${y-h/2} ${x+h},${y} ${x},${y+h/2} ${x-h},${y}`} fill="#f8fafc" stroke={active?'#4F6FD0':'#cfdae6'} strokeWidth={active?3:1.5} filter="url(#birdview-city-shadow)" />
          <path d={`M ${x-h+15} ${y+1} L ${x} ${y+h/2-8} L ${x+h-15} ${y+1}`} fill="none" stroke="#d5dfeb" strokeWidth="9" />
          <path d={`M ${x-h+15} ${y+1} L ${x} ${y+h/2-8} L ${x+h-15} ${y+1}`} fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="8 8" />
          {(nodes.length?nodes:[null]).map((node,i)=>{
            const col=i%3, row=Math.floor(i/3), bx=x+(col-1)*width*.21+(row?width*.07:0), by=y-14+row*25+(Math.abs(col-1)*7);
            return <Building key={node?.id || 'empty'} x={bx} y={by} size={width*.069} height={nodes.length?22+(hash(node?.id || '')%3)*13:18} roof={nodes.length?tint:'#e5eaf0'} />;
          })}
          <g aria-hidden="true"><path d={`M ${x+h*.68} ${y+10} v-17`} stroke="#a1b2bc" strokeWidth="2" /><ellipse cx={x+h*.68} cy={y-12} rx="7" ry="10" fill="#aac7b8" /><path d={`M ${x-h*.65} ${y+12} v-13`} stroke="#a1b2bc" strokeWidth="2" /><circle cx={x-h*.65} cy={y-4} r="7" fill="#b7d1c4" /></g>
          <rect x={x-107} y={y+h/2+14} width="214" height="56" rx="10" fill="#ffffff" stroke={active?'#91a7e5':'#dbe3ed'} />
          <text x={x} y={y+h/2+34} textAnchor="middle" fill="#34445b" fontSize="18" fontFamily="Inter,sans-serif" fontWeight="600">{d.name.length>24?d.name.slice(0,23)+'…':d.name}</text>
          <text x={x} y={y+h/2+55} textAnchor="middle" fill="#6b7c91" fontSize="15" fontFamily="Inter,sans-serif">{d.formatted}</text>
          {d.alertCount>0&&<g><circle cx={x+77} cy={y+h/2+18} r="10" fill="#fff1d9" stroke="#edc681"/><text x={x+77} y={y+h/2+22} textAnchor="middle" fontSize="15" fill="#9b681f">!</text></g>}
        </g>;
      })}
    </svg>}
    {!districts.length&&<div className="bv-city-empty"><p>Tu ciudad está por construir.</p><span>Conecta una fuente o importa datos para activar las zonas autorizadas.</span></div>}
    {selected&&<section className="bv-city-selection" aria-label={`Detalle de ${selected.name}`}>
      <div className="bv-city-selection-head"><span><strong>{selected.name}</strong><small>{selected.metricLabel}</small></span><b>{selected.formatted}</b></div>
      {selected.alertCount>0&&<p className="bv-city-alert">{selected.alertCount} elementos necesitan atención.</p>}
      <div className="bv-city-entity-list">{selected.entities.slice(0,8).map(entity=><button key={entity.id} onClick={()=>onAsk?.({districtId:selected.id,entityId:entity.id,label:entity.name})}><span>{entity.name}</span><small>{entity.label || entity.status}</small><span aria-hidden="true">↗</span></button>)}</div>
      <button className="bv-city-ask" onClick={()=>onAsk?.({districtId:selected.id,label:selected.name})}>Preguntar por esta zona <span aria-hidden="true">↗</span></button>
    </section>}
    <p className="bv-city-legend">Datos autorizados · Vista agrupada · Altura decorativa<br/>Actualizado {new Date(model.asOf).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
    {model.warnings.map((warning,i)=><p className="bv-city-warning" key={i}>{warning}</p>)}
  </div>;
}
