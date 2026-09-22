import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

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
    const { transcript, meetingTitle, teamMembers, projects } = body;

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: 'Transcript or notes text is required' }, { status: 400 });
    }

    const ai = getAIClient();

    if (!ai) {
      // Mock structured summary response when GEMINI_API_KEY is not configured
      return NextResponse.json({
        summary: `Executive review of "${meetingTitle || 'Operational Sync'}". The team reviewed current sprint velocity, milestones delivery targets, and resource allocations for the upcoming release cycle.`,
        keyDecisions: [
          'Agreed to freeze core API schemas for Next.js App Router migration by Friday.',
          'Approved budget for expanding server capacity and database read replicas.',
          'Scheduled weekly cross-department sync every Tuesday at 10:00 AM IST.',
        ],
        actionableTasks: [
          {
            title: 'Complete Next.js App Router route migration and validation',
            assigneeName: teamMembers?.[0]?.name || 'Siddharth Rao',
            priority: 'High',
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: 'Ensure all module components and API endpoints pass build and lint checks.',
          },
          {
            title: 'Prepare Q3 Financial and Tax Compliance review sheet',
            assigneeName: teamMembers?.[1]?.name || 'Vikram Malhotra',
            priority: 'Medium',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: 'Compile GST/TDS tax deductions and outstanding vendor invoices.',
          },
        ],
        followUpItems: [
          'Review staging performance metrics in the next architectural sync.',
          'Verify user permissions matrix for newly introduced module roles.',
        ],
      });
    }

    const prompt = `You are an expert AI executive secretary and meeting analyst. Analyze the provided meeting transcript or notes and generate a structured summary.

Context:
- Meeting Title/Topic: ${meetingTitle || 'Team Operational Review'}
- Available Team Members: ${teamMembers && teamMembers.length > 0 ? teamMembers.map((m: any) => m.name).join(', ') : 'Team'}
- Available Projects: ${projects && projects.length > 0 ? projects.map((p: any) => p.name).join(', ') : 'General Engineering'}

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
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: 'Executive summary paragraph' },
            keyDecisions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key decisions made during meeting',
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
                required: ['title', 'assigneeName', 'priority', 'description'],
              },
              description: 'Extracted actionable tasks with details',
            },
            followUpItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Follow-up notes and items',
            },
          },
          required: ['summary', 'keyDecisions', 'actionableTasks', 'followUpItems'],
        },
      },
    });

    const jsonText = response.text || '{}';
    const result = JSON.parse(jsonText);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('AI Meeting Summarizer API Error:', err);
    return NextResponse.json(
      {
        error: 'AI Processing Error',
        message: err.message || 'Failed to parse and summarize meeting notes',
      },
      { status: 500 }
    );
  }
}
