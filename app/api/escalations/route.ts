import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { evaluateExecution } from "@/lib/smartcare/execution-engine";
import { getEscalationRule } from "@/lib/smartcare/escalation-engine";
import { isEscalationRequest } from "@/lib/smartcare/escalation-request";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json(
      { error: "Escalation service is not configured." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isEscalationRequest(body)) {
    return NextResponse.json({ error: "Invalid escalation request." }, { status: 400 });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: roleRecord, error: roleError } = await userClient
      .from("smartcare_user_roles")
      .select("role,status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleError) throw roleError;
    if (roleRecord?.role !== "CLINICIAN" && roleRecord?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (roleRecord.status && roleRecord.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Forbidden: Account privileges are not active." },
        { status: 403 },
      );
    }
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "Escalation service is not configured." },
        { status: 503 },
      );
    }

    const { data: carePlan, error: carePlanError } = await userClient
      .from("care_plans")
      .select("id")
      .eq("id", body.carePlanId)
      .maybeSingle();
    if (carePlanError) throw carePlanError;
    if (!carePlan) {
      return NextResponse.json({ error: "Care plan not found." }, { status: 404 });
    }

    const { data: task, error: taskError } = await userClient
      .from("tasks")
      .select("id,care_plan_id,name,verification_method")
      .eq("id", body.taskId)
      .eq("care_plan_id", body.carePlanId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const { data: occurrence, error: occurrenceError } = await userClient
      .from("task_occurrences")
      .select(
        "id,task_id,occurrence_date,time_zone,allowed_start_time,allowed_end_time,status,completed_at,completion_source",
      )
      .eq("id", body.occurrenceId)
      .eq("task_id", body.taskId)
      .maybeSingle();
    if (occurrenceError) throw occurrenceError;
    if (!occurrence) {
      return NextResponse.json({ error: "Task occurrence not found." }, { status: 404 });
    }

    const [eventResult, documentResult] = await Promise.all([
      userClient
        .from("events")
        .select("id,occurrence_id,event_time,source,value,confidence,notes")
        .eq("task_id", body.taskId)
        .eq("occurrence_id", body.occurrenceId),
      userClient
        .from("documents")
        .select("id,occurrence_id,uploaded_at,file_name")
        .eq("task_id", body.taskId)
        .eq("occurrence_id", body.occurrenceId),
    ]);
    if (eventResult.error) throw eventResult.error;
    if (documentResult.error) throw documentResult.error;

    const execution = evaluateExecution({
      task,
      occurrence,
      events: eventResult.data || [],
      documents: documentResult.data || [],
      now: new Date(),
    });
    if (execution.state !== body.triggerState) {
      return NextResponse.json(
        { error: "Execution state changed. Refresh the care plan and retry." },
        { status: 409 },
      );
    }

    const rule = getEscalationRule(execution.state);
    if (!rule) {
      return NextResponse.json(
        { error: "This execution state does not have an escalation rule." },
        { status: 400 },
      );
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: result, error: escalationError } = await serviceClient.rpc(
      "smartcare_create_escalation",
      {
        p_care_plan_id: body.carePlanId,
        p_task_id: body.taskId,
        p_occurrence_id: body.occurrenceId,
        p_trigger_state: execution.state,
      },
    );
    if (escalationError) throw escalationError;
    if (!result?.escalation_id) {
      throw new Error("Escalation was not returned by the database.");
    }

    return NextResponse.json({
      escalation_id: result.escalation_id,
      created: Boolean(result.created),
      trigger_state: execution.state,
      recipient_type: rule.recipientType,
    });
  } catch (error) {
    console.error("Unable to create authorized escalation.", error);
    return NextResponse.json(
      { error: "Escalation could not be created. Check access and try again." },
      { status: 500 },
    );
  }
}
