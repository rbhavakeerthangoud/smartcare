import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  getActiveAIProvider,
  getAIProviderStatus,
  AIConfigurationError,
} from "@/lib/smartcare/ai-provider";
import {
  checkEmergencyQuery,
  EMERGENCY_RESPONSE,
  buildCareAssistantMessages,
  type PatientGroundingContext,
} from "@/lib/smartcare/care-assistant-service";

interface RequestPayload {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function GET() {
  const status = getAIProviderStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  let body: RequestPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 },
    );
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: "A message is required to consult the care assistant." },
      { status: 400 },
    );
  }
  if (message.length > 2000) {
    return NextResponse.json(
      { error: "Message exceeds maximum allowed length of 2,000 characters." },
      { status: 400 },
    );
  }

  // 1. Critical safety emergency triage
  if (checkEmergencyQuery(message)) {
    return NextResponse.json({
      response: EMERGENCY_RESPONSE,
      isEmergency: true,
      grounded: false,
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];

  // Enforce mandatory authentication token
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized: Missing authentication token." },
      { status: 401 },
    );
  }

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json(
      { error: "Server database configuration is missing." },
      { status: 500 },
    );
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or expired session." },
      { status: 401 },
    );
  }

  // 4. Server-Side Authorization: verify user has active PATIENT grant
  const { data: grants, error: accessError } = await userClient
    .from("smartcare_patient_access")
    .select("patient_id, access_role, active")
    .eq("user_id", user.id)
    .eq("access_role", "PATIENT")
    .eq("active", true);

  if (accessError) {
    return NextResponse.json(
      { error: `Database error checking access: ${accessError.message}` },
      { status: 500 },
    );
  }

  if (!grants || grants.length === 0) {
    return NextResponse.json(
      {
        error:
          "Access Denied: You do not have an active patient access authorization for any care plans. If your access was recently changed, please contact your clinician.",
      },
      { status: 403 },
    );
  }

  const patientIds = grants.map((g) => g.patient_id);

  // 5. Query ONLY the patient's authorized care plans (RLS + scope filter)
  const { data: carePlans, error: planError } = await userClient
    .from("care_plans")
    .select("id, patient_id, name, description, start_date, end_date, status")
    .in("patient_id", patientIds)
    .order("created_at", { ascending: false })
    .limit(5);

  if (planError) {
    return NextResponse.json(
      { error: `Could not load care plan: ${planError.message}` },
      { status: 500 },
    );
  }

  if (!carePlans || carePlans.length === 0) {
    return NextResponse.json({
      response:
        "You currently have no active clinician-approved care plans assigned to your account. Please contact your clinician or hospital care team to finalize your recovery plan.",
      grounded: true,
      tasksReferenced: 0,
    });
  }

  const primaryPlan = carePlans[0];
  const planIds = carePlans.map((cp) => cp.id);

  // 6. Query tasks for authorized plans
  const { data: tasks, error: taskError } = await userClient
    .from("tasks")
    .select(
      "id, care_plan_id, name, type, description, allowed_start_time, allowed_end_time, frequency, priority, completion_criteria, verification_method, status",
    )
    .in("care_plan_id", planIds)
    .limit(50);

  if (taskError) {
    return NextResponse.json(
      { error: `Could not load care tasks: ${taskError.message}` },
      { status: 500 },
    );
  }

  const loadedTasks = tasks || [];
  const taskIds = loadedTasks.map((t) => t.id);

  // 7. Query recent occurrences & progress
  let occurrencesData: Array<{
    id: string;
    task_id: string;
    occurrence_date: string;
    allowed_start_time?: string | null;
    allowed_end_time?: string | null;
    status: string;
    completed_at?: string | null;
    completion_source?: string | null;
  }> = [];

  if (taskIds.length > 0) {
    const { data: occRows } = await userClient
      .from("task_occurrences")
      .select(
        "id, task_id, occurrence_date, allowed_start_time, allowed_end_time, status, completed_at, completion_source",
      )
      .in("task_id", taskIds)
      .order("occurrence_date", { ascending: false })
      .limit(15);
    occurrencesData = occRows || [];
  }

  // 8. Query recent documents
  let documentRows: Array<{ file_name: string; uploaded_at: string }> = [];
  if (taskIds.length > 0) {
    const { data: docs } = await userClient
      .from("documents")
      .select("file_name, uploaded_at")
      .in("task_id", taskIds)
      .order("uploaded_at", { ascending: false })
      .limit(5);
    documentRows = docs || [];
  }

  // 9. Build structured, de-identified grounding context
  const taskMap = new Map(loadedTasks.map((t) => [t.id, t.name]));
  const groundingContext: PatientGroundingContext = {
    carePlanName: primaryPlan.name,
    carePlanDescription: primaryPlan.description,
    startDate: primaryPlan.start_date,
    endDate: primaryPlan.end_date,
    tasks: loadedTasks.map((t) => ({
      name: t.name,
      type: t.type,
      description: t.description,
      allowedStartTime: t.allowed_start_time,
      allowedEndTime: t.allowed_end_time,
      frequency: t.frequency,
      priority: t.priority,
      completionCriteria: t.completion_criteria,
      verificationMethod: t.verification_method,
    })),
    recentOccurrences: occurrencesData.map((occ) => ({
      taskName: taskMap.get(occ.task_id) || "Care activity",
      occurrenceDate: occ.occurrence_date,
      allowedStartTime: occ.allowed_start_time,
      allowedEndTime: occ.allowed_end_time,
      status: occ.status,
      completedAt: occ.completed_at,
      completionSource: occ.completion_source,
    })),
    recentDocuments: documentRows.map((doc) => ({
      fileName: doc.file_name,
      uploadedAt: doc.uploaded_at,
    })),
  };

  // 10. Check if AI Provider is configured on the server
  const providerStatus = getAIProviderStatus();
  if (!providerStatus.configured) {
    return NextResponse.json(
      {
        error:
          "AI Care Assistant is not yet configured with an active provider key. Please configure GEMINI_API_KEY or OPENAI_API_KEY in server environment variables.",
        code: "AI_PROVIDER_NOT_CONFIGURED",
        requiredEnv: providerStatus.requiredEnvVars,
      },
      { status: 503 },
    );
  }

  try {
    const aiProvider = getActiveAIProvider();
    const messages = buildCareAssistantMessages(
      message,
      groundingContext,
      body.history || [],
    );
    const aiResponse = await aiProvider.generateResponse(messages);

    return NextResponse.json({
      response: aiResponse,
      planName: primaryPlan.name,
      tasksReferenced: loadedTasks.length,
      grounded: true,
    });
  } catch (err) {
    if (err instanceof AIConfigurationError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          requiredEnv: err.requiredEnvVars,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred communicating with the AI service.",
      },
      { status: 500 },
    );
  }
}
