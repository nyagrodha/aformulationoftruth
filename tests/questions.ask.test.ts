import request from "supertest";
import { app } from "../src/app";

describe("POST /questions/ask", () => {
  it("rejects bad input", async () => {
    const res = await request(app).post("/questions/ask").send({}).expect(400);
    expect(res.body.error.message).toMatch(/Required/);
  });

  it("returns JSON by default", async () => {
    const res = await request(app)
      .post("/questions/ask")
      .send({ prompt: "hello world" })
      .expect(200);
    expect(res.body.answer).toMatch(/hello world/);
  });

  it("returns HTML when requested", async () => {
    const res = await request(app)
      .post("/questions/ask")
      .send({ prompt: "hello world", format: "html" })
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toMatch(/<article>/);
  });
});
