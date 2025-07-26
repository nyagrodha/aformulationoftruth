import PDFDocument from 'pdfkit';
import type { Response } from '@shared/schema';
import { questionService } from './questionService';

class PDFService {
  async generateFormulationOfTruthPDF(responses: Response[], questionOrder: number[]): Promise<Buffer> {
    return this.generateQuestionnairePDF(responses, questionOrder);
  }

  async generateQuestionnairePDF(responses: Response[], questionOrder?: number[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (buffer) => buffers.push(buffer));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Header
        doc.fontSize(28)
           .fillColor('#1976D2')
           .text('a formulation of truth', 50, 50);

        doc.fontSize(14)
           .fillColor('#666')
           .text('om shree ganapataye namah • A journey of self-discovery through thoughtful reflection', 50, 85);

        // Add date
        doc.fontSize(12)
           .fillColor('#999')
           .text(`Completed on ${new Date().toLocaleDateString()}`, 50, 110);

        let yPosition = 160;

        // Sort responses by display order
        const sortedResponses = responses.sort((a, b) => {
          const aOrder = questionService.getQuestionDisplayOrder(a.questionId);
          const bOrder = questionService.getQuestionDisplayOrder(b.questionId);
          return aOrder - bOrder;
        });

        sortedResponses.forEach((response, index) => {
          const question = questionService.getQuestion(response.questionId);
          
          if (!question) return;

          // Check if we need a new page
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }

          // Question number and text
          doc.fontSize(16)
             .fillColor('#1976D2')
             .text(`${index + 1}. ${question.text}`, 50, yPosition);

          yPosition += 30;

          // Answer
          doc.fontSize(12)
             .fillColor('#424242')
             .text(response.answer, 50, yPosition, {
               width: 500,
               align: 'justify',
               lineGap: 5
             });

          yPosition += doc.heightOfString(response.answer, { width: 500, lineGap: 5 }) + 40;
        });

        // Footer
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
        }

        doc.fontSize(10)
           .fillColor('#999')
           .text(
             'om shree ganapataye namah • a practice in self-inquiry revealing the formulation of truth within',
             50, 
             doc.page.height - 100,
             { width: 500, align: 'center' }
           );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const pdfService = new PDFService();
