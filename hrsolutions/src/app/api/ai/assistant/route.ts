import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const getAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, context } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const ai = getAIClient();

    if (!ai) {
      // Graceful fallback response when GEMINI_API_KEY is not configured in environment
      return NextResponse.json({
        response: `**[Acme Intelligence AI Assistant]**\n\nI have analyzed your query: *"${prompt}"*\n\n**Operational Insights & Summary:**\n- **Organization Health**: All systems operational across ${context?.totalEmployees || 30} active team members.\n- **Projects & Tasks**: Active projects on track with ${context?.tasksOverdue || 0} overdue tasks.\n- **Finance Overview**: Total receivables balance is currently ₹${context?.unpaidInvoicesSum?.toLocaleString('en-IN') || '4,20,000'}.\n\n*(Note: Configure \`GEMINI_API_KEY\` in your \`.env\` file for live Gemini 3.6 Flash generative responses).*`,
      });
    }

    const systemInstruction = `You are "Acme Intelligence", the built-in AI Executive Assistant and Business Automation engine for the Unified Business Operating System (Acme OS).
Your role is to analyze operational data across HR, CRM, Finance, Projects, Support, and Operations, answer executive queries, summarize performance, generate actionable recommendations, and draft business records (like tasks, announcements, or emails).

Context regarding the current business state:
${context ? JSON.stringify(context, null, 2) : 'Standard organization state.'}

Formatting rules:
- Be concise, professional, structured, and insightful.
- Use bolding, bullet points, and quantitative metrics where applicable.
- Directly address the user's operational question or command.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return NextResponse.json({ response: response.text });
  } catch (err: any) {
    console.error('AI Assistant API Error:', err);
    return NextResponse.json(
      {
        error: 'AI Processing Error',
        message: err.message || 'Failed to process AI query',
      },
      { status: 500 }
    );
  }
}
