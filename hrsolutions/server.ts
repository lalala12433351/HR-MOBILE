import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Initialize Gemini AI Client lazily or safely
  const getAIClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // Health Check Endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", app: "Unified Business Operating System (Acme OS)" });
  });

  // Reverse Proxy to Backend API (/api/v1/*)
  app.all("/api/v1/*", async (req, res) => {
    const rawBackendUrl = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.pixbe.in";
    const backendUrl = rawBackendUrl.replace(/\/+$/, "");
    const targetUrl = `${backendUrl}${req.originalUrl}`;
    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (value && key !== "host" && key !== "content-length") {
          headers[key] = Array.isArray(value) ? value.join(",") : value;
        }
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      res.status(response.status);

      response.headers.forEach((val, key) => {
        if (key !== "content-encoding" && key !== "transfer-encoding") {
          res.setHeader(key, val);
        }
      });

      const bodyBuffer = Buffer.from(await response.arrayBuffer());
      return res.send(bodyBuffer);
    } catch (err: any) {
      console.warn(`[Proxy] Failed to route ${req.method} ${req.originalUrl} to backend:`, err.message || err);
      return res.status(502).json({
        success: false,
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: "Unable to reach backend API service on port 8080.",
        },
      });
    }
  });

  // AI Assistant Proxy Endpoint
  app.post("/api/ai/assistant", async (req, res) => {
    try {
      const { prompt, context } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const ai = getAIClient();

      const systemInstruction = `You are "Acme Intelligence", the built-in AI Executive Assistant and Business Automation engine for the Unified Business Operating System (Acme OS).
Your role is to analyze operational data across HR, CRM, Finance, Projects, Support, and Operations, answer executive queries, summarize performance, generate actionable recommendations, and draft business records (like tasks, announcements, or emails).

Context regarding the current business state:
${context ? JSON.stringify(context, null, 2) : "Standard organization state."}

Formatting rules:
- Be concise, professional, structured, and insightful.
- Use bolding, bullet points, and quantitative metrics where applicable.
- Directly address the user's operational question or command.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      return res.json({ response: response.text });
    } catch (err: any) {
      console.error("AI Assistant Error:", err);
      return res.status(500).json({
        error: "AI Processing Error",
        message: err.message || "Failed to process AI query",
      });
    }
  });

  // AI Meeting Summarizer Endpoint
  app.post("/api/ai/summarize-meeting", async (req, res) => {
    try {
      const { transcript, meetingTitle, teamMembers, projects } = req.body;
      if (!transcript || !transcript.trim()) {
        return res.status(400).json({ error: "Transcript or notes text is required" });
      }

      const ai = getAIClient();

      const prompt = `You are an expert AI executive secretary and meeting analyst. Analyze the provided meeting transcript or notes and generate a structured summary.

Context:
- Meeting Title/Topic: ${meetingTitle || "Team Operational Review"}
- Available Team Members: ${teamMembers && teamMembers.length > 0 ? teamMembers.map((m: any) => m.name).join(", ") : "Team"}
- Available Projects: ${projects && projects.length > 0 ? projects.map((p: any) => p.name).join(", ") : "General Engineering"}

Meeting Transcript / Raw Notes:
"""
${transcript}
"""

Instructions:
1. Executive Summary: Provide a concise, professional overview paragraph summarizing the primary context, discussions, and outcomes.
2. Key Decisions: Extract 2-5 explicit decisions agreed upon by the team during the meeting.
3. Actionable Tasks: Identify all actionable tasks assigned or mentioned. For each task, map it to an assignee name from the provided team members (if matched, otherwise pick the most appropriate team member name or leave generic), priority ('High' | 'Medium' | 'Low'), an estimated due date (in YYYY-MM-DD format, defaulting near next week), and a clear, descriptive task title and description.
4. Follow-Up Items: Extract 2-4 follow-up questions, dependencies, or topics scheduled for the next meeting.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: "Executive summary paragraph" },
              keyDecisions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Key decisions made during meeting",
              },
              actionableTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    assigneeName: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    dueDate: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["title", "assigneeName", "priority", "description"],
                },
                description: "Extracted actionable tasks with details",
              },
              followUpItems: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Follow-up notes and items",
              },
            },
            required: ["summary", "keyDecisions", "actionableTasks", "followUpItems"],
          },
        },
      });

      const jsonText = response.text || "{}";
      const result = JSON.parse(jsonText);
      return res.json(result);
    } catch (err: any) {
      console.error("AI Meeting Summarizer Error:", err);
      return res.status(500).json({
        error: "AI Processing Error",
        message: err.message || "Failed to parse and summarize meeting notes",
      });
    }
  });

  // Data Export Helper
  app.post("/api/export", (req, res) => {
    const { title, headers, rows } = req.body;
    if (!headers || !rows) {
      return res.status(400).json({ error: "Headers and rows required" });
    }

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any[]) => row.map((val) => `"${String(val ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${title || "report"}.csv"`);
    return res.send(csvContent);
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
