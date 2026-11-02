import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnswerBlock } from '@birdview/contracts';
import { currency, quantity } from './api';
const colors=['#4F6FD0','#83A7C8','#9EC8B6','#B8AAD1','#D7BA91'];
export default function DataChart({block}:{block:Extract<AnswerBlock,{type:'chart'}>}) {
  const monetary=/money|receivable|pipeline|payment|invoice|revenue|minor|sales/i.test(block.metricRef);
  const display=(value:unknown)=>typeof value==='number'?monetary?currency(value):quantity(value):String(value??'');
  return <div className="bv-data-chart" role="img" aria-label={`${block.title}. ${block.data.length} valores. La tabla de fuentes está disponible en la respuesta.`}><ResponsiveContainer width="100%" height={240}>
    {block.chartType==='pie'?<PieChart><Pie data={block.data} dataKey={block.series[0]?.key} nameKey={block.xKey} innerRadius={60} outerRadius={95}>{block.data.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={display}/></PieChart>:block.chartType==='line'?<LineChart data={block.data}><CartesianGrid stroke="#edf0f5" vertical={false}/><XAxis dataKey={block.xKey} fontSize={10} tickLine={false} axisLine={false}/><YAxis fontSize={10} width={65} tickLine={false} axisLine={false} tickFormatter={display}/><Tooltip formatter={display}/>{block.series.map((series,i)=><Line key={series.key} dataKey={series.key} name={series.label} stroke={colors[i%colors.length]} strokeWidth={2} dot={false} isAnimationActive={false}/>)}</LineChart>:<BarChart data={block.data}><CartesianGrid stroke="#edf0f5" vertical={false}/><XAxis dataKey={block.xKey} fontSize={10} tickLine={false} axisLine={false}/><YAxis fontSize={10} width={65} tickLine={false} axisLine={false} tickFormatter={display}/><Tooltip formatter={display}/>{block.series.map((series,i)=><Bar key={series.key} dataKey={series.key} name={series.label} fill={colors[i%colors.length]} radius={[4,4,0,0]} isAnimationActive={false}/>)}</BarChart>}
  </ResponsiveContainer></div>;
}
