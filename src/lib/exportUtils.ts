import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, AlignmentType, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

export interface Transaction {
  id: string;
  date: string;
  particulars: string;
  debit: number;
  credit: number;
}

export const formatRupee = (amount: number) => {
  return 'INR ' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const exportToPDF = (transactions: Transaction[], totals: { debit: number; credit: number; balance: number }, sheetName: string = 'Ledger') => {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.text(`Balance Sheet - ${sheetName}`, 14, 22);
  
  doc.setFontSize(12);
  doc.text(`Generated on: ${format(new Date(), 'PPP')}`, 14, 30);

  const tableData = transactions.map(t => [
    t.date,
    t.particulars,
    t.debit.toFixed(2),
    t.credit.toFixed(2)
  ]);

  // Add totals row
  tableData.push([
    '',
    'TOTAL',
    totals.debit.toFixed(2),
    totals.credit.toFixed(2)
  ]);

  autoTable(doc, {
    startY: 40,
    head: [['Date', 'Particulars', 'Debit (INR)', 'Credit (INR)']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: '#6750A4' },
    footStyles: { fillColor: '#f3f4f6', textColor: '#000', fontStyle: 'bold' },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 40;
  doc.setFontSize(14);
  doc.text(`Net Balance: ${formatRupee(totals.balance)}`, 14, finalY + 15);

  doc.save(`${sheetName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

export const exportToExcel = (transactions: Transaction[], totals: { debit: number; credit: number; balance: number }, sheetName: string = 'Ledger') => {
  const data = transactions.map(t => ({
    Date: t.date,
    Particulars: t.particulars,
    'Debit (INR)': t.debit,
    'Credit (INR)': t.credit
  }));

  // Add totals
  data.push({
    Date: 'TOTAL',
    Particulars: '',
    'Debit (INR)': totals.debit,
    'Credit (INR)': totals.credit
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${sheetName}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};

export const exportToWord = async (transactions: Transaction[], totals: { debit: number; credit: number; balance: number }, sheetName: string = 'Ledger') => {
  const tableRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph('Date')], width: { size: 25, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph('Particulars')], width: { size: 45, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph('Debit (INR)')], width: { size: 15, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph('Credit (INR)')], width: { size: 15, type: WidthType.PERCENTAGE } }),
      ],
    }),
    ...transactions.map(t => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(t.date)] }),
        new TableCell({ children: [new Paragraph(t.particulars)] }),
        new TableCell({ children: [new Paragraph(t.debit.toFixed(2))] }),
        new TableCell({ children: [new Paragraph(t.credit.toFixed(2))] }),
      ],
    })),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph('')] }),
        new TableCell({ children: [new Paragraph('TOTAL')] }),
        new TableCell({ children: [new Paragraph(totals.debit.toFixed(2))] }),
        new TableCell({ children: [new Paragraph(totals.credit.toFixed(2))] }),
      ],
    }),
  ];

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: `Balance Sheet - ${sheetName}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: `Generated on: ${format(new Date(), 'PPP')}` }),
        new Paragraph({ text: '' }),
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: `Net Balance: ${formatRupee(totals.balance)}`, heading: HeadingLevel.HEADING_2 }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${sheetName}_${format(new Date(), 'yyyy-MM-dd')}.docx`);
};
