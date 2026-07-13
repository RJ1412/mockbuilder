const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const Jimp = require('jimp');

async function extractImages() {
  const data = new Uint8Array(fs.readFileSync('C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf'));
  const loadingTask = pdfjsLib.getDocument({ 
      data, 
      verbosity: 0,
      standardFontDataUrl: path.join(__dirname, 'node_modules/pdfjs-dist/standard_fonts/')
  });
  const pdfDocument = await loadingTask.promise;
  
  const page = await pdfDocument.getPage(9);
  const ops = await page.getOperatorList();
  
  for (let j = 0; j < ops.fnArray.length; j++) {
    if (ops.fnArray[j] === pdfjsLib.OPS.paintImageXObject || ops.fnArray[j] === pdfjsLib.OPS.paintJpegXObject) {
      const objId = ops.argsArray[j][0];
      const imgData = await page.objs.get(objId);
      
      console.log(`Found image: ${objId}, width: ${imgData.width}, height: ${imgData.height}`);
      
      const img = new Jimp(imgData.width, imgData.height);
      let dataIdx = 0;
      const isRGBA = imgData.data.length === imgData.width * imgData.height * 4;
      const isRGB = imgData.data.length === imgData.width * imgData.height * 3;
      const isGray = imgData.data.length === imgData.width * imgData.height;

      if (!isRGBA && !isRGB && !isGray) {
          console.log(`Unsupported format, len=${imgData.data.length}, w*h=${imgData.width*imgData.height}`);
          continue;
      }

      for (let y = 0; y < imgData.height; y++) {
        for (let x = 0; x < imgData.width; x++) {
          let r, g, b, a = 255;
          if (isRGBA) {
              r = imgData.data[dataIdx++];
              g = imgData.data[dataIdx++];
              b = imgData.data[dataIdx++];
              a = imgData.data[dataIdx++];
          } else if (isRGB) {
              r = imgData.data[dataIdx++];
              g = imgData.data[dataIdx++];
              b = imgData.data[dataIdx++];
          } else if (isGray) {
              r = g = b = imgData.data[dataIdx++];
          }
          img.setPixelColor(Jimp.rgbaToInt(r, g, b, a), x, y);
        }
      }
      const b64 = await img.getBase64Async(Jimp.MIME_PNG);
      console.log(`Base64 ready! length: ${b64.length}`);
      return; 
    }
  }
}
extractImages().catch(console.error);
