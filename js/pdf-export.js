import { formatDuration } from './utils.js';

export function exportPdf({ canvasEl, patientInfo, sessionState, timerSeconds }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Pure Tone Audiometry Report', 40, 40);

  doc.setFontSize(10);
  const lines = [
    `Patient: ${patientInfo.name || '-'}    ID: ${patientInfo.id || '-'}    DOB: ${patientInfo.dob || '-'}`,
    `Transducer: ${sessionState.transducer}    Masking: ${sessionState.maskingOn ? 'On' : 'Off'} (${sessionState.maskingLevel} dB)`,
    `Test duration: ${formatDuration(timerSeconds)}`,
    `Generated: ${new Date().toLocaleString()}`,
  ];
  lines.forEach((line, i) => doc.text(line, 40, 62 + i * 14));

  const imgData = canvasEl.toDataURL('image/png');
  const imgWidth = 480;
  const imgHeight = (canvasEl.clientHeight / canvasEl.clientWidth) * imgWidth;
  doc.addImage(imgData, 'PNG', 40, 130, imgWidth, imgHeight);

  const legendX = 540;
  let legendY = 150;
  doc.setFontSize(10);
  doc.setTextColor(210, 31, 31);
  doc.text('O  AC Right unmasked', legendX, legendY); legendY += 16;
  doc.text('<  BC Right unmasked', legendX, legendY); legendY += 16;
  doc.setTextColor(31, 95, 210);
  doc.text('X  AC Left unmasked', legendX, legendY); legendY += 16;
  doc.text('>  BC Left unmasked', legendX, legendY); legendY += 16;
  doc.setTextColor(0, 0, 0);
  doc.text('Triangle / bracket = masked', legendX, legendY);

  const name = patientInfo.name?.trim() || 'audiogram';
  doc.save(`${name.replace(/\s+/g, '_')}.pdf`);
}
