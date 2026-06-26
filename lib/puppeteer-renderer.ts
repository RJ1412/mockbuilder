import puppeteer, { Browser } from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

export class PdfImageExtractor {
    private browser: Browser | null = null;

    async init() {
        const x64Path = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        const x86Path = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
        const chromePath = fs.existsSync(x64Path) ? x64Path : (fs.existsSync(x86Path) ? x86Path : null);
        
        if (!chromePath) {
            console.error("Chrome not found!");
            return;
        }

        this.browser = await puppeteer.launch({ 
            headless: true,
            executablePath: chromePath
        });
    }

    async extractVectorImage(pdfBase64: string, pageNum: number, bbox: { x0: number, y0: number, x1: number, y1: number }): Promise<string | null> {
        if (!this.browser) return null;

        try {
            const page = await this.browser.newPage();

            // Create HTML with pdf.js
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
                <style>body { margin: 0; padding: 0; }</style>
            </head>
            <body>
                <canvas id="pdf-canvas"></canvas>
                <script>
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                    
                    async function renderPDF() {
                        const pdfData = atob('${pdfBase64}');
                        const uint8Array = new Uint8Array(pdfData.length);
                        for (let i = 0; i < pdfData.length; i++) {
                            uint8Array[i] = pdfData.charCodeAt(i);
                        }
                        
                        const loadingTask = pdfjsLib.getDocument({data: uint8Array});
                        const pdf = await loadingTask.promise;
                        const page = await pdf.getPage(${pageNum});
                        
                        const viewport = page.getViewport({scale: 2.0}); // Render at 2x for high quality
                        
                        const canvas = document.getElementById('pdf-canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        const renderContext = {
                            canvasContext: context,
                            viewport: viewport
                        };
                        await page.render(renderContext).promise;
                        
                        // Crop the canvas to the bounding box
                        // The bounding box is based on scale 1.0, so multiply by 2.0
                        const cropCanvas = document.createElement('canvas');
                        const sx = ${bbox.x0} * 2.0 - 10;
                        const sy = ${bbox.y0} * 2.0 - 10;
                        const sWidth = (${bbox.x1} - ${bbox.x0}) * 2.0 + 20;
                        const sHeight = (${bbox.y1} - ${bbox.y0}) * 2.0 + 20;
                        
                        cropCanvas.width = sWidth;
                        cropCanvas.height = sHeight;
                        const cropCtx = cropCanvas.getContext('2d');
                        
                        cropCtx.fillStyle = 'white';
                        cropCtx.fillRect(0, 0, sWidth, sHeight);
                        
                        cropCtx.drawImage(canvas, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
                        
                        window.renderResult = cropCanvas.toDataURL('image/png');
                    }
                    
                    renderPDF().catch(e => window.renderError = e.toString());
                </script>
            </body>
            </html>
            `;

            await page.setContent(html);
            
            // Wait for rendering to complete
            await page.waitForFunction('window.renderResult !== undefined || window.renderError !== undefined', { timeout: 15000 });
            
            const result = await page.evaluate(() => {
                // @ts-ignore
                if (window.renderError) throw new Error(window.renderError);
                // @ts-ignore
                return window.renderResult;
            });

            await page.close();
            return result as string;
        } catch (e) {
            console.error("Puppeteer extraction error:", e);
            return null;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
