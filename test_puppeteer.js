const puppeteer = require('puppeteer-core');

async function testBrowser() {
    try {
        const browser = await puppeteer.launch({ 
            headless: true,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        });
        console.log("Browser launched successfully!");
        await browser.close();
    } catch (e) {
        console.error("Puppeteer launch failed:", e.message);
        
        // Try fallback path
        try {
            const browser2 = await puppeteer.launch({ 
                headless: true,
                executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
            });
            console.log("Browser launched successfully on x86 path!");
            await browser2.close();
        } catch (e2) {
             console.error("Puppeteer x86 fallback failed:", e2.message);
        }
    }
}
testBrowser();
