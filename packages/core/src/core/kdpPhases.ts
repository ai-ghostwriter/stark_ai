export interface Phase {
  id: string;
  name: string;
  skill: string;
  output: string;
  requires: string[];
}

export const KDP_PHASES: Phase[] = [
  { id: "01", name: "research", skill: "kdp-research-analyzer", output: "PRODUCTION/dati/cerebro_analysis.json", requires: [] },
  { id: "02", name: "persona", skill: "(umano)", output: "PRODUCTION/bootstrap/buyer_persona.json", requires: [] },
  { id: "03a", name: "title", skill: "kdp-title-generator", output: "PRODUCTION/dati/kdp_title_result.json", requires: ["01", "02"] },
  { id: "03b", name: "hooks", skill: "kdp-hooks-usp", output: "PRODUCTION/dati/hooks-usp.json", requires: ["03a"] },
  { id: "03c", name: "brief", skill: "kdp-book-brief", output: "PRODUCTION/dati/brief.json", requires: ["03b", "02"] },
  { id: "04", name: "outline", skill: "kdp-book-outline", output: "PRODUCTION/dati/outline.json", requires: ["03c"] },
  { id: "04.5", name: "image-manifest", skill: "kdp-editorial-image-manifest", output: "PRODUCTION/dati/editorial_image_manifest.json", requires: ["04"] },
  { id: "05", name: "assembly", skill: "kdp-book-assembler", output: "RENDERER/src/data/bookPayload.json", requires: ["04"] },
  { id: "06", name: "description", skill: "kdp-amazon-description-html", output: "PRODUCTION/dati/amazon_description.html", requires: ["03c", "04"] },
  { id: "07a", name: "brand", skill: "kdp-visual-brand-theme", output: "PRODUCTION/dati/visual_brand_theme.json", requires: ["03c"] },
  { id: "07b", name: "cover", skill: "kdp-cover-image-prompt", output: "PRODUCTION/dati/cover_image_prompt.json", requires: ["07a", "03c"] },
  { id: "07c", name: "aplus", skill: "kdp-a-plus-content-image-prompts", output: "PRODUCTION/dati/a_plus_content_image_prompts.json", requires: ["03c"] },
  { id: "08", name: "compliance", skill: "kdp-compliance-agent", output: "PRODUCTION/dati/kdp_compliance_report.json", requires: ["05", "06"] },
];

export const PROJECT_DIRS: string[] = [
  "PRODUCTION/bootstrap",
  "PRODUCTION/dati",
  "RENDERER/cowork/chapters",
  "RENDERER/src/data",
];
