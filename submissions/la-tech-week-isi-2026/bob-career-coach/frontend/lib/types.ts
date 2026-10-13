// Mirror of backend/schemas.py. Change both together.
export type Line = { id: string; text: string };
export type Candidate = { id: string; lines: Line[] };
export type Job = {
  id: string;
  company: string;
  title: string;
  reqs: Line[];
  contact_persona_id: string;
  description?: string;
};
export type Persona = {
  id: string;
  role: "CEO" | "Recruiter" | "Engineer";
  name: string;
  company: string;
  priorities: string[];
  pet_peeves: string[];
  split: "train" | "test";
};
export type Message = { text: string; chars: number; job_id: string; persona_id: string; citations: string[] };
export type Outcome =
  | "no_response"
  | "connection_accepted"
  | "generic_reply"
  | "meaningful_conversation"
  | "interview_or_referral";
export type Evaluation = {
  persona_id: string;
  outcome: Outcome;
  outcome_reward: number;
  quality: { relevance: number; specificity: number; concise: number; clear_ask: number };
  quality_score: number;
  reply: string;
  critique: string;
};
export type Lint = { passed: boolean; offending: string[] };
export type Iteration = { n: number; prompt: string; message: Message; lint: Lint; evals: Evaluation[]; score: number };
export type Run = {
  id: string;
  candidate_id: string;
  job_id: string;
  train_persona_ids: string[];
  test_persona_ids: string[];
  iterations: Iteration[];
  best_n: number;
  baseline_test: Evaluation[];
  optimized_test: Evaluation[];
};
export type MatchRow = { j: string; status: "Covered" | "Mapped" | "Thin" | "Gap"; r: string[] };
export type JobMatch = { job_id: string; score: number; rows: MatchRow[] };
