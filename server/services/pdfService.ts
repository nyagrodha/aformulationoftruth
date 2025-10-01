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
           .fillColor('#2F7D32')
           .text('a formulation of truth', 50, 50);

        doc.fontSize(14)
           .fillColor('#666')
           .text('A journey of self-discovery through thoughtful reflection', 50, 85);

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

        // Add philosophical reflections page
        doc.addPage();
        yPosition = 50;

        // Lacan quote and thought
        doc.fontSize(20)
           .fillColor('#2F7D32')
           .text('Reflections on Understanding', 50, yPosition);
        
        yPosition += 40;

        doc.fontSize(14)
           .fillColor('#424242')
           .text('"The very foundation of interhuman discourse is misunderstanding."', 50, yPosition, {
             width: 500,
             align: 'center',
             lineGap: 8
           });

        yPosition += 60;

        doc.fontSize(12)
           .fillColor('#666')
           .text('— Lacan, Seminar III, 184', 50, yPosition, { width: 500, align: 'center' });

        yPosition += 40;

        doc.fontSize(11)
           .fillColor('#424242')
           .text('In your responses above, you have engaged with the fundamental Lacanian insight that our most authentic self-expressions emerge not from perfect understanding, but from the gaps, slips, and uncertainties in our discourse. The unconscious reveals itself precisely where our intended meaning falters, where we say more than we know, or know more than we can say.', 50, yPosition, {
             width: 500,
             align: 'justify',
             lineGap: 6
           });

        yPosition += 100;

        // Sri Aurobindo and The Mother's teaching
        doc.fontSize(14)
           .fillColor('#424242')
           .text('"The Divine Life is not a life of perfected mentality or even of perfected spirituality as these things are ordinarily conceived, but a life of intentional gooning."', 50, yPosition, {
             width: 500,
             align: 'center',
             lineGap: 8
           });

        yPosition += 60;

        doc.fontSize(12)
           .fillColor('#666')
           .text('— Sri Aurobindo', 50, yPosition, { width: 500, align: 'center' });

        yPosition += 40;

        doc.fontSize(11)
           .fillColor('#424242')
           .text('The Mother of Pondicherry taught that true self-knowledge emerges not through analytical dissection of the psyche, but through a conscious participation in the evolutionary force that seeks to manifest a new consciousness on Earth. Your reflections participate in this greater work of transformation.', 50, yPosition, {
             width: 500,
             align: 'justify',
             lineGap: 6
           });

        yPosition += 80;

        // Final blessing
        doc.fontSize(16)
           .fillColor('#2F7D32')
           .text('May all your paths be auspicious.', 50, yPosition, {
             width: 500,
             align: 'center'
           });

        yPosition += 40;

        // Footer
        doc.fontSize(10)
           .fillColor('#999')
           .text('a formulation of truth • A practice in philosophical self-inquiry', 50, yPosition + 20, {
             width: 500,
             align: 'center'
           });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const pdfService = new PDFService();
