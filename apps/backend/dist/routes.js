import { createServer } from "http";
import { storage } from "./storage.js";
import { insertResponseSchema } from "./shared/schema.js";
import { emailService } from "./services/emailService.js";
import { pdfService } from "./services/pdfService.js";
import { questionService } from "./services/questionService.js";
export async function registerRoutes(app) {
    // Simple auth middleware (replace with real auth)
    const isAuthenticated = (req, _res, next) => {
        next();
    };
    // Get or create questionnaire session
    app.get("/api/questionnaire/session", isAuthenticated, async (req, res) => {
        try {
            // ✅ derive userId from the authenticated request, not from session
            const userId = req.user?.id ?? null;
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            let session = await storage.getSessionByUserId(userId);
            if (!session) {
                const questionOrder = questionService.generateQuestionOrder();
                session = await storage.createSession({ userId, questionOrder });
            }
            return res.json(session);
        }
        catch (error) {
            console.error("Session error:", error);
            return res.status(500).json({ message: "Failed to get session" });
        }
    });
    // Submit answer
    app.post("/api/questionnaire/:sessionId/answer", isAuthenticated, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { questionId, answer } = insertResponseSchema
                .omit({ sessionId: true })
                .parse(req.body);
            const session = await storage.getSessionById(sessionId);
            if (!session) {
                return res.status(404).json({ message: "Session not found" });
            }
            // Validate answer
            const validationResult = questionService.validateAnswer(answer);
            if (!validationResult.isValid) {
                return res
                    .status(400)
                    .json({ message: "Invalid answer", details: validationResult.errors });
            }
            // Save or update response
            const existingResponse = await storage.getResponseBySessionAndQuestion(sessionId, questionId);
            const response = existingResponse
                ? await storage.updateResponse(sessionId, questionId, answer)
                : await storage.createResponse({ sessionId, questionId, answer });
            return res.json(response);
        }
        catch (error) {
            console.error("Submit answer error:", error);
            return res.status(500).json({ message: "Failed to submit answer" });
        }
    });
    // Complete questionnaire
    app.post("/api/questionnaire/:sessionId/complete", isAuthenticated, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { wantsReminder, wantsToShare } = req.body ?? {};
            // 1) load the session
            const session = await storage.getSessionById(sessionId);
            if (!session) {
                return res.status(404).json({ message: "Session not found" });
            }
            // 2) finish the session ONCE
            const shareId = await storage.completeSession(sessionId, Boolean(wantsReminder), Boolean(wantsToShare));
            // 3) resolve userId and email (do this once)
            const userId = session.userId ?? req.user?.id;
            if (!userId) {
                return res
                    .status(500)
                    .json({ message: "No userId associated with this session" });
            }
            const user = await storage.getUser(userId);
            const userEmail = user?.email ?? req.user?.email;
            if (!userEmail) {
                return res.status(500).json({
                    message: "Could not resolve user email for this session",
                });
            }
            // 4) gather & normalize responses for the PDF
            const respRows = await storage.getResponsesBySessionId(sessionId);
            // (optional) enforce all answered
            const expectedCount = Array.isArray(session.questionOrder)
                ? session.questionOrder.length
                : 35;
            if (respRows.length < expectedCount) {
                return res
                    .status(400)
                    .json({ message: "Not all questions have been answered" });
            }
            const responses = respRows.map((r) => ({
                id: Number(r.id),
                createdAt: r.createdAt ?? null,
                sessionId: r.sessionId ?? null,
                questionId: r.questionId ?? null,
                answer: typeof r.answer === "string"
                    ? r.answer
                    : r.answer ?? null,
                updatedAt: r.updatedAt ?? null,
            }));
            // 5) generate PDF
            const pdfBuffer = await pdfService.generateFormulationOfTruthPDF(responses, session.questionOrder);
            // 6) send email
            await emailService.sendCompletionEmail(userEmail, pdfBuffer);
            // 7) build response
            const result = {
                ok: true,
                message: "Questionnaire completed successfully",
            };
            if (shareId) {
                result.shareId = shareId;
                const proto = req.headers["x-forwarded-proto"] || req.protocol;
                const host = req.headers["x-forwarded-host"] ||
                    req.get("host") ||
                    req.hostname;
                result.shareLink = `${proto}://${host}/shared/${shareId}`;
            }
            return res.json(result);
        }
        catch (error) {
            console.error("Error completing questionnaire:", error);
            return res
                .status(500)
                .json({ message: "Failed to complete questionnaire" });
        }
    });
    const httpServer = createServer(app);
    return httpServer;
}
//# sourceMappingURL=routes.js.map