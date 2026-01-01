/**
 * Analysis Prompt Template for Co-Pilot
 *
 * Uses ultrathink approach similar to vibe-log-cli sub-agents:
 * 1. Clear task definition
 * 2. Structured thinking process
 * 3. Detailed scoring criteria
 * 4. JSON output format
 */

export interface AnalysisInput {
  userPrompt: string;
  assistantResponse?: string;
  sessionContext?: {
    workspaceName?: string;
    fileContext?: string[];
    conversationHistory?: number;
  };
}

export interface AnalysisResult {
  overallScore: number;        // 1-10
  categoryScores: {
    clarity: number;            // 1-10
    specificity: number;        // 1-10
    context: number;            // 1-10
    actionability: number;      // 1-10
  };
  strengths: string[];          // 2-4 strengths
  improvements: string[];       // 2-4 suggested improvements
  rewrittenPrompt: string;      // Better version of the prompt
  explanation: string;          // Why the rewrite is better
}

/**
 * Generate the analysis prompt for the AI model
 */
export function generateAnalysisPrompt(input: AnalysisInput): string {
  const { userPrompt, assistantResponse, sessionContext } = input;

  // Build context section
  let contextSection = `<context>
User Prompt:
${userPrompt}`;

  if (assistantResponse) {
    contextSection += `\n\nAssistant Response Preview:
${assistantResponse.slice(0, 500)}${assistantResponse.length > 500 ? '...' : ''}`;
  }

  if (sessionContext) {
    if (sessionContext.workspaceName) {
      contextSection += `\n\nWorkspace: ${sessionContext.workspaceName}`;
    }
    if (sessionContext.fileContext && sessionContext.fileContext.length > 0) {
      contextSection += `\n\nFiles in Context: ${sessionContext.fileContext.join(', ')}`;
    }
    if (sessionContext.conversationHistory) {
      contextSection += `\n\nConversation Turns: ${sessionContext.conversationHistory}`;
    }
  }

  contextSection += '\n</context>';

  return `<task>
You are an expert prompt engineering coach. Analyze this Cursor AI prompt for quality and provide actionable improvement suggestions that will help the user get better results from AI coding assistants.

Your goal is to help developers write clearer, more effective prompts that lead to better AI-generated code and solutions.
</task>

${contextSection}

<thinking_process>
Before scoring, carefully think through these questions:

1. **Intent Analysis**: What is the user trying to accomplish? Is the goal clear?
2. **Clarity Check**: Are there any ambiguous terms or requests that could be interpreted multiple ways?
3. **Context Evaluation**: What information is the AI missing that would help it provide a better response?
4. **Actionability Test**: Can the AI immediately start working, or does it need to ask clarifying questions?
5. **Specificity Review**: Are the requirements concrete enough, or too vague?

Take a moment to analyze these aspects before scoring.
</thinking_process>

<scoring_criteria>
Rate each category from 1-10 based on these detailed criteria:

**1. CLARITY (1-10)**: Is the ask clear and unambiguous?
- 1-3: Vague or confusing. Multiple valid interpretations. User intent unclear.
  Example: "Make it better" or "Fix the code"
- 4-6: Somewhat clear but missing key details. Some ambiguity remains.
  Example: "Add authentication" (what kind? where?)
- 7-9: Clear with minor ambiguities. Intent is obvious.
  Example: "Add user login with email/password"
- 10: Crystal clear. No room for misinterpretation. Perfectly articulated.
  Example: "Implement JWT-based authentication with email/password login, including token refresh"

**2. SPECIFICITY (1-10)**: Are requirements specific enough?
- 1-3: Very general. No concrete details. Just high-level concepts.
  Example: "Build a web app"
- 4-6: Some details but missing important specifics. AI will need to guess implementation details.
  Example: "Create a user dashboard with charts"
- 7-9: Most important details present. Minor specifics could be added.
  Example: "Create a user dashboard with bar charts showing weekly activity and line charts for trends"
- 10: Highly specific with exact requirements, edge cases, and constraints.
  Example: "Create a responsive user dashboard with: 1) Bar chart (Chart.js) showing daily commits for past 7 days, 2) Line chart showing code additions/deletions over 30 days, 3) Filter by repository dropdown"

**3. CONTEXT (1-10)**: Is sufficient context provided?
- 1-3: No context. AI must guess project structure, tech stack, and constraints.
  Example: "Add a button" (where? what does it do? what style?)
- 4-6: Minimal context. Some relevant information but missing key background.
  Example: "Add a submit button to the form" (styling? validation? what happens on submit?)
- 7-9: Good context. Most relevant information present. AI understands the situation.
  Example: "Add a submit button to the registration form that validates email/password before calling /api/register"
- 10: Complete context with all relevant information. AI has everything needed.
  Example: "Add a submit button to the registration form (src/components/RegisterForm.tsx) that: 1) Validates email format and password strength (8+ chars), 2) Disables during submission, 3) Calls POST /api/register with error handling, 4) Matches existing primary button styles from design system"

**4. ACTIONABILITY (1-10)**: Can the AI take immediate action?
- 1-3: Unclear what to do next. Too abstract or philosophical.
  Example: "What's the best architecture?" or "Should I use React?"
- 4-6: General direction but needs significant clarification before starting.
  Example: "Refactor this code" (how? what patterns? what goals?)
- 7-9: Mostly actionable. AI can start with minor assumptions.
  Example: "Refactor this component to use React hooks instead of class components"
- 10: Perfectly actionable. AI can immediately start coding with full confidence.
  Example: "Refactor UserProfile.jsx from class component to functional component using useState for user data and useEffect for API call on mount. Keep existing prop structure."

</scoring_criteria>

<output_requirements>
You MUST return ONLY valid JSON matching this exact structure. No explanations, no markdown, ONLY JSON:

{
  "overallScore": <number 1-10>,
  "categoryScores": {
    "clarity": <number 1-10>,
    "specificity": <number 1-10>,
    "context": <number 1-10>,
    "actionability": <number 1-10>
  },
  "strengths": [
    "<specific strength observed in the prompt>",
    "<another strength>",
    "<maximum 4 strengths>"
  ],
  "improvements": [
    "<specific, actionable suggestion>",
    "<another actionable suggestion>",
    "<maximum 4 improvements>"
  ],
  "rewrittenPrompt": "<improved version of the user's prompt that incorporates your suggestions>",
  "explanation": "<brief explanation of why the rewritten prompt is better - what specific improvements were made and how they help>"
}
</output_requirements>

<quality_guidelines>
**For strengths**: Be specific about what the user did well. Not just "good clarity" but "clearly stated the desired outcome".

**For improvements**: Provide actionable suggestions. Instead of "add more context", say "specify which authentication method (OAuth, JWT, or session-based)".

**For rewrittenPrompt**:
- Keep the user's intent and voice
- Add missing context and specifics
- Make it immediately actionable
- Don't change the core request, just enhance it
- If the prompt is already excellent (9+), make minor refinements

**For explanation**:
- Be concise (2-4 sentences)
- Focus on the most impactful changes
- Explain the benefits, not just what changed
</quality_guidelines>

<examples>
Example 1 - Poor Prompt:
Input: "Fix the bugs"
Output:
{
  "overallScore": 2,
  "categoryScores": {
    "clarity": 2,
    "specificity": 1,
    "context": 1,
    "actionability": 3
  },
  "strengths": [
    "Direct request for action"
  ],
  "improvements": [
    "Specify which bugs (error messages, unexpected behavior, or specific features)",
    "Provide context: which files or components are affected",
    "Describe the current buggy behavior and expected behavior",
    "Include any error messages or console logs"
  ],
  "rewrittenPrompt": "Fix the authentication bug in src/auth/LoginForm.tsx where clicking 'Login' shows 'undefined' error in console. Expected: successful API call to /api/login with email/password validation.",
  "explanation": "The rewritten prompt specifies the exact bug location, describes both current and expected behavior, and provides enough context for immediate action. This eliminates ambiguity and enables the AI to start debugging right away."
}

Example 2 - Good Prompt:
Input: "Add OAuth authentication to the login page"
Output:
{
  "overallScore": 7,
  "categoryScores": {
    "clarity": 8,
    "specificity": 6,
    "context": 7,
    "actionability": 7
  },
  "strengths": [
    "Clear objective: implementing OAuth authentication",
    "Specific target: login page",
    "Actionable request with defined scope"
  ],
  "improvements": [
    "Specify OAuth provider (Google, GitHub, Microsoft)",
    "Clarify if this should replace or supplement existing auth",
    "Mention which OAuth library or service to use",
    "Specify where to store OAuth tokens"
  ],
  "rewrittenPrompt": "Add Google OAuth 2.0 authentication to the login page (src/components/LoginPage.tsx) as an additional option alongside existing email/password login. Use NextAuth.js library. Store tokens in httpOnly cookies for security. Add 'Sign in with Google' button below the existing form.",
  "explanation": "The enhanced prompt specifies the OAuth provider, clarifies the integration approach (additional vs replacement), names the library to use, and addresses security considerations. These details eliminate guesswork and ensure consistent implementation."
}

Example 3 - Excellent Prompt:
Input: "Refactor the UserDashboard component (src/components/UserDashboard.tsx) to use React Query for data fetching instead of useEffect. Maintain the existing loading and error states. The component currently fetches from /api/user/stats and /api/user/activities endpoints."
Output:
{
  "overallScore": 9,
  "categoryScores": {
    "clarity": 10,
    "specificity": 9,
    "context": 9,
    "actionability": 9
  },
  "strengths": [
    "Provides exact file path for immediate context",
    "Specifies the refactoring goal: React Query for data fetching",
    "Mentions constraints: maintain existing loading/error states",
    "Lists the specific API endpoints involved"
  ],
  "improvements": [
    "Specify React Query configuration preferences (stale time, cache time)",
    "Clarify error handling strategy (show error message, fallback UI, or retry)"
  ],
  "rewrittenPrompt": "Refactor the UserDashboard component (src/components/UserDashboard.tsx) to use React Query for data fetching instead of useEffect. Fetch from /api/user/stats and /api/user/activities using separate queries. Maintain existing loading spinner and error message UI. Configure React Query with 5-minute stale time and enable automatic retry on failure (max 3 attempts). Use the useQuery hook and keep the current component structure.",
  "explanation": "This prompt adds React Query configuration details (stale time, retry logic) and clarifies the implementation approach (separate queries, useQuery hook). These additions ensure the refactoring follows best practices while maintaining code quality."
}
</examples>

Now analyze the provided prompt and return ONLY the JSON output. Start your response with { and end with }.`;
}

