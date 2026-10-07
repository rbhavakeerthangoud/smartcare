import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { evaluateExecution } from "@/lib/smartcare/execution-engine";
import { createEscalationCandidate } from "@/lib/smartcare/escalation-engine";
import type { EscalationCandidate } from "@/lib/smartcare/escalation-engine";
import type {
  EvidenceDocument,
  EvidenceEvent,
  ExecutionOccurrence,
  ExecutionTask,
} from "@/lib/smartcare/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_SIZE = 500;
const RPC_BATCH_SIZE = 10;

type TableName =
  | "task_occurrences"
  | "tasks"
  | "events"
  | "documents";

async function fetchAllRows(
  client: SupabaseClient,
  table: TableName,
  columns: string,
) {
  const rows: Record<string, unknown>[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data || []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function hasValidBearer(request: Request, secret: string) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied);
  const secretBytes = Buffer.from(secret);
  return (
    suppliedBytes.length === secretBytes.length &&
    timingSafeEqual(suppliedBytes, secretBytes)
  );
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.SMARTCARE_CRON_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    return NextResponse.json(
      { error: "Automatic escalation service is not configured." },
      { status: 503 },
    );
  }
  if (!hasValidBearer(request, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const [occurrenceRows, taskRows, eventRows, documentRows] =
      await Promise.all([
        fetchAllRows(
          supabase,
          "task_occurrences",
          "id,task_id,occurrence_date,time_zone,allowed_start_time,allowed_end_time,status,completed_at,completion_source",
        ),
        fetchAllRows(
          supabase,
          "tasks",
          "id,care_plan_id,name,verification_method",
        ),
        fetchAllRows(
          supabase,
          "events",
          "id,task_id,occurrence_id,event_time,source,value,confidence,notes",
        ),
        fetchAllRows(
          supabase,
          "documents",
          "id,task_id,occurrence_id,uploaded_at,file_name",
        ),
      ]);

    const occurrences = occurrenceRows as unknown as Array<
      ExecutionOccurrence & { task_id: string }
    >;
    const tasks = taskRows as unknown as Array<
      ExecutionTask & { care_plan_id: string; name: string }
    >;
    const events = eventRows as unknown as Array<
      EvidenceEvent & { task_id: string }
    >;
    const documents = documentRows as unknown as Array<
      EvidenceDocument & { task_id: string }
    >;
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const eventsByOccurrence = new Map<string, EvidenceEvent[]>();
    const documentsByOccurrence = new Map<string, EvidenceDocument[]>();

    for (const event of events) {
      if (!event.occurrence_id) continue;
      const list = eventsByOccurrence.get(event.occurrence_id) || [];
      list.push(event);
      eventsByOccurrence.set(event.occurrence_id, list);
    }
    for (const document of documents) {
      if (!document.occurrence_id) continue;
      const list = documentsByOccurrence.get(document.occurrence_id) || [];
      list.push(document);
      documentsByOccurrence.set(document.occurrence_id, list);
    }

    let createdEscalations = 0;
    let duplicateEscalations = 0;
    let skippedUnknownTimeZones = 0;
    let evaluatedOccurrences = 0;
    const evaluatedAt = new Date();
    const candidates: EscalationCandidate[] = [];

    for (const occurrence of occurrences) {
      const task = taskMap.get(occurrence.task_id);
      if (!task) continue;
      if (!occurrence.time_zone) {
        skippedUnknownTimeZones++;
        continue;
      }

      evaluatedOccurrences++;
      const result = evaluateExecution({
        task,
        occurrence,
        events: eventsByOccurrence.get(occurrence.id) || [],
        documents: documentsByOccurrence.get(occurrence.id) || [],
        now: evaluatedAt,
      });
      const candidate = createEscalationCandidate({
        occurrenceId: occurrence.id,
        taskId: task.id,
        carePlanId: task.care_plan_id,
        taskName: task.name,
        state: result.state,
      });
      if (!candidate) continue;
      candidates.push(candidate);
    }

    for (let offset = 0; offset < candidates.length; offset += RPC_BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + RPC_BATCH_SIZE);
      const outcomes = await Promise.all(
        batch.map(async (candidate) => {
          const { data, error } = await supabase.rpc(
            "smartcare_create_escalation",
            {
              p_care_plan_id: candidate.carePlanId,
              p_task_id: candidate.taskId,
              p_occurrence_id: candidate.occurrenceId,
              p_trigger_state: candidate.rule.triggerState,
            },
          );
          if (error) throw error;
          return Boolean(data?.created);
        }),
      );
      createdEscalations += outcomes.filter(Boolean).length;
      duplicateEscalations += outcomes.filter((created) => !created).length;
    }

    return NextResponse.json({
      evaluatedOccurrences,
      createdEscalations,
      duplicateEscalations,
      skippedUnknownTimeZones,
    });
  } catch (error) {
    console.error("Automatic escalation evaluation failed.", error);
    return NextResponse.json(
      { error: "Automatic escalation evaluation failed." },
      { status: 500 },
    );
  }
}
