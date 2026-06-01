export type Project = {
  id: string;
  name: string;
  domain: string;
  brand: string;
  country: string;
  language: string;
  is_archived: boolean;
  created_at: string;
};

export type ProjectPrompt = {
  id: string;
  project_id: string;
  prompt_text: string;
  category: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type ProjectCompetitor = {
  id: string;
  project_id: string;
  name: string;
  domain: string;
  is_active: boolean;
  created_at: string;
};
