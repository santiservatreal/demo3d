import { chromium } from '@playwright/test';
import type { ReportSnapshot } from '@birdview/analytics';
import {renderReportCsvText,renderChartSvgText} from './render.js';
export * from './render.js';
export * from './storage.js';
export const renderReportCsv=(snapshot:ReportSnapshot)=>Buffer.from(renderReportCsvText(snapshot),'utf8');
export const renderChartSvg=(snapshot:ReportSnapshot)=>Buffer.from(renderChartSvgText(snapshot),'utf8');
export async function renderPdf(html:string):Promise<Buffer> {
  if (html.length > 5_000_000) throw new Error('Report size limit exceeded');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context = await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});
    await context.route('**/*',route => route.abort('blockedbyclient'));
    const page = await context.newPage();
    await page.setContent(html,{waitUntil:'load',timeout:10_000});
    return await page.pdf({format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:9px Arial;width:100%;text-align:center;color:#667085">Bird View · Página <span class="pageNumber"></span> / <span class="totalPages"></span></div>',margin:{top:'16mm',bottom:'20mm',left:'16mm',right:'16mm'}});
  } finally { await browser.close(); }
}