/**
 * Validate that the AI response is valid JSON matching our schema
 */
export function validateAnalysisResult(response: string): AnalysisResult {
  try {
    // Try to extract JSON if wrapped in markdown code blocks
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const result = JSON.parse(jsonStr) as AnalysisResult;

    // Validate required fields
    if (typeof result.overallScore !== 'number' || result.overallScore < 1 || result.overallScore > 10) {
      throw new Error('Invalid overallScore');
    }

    if (!result.categoryScores ||
        typeof result.categoryScores.clarity !== 'number' ||
        typeof result.categoryScores.specificity !== 'number' ||
        typeof result.categoryScores.context !== 'number' ||
        typeof result.categoryScores.actionability !== 'number') {
      throw new Error('Invalid categoryScores');
    }

    if (!Array.isArray(result.strengths) || result.strengths.length === 0) {
      throw new Error('Invalid strengths array');
    }

    if (!Array.isArray(result.improvements) || result.improvements.length === 0) {
      throw new Error('Invalid improvements array');
    }

    if (typeof result.rewrittenPrompt !== 'string' || result.rewrittenPrompt.length === 0) {
      throw new Error('Invalid rewrittenPrompt');
    }

    if (typeof result.explanation !== 'string' || result.explanation.length === 0) {
      throw new Error('Invalid explanation');
    }

    return result;
  } catch (error) {
    throw new Error(`Failed to parse analysis result: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a user-friendly error message for failed analysis
 */
export function generateErrorResult(error: Error): AnalysisResult {
  return {
    overallScore: 0,
    categoryScores: {
      clarity: 0,
      specificity: 0,
      context: 0,
      actionability: 0
    },
    strengths: ['Analysis could not be completed'],
    improvements: [`Error: ${error.message}`],
    rewrittenPrompt: 'Analysis failed - please try again',
    explanation: `The analysis failed due to: ${error.message}. This might be a temporary issue with the AI model or a parsing error.`
  };
}
