import { PDFDocument,StandardFonts,rgb } from 'pdf-lib';
import type { ReportSnapshot } from '@birdview/analytics';
export async function renderBrowserPdf(snapshot:ReportSnapshot,slides?:Array<{title:string;text:string}>):Promise<Uint8Array>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);let page=pdf.addPage([595,842]),y=790;
 const safe=(value:unknown)=>String(value??'').normalize('NFC').replace(/[^\x20-\x7e\xa0-\xff\u20ac]/g,' ');
 function line(value:unknown,size=10,strong=false){const text=safe(value),width=Math.max(30,Math.floor(95*10/size));for(let offset=0;offset<text.length||offset===0;offset+=width){if(y<55){page=pdf.addPage([595,842]);y=790;}page.drawText(text.slice(offset,offset+width),{x:42,y,size,font:strong?bold:font,color:rgb(.16,.22,.33)});y-=size+7;}}
 line('BirdView · Demo gratuita de pruebas',11,true);line(slides?'Presentación':snapshot.title,22,true);line('Datos ficticios · Documento generado en este navegador',9);line(`Fecha de corte: ${snapshot.asOf} · Divisa: ${snapshot.currency}`,9);y-=15;
 if(slides){for(const slide of slides){line(slide.title,18,true);for(const text of slide.text.split('\n'))line(text,12);y-=20;}}
 else{
  for(const metric of snapshot.kpis){const value=metric.value===null?'N/A':metric.format==='money'?new Intl.NumberFormat('es-ES',{style:'currency',currency:metric.currency||snapshot.currency}).format(metric.value/100):`${metric.value}${metric.format==='percent'?' %':''}`;line(`${metric.label}: ${value}`,12,true);}
  for(const table of snapshot.tables){y-=10;line(table.title,14,true);line(table.columns.map(c=>c.label).join(' | '),9,true);for(const row of table.rows)line(table.columns.map(c=>row[c.key]??'—').join(' | '),8);}
  line('Metodología',14,true);for(const text of snapshot.methodology)line(text,9);for(const warning of snapshot.coverage.warnings)line(warning,9);
  line('Fuentes y fecha de observación',14,true);for(const source of snapshot.sources)line(`${source.provider} · ${source.label} · ${source.observedAt}`,8);
 }
 pdf.setTitle(snapshot.title);pdf.setProducer('BirdView browser demo');return pdf.save();
}
