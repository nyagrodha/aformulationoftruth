import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { z } from "zod";

describe("commissions endpoint behavior", () => {
  let app: express.Express;
  const createCommission = jest.fn();

  const commissionsCors = cors({
    origin: ["https://fobdongle.com", "https://www.fobdongle.com"],
    methods: ["POST", "OPTIONS"],
    credentials: false,
    optionsSuccessStatus: 200,
  });
  const commissionsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: "Too many commission submissions. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  beforeEach(() => {
    app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.options("/api/commissions", commissionsCors);
    app.post("/api/commissions", commissionsCors, commissionsLimiter, async (req, res) => {
      try {
        const parsed = z.object({
          algorithm: z.string().min(1),
          ciphertext: z.string().min(1),
        }).parse(req.body);
        if (parsed.ciphertext.length > 100_000 || parsed.algorithm.length > 64) {
          return res.status(400).json({
            success: false,
            error: "Payload too large",
          });
        }

        const row = await createCommission(parsed);
        res.json({ success: true, message: "Commission received.", id: row.id });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: "algorithm and ciphertext are required",
          });
        }
        res.status(500).json({
          success: false,
          error: "Failed to process commission",
        });
      }
    });

    createCommission.mockReset();
    createCommission.mockResolvedValue({ id: "commission-id-1" });
  });

  it("stores a valid commission", async () => {
    const response = await request(app)
      .post("/api/commissions")
      .set("Origin", "https://fobdongle.com")
      .set("X-Forwarded-For", "1.1.1.1")
      .send({ algorithm: "rsa-oaep+aes-gcm", ciphertext: "abc123" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Commission received.",
      id: "commission-id-1",
    });
    expect(response.headers["access-control-allow-origin"]).toBe("https://fobdongle.com");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(createCommission).toHaveBeenCalledWith({
      algorithm: "rsa-oaep+aes-gcm",
      ciphertext: "abc123",
    });
  });

  it("rejects missing required fields", async () => {
    const response = await request(app)
      .post("/api/commissions")
      .set("X-Forwarded-For", "2.2.2.2")
      .send({ algorithm: "rsa-oaep+aes-gcm" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "algorithm and ciphertext are required",
    });
    expect(createCommission).not.toHaveBeenCalled();
  });

  it("rejects payloads that exceed the route size cap", async () => {
    const response = await request(app)
      .post("/api/commissions")
      .set("X-Forwarded-For", "3.3.3.3")
      .send({
        algorithm: "rsa-oaep+aes-gcm",
        ciphertext: "a".repeat(100_001),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "Payload too large",
    });
    expect(createCommission).not.toHaveBeenCalled();
  });

  it("rate-limits repeated submissions from the same IP", async () => {
    const body = { algorithm: "rsa-oaep+aes-gcm", ciphertext: "abc123" };
    const ip = "4.4.4.4";

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/commissions")
        .set("X-Forwarded-For", ip)
        .send(body)
        .expect(200);
    }

    const limited = await request(app)
      .post("/api/commissions")
      .set("X-Forwarded-For", ip)
      .send(body);

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: "Too many commission submissions. Please try again later.",
    });
  });
});
