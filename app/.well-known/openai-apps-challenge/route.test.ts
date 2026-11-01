import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("OpenAI domain challenge (MCP-CHATGPT-SUBMIT-1, log §430)", () => {
  afterEach(() => {
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  });
  it("answers the exact token as plain text and nothing else", async () => {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = "  abc123-token  ";
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("abc123-token");
  });
  it("is a 404 until the token is set", async () => {
    expect(GET().status).toBe(404);
  });
});
