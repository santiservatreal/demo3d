import { chromium, expect } from '@playwright/test';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:5173');await expect(page.locator('canvas')).toBeVisible();await expect(page.locator('.district-label')).toHaveCount(5);await page.waitForTimeout(600);
 // Exercise actual rendered building selection through raycasting.
 const canvas=page.locator('canvas'),bounds=await canvas.boundingBox();let picked=false;
 for(let y=.3;y<.77&&!picked;y+=.06)for(let x=.3;x<.72&&!picked;x+=.04){await page.mouse.move(bounds.x+bounds.width*x,bounds.y+bounds.height*y);if(await page.locator('#building-tooltip').isVisible()){await page.mouse.click(bounds.x+bounds.width*x,bounds.y+bounds.height*y);picked=true;}}
 expect(picked,'A rendered building must be selectable').toBeTruthy();await expect(page.locator('#detail-panel')).toBeVisible();await page.locator('#follow-up').click();await expect(page.locator('#follow-up')).toBeDisabled();await page.locator('#close-detail').click();
 await page.locator('[data-layer="health"]').click();await expect(page.locator('[data-layer="health"]')).toHaveClass(/selected/);
 await page.locator('[data-view="pipeline"]').click();await expect(page.locator('.deal-card')).toHaveCount(32);await page.locator('.deal-card').first().click();await expect(page.locator('#detail-panel')).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('#workspace').click();await page.locator('[data-profile="restaurant"]').click();await expect(page.locator('#workspace-name')).toHaveText('Casa Oliva');await expect(page.locator('.deal-card')).toHaveCount(48);
 await page.locator('#date').click();await page.locator('[data-period="7"]').click();await expect(page.locator('#date')).toContainText('7 días');
 await page.locator('#connect').click();await page.locator('[data-crm="HubSpot"]').click();await expect(page.getByText('Conector pendiente de implementación.',{exact:false})).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('[data-nav="team"]').click();await expect(page.locator('.team-list>div')).toHaveCount(6);await page.keyboard.press('Escape');await page.locator('[data-nav="insights"]').click();await expect(page.locator('.bar-track')).toHaveCount(5);await page.keyboard.press('Escape');
 await page.locator('#workspace').click();await page.locator('[data-profile="services"]').click();await page.locator('#date').click();await page.locator('[data-period="30"]').click();await page.locator('[data-view="city"]').click();await page.locator('[data-layer="value"]').click();await expect(page.locator('#toast')).not.toHaveClass(/show/);await page.screenshot({path:'/tmp/atlas-checks/desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile has no horizontal overflow').toBeTruthy();await expect(canvas).toBeVisible();await page.screenshot({path:'/tmp/atlas-checks/mobile.png',fullPage:true});
 expect(errors).toEqual([]);console.log('PASS: 3D rendering and selection, follow-up, health layer, pipeline, business profiles, periods, CRM disclosure, team, statistics, mobile layout; no JS errors.');
} finally {await browser.close()}
