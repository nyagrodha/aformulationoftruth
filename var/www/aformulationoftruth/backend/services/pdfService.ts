
import PDFDocument from 'pdfkit';
import type { Response } from '../shared/schema';
import { questionService } from './questionService';

class PDFService {
  async generateFormulationOfTruthPDF(responses: Response[], questionOrder: number[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 72,
        size: 'A4'
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('A Formulation of Truth', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica').text('A Proust Questionnaire', { align: 'center' });
      doc.moveDown(2);

      // Responses
      responses.forEach((response, index) => {
        const question = questionService.getQuestion(response.questionId);
        if (!question) return;

        doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${question.text}`);
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica').text(response.answer, { indent: 20 });
        doc.moveDown(1.5);

        if (doc.y > 700) {
          doc.addPage();
        }
      });

      // Footer
      doc.fontSize(10).font('Helvetica-Oblique')
         .text('om shree ganapataye namah', { align: 'center' });

      doc.end();
    });
  }
}

export const pdfService = new PDFService();
