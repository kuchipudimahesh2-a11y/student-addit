import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker if available
try {
  if (typeof window !== 'undefined' && pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
  }
} catch {
  // worker fallback handled inline
}

export interface ExtractedDocument {
  fileName: string;
  fileSize: number;
  fileType: string;
  text: string;
  pageOrSlideCount?: number;
  wordCount: number;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function extractDocumentText(file: File): Promise<ExtractedDocument> {
  const name = file.name.toLowerCase();
  const size = file.size;
  let text = '';
  let pageOrSlideCount = 0;

  try {
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      });
      const pdf = await loadingTask.promise;
      pageOrSlideCount = pdf.numPages;
      const pagesText: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageStr = textContent.items
          .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
          .join(' ');
        if (pageStr.trim()) {
          pagesText.push(`--- Page ${i} of ${pdf.numPages} ---\n${pageStr.trim()}`);
        }
      }
      text = pagesText.join('\n\n');
    } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const docXmlFile = zip.file('word/document.xml');
      if (docXmlFile) {
        const xmlStr = await docXmlFile.async('text');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
        const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
        const lines: string[] = [];
        for (const p of paragraphs) {
          const textNodes = Array.from(p.getElementsByTagName('w:t'));
          const pText = textNodes.map((t) => t.textContent || '').join('');
          if (pText.trim()) {
            lines.push(pText.trim());
          }
        }
        text = lines.join('\n\n');
        pageOrSlideCount = Math.max(1, Math.ceil(lines.length / 25));
      } else {
        text = await file.text();
      }
    } else if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const slideEntries: { index: number; file: any }[] = [];

      zip.forEach((path, entry) => {
        const match = path.match(/ppt\/slides\/slide(\d+)\.xml$/i);
        if (match) {
          slideEntries.push({ index: parseInt(match[1], 10), file: entry });
        }
      });

      slideEntries.sort((a, b) => a.index - b.index);
      pageOrSlideCount = slideEntries.length;
      const slidesText: string[] = [];
      const parser = new DOMParser();

      for (const entry of slideEntries) {
        const xmlStr = await entry.file.async('text');
        const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
        const textNodes = Array.from(xmlDoc.getElementsByTagName('a:t'));
        const slideText = textNodes.map((t) => t.textContent || '').join(' ').trim();
        if (slideText) {
          slidesText.push(`--- Slide ${entry.index} ---\n${slideText}`);
        }
      }
      text = slidesText.join('\n\n');
    } else {
      // Plain text, markdown, csv, json, code notes
      text = await file.text();
    }
  } catch (err: any) {
    console.warn('Document extraction fallback to raw text:', err);
    try {
      text = await file.text();
    } catch {
      text = `[Document: ${file.name} (${formatFileSize(file.size)}) could not be automatically converted to text. Please paste the relevant notes directly.]`;
    }
  }

  // Safety context truncation for optimal prompt injection
  const maxChars = 40000;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + '\n\n[... Note: Attached document content truncated to fit optimal AI tutor context ...]';
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return {
    fileName: file.name,
    fileSize: size,
    fileType: file.type || name.split('.').pop() || 'document',
    text: text.trim(),
    pageOrSlideCount,
    wordCount,
  };
}
