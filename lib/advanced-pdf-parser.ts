import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { PdfImageExtractor } from './puppeteer-renderer';

// Disable worker for Node.js environment to prevent Webpack bundling errors in Next.js API routes
pdfjsLib.GlobalWorkerOptions.workerPort = null as any;
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

interface Block {
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export async function parsePdfAdvanced(buffer: Buffer) {
  const imageExtractor = new PdfImageExtractor();
  await imageExtractor.init();

  const pdfBase64 = buffer.toString('base64');
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
  const pdfDocument = await loadingTask.promise;

  let allParsedText = "";
  const questions: any[] = [];
  let currentSubject = "Physics";
  const currentSection = "Section-I";

  // Configuration for margin cropping
  const topMarginPercent = 0.04;
  const bottomMarginPercent = 0.96;

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const width = viewport.width;
    const height = viewport.height;

    const textContent = await page.getTextContent();
    const items = textContent.items as TextItem[];

    const validBlocks: Block[] = [];

    // Process Text Items
    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const text = item.str;
      const transform = item.transform; // [scaleX, skewY, skewX, scaleY, translateX, translateY]
      
      const x = transform[4];
      const y = height - transform[5]; // Flip Y so 0 is top
      const fontSize = transform[0];

      // Margin strip
      if (y < height * topMarginPercent || y > height * bottomMarginPercent) {
        continue;
      }

      // Column strip (Keep only left column for 2-column ALLEN layout)
      if (x > width * 0.52) {
        continue;
      }

      // Clean up string
      let str = text.replace(/\s+/g, ' ');
      if (!str.trim() && str !== ' ') continue; // keep structural spaces

      validBlocks.push({ x, y, text: str, fontSize });
    }

    // Helper to process columns and avoid text bleed
    const processColumn = (blocks: any[]) => {
        let pageGaps: {y0: number, y1: number}[] = [];
        let colText = "";
        blocks.sort((a, b) => {
          if (Math.abs(a.y - b.y) < 10) return a.x - b.x;
          return a.y - b.y;
        });

        let lines = [];
        let currentLine = [];
        let lastY = blocks.length > 0 ? blocks[0].y : 0;

        for (const block of blocks) {
          if (Math.abs(block.y - lastY) > 10) {
            lines.push(currentLine);
            currentLine = [];
          }
          currentLine.push(block);
          lastY = block.y;
        }
        if (currentLine.length > 0) lines.push(currentLine);

        lines.sort((a, b) => {
          const avgYA = a.reduce((sum, blk) => sum + blk.y, 0) / a.length;
          const avgYB = b.reduce((sum, blk) => sum + blk.y, 0) / b.length;
          return avgYA - avgYB;
        });

        let lastLineY = -1;
        for (const line of lines) {
          line.sort((a, b) => a.x - b.x);
          const sizes = line.map(b => b.fontSize);
          const modalSize = sizes.sort((a,b) => sizes.filter(v => v===a).length - sizes.filter(v => v===b).length).pop() || 10;
          const baseline = line.reduce((sum, b) => sum + b.y, 0) / line.length;

          if (lastLineY !== -1 && (baseline - lastLineY) > 50) {
            pageGaps.push({ y0: lastLineY + 10, y1: baseline - 10 });
          }
          lastLineY = baseline;

          let lineText = "";
          let wasSuperscript = false;
          let wasSubscript = false;
          
          for (const block of line) {
            const txt = block.text;
            if (block.fontSize < 0.85 * modalSize && block.y < baseline - 2) {
              if (!wasSuperscript) lineText = lineText.trimEnd() + "^";
              lineText += txt;
              wasSuperscript = true;
              wasSubscript = false;
            } else if (block.fontSize < 0.85 * modalSize && block.y > baseline + 2) {
              if (!wasSubscript) lineText = lineText.trimEnd() + "_";
              lineText += txt;
              wasSubscript = true;
              wasSuperscript = false;
            } else {
              lineText += (lineText.length > 0 && !lineText.endsWith(" ") && !wasSuperscript && !wasSubscript ? " " : "") + txt;
              wasSuperscript = false;
              wasSubscript = false;
            }
          }
          
          // CRITICAL: Filter out headers and footers completely so they don't bleed into previous options!
          const lowerTxt = lineText.toLowerCase();
          if (lowerTxt.includes("leader test series") || 
              lowerTxt.includes("space for rough work") || 
              lowerTxt.includes("lts - page") ||
              lowerTxt.includes("e + h /") ||
              lowerTxt.includes("@jeeadvanced_2025") ||
              lowerTxt.includes("maximum marks") ||
              lowerTxt.includes("topic :")) {
              continue; // Drop this line completely
          }
          
          if (pageGaps.length > 0 && pageGaps[pageGaps.length-1].y1 === baseline - 10) {
              const gap = pageGaps[pageGaps.length-1];
              colText += `\n[IMAGE_GAP_P${i}_Y${Math.round(gap.y0)}_${Math.round(gap.y1)}]\n`;
          }
          
          colText += lineText.trim() + "\n";
        }
        return colText;
    };

