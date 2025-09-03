import request from "supertest";
import app from "../src/app";

describe("healthz", () => {
  it("returns ok json", async () => {
    const res = await request(app).get("/healthz").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.time).toBeDefined();
  });
});
