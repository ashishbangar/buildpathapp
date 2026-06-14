import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return _client;
}
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const v = (client() as any)[prop];
    return typeof v === "function" ? v.bind(client()) : v;
  },
});

export type PlanStep = { title: string; goal: string };
export type Plan = { title: string; summary: string; steps: PlanStep[] };

export type Project = {
  id: string;
  student_id: string;
  raw_idea: string | null;
  scoping: { question: string; answer: string }[];
  plan: Plan | null;
  current_step: number;
  code: string;
  sub_state: "new" | "scoping" | "plan_proposed" | "building" | "complete";
  status: "active" | "complete" | "abandoned";
  minutes_spent: number;
};

export type Student = {
  id: string;
  phone: string;
  name: string | null;
  build_token: string;
  parent_token: string;
  school_id: string | null;
  class_name: string | null;
};

export async function getOrCreateStudent(phone: string): Promise<Student> {
  const { data: existing } = await supabase
    .from("students").select("*").eq("phone", phone).maybeSingle();
  if (existing) return existing as Student;
  const { data, error } = await supabase
    .from("students").insert({ phone }).select("*").single();
  if (error) throw error;
  return data as Student;
}

export async function getActiveProject(studentId: string): Promise<Project | null> {
  const { data } = await supabase
    .from("projects").select("*")
    .eq("student_id", studentId).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Project) ?? null;
}

export async function createProject(studentId: string): Promise<Project> {
  const { data, error } = await supabase
    .from("projects").insert({ student_id: studentId, sub_state: "new" })
    .select("*").single();
  if (error) throw error;
  return data as Project;
}

export async function updateProject(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("projects")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function logMessage(a: {
  studentId: string; projectId: string | null; direction: "in" | "out";
  body?: string; mediaUrl?: string; mediaType?: string;
}) {
  await supabase.from("messages").insert({
    student_id: a.studentId, project_id: a.projectId, direction: a.direction,
    body: a.body ?? null, media_url: a.mediaUrl ?? null, media_type: a.mediaType ?? null,
  });
}