    if (validBlocks.length > 0) {
       const midX = viewport.width / 2;
       const leftBlocks = validBlocks.filter(b => b.x < midX);
       const rightBlocks = validBlocks.filter(b => b.x >= midX);

       if (leftBlocks.length > 0) allParsedText += processColumn(leftBlocks);
       if (rightBlocks.length > 0) allParsedText += processColumn(rightBlocks);
    }
  }

  // Subject Tracking & Question Chunking
  const subjectSplits = allParsedText.split(/PART-\d+\s*:\s*(PHYSICS|CHEMISTRY|MATHEMATICS)/i);
  
  for (let s = 1; s < subjectSplits.length; s += 2) {
    const currentSubject = subjectSplits[s].charAt(0).toUpperCase() + subjectSplits[s].slice(1).toLowerCase();
    const subjectText = subjectSplits[s + 1];

    // Split into MCQ (Section-I) and Numerical (Section-II)
    const sectionSplits = subjectText.split(/Numerical Value/i);
    const mcqText = sectionSplits[0];
    const nvaText = sectionSplits.length > 1 ? sectionSplits[1] : "";

    // Helper to process text and extract all images
    const processQuestionText = async (rawText: string) => {
        let text = rawText;
        let imageUrl = null;
        const gapRegex = /\[IMAGE_GAP_P(\d+)_Y(\d+)_(\d+)\]/g;
        let gapMatches = Array.from(text.matchAll(gapRegex));
        
        if (gapMatches.length > 0) {
            const p = parseInt(gapMatches[0][1]);
            let minY0 = parseInt(gapMatches[0][2]);
            let maxY1 = parseInt(gapMatches[0][3]);
            for (let i = 1; i < gapMatches.length; i++) {
                if (parseInt(gapMatches[i][1]) === p) {
                    minY0 = Math.min(minY0, parseInt(gapMatches[i][2]));
                    maxY1 = Math.max(maxY1, parseInt(gapMatches[i][3]));
                }
            }
            imageUrl = await imageExtractor.extractVectorImage(pdfBase64, p, { x0: 30, y0: Math.max(0, minY0 - 20), x1: 570, y1: maxY1 + 20 });
            text = text.replace(gapRegex, '').trim();
        }
        
        // Clean trailing headers from question
        text = text.replace(/LEADER TEST SERIES[\s\S]*?(?=\n|$)/gi, '').trim();
        text = text.replace(/Space for Rough Work[\s\S]*?(?=\n|$)/gi, '').trim();
        text = text.replace(/SECTION-I/gi, '').replace(/SECTION-II/gi, '').trim();
        return { text, imageUrl };
    };

    // --- Parse MCQs ---
    const qRegex = /(?:^|\n)\s*(\d{1,2})\.\s+([\s\S]*?)(?=(?:\n\s*\d{1,2}\.\s+|$))/g;
    let match;
    while ((match = qRegex.exec(mcqText)) !== null) {
      const qNo = parseInt(match[1]);
      const { text: cleanQRaw, imageUrl } = await processQuestionText(match[2]);
      
      let qText = cleanQRaw;
      let optionA = "Option A"; let optionB = "Option B"; let optionC = "Option C"; let optionD = "Option D";
      
      const matchA = qText.match(/\([A]\)\s*/i);
      const matchB = qText.match(/\([B]\)\s*/i);
      const matchC = qText.match(/\([C]\)\s*/i);
      const matchD = qText.match(/\([D]\)\s*/i);
      
      if (matchA && matchB && matchC && matchD) {
          const idxA = matchA.index;
          const idxB = matchB.index;
          const idxC = matchC.index;
          const idxD = matchD.index;
          
          if (idxA !== undefined && idxB !== undefined && idxC !== undefined && idxD !== undefined && idxA < idxB && idxB < idxC && idxC < idxD) {
              qText = cleanQRaw.substring(0, idxA).trim();
              optionA = cleanQRaw.substring(idxA + matchA[0].length, idxB).trim();
              optionB = cleanQRaw.substring(idxB + matchB[0].length, idxC).trim();
              optionC = cleanQRaw.substring(idxC + matchC[0].length, idxD).trim();
              optionD = cleanQRaw.substring(idxD + matchD[0].length).trim();
          }
      } else {
          // Fallback if strict ABCD matches fail, just leave it in qText or split safely
          const optRegex = /(?:^|\s|\n)\([A-D]\)\s*/i;
          const parts = cleanQRaw.split(optRegex);
          qText = parts[0].trim();
          if (parts.length > 1) optionA = parts[1].trim();
          if (parts.length > 2) optionB = parts[2].trim();
          if (parts.length > 3) optionC = parts[3].trim();
          if (parts.length > 4) optionD = parts[4].trim();
      }

      if (qText.length > 3) {
        questions.push({
          id: `${currentSubject.toLowerCase()}-sec1-q${qNo}`,
          questionNo: qNo,
          subject: currentSubject,
          section: "Section-I",
          questionText: qText,
          type: "MCQ",
          optionA,
          optionB,
          optionC,
          optionD,
          imageUrl: imageUrl,
          correctAnswer: "",
        });
      }
    }

    // --- Parse Numerical Value Questions (NVA) ---
    if (nvaText) {
      let nvaMatch;
      while ((nvaMatch = qRegex.exec(nvaText)) !== null) {
        const qNo = parseInt(nvaMatch[1]);
        const { text: qText, imageUrl } = await processQuestionText(nvaMatch[2]);
        
        if (qText.length > 3) {
          questions.push({
            id: `${currentSubject.toLowerCase()}-sec2-q${qNo}`,
            questionNo: qNo,
            subject: currentSubject,
            section: "Section-II",
            questionText: qText,
            type: "NUMERICAL",
            imageUrl: imageUrl,
            correctAnswer: "",
          });
        }
      }
    }
  }

  // --- Extract Genuine Answer Key (If exists at the end of the PDF) ---
  const answerKeyMap: Record<number, string> = {};
  
  // Look for common answer key patterns in the entire text
  // Pattern 1: 1. A  2. B  3. C  (Linear list)
  const keyRegex1 = /(?:Q\.|Q)?\s*(\d{1,3})\s*[\.\-\:]?\s*([A-D]|(?:[0-9]+(?:\.[0-9]+)?))/gi;
  let match;
  // We only search the last 20% of the text to avoid matching question numbers in the body
  const searchRegion = allParsedText.substring(Math.floor(allParsedText.length * 0.8));
  while ((match = keyRegex1.exec(searchRegion)) !== null) {
    const qNum = parseInt(match[1]);
    const ans = match[2].toUpperCase();
    // Only map if it's a valid option or number, and we don't overwrite blindly
    if (!answerKeyMap[qNum]) {
      answerKeyMap[qNum] = ans;
    }
  }

  // Map genuine answers to questions
  for (let i = 0; i < questions.length; i++) {
    const qNum = i + 1; // 1-indexed overall question number across all subjects
    if (answerKeyMap[qNum]) {
      questions[i].correctAnswer = answerKeyMap[qNum];
    } else {
      questions[i].correctAnswer = ""; // Explicitly empty instead of hardcoded 'A'/'0'
    }
  }

  await imageExtractor.close();
  return questions;
}

function mapSuperscript(str: string) {
  const map: Record<string, string> = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻' };
  return str.split('').map(c => map[c] || c).join('');
}

function mapSubscript(str: string) {
  const map: Record<string, string> = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋' };
  return str.split('').map(c => map[c] || c).join('');
}
